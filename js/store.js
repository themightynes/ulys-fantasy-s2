/* ==========================================================================
   ULY'S FANTASY S2 — storage adapter, REMOTE edition (js/store.remote.js)
   Same window.UFStore contract as js/store.js, backed by the deployed
   Google Apps Script Web app (backend/apps-script.gs). To go live, swap
   this file in for js/store.js and paste the deployment URL below
   (see backend/WIRING.md).

   Differences from the local adapter:
     - addSubmission(data) → POSTs to the backend, returns a Promise that
       resolves to the pending record ({...data, id, status:'pending', ts})
       and REJECTS with a friendly Error the form can surface.
     - getApproved() → returns the last-fetched cached array (starts []).
     - getSubmissions() → APPROVED ROWS ONLY (pending/rejected rows never
       leave the Sheet). Do not wire a page to it expecting pending counts —
       e.g. foundation.html's pending tally would always read 0 here.
     - ts is an ISO-8601 STRING everywhere in this adapter (the Sheet stores
       ISO strings); the local store.js uses epoch numbers. Nothing on the
       site consumes ts today — parse with Date.parse() if you ever do.
     - refresh() → fetches approved rows; resolves with them and dispatches
       a 'ufstore:updated' event on window so pages can re-render.
     - addVote(id) → POSTs {action:'vote', id}; resolves {ok:true, votes}
       (votes = the new server count), rejects with a user-safe Error.
       Approved rows carry a numeric `votes` field (default 0).
     - setStatus() → throws; moderation lives in the Google Sheet.
   ========================================================================== */
