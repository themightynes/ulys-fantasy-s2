/* ==========================================================================
   ULY'S FANTASY S2 — trading-card.js
   Renders the approved "Hottie Trading Card" comp on an offscreen canvas so
   the confirmation takeover and the Hottie Board can hand out a real PNG.

   window.UFTradingCard.generate(data, opts) → Promise<Blob> (image/png)

     data = {
       name, team, pos, why, ig,   // strings (all optional, safely defaulted)
       pickNum,                    // number|null — null ⇒ pending ("№?")
       photo,                      // data-URL or http(s) URL, or falsy
       drafted                     // reserved — see VARIANT SEAM below
     }
     opts = { size: 'feed' | 'story' }   // 1080×1350 (4:5) | 1080×1920 (9:16)

   Structure (outer → inner), faithful to the comp:
     chrome+rhinestone border → navy card →
       [pink top bar] [photo area + PROSPECT chip] [chrome name plate]
       [deep-navy scouting report]

   Export is guaranteed: if the photo taints the canvas (cross-origin board
   photos) the card is re-rendered without it and exported again.
   ========================================================================== */
(function () {
  'use strict';

  /* ---- Palette (SPEC tokens + comp-specific card colors) ---------------- */
  var PINK = '#FF3EA5';
  var NAVY = '#0A0E2E';
  var DEEP_NAVY = '#060924';
  var CYAN = '#43E8FF';
  var BUBBLEGUM = '#FFC7E4';
  var WHITE = '#FFFFFF';
  var PLATE_INK = '#0A0E2E';   // Anton name on the chrome plate
  var PLATE_META = '#7A2154';  // team / position row under the name
  var SLOT_BASE = '#141A4C';   // photo placeholder field
  var SLOT_GLOW = '#2A3168';   // photo placeholder radial ellipses
  var MUTED = '#8B8FB5';

  var W = 1080;
  var SIZES = { feed: 1350, story: 1920 };

  /* ---- Geometry (constants: both sizes are 1080 wide) ------------------- */
  var BORDER = 40;      // chrome + rhinestone frame
  var PAD = 48;         // inner card horizontal padding
  var TOPBAR_H = 116;
  var PLATE_H = 200;
  var SCOUT_H = 340;

  /* ======================================================================
     Text helpers
     ====================================================================== */

  /* Space Mono letterspaced caps — canvas has no letter-spacing, draw per
     char. Iterates CODE POINTS so emoji (surrogate pairs) stay intact. */
  function drawTracked(ctx, text, x, y, tracking, align) {
    var chars = Array.from(String(text));
    var widths = [];
    var total = 0;
    var i;
    for (i = 0; i < chars.length; i++) {
      var w = ctx.measureText(chars[i]).width;
      widths.push(w);
      total += w + (i < chars.length - 1 ? tracking : 0);
    }
    var cx = x;
    if (align === 'center') cx = x - total / 2;
    else if (align === 'right') cx = x - total;
    var prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    for (i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cx, y);
      cx += widths[i] + tracking;
    }
    ctx.textAlign = prevAlign;
    return total;
  }

  function trackedWidth(ctx, text, tracking) {
    var chars = Array.from(String(text));
    var total = 0;
    for (var i = 0; i < chars.length; i++) {
      total += ctx.measureText(chars[i]).width + (i < chars.length - 1 ? tracking : 0);
    }
    return total;
  }

  /* Shrink Anton until `text` fits `maxW`; returns the px size used. */
  function fitAnton(ctx, text, maxW, startPx, minPx) {
    var px = startPx;
    while (px > minPx) {
      ctx.font = px + 'px Anton, sans-serif';
      if (ctx.measureText(text).width <= maxW) break;
      px -= 2;
    }
    ctx.font = px + 'px Anton, sans-serif';
    return px;
  }

  /* Greedy word wrap to at most `maxLines`; the last line is ellipsized with
     the ellipsis measured in (so it never overflows). ctx.font must be set. */
  function wrapLines(ctx, text, maxW, maxLines) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    var i = 0;
    for (; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(next).width <= maxW || !line) {
        line = next;
      } else {
        lines.push(line);
        line = words[i];
        if (lines.length === maxLines) break;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);

    var overflowed = lines.length >= maxLines &&
      (i < words.length - 1 || ctx.measureText(lines[lines.length - 1]).width > maxW);

    if (lines.length > maxLines) lines.length = maxLines;

    // Hard-truncate the last line if it alone is wider than the box, or if
    // there was more text than fits.
    if (lines.length) {
      var last = lines[lines.length - 1];
      if (overflowed || ctx.measureText(last).width > maxW) {
        while (last.length && ctx.measureText(last + '…').width > maxW) {
          last = last.slice(0, -1);
        }
        lines[lines.length - 1] = last.replace(/[\s,;:.!-]+$/, '') + '…';
      }
    }
    return lines;
  }

  /* ======================================================================
     Frame: chrome gradient + rhinestone gems
     ====================================================================== */

  /* CSS-style angular linear gradient (deg measured clockwise from "to top"). */
  function angleGradient(ctx, deg, w, h, stops) {
    var rad = deg * Math.PI / 180;
    var dx = Math.sin(rad);
    var dy = -Math.cos(rad);
    var len = Math.abs(w * dx) + Math.abs(h * dy);
    var g = ctx.createLinearGradient(
      w / 2 - dx * len / 2, h / 2 - dy * len / 2,
      w / 2 + dx * len / 2, h / 2 + dy * len / 2
    );
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }

  function drawChromeFrame(ctx, H) {
    ctx.fillStyle = angleGradient(ctx, 160, W, H, [
      [0, '#F6F8FC'],
      [0.45, '#B9C2D4'],
      [0.60, '#EDF1F8'],
      [1, '#98A3BB']
    ]);
    ctx.fillRect(0, 0, W, H);

    /* Rhinestones: white core + pink ring, on a ~60px grid laid out as a ring
       centered in the border band (the inner card covers everything else, so
       a plain grid would drop the bottom/right rows). Step is nudged off 60
       so the corners land exactly on the band centerline. */
    var mid = BORDER / 2;
    function axis(span) {
      var n = Math.max(1, Math.round((span - BORDER) / 60));
      var step = (span - BORDER) / n;
      var out = [];
      for (var i = 0; i <= n; i++) out.push(mid + i * step);
      return out;
    }
    var xs = axis(W);
    var ys = axis(H);
    var pts = [];
    var i, j;
    for (i = 0; i < xs.length; i++) {
      pts.push([xs[i], mid], [xs[i], H - mid]);
    }
    for (j = 1; j < ys.length - 1; j++) {
      pts.push([mid, ys[j]], [W - mid, ys[j]]);
    }

    ctx.save();
    ctx.globalAlpha = 0.9;
    for (i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 7, 0, Math.PI * 2);
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 4, 0, Math.PI * 2);
      ctx.fillStyle = WHITE;
      ctx.fill();
    }
    ctx.restore();
  }

  /* ======================================================================
     Bands
     ====================================================================== */

  function drawTopBar(ctx, x, y, w, tag) {
    ctx.save();
    ctx.fillStyle = PINK;
    ctx.fillRect(x, y, w, TOPBAR_H);
    ctx.fillStyle = WHITE;
    ctx.textBaseline = 'middle';
    var mid = y + TOPBAR_H / 2 + 3;

    // Left wordmark shrinks first if the right-hand tag is unusually long.
    ctx.font = '58px Anton, sans-serif';
    var tagW = ctx.measureText(tag).width;
    ctx.textAlign = 'right';
    ctx.fillText(tag, x + w - PAD, mid);

    var titleMax = w - PAD * 2 - tagW - 40;
    fitAnton(ctx, "ULY'S FANTASY S2", titleMax, 58, 34);
    ctx.textAlign = 'left';
    ctx.fillText("ULY'S FANTASY S2", x + PAD, mid);
    ctx.restore();
  }

  /* Navy plate-slot placeholder (same vocabulary as the board's empty photo). */
  function drawPhotoPlaceholder(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = SLOT_BASE;
    ctx.fillRect(x, y, w, h);
    var spots = [
      { cx: 0.30, cy: 0.32, rx: 0.52, ry: 0.44, a: 0.85 },
      { cx: 0.78, cy: 0.68, rx: 0.46, ry: 0.40, a: 0.60 },
      { cx: 0.55, cy: 0.14, rx: 0.34, ry: 0.26, a: 0.40 }
    ];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      var cx = x + w * s.cx;
      var cy = y + h * s.cy;
      var rx = w * s.rx;
      var ry = h * s.ry;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      g.addColorStop(0, SLOT_GLOW);
      g.addColorStop(1, 'rgba(42, 49, 104, 0)');
      ctx.save();
      ctx.globalAlpha = s.a;
      ctx.translate(cx, cy);
      ctx.scale(1, ry / Math.max(rx, ry));
      ctx.translate(-cx, -cy);
      ctx.fillStyle = g;
      ctx.fillRect(x - w, y - h, w * 3, h * 3);
      ctx.restore();
    }
    ctx.restore();
  }

  /* object-fit: cover, clipped to the photo band. */
  function drawPhotoCover(ctx, img, x, y, w, h) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var scale = Math.max(w / iw, h / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    // Match the board's face bias (object-position: center 18%): anchor the
    // crop 18% from the image top instead of dead center.
    var dy = (h - dh) * 0.18;
    ctx.drawImage(img, x + (w - dw) / 2, y + dy, dw, dh);
    ctx.restore();
  }

  function drawStatusChip(ctx, x, y, label) {
    ctx.save();
    ctx.font = '700 26px "Space Mono", monospace';
    var tracking = 6;
    var textW = trackedWidth(ctx, label, tracking);
    var w = textW + 56;
    var h = 58;
    ctx.fillStyle = 'rgba(6, 9, 36, 0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = CYAN;
    ctx.textBaseline = 'middle';
    drawTracked(ctx, label, x + 28, y + h / 2 + 1, tracking, 'left');
    ctx.restore();
  }

  function drawNamePlate(ctx, x, y, w, data) {
    ctx.save();
    var g = angleGradient(ctx, 90, w, PLATE_H, [[0, '#F4F2F7'], [1, '#D9DEE8']]);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, PLATE_H);
    ctx.restore();

    var maxW = w - PAD * 2;
    var name = String(data.name || 'YOUR PROSPECT').toUpperCase();
    ctx.fillStyle = PLATE_INK;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    fitAnton(ctx, name, maxW, 92, 34);
    ctx.fillText(name, x + PAD, y + 118);

    // Team (left) / position (right), letterspaced mono.
    ctx.font = '700 24px "Space Mono", monospace';
    ctx.fillStyle = PLATE_META;
    var metaY = y + 166;
    var team = String(data.team || '').toUpperCase();
    var pos = String(data.pos || '').toUpperCase();
    var tracking = 4;
    var posW = pos ? trackedWidth(ctx, pos, tracking) : 0;
    if (team) {
      var teamMax = maxW - posW - 40;
      // Ellipsize a long team rather than colliding with the position.
      while (team.length > 1 && trackedWidth(ctx, team, tracking) > teamMax) {
        team = team.slice(0, -1);
      }
      if (team !== String(data.team || '').toUpperCase()) team = team.slice(0, -1) + '…';
      drawTracked(ctx, team, x + PAD, metaY, tracking, 'left');
    }
    if (pos) drawTracked(ctx, pos, x + w - PAD, metaY, tracking, 'right');
    ctx.restore();
  }

  function drawScoutLine(ctx, x, y, w, data) {
    ctx.save();
    ctx.fillStyle = DEEP_NAVY;
    ctx.fillRect(x, y, w, SCOUT_H);
    ctx.fillStyle = CYAN;
    ctx.fillRect(x, y, w, 4);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = '700 24px "Space Mono", monospace';
    ctx.fillStyle = CYAN;
    drawTracked(ctx, 'SCOUTING REPORT', x + PAD, y + 58, 8, 'left');

    // The fan's "why" — editorial italic serif, max 3 lines, ellipsized.
    var maxW = w - PAD * 2;
    ctx.font = 'italic 44px "Instrument Serif", serif';
    ctx.fillStyle = BUBBLEGUM;
    var quote = String(data.why || '').trim();
    var lines;
    if (quote) {
      lines = wrapLines(ctx, '“' + quote + '”', maxW, 3);
    } else {
      // No report yet (the ?preview=confirm hook) — don't leave a dead band.
      ctx.fillStyle = MUTED;
      lines = ['The case for him is still being written.'];
    }
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + PAD, y + 128 + i * 56);
    }

    // Footer row: scouted-by (left) / XOXO (right).
    var footY = y + SCOUT_H - 40;
    ctx.font = '22px "Space Mono", monospace';
    var tracking = 3;
    ctx.fillStyle = MUTED;
    var lead = 'scouted by ';
    var leadW = trackedWidth(ctx, lead, tracking);
    drawTracked(ctx, lead, x + PAD, footY, tracking, 'left');
    ctx.fillStyle = PINK;
    drawTracked(ctx, atHandle(data.ig), x + PAD + leadW, footY, tracking, 'left');

    ctx.font = '700 22px "Space Mono", monospace';
    ctx.fillStyle = BUBBLEGUM;
    drawTracked(ctx, 'XOXO', x + w - PAD, footY, 6, 'right');
    ctx.restore();
  }

  function atHandle(ig) {
    var h = String(ig || '').trim().replace(/^@+/, '');
    return h ? '@' + h : '@anon';
  }

  /* ======================================================================
     Render
     ====================================================================== */

  function render(data, H, img) {
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    /* ---- VARIANT SEAM ---------------------------------------------------
       The comp also has a gold "drafted" card (gold frame, gold top bar,
       "DRAFTED №n" chip). Prospect-only for now; when the drafted flag ships,
       branch the frame/top-bar/chip colors here off `variant`, and swap the
       chip label to 'DRAFTED'. Today every card renders as 'prospect'. */
    var variant = data.drafted ? 'drafted' : 'prospect';
    var chipLabel = variant === 'drafted' ? 'DRAFTED' : 'PROSPECT';

    drawChromeFrame(ctx, H);

    var x = BORDER;
    var y = BORDER;
    var w = W - BORDER * 2;
    var h = H - BORDER * 2;

    ctx.fillStyle = NAVY;
    ctx.fillRect(x, y, w, h);

    var photoY = y + TOPBAR_H;
    var photoH = h - TOPBAR_H - PLATE_H - SCOUT_H;

    var tag = data.pickNum != null && data.pickNum !== ''
      ? '№' + data.pickNum
      : 'PROSPECT №?';
    drawTopBar(ctx, x, y, w, tag);

    drawPhotoPlaceholder(ctx, x, photoY, w, photoH);
    if (img) drawPhotoCover(ctx, img, x, photoY, w, photoH);
    drawStatusChip(ctx, x + 28, photoY + 28, chipLabel);

    drawNamePlate(ctx, x, photoY + photoH, w, data);
    drawScoutLine(ctx, x, photoY + photoH + PLATE_H, w, data);

    return canvas;
  }

  /* Resolve an Image for `src`, or null if it can't be used.
     data-URLs load directly (same-origin, never taint); remote URLs are
     requested with CORS so a permissive host can still be drawn. */
  function loadPhoto(src) {
    return new Promise(function (resolve) {
      var url = String(src || '').trim();
      if (!url) return resolve(null);
      var isData = /^data:image\//i.test(url);
      if (!isData && !/^https?:/i.test(url) && !/^[\w./-]+$/.test(url)) return resolve(null);
      var img = new Image();
      if (!isData) img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Canvas export failed.'));
        }, 'image/png');
      } catch (e) {
        reject(e); // SecurityError — the canvas is tainted
      }
    });
  }

  window.UFTradingCard = {
    /**
     * Generate the Hottie Trading Card PNG.
     * @param {Object} data  {name, team, pos, why, ig, pickNum, photo}
     * @param {Object} [opts] {size: 'feed'|'story'}
     * @returns {Promise<Blob>} image/png — always resolves for valid data;
     *          a photo that taints the canvas is dropped and the card is
     *          re-exported with the placeholder.
     */
    generate: function (data, opts) {
      data = data || {};
      var size = (opts && opts.size) === 'story' ? 'story' : 'feed';
      var H = SIZES[size];

      return Promise.all([
        document.fonts.load('92px Anton'),
        document.fonts.load('italic 44px "Instrument Serif"'),
        document.fonts.load('22px "Space Mono"'),
        document.fonts.load('700 24px "Space Mono"'),
        loadPhoto(data.photo)
      ]).then(function (res) {
        var img = res[4];
        return toBlob(render(data, H, img)).catch(function (err) {
          // Tainted canvas (cross-origin photo without CORS headers) — the
          // export MUST still succeed, so drop the photo and try again.
          if (!img) throw err;
          return toBlob(render(data, H, null));
        });
      });
    },

    /** Sizes, exposed for callers/tests. */
    SIZES: { feed: [W, SIZES.feed], story: [W, SIZES.story] }
  };
})();
