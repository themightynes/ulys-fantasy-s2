/* ==========================================================================
   ULY'S FANTASY S2 — form.js (landing-form)
   Scouting form: disabled-until-valid submit, live 280 counter, aria-live
   errors, UFStore pending save, confirmation takeover (focus trap, Esc),
   share (navigator.share → clipboard), scouting-closed state.

   Preview hooks:  ?preview=confirm  → force the takeover
                   ?preview=closed   → force the closed state
   ========================================================================== */
(function () {
  'use strict';

  var CLOSE_TS = new Date('2026-09-06T23:59:59').getTime();
  var ERROR_MSG = 'Name, team, the case for him, and the consent box are required.';
  var SHARE_TEXT = "I just scouted a Current Hottie for Uly's Fantasy S2. Draft day is Mon Sep 7. 💋 SUBMIT A HOTTIE → hotties.ulyandernesto.com";

  var form = document.getElementById('scout-form');
  var closed = document.getElementById('scout-closed');
  var takeover = document.getElementById('takeover');
  if (!form || !closed || !takeover) return;

  var heading = {
    kicker: document.querySelector('.scout__kicker'),
    title: document.querySelector('.scout__title')
  };
  var fields = {
    name: document.getElementById('f-name'),
    team: document.getElementById('f-team'),
    why: document.getElementById('f-why'),
    pos: document.getElementById('f-pos'),
    photo: document.getElementById('f-photo'),
    ig: document.getElementById('f-ig'),
    consent: document.getElementById('f-consent'),
    hp: document.getElementById('f-hp') // honeypot — humans never see or fill it
  };
  var photoFile = document.getElementById('f-photo-file');
  var photoPreview = document.getElementById('f-photo-preview');
  var photoThumb = document.getElementById('f-photo-thumb');
  var photoFilename = document.getElementById('f-photo-filename');
  var photoRemove = document.getElementById('f-photo-remove');
  var counter = document.getElementById('f-why-count');
  var counterSR = document.getElementById('f-why-sr');
  var srZone = 'ok'; // 'ok' ≤250 · 'hot' 251–279 · 'max' 280
  var submitBtn = document.getElementById('f-submit');
  var errorEl = document.getElementById('f-error');
  var confirmLine = document.getElementById('takeover-line');
  var shareBtn = document.getElementById('takeover-share');
  var cardBtn = document.getElementById('takeover-card');
  var againBtn = document.getElementById('takeover-again');

  var params = new URLSearchParams(window.location.search);
  var preview = params.get('preview');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lastFocus = null;

  /* ---- Scouting closed --------------------------------------------------- */
  if (preview === 'closed' || Date.now() > CLOSE_TS) {
    form.hidden = true;
    if (heading.kicker) heading.kicker.hidden = true;
    if (heading.title) heading.title.hidden = true;
    closed.hidden = false;
    return; // no form behavior needed
  }

  /* ---- Validation + submit visual state ---------------------------------- */
  function isValid() {
    return !!(fields.name.value.trim() &&
              fields.team.value &&
              fields.why.value.trim() &&
              fields.consent.checked);
  }

  function refresh() {
    submitBtn.setAttribute('aria-disabled', isValid() ? 'false' : 'true');
    var n = fields.why.value.length;
    counter.textContent = n + '/280';
    counter.classList.toggle('scout__counter--hot', n > 250);
    // Screen-reader counter: announce only on threshold crossings, not
    // every keystroke (the visual counter is aria-hidden).
    var zone = n >= 280 ? 'max' : (n > 250 ? 'hot' : 'ok');
    if (zone !== srZone) {
      srZone = zone;
      if (counterSR) {
        counterSR.textContent =
          zone === 'max' ? 'Character limit reached: 280 of 280.' :
          zone === 'hot' ? (280 - n) + ' characters remaining.' : '';
      }
    }
  }

  function clearError() {
    if (errorEl.textContent) errorEl.textContent = '';
  }

  /* ---- Time-trap ---------------------------------------------------------
     Record when this human FIRST touched the form. form.js sends the elapsed
     ms with the submission; the backend silently drops anything that arrives
     implausibly fast (MIN_FILL_MS / timeTrapSuspect_ in backend/apps-script.gs
     — currently 1.5s, a threshold no human fill can reach).

     Clocked from first interaction, not page load, so a fan who leaves the tab
     open for an hour and then fills it out is never penalised. Not reset by
     closeTakeover(): after "scout another", elapsed just keeps growing, and a
     LARGE value always passes — the safe direction. Capture-phase listeners on
     the form so they fire no matter which control is touched first, and
     `once` so this costs nothing after the first event. */
  var firstTouch = 0;
  ['pointerdown', 'keydown', 'focusin', 'change'].forEach(function (evt) {
    form.addEventListener(evt, function () {
      if (!firstTouch) firstTouch = Date.now();
    }, { capture: true, once: true });
  });

  /* The @ is decoration on the field — strip any typed/pasted @ so handles
     store bare and the board's atHandle() adds exactly one. */
  if (fields.ig) {
    fields.ig.addEventListener('input', function () {
      if (/^@/.test(fields.ig.value)) {
        fields.ig.value = fields.ig.value.replace(/^@+/, '');
      }
    });
  }

  ['name', 'team', 'why', 'pos', 'photo', 'ig'].forEach(function (k) {
    fields[k].addEventListener('input', function () { refresh(); clearError(); });
  });
  fields.consent.addEventListener('change', function () { refresh(); clearError(); });
  refresh();

  /* ---- Player typeahead + team auto-fill ---------------------------------
     Native <datalist> fed by a static snapshot of active NFL players
     (assets/data/players.json, built from Sleeper — see assets/data/README.md).
     Lazy: fetched on FIRST focus of the name field only. Any failure degrades
     silently to today's plain text input — the datalist just stays empty.

     Auto-fill rule (client decision): picking/typing a name that matches
     EXACTLY ONE player fills the Team select — and ONLY while the select is
     still on its empty placeholder. It never overwrites a chosen team
     (including "Idk he's just hot") and NEVER touches Position. Names shared
     by two players (there are several) are ambiguous → no fill. */
  var TEAM_NICK = {
    ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills',
    CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns',
    DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers',
    HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs',
    LAC: 'Chargers', LAR: 'Rams', LV: 'Raiders', MIA: 'Dolphins',
    MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants',
    NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks',
    SF: '49ers', TB: 'Buccaneers', TEN: 'Titans', WAS: 'Commanders'
  };
  var datalist = document.getElementById('nfl-players');
  var playersByName = null; // lowercased name → {team} | {ambiguous:true}
  var playersLoading = false;

  function teamOptionExists(nick) {
    for (var i = 0; i < fields.team.options.length; i++) {
      if (fields.team.options[i].value === nick) return true;
    }
    return false;
  }

  function loadPlayers() {
    if (playersLoading || playersByName || !datalist || !window.fetch) return;
    playersLoading = true;
    fetch('assets/data/players.json')
      .then(function (res) {
        if (!res.ok) throw new Error('players.json ' + res.status);
        return res.json();
      })
      .then(function (list) {
        if (!Array.isArray(list)) throw new Error('bad players.json shape');
        var map = {};
        var frag = document.createDocumentFragment();
        list.forEach(function (p) {
          if (!p || !p.n) return;
          var opt = document.createElement('option');
          opt.value = p.n; // datalist value = what fills the field; name only
          frag.appendChild(opt);
          var key = p.n.toLowerCase();
          if (map[key]) map[key].ambiguous = true;
          else map[key] = { team: p.t, ambiguous: false };
        });
        datalist.appendChild(frag);
        playersByName = map;
        maybeFillTeam();
      })
      .catch(function () { /* silent — field stays a plain text input */ });
  }

  function maybeFillTeam() {
    if (!playersByName) return;
    if (fields.team.value !== '') return; // only fill the empty placeholder
    var hit = playersByName[fields.name.value.trim().toLowerCase()];
    if (!hit || hit.ambiguous) return;
    var nick = TEAM_NICK[hit.team];
    if (nick && teamOptionExists(nick)) {
      fields.team.value = nick;
      refresh();
    }
  }

  fields.name.addEventListener('focus', loadPlayers, { once: true });
  ['input', 'change'].forEach(function (evt) {
    fields.name.addEventListener(evt, maybeFillTeam);
  });

  /* ---- Duplicate soft nudge ----------------------------------------------
     If the typed name is already on the public board (UFStore approved list),
     show a friendly note under the field with a deep link to that card.
     Purely informational: never blocks or nags on submit. */
  var dupeEl = document.getElementById('f-dupe');

  function normName(s) {
    return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /* Must mirror board.js's anchor sanitizer exactly (id="pick-<safe id>"). */
  function anchorId(id) {
    return 'pick-' + String(id).replace(/[^A-Za-z0-9_-]/g, '-');
  }

  var dupeShownFor = null; // anchor href currently rendered ('' = hidden)

  function checkDupe() {
    if (!dupeEl) return;
    var typed = normName(fields.name.value);
    var match = null;
    if (typed && window.UFStore && typeof window.UFStore.getApproved === 'function') {
      var approved = window.UFStore.getApproved();
      for (var i = 0; i < approved.length; i++) {
        if (normName(approved[i].name) === typed) { match = approved[i]; break; }
      }
    }
    if (!match) {
      if (!dupeEl.hidden) { dupeEl.hidden = true; dupeEl.textContent = ''; }
      dupeShownFor = null;
      return;
    }
    /* Same match already rendered → leave the DOM alone. Crucial: clicking
       the link blurs the name field, and blur re-runs this check — rebuilding
       here would detach the <a> mid-click and swallow the navigation. */
    var target = 'board.html#' + anchorId(match.id);
    if (dupeShownFor === target) return;
    dupeShownFor = target;
    // Rebuild via textContent/appendChild only — names are user-sourced.
    dupeEl.textContent = "He's already on the board — ";
    var kiss = document.createElement('a');
    kiss.className = 'scout__dupe-link';
    kiss.href = target;
    kiss.textContent = 'send him a kiss';
    dupeEl.appendChild(kiss);
    dupeEl.appendChild(document.createTextNode(' instead 💋'));
    dupeEl.hidden = false;
  }

  ['input', 'change', 'blur'].forEach(function (evt) {
    fields.name.addEventListener(evt, checkDupe);
  });
  window.addEventListener('ufstore:updated', checkDupe);

  /* ---- Photo upload (compress client-side at select time) ---------------- */
  var PHOTO_MAX_SIDE = 1200;      // longest side after resize
  var PHOTO_JPEG_QUALITY = 0.82;
  var PHOTO_MAX_BYTES = 4 * 1024 * 1024; // ~4MB decoded, post-compression
  var PHOTO_ERROR = "That photo is too big even after we squeezed it. Try a smaller one — Besties HQ doesn't need the RAW file.";
  var photoData = ''; // base64 data-URL of the compressed selection ('' = none)

  function clearPhoto() {
    photoData = '';
    if (photoFile) photoFile.value = '';
    if (photoPreview) photoPreview.hidden = true;
    if (photoThumb) photoThumb.src = '';
    if (photoFilename) photoFilename.textContent = '';
  }

  /** Read `file`, downscale to ≤1200px longest side, export JPEG q.82.
   *  Resolves the data-URL or rejects with a user-safe Error. */
  function compressPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          var scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
          var w = Math.max(1, Math.round(img.naturalWidth * scale));
          var h = Math.max(1, Math.round(img.naturalHeight * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var cctx = canvas.getContext('2d');
          cctx.fillStyle = '#FFFFFF'; // JPEG has no alpha — composite
          cctx.fillRect(0, 0, w, h); // transparent PNGs onto white, not black
          cctx.drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
          // decoded bytes ≈ base64 length × 3/4 — keep under ~4MB so the
          // backend's 5MB decoded ceiling always clears too
          var b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
          if (b64.length * 0.75 > PHOTO_MAX_BYTES) {
            reject(new Error(PHOTO_ERROR));
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

  if (photoFile) {
    photoFile.addEventListener('change', function () {
      clearError();
      var file = photoFile.files && photoFile.files[0];
      if (!file) { clearPhoto(); return; }
      compressPhoto(file)
        .then(function (dataUrl) {
          photoData = dataUrl;
          if (photoThumb) photoThumb.src = dataUrl;
          if (photoFilename) photoFilename.textContent = file.name;
          if (photoPreview) photoPreview.hidden = false;
          refresh();
        })
        .catch(function (err) {
          clearPhoto();
          errorEl.textContent = (err && err.message) || "Couldn't read that photo. Try a JPG or PNG.";
        });
    });
  }
  if (photoRemove) {
    photoRemove.addEventListener('click', function () {
      clearPhoto();
      clearError();
      if (photoFile) photoFile.focus();
    });
  }

  var submitting = false;
  var submitLabel = submitBtn.textContent;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitting) return;
    if (!isValid()) {
      errorEl.textContent = ERROR_MSG;
      return;
    }
    clearError();
    var scoutedName = fields.name.value.trim();
    /* Snapshot everything the trading card needs NOW — closeTakeover() resets
       the form and clears photoData, and the card must survive that. */
    var cardSnapshot = {
      name: scoutedName,
      team: fields.team.value,
      pos: fields.pos.value,
      why: fields.why.value.trim(),
      ig: fields.ig.value,
      pickNum: null,          // still pending — the card renders "PROSPECT №?"
      photo: photoData || ''  // locally compressed data-URL: same-origin safe
    };
    submitting = true;
    submitBtn.setAttribute('aria-disabled', 'true');
    submitBtn.textContent = 'Filing…';

    // Promise.resolve().then(...) handles both adapters: the remote one
    // (store.remote.js) returns a Promise, the local one returns the record
    // synchronously — and any sync throw lands in the catch too.
    Promise.resolve()
      .then(function () {
        return window.UFStore.addSubmission({
          name: fields.name.value,
          team: fields.team.value,
          why: fields.why.value,
          pos: fields.pos.value,
          photo: fields.photo.value,
          photoData: photoData, // '' when no upload; adapters treat as absent
          ig: fields.ig.value,
          hp: fields.hp ? fields.hp.value : '',
          // ms from first interaction to submit. 0 = the form was submitted
          // without a human ever touching it (scripted POST through the page).
          elapsedMs: firstTouch ? (Date.now() - firstTouch) : 0
        });
      })
      .then(function () {
        submitting = false;
        submitBtn.textContent = submitLabel;
        refresh();
        openTakeover(scoutedName, cardSnapshot);
      })
      .catch(function (err) {
        submitting = false;
        submitBtn.textContent = submitLabel;
        refresh();
        errorEl.textContent = (err && err.message) ||
          "Couldn't reach Besties HQ. Check your connection and try again.";
      });
  });

  /* ---- Takeover ----------------------------------------------------------- */
  function openTakeover(name, snapshot) {
    lastScoutedName = name || '';
    lastCardData = snapshot || { name: name || '', pickNum: null };
    confirmLine.textContent = (name || 'Your prospect') +
      ' has been filed with Besties HQ. Grades drop on draft day.';
    shareBtn.textContent = 'Share to story';
    if (cardBtn) resetCardBtn();
    lastFocus = document.activeElement;
    takeover.hidden = false;
    if (!reducedMotion) {
      takeover.classList.add('takeover--enter');
      // force a style flush so the entrance transition actually runs
      void takeover.offsetWidth;
      takeover.classList.remove('takeover--enter');
    }
    document.body.style.overflow = 'hidden';
    // shareBtn is hidden on desktop — focus the first action that's actually there
    var firstAction = focusables()[0];
    if (firstAction) firstAction.focus();
    document.addEventListener('keydown', onKeydown, true);
  }

  function closeTakeover() {
    takeover.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown, true);
    form.reset();
    clearPhoto(); // form.reset() doesn't clear the stashed data-URL/preview
    refresh();
    clearError();
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }

  /** Tabbable actions inside the takeover, hidden ones excluded (the story
   *  share button is display-hidden on desktop). */
  function focusables() {
    return Array.prototype.filter.call(
      takeover.querySelectorAll('button, a[href]'),
      function (node) { return !node.hidden && !node.disabled && node.offsetParent !== null; }
    );
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeTakeover();
      return;
    }
    if (e.key !== 'Tab') return;
    var list = focusables();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* Text-only share — the final fallback if the story graphic can't render. */
  function shareTextOnly() {
    if (navigator.share) {
      navigator.share({ text: SHARE_TEXT }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(SHARE_TEXT).catch(function () {});
    }
    shareBtn.textContent = 'Copied — paste to story';
  }

  var lastScoutedName = '';
  var sharing = false;

  /* Client decision: the share button is mobile-only — desktop browsers'
     file-share support is unreliable, and the story graphic is an Instagram
     flow anyway. Mobile = touch-first pointer + Web Share file support. */
  var isMobileShare = window.matchMedia('(pointer: coarse)').matches &&
    !!(navigator.canShare && navigator.share);
  if (!isMobileShare && shareBtn) {
    shareBtn.hidden = true;
    shareBtn.setAttribute('aria-hidden', 'true');
  }

  shareBtn.addEventListener('click', function () {
    if (sharing) return;
    if (!window.UFStoryCard || !window.UFStoryCard.generate) {
      shareTextOnly();
      return;
    }
    sharing = true;
    shareBtn.textContent = 'Making your graphic…';
    window.UFStoryCard.generate(lastScoutedName)
      .then(function (blob) {
        // Download + caption-copy — used when file-share is unsupported OR the
        // share call fails (desktop browsers often claim support then reject
        // because the user-activation window expired during canvas rendering).
        function downloadCard() {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'share-your-hottie.png';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(SHARE_TEXT).catch(function () {});
          }
          shareBtn.textContent = 'Graphic saved — post it!';
        }
        var file = new File([blob], 'share-your-hottie.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], text: SHARE_TEXT })
            .then(function () { shareBtn.textContent = 'Shared — go post it!'; })
            .catch(function (err) {
              if (err && err.name === 'AbortError') {
                // User closed the share sheet on purpose — don't force a file on them.
                shareBtn.textContent = 'Share to story';
              } else {
                downloadCard();
              }
            });
        }
        downloadCard();
      })
      .catch(function () {
        // Canvas/font failure — keep the old text-only behavior alive.
        shareTextOnly();
      })
      .then(function () { sharing = false; });
  });

  /* ---- Trading card ------------------------------------------------------
     Shown on BOTH desktop and mobile (unlike the story share button):
     mobile gets the share sheet, desktop downloads the PNG. */
  var CARD_LABEL = 'Make my trading card';
  var CARD_FILENAME = 'share-your-hottie-card.png';
  var lastCardData = null;
  var makingCard = false;

  function setCardLabel(text) {
    if (!cardBtn) return;
    cardBtn.textContent = '';
    var glyph = document.createElement('span');
    glyph.className = 'takeover__card-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = '🃏';
    cardBtn.appendChild(glyph);
    cardBtn.appendChild(document.createTextNode(' ' + text));
  }

  function resetCardBtn() {
    makingCard = false;
    cardBtn.setAttribute('aria-disabled', 'false');
    setCardLabel(CARD_LABEL);
  }

  if (cardBtn) {
    cardBtn.addEventListener('click', function () {
      if (makingCard) return;
      if (!window.UFTradingCard || !window.UFTradingCard.generate) {
        setCardLabel("Card generator didn't load — refresh and try again");
        return;
      }
      makingCard = true;
      cardBtn.setAttribute('aria-disabled', 'true');
      setCardLabel('Making your card…');

      window.UFTradingCard.generate(lastCardData || {}, { size: 'feed' })
        .then(function (blob) {
          function downloadCard() {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = CARD_FILENAME;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
            makingCard = false;
            cardBtn.setAttribute('aria-disabled', 'false');
            setCardLabel('Card saved — post it!');
          }
          var file = new File([blob], CARD_FILENAME, { type: 'image/png' });
          if (isMobileShare && navigator.canShare && navigator.canShare({ files: [file] })) {
            return navigator.share({ files: [file], text: SHARE_TEXT })
              .then(function () {
                makingCard = false;
                cardBtn.setAttribute('aria-disabled', 'false');
                setCardLabel('Shared — go post it!');
              })
              .catch(function (err) {
                if (err && err.name === 'AbortError') {
                  resetCardBtn(); // user dismissed the sheet on purpose
                } else {
                  downloadCard();
                }
              });
          }
          downloadCard();
        })
        .catch(function () {
          makingCard = false;
          cardBtn.setAttribute('aria-disabled', 'false');
          setCardLabel("Couldn't make your card — try again");
        });
    });
  }

  againBtn.addEventListener('click', closeTakeover);

  /* Warm the Hottie Board while the visitor is still reading the form page:
     one idle-time refresh fills the shared localStorage cache so board.html
     paints instantly when they click through. */
  var warm = function () {
    if (window.UFStore && typeof window.UFStore.refresh === 'function') window.UFStore.refresh();
  };
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 2500);

  /* ---- Preview hook ------------------------------------------------------- */
  if (preview === 'confirm') {
    openTakeover('');
  }
})();
