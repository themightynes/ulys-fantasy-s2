/* ==========================================================================
   ULY'S FANTASY S2 — board.js
   Renders the Hottie Big Board grid from UFStore (seeds + approved fans),
   drives the compact header countdown, and live-updates on storage events.
   All user-sourced strings are set via textContent — never innerHTML.
   ========================================================================== */
(function () {
  'use strict';

  var MIN_SLOTS = 12;
  var STORE_KEY = 'ufs2.submissions.v1';

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

  /** Only allow http(s) URLs for fan photo links. */
  function safePhotoUrl(raw) {
    if (!raw) return null;
    try {
      var u = new URL(String(raw), window.location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (e) { /* not a URL */ }
    return null;
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
    img.addEventListener('error', function () {
      var fallback = photoPlaceholder('polaroid crop · fan photo');
      if (frame.parentNode) frame.parentNode.replaceChild(fallback, frame);
    });
    img.src = url;
    frame.appendChild(img);
    return frame;
  }

  function filledCard(n, pick) {
    var isCommish = !!pick.isCommish;
    var card = el('article', 'slot slot--filled' + (pick.isCommishPhoto ? ' slot--gold' : ''));
    card.appendChild(numTag(n, pick.isCommishPhoto ? 'gold' : 'pink'));

    if (pick.isCommishPhoto) {
      card.appendChild(commishPhoto(pick));
    } else if (isCommish) {
      card.appendChild(photoPlaceholder('polaroid crop · fan photo'));
    } else {
      var url = safePhotoUrl(pick.photo);
      card.appendChild(url ? fanPhoto(url, pick.name) : photoPlaceholder('polaroid crop · fan photo'));
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

    approved.forEach(function (sub) {
      frag.appendChild(filledCard(n++, {
        name: sub.name,
        team: sub.team,
        quote: sub.why,
        credit: atHandle(sub.ig),
        photo: sub.photo,
        isCommish: false,
        isCommishPhoto: false
      }));
    });

    while (n <= total) {
      frag.appendChild(emptyCard(n++));
    }

    grid.textContent = '';
    grid.appendChild(frag);

    if (countEl) {
      countEl.textContent = 'Round 1 · Official scouting · ' +
        filled + ' of ' + total + ' picks filed';
    }
  }

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
    if (on && !offlineNote && countEl && countEl.parentNode) {
      offlineNote = el('p', 'board-title__offline',
        "Couldn't reach Besties HQ — fan picks will appear when it's back.");
      countEl.parentNode.insertBefore(offlineNote, countEl.nextSibling);
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
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (columnCount() !== lastCols) renderBoard();
    }, 200);
  });

  renderBoard();
})();