(function () {
  'use strict';

  var UF_BACKEND_URL = 'https://script.google.com/macros/s/AKfycbw7pPXPWWhn_wwTEnTiqwThPXX64iAXUfcdgE2cj2t_SVfdn81ZWb8TGJhqcWson1zhtQ/exec';

  /* The seeded №1 pick — Uly himself. Identical to js/store.js. */
  var seedPicks = [
    {
      id: 'seed-1',
      name: 'Uly · The Head Hottie',
      team: "Idk he's just hot",
      quote: 'Football isn\'t that hard. The internet\'s favorite tight end.',
      credit: '@uly',
      isCommish: true,
      isCommishPhoto: true,
      photo: 'assets/img/opt/commissioner-800.jpg',
      photo480: 'assets/img/opt/commissioner-480.jpg'
    }
  ];
  seedPicks.forEach(function (p) { Object.freeze(p); });
  Object.freeze(seedPicks);

  /* Last successfully fetched approved rows, oldest first. */
  var CACHE_KEY = 'ufs2.approvedCache.v1';

  /* Stale-while-revalidate: paint the last-seen board instantly, refresh in
     the background. localStorage failures (private mode) degrade silently. */
  var approvedCache = [];
  try {
    var saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    if (Array.isArray(saved)) approvedCache = saved;
  } catch (e) { /* cold start */ }

  /* Errors we intentionally throw are tagged ufSafe: their message can be
     shown to the user. Anything untagged (fetch's own TypeError, JSON parse
     errors, ...) is converted to friendlyError() before it escapes. */
  function friendlyError() {
    var err = new Error("Couldn't reach Besties HQ. Check your connection and try again.");
    err.ufSafe = true;
    return err;
  }

  function safeError(message) {
    var err = new Error(message);
    err.ufSafe = true;
    return err;
  }

  window.UFStore = {
    /** Remote adapter only ever knows approved rows; moderation is in the Sheet. */
    getSubmissions: function () {
      return approvedCache.slice();
    },

    /**
     * File a new scouting report. POST as text/plain (a plain string body,
     * no custom headers) so the Apps Script call needs no CORS preflight.
     * Returns a Promise resolving to the pending record; rejects with an
     * Error whose message is safe to show the user.
     */
    addSubmission: function (data) {
      data = data || {};
      var payload = {
        name: String(data.name || '').trim(),
        team: String(data.team || '').trim(),
        why: String(data.why || '').trim(),
        pos: String(data.pos || '').trim(),
        photo: String(data.photo || '').trim(),
        // Optional base64 data-URL from the file upload; the backend saves
        // it to Drive and writes the Drive thumbnail URL into the photo
        // column (overriding any pasted link).
        photoData: String(data.photoData || ''),
        ig: String(data.ig || '').trim(),
        hp: String(data.hp || ''),
        // v6 time-trap: ms between the user's first touch of the form and
        // submit. The backend silently drops sub-3s submissions. Sent as a
        // number; omitted entirely when the caller didn't supply one, because
        // the backend treats "absent" as human (see timeTrapSuspect_).
        elapsedMs: Number(data.elapsedMs)
      };
      if (!isFinite(payload.elapsedMs)) delete payload.elapsedMs;
      return fetch(UF_BACKEND_URL, {
        method: 'POST',
        body: JSON.stringify(payload), // string body → text/plain, simple request
        redirect: 'follow'
      })
        .then(function (res) {
          if (!res.ok) throw friendlyError();
          return res.json();
        })
        .then(function (out) {
          if (!out || out.ok !== true) {
            throw (out && out.error) ? safeError(String(out.error)) : friendlyError();
          }
          payload.id = out.id;
          payload.status = 'pending';
          payload.ts = new Date().toISOString(); // ISO string, like refresh() rows
          delete payload.hp;
          delete payload.elapsedMs; // transport-only signals never enter the record
          delete payload.photoData; // the record travels light — Drive has the bytes
          return payload;
        })
        .catch(function (err) {
          // Only user-safe messages escape; raw fetch/parse errors become
          // the friendly Besties HQ line.
          throw (err && err.ufSafe) ? err : friendlyError();
        });
    },

    /**
     * Send a kiss (+1 vote) to an approved submission. Same text/plain
     * no-preflight POST pattern as addSubmission. Resolves {ok:true, votes}
     * with the authoritative server count; rejects with a user-safe Error
     * (unknown id, not approved, network down, or an old deployed backend
     * that predates voting — its submission validator rejects the body).
     * On success the cached row is updated and 'ufstore:updated' fires so
     * every later render sees the fresh count.
     */
    addVote: function (id) {
      id = String(id || '').trim();
      return fetch(UF_BACKEND_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'vote', id: id }), // string body → text/plain, simple request
        redirect: 'follow'
      })
        .then(function (res) {
          if (!res.ok) throw friendlyError();
          return res.json();
        })
        .then(function (out) {
          if (!out || out.ok !== true) {
            throw (out && out.error) ? safeError(String(out.error)) : friendlyError();
          }
          var votes = Number(out.votes) || 0;
          for (var i = 0; i < approvedCache.length; i++) {
            if (approvedCache[i].id === id) { approvedCache[i].votes = votes; break; }
          }
          try {
            window.dispatchEvent(new CustomEvent('ufstore:updated', {
              detail: { approved: approvedCache.slice() }
            }));
          } catch (e) { /* event construction never blocks the data path */ }
          return { ok: true, votes: votes };
        })
        .catch(function (err) {
          throw (err && err.ufSafe) ? err : friendlyError();
        });
    },

    /** v5: fetch an approved row's uploaded photo as a data-URL (canvas-safe).
     *  Resolves null when there's no uploaded photo or on any failure. */
    getPhotoData: function (id) {
      id = String(id || '').trim();
      if (!id) return Promise.resolve(null);
      return fetch(UF_BACKEND_URL + '?action=photoData&id=' + encodeURIComponent(id), { redirect: 'follow' })
        .then(function (res) { return res.json(); })
        .then(function (out) {
          if (out && out.ok === true && out.data) {
            return 'data:' + (out.mime || 'image/jpeg') + ';base64,' + out.data;
          }
          return null;
        })
        .catch(function () { return null; });
    },

    /** Moderation lives in the Google Sheet — not available from the site. */
    setStatus: function () {
      throw new Error('setStatus is not available: moderate in the Google Sheet (see backend/WIRING.md).');
    },

    /** Approved submissions, oldest first — from the last refresh() (starts []). */
    getApproved: function () {
      return approvedCache.slice();
    },

    /**
     * Fetch approved rows from the backend. Resolves with the fresh array,
     * updates the cache, and dispatches 'ufstore:updated' on window.
     * On network failure it resolves with the stale cache (no event).
     */
    refresh: function () {
      // _=timestamp busts Safari's HTTP cache of this GET (server work is
      // still bounded by the backend's own 30s CacheService window).
      return fetch(UF_BACKEND_URL + '?action=approved&_=' + Date.now(), { redirect: 'follow', cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw friendlyError();
          return res.json();
        })
        .then(function (rows) {
          // A non-array body (e.g. {ok:false,error}) is a failure, not an
          // empty board — never wipe the cache over it.
          if (!Array.isArray(rows)) throw friendlyError();
          approvedCache = rows.map(function (r) {
            r = r || {};
            r.status = 'approved'; // keep the UFStore record contract
            r.votes = Number(r.votes) || 0; // old backends send no votes field
            return r;
          });
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(approvedCache)); } catch (e) { /* full/private */ }
          try {
            window.dispatchEvent(new CustomEvent('ufstore:updated', {
              detail: { approved: approvedCache.slice() }
            }));
          } catch (e) { /* event construction never blocks the data path */ }
          return approvedCache.slice();
        })
        .catch(function () {
          // Stale-but-rendered beats a broken board. Never rejects (board.js
          // calls this bare); pages may listen for 'ufstore:error' to show a
          // degraded-state hint.
          try {
            window.dispatchEvent(new CustomEvent('ufstore:error'));
          } catch (e) { /* ignore */ }
          return approvedCache.slice();
        });
    },

    seedPicks: seedPicks
  };
})();
