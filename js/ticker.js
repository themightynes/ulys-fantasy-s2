/* ==========================================================================
   ULY'S FANTASY S2 — ticker.js
   Guarantees the pink ticker crawl is seamless at any viewport width.

   Markup contract (see base.css):
     <div class="ticker" aria-hidden="true">  <!-- decorative: every phrase
          in the crawl also appears in visible page copy, so the whole ticker
          is hidden from the a11y tree (no implicit live-region announcements) -->
       <div class="ticker__track">
         <div class="ticker__group">
           <span class="ticker__item">★ …</span> …
         </div>
       </div>
     </div>

   UFTicker.init(el?) — pads the first .ticker__group with aria-hidden clones
   of its own items until it is wider than the viewport, then appends one
   aria-hidden duplicate group (belt-and-braces given the container is
   already aria-hidden; harmless and keeps the clones inert either way). The
   CSS animation translates the track by -50% for a perfect loop. Auto-runs
   on DOMContentLoaded for every .ticker on the page, and re-pads on
   debounced resize / orientationchange so rotation never leaves a gap.
   ========================================================================== */
(function () {
  'use strict';

  function initOne(ticker) {
    if (ticker.dataset.ufTicker === 'ready') return;
    var track = ticker.querySelector('.ticker__track');
    var group = ticker.querySelector('.ticker__group');
    if (!track || !group || group.children.length === 0) return;

    // Re-init safety: strip clones from a previous pass so the group can
    // shrink as well as grow, then remove the old duplicate group.
    Array.prototype.slice.call(group.querySelectorAll('[data-uf-clone]')).forEach(function (clone) {
      group.removeChild(clone);
    });
    Array.prototype.slice.call(track.children).forEach(function (child) {
      if (child !== group) track.removeChild(child);
    });

    // Pad the visible group until it's at least as wide as its container.
    // Every clone is aria-hidden: only the original items reach the a11y tree.
    var originals = Array.prototype.slice.call(group.children);
    // 1.5x headroom: measured before webfonts settle, Anton is condensed and
    // could otherwise leave the group slightly narrower than the container.
    var containerWidth = Math.max(ticker.clientWidth, window.innerWidth || 0) * 1.5;
    var guard = 0;
    while (group.scrollWidth < containerWidth && guard < 30) {
      originals.forEach(function (item) {
        var clone = item.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('data-uf-clone', '');
        group.appendChild(clone);
      });
      guard++;
    }

    var dupe = group.cloneNode(true);
    dupe.setAttribute('aria-hidden', 'true');
    track.appendChild(dupe);

    ticker.dataset.ufTicker = 'ready';
  }

  function initAll() {
    Array.prototype.slice.call(document.querySelectorAll('.ticker')).forEach(initOne);
  }

  function reinitAll() {
    Array.prototype.slice.call(document.querySelectorAll('.ticker')).forEach(function (ticker) {
      delete ticker.dataset.ufTicker;
      initOne(ticker);
    });
  }

  var resizeTimer = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(reinitAll, 200);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  window.UFTicker = { init: initOne, initAll: initAll, reinitAll: reinitAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
