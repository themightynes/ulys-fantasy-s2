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
  var SHARE_TEXT = "I just scouted a Current Hottie for Uly's Fantasy S2. Draft day is Mon Sep 7. 💋 SUBMIT A HOTTIE";

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

  ['name', 'team', 'why', 'pos', 'photo', 'ig'].forEach(function (k) {
    fields[k].addEventListener('input', function () { refresh(); clearError(); });
  });
  fields.consent.addEventListener('change', function () { refresh(); clearError(); });
  refresh();

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
          hp: fields.hp ? fields.hp.value : ''
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

  /* ---- Preview hook ------------------------------------------------------- */
  if (preview === 'confirm') {
    openTakeover('');
  }
})();
