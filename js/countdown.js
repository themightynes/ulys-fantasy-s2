/* ==========================================================================
   ULY'S FANTASY S2 — countdown.js
   Reusable countdown to draft day + scouting-close check.

     UFCountdown.DRAFT_TS                 // 2026-09-07T12:00:00 local (ms)
     UFCountdown.CLOSE_TS                 // 2026-09-06T23:59:59 local (ms)
     UFCountdown.parts(now?)              // {days,hrs,min,sec, dd,hh,mm,ss, done}
     UFCountdown.isScoutingClosed(now?)   // boolean
     UFCountdown.short(now?)              // "07D 16H 43M 29S"
     UFCountdown.spoken(now?)             // "7 days, 16 hours, 1 minute, 5 seconds"
                                          // (singular-aware, for aria-labels)
     UFCountdown.start(cb, intervalMs?)   // cb(parts) immediately + each tick;
                                          // returns stop() function
   ========================================================================== */
(function () {
  'use strict';

  // String form without timezone offset parses as LOCAL time — intentional.
  var DRAFT_TS = new Date('2026-09-08T01:00:00Z').getTime();
  var CLOSE_TS = new Date('2026-09-06T23:59:59').getTime();

  function pad(n) {
    return String(Math.max(0, n)).padStart(2, '0');
  }

  function parts(now) {
    now = typeof now === 'number' ? now : Date.now();
    var d = Math.max(0, DRAFT_TS - now);
    var days = Math.floor(d / 864e5);
    var hrs = Math.floor(d / 36e5) % 24;
    var min = Math.floor(d / 6e4) % 60;
    var sec = Math.floor(d / 1e3) % 60;
    return {
      days: days, hrs: hrs, min: min, sec: sec,
      dd: pad(days), hh: pad(hrs), mm: pad(min), ss: pad(sec),
      done: d === 0
    };
  }

  window.UFCountdown = {
    DRAFT_TS: DRAFT_TS,
    CLOSE_TS: CLOSE_TS,

    parts: parts,

    /** "07D 16H 43M 29S" — board-header format. */
    short: function (now) {
      var p = parts(now);
      return p.dd + 'D ' + p.hh + 'H ' + p.mm + 'M ' + p.ss + 'S';
    },

    /**
     * Singular-aware spoken form for aria-labels:
     * "7 days, 16 hours, 1 minute, 5 seconds".
     */
    spoken: function (now) {
      var p = parts(now);
      function unit(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
      return unit(p.days, 'day') + ', ' + unit(p.hrs, 'hour') + ', ' +
             unit(p.min, 'minute') + ', ' + unit(p.sec, 'second');
    },

    /** True once scouting has closed (2026-09-06T23:59:59 local). */
    isScoutingClosed: function (now) {
      now = typeof now === 'number' ? now : Date.now();
      return now > CLOSE_TS;
    },

    /**
     * Start ticking. cb receives the parts object immediately and on every
     * tick; ticking stops itself when the countdown hits zero.
     * Returns a stop() function.
     */
    start: function (cb, intervalMs) {
      if (typeof cb !== 'function') return function () {};
      var iv = null;
      function tick() {
        var p = parts();
        cb(p);
        if (p.done && iv !== null) { clearInterval(iv); iv = null; }
      }
      tick();
      iv = setInterval(tick, intervalMs || 1000);
      return function stop() {
        if (iv !== null) { clearInterval(iv); iv = null; }
      };
    }
  };
})();
