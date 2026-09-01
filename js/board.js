/* ==========================================================================
   ULY'S FANTASY S2 — board.js
   Renders the Hottie Board grid from UFStore (seeds + approved fans),
   drives the compact header countdown, and live-updates on storage events.
   All user-sourced strings are set via textContent — never innerHTML.
   ========================================================================== */
(function () {
  'use strict';

  var MIN_SLOTS = 12;
  var STORE_KEY = 'ufs2.submissions.v1';
  var KISSED_KEY = 'ufs2.kissed.v1'; // JSON array of entry ids this browser kissed

  var grid = document.getElementById('board-grid');
  var countEl = document.getElementById('picks-filed');
  var cdEl = document.getElementById('cd-short');
  var cdWrap = document.getElementById('cd-wrap');

  /* ---------- helpers ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Only allow http(s) URLs for fan photo links — plus inline data:image/
   *  URIs, which the local dev adapter stores for crowd-attached photos. */
  function safePhotoUrl(raw) {
    if (!raw) return null;
    var s = String(raw);
    if (/^data:image\//.test(s)) return s;
    try {
      var u = new URL(s, window.location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (e) { /* not a URL */ }
    return null;
  }

  /* ---------- kisses (one per browser per entry) ---------- */

  function readKissed() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(KISSED_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeKissed(list) {
    try {
      window.localStorage.setItem(KISSED_KEY, JSON.stringify(list));
    } catch (e) { /* storage unavailable — kiss just won't persist */ }
  }

  function isKissed(id) {
    return readKissed().indexOf(id) !== -1;
  }

  function setKissed(id, on) {
    var list = readKissed();
    var at = list.indexOf(id);
    if (on && at === -1) list.push(id);
    else if (!on && at !== -1) list.splice(at, 1);
    else return;
    writeKissed(list);
  }

  function atHandle(ig) {
    var h = String(ig || '').trim().replace(/^@+/, '');
    return h ? '@' + h : '@anon';
  }

  /** How many columns is the grid currently laying out? */
  function columnCount() {
    if (!grid) return 4;
    var cols = window.getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    return Math.max(1, cols);
  }

  /* ---------- card builders ---------- */

  function numTag(n, variant) {
    // variant: 'gold' | 'pink' | 'empty'
    return el('span', 'slot__num slot__num--' + variant, '№' + n);
  }

  function photoPlaceholder(label) {
    return el('div', 'slot__photo slot__photo--stripes', label);
  }

  /** Photoless FAN card fallback — two-line callout on the striped navy.
   *  When a pick is passed (the genuinely-photoless render path, not the
   *  broken-image fallback), the crowd-photo attach control rides along. */
  function fanPlaceholder(pick) {
    var box = el('div', 'slot__photo slot__photo--stripes slot__photo--nofan');
    box.appendChild(el('span', 'slot__photo-main', 'NO HEADSHOT ON FILE'));
    box.appendChild(el('span', 'slot__photo-sub', 'scouts — we need visuals'));
    if (pick && pick.id != null) box.appendChild(attachControl(pick));
    return box;
  }

  /* ---------- crowd photos (file a headshot for a photoless pick) ----------
     Client decision: crowd photos go live directly — the backend writes the
     photo cell and the card shows it once the ~30s server cache rolls over
     (locally, on the next re-render). renderBoard() rebuilds every card on
     the refresh poll, so filed ids are remembered module-wide and re-render
     as the success line until the photo arrives. */
  var ATTACH_DONE_MSG = "Filed. Give him a minute — he's getting ready. 💋";
  var ATTACH_FAIL_MSG = "Couldn't file that one — give it another go.";
  var attachedIds = {}; // id → true once this session filed a headshot

  var ATTACH_MAX_SIDE = 1600;      // longest side after client-side resize
  var ATTACH_JPEG_QUALITY = 0.8;
  var ATTACH_MAX_BYTES = 5 * 1024 * 1024; // hard fail past the backend ceiling

  /** Downscale to ≤1600px longest side, export JPEG q0.8; resolve the
   *  data-URL or reject with a user-safe Error. (Same approach as form.js's
   *  compressPhoto — self-contained here so board.html needs no new file.) */
  function compressAttachPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          var scale = Math.min(1, ATTACH_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
          var w = Math.max(1, Math.round(img.naturalWidth * scale));
          var h = Math.max(1, Math.round(img.naturalHeight * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var cctx = canvas.getContext('2d');
          cctx.fillStyle = '#FFFFFF'; // JPEG has no alpha — composite
          cctx.fillRect(0, 0, w, h); // transparent PNGs onto white, not black
          cctx.drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', ATTACH_JPEG_QUALITY);
          // decoded bytes ≈ base64 length × 3/4 — hard-fail past the
          // backend's 5MB decoded ceiling
          var b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
          if (b64.length * 0.75 > ATTACH_MAX_BYTES) {
            reject(new Error("That photo is too thicc even after we squeezed it. Try a smaller one."));
            return;
          }
          resolve(dataUrl);
        } catch (e) {
          reject(new Error("Couldn't read that photo. Try a JPG or PNG."));
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Couldn't read that photo. Try a JPG or PNG."));
      };
      img.src = url;
    });
  }

  /** The pink "got his headshot? file it →" control inside the placeholder.
   *  Button → hidden file input → compress → UFStore.attachPhoto. Success
   *  swaps the line to the filed message; errors show a brief note and the
   *  button stays for a retry. Keyboard: it is a real <button>. */
  function attachControl(pick) {
    var wrap = el('div', 'slot__attach');
    if (attachedIds[pick.id]) {
      wrap.appendChild(el('span', 'slot__attach-done', ATTACH_DONE_MSG));
      return wrap;
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot__attach-btn';
    btn.textContent = 'got his headshot? file it →';
    btn.setAttribute('aria-label', 'Got his headshot? File a photo of ' + pick.name + ' for review');

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;

    var note = el('span', 'slot__attach-note', '');
    note.setAttribute('role', 'status'); // errors/success announced politely

    btn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      btn.disabled = true;
      note.textContent = 'Filing…';
      compressAttachPhoto(file)
        .then(function (dataUrl) {
          if (!(window.UFStore && typeof window.UFStore.attachPhoto === 'function')) {
            throw new Error(ATTACH_FAIL_MSG);
          }
          return window.UFStore.attachPhoto(pick.id, dataUrl);
        })
        .then(function () {
          attachedIds[pick.id] = true;
          // The note (role=status) announces success; the photo itself lands
          // on the next refresh (locally at once, live after the ~30s cache).
          btn.remove();
          note.className = 'slot__attach-done';
          note.textContent = ATTACH_DONE_MSG;
          if (window.UFStore && typeof window.UFStore.refresh === 'function') {
            window.UFStore.refresh();
          }
        })
        .catch(function (err) {
          input.value = '';
          btn.disabled = false;
          note.textContent = (err && err.message) || ATTACH_FAIL_MSG;
        });
    });

    wrap.appendChild(btn);
    wrap.appendChild(input);
    wrap.appendChild(note);
    return wrap;
  }

  function commishPhoto(pick) {
    var frame = el('div', 'slot__photo slot__photo--img');
    var img = document.createElement('img');
    img.src = pick.photo;
    if (pick.photo480) img.srcset = pick.photo480 + ' 480w, ' + pick.photo + ' 800w';
    img.sizes = '(max-width: 640px) 92vw, 300px';
    img.alt = 'ULY — Head Hottie portrait';
    img.width = 800;
    img.height = 600;
    img.loading = 'lazy';
    img.decoding = 'async';
    frame.appendChild(img);
    return frame;
  }

  function fanPhoto(url, name) {
    var frame = el('div', 'slot__photo slot__photo--img');
    var img = document.createElement('img');
    img.alt = 'Fan photo of ' + name;
    /* Intrinsic size of user-linked photos is unknown; the 190px object-fit
       frame is fixed-height, so no width/height hints (no CLS either way). */
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('load', function () {
      // Very tall portraits (phone screenshots etc.): the CSS default crop
      // (50% 22%) lands mid-torso — anchor the crop to the top so the face
      // stays in frame. Normal photos keep the stylesheet value.
      if (img.naturalHeight > 1.4 * img.naturalWidth) {
        img.style.objectPosition = '50% 0%';
      }
    });
    img.addEventListener('error', function () {
      var fallback = fanPlaceholder();
      if (frame.parentNode) frame.parentNode.replaceChild(fallback, frame);
    });
    img.src = url;
    frame.appendChild(img);
    return frame;
  }

  /** The 💋 button in an approved fan card's footer. All state text goes
   *  through textContent; one kiss per browser per entry (KISSED_KEY). */
  function kissButton(pick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot__kiss';
    var kissed = isKissed(pick.id);
    btn.setAttribute('aria-label', 'Send a kiss to ' + pick.name);
    btn.setAttribute('aria-pressed', kissed ? 'true' : 'false');
    if (kissed) btn.classList.add('slot__kiss--kissed');

    var lips = el('span', 'slot__kiss-lips', '💋');
    lips.setAttribute('aria-hidden', 'true');
    var count = el('span', 'slot__kiss-count', String(Number(pick.votes) || 0));
    btn.appendChild(lips);
    btn.appendChild(count);

    btn.addEventListener('click', function () {
      if (isKissed(pick.id)) return; // one kiss per browser per entry

      // Optimistic: mark + bump immediately, revert if the store rejects.
      var before = Number(count.textContent) || 0;
      setKissed(pick.id, true);
      count.textContent = String(before + 1);
      btn.setAttribute('aria-pressed', 'true');
      btn.classList.add('slot__kiss--kissed');

      /* Guarded like the refresh() call below: local store.js has addVote
         too, but an old deployed adapter may not. No addVote → the
         optimistic state simply stands for this session. */
      if (window.UFStore && typeof window.UFStore.addVote === 'function') {
        window.UFStore.addVote(pick.id).then(function (out) {
          if (out && out.votes != null) count.textContent = String(Number(out.votes) || 0);
          renderBoard(); // authoritative count may move the FAN FAVORITE badge
        }, function () {
          // Rejected (unknown id, not approved, network, pre-vote backend):
          // undo the kiss so the fan can try again later.
          setKissed(pick.id, false);
          count.textContent = String(before);
          btn.setAttribute('aria-pressed', 'false');
          btn.classList.remove('slot__kiss--kissed');
        });
      }
    });
    return btn;
  }

  /** The 🃏 button in an approved fan card's footer — downloads (desktop) or
   *  shares (mobile) that pick's Hottie Trading Card as a PNG. Stateless:
   *  renderBoard() rebuilds it on every render, exactly like the kiss button. */
  var isMobileShare = window.matchMedia('(pointer: coarse)').matches &&
    !!(navigator.canShare && navigator.share);

  function cardButton(pick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot__card';
    btn.setAttribute('aria-label', 'Download ' + pick.name + "'s trading card");
    var glyph = el('span', 'slot__card-glyph', '🃏');
    glyph.setAttribute('aria-hidden', 'true');
    btn.appendChild(glyph);

    var busy = false;
    btn.addEventListener('click', function () {
      if (busy) return;
      if (!window.UFTradingCard || !window.UFTradingCard.generate) return;
      busy = true;
      btn.classList.add('slot__card--busy');
      btn.setAttribute('aria-disabled', 'true');

      function done(cls) {
        busy = false;
        btn.classList.remove('slot__card--busy');
        btn.setAttribute('aria-disabled', 'false');
        if (cls) {
          btn.classList.add(cls);
          setTimeout(function () { btn.classList.remove(cls); }, 1600);
        }
      }

      /* safePhotoUrl keeps the local adapter's '[uploaded photo]' marker out;
         a real cross-origin URL is attempted and silently dropped by
         UFTradingCard if it would taint the canvas. */
      var photoUrl = safePhotoUrl(pick.photo) || '';
      var isDrive = /^https:\/\/drive\.google\.com\//.test(photoUrl);
      var photoReady = (isDrive && pick.id && window.UFStore &&
          typeof window.UFStore.getPhotoData === 'function')
        ? window.UFStore.getPhotoData(pick.id).then(function (d) { return d || photoUrl; })
        : Promise.resolve(photoUrl);
      photoReady.then(function (resolvedPhoto) {
      return window.UFTradingCard.generate({
        name: pick.name,
        team: pick.team,
        pos: pick.pos,
        why: pick.quote,
        ig: pick.credit,
        pickNum: pick.pickNum,
        photo: resolvedPhoto
      }, { size: 'feed' }).then(function (blob) {
        var filename = 'share-your-hottie-card.png';
        function downloadCard() {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
          done('slot__card--done');
        }
        var file = new File([blob], filename, { type: 'image/png' });
        if (isMobileShare && navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file] })
            .then(function () { done('slot__card--done'); })
            .catch(function (err) {
              if (err && err.name === 'AbortError') done(null);
              else downloadCard();
            });
        }
        downloadCard();
      }, function () {
        done(null);
      });
      });
    });
    return btn;
  }

  function faveBadge() {
    var badge = el('span', 'slot__fave');
    badge.appendChild(document.createTextNode('Fan favorite '));
    var lips = el('span', null, '💋');
    lips.setAttribute('aria-hidden', 'true');
    badge.appendChild(lips);
    return badge;
  }

  /* Must mirror form.js's anchor sanitizer exactly — the dupe nudge links to
     board.html#pick-<safe id>. */
  function anchorId(id) {
    return 'pick-' + String(id).replace(/[^A-Za-z0-9_-]/g, '-');
  }

  function filledCard(n, pick) {
    var isCommish = !!pick.isCommish;
    var card = el('article', 'slot slot--filled' + (pick.isCommishPhoto ? ' slot--gold' : ''));
    if (pick.isFan && pick.id != null) card.id = anchorId(pick.id);
    card.appendChild(numTag(n, pick.isCommishPhoto ? 'gold' : 'pink'));
    if (pick.isFave) card.appendChild(faveBadge());

    if (pick.isCommishPhoto) {
      card.appendChild(commishPhoto(pick));
    } else if (isCommish) {
      card.appendChild(photoPlaceholder('polaroid crop · fan photo'));
    } else {
      var url = safePhotoUrl(pick.photo);
      card.appendChild(url ? fanPhoto(url, pick.name) : fanPlaceholder(pick));
    }

    var body = el('div', 'slot__body');
    var head = el('div', 'slot__head');
    var name = el('h2', 'display display--name slot__name', pick.name);
    var team = el('p', 'slot__team', pick.team);
    head.appendChild(name);
    head.appendChild(team);
    body.appendChild(head);

    var quote = el('blockquote', 'editorial slot__quote', '"' + pick.quote + '"');
    body.appendChild(quote);

    var foot = el('div', 'slot__foot');
    var credit = el('span', 'slot__credit', 'scouted by ');
    credit.appendChild(el('span', 'slot__credit-handle', pick.credit));
    foot.appendChild(credit);
    if (isCommish) {
      foot.appendChild(el('span', 'slot__commish', 'Uly’s pick'));
    }
    if (pick.isFan) {
      var acts = el('span', 'slot__acts');
      acts.appendChild(cardButton(pick));
      acts.appendChild(kissButton(pick));
      foot.appendChild(acts);
    }
    body.appendChild(foot);
    card.appendChild(body);
    return card;
  }

  function emptyCard(n) {
    var card = el('div', 'slot slot--empty');
    card.appendChild(numTag(n, 'empty'));

    var inner = el('div', 'slot__empty-inner');
    var dot = el('span', 'badge-live__dot badge-live__dot--pink slot__dot');
    dot.setAttribute('aria-hidden', 'true');
    inner.appendChild(dot);

    var msg = el('p', 'display slot__clock');
    msg.appendChild(document.createTextNode('This pick is still'));
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode('on the clock'));
    inner.appendChild(msg);

    var link = el('a', 'slot__scout link-tap', 'Scout someone →');
    link.href = 'index.html';
    inner.appendChild(link);

    card.appendChild(inner);
    return card;
  }

  /* ---------- render ---------- */

  var lastCols = 0;

  function renderBoard() {
    if (!grid) return;

    var seeds = window.UFStore ? window.UFStore.seedPicks : [];
    var approved = window.UFStore ? window.UFStore.getApproved() : [];
    var filled = seeds.length + approved.length;

    var cols = columnCount();
    lastCols = cols;
    var total = Math.max(MIN_SLOTS, Math.ceil(Math.max(filled, MIN_SLOTS) / cols) * cols);
    if (filled > MIN_SLOTS) total = Math.max(total, Math.ceil(filled / cols) * cols);

    var frag = document.createDocumentFragment();
    var n = 1;

    seeds.forEach(function (pick) {
      frag.appendChild(filledCard(n++, pick));
    });

    // FAN FAVORITE: most kisses among approved fans (votes > 0 only).
    // `approved` is oldest-first from both adapters, so on a tie the first
    // hit = the earliest submission. Board ORDER never changes.
    var faveId = null;
    var faveVotes = 0;
    approved.forEach(function (sub) {
      var v = Number(sub.votes) || 0;
      if (v > faveVotes) { faveVotes = v; faveId = sub.id; }
    });

    approved.forEach(function (sub) {
      var slot = n++; // capture BEFORE the literal below reads it (pickNum)
      frag.appendChild(filledCard(slot, {
        id: sub.id,
        name: sub.name,
        team: sub.team,
        pos: sub.pos,
        quote: sub.why,
        credit: atHandle(sub.ig),
        photo: sub.photo,
        pickNum: slot,
        votes: Number(sub.votes) || 0,
        isFan: true,
        isFave: sub.id === faveId,
        isCommish: false,
        isCommishPhoto: false
      }));
    });

    while (n <= total) {
      frag.appendChild(emptyCard(n++));
    }

    grid.textContent = '';
    grid.appendChild(frag);

    if (false && countEl) {
      countEl.textContent = 'Round 1 · Official scouting · ' +
        filled + ' of ' + total + ' picks filed';
    }

    scrollToHashCard();
  }

  /* ---------- #pick-<id> deep links ----------
     Fan cards render AFTER the store's async refresh with the remote adapter,
     so native fragment scrolling fires too early. Once the linked card exists,
     scroll to it exactly once — later re-renders never re-hijack scroll. */
  var hashScrolled = false;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The sticky header wraps taller on narrow screens (134px @390, 172px @320)
     — publish its real height so .slot's scroll-margin-top clears it. */
  var headerEl = document.querySelector('.board-header');
  function setHeaderVar() {
    if (headerEl) {
      document.documentElement.style.setProperty('--header-h', headerEl.offsetHeight + 'px');
    }
  }
  setHeaderVar();

  function scrollToHashCard() {
    setHeaderVar();
    if (hashScrolled) return;
    var h = window.location.hash;
    if (h.indexOf('#pick-') !== 0) return;
    var target = document.getElementById(h.slice(1));
    if (!target) return;
    hashScrolled = true;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  window.addEventListener('hashchange', function () {
    hashScrolled = false;
    scrollToHashCard();
  });

  /* ---------- countdown ---------- */

  if (cdEl && window.UFCountdown) {
    var lastSpokenMin = -1;
    window.UFCountdown.start(function (p) {
      cdEl.textContent = p.dd + 'D ' + p.hh + 'H ' + p.mm + 'M ' + p.ss + 'S';
      if (cdWrap && p.min !== lastSpokenMin) {
        lastSpokenMin = p.min;
        cdWrap.setAttribute('aria-label', 'Draft in ' + window.UFCountdown.spoken());
      }
    });
  }

  /* ---------- live updates ---------- */

  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === STORE_KEY) renderBoard();
  });

  /* Remote adapter (store.remote.js): re-render when a fetch lands, and kick
     off the first fetch. Local store.js has no refresh() and never fires
     these events — every line here is a harmless no-op there. */
  var offlineNote = null;
  function toggleOfflineNote(on) {
    var titleInner = document.querySelector('.board-title__inner');
    if (on && !offlineNote && titleInner) {
      offlineNote = el('p', 'board-title__offline',
        "Couldn't reach Besties HQ — fan picks will appear when it's back.");
      titleInner.appendChild(offlineNote);
    } else if (!on && offlineNote) {
      if (offlineNote.parentNode) offlineNote.parentNode.removeChild(offlineNote);
      offlineNote = null;
    }
  }

  window.addEventListener('ufstore:updated', function () {
    toggleOfflineNote(false);
    renderBoard();
  });
  window.addEventListener('ufstore:error', function () {
    // Only flag it when we have nothing to show — stale cards beat a banner.
    if (window.UFStore && !window.UFStore.getApproved().length) toggleOfflineNote(true);
  });
  if (window.UFStore && typeof window.UFStore.refresh === 'function') {
    window.UFStore.refresh();

    /* iOS Safari re-opens the tab without reloading — refetch whenever the
       board becomes visible again, plus a gentle poll while it's on screen. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) window.UFStore.refresh();
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) window.UFStore.refresh(); // back-forward cache restore
    });
    setInterval(function () {
      if (!document.hidden) window.UFStore.refresh();
    }, 60000);
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      setHeaderVar();
      if (columnCount() !== lastCols) renderBoard();
    }, 200);
  });

  renderBoard();
})();
