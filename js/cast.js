/* ==========================================================================
   ULY'S FANTASY S2 — cast.js
   Season 1 cast data + render. Bios are Uly's voice VERBATIM from
   references/cast-design.dc.html — never rewrite them (including the
   literal "…" quote marks and curly apostrophes).
   ========================================================================== */
(function () {
  'use strict';

  /* ---- Data (source of truth: references/cast-design.dc.html) ---- */
  var CAST = [
    { name: 'Priscilla', label: 'Finished 1st', champ: true, sticker: 'star',
      bio: '"Priscilla (pronounced PRI-SCIL-LA): Also a villain in Season One! She played a very dirty game and ended up coming in first place, winning her boyfriend, Jeremy, back!"',
      photo: { src: 'assets/img/cast/pricilla.jpg', width: 600, height: 800,
               alt: 'Priscilla, the Season 1 champion, smiling at a rooftop dinner table at dusk.' } },
    { name: 'Uly', label: 'The Head Hottie · Runner-up', sticker: 'xoxo',
      bio: '"Most points, no ring."',
      statLabel: 'Points for — league high', stat: '1,820.72',
      photo: { src: 'assets/img/cast/uly.jpg',
               width: 600, height: 800,
               alt: 'Uly in his pink and cyan ULY’S FANTASY 16 jersey and backwards cap, throwing double peace signs.' } },
    { name: 'Elizabeth', label: 'Finished 3rd', sticker: 'heart',
      bio: '"A black horse, Elizabeth played a very quiet and respectful game and to the surprise of literally everyone, ended up coming in third place."',
      photo: { src: 'assets/img/cast/elizabeth.jpg', width: 600, height: 800,
               alt: 'Elizabeth laughing at a restaurant table.' } },
    { name: 'Tim', label: 'Finished 4th', sticker: 'badge',
      bio: '"Corryn’s Current Husband: I don’t remember his name. Tim maybe? I don’t remember what place he came in. He was loud but didn’t win."',
      photo: { src: 'assets/img/cast/tim.jpg', width: 600, height: 800,
               alt: 'Tim holding up two large tabby cats, one in each hand.' } },
    { name: 'Jeremy', label: 'Finished 5th', sticker: 'heart',
      bio: '"Reluctantly in a relationship with Priscilla, Jeremy helped Uly out throughout the season. In a very sexual and flirtatious way. Does he have a crush on Uly? Most likely."',
      photo: { src: 'assets/img/cast/jeremy.jpg', width: 600, height: 800,
               alt: 'Jeremy smiling at a terrace table with misty mountains behind him.' } },
    { name: 'Carlos', label: 'Finished 6th', sticker: 'star',
      bio: '"Uly’s cousin and secret advisor. Carlos would send Uly reminders every week about swapping out players and helped him strategize."',
      photo: { src: 'assets/img/cast/carlos.jpg', width: 600, height: 800,
               alt: 'Carlos posing outdoors in a blue checked shirt, one hand behind his head.' } },
    { name: 'Franky', label: 'Finished 7th', sticker: 'xoxo',
      bio: '"Uly’s brother and he didn’t make Uly the best man at his wedding which is probably why he did so poorly in Fantasy Football. Karma is a bitch."',
      photo: { src: 'assets/img/cast/franky.jpg', width: 600, height: 800,
               alt: 'Franky grinning over a margherita pizza in a tiled pizzeria.' } },
    { name: 'Corryn', label: 'Finished 8th · The villain', sticker: 'badge',
      bio: '"The villain of Season One. She stole Jalen Hurts and Travis Kelce from Uly during drafting and, in return, Uly turned the entire internet against her."',
      photo: { src: 'assets/img/cast/corryn.jpg', width: 600, height: 800,
               alt: 'Corryn raising a pink cocktail on a string-lit patio.' } },
    { name: 'Jose', label: 'Finished 9th', sticker: 'heart',
      bio: '"Uly’s other brother. Jose was chosen to be the best man instead of Uly which is also the reason why he did so poorly and almost came in last place. Sucks to suck."',
      photo: { src: 'assets/img/cast/jose.jpg', width: 600, height: 800,
               alt: 'Jose smiling at a bar in a red plaid shirt and cap, a pint in front of him.' } },
    { name: "Corryn's Mom", label: 'Finished 10th · The 1-13 season', sticker: 'star',
      bio: '"Why is Corryn’s entire family playing. Corryn’s mom is reported to be Gwyneth Paltrow (allegedly)."',
      statLabel: 'Final record', stat: '1-13',
      /* client decision: the blank slot claims to be Gwyneth; the card does not */
      slotName: 'GWENYTH' }
  ];

  var ROOKIES = [
    { name: 'Hazel', bio: '"Uly’s cousin. New cast member added to Season 2."',
      photo: { src: 'assets/img/cast/hazel.jpg', width: 900, height: 1200,
        alt: 'Hazel — Season 2 rookie cast member' } },
    { name: 'Evelyng', bio: '"Uly’s cousin. New cast member added to Season 2."',
      photo: { src: 'assets/img/cast/evelyng.jpg', width: 900, height: 1200,
        alt: 'Evelyng — Season 2 rookie cast member' } }
  ];

  /* Per-card tilt/tape live in cast.css (.polaroid--t0…t9 / --r0/--r1) so the
     narrow-viewport media query can flatten them — inline styles would win. */
  var SPOTS = ['top:-18px;right:12px', 'top:-20px;left:14px', 'top:-16px;right:16px', 'top:-20px;right:12px',
    'top:-18px;left:12px', 'top:-16px;right:14px', 'top:-20px;left:16px', 'top:-22px;right:12px',
    'top:-16px;left:14px', 'top:-18px;right:16px'];
  var PAPERS = ['polaroid--paper-a', 'polaroid--paper-b', 'polaroid--paper-c', 'polaroid--paper-d'];

  var LADDER_NOTES = {
    0: { text: '🏆 Champion', cls: 'ladder__note--gold' },
    1: { text: '1,820.72 PF · league high', cls: 'ladder__note--cyan' },
    9: { text: '1-13', cls: '' }
  };

  function anchorOf(name) {
    return 'cast-' + name.toLowerCase().replace(/[^a-z]+/g, '-');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var STICKERS = {
    heart: '<span class="sticker sticker--heart" aria-hidden="true"></span>',
    star: '<span class="sticker sticker--star" aria-hidden="true"></span>',
    xoxo: '<span class="sticker sticker--xoxo" aria-hidden="true">XOXO</span>',
    badge: '<span class="sticker sticker--badge" aria-hidden="true">★ CERTIFIED MESSY ★</span>'
  };

  function photoHTML(c) {
    if (c.photo) {
      var p = c.photo;
      return '<div class="polaroid__photo-inner">' +
        '<img class="polaroid__img" src="' + esc(p.src) + '"' +
        (p.srcset
          ? ' srcset="' + esc(p.srcset) + '" sizes="(max-width: 767px) calc(100vw - 96px), 300px"'
          : '') +
        ' width="' + p.width + '" height="' + p.height + '"' +
        /* no decoding="async": Chromium skips rastering async offscreen
           images in captures/prints, leaving blank slots */
        ' loading="lazy" alt="' + esc(p.alt) + '">' +
        '</div>';
    }
    return '<div class="polaroid__photo-inner" aria-hidden="true">' +
      (c.slotName ? '<span class="display polaroid__slot-name">' + esc(c.slotName) + '</span>' : '') +
      '<span class="polaroid__pending">Photo pending · Besties HQ</span>' +
      '</div>';
  }

  function cardHTML(c, i, rookie) {
    var geom = rookie ? 'polaroid--r' + i : 'polaroid--t' + i;
    var paper = rookie ? 'polaroid--rookie' : PAPERS[i % PAPERS.length];
    var id = rookie ? '' : ' id="' + anchorOf(c.name) + '" tabindex="-1"';
    var html = '<article' + id + ' class="polaroid ' + paper + ' ' + geom + '">' +
      '<span class="polaroid__tape" aria-hidden="true"></span>' +
      '<div class="polaroid__paper">' +
      '<div class="polaroid__photo">' + photoHTML(c) + '</div>' +
      '<div class="polaroid__body">' +
      '<div class="polaroid__head">' +
      '<h3 class="display polaroid__name">' + esc(c.name) + '</h3>';
    if (c.champ) html += '<span class="polaroid__champ">🏆 S1 Champion</span>';
    if (rookie) html += '<span class="polaroid__rookie-badge">Rookie</span>';
    html += '</div>' +
      '<p class="polaroid__label">' + (rookie ? 'Season 2 debut' : esc(c.label)) + '</p>' +
      '<p class="polaroid__bio">' + esc(c.bio) + '</p>';
    if (c.stat) {
      html += '<p class="polaroid__stat">' +
        '<span class="polaroid__stat-label">' + esc(c.statLabel) + '</span>' +
        '<span class="polaroid__stat-num">' + esc(c.stat) + '</span></p>';
    }
    html += '</div></div>';
    if (!rookie && STICKERS[c.sticker]) {
      html += '<span class="polaroid__sticker" style="' + SPOTS[i] + '">' + STICKERS[c.sticker] + '</span>';
    }
    html += '</article>';
    return html;
  }

  function ladderHTML(c, i) {
    var gold = i === 0;
    var note = LADDER_NOTES[i];
    var html = '<a class="ladder__row' + (gold ? ' ladder__row--gold' : '') + '" href="#' + anchorOf(c.name) + '">' +
      '<span class="ladder__place' + (gold ? ' ladder__place--gold' : '') + '">' + (i + 1) + '</span>' +
      '<span class="ladder__who">' +
      '<span class="display ladder__name">' + esc(c.name) + '</span>';
    if (note) html += '<span class="ladder__note ' + note.cls + '">' + esc(note.text) + '</span>';
    html += '</span></a>';
    return html;
  }

  /* Keep --header-h synced to the real sticky-header height so anchor jumps
     always clear it (it wraps to two rows on narrow viewports). */
  var header = document.querySelector('.cast-header');
  function setHeaderH() {
    if (header) {
      document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
    }
  }
  setHeaderH();
  window.addEventListener('resize', setHeaderH);
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(setHeaderH); }

  /* Photos are lazy for first paint, then upgraded to eager once the page has
     loaded so scrolling (and full-page captures) never hit a blank slot. */
  window.addEventListener('load', function () {
    var imgs = document.querySelectorAll('.polaroid__img[loading="lazy"]');
    for (var k = 0; k < imgs.length; k++) { imgs[k].loading = 'eager'; }
  });

  document.getElementById('ladder-grid').innerHTML = CAST.map(ladderHTML).join('');
  document.getElementById('cast-grid').innerHTML = CAST.map(function (c, i) { return cardHTML(c, i, false); }).join('');
  document.getElementById('rookie-grid').innerHTML = ROOKIES.map(function (c, i) { return cardHTML(c, i, true); }).join('');
})();
