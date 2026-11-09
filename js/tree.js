/* Раскладка древа и масштабирование. Координаты считаются из data/people.json. */
(function () {
  'use strict';

  var W = 196, H = 112, STEP = W + 22, ROW = H + 78, PAD = 60;

  function computeLayout(data) {
    var byId = {}, kids = {}, gen = {};
    data.people.forEach(function (p) { byId[p.id] = p; kids[p.id] = []; });
    data.people.forEach(function (p) {
      [p.father, p.mother].forEach(function (id) { if (id && byId[id]) kids[id].push(p); });
    });

    function spouseOf(p) {
      if (p.spouse) return byId[p.spouse];
      var found = null;
      kids[p.id].forEach(function (c) {
        var other = c.father === p.id ? c.mother : c.father;
        if (other && byId[other]) found = byId[other];
      });
      return found;
    }

    (function assignUp(p, g) {
      if (gen[p.id] !== undefined) return;
      gen[p.id] = g;
      [p.father, p.mother].concat(p.possibleFathers || []).forEach(function (id) {
        if (id && byId[id]) assignUp(byId[id], g + 1);
      });
    })(byId[data.root], 0);
    var changed = true;
    while (changed) {
      changed = false;
      data.people.forEach(function (p) {
        if (gen[p.id] !== undefined) {
          var s = spouseOf(p);
          if (s && gen[s.id] === undefined) { gen[s.id] = gen[p.id]; changed = true; }
          return;
        }
        var parent = byId[p.father] || byId[p.mother];
        if (parent && gen[parent.id] !== undefined) { gen[p.id] = gen[parent.id] - 1; changed = true; return; }
        var child = kids[p.id].filter(function (c) { return gen[c.id] !== undefined; })[0];
        if (child) { gen[p.id] = gen[child.id] + 1; changed = true; return; }
      });
    }

    function extents(b) {
      var m = {};
      b.items.forEach(function (i) {
        if (!m[i.row]) m[i.row] = [i.x, i.x];
        else { m[i.row][0] = Math.min(m[i.row][0], i.x); m[i.row][1] = Math.max(m[i.row][1], i.x); }
      });
      return m;
    }
    function shift(b, dx) { b.items.forEach(function (i) { i.x += dx; }); return b; }
    function union(a, b) { return { items: a.items.concat(b.items) }; }
    function xOf(b, id) { return b.items.filter(function (i) { return i.id === id; })[0].x; }
    function spread(b) {
      var xs = b.items.map(function (i) { return i.x; });
      return [Math.min.apply(null, xs), Math.max.apply(null, xs)];
    }
    function placeRight(a, b) {
      var ea = extents(a), eb = extents(b), dx = -Infinity;
      Object.keys(eb).forEach(function (r) { if (ea[r]) dx = Math.max(dx, ea[r][1] + STEP - eb[r][0]); });
      if (dx === -Infinity) dx = spread(a)[1] + STEP - spread(b)[0];
      shift(b, dx);
      return union(a, b);
    }
    function collides(a, b) {
      return a.items.some(function (i) {
        return b.items.some(function (j) { return i.row === j.row && Math.abs(i.x - j.x) < STEP - 1; });
      });
    }

    function down(p) {
      var row = gen[p.id], block = { items: [{ id: p.id, x: 0, row: row }] }, mid = 0;
      var s = spouseOf(p);
      if (s) { block.items.push({ id: s.id, x: STEP, row: row }); mid = STEP / 2; }
      var group = null;
      kids[p.id].forEach(function (c) { var d = down(c); group = group ? placeRight(group, d) : d; });
      if (group) {
        var e = extents(group)[row - 1];
        shift(group, mid - (e[0] + e[1]) / 2);
        block = union(block, group);
      }
      return block;
    }

    function up(p, side) {
      var row = gen[p.id], upper = null, mid = null;
      var father = byId[p.father], mother = byId[p.mother];
      var self = { items: [{ id: p.id, x: 0, row: row }] };

      if (p.possibleFathers && p.possibleFathers.length) {
        p.possibleFathers.forEach(function (id) {
          var d = down(byId[id]);
          upper = upper ? placeRight(upper, d) : d;
        });
        var e = extents(upper), edge = e[row] || e[row + 1];
        shift(self, side === 'R' ? edge[0] - STEP : edge[1] + STEP);
        return union(upper, self);
      }

      if (father || mother) {
        var bf = father ? up(father, 'L') : null, bm = mother ? up(mother, 'R') : null;
        upper = bf && bm ? placeRight(bf, bm) : (bf || bm);
        mid = father && mother ? (xOf(upper, father.id) + xOf(upper, mother.id)) / 2 : xOf(upper, (father || mother).id);
      }

      var parent = father || mother;
      var sibs = parent ? kids[parent.id].filter(function (c) {
        return c.id !== p.id && kids[parent.id].indexOf(c) === kids[parent.id].lastIndexOf(c);
      }) : [];
      var parts = side === 'L' ? sibs.map(down).concat([self]) : [self].concat(sibs.map(down));
      var group = parts.reduce(function (a, b) { return a ? placeRight(a, b) : b; }, null);
      if (mid !== null) {
        var ext = extents(group)[row];
        shift(group, mid - (ext[0] + ext[1]) / 2);
        var guard = 0;
        while (collides(upper, group) && guard++ < 400) shift(group, side === 'R' ? STEP / 2 : -STEP / 2);
      }
      return upper ? union(upper, group) : group;
    }

    var block = up(byId[data.root], 'C');
    var minX = spread(block)[0], maxRow = 0;
    block.items.forEach(function (i) { maxRow = Math.max(maxRow, i.row); });

    var nodes = {};
    block.items.forEach(function (i) {
      nodes[i.id] = { id: i.id, row: i.row, x: i.x - minX + PAD, y: (maxRow - i.row) * ROW + PAD };
    });
    var width = spread(block)[1] - minX + W + PAD * 2, height = maxRow * ROW + H + PAD * 2;

    return { nodes: nodes, width: width, height: height, paths: connectors(data, byId, nodes) };
  }

  function connectors(data, byId, nodes) {
    var out = [], families = {}, rails = [], levels = {};

    data.people.forEach(function (p) {
      if (!nodes[p.id]) return;
      if (p.possibleFathers) rails.push(p);
      if (!p.father && !p.mother) return;
      var key = (p.father || '') + '|' + (p.mother || '');
      (families[key] = families[key] || { father: nodes[p.father], mother: nodes[p.mother], kids: [] }).kids.push(p);
    });

    function color(id) { return 'var(--l-' + byId[id].line + ')'; }
    function coupleMid(a, b) { return (a.x + b.x + W) / 2; }
    function level(row, a, b) {
      var list = levels[row] = levels[row] || [], l = 0;
      while (list.some(function (s) { return s.l === l && s.a - 12 <= b && a <= s.b + 12; })) l++;
      list.push({ l: l, a: a, b: b });
      return l;
    }
    function bar(row, y, a, b) { return y + H + 16 + level(row, a, b) * 12; }

    rails.forEach(function (p) {
      var c = nodes[p.id], mids = p.possibleFathers.map(function (id) {
        var f = byId[id], sp = f.spouse && nodes[f.spouse];
        return sp ? coupleMid(nodes[id], sp) : nodes[id].x + W / 2;
      });
      var top = nodes[p.possibleFathers[0]].y, cx = c.x + W / 2;
      var a = Math.min.apply(null, mids.concat(cx)), b = Math.max.apply(null, mids.concat(cx));
      var y = bar(c.row, top, a, b), d = 'M' + a + ' ' + y + 'H' + b + 'M' + cx + ' ' + y + 'V' + c.y;
      mids.forEach(function (m) { d += 'M' + m + ' ' + (top + H) + 'V' + y; });
      out.push({ d: d, stroke: color(p.id), dash: true });
    });

    Object.keys(families).forEach(function (key) {
      var f = families[key], a = f.father, b = f.mother, top = (a || b).y, mid, start;
      var col = color((a || b).id);
      if (a && b) {
        var l = a.x < b.x ? a : b, r = a.x < b.x ? b : a;
        mid = coupleMid(a, b); start = top + H / 2;
        out.push({ d: 'M' + (l.x + W) + ' ' + start + 'H' + r.x, stroke: col });
      } else {
        mid = (a || b).x + W / 2; start = top + H;
      }
      var xs = f.kids.map(function (k) { return nodes[k.id].x + W / 2; });
      var lo = Math.min.apply(null, xs.concat(mid)), hi = Math.max.apply(null, xs.concat(mid));
      var y = bar(nodes[f.kids[0].id].row, top, lo, hi);
      out.push({ d: 'M' + mid + ' ' + start + 'V' + y + 'M' + lo + ' ' + y + 'H' + hi, stroke: col });
      f.kids.forEach(function (k, i) {
        out.push({ d: 'M' + xs[i] + ' ' + y + 'V' + nodes[k.id].y, stroke: col, dash: !!k.uncertainLink });
      });
    });
    return out;
  }

  function mount(container, layout, renderCard, onOpen) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var viewport = document.createElement('div'), canvas = document.createElement('div');
    viewport.className = 'tree-viewport';
    canvas.className = 'tree-canvas';
    canvas.style.width = layout.width + 'px';
    canvas.style.height = layout.height + 'px';

    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', layout.width);
    svg.setAttribute('height', layout.height);
    layout.paths.forEach(function (p) {
      var el = document.createElementNS(svgNS, 'path');
      el.setAttribute('d', p.d);
      el.style.stroke = p.stroke;
      if (p.dash) el.setAttribute('class', 'dash');
      svg.appendChild(el);
    });
    canvas.appendChild(svg);

    var cards = {};
    Object.keys(layout.nodes).forEach(function (id) {
      var n = layout.nodes[id], b = document.createElement('button');
      b.type = 'button';
      b.style.left = n.x + 'px';
      b.style.top = n.y + 'px';
      b.addEventListener('click', function () { onOpen(id); });
      canvas.appendChild(b);
      cards[id] = b;
    });
    viewport.appendChild(canvas);
    container.appendChild(viewport);

    var view = { s: 1, x: 0, y: 0 }, touched = false, startId = null;
    function apply() {
      var r = viewport.getBoundingClientRect(), m = 90;
      view.x = Math.min(r.width - m, Math.max(m - layout.width * view.s, view.x));
      view.y = Math.min(r.height - m, Math.max(m - layout.height * view.s, view.y));
      canvas.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')';
    }
    function zoomAt(cx, cy, factor) {
      touched = true;
      var s = Math.min(1.6, Math.max(0.12, view.s * factor)), k = s / view.s;
      view.x = cx - (cx - view.x) * k;
      view.y = cy - (cy - view.y) * k;
      view.s = s;
      apply();
    }
    function fit() {
      var r = viewport.getBoundingClientRect();
      view.s = Math.min(1, Math.max(0.12, Math.min(r.width / layout.width, r.height / layout.height)));
      view.x = (r.width - layout.width * view.s) / 2;
      view.y = (r.height - layout.height * view.s) / 2;
      apply();
    }
    function initial(rootId) {
      startId = rootId;
      var r = viewport.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.width / layout.width >= 0.3) return fit();
      var n = layout.nodes[rootId];
      view.s = 0.72;
      view.x = r.width / 2 - (n.x + W / 2) * view.s;
      view.y = r.height - (n.y + H) * view.s - 92;
      apply();
    }

    var pts = new Map(), moved = false, last = null, pinch = 0;
    function centre() {
      var a = Array.from(pts.values());
      return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
    }
    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      last = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      if (pts.size === 2) pinch = centre().d;
    });
    viewport.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        var c = centre(), r = viewport.getBoundingClientRect();
        if (pinch) zoomAt(c.x - r.left, c.y - r.top, c.d / pinch);
        pinch = c.d;
        moved = true;
        return;
      }
      if (!moved && Math.hypot(e.clientX - last.sx, e.clientY - last.sy) < 6) return;
      if (!moved) {
        moved = true;
        touched = true;
        viewport.classList.add('dragging');
        try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
      }
      view.x += e.clientX - last.x;
      view.y += e.clientY - last.y;
      last.x = e.clientX;
      last.y = e.clientY;
      apply();
    });
    function release(e) {
      pts.delete(e.pointerId);
      pinch = 0;
      viewport.classList.remove('dragging');
      var rest = Array.from(pts.values())[0];
      if (rest) { last = { x: rest.x, y: rest.y, sx: rest.x, sy: rest.y }; }
    }
    viewport.addEventListener('pointerup', release);
    viewport.addEventListener('pointercancel', release);
    viewport.addEventListener('click', function (e) {
      if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
    viewport.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = viewport.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0014));
    }, { passive: false });
    new ResizeObserver(function () {
      if (!touched && startId) initial(startId); else apply();
    }).observe(viewport);

    return {
      refresh: function () {
        Object.keys(cards).forEach(function (id) { renderCard(id, cards[id]); });
      },
      select: function (id) {
        Object.keys(cards).forEach(function (k) { cards[k].classList.toggle('selected', k === id); });
      },
      zoom: function (f) {
        var r = viewport.getBoundingClientRect();
        zoomAt(r.width / 2, r.height / 2, f);
      },
      fit: function () { touched = true; fit(); },
      initial: initial,
      element: viewport
    };
  }

  window.FamilyTree = { computeLayout: computeLayout, mount: mount };
})();
