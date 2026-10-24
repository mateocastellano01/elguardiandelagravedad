// Primer plano en estilo de historieta (como las páginas de "El Guardián de la Gravedad"):
// losa de hormigón punteada con juntas y grietas, relleno de escombros, hierros en los bordes rotos,
// barandas y faroles de autopista, vigas de acero, y carteles como recuadros de narración.
// Toda la geometría de detalle se precalcula una vez por nivel y se agrupa por tramos para dibujar solo lo visible.
(function (root) {
  'use strict';

  const INK = '#121a1c';
  const FONT = '"Roboto Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif';
  const SLAB = 24;     // espesor de la losa de hormigón (unidades)
  const BUCKET = 600;  // ancho de los grupos de detalle

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Texturas (se crean una vez, en alta resolución, y se escalan a unidades del mundo) ----------
  function makePattern(ctx, size, pr, paint) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'), size);
    const p = ctx.createPattern(c, 'repeat');
    if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(1 / pr, 1 / pr));
    return p;
  }

  // Dibuja `fn(x, y)` y sus copias del otro lado si cae cerca del borde, para que la textura no tenga costuras.
  function wrapped(size, x, y, m, fn) {
    for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) {
      if ((ox && Math.abs(x + ox - size / 2) > size / 2 + m) || (oy && Math.abs(y + oy - size / 2) > size / 2 + m)) continue;
      fn(x + ox, y + oy);
    }
  }

  let texConcrete = null, texRubble = null, texSteel = null;
  function textures(ctx) {
    if (texConcrete) return;
    texConcrete = makePattern(ctx, 512, 4, (g, S) => {
      const r = rng(7);
      for (let i = 0; i < 4200; i++) {
        const x = r() * S, y = r() * S, rad = r() < 0.86 ? 0.9 + r() * 1.3 : 2.2 + r() * 2.2;
        g.fillStyle = 'rgba(18,28,30,' + (0.12 + r() * 0.32).toFixed(2) + ')';
        wrapped(S, x, y, rad, (a, b) => { g.beginPath(); g.arc(a, b, rad, 0, 7); g.fill(); });
      }
      g.fillStyle = 'rgba(255,255,255,0.28)';
      for (let i = 0; i < 700; i++) g.fillRect(r() * S, r() * S, 1.5, 1.5);
      g.strokeStyle = 'rgba(18,28,30,0.22)'; g.lineWidth = 1.4; g.lineCap = 'round';
      for (let i = 0; i < 45; i++) {
        const x = r() * S, y = r() * S, a = r() * 6.28, l = 6 + r() * 16;
        wrapped(S, x, y, l, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
      }
    });
    texRubble = makePattern(ctx, 512, 3, (g, S) => {
      const r = rng(13);
      g.lineJoin = 'round';
      for (let i = 0; i < 150; i++) {
        const cx = r() * S, cy = r() * S, rad = 14 + r() * 46, n = 6 + Math.floor(r() * 3), rot = r() * 6;
        const pts = [];
        for (let k = 0; k < n; k++) { const a = rot + (k / n) * 6.283, rr = rad * (0.6 + r() * 0.45); pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.75]); }
        const tone = r();
        wrapped(S, cx, cy, rad, (x, y) => {
          g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(x + p[0], y + p[1]) : g.moveTo(x + p[0], y + p[1]))); g.closePath();
          g.fillStyle = tone < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fill();
          g.strokeStyle = 'rgba(4,10,12,0.5)'; g.lineWidth = 2; g.stroke();
          g.strokeStyle = 'rgba(4,10,12,0.3)'; g.lineWidth = 1.2;
          g.beginPath();
          for (let h = -rad; h < rad; h += 6) { g.moveTo(x + h, y + rad * 0.5); g.lineTo(x + h + 6, y + rad * 0.15); }
          g.stroke();
        });
      }
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 1800; i++) g.fillRect(r() * S, r() * S, 2, 2);
    });
    texSteel = makePattern(ctx, 256, 4, (g, S) => {
      const r = rng(21);
      g.fillStyle = 'rgba(10,16,18,0.25)';
      for (let i = 0; i < 900; i++) g.fillRect(r() * S, r() * S, 1.6, 1.6);
      g.fillStyle = 'rgba(120,80,50,0.18)';
      for (let i = 0; i < 40; i++) { const x = r() * S; g.fillRect(x, r() * S, 2 + r() * 3, 10 + r() * 40); }
    });
  }

  // ---------- Geometría ----------
  function resample(top, step) {
    const out = [];
    let s = 0;
    for (let i = 0; i < top.length - 1; i++) {
      const [x0, y0] = top[i], [x1, y1] = top[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (!len) continue;
      const n = Math.max(1, Math.ceil(len / step));
      for (let j = 0; j < n; j++) {
        const t = j / n;
        out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, s: s + len * t });
      }
      s += len;
    }
    const last = top[top.length - 1];
    out.push({ x: last[0], y: last[1], s });
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], p = out[i];
      let tx = b.x - a.x, ty = b.y - a.y;
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      p.tx = tx; p.ty = ty; p.nx = ty; p.ny = -tx;
      // en las esquinas, compensa el ángulo para que la losa mantenga su espesor (inglete)
      let px = p.x - a.x, py = p.y - a.y;
      const pl = Math.hypot(px, py);
      let m = 1;
      if (pl > 0) { px /= pl; py /= pl; m = 1 / Math.max(0.5, p.nx * py + p.ny * -px); }
      p.m = m;
    }
    return out;
  }

  function buckets() { return new Map(); }
  function addTo(map, x, fn) {
    const k = Math.floor(x / BUCKET);
    let p = map.get(k);
    if (!p) { p = new Path2D(); map.set(k, p); }
    fn(p);
  }
  function each(map, view, fn) {
    const a = Math.floor((view.x0 - 160) / BUCKET), b = Math.floor((view.x1 + 160) / BUCKET);
    for (let k = a; k <= b; k++) { const p = map.get(k); if (p) fn(p); }
  }

  function prepareGround(g, gi) {
    const r = rng(1000 + gi * 97);
    const P = resample(g.top, 8);
    const inner = P.map(p => [p.x - p.nx * SLAB * p.m, p.y - p.ny * SLAB * p.m]);
    const slab = new Path2D();
    P.forEach((p, i) => (i ? slab.lineTo(p.x, p.y) : slab.moveTo(p.x, p.y)));
    for (let i = inner.length - 1; i >= 0; i--) slab.lineTo(inner[i][0], inner[i][1]);
    slab.closePath();
    const body = new Path2D();
    g.poly.forEach((p, i) => (i ? body.lineTo(p[0], p[1]) : body.moveTo(p[0], p[1])));
    body.closePath();

    const D = {
      hatch: buckets(), joints: buckets(), cracks: buckets(), chips: buckets(), topHi: buckets(), under: buckets(),
      rockLight: buckets(), rockShade: buckets(), rockInk: buckets(), grass: buckets(),
      rail: buckets(), railHi: buckets(), lamp: buckets(), lampHi: buckets(), lampHead: buckets(), rebar: buckets(),
    };
    let nextJoint = 60 + r() * 120, nextCrack = 40 + r() * 160, nextRock = 30 + r() * 120, nextGrass = 80 + r() * 260, nextLamp = 300 + r() * 500;
    let run = [];

    const flushRun = () => {
      if (run.length < 2) { run = []; return; }
      const len = run[run.length - 1].s - run[0].s;
      if (len > 240 && r() < 0.7) addRailing(run.slice(Math.floor(run.length * 0.08), Math.ceil(run.length * 0.92)));
      run = [];
    };

    const addRailing = pts => {
      let next = pts[0].s, prev = null, gapLeft = 0;
      for (const p of pts) {
        if (p.s < next) continue;
        next = p.s + 30;
        const bent = r() < 0.08;
        const tip = [p.x + (bent ? 6 + r() * 6 : 0), p.y - (bent ? 18 : 24)];
        if (gapLeft > 0) { gapLeft--; prev = null; continue; }
        if (r() < 0.06) { gapLeft = 1 + Math.floor(r() * 2); prev = null; continue; }
        addTo(D.rail, p.x, path => { path.moveTo(p.x, p.y); path.lineTo(tip[0], tip[1]); });
        if (prev && r() > 0.1) {
          const a = prev, sag = r() < 0.12 ? 6 : 0;
          addTo(D.rail, p.x, path => {
            path.moveTo(a.x, a.y - 13); path.quadraticCurveTo((a.x + p.x) / 2, (a.y + p.y) / 2 - 13 + sag, p.x, p.y - 13);
            path.moveTo(a.tx, a.ty); path.quadraticCurveTo((a.x + p.x) / 2, (a.ty + tip[1]) / 2 + sag, tip[0], tip[1]);
          });
          addTo(D.railHi, p.x, path => { path.moveTo(a.tx, a.ty - 0.8); path.lineTo(tip[0], tip[1] - 0.8); });
        }
        prev = { x: p.x, y: p.y, tx: tip[0], ty: tip[1] };
      }
    };

    for (let i = 0; i < P.length; i++) {
      const p = P[i], flat = p.ny < -0.82, veryFlat = p.ny < -0.96;
      if (veryFlat) run.push(p); else flushRun();

      // rayado de sombra en la parte baja de la losa
      if (i % 1 === 0) {
        const bx = p.x - p.nx * (SLAB * p.m - 2), by = p.y - p.ny * (SLAB * p.m - 2);
        const len = 5 + r() * 5;
        addTo(D.hatch, p.x, path => { path.moveTo(bx, by); path.lineTo(bx + p.nx * len + p.tx * 4, by + p.ny * len + p.ty * 4); });
        if (r() < 0.5) {
          const bx2 = bx + p.tx * 4;
          addTo(D.hatch, p.x, path => { path.moveTo(bx2, by + p.ty * 4); path.lineTo(bx2 + p.nx * len * 0.6 + p.tx * 3, by + p.ty * 4 + p.ny * len * 0.6 + p.ty * 3); });
        }
      }
      // brillo del canto superior y sombra bajo la losa
      if (i > 0) {
        const a = P[i - 1];
        addTo(D.topHi, p.x, path => { path.moveTo(a.x - a.nx * 1.6, a.y - a.ny * 1.6); path.lineTo(p.x - p.nx * 1.6, p.y - p.ny * 1.6); });
        addTo(D.under, p.x, path => { path.moveTo(inner[i - 1][0], inner[i - 1][1]); path.lineTo(inner[i][0], inner[i][1]); });
      }
      // juntas de dilatación con un desportillado
      if (p.s >= nextJoint) {
        nextJoint = p.s + 110 + r() * 80;
        const ix = inner[i];
        addTo(D.joints, p.x, path => { path.moveTo(p.x, p.y); path.lineTo(ix[0], ix[1]); });
        const w = 2 + r() * 3;
        addTo(D.chips, p.x, path => { path.moveTo(p.x - p.tx * w, p.y - p.ty * w); path.lineTo(p.x - p.nx * w * 0.8, p.y - p.ny * w * 0.8); path.lineTo(p.x + p.tx * w, p.y + p.ty * w); path.closePath(); });
      }
      // grietas que bajan de la losa al relleno, con ramificaciones
      if (p.s >= nextCrack) {
        nextCrack = p.s + 70 + r() * 220;
        addTo(D.cracks, p.x, path => {
          let cx = p.x, cy = p.y;
          path.moveTo(cx, cy);
          const segs = 3 + Math.floor(r() * 4);
          for (let k = 0; k < segs; k++) {
            cx += p.tx * (r() - 0.5) * 14 - p.nx * (5 + r() * 9);
            cy += p.ty * (r() - 0.5) * 14 - p.ny * (5 + r() * 9);
            path.lineTo(cx, cy);
            if (r() < 0.35) {
              const bx = cx + p.tx * (r() - 0.5) * 16 - p.nx * 6, by = cy + p.ty * (r() - 0.5) * 16 - p.ny * 6;
              path.lineTo(bx, by); path.moveTo(cx, cy);
            }
          }
        });
        if (r() < 0.6) {
          const w = 1.5 + r() * 3;
          addTo(D.chips, p.x, path => { path.moveTo(p.x - p.tx * w, p.y - p.ty * w); path.lineTo(p.x - p.nx * w, p.y - p.ny * w); path.lineTo(p.x + p.tx * w * 0.6, p.y + p.ty * w * 0.6); path.closePath(); });
        }
      }
      // escombros apoyados
      if (flat && p.s >= nextRock) {
        nextRock = p.s + 40 + r() * 170;
        const rad = 2.5 + Math.pow(r(), 2) * 8, cx = p.x + (r() - 0.5) * 6, cy = p.y - rad * 0.45;
        const n = 5 + Math.floor(r() * 3), rot = r() * 6, pts = [];
        for (let k = 0; k < n; k++) { const a = rot + (k / n) * 6.283, rr = rad * (0.7 + r() * 0.4); pts.push([cx + Math.cos(a) * rr, Math.min(p.y + 1, cy + Math.sin(a) * rr * 0.7)]); }
        const poly = path => { pts.forEach((q, k) => (k ? path.lineTo(q[0], q[1]) : path.moveTo(q[0], q[1]))); path.closePath(); };
        addTo(D.rockLight, p.x, poly);
        addTo(D.rockInk, p.x, poly);
        addTo(D.rockShade, p.x, path => { path.moveTo(cx - rad, cy); path.lineTo(cx + rad * 0.2, cy + rad * 0.15); path.lineTo(cx + rad * 0.3, p.y + 1); path.lineTo(cx - rad, p.y + 1); path.closePath(); });
      }
      // pasto seco, fino y escaso
      if (flat && p.s >= nextGrass) {
        nextGrass = p.s + 120 + r() * 380;
        addTo(D.grass, p.x, path => {
          const n = 4 + Math.floor(r() * 5);
          for (let k = 0; k < n; k++) {
            const bx = p.x + (k - n / 2) * 1.6, len = 5 + r() * 9, lean = (r() - 0.4) * 6;
            path.moveTo(bx, p.y); path.quadraticCurveTo(bx + lean * 0.3, p.y - len * 0.6, bx + lean, p.y - len);
          }
        });
      }
      // faroles de autopista (algunos doblados)
      if (veryFlat && p.s >= nextLamp) {
        nextLamp = p.s + 700 + r() * 500;
        const broken = r() < 0.35, H = 118;
        const bend = broken ? 0.35 + r() * 0.3 : 0;
        const kx = p.x, ky = p.y - H * 0.55;
        const top = [kx + Math.sin(bend) * H * 0.45, ky - Math.cos(bend) * H * 0.45];
        addTo(D.lamp, p.x, path => {
          path.moveTo(p.x - 3, p.y); path.lineTo(p.x + 3, p.y);
          path.moveTo(p.x, p.y); path.lineTo(kx, ky); path.lineTo(top[0], top[1]);
          path.quadraticCurveTo(top[0] + 4, top[1] - 10 * Math.cos(bend), top[0] + 20 * Math.cos(bend), top[1] - 8 + 18 * Math.sin(bend));
        });
        addTo(D.lampHi, p.x, path => { path.moveTo(p.x + 1, p.y - 2); path.lineTo(kx + 1, ky); });
        const hx = top[0] + 20 * Math.cos(bend), hy = top[1] - 8 + 18 * Math.sin(bend);
        addTo(D.lampHead, p.x, path => { path.moveTo(hx - 2, hy - 2); path.lineTo(hx + 12, hy - 1); path.lineTo(hx + 10, hy + 4); path.lineTo(hx - 1, hy + 3); path.closePath(); });
      }
    }
    flushRun();

    // hierros asomando en los bordes cortados del terreno
    const ends = [[P[0], -1], [P[P.length - 1], 1]];
    for (const [p, dir] of ends) {
      if (Math.abs(p.ny) < 0.5) continue;
      for (let k = 0; k < 5; k++) {
        const y = p.y + 3 + k * (SLAB - 6) / 4 + (r() - 0.5) * 2, len = 6 + r() * 16, droop = 2 + r() * 6;
        addTo(D.rebar, p.x, path => { path.moveTo(p.x, y); path.quadraticCurveTo(p.x + dir * len * 0.6, y - 1, p.x + dir * len, y + droop); });
      }
      const w = 5 + r() * 4;
      addTo(D.chips, p.x, path => { path.moveTo(p.x, p.y); path.lineTo(p.x - dir * w, p.y); path.lineTo(p.x, p.y + w * 1.4); path.closePath(); });
    }

    let minY = Infinity;
    for (const p of g.top) minY = Math.min(minY, p[1]);
    return { slab, body, D, x0: g.top[0][0], x1: g.top[g.top.length - 1][0], minY, grad: null };
  }

  function prepareSolid(s, si) {
    const p = s.poly, r = rng(3000 + si * 31);
    const x0 = Math.min.apply(null, p.map(q => q[0])), x1 = Math.max.apply(null, p.map(q => q[0]));
    const y0 = Math.min.apply(null, p.map(q => q[1])), y1 = Math.max.apply(null, p.map(q => q[1]));
    const w = x1 - x0, h = y1 - y0;
    const body = new Path2D();
    p.forEach((q, i) => (i ? body.lineTo(q[0], q[1]) : body.moveTo(q[0], q[1])));
    body.closePath();
    const panels = new Path2D(), cracks = new Path2D(), hatch = new Path2D(), rebar = new Path2D(), stains = [], windows = [];
    for (let y = y1 - 60, row = 0; y > y0 + 8; y -= 60, row++) {
      panels.moveTo(x0, y); panels.lineTo(x1, y + (r() - 0.5) * 1.5);
      for (let x = x0 + (row % 2 ? 40 : 80); x < x1 - 10; x += 80) { panels.moveTo(x, y); panels.lineTo(x, Math.min(y1, y + 60)); }
      if (r() < 0.7) stains.push([x0 + r() * w, y, 2 + r() * 5, 14 + r() * 40]);
    }
    if (h > 300) {
      for (let y = y1 - 52; y > y0 + 20; y -= 60) {
        for (const fx of [0.32, 0.62]) if (r() < 0.85) windows.push([x0 + w * fx, y, 16, 26, r()]);
      }
    }
    for (let x = x0 - h; x < x0 + w * 0.24; x += 3.4) {
      const ax = Math.max(x0, x), ay = y1 - (ax - x);
      const bx = Math.min(x0 + w * 0.24, x + h), by = y1 - (bx - x);
      if (bx > ax) { hatch.moveTo(ax, ay); hatch.lineTo(bx, by); }
    }
    for (let i = 0; i < Math.max(3, h / 110); i++) {
      let cx = x0 + r() * w, cy = y0 + r() * h;
      cracks.moveTo(cx, cy);
      for (let k = 0; k < 4; k++) { cx += (r() - 0.5) * 20; cy += 8 + r() * 14; cracks.lineTo(cx, cy); if (r() < 0.3) { cracks.lineTo(cx + (r() - 0.5) * 14, cy + 8); cracks.moveTo(cx, cy); } }
    }
    for (let i = 0; i < Math.max(4, w / 30); i++) {
      const x = x0 + 8 + r() * (w - 16), len = 3 + r() * 6;
      rebar.moveTo(x, y1); rebar.quadraticCurveTo(x + (r() - 0.5) * 6, y1 + len * 0.6, x + (r() - 0.5) * 10, y1 + len);
    }
    for (const cx of [x0, x1]) {
      for (let k = 0; k < 3; k++) { const y = y0 + 6 + k * 7, dir = cx === x0 ? -1 : 1; rebar.moveTo(cx, y); rebar.lineTo(cx + dir * (5 + r() * 10), y - 2 - r() * 6); }
    }
    return { x0, x1, y0, y1, w, h, body, panels, cracks, hatch, rebar, stains, windows };
  }

  function prepare(level) {
    if (level._art) return level._art;
    level._art = {
      ground: level.ground.map(prepareGround),
      solids: level.solids.map(prepareSolid),
    };
    return level._art;
  }

  // ---------- Terreno ----------
  function drawGround(ctx, level, view) {
    textures(ctx);
    const art = prepare(level);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const g of art.ground) {
      if (g.x1 < view.x0 - 200 || g.x0 > view.x1 + 200) continue;
      const D = g.D;
      // relleno de escombros, más oscuro en la profundidad
      ctx.fillStyle = '#29353a'; ctx.fill(g.body);
      ctx.fillStyle = texRubble; ctx.fill(g.body);
      if (!g.grad) {
        g.grad = ctx.createLinearGradient(0, g.minY + 20, 0, g.minY + 520);
        g.grad.addColorStop(0, 'rgba(8,14,16,0)'); g.grad.addColorStop(1, 'rgba(8,14,16,0.6)');
      }
      ctx.fillStyle = g.grad; ctx.fill(g.body);

      // losa de hormigón
      ctx.fillStyle = '#b2bfb9'; ctx.fill(g.slab);
      ctx.fillStyle = texConcrete; ctx.fill(g.slab);
      ctx.save();
      ctx.clip(g.body);
      ctx.strokeStyle = 'rgba(18,28,30,0.42)'; ctx.lineWidth = 0.9; each(D.hatch, view, p => ctx.stroke(p));
      ctx.strokeStyle = 'rgba(6,10,12,0.6)'; ctx.lineWidth = 4.5; each(D.under, view, p => ctx.stroke(p));
      ctx.strokeStyle = 'rgba(18,28,30,0.7)'; ctx.lineWidth = 1.5; each(D.joints, view, p => ctx.stroke(p));
      ctx.strokeStyle = 'rgba(10,16,18,0.85)'; ctx.lineWidth = 1.2; each(D.cracks, view, p => ctx.stroke(p));
      ctx.strokeStyle = 'rgba(240,246,242,0.85)'; ctx.lineWidth = 1.6; each(D.topHi, view, p => ctx.stroke(p));
      ctx.restore();
      ctx.fillStyle = 'rgba(30,42,44,0.9)'; each(D.chips, view, p => ctx.fill(p));
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(g.body);

      // utilería de fondo: barandas y faroles
      ctx.strokeStyle = INK; ctx.lineWidth = 3.4; each(D.rail, view, p => ctx.stroke(p));
      ctx.strokeStyle = '#7f9393'; ctx.lineWidth = 1.5; each(D.rail, view, p => ctx.stroke(p));
      ctx.strokeStyle = 'rgba(230,240,236,0.6)'; ctx.lineWidth = 0.7; each(D.railHi, view, p => ctx.stroke(p));
      ctx.strokeStyle = INK; ctx.lineWidth = 4.2; each(D.lamp, view, p => ctx.stroke(p));
      ctx.strokeStyle = '#6f8484'; ctx.lineWidth = 2; each(D.lamp, view, p => ctx.stroke(p));
      ctx.strokeStyle = 'rgba(230,240,236,0.55)'; ctx.lineWidth = 0.8; each(D.lampHi, view, p => ctx.stroke(p));
      ctx.fillStyle = '#c9d4cf'; ctx.strokeStyle = INK; ctx.lineWidth = 1.8; each(D.lampHead, view, p => { ctx.fill(p); ctx.stroke(p); });

      // escombros, pasto y hierros
      ctx.fillStyle = '#a3b0aa'; each(D.rockLight, view, p => ctx.fill(p));
      ctx.fillStyle = 'rgba(40,54,56,0.55)'; each(D.rockShade, view, p => ctx.fill(p));
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; each(D.rockInk, view, p => ctx.stroke(p));
      ctx.strokeStyle = '#4c4f33'; ctx.lineWidth = 0.9; each(D.grass, view, p => ctx.stroke(p));
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6; each(D.rebar, view, p => ctx.stroke(p));
      ctx.strokeStyle = '#6a5240'; ctx.lineWidth = 1.2; each(D.rebar, view, p => ctx.stroke(p));
    }
    for (const s of art.solids) {
      if (s.x1 < view.x0 - 60 || s.x0 > view.x1 + 60) continue;
      drawSolid(ctx, s);
    }
  }

  function drawSolid(ctx, s) {
    // sombra proyectada debajo (se lee como techo del túnel)
    const sh = ctx.createLinearGradient(0, s.y1, 0, s.y1 + 70);
    sh.addColorStop(0, 'rgba(6,12,14,0.5)'); sh.addColorStop(1, 'rgba(6,12,14,0)');
    ctx.fillStyle = sh; ctx.fillRect(s.x0 - 10, s.y1, s.w + 20, 70);

    ctx.fillStyle = '#a5b3ad'; ctx.fill(s.body);
    ctx.fillStyle = texConcrete; ctx.fill(s.body);
    ctx.save(); ctx.clip(s.body);
    ctx.fillStyle = 'rgba(28,42,46,0.3)'; ctx.fillRect(s.x0, s.y0, s.w * 0.24, s.h);
    ctx.strokeStyle = 'rgba(18,28,30,0.4)'; ctx.lineWidth = 0.9; ctx.stroke(s.hatch);
    ctx.fillStyle = 'rgba(30,44,46,0.22)';
    for (const [x, y, w, l] of s.stains) ctx.fillRect(x, y, w, l);
    for (const [x, y, w, h, k] of s.windows) {
      ctx.fillStyle = '#1d2a2c'; ctx.fillRect(x, y, w, h);
      if (k < 0.45) { ctx.fillStyle = '#8fa9a4'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.7, y); ctx.lineTo(x, y + h * 0.55); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(240,246,242,0.7)'; ctx.fillRect(x - 1, y + h, w + 2, 1.4);
    }
    ctx.strokeStyle = 'rgba(18,28,30,0.6)'; ctx.lineWidth = 1.4; ctx.stroke(s.panels);
    ctx.strokeStyle = 'rgba(10,16,18,0.85)'; ctx.lineWidth = 1.2; ctx.stroke(s.cracks);
    ctx.strokeStyle = 'rgba(6,10,12,0.55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(s.x0, s.y1 - 2); ctx.lineTo(s.x1, s.y1 - 2); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke(s.rebar);
    ctx.strokeStyle = '#6a5240'; ctx.lineWidth = 1.2; ctx.stroke(s.rebar);
    ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.stroke(s.body);
  }

  // ---------- Objetos ----------
  // Viga de acero doble T, con remaches, óxido y un cable cortado colgando.
  function drawPlatform(ctx, o) {
    textures(ctx);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const x0 = o.x, x1 = o.x + o.w, y = o.y;
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x0 + 14, y + 12); ctx.quadraticCurveTo(x0 + 8, y + 26, x0 + 12, y + 38); ctx.stroke();
    ctx.strokeStyle = '#6f8484'; ctx.lineWidth = 1.1; ctx.stroke();
    const shape = new Path2D();
    shape.moveTo(x0, y); shape.lineTo(x1, y); shape.lineTo(x1, y + 3.5); shape.lineTo(x1 - 2, y + 3.5); shape.lineTo(x1 - 2, y + 9);
    shape.lineTo(x1 + 1, y + 9); shape.lineTo(x1 - 1, y + 13); shape.lineTo(x0 + 2, y + 13); shape.lineTo(x0, y + 9); shape.lineTo(x0 + 3, y + 9);
    shape.lineTo(x0 + 3, y + 3.5); shape.lineTo(x0, y + 3.5); shape.closePath();
    ctx.fillStyle = '#5b6a70'; ctx.fill(shape);
    ctx.fillStyle = '#8e9ca1'; ctx.fillRect(x0, y, o.w, 3.5);
    ctx.fillStyle = '#3e4a50'; ctx.fillRect(x0 + 3, y + 3.5, o.w - 5, 5.5);
    ctx.fillStyle = texSteel; ctx.fill(shape);
    ctx.fillStyle = 'rgba(120,78,46,0.45)';
    for (let x = x0 + 20; x < x1 - 10; x += 47) ctx.fillRect(x, y + 4, 3, 8);
    ctx.fillStyle = '#b3c0c4';
    for (let x = x0 + 9; x < x1 - 4; x += 16) { ctx.beginPath(); ctx.arc(x, y + 6.2, 0.9, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(240,246,242,0.7)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x0 + 1, y + 0.8); ctx.lineTo(x1 - 1, y + 0.8); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke(shape);
    ctx.restore();
  }

  function drawSpring(ctx, s) {
    const h = 22 / (s.t > 8 ? 2.2 : 1);
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // base con franjas de peligro
    ctx.save();
    ctx.beginPath(); ctx.rect(-20, -5, 40, 7); ctx.clip();
    ctx.fillStyle = '#d6b23f'; ctx.fillRect(-20, -5, 40, 7);
    ctx.fillStyle = '#1b2224';
    for (let x = -24; x < 22; x += 8) { ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x + 4, 2); ctx.lineTo(x + 9, -5); ctx.lineTo(x + 5, -5); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.strokeRect(-20, -5, 40, 7);
    // resorte
    const top = -5 - h;
    ctx.beginPath(); ctx.moveTo(-11, -5);
    for (let i = 0; i < 6; i++) ctx.lineTo(i % 2 ? -11 : 11, -5 + (top + 5) * ((i + 1) / 6));
    ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.stroke();
    ctx.strokeStyle = '#9fb0b3'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#7d8d92';
    ctx.beginPath(); ctx.rect(-19, top - 5, 38, 5); ctx.fill();
    ctx.fillStyle = 'rgba(240,246,242,0.7)'; ctx.fillRect(-18, top - 5, 36, 1.3);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.strokeRect(-19, top - 5, 38, 5);
    ctx.restore();
  }

  function drawBean(ctx, b, t) {
    const bob = Math.sin(t * 0.07 + b.x * 0.013) * 3;
    ctx.save(); ctx.translate(b.x, b.y + bob);
    ctx.fillStyle = 'rgba(250,244,220,0.3)';
    ctx.beginPath(); ctx.arc(0, 0, 15 + Math.sin(t * 0.1 + b.x) * 1.5, 0, 7); ctx.fill();
    ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
    ctx.fillStyle = '#9b6a3c';
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.lineTo(6, 9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(30,18,10,0.35)';
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-3, -6); ctx.lineTo(-2.5, 9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.lineTo(6, 9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#efe9dc';
    ctx.beginPath(); ctx.rect(-9, -10, 18, 4.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d4b48a'; ctx.fillRect(-7, -1, 14, 5);
    ctx.strokeStyle = 'rgba(18,28,30,0.5)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); for (let x = -6; x < 6; x += 2.2) { ctx.moveTo(x, 4); ctx.lineTo(x + 1.6, -0.6); } ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-2, -14); ctx.quadraticCurveTo(-6, -19, -2, -23);
    ctx.moveTo(3, -14); ctx.quadraticCurveTo(7, -19, 3, -23);
    ctx.stroke();
    ctx.restore();
  }

  // Baliza de la F.E.M.S.: poste con bandera gastada y luz que se enciende al activarla.
  function drawCheckpoint(ctx, c, t) {
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = '#7d8d92'; ctx.fillRect(-7, -3, 14, 4);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.strokeRect(-7, -3, 14, 4);
    ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, -74); ctx.stroke();
    ctx.strokeStyle = '#8fa1a5'; ctx.lineWidth = 2; ctx.stroke();
    const w = Math.sin(t * 0.1) * 2.5;
    const flag = new Path2D();
    flag.moveTo(1, -70); flag.quadraticCurveTo(14, -72 + w, 30, -68 + w);
    flag.lineTo(26, -63 + w * 0.6); flag.lineTo(31, -58 + w * 0.6); flag.lineTo(25, -55 + w * 0.4);
    flag.quadraticCurveTo(14, -54 - w * 0.5, 1, -52); flag.closePath();
    ctx.fillStyle = c.hit ? '#2f7c80' : '#8c9894'; ctx.fill(flag);
    ctx.save(); ctx.clip(flag);
    ctx.fillStyle = c.hit ? 'rgba(240,246,242,0.85)' : 'rgba(240,246,242,0.4)'; ctx.fillRect(0, -63, 34, 3);
    ctx.strokeStyle = 'rgba(10,16,18,0.45)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); for (let x = 4; x < 30; x += 2.6) { ctx.moveTo(x, -54); ctx.lineTo(x + 3, -60); } ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(flag);
    if (c.hit) {
      ctx.fillStyle = 'rgba(240,226,150,' + (0.25 + Math.sin(t * 0.15) * 0.1).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(0, -78, 11, 0, 7); ctx.fill();
    }
    ctx.fillStyle = c.hit ? '#f0dc8a' : '#5b6a70';
    ctx.beginPath(); ctx.arc(0, -77, 3.6, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
  }

  function drawGoal(ctx, g, t) {
    ctx.save(); ctx.translate(g.x, g.y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = '#7d8d92'; ctx.fillRect(-10, -4, 20, 5);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-10, -4, 20, 5);
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, -176); ctx.stroke();
    ctx.strokeStyle = '#8fa1a5'; ctx.lineWidth = 3; ctx.stroke();
    const w = Math.sin(t * 0.08) * 5;
    const flag = new Path2D();
    flag.moveTo(2, -170);
    flag.bezierCurveTo(30, -178 + w, 62, -162 - w, 100, -170 + w);
    flag.lineTo(94, -150 + w * 0.6); flag.lineTo(102, -136 + w * 0.5); flag.lineTo(92, -128 + w * 0.4); flag.lineTo(98, -114 + w * 0.3);
    flag.bezierCurveTo(62, -106 - w, 30, -122 + w, 2, -114); flag.closePath();
    ctx.fillStyle = '#2b6a70'; ctx.fill(flag);
    ctx.save(); ctx.clip(flag);
    ctx.strokeStyle = 'rgba(8,24,26,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 6; x < 100; x += 3) { ctx.moveTo(x, -114); ctx.lineTo(x + 5, -124); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(8,24,26,0.5)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(34, -172 + w * 0.5); ctx.quadraticCurveTo(38, -142, 34, -118); ctx.moveTo(68, -166 - w * 0.5); ctx.quadraticCurveTo(64, -140, 68, -112); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(flag);
    ctx.fillStyle = '#f2ecd6';
    ctx.font = '700 20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('F.E.M.S.', 50, -136 + w * 0.6);
    ctx.fillStyle = '#c9a646';
    ctx.beginPath(); ctx.arc(0, -178, 6, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  // Recuadro de narración de historieta flotando sobre el escenario.
  function drawSign(ctx, s) {
    ctx.save(); ctx.translate(s.x, s.y);
    const text = s.text.toUpperCase();
    ctx.font = '700 14px ' + FONT;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    const w = ctx.measureText(text).width + 22, h = 26, y = -150;
    ctx.fillStyle = 'rgba(10,16,18,0.35)'; ctx.fillRect(-w / 2 + 3, y + 3, w, h);
    ctx.fillStyle = '#f3f1ea'; ctx.fillRect(-w / 2, y, w, h);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.strokeRect(-w / 2, y, w, h);
    ctx.fillStyle = '#111717'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, y + h / 2 + 1);
    ctx.restore();
  }

  function drawWater(ctx, level, view, t) {
    const y = level.waterY - 140;
    const wave = x => y + Math.sin(x * 0.02 + t * 0.04) * 3.5 + Math.sin(x * 0.007 - t * 0.02) * 2.5;
    const x0 = Math.floor((view.x0 - 40) / 16) * 16, x1 = view.x1 + 40;
    ctx.beginPath();
    ctx.moveTo(x0, view.y1 + 80);
    for (let x = x0; x <= x1; x += 16) ctx.lineTo(x, wave(x));
    ctx.lineTo(x1, view.y1 + 80);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + 260);
    g.addColorStop(0, 'rgba(74,122,122,0.9)'); g.addColorStop(1, 'rgba(22,48,52,0.97)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(10,22,24,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let row = 0; row < 9; row++) {
      const yy = y + 14 + row * row * 4 + row * 8, step = 70 + row * 14, shift = (t * (0.25 + row * 0.04)) % step;
      for (let x = Math.floor(x0 / step) * step - step; x < x1; x += step) {
        const xx = x + shift + ((x / step) % 3) * 17 + row * 29, len = 14 + (row % 3) * 9;
        ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + len / 2, yy - 1.6, xx + len, yy);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,236,230,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let row = 0; row < 4; row++) {
      const yy = y + 8 + row * 11, step = 90 + row * 25, shift = (t * (0.4 + row * 0.07)) % step;
      for (let x = Math.floor(x0 / step) * step - step; x < x1; x += step) {
        const xx = x + shift + row * 41;
        ctx.moveTo(xx, yy); ctx.lineTo(xx + 10 + row * 3, yy);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(226,240,234,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 16) { if (x === x0) ctx.moveTo(x, wave(x) + 3); else ctx.lineTo(x, wave(x) + 3); }
    ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 16) { if (x === x0) ctx.moveTo(x, wave(x)); else ctx.lineTo(x, wave(x)); }
    ctx.stroke();
  }

  let vig = null, vigKey = '';
  function drawVignette(ctx, W, H) {
    const key = W + 'x' + H;
    if (vigKey !== key) {
      vig = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, Math.hypot(W, H) * 0.62);
      vig.addColorStop(0, 'rgba(8,18,20,0)'); vig.addColorStop(1, 'rgba(8,18,20,0.38)');
      vigKey = key;
    }
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }

  function drawBackground(ctx, W, H, cam, s, t) { root.BobBackdrop.draw(ctx, W, H, cam, s, t); }

  root.BobDraw = {
    INK, rng,
    drawBackground, drawGround, drawPlatform, drawSpring, drawBean,
    drawCheckpoint, drawGoal, drawSign, drawWater, drawVignette,
  };
})(window);
