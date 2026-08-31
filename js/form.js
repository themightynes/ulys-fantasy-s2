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
  var counter = document.getElementById('f-why-count');
  var counterSR = document.getElementById('f-why-sr');
  var srZone = 'ok'; // 'ok' ≤250 · 'hot' 251–279 · 'max' 280
  var submitBtn = document.getElementById('f-submit');
  var errorEl = document.getElementById('f-error');
  var confirmLine = document.getElementById('takeover-line');
  var shareBtn = document.getElementById('takeover-share');
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
          ig: fields.ig.value,
          hp: fields.hp ? fields.hp.value : ''
        });
      })
      .then(function () {
        submitting = false;
        submitBtn.textContent = submitLabel;
        refresh();
        openTakeover(scoutedName);
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
  function openTakeover(name) {
    confirmLine.textContent = (name || 'Your prospect') +
      ' has been filed with Besties HQ. Grades drop on draft day.';
    shareBtn.textContent = 'Share to story';
    lastFocus = document.activeElement;
    takeover.hidden = false;
    if (!reducedMotion) {
      takeover.classList.add('takeover--enter');
      // force a style flush so the entrance transition actually runs
      void takeover.offsetWidth;
      takeover.classList.remove('takeover--enter');
    }
    document.body.style.overflow = 'hidden';
    shareBtn.focus();
    document.addEventListener('keydown', onKeydown, true);
  }

  function closeTakeover() {
    takeover.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown, true);
    form.reset();
    refresh();
    clearError();
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeTakeover();
      return;
    }
    if (e.key !== 'Tab') return;
    var focusables = takeover.querySelectorAll('button, a[href]');
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  shareBtn.addEventListener('click', function () {
    if (navigator.share) {
      navigator.share({ text: SHARE_TEXT }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(SHARE_TEXT).catch(function () {});
    }
    shareBtn.textContent = 'Copied — paste to story';
  });

  againBtn.addEventListener('click', closeTakeover);

  /* ---- Preview hook ------------------------------------------------------- */
  if (preview === 'confirm') {
    openTakeover('');
  }
})();
