/* Языки, маршруты, панель биографии, страницы и просмотр документов. */
(function () {
  'use strict';

  var LANGS = [['ru', 'RU'], ['uk', 'UA'], ['en', 'EN'], ['de', 'DE']];
  var CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11 8.5 2.5Q12 3.6 15.5 2.5ZM13 12 21.5 8.5Q20.4 12 21.5 15.5ZM12 13 15.5 21.5Q12 20.4 8.5 21.5ZM11 12 2.5 15.5Q3.6 12 2.5 8.5Z"/></svg>';

  var data, texts = {}, lang = 'ru', byId = {}, docById = {}, extra = {}, tree = null, layout = null, route = null, treeShown = false, lastFocus = null;
  var $ = function (id) { return document.getElementById(id); };

  /* Версия сайта для сброса кэша: её проставляет tools/update-bundle.bat */
  var VERSION = (function () {
    var m = document.querySelector('meta[name="app-version"]');
    var v = (m && m.getAttribute('content')) || window.APP_VERSION || '';
    return v === 'dev' ? '' : v;
  })();
  function vurl(u) {
    if (!VERSION || !u || /^(?:[a-z]+:|\/\/)/i.test(u)) return u;
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(VERSION);
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    }).replace(/№ /g, '№ ');
  }
  function dict() { return texts[lang] || texts.ru; }
  function ui(key) { return dict().ui[key] || texts.ru.ui[key] || key; }
  function section(key) { return dict()[key] || texts.ru[key]; }

  function person(id) {
    var p = byId[id], base = texts.ru.people[id] || {}, local = dict().people[id] || {};
    var merged = Object.assign({}, base, local);
    if (p.living) merged = { name: merged.name, role: merged.role };
    return merged;
  }
  function original(id) {
    if ((lang !== 'en' && lang !== 'de') || byId[id].placeholderName) return '';
    return (texts.ru.people[id] || {}).name || '';
  }
  function docText(id) { return Object.assign({}, texts.ru.docs[id], dict().docs[id]); }

  function load() {
    function fromBundle() {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = vurl('data/bundle.js');
        s.onload = function () { resolve(window.SITE_BUNDLE); };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    if (location.protocol === 'file:') return fromBundle();
    function json(u) { return fetch(vurl(u), { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
    return Promise.all([json('data/people.json')].concat(LANGS.map(function (l) { return json('i18n/' + l[0] + '.json'); })))
      .then(function (all) {
        var i18n = {};
        LANGS.forEach(function (l, i) { i18n[l[0]] = all[i + 1]; });
        return { data: all[0], i18n: i18n };
      })
      .catch(fromBundle);
  }

  function pickLanguage() {
    var saved = store('lang');
    if (saved && texts[saved]) return saved;
    var list = navigator.languages || [navigator.language || 'ru'];
    for (var i = 0; i < list.length; i++) {
      var code = String(list[i]).slice(0, 2).toLowerCase();
      if (texts[code]) return code;
    }
    return 'en';
  }

  function chrome() {
    document.documentElement.lang = lang;
    document.title = dict().meta.title;
    $('brand-title').textContent = dict().meta.title;
    $('brand-sub').textContent = dict().meta.subtitle;
    $('theme-btn').title = ui('theme');
    $('theme-btn').setAttribute('aria-label', ui('theme'));
    $('langs').setAttribute('aria-label', ui('language'));
    $('langs').innerHTML = LANGS.map(function (l) {
      return '<button type="button" data-lang="' + l[0] + '" aria-pressed="' + (l[0] === lang) + '">' + l[1] + '</button>';
    }).join('');
    var items = [['tree', '#/tree'], ['porfiry', '#/story/porfiry'], ['daniil', '#/story/daniil'], ['zaliman', '#/zaliman'], ['gerb', '#/gerb'], ['facts', '#/facts'], ['sources', '#/sources']];
    $('nav').innerHTML = items.map(function (n) {
      return '<a data-nav="' + n[0] + '" href="' + n[1] + '">' + esc(ui('nav_' + n[0])) + '</a>';
    }).join('');
    document.querySelector('[data-lb=close]').setAttribute('aria-label', ui('close'));
    document.querySelector('[data-lb=in]').setAttribute('aria-label', ui('zoom_in'));
    document.querySelector('[data-lb=out]').setAttribute('aria-label', ui('zoom_out'));
    document.querySelector('[data-lb=prev]').setAttribute('aria-label', ui('prev'));
    document.querySelector('[data-lb=next]').setAttribute('aria-label', ui('next'));
  }

  function parseRoute() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var name = parts[0] || 'tree';
    if (name === 'person' && byId[parts[1]]) return { view: 'tree', person: parts[1] };
    if (name === 'story' && section('stories')[parts[1]]) return { view: 'story', story: parts[1] };
    if (['zaliman', 'gerb', 'facts', 'sources'].indexOf(name) >= 0) return { view: name };
    return { view: 'tree' };
  }

  function render(force) {
    var next = parseRoute();
    var sameView = route && route.view === next.view && route.story === next.story;
    route = next;
    document.body.classList.toggle('view-tree', route.view === 'tree');
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      var key = route.view === 'story' ? route.story : route.view;
      a.classList.toggle('active', a.getAttribute('data-nav') === key);
    });
    var nav = $('nav'), act = nav.querySelector('.active');
    if (act && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = act.offsetLeft - (nav.clientWidth - act.offsetWidth) / 2;
    if (force || !sameView) {
      if (route.view === 'tree') renderTree();
      else {
        treeShown = false;
        tree = null;
        $('view').innerHTML = route.view === 'story' ? storyPage(route.story) : route.view === 'zaliman' ? zalimanPage() : route.view === 'gerb' ? gerbPage() : route.view === 'facts' ? factsPage() : sourcesPage();
        bindImages($('view'));
        window.scrollTo(0, 0);
      }
    }
    if (route.view === 'tree') { renderPanel(route.person); if (tree) tree.select(route.person); }
    else renderPanel(null);
  }

  function statusPill(s) {
    return '<span class="status-pill"><i class="dot ' + s + '"></i>' + esc(section('status')[s]) + '</span>';
  }
  function quoteHtml(q) {
    return '<div class="quote">«' + esc(q.q) + '»' + (q.tr ? '<span class="tr">' + esc(ui('translation')) + ': ' + esc(q.tr) + '</span>' : '') + '</div>';
  }

  function renderCard(id, el) {
    var p = byId[id], t = person(id), orig = original(id);
    el.className = 'card' + (id === data.root ? ' root' : '') + (p.story ? ' featured' : '');
    el.style.setProperty('--line', 'var(--l-' + p.line + ')');
    var meta = [t.years, t.place].filter(Boolean).join(' · ');
    el.innerHTML =
      (p.status && !p.living ? '<i class="dot c-dot ' + p.status + '" title="' + esc(section('status')[p.status]) + '"></i>' : '') +
      '<span class="c-name">' + esc(t.name) + '</span>' +
      (orig ? '<span class="c-orig">(' + esc(orig) + ')</span>' : '') +
      (meta ? '<span class="c-meta">' + esc(meta) + '</span>' : '') +
      (t.role ? '<span class="c-role">' + esc(t.role) + '</span>' : '');
  }

  function renderTree() {
    var wrap = document.createElement('div');
    wrap.className = 'tree-wrap';
    var lines = data.lines.map(function (l) {
      return '<span class="legend-item"><i class="swatch" style="--line:var(--l-' + l + ')"></i>' + esc(section('lines')[l]) + '</span>';
    }).join('');
    var statuses = ['confirmed', 'family', 'probable'].map(function (s) {
      return '<span class="legend-item"><i class="dot ' + s + '"></i>' + esc(section('status')[s]) + '</span>';
    }).join('');
    var open = window.innerWidth > 760 ? ' open' : '';
    wrap.innerHTML =
      '<div class="tree-hint">' + esc(ui('tree_hint')) + '</div>' +
      '<details class="legend"' + open + '><summary>' + esc(ui('legend_lines')) + ' · ' + esc(ui('legend_status')) + '</summary><div class="legend-body">' +
      '<div class="legend-lines">' + lines + '</div><h3>' + esc(ui('legend_status')) + '</h3>' + statuses +
      '<span class="legend-note">' + esc(ui('legend_dashed')) + '</span></div></details>' +
      '<div class="tree-tools">' +
      '<button type="button" data-tree="in" aria-label="' + esc(ui('zoom_in')) + '" title="' + esc(ui('zoom_in')) + '">+</button>' +
      '<button type="button" data-tree="out" aria-label="' + esc(ui('zoom_out')) + '" title="' + esc(ui('zoom_out')) + '">−</button>' +
      '<button type="button" data-tree="fit" aria-label="' + esc(ui('fit')) + '" title="' + esc(ui('fit')) + '"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>' +
      '</div>';
    var view = $('view');
    view.innerHTML = '';
    view.appendChild(wrap);
    tree = FamilyTree.mount(wrap, layout, renderCard, function (id) { location.hash = '#/person/' + id; });
    tree.refresh();
    tree.initial(data.root);
    treeShown = true;
    wrap.querySelector('.tree-tools').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tree]');
      if (!b) return;
      var a = b.getAttribute('data-tree');
      if (a === 'fit') tree.fit(); else tree.zoom(a === 'in' ? 1.3 : 1 / 1.3);
    });
  }

  function docFigure(id, list) {
    var d = docById[id], t = docText(id), pos = list.indexOf(id);
    return '<figure class="doc"><button type="button" class="doc-thumb" data-doc="' + id + '" data-list="' + list.join(',') + '" data-pos="' + pos + '" aria-label="' + esc(t.title) + '">' +
      '<img src="' + esc(vurl(d.file)) + '" alt="' + esc(t.title) + '" loading="lazy">' +
      '<span class="doc-stub">' + CROSS + '<span>' + esc(ui('doc_pending')) + '</span><code>' + esc(d.file.replace('docs/', '')) + '</code></span>' +
      '</button><figcaption><b>' + esc(t.title) + '</b><span>' + esc(t.shelfmark) + '</span></figcaption></figure>';
  }
  function bindImages(root) {
    root.querySelectorAll('.doc-thumb img').forEach(function (img) {
      function miss() { img.closest('.doc').classList.add('missing'); }
      if (img.complete && !img.naturalWidth) miss();
      img.addEventListener('error', miss);
    });
    root.querySelectorAll('.portrait-thumb img').forEach(function (img) {
      function miss() {
        var fig = img.closest('.portrait'), btn = fig.querySelector('.portrait-thumb');
        fig.classList.add('missing');
        btn.disabled = true;
        btn.title = ui('facts_portrait_pending');
      }
      if (img.complete && !img.naturalWidth) miss();
      img.addEventListener('error', miss);
    });
  }

  function relatives(id) {
    var p = byId[id], out = [], seen = {};
    function add(rid, label) {
      if (!rid || !byId[rid] || seen[rid]) return;
      seen[rid] = 1;
      out.push({ id: rid, label: label });
    }
    add(p.father, ui('rel_father'));
    add(p.mother, ui('rel_mother'));
    (p.possibleFathers || []).forEach(function (r) { add(r, ui('rel_possible')); });
    add(p.spouse, ui('rel_spouse'));
    data.people.forEach(function (o) {
      if (o.spouse === id) add(o.id, ui('rel_spouse'));
      if (o.father === id && o.mother) add(o.mother, ui('rel_spouse'));
      if (o.mother === id && o.father) add(o.father, ui('rel_spouse'));
    });
    data.people.forEach(function (o) {
      if (o.father === id || o.mother === id) add(o.id, ui('rel_child'));
      if ((o.possibleFathers || []).indexOf(id) >= 0) add(o.id, ui('rel_child') + ' ?');
    });
    data.people.forEach(function (o) {
      if (o.id !== id && ((p.father && o.father === p.father) || (p.mother && o.mother === p.mother))) add(o.id, ui('rel_sibling'));
    });
    return out;
  }
  function chip(id, label) {
    return '<a class="chip" style="--line:var(--l-' + byId[id].line + ')" href="#/person/' + id + '"><b>' + esc(person(id).name) + '</b>' + (label ? '<small>' + esc(label) + '</small>' : '') + '</a>';
  }

  function factHtml(f) {
    if (typeof f === 'string') return '<li><i class="tick"></i>' + esc(f) + '</li>';
    var mark = f.s ? '<i class="dot ' + f.s + '" title="' + esc(section('status')[f.s]) + '"></i>' : '<i class="tick"></i>';
    return '<li>' + mark + esc(f.t || '') + (f.q ? quoteHtml(f) : '') + '</li>';
  }

  function renderPanel(id) {
    var panel = $('panel'), back = $('panel-backdrop');
    if (!id) {
      if (panel.classList.contains('open') && lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      back.hidden = true;
      return;
    }
    var p = byId[id], t = person(id), orig = original(id), body = '';
    var meta = [t.years, t.place].filter(Boolean).join(' · ');
    if (p.living) {
      body = '<p class="muted">' + esc(ui('living_note')) + '</p>';
    } else {
      body += '<section>' + statusPill(p.status) + '</section>';
      if (t.bio) body += '<section><h3>' + esc(ui('bio')) + '</h3><p>' + esc(t.bio) + '</p></section>';
      if (t.facts && t.facts.length) body += '<section><h3>' + esc(ui('facts')) + '</h3><ul class="facts">' + t.facts.map(factHtml).join('') + '</ul></section>';
      var docs = p.docs || [];
      body += '<section><h3>' + esc(ui('evidence')) + '</h3>' +
        (docs.length ? '<div class="gallery">' + docs.map(function (d) { return docFigure(d, docs); }).join('') + '</div>' : '<p class="muted">' + esc(ui('no_docs')) + '</p>') + '</section>';
      var rel = relatives(id);
      if (rel.length) body += '<section><h3>' + esc(ui('relatives')) + '</h3><div class="chips">' + rel.map(function (r) { return chip(r.id, r.label); }).join('') + '</div></section>';
      if (p.story) body += '<a class="story-link" href="#/story/' + p.story + '">' + esc(ui('open_story')) + '</a>';
    }
    if (!panel.classList.contains('open')) lastFocus = document.activeElement;
    panel.innerHTML =
      '<div class="panel-head" style="--line:var(--l-' + p.line + ')">' +
      '<button type="button" class="panel-close" data-close aria-label="' + esc(ui('close')) + '">×</button>' +
      '<h2>' + esc(t.name) + '</h2>' + (orig ? '<div class="panel-orig">(' + esc(orig) + ')</div>' : '') +
      (t.role ? '<div class="panel-role">' + esc(t.role) + '</div>' : '') +
      (meta ? '<div class="panel-meta">' + esc(meta) + '</div>' : '') +
      '</div><div class="panel-body">' + body + '</div>';
    bindImages(panel);
    panel.scrollTop = 0;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    back.hidden = window.innerWidth > 760;
    panel.focus({ preventScroll: true });
  }

  function orn() { return '<div class="orn">' + CROSS + '</div>'; }
  function footer() { return '<footer class="site-footer">' + esc(ui('footer')) + '</footer>'; }

  function storyPage(key) {
    var s = section('stories')[key];
    var hero = s.sections.filter(function (x) { return x.doc; }).map(function (x) { return x.doc; });
    var ownerId = Object.keys(byId).filter(function (id) { return byId[id].story === key; })[0];
    var orig = ownerId ? original(ownerId) : '';
    var all = (s.photo ? [s.photo] : []).concat(hero);
    var html = '<article><header class="story-hero">' +
      '<div class="story-kicker">' + esc(s.kicker) + '</div><h1>' + esc(s.title) + '</h1>' +
      (orig ? '<div class="story-orig">(' + esc(orig) + ')</div>' : '') +
      '<div class="story-sub">' + esc(s.subtitle) + '</div>' +
      (s.photo ? '<div class="story-photo">' + docFigure(s.photo, all) + '</div>' : '') +
      '<div class="plaque">' + s.plaque.map(function (p) { return '<div><small>' + esc(p.k) + '</small><b>' + esc(p.v) + '</b></div>'; }).join('') + '</div>' +
      '</header><ol class="timeline">';
    s.sections.forEach(function (x) {
      var legend = x.kind === 'legend';
      html += '<li class="exhibit' + (legend ? ' legend-ex' : '') + '"><div class="exhibit-year">' + esc(x.year) + '</div>' +
        '<div class="exhibit-card' + (x.doc ? ' has-doc' : '') + '"><div><h2>' + esc(x.heading) + '</h2><p>' + esc(x.text) + '</p>' +
        (x.quote ? quoteHtml(x.quote) : '') + (legend ? statusPill('family') : '') + '</div>' +
        (x.doc ? '<div class="exhibit-doc"><span class="doc-label">' + esc(ui('exhibit')) + '</span>' + docFigure(x.doc, all) + '</div>' : '') +
        '</div></li>';
    });
    html += '</ol>';
    if (s.ladder) {
      html += '<h2 class="section-title">' + esc(s.ladder_title) + '</h2><div class="ladder">' + s.ladder.map(function (r) { return '<div>' + esc(r) + '</div>'; }).join('') + '</div>';
    }
    html += '<h2 class="section-title">' + esc(ui('family_section')) + '</h2><div class="story-family"><div class="chips">' +
      s.family.map(function (id) { return chip(id, person(id).role); }).join('') + '</div></div></article>' + footer();
    return html;
  }

  function pageHead(title, sub) {
    return '<header class="page-head"><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + orn() + '</header>';
  }

  function zalimanPage() {
    var z = section('zaliman');
    return '<div class="page">' + pageHead(z.title, z.subtitle) +
      '<div class="stat-grid">' + z.facts.map(function (f) { return '<div class="stat"><small>' + esc(f.k) + '</small><b>' + esc(f.v) + '</b></div>'; }).join('') + '</div>' +
      '<div class="prose">' + z.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' +
      '<h2 class="section-title">' + esc(z.estate_title) + '</h2><div class="panel-box"><p>' + esc(z.estate_text) + '</p>' + quoteHtml(z.estate_quote) + '</div>' +
      '<h2 class="section-title">' + esc(z.dynasty_title) + '</h2><div class="dynasty">' + z.dynasty.map(function (d) { return '<div><b>' + esc(d.k) + '</b><span>' + esc(d.v) + '</span></div>'; }).join('') + '</div>' +
      '</div>' + footer();
  }

  function gerbPage() {
    var g = section('gerb');
    return '<div class="page">' + pageHead(g.title) +
      '<div class="gerb-grid"><div>' + docFigure('gerb', ['gerb']) +
      '<p class="motto"><b>' + esc(g.motto) + '</b><span>«' + esc(g.motto_translation) + '»</span></p></div>' +
      '<div><h2 class="section-title" style="margin-top:0;text-align:left">' + esc(g.symbols_title) + '</h2><dl class="defs">' +
      g.symbols.map(function (s) { return '<div><dt>' + esc(s.k) + '</dt><dd>' + esc(s.v) + '</dd></div>'; }).join('') +
      '</dl></div></div></div>' + footer();
  }

  function sourcesPage() {
    var s = section('sources'), all = data.documents.map(function (d) { return d.id; });
    return '<div class="page">' + pageHead(s.title, s.subtitle) +
      '<h2 class="section-title">' + esc(s.list_title) + '</h2><dl class="defs prose">' +
      s.list.map(function (x) { return '<div><dt>' + esc(x.k) + '</dt><dd>' + esc(x.v) + '</dd></div>'; }).join('') + '</dl>' +
      '<h2 class="section-title">' + esc(s.gallery_title) + '</h2><div class="gallery">' + all.map(function (id) { return docFigure(id, all); }).join('') + '</div>' +
      '<p class="namesake"><b>' + esc(s.namesake_title) + '.</b>' + esc(s.namesake) + '</p>' +
      '</div>' + footer();
  }

  /* Интересные факты */
  function factsSection() { return section('facts_page') || {}; }
  function factText(id) {
    var base = (texts.ru.facts_page || {}).items || {}, local = (dict().facts_page || {}).items || {};
    return Object.assign({}, base[id], local[id]);
  }
  function portraitText(id) {
    var base = (texts.ru.facts_page || {}).portraits || {}, local = (dict().facts_page || {}).portraits || {};
    return Object.assign({}, base[id], local[id]);
  }
  function initials(t) {
    if (t.initials) return t.initials;
    return String(t.name || '?').split(/\s+/).filter(Boolean).map(function (w) { return w.charAt(0); }).slice(0, 2).join('').toUpperCase();
  }
  function link(url, text) {
    return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + '</a>' : esc(text);
  }
  function imageCredit(im, t) {
    var author = t.image_author || im.author || ui('facts_unknown_author');
    var lic = im.license === 'PD' ? ui('facts_pd') : im.license;
    return esc(ui('facts_image')) + ': ' + esc(author) + ' · ' + link(im.licenseUrl, lic) + ' · ' + link(im.source, 'Wikimedia Commons') +
      (im.resized ? ' · ' + esc(ui('facts_resized')) : '');
  }
  function factFigure(f, t, list) {
    var im = f.image;
    if (im.doc) return docByIdSafe(im.doc) ? docFigure(im.doc, list) : '';
    var key = 'fact:' + f.id, pos = list.indexOf(key);
    return '<figure class="doc"><button type="button" class="doc-thumb" data-doc="' + key + '" data-list="' + list.join(',') + '" data-pos="' + pos + '" aria-label="' + esc(t.image || t.title) + '">' +
      '<img src="' + esc(vurl(im.file)) + '" alt="' + esc(t.image || t.title) + '" loading="lazy">' +
      '<span class="doc-stub">' + CROSS + '<span>' + esc(ui('doc_pending')) + '</span><code>' + esc(im.file.replace('docs/', '')) + '</code></span>' +
      '</button><figcaption><b>' + esc(t.image || t.title) + '</b><span class="credit">' + imageCredit(im, t) + '</span></figcaption></figure>';
  }
  function docByIdSafe(id) { return !!docById[id]; }
  function portraitHtml(pr) {
    var t = portraitText(pr.id), key = 'portrait:' + pr.id;
    return '<figure class="portrait"><button type="button" class="portrait-thumb" data-doc="' + key + '" data-list="' + key + '" data-pos="0" aria-label="' + esc(t.name) + '">' +
      '<img src="' + esc(vurl(pr.file)) + '" alt="' + esc(t.name) + '" loading="lazy">' +
      '<span class="portrait-stub" aria-hidden="true">' + esc(initials(t)) + '</span></button>' +
      '<figcaption><b>' + esc(t.name) + '</b>' + (t.years ? '<span>' + esc(t.years) + '</span>' : '') + (t.note ? '<small>' + esc(t.note) + '</small>' : '') + '</figcaption></figure>';
  }
  function factsPage() {
    var s = factsSection(), facts = data.facts || [], list = [];
    extra = {};
    facts.forEach(function (f) {
      var t = factText(f.id);
      if (f.image && f.image.doc && docById[f.image.doc]) list.push(f.image.doc);
      else if (f.image && f.image.file) {
        list.push('fact:' + f.id);
        extra['fact:' + f.id] = { file: f.image.file, title: t.image || t.title, sub: imageCredit(f.image, t) };
      }
      (f.portraits || []).forEach(function (pr) {
        var pt = portraitText(pr.id);
        extra['portrait:' + pr.id] = { file: pr.file, title: pt.name + (pt.years ? ' (' + pt.years + ')' : ''),
          sub: esc([pt.note, pt.credit].filter(Boolean).join(' · ')) };
      });
    });
    var legend = ['confirmed', 'family', 'probable'].map(statusPill).join('');
    var html = '<div class="page facts-page">' + pageHead(s.title, s.subtitle) +
      '<div class="facts-legend" aria-label="' + esc(ui('legend_status')) + '">' + legend + '</div><ol class="fact-list">';
    facts.forEach(function (f, i) {
      var t = factText(f.id), fig = f.image ? factFigure(f, t, list) : '', prs = f.portraits || [];
      html += '<li class="fact-card' + (fig ? ' has-img' : '') + (f.status === 'family' ? ' legend-ex' : '') + '" id="fact-' + f.id + '"><div class="fact-body">' +
        '<span class="doc-label">' + esc(ui('exhibit')) + ' ' + (i + 1) + '</span>' +
        '<h2>' + esc(t.title) + '</h2><p>' + esc(t.text) + '</p>' +
        statusPill(f.status) +
        (t.source ? '<p class="fact-source"><b>' + esc(ui('facts_source')) + ':</b> ' + esc(t.source) + '</p>' : '') +
        (prs.length ? '<div class="portraits">' + prs.map(portraitHtml).join('') + '</div>' : '') +
        '</div>' + (fig ? '<div class="fact-fig">' + fig + '</div>' : '') + '</li>';
    });
    html += '</ol>' + (s.note ? '<p class="namesake">' + esc(s.note) + '</p>' : '') + '</div>' + footer();
    return html;
  }

  /* Просмотр документа на весь экран */
  var lb = { list: [], i: 0, s: 1, x: 0, y: 0, ok: false, opener: null };
  function lbTransform() {
    $('lb-img').style.transform = 'translate(' + lb.x + 'px,' + lb.y + 'px) scale(' + lb.s + ')';
  }
  function lbZoom(f) {
    lb.s = Math.min(6, Math.max(1, lb.s * f));
    if (lb.s === 1) { lb.x = 0; lb.y = 0; }
    lbTransform();
  }
  function lbItem(id) {
    if (extra[id]) return extra[id];
    var d = docById[id] || { file: '' }, t = docText(id);
    return { file: d.file, title: t.title, sub: esc(t.shelfmark) };
  }
  function lbShow() {
    var id = lb.list[lb.i], it = lbItem(id), img = $('lb-img'), stub = $('lb-stub');
    lb.s = 1; lb.x = 0; lb.y = 0; lb.ok = true;
    lbTransform();
    img.hidden = false;
    stub.hidden = true;
    img.onerror = function () {
      lb.ok = false;
      img.hidden = true;
      stub.hidden = false;
      stub.innerHTML = CROSS + '<p>' + esc(ui('doc_pending')) + '</p><code>' + esc(it.file.replace('docs/', '')) + '</code>';
    };
    img.src = vurl(it.file);
    img.alt = it.title;
    $('lb-count').textContent = (lb.i + 1) + ' / ' + lb.list.length;
    $('lb-caption').innerHTML = esc(it.title) + (it.sub ? '<span>' + it.sub + '</span>' : '');
    var many = lb.list.length > 1;
    document.querySelector('.lb-prev').hidden = !many;
    document.querySelector('.lb-next').hidden = !many;
  }
  function lbOpen(list, i, opener) {
    lb.list = list; lb.i = i; lb.opener = opener;
    $('lightbox').hidden = false;
    document.body.classList.add('lock');
    lbShow();
    document.querySelector('[data-lb=close]').focus();
  }
  function lbClose() {
    $('lightbox').hidden = true;
    $('lb-img').removeAttribute('src');
    document.body.classList.remove('lock');
    if (lb.opener && document.contains(lb.opener)) lb.opener.focus();
  }
  function lbStep(d) {
    lb.i = (lb.i + d + lb.list.length) % lb.list.length;
    lbShow();
  }

  function bindLightbox() {
    var stage = $('lb-stage'), pts = new Map(), pinch = 0, last = null, start = null;
    $('lightbox').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lb]');
      if (!b) return;
      var a = b.getAttribute('data-lb');
      if (a === 'close') lbClose();
      if (a === 'prev') lbStep(-1);
      if (a === 'next') lbStep(1);
      if (a === 'in') lbZoom(1.4);
      if (a === 'out') lbZoom(1 / 1.4);
    });
    stage.addEventListener('wheel', function (e) { e.preventDefault(); lbZoom(Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
    stage.addEventListener('dblclick', function () { lbZoom(lb.s > 1 ? 0 : 2.4); });
    stage.addEventListener('pointerdown', function (e) {
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last = { x: e.clientX, y: e.clientY };
      start = pts.size === 1 ? { x: e.clientX, y: e.clientY } : null;
      pinch = 0;
    });
    stage.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        var a = Array.from(pts.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (pinch) lbZoom(d / pinch);
        pinch = d;
        return;
      }
      if (lb.s > 1) {
        lb.x += e.clientX - last.x;
        lb.y += e.clientY - last.y;
        lbTransform();
      }
      last = { x: e.clientX, y: e.clientY };
    });
    function up(e) {
      if (start && lb.s === 1 && pts.size === 1 && lb.list.length > 1) {
        var dx = e.clientX - start.x;
        if (Math.abs(dx) > 60) lbStep(dx < 0 ? 1 : -1);
      }
      pts.delete(e.pointerId);
      pinch = 0;
      if (pts.size) start = null;
    }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', function (e) { pts.delete(e.pointerId); start = null; });
  }

  function bindGlobal() {
    document.addEventListener('click', function (e) {
      var l = e.target.closest('[data-lang]');
      if (l) {
        lang = l.getAttribute('data-lang');
        store('lang', lang);
        chrome();
        if (treeShown && route.view === 'tree') { tree.refresh(); refreshLegend(); renderPanel(route.person); }
        else render(true);
        return;
      }
      var d = e.target.closest('[data-doc]');
      if (d) { lbOpen(d.getAttribute('data-list').split(','), +d.getAttribute('data-pos'), d); return; }
      if (e.target.closest('[data-close]') || e.target.id === 'panel-backdrop') location.hash = '#/tree';
    });
    $('theme-btn').addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
      store('theme', dark ? 'light' : 'dark');
    });
    document.addEventListener('keydown', function (e) {
      if (!$('lightbox').hidden) {
        if (e.key === 'Escape') lbClose();
        if (e.key === 'ArrowLeft') lbStep(-1);
        if (e.key === 'ArrowRight') lbStep(1);
        return;
      }
      if (e.key === 'Escape' && route && route.person) location.hash = '#/tree';
    });
    window.addEventListener('hashchange', function () { render(false); });
    bindLightbox();
  }

  function refreshLegend() {
    var wrap = document.querySelector('.tree-wrap');
    if (!wrap) return;
    wrap.querySelector('.tree-hint').textContent = ui('tree_hint');
    wrap.querySelector('.legend summary').textContent = ui('legend_lines') + ' · ' + ui('legend_status');
    var items = wrap.querySelectorAll('.legend-lines .legend-item');
    data.lines.forEach(function (l, i) { items[i].lastChild.textContent = section('lines')[l]; });
    wrap.querySelector('.legend-body h3').textContent = ui('legend_status');
    var st = wrap.querySelectorAll('.legend-body > .legend-item');
    ['confirmed', 'family', 'probable'].forEach(function (s, i) { st[i].lastChild.textContent = section('status')[s]; });
    wrap.querySelector('.legend-note').textContent = ui('legend_dashed');
    wrap.querySelectorAll('[data-tree]').forEach(function (b) {
      var a = b.getAttribute('data-tree'), label = ui(a === 'in' ? 'zoom_in' : a === 'out' ? 'zoom_out' : 'fit');
      b.title = label;
      b.setAttribute('aria-label', label);
    });
  }

  load().then(function (bundle) {
    data = bundle.data;
    texts = bundle.i18n;
    data.people.forEach(function (p) { byId[p.id] = p; });
    data.documents.forEach(function (d) { docById[d.id] = d; });
    layout = FamilyTree.computeLayout(data);
    lang = pickLanguage();
    chrome();
    bindGlobal();
    render(true);
  }).catch(function (e) {
    console.error(e);
    $('view').innerHTML = '<p class="loading">data/bundle.js?</p>';
  });
})();
