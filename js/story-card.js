/* ==========================================================================
   ULY'S FANTASY S2 — story-card.js
   Renders the approved "IG Story Share-Back" design (1080×1920 PNG) on an
   offscreen canvas so the confirmation takeover can share a real image.

   window.UFStoryCard.generate(playerName) → Promise<Blob> (image/png)

   Faithful to the approved comp: hot-pink field, halftone dot circle
   top-right, BREAKING chip, Anton headline with navy offset shadow, torn
   bubblegum plate (tape strip, heart sticker, prospect name shrink-to-fit),
   navy show block over a chrome date bar, deep-navy link bar. Emoji render
   through the system emoji font fallback.
   ========================================================================== */
(function () {
  'use strict';

  var W = 1080;
  var H = 1920;

  /* Palette (SPEC tokens + comp-specific editorial colors) */
  var PINK = '#FF3EA5';
  var NAVY = '#0A0E2E';
  var DEEP_NAVY = '#060924';
  var CYAN = '#43E8FF';
  var BUBBLEGUM = '#FFC7E4';
  var PLUM = '#7A0F4C';
  var PLATE_LABEL = '#B0286E';
  var PLATE_INK = '#2A0A1E';
  var MUTED = '#8B8FB5';
  var WHITE = '#FFFFFF';

  function font(spec) {
    return spec; // readability helper for ctx.font strings below
  }

  /* Space Mono letterspaced caps — canvas has no letter-spacing, draw per char. */
  function drawTracked(ctx, text, x, y, tracking, align) {
    // Iterate CODE POINTS, not UTF-16 units — emoji are surrogate pairs and
    // splitting them draws tofu.
    var chars = Array.from(text);
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

  /* Halftone dot circle, top-right corner, dots fading toward the edge. */
  function drawHalftone(ctx) {
    var cx = W + 40;
    var cy = -40;
    var R = 460;
    var step = 34;
    ctx.save();
    for (var y = -60; y < 560; y += step) {
      for (var x = W - 560; x < W + 60; x += step) {
        var dx = x - cx;
        var dy = y - cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) continue;
        var t = 1 - d / R;            // 1 at center → 0 at rim
        var r = 3 + 8 * t;            // bigger dots toward the corner
        ctx.globalAlpha = 0.18 + 0.62 * t; // fade mask toward the rim
        ctx.fillStyle = WHITE;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* Top-left navy chip: blinking-dot glyph (static) + cyan letterspaced caps. */
  function drawBreakingChip(ctx) {
    var x = 100;
    var y = 128;
    var h = 74;
    ctx.save();
    ctx.font = font('700 30px "Space Mono", monospace');
    var label = 'BREAKING · SELF-REPORTED';
    var tracking = 4;
    var textW = 0;
    for (var i = 0; i < label.length; i++) textW += ctx.measureText(label[i]).width + (i < label.length - 1 ? tracking : 0);
    var w = 34 + 16 + 22 + textW + 34;
    ctx.fillStyle = NAVY;
    ctx.fillRect(x, y, w, h);
    // dot glyph (the live blinking dot, frozen for the still)
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(x + 34 + 9, y + h / 2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(x + 34 + 9, y + h / 2, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    drawTracked(ctx, label, x + 34 + 16 + 22, y + h / 2 + 2, tracking, 'left');
    ctx.restore();
  }

  /* Headline: Anton white with a navy offset shadow (4px-equivalent → 8px @1080). */
  function drawHeadline(ctx) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    var x = 100;
    var lines = [
      { text: 'I SUBMITTED', y: 420 },
      { text: 'MY HOTTIE 🏈💋', y: 578 }
    ];
    ctx.font = font('150px Anton, sans-serif');
    for (var i = 0; i < lines.length; i++) {
      ctx.fillStyle = NAVY;
      ctx.fillText(lines[i].text, x + 8, lines[i].y + 8);
      ctx.fillStyle = WHITE;
      ctx.fillText(lines[i].text, x, lines[i].y);
    }
    // italic serif gossip line
    ctx.font = font('italic 40px "Instrument Serif", serif');
    ctx.fillStyle = PLUM;
    ctx.fillText('no I will not be taking questions.', x + 4, 660);
    ctx.restore();
  }

  /* Torn-paper edge: polygon with a few notches along each side. */
  function tornPlatePath(ctx, w, h) {
    // hand-tuned notch offsets (px) — subtle, paper-tear feel
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6, -h / 2);
    ctx.lineTo(-w / 2 + w * 0.22, -h / 2 - 7);
    ctx.lineTo(-w / 2 + w * 0.45, -h / 2 + 4);
    ctx.lineTo(-w / 2 + w * 0.71, -h / 2 - 6);
    ctx.lineTo(w / 2 - 8, -h / 2 + 2);
    ctx.lineTo(w / 2 + 5, -h / 2 + h * 0.3);
    ctx.lineTo(w / 2 - 4, -h / 2 + h * 0.58);
    ctx.lineTo(w / 2 + 6, -h / 2 + h * 0.82);
    ctx.lineTo(w / 2 - 3, h / 2);
    ctx.lineTo(w / 2 - w * 0.28, h / 2 + 7);
    ctx.lineTo(w / 2 - w * 0.52, h / 2 - 4);
    ctx.lineTo(w / 2 - w * 0.77, h / 2 + 6);
    ctx.lineTo(-w / 2 + 4, h / 2 - 2);
    ctx.lineTo(-w / 2 - 6, h / 2 - h * 0.34);
    ctx.lineTo(-w / 2 + 4, h / 2 - h * 0.6);
    ctx.lineTo(-w / 2 - 5, h / 2 - h * 0.85);
    ctx.closePath();
  }

  /* Pink heart sticker (vector — reliable everywhere, it's a sticker anyway). */
  function drawHeartSticker(ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 0.35);
    ctx.bezierCurveTo(-0.06, 0.22, -0.5, -0.02, -0.5, -0.28);
    ctx.bezierCurveTo(-0.5, -0.55, -0.18, -0.6, 0, -0.38);
    ctx.bezierCurveTo(0.18, -0.6, 0.5, -0.55, 0.5, -0.28);
    ctx.bezierCurveTo(0.5, -0.02, 0.06, 0.22, 0, 0.35);
    ctx.closePath();
    // white sticker border
    ctx.lineWidth = 0.16;
    ctx.strokeStyle = WHITE;
    ctx.stroke();
    ctx.fillStyle = PINK;
    ctx.fill();
    ctx.restore();
  }

  /* Shrink Anton until `text` fits `maxW`; returns the px size used. */
  function fitAnton(ctx, text, maxW, startPx, minPx) {
    var px = startPx;
    while (px > minPx) {
      ctx.font = font(px + 'px Anton, sans-serif');
      if (ctx.measureText(text).width <= maxW) break;
      px -= 4;
    }
    ctx.font = font(px + 'px Anton, sans-serif');
    return px;
  }

  /* Centered torn bubblegum plate with the prospect name. */
  function drawPlate(ctx, playerName) {
    var cx = W / 2;
    var cy = 985;
    var pw = 880;
    var ph = 460;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-1.6 * Math.PI / 180);

    // paper
    ctx.save();
    ctx.shadowColor = 'rgba(6, 9, 36, 0.28)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 14;
    tornPlatePath(ctx, pw, ph);
    ctx.fillStyle = BUBBLEGUM;
    ctx.fill();
    ctx.restore();

    // white tape strip across the plate's top edge
    ctx.save();
    ctx.rotate(0.028);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = WHITE;
    ctx.fillRect(-130, -ph / 2 - 26, 260, 52);
    ctx.restore();

    // small letterspaced label
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PLATE_LABEL;
    ctx.font = font('700 28px "Space Mono", monospace');
    drawTracked(ctx, 'THE PROSPECT IN QUESTION', 0, -ph / 2 + 118, 8, 'center');

    // prospect name — Anton, shrink-to-fit
    ctx.fillStyle = PLATE_INK;
    var name = String(playerName || 'YOUR PROSPECT').toUpperCase();
    fitAnton(ctx, name, pw - 140, 110, 44);
    ctx.textAlign = 'center';
    ctx.fillText(name, 0, 40);
    ctx.textAlign = 'left';

    // dashed divider
    ctx.save();
    ctx.strokeStyle = PLATE_LABEL;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 12]);
    ctx.beginPath();
    ctx.moveTo(-pw / 2 + 120, 108);
    ctx.lineTo(pw / 2 - 120, 108);
    ctx.stroke();
    ctx.restore();

    // status line — small caps feel via caps + tracking
    ctx.fillStyle = PLATE_INK;
    ctx.font = font('28px "Space Mono", monospace');
    drawTracked(ctx, 'STATUS: FILED WITH BESTIES HQ  💋', 0, 172, 4, 'center');

    // heart sticker at the plate's top-right corner
    drawHeartSticker(ctx, pw / 2 - 30, -ph / 2 + 10, 130, 0.32);
    ctx.restore();
  }

  /* Lower third: navy show block + chrome date bar. */
  function drawLowerThird(ctx) {
    var x = 100;
    var w = W - 200;
    var blockY = 1420;
    var blockH = 130;
    var barH = 104;

    ctx.save();
    // navy block
    ctx.fillStyle = NAVY;
    ctx.fillRect(x, blockY, w, blockH);
    ctx.fillStyle = WHITE;
    ctx.font = font('72px Anton, sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("ULY'S FANTASY S2", W / 2, blockY + blockH / 2 + 4);

    // chrome gradient bar
    var g = ctx.createLinearGradient(0, blockY + blockH, 0, blockY + blockH + barH);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.45, '#E9EAF2');
    g.addColorStop(0.55, '#CDD0DE');
    g.addColorStop(1, '#F2F3F8');
    ctx.fillStyle = g;
    ctx.fillRect(x, blockY + blockH, w, barH);
    ctx.fillStyle = NAVY;
    ctx.font = font('54px Anton, sans-serif');
    ctx.textAlign = 'left';
    ctx.fillText('DRAFT IS LABOR DAY', x + 44, blockY + blockH + barH / 2 + 3);
    ctx.font = font('700 30px "Space Mono", monospace');
    ctx.textAlign = 'right';
    ctx.fillText('MON SEP 7', x + w - 44, blockY + blockH + barH / 2 + 2);
    ctx.restore();
  }

  /* Bottom link bar: deep navy, cyan border, link + muted CTA. */
  function drawLinkBar(ctx) {
    var x = 100;
    var w = W - 200;
    var h = 96;
    var y = H - 100 - h; // respect the 100px bottom clear margin
    ctx.save();
    ctx.fillStyle = DEEP_NAVY;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CYAN;
    ctx.font = font('700 34px "Space Mono", monospace');
    ctx.textAlign = 'left';
    ctx.fillText('hotties.ulyandernesto.com', x + 40, y + h / 2 + 2);
    ctx.fillStyle = MUTED;
    ctx.font = font('28px "Space Mono", monospace');
    ctx.textAlign = 'right';
    ctx.fillText('SUBMIT YOURS ↗', x + w - 40, y + h / 2 + 2);
    ctx.restore();
  }

  /* The wink card — Uly winking under the wordmark (assets/img/opt/
     portrait-logo-og.jpg), drawn as a tilted navy-framed sticker in the open
     pink stretch between the plate and the lower third. Skipped gracefully
     if the image isn't available (offline) — the card still renders. */
  var winkImg = null;
  function loadWink() {
    return new Promise(function (resolve) {
      if (winkImg) return resolve(winkImg);
      var img = new Image();
      img.onload = function () { winkImg = img; resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = 'assets/img/opt/portrait-logo-og.jpg';
    });
  }

  function drawWinkCard(ctx) {
    if (!winkImg) return;
    var size = 250;
    var cx = W - 175;
    var cy = 1358;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(4 * Math.PI / 180);
    // solid navy offset shadow (takeover-screen treatment)
    ctx.fillStyle = NAVY;
    ctx.fillRect(-size / 2 + 12, -size / 2 + 12, size, size);
    // navy frame + image
    ctx.fillRect(-size / 2 - 8, -size / 2 - 8, size + 16, size + 16);
    ctx.drawImage(winkImg, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function render(playerName) {
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = PINK;
    ctx.fillRect(0, 0, W, H);

    drawHalftone(ctx);
    drawBreakingChip(ctx);
    drawHeadline(ctx);
    drawPlate(ctx, playerName);
    drawWinkCard(ctx);
    drawLowerThird(ctx);
    drawLinkBar(ctx);

    return canvas;
  }

  window.UFStoryCard = {
    /** Generate the 1080×1920 share-back PNG. Resolves to an image/png Blob. */
    generate: function (playerName) {
      // Load every face we draw with before rendering; emoji fall back to the
      // system emoji font automatically.
      return Promise.all([
        document.fonts.load('150px Anton'),
        document.fonts.load('italic 40px "Instrument Serif"'),
        document.fonts.load('28px "Space Mono"'),
        document.fonts.load('700 28px "Space Mono"'),
        loadWink()
      ]).then(function () {
        var canvas = render(playerName);
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('Canvas export failed.'));
          }, 'image/png');
        });
      });
    }
  };
})();
