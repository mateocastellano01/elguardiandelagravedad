// Fondo en estilo de historieta, tomado de las páginas de "El Guardián de la Gravedad":
// cielo verde agua, nubes dramáticas entintadas y una Buenos Aires inundada en tres planos,
// con tramado, punteado, grúas, torres de luz, humo y autopistas rotas.
// Cada plano se dibuja una sola vez por tramos (chunks) en lienzos fuera de pantalla y después solo se copia.
(function (root) {
  'use strict';

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
  const mod = (a, n) => ((a % n) + n) % n;

  // Tramo: ancho en unidades del plano, margen de solapamiento y extensión vertical (0 = línea de agua).
  const CW = 500, PAD = 3, TOP = -680, BOT = 240;

  const LAYERS = [
    {
      name: 'lejos', seed: 11, f: 0.07, k: 0.5, base: 0.63, period: 6000, maxRes: 1.3, detail: 0, sc: 0.6,
      minW: 28, maxW: 80, minH: 120, maxH: 400, fh: 8, winW: 3, gapMin: -6, gapMax: 10,
      broken: 0.35, smoke: 0.22, cranes: 5, lights: 3, bridges: 0,
      lw: 0.9, thin: 0.45, hw: 0.45, hgap: 4, dots: 0.004, dotS: 0.9, flood: 5,
      c: {
        body: '#a9c7bf', side: '#99b8b1', win: '#90b0aa', dark: '#86a6a0', glass: '#bad3cb',
        line: 'rgba(60,92,92,0.32)', ink: 'rgba(52,82,84,0.62)', hatch: 'rgba(60,92,92,0.22)',
        stain: 'rgba(80,112,110,0.12)', dot: 'rgba(60,92,92,0.28)', water: '#b8d3ca',
        refl: 'rgba(90,128,124,0.28)', ripple: 'rgba(70,104,104,0.32)', smoke: '#d3e1d9', metal: 'rgba(62,94,96,0.6)',
      },
    },
    {
      name: 'medio', seed: 23, f: 0.18, k: 0.66, base: 0.74, period: 5000, maxRes: 1.8, detail: 1, sc: 0.8,
      minW: 48, maxW: 120, minH: 100, maxH: 330, fh: 11, winW: 4.4, gapMin: 6, gapMax: 60,
      broken: 0.5, smoke: 0.2, cranes: 3, lights: 2, bridges: 1, obelisk: 1250,
      lw: 1.25, thin: 0.6, hw: 0.55, hgap: 3.4, dots: 0.007, dotS: 1, flood: 7,
      c: {
        body: '#88aaa4', side: '#73948f', win: '#557575', dark: '#3d5859', glass: '#a9c7bf',
        line: 'rgba(28,46,48,0.45)', ink: 'rgba(20,34,36,0.88)', hatch: 'rgba(24,40,42,0.34)',
        stain: 'rgba(28,48,48,0.16)', dot: 'rgba(24,40,42,0.36)', water: '#93b8b0',
        refl: 'rgba(38,64,64,0.32)', ripple: 'rgba(30,52,52,0.42)', smoke: '#c3d4cc', metal: 'rgba(24,40,42,0.85)',
      },
    },
    {
      name: 'cerca', seed: 37, f: 0.36, k: 0.82, base: 0.87, period: 4500, maxRes: 2.2, detail: 2, sc: 1,
      minW: 80, maxW: 170, minH: 90, maxH: 270, fh: 14, winW: 6, gapMin: 40, gapMax: 210,
      broken: 0.6, smoke: 0.15, cranes: 1, lights: 2, bridges: 1,
      lw: 1.6, thin: 0.7, hw: 0.65, hgap: 3, dots: 0.011, dotS: 1.1, flood: 9,
      c: {
        body: '#6b8d89', side: '#567573', win: '#38504f', dark: '#1d2c2d', glass: '#93b4ad',
        line: 'rgba(14,24,25,0.55)', ink: '#121a1c', hatch: 'rgba(12,20,21,0.42)',
        stain: 'rgba(14,28,28,0.2)', dot: 'rgba(12,20,21,0.42)', water: '#79a29b',
        refl: 'rgba(18,38,38,0.36)', ripple: 'rgba(14,30,30,0.48)', smoke: '#b3c6bf', metal: '#121a1c',
      },
    },
  ];

  // ---------- Generación ----------
  function topAt(P, x) {
    if (x <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) {
      if (x <= P[i][0]) {
        const a = P[i - 1], b = P[i];
        const t = (x - a[0]) / ((b[0] - a[0]) || 1);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return P[P.length - 1][1];
  }

  function makeHole(r, b) {
    const fw = b.w - b.side;
    const hw = fw * (0.22 + r() * 0.3), hh = b.fh * (1.6 + r() * 2.6);
    const cx = b.side + hw / 2 + r() * (fw - hw), cy = -b.h * (0.22 + r() * 0.5);
    if (cy - hh / 2 < topAt(b.P, cx) + b.fh) return null;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, rr = 0.62 + r() * 0.45;
      pts.push([cx + Math.cos(a) * hw / 2 * rr, cy + Math.sin(a) * hh / 2 * rr]);
    }
    return { pts, cx, cy, hw, hh };
  }

  function makeBuilding(r, x, L) {
    const w = L.minW + r() * (L.maxW - L.minW);
    const fh = L.fh;
    const floors = Math.max(3, Math.round((L.minH + Math.pow(r(), 1.3) * (L.maxH - L.minH)) / fh));
    const h = floors * fh;
    const side = Math.round(w * (0.15 + r() * 0.14));
    const broken = r() < L.broken;
    let P;
    if (broken) {
      P = [];
      const n = 4 + Math.floor(r() * 4);
      for (let i = 0; i <= n; i++) {
        const px = (w * i) / n + (i > 0 && i < n ? (r() - 0.5) * (w / n) * 0.5 : 0);
        let y = -h * (0.45 + r() * 0.55);
        if (r() < 0.25) y = -h * (0.28 + r() * 0.2);
        P.push([px, y]);
        if (i < n && r() < 0.55) P.push([px + (w / n) * (0.3 + r() * 0.4), y + (r() - 0.35) * fh * 2.2]);
      }
      P.sort((a, b) => a[0] - b[0]);
      P[0][0] = 0; P[P.length - 1][0] = w;
    } else {
      P = [[0, -h], [w, -h]];
    }
    const b = { type: 'bldg', z: 1, x, w, h, fh, floors, side, P, broken, ext: 22, seed: (r() * 1e9) | 0, bands: r() < 0.33 };
    b.roof = [];
    if (!broken) {
      if (r() < 0.55) b.roof.push({ t: 'tank', x: side + 4 + r() * Math.max(1, w - side - 24) });
      if (r() < 0.5) b.roof.push({ t: 'ant', x: side + r() * (w - side), h: (14 + r() * 30) * L.sc });
      if (r() < 0.6) b.roof.push({ t: 'box', x: side + r() * Math.max(1, w - side - 16), w: (8 + r() * 12) * L.sc, h: (4 + r() * 5) * L.sc });
    }
    b.holes = [];
    if (L.detail >= 1 && r() < (broken ? 0.75 : 0.3)) { const hl = makeHole(r, b); if (hl) b.holes.push(hl); }
    b.smoke = broken && r() < L.smoke;
    return b;
  }

  function makeSmoke(r, b, L) {
    const lx = b.side + r() * (b.w - b.side);
    const top = topAt(b.P, lx);
    const blobs = [];
    let x = 0, y = top, rad = 4.5 * L.sc;
    const drift = 0.5 + r() * 0.7;
    let maxX = 0;
    for (let i = 0; i < 16; i++) {
      blobs.push([x, y, rad, 1 - i / 16]);
      maxX = Math.max(maxX, x + rad);
      y -= rad * 1.05;
      x += drift * rad * 0.55 + (r() - 0.45) * rad * 0.7;
      rad *= 1.11;
      if (y < TOP + 40) break;
    }
    return { type: 'smoke', z: 2, x: b.x + lx - 20, w: maxX + 40, ox: 20, blobs, ext: 10, seed: (r() * 1e9) | 0 };
  }

  function makeCrane(r, x, L) {
    const h = L.maxH * (0.85 + r() * 0.45);
    const jibR = (70 + r() * 100) * L.sc * 1.2, jibL = (25 + r() * 25) * L.sc * 1.2;
    const broken = r() < 0.45;
    return { type: 'crane', z: 0, x: x - jibL - 8, w: jibL + jibR + 16, mx: jibL + 8, h, jibR, jibL, broken, tilt: broken ? 0.25 + r() * 0.45 : 0, cable: 40 + r() * 120, ext: 4, seed: (r() * 1e9) | 0 };
  }

  function makeLight(r, x, L) {
    return { type: 'light', z: 0, x, w: 26 * L.sc, h: L.maxH * (0.55 + r() * 0.4), broken: r() < 0.35, ext: 6, seed: (r() * 1e9) | 0 };
  }

  function makeBridge(r, x, L) {
    const w = 520 + r() * 520;
    return { type: 'bridge', z: 1.5, x, w, y: -(36 + r() * 46) * L.sc, gap: r() < 0.75 ? 0.25 + r() * 0.45 : -1, gapW: (60 + r() * 70) * L.sc, ext: 30, seed: (r() * 1e9) | 0 };
  }

  function buildLayer(L) {
    const r = rng(L.seed);
    const items = [];
    let x = r() * 20;
    while (x < L.period - 10) {
      const b = makeBuilding(r, x, L);
      items.push(b);
      if (b.smoke) items.push(makeSmoke(r, b, L));
      x += b.w + L.gapMin + r() * (L.gapMax - L.gapMin);
    }
    for (let i = 0; i < L.cranes; i++) items.push(makeCrane(r, r() * L.period, L));
    for (let i = 0; i < L.lights; i++) items.push(makeLight(r, r() * L.period, L));
    for (let i = 0; i < L.bridges; i++) items.push(makeBridge(r, r() * L.period, L));
    if (L.obelisk != null) items.push({ type: 'obelisk', z: 1.2, x: L.obelisk - 30, w: 60, ext: 4, seed: 5 });
    items.sort((a, b) => a.z - b.z);
    L.items = items;
    L.ripples = [];
    for (let i = 0; i < L.period / 5; i++) {
      L.ripples.push([r() * L.period, 7 + Math.pow(r(), 1.6) * (BOT - 24), (6 + r() * 26) * L.sc, r() < 0.3]);
    }
    L.cache = new Map();
    L.res = 0;
  }
  LAYERS.forEach(buildLayer);

  // ---------- Dibujo de elementos ----------
  function stipple(g, r, x0, y0, w, h, n, size, bias) {
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * w;
      const y = y0 + h - Math.pow(r(), bias || 1) * h;
      const s = size * (0.5 + r());
      g.fillRect(x, y, s, s);
    }
  }

  function drawBuilding(g, b, L) {
    const C = L.c, r = rng(b.seed);
    const sil = new Path2D();
    sil.moveTo(0, 40);
    for (const p of b.P) sil.lineTo(p[0], p[1]);
    sil.lineTo(b.w, 40);
    sil.closePath();

    g.fillStyle = C.body; g.fill(sil);
    g.save();
    g.clip(sil);

    // cara lateral en sombra con rayado
    g.fillStyle = C.side; g.fillRect(0, -b.h - 60, b.side, b.h + 120);
    g.strokeStyle = C.hatch; g.lineWidth = L.hw;
    g.beginPath();
    for (let y = -b.h - 60; y < 40; y += L.hgap) { g.moveTo(0, y + b.side * 0.7); g.lineTo(b.side, y); }
    g.stroke();

    // losas de cada piso
    g.strokeStyle = C.line; g.lineWidth = L.thin;
    g.beginPath();
    for (let i = 1; i < b.floors; i++) {
      const y = -i * b.fh;
      g.moveTo(b.side, y); g.lineTo(b.w, y);
      g.moveTo(0, y + b.side * 0.12); g.lineTo(b.side, y);
    }
    g.stroke();

    // ventanas
    const fw = b.w - b.side - 4;
    const cols = Math.max(1, Math.floor(fw / (L.winW * 1.85)));
    const cw = fw / cols;
    const inHole = (x, y) => b.holes.some(hl => Math.abs(x - hl.cx) < hl.hw * 0.55 && Math.abs(y - hl.cy) < hl.hh * 0.55);
    for (let i = 0; i < b.floors; i++) {
      const wy = -(i + 1) * b.fh + b.fh * 0.24, wh = b.bands ? b.fh * 0.38 : b.fh * 0.5;
      if (b.bands) {
        const bx = b.side + 2, bw = fw;
        if (wy < topAt(b.P, bx) + 1.5 && wy < topAt(b.P, bx + bw) + 1.5) continue;
        g.fillStyle = C.win;
        for (let c = 0; c < cols; c++) {
          const wx = bx + c * cw;
          if (wy < topAt(b.P, wx + cw / 2) + 1.5 || inHole(wx + cw / 2, wy)) continue;
          g.fillStyle = r() < 0.18 ? C.dark : C.win;
          g.fillRect(wx, wy, cw - L.thin, wh);
        }
        continue;
      }
      for (let c = 0; c < cols; c++) {
        const wx = b.side + 2 + c * cw + (cw - L.winW) / 2;
        if (wy < topAt(b.P, wx) + 1.5 || wy < topAt(b.P, wx + L.winW) + 1.5 || inHole(wx, wy)) continue;
        const k = r();
        if (k < 0.08) continue; // ventana tapiada
        g.fillStyle = k < 0.35 ? C.dark : C.win;
        g.fillRect(wx, wy, L.winW, wh);
        if (L.detail >= 1 && k > 0.35 && k < 0.6) {
          // vidrio roto
          g.fillStyle = C.glass;
          g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + L.winW * (0.4 + r() * 0.5), wy); g.lineTo(wx, wy + wh * (0.4 + r() * 0.5)); g.closePath(); g.fill();
        }
        if (L.detail >= 2) {
          g.strokeStyle = C.line; g.lineWidth = L.thin * 0.8;
          g.beginPath(); g.moveTo(wx + L.winW / 2, wy); g.lineTo(wx + L.winW / 2, wy + wh); g.stroke();
          g.fillStyle = C.glass; g.fillRect(wx - 0.6, wy + wh, L.winW + 1.2, 0.9);
          if (r() < 0.25) { g.fillStyle = C.stain; g.fillRect(wx + r() * L.winW, wy + wh, 0.8, b.fh * (0.6 + r() * 1.6)); }
        }
      }
    }

    // ventanas de la cara lateral
    if (L.detail >= 1 && b.side > 8) {
      g.fillStyle = C.dark;
      for (let i = 0; i < b.floors; i++) {
        const y = -(i + 1) * b.fh + b.fh * 0.28;
        if (y < topAt(b.P, b.side * 0.5) + 2) continue;
        g.beginPath();
        g.moveTo(b.side * 0.3, y + b.side * 0.05); g.lineTo(b.side * 0.72, y);
        g.lineTo(b.side * 0.72, y + b.fh * 0.45); g.lineTo(b.side * 0.3, y + b.side * 0.05 + b.fh * 0.45);
        g.closePath(); g.fill();
      }
    }

    // boquetes con losas expuestas y hierros colgando
    for (const hl of b.holes) {
      g.fillStyle = C.dark;
      g.beginPath(); hl.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill();
      g.strokeStyle = C.glass; g.lineWidth = L.thin * 1.4;
      g.beginPath();
      for (let y = Math.ceil((hl.cy - hl.hh / 2) / b.fh) * b.fh; y < hl.cy + hl.hh / 2; y += b.fh) {
        const half = hl.hw * 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow((y - hl.cy) / (hl.hh / 2), 2)));
        g.moveTo(hl.cx - half * (0.6 + r() * 0.4), y); g.lineTo(hl.cx + half * (0.5 + r() * 0.5), y + (r() - 0.5));
      }
      g.stroke();
      g.strokeStyle = C.line; g.lineWidth = L.thin;
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const sx = hl.cx + (r() - 0.5) * hl.hw * 0.6, sy = hl.cy - hl.hh * 0.3;
        g.moveTo(sx, sy); g.quadraticCurveTo(sx + (r() - 0.5) * 4, sy + hl.hh * 0.3, sx + (r() - 0.5) * 6, sy + hl.hh * (0.35 + r() * 0.3));
      }
      g.stroke();
      g.strokeStyle = C.ink; g.lineWidth = L.thin * 1.2;
      g.beginPath(); hl.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke();
    }

    // marca de la inundación, chorreaduras y punteado
    g.fillStyle = C.stain; g.fillRect(0, -L.flood, b.w, L.flood + 40);
    g.fillRect(0, -L.flood * 2.2, b.w, L.flood * 0.5);
    g.fillStyle = C.dot;
    stipple(g, r, 0, -b.h, b.w, b.h, b.w * b.h * L.dots, L.dotS, 2.2);
    stipple(g, r, 0, -b.h, b.side, b.h, b.side * b.h * L.dots, L.dotS, 1);
    g.restore();

    // hierros en la parte rota
    if (b.broken) {
      g.strokeStyle = C.metal; g.lineWidth = L.thin;
      g.beginPath();
      for (let i = 1; i < b.P.length - 1; i++) {
        if (r() < 0.4) continue;
        const [px, py] = b.P[i];
        for (let k = 0; k < 3; k++) {
          const ox = px + (r() - 0.5) * 6, len = (5 + r() * 12) * L.sc;
          g.moveTo(ox, py + 1); g.quadraticCurveTo(ox + (r() - 0.5) * len, py - len * 0.6, ox + (r() - 0.5) * len * 1.2, py - len);
        }
        // losa que asoma
        g.moveTo(px - 4 * L.sc, py + b.fh * 0.3); g.lineTo(px + 5 * L.sc, py + b.fh * 0.3 + (r() - 0.5) * 2);
      }
      g.stroke();
    }

    // equipamiento en las terrazas
    g.strokeStyle = C.ink; g.lineWidth = L.thin; g.fillStyle = C.side;
    for (const o of b.roof) {
      const y = -b.h;
      if (o.t === 'tank') {
        const s = L.sc;
        g.beginPath(); g.moveTo(o.x + 2 * s, y); g.lineTo(o.x + 2 * s, y - 6 * s); g.moveTo(o.x + 10 * s, y); g.lineTo(o.x + 10 * s, y - 6 * s); g.stroke();
        g.beginPath(); g.rect(o.x, y - 15 * s, 12 * s, 9 * s); g.fill(); g.stroke();
        g.beginPath(); g.ellipse(o.x + 6 * s, y - 15 * s, 6 * s, 1.6 * s, 0, 0, 7); g.fill(); g.stroke();
      } else if (o.t === 'ant') {
        g.beginPath(); g.moveTo(o.x, y); g.lineTo(o.x, y - o.h);
        for (let k = 1; k < 4; k++) { const yy = y - (o.h * k) / 4; g.moveTo(o.x - 3 * L.sc, yy); g.lineTo(o.x + 3 * L.sc, yy); }
        g.stroke();
      } else {
        g.beginPath(); g.rect(o.x, y - o.h, o.w, o.h); g.fill(); g.stroke();
      }
    }
    if (!b.broken) {
      g.strokeStyle = C.line; g.lineWidth = L.thin;
      g.beginPath(); g.moveTo(b.side, -b.h + 1.6 * L.sc); g.lineTo(b.w, -b.h + 1.6 * L.sc); g.stroke();
    }

    // contorno con peso variable: más grueso en el borde en sombra
    g.strokeStyle = C.ink; g.lineWidth = L.lw; g.lineJoin = 'round';
    g.stroke(sil);
    g.lineWidth = L.lw * 1.8;
    g.beginPath(); g.moveTo(0, 40); g.lineTo(b.P[0][0], b.P[0][1]); g.stroke();
    g.lineWidth = L.lw * 0.7;
    g.beginPath(); g.moveTo(b.side, 40); g.lineTo(b.side, topAt(b.P, b.side)); g.stroke();
  }

  function drawSmoke(g, it, L) {
    const C = L.c;
    g.translate(it.ox, 0);
    for (let i = it.blobs.length - 1; i >= 0; i--) {
      const [x, y, rad, a] = it.blobs[i];
      g.globalAlpha = 0.1 + a * 0.4;
      g.fillStyle = C.smoke;
      g.beginPath(); g.ellipse(x, y, rad * 1.3, rad * 0.8, -0.3, 0, 7); g.fill();
      g.globalAlpha = 0.08 + a * 0.25;
      g.strokeStyle = C.ink; g.lineWidth = L.thin * 0.8;
      g.beginPath(); g.ellipse(x, y, rad * 1.3, rad * 0.8, -0.3, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
    }
    g.globalAlpha = 1;
  }

  function lattice(g, ax, ay, bx, by, w, step) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * w / 2, ny = dx / len * w / 2;
    g.moveTo(ax + nx, ay + ny); g.lineTo(bx + nx, by + ny);
    g.moveTo(ax - nx, ay - ny); g.lineTo(bx - nx, by - ny);
    const n = Math.max(1, Math.floor(len / step));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, s = i % 2 ? 1 : -1;
      g.moveTo(ax + dx * t0 + nx * s, ay + dy * t0 + ny * s);
      g.lineTo(ax + dx * t1 - nx * s, ay + dy * t1 - ny * s);
    }
  }

  function drawCrane(g, it, L) {
    const C = L.c, s = L.sc;
    g.translate(it.mx, 0);
    g.strokeStyle = C.metal; g.lineWidth = L.thin;
    g.beginPath();
    lattice(g, 0, 40, 0, -it.h, 7 * s, 8 * s);
    const ex = Math.cos(it.tilt) * it.jibR, ey = -it.h + Math.sin(it.tilt) * it.jibR;
    lattice(g, -it.jibL, -it.h, 0, -it.h, 5 * s, 7 * s);
    lattice(g, 0, -it.h, ex, ey, 5 * s, 7 * s);
    // tensores y cable con gancho
    g.moveTo(0, -it.h - 14 * s); g.lineTo(ex * 0.6, ey * 0.6 - it.h * 0.4 + Math.sin(it.tilt) * 2);
    g.moveTo(0, -it.h - 14 * s); g.lineTo(-it.jibL, -it.h);
    g.moveTo(0, -it.h); g.lineTo(0, -it.h - 14 * s);
    const hx = ex * 0.8, hy = -it.h + Math.sin(it.tilt) * it.jibR * 0.8;
    g.moveTo(hx, hy); g.lineTo(hx + (it.broken ? 6 : 0), hy + it.cable);
    g.stroke();
    g.fillStyle = C.metal;
    g.fillRect(-it.jibL - 2 * s, -it.h + 2 * s, 10 * s, 7 * s);
    g.fillRect(-4 * s, -it.h + 3 * s, 8 * s, 6 * s);
    g.beginPath(); g.arc(hx + (it.broken ? 6 : 0), hy + it.cable + 2 * s, 2 * s, 0, Math.PI); g.stroke();
  }

  function drawLight(g, it, L) {
    const C = L.c, s = L.sc, cx = it.w / 2, r = rng(it.seed);
    g.strokeStyle = C.metal; g.lineWidth = L.thin;
    g.save();
    if (it.broken) { g.translate(cx, -it.h * 0.55); g.rotate(0.35); g.translate(-cx, it.h * 0.55); }
    g.beginPath();
    lattice(g, cx, 40, cx, -it.h, 4 * s, 9 * s);
    g.stroke();
    const hw = 22 * s, hh = 12 * s, hx = cx - hw / 2, hy = -it.h - hh;
    g.fillStyle = C.metal; g.fillRect(hx, hy, hw, hh);
    g.fillStyle = C.glass;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
      if (r() < 0.3) continue;
      g.fillRect(hx + 1.5 * s + j * 5 * s, hy + 1.5 * s + i * 3.5 * s, 3.4 * s, 2.4 * s);
    }
    g.restore();
  }

  function drawBridge(g, it, L) {
    const C = L.c, s = L.sc, r = rng(it.seed);
    const th = 9 * s, y = it.y;
    const gx = it.gap > 0 ? it.w * it.gap : -1, gw = it.gapW;
    const solid = x => gx < 0 || x < gx || x > gx + gw;
    // pilares
    for (let x = 30; x < it.w - 10; x += 95 * s) {
      if (!solid(x) || !solid(x + 9 * s)) continue;
      g.fillStyle = C.side; g.fillRect(x, y + th, 9 * s, 40 - y - th);
      g.strokeStyle = C.hatch; g.lineWidth = L.hw;
      g.beginPath(); for (let yy = y + th; yy < 40; yy += L.hgap) { g.moveTo(x, yy + 3 * s); g.lineTo(x + 4 * s, yy); } g.stroke();
      g.strokeStyle = C.ink; g.lineWidth = L.thin * 1.4; g.strokeRect(x, y + th, 9 * s, 40 - y - th);
      g.fillStyle = C.side; g.fillRect(x - 3 * s, y + th, 15 * s, 3 * s);
      g.strokeRect(x - 3 * s, y + th, 15 * s, 3 * s);
    }
    const deck = (a, b) => {
      g.fillStyle = C.body; g.fillRect(a, y, b - a, th);
      g.fillStyle = C.side; g.fillRect(a, y + th * 0.62, b - a, th * 0.38);
      g.fillStyle = C.dot; stipple(g, r, a, y, b - a, th, (b - a) * th * L.dots * 1.5, L.dotS, 1);
      g.strokeStyle = C.ink; g.lineWidth = L.lw; g.strokeRect(a, y, b - a, th);
      // baranda
      g.strokeStyle = C.metal; g.lineWidth = L.thin;
      g.beginPath();
      g.moveTo(a, y - 7 * s); g.lineTo(b, y - 7 * s);
      g.moveTo(a, y - 4 * s); g.lineTo(b, y - 4 * s);
      for (let x = a + 2; x < b; x += 12 * s) { g.moveTo(x, y); g.lineTo(x + (r() < 0.1 ? 3 : 0), y - 8 * s); }
      g.stroke();
    };
    if (gx < 0) deck(0, it.w);
    else {
      deck(0, gx); deck(gx + gw, it.w);
      // tramo caído y hierros
      g.save();
      g.translate(gx, y); g.rotate(0.9);
      g.fillStyle = C.body; g.fillRect(0, 0, gw * 0.7, th);
      g.strokeStyle = C.ink; g.lineWidth = L.lw; g.strokeRect(0, 0, gw * 0.7, th);
      g.restore();
      g.strokeStyle = C.metal; g.lineWidth = L.thin;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const yy = y + 2 + k * 2;
        g.moveTo(gx + gw, yy); g.quadraticCurveTo(gx + gw - 6 * s, yy + 4, gx + gw - (8 + r() * 10) * s, yy + (4 + r() * 10) * s);
      }
      g.stroke();
    }
  }

  function drawObelisk(g, it, L) {
    const C = L.c, h = 400, w = 34, cx = it.w / 2, r = rng(3);
    const body = new Path2D();
    body.moveTo(cx - w / 2, 40); body.lineTo(cx - w * 0.3, -h); body.lineTo(cx, -h - 26); body.lineTo(cx + w * 0.3, -h); body.lineTo(cx + w / 2, 40); body.closePath();
    g.fillStyle = '#b4cdc5'; g.fill(body);
    g.save(); g.clip(body);
    g.fillStyle = C.side; g.beginPath(); g.moveTo(cx - w / 2, 40); g.lineTo(cx - w * 0.3, -h); g.lineTo(cx, -h - 26); g.lineTo(cx - 4, 40); g.closePath(); g.fill();
    g.strokeStyle = C.hatch; g.lineWidth = L.hw;
    g.beginPath(); for (let y = -h; y < 40; y += L.hgap) { g.moveTo(cx - w / 2, y + 5); g.lineTo(cx - 4, y); } g.stroke();
    g.strokeStyle = C.line; g.lineWidth = L.thin;
    g.beginPath(); for (let y = -h + 30; y < 40; y += 22) { g.moveTo(cx - w / 2, y); g.lineTo(cx + w / 2, y + (r() - 0.5)); } g.stroke();
    g.fillStyle = C.dot; stipple(g, r, cx - w / 2, -h, w, h + 40, w * h * L.dots * 1.4, L.dotS, 2);
    g.fillStyle = C.stain; g.fillRect(cx - w, -L.flood * 2, w * 2, L.flood * 2 + 40);
    g.restore();
    g.fillStyle = C.dark; g.fillRect(cx - 2, -h + 14, 4, 7);
    g.strokeStyle = C.ink; g.lineWidth = L.lw; g.stroke(body);
  }

  const DRAW = { bldg: drawBuilding, smoke: drawSmoke, crane: drawCrane, light: drawLight, bridge: drawBridge, obelisk: drawObelisk };

  function renderChunk(L, ci) {
    const res = L.res;
    const c = document.createElement('canvas');
    c.width = Math.ceil((CW + PAD) * res);
    c.height = Math.ceil((BOT - TOP) * res);
    const g = c.getContext('2d');
    const x0 = ci * CW, xa = x0 - 2, xb = x0 + CW + PAD + 2;
    g.setTransform(res, 0, 0, res, -x0 * res, -TOP * res);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const visible = [];
    for (const it of L.items) {
      for (const sh of [-L.period, 0, L.period]) {
        const ix = it.x + sh;
        if (ix + it.w + it.ext < xa || ix - it.ext > xb) continue;
        visible.push([it, ix]);
        g.save(); g.translate(ix, 0); DRAW[it.type](g, it, L); g.restore();
      }
    }
    // agua con reflejos cortados y ondas
    const C = L.c;
    g.fillStyle = C.water; g.fillRect(xa, 2, xb - xa, BOT);
    g.fillStyle = C.refl;
    for (const [it, ix] of visible) {
      if (it.type !== 'bldg' && it.type !== 'obelisk') continue;
      const r = rng(it.seed + 7), h = it.type === 'bldg' ? it.h : 400;
      for (let y = 6; y < 6 + Math.min(h * 0.4, 110); y += 4.5) {
        if (r() < 0.25) continue;
        const k = 1 - (y - 6) / 120;
        g.fillRect(ix + r() * 4, y, it.w * (0.45 + r() * 0.55) * k, 2.2);
      }
    }
    g.strokeStyle = C.ripple; g.lineWidth = L.thin;
    g.beginPath();
    for (const sh of [-L.period, 0, L.period]) {
      for (const [rx, ry, len, light] of L.ripples) {
        const x = rx + sh;
        if (light || x + len < xa || x > xb) continue;
        g.moveTo(x, ry); g.quadraticCurveTo(x + len / 2, ry - 1.4, x + len, ry);
      }
    }
    g.stroke();
    g.strokeStyle = 'rgba(235,245,240,0.55)';
    g.beginPath();
    for (const sh of [-L.period, 0, L.period]) {
      for (const [rx, ry, len, light] of L.ripples) {
        const x = rx + sh;
        if (!light || x + len < xa || x > xb) continue;
        g.moveTo(x, ry); g.lineTo(x + len * 0.7, ry);
      }
    }
    g.stroke();
    g.fillStyle = 'rgba(235,245,240,0.6)'; g.fillRect(xa, 1.5, xb - xa, L.thin * 1.4);
    g.fillStyle = C.ripple; g.fillRect(xa, 2 + L.thin * 1.4, xb - xa, L.thin);
    return c;
  }

  // ---------- Caché de tramos ----------
  let frameNo = 0, budget = 0;
  function chunk(L, ci, sync) {
    let e = L.cache.get(ci);
    if (!e) {
      if (!sync) { if (budget <= 0) return null; budget--; }
      e = { c: renderChunk(L, ci), used: 0 };
      L.cache.set(ci, e);
      if (L.cache.size > 10) {
        let worst = null;
        for (const [k, v] of L.cache) if (!worst || v.used < worst[1].used) worst = [k, v];
        if (worst && worst[0] !== ci) L.cache.delete(worst[0]);
      }
    }
    e.used = frameNo;
    return e.c;
  }

  function clear() { LAYERS.forEach(L => { L.cache.clear(); }); clouds.forEach(c => { c.sprite = null; }); }

  function drawLayer(ctx, W, H, cam, s, base, L) {
    const res = Math.min(L.maxRes, Math.round(base * L.k * 4) / 4);
    if (res !== L.res) { L.res = res; L.cache.clear(); }
    const k = s * L.k;
    const baseY = H * L.base - (cam.y - 420) * L.f * 0.5 * s;
    const off = cam.x * L.f;
    const left = off - W / 2 / k, right = off + W / 2 / k;
    const n = L.period / CW;
    const i0 = Math.floor(left / CW), i1 = Math.floor(right / CW);
    for (let i = i0; i <= i1; i++) {
      const c = chunk(L, mod(i, n), true);
      ctx.drawImage(c, W / 2 + (i * CW - off) * k, baseY + TOP * k, (CW + PAD) * k, (BOT - TOP) * k);
    }
    // anticipa el tramo siguiente en ambas direcciones
    chunk(L, mod(i1 + 1, n), false);
    chunk(L, mod(i0 - 1, n), false);
    const bottom = baseY + BOT * k - 1;
    if (bottom < H) { ctx.fillStyle = L.c.water; ctx.fillRect(0, bottom, W, H - bottom); }
  }

  // ---------- Cielo ----------
  const CLOUD = { body: '#56777a', light: '#9dbcb8', dark: '#2f4548', ink: '#1b2729' };
  const SKY_PERIOD = 5200;

  // Nubes como en las viñetas: base plana, cúmulos que crecen hacia el centro, tinta continua,
  // luz arriba, panza oscura con rayado y estelas finas que se estiran hacia los costados.
  function makeCloud(seed, kind) {
    const r = rng(seed);
    const stratus = kind === 'stratus';
    const w = stratus ? 520 + r() * 420 : 300 + r() * 280;
    const h = stratus ? 14 + r() * 10 : 64 + r() * 50;
    const skew = 0.8 + r() * 0.5; // asimetría: la cumbre no queda siempre al centro
    const bell = t => Math.pow(Math.sin(Math.PI * Math.pow(t, skew)), 1.1);
    const lobes = [];
    const row = (n, t0, t1, rk, yk, jit) => {
      for (let i = 0; i < n; i++) {
        const t = t0 + (t1 - t0) * ((i + 0.5 + (r() - 0.5) * 0.6) / n);
        const b = bell(t);
        const rad = h * (rk[0] + rk[1] * b) * (0.82 + r() * 0.36);
        const y = yk(b, rad) * (1 - jit / 2 + r() * jit);
        lobes.push([(t - 0.5) * w, y, rad]);
      }
    };
    if (stratus) {
      row(Math.round(w / 18), 0.02, 0.98, [0.45, 0.6], (b, rad) => -rad * 0.45 - b * h * 0.2, 0.3);
    } else {
      const n = Math.round(w / 24);
      row(n, 0.03, 0.97, [0.2, 0.22], (b, rad) => -rad * 0.5, 0.2);
      row(Math.round(n * 0.6), 0.14, 0.86, [0.2, 0.3], b => -(h * 0.22 + h * 0.36 * b), 0.25);
      row(Math.round(n * 0.32), 0.3, 0.72, [0.17, 0.2], b => -(h * 0.5 + h * 0.4 * b), 0.2);
    }
    const wisps = [];
    const nw = stratus ? 2 : 1 + Math.floor(r() * 2);
    for (let i = 0; i < nw; i++) {
      const side = stratus ? (i ? 1 : -1) : (r() < 0.5 ? -1 : 1);
      const len = (stratus ? 120 + r() * 160 : 80 + r() * 120) * side;
      wisps.push({ sx: side * w * 0.42, sy: -2 - r() * (stratus ? 3 : 6), len, curl: (r() - 0.3) * 6, th: stratus ? 4 + r() * 3 : 6 + r() * 5 });
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
    for (const [x, y, rad] of lobes) { x0 = Math.min(x0, x - rad); x1 = Math.max(x1, x + rad); y0 = Math.min(y0, y - rad); }
    for (const wp of wisps) { x0 = Math.min(x0, wp.sx, wp.sx + wp.len); x1 = Math.max(x1, wp.sx, wp.sx + wp.len); }
    return { kind, w, h, lobes, wisps, box: [x0 - 6, y0 - 6, x1 + 6, 6], seed, sprite: null, res: 0 };
  }

  function wispPath(g, wp, grow) {
    const n = 18, top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = wp.sx + wp.len * t, y = wp.sy + wp.curl * t * t;
      const th = wp.th * Math.pow(1 - t, 0.8) + grow;
      top.push([x, y - th * 0.55]); bot.push([x, y + th * 0.45]);
    }
    g.beginPath();
    top.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
    g.closePath();
  }

  function renderCloud(cl, res) {
    const [bx0, by0, bx1, by1] = cl.box;
    const c = document.createElement('canvas');
    c.width = Math.ceil((bx1 - bx0) * res);
    c.height = Math.ceil((by1 - by0) * res);
    const g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, -bx0 * res, -by0 * res);
    const r = rng(cl.seed + 1);
    const lw = cl.kind === 'stratus' ? 1.2 : 1.8;
    const clipBase = lim => { g.save(); g.beginPath(); g.rect(bx0, by0, bx1 - bx0, lim - by0); g.clip(); };

    // tinta: siluetas un poco más grandes debajo del relleno
    g.fillStyle = CLOUD.ink;
    clipBase(lw);
    for (const [x, y, rad] of cl.lobes) { g.beginPath(); g.arc(x, y, rad + lw, 0, 7); g.fill(); }
    g.restore();
    for (const wp of cl.wisps) { wispPath(g, wp, lw * 1.6); g.fill(); }
    // relleno
    g.fillStyle = CLOUD.body;
    clipBase(0);
    for (const [x, y, rad] of cl.lobes) { g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
    g.restore();
    for (const wp of cl.wisps) { wispPath(g, wp, 0); g.fill(); }

    g.globalCompositeOperation = 'source-atop';
    // luz que entra desde arriba a la izquierda (bandas suaves, no círculos sueltos)
    const lg = g.createLinearGradient(0, -cl.h * 1.15, 0, -cl.h * 0.15);
    lg.addColorStop(0, 'rgba(176,206,200,0.95)'); lg.addColorStop(1, 'rgba(176,206,200,0)');
    g.fillStyle = lg; g.fillRect(bx0, by0, bx1 - bx0, cl.h * 1.2);
    g.fillStyle = 'rgba(214,232,226,0.35)';
    for (const [x, y, rad] of cl.lobes) {
      if (y > -cl.h * 0.5 || r() < 0.5) continue;
      g.beginPath(); g.ellipse(x - rad * 0.3, y - rad * 0.5, rad * 0.55, rad * 0.3, -0.3, 0, 7); g.fill();
    }
    // panza en sombra
    const grad = g.createLinearGradient(0, -cl.h * 0.55, 0, 2);
    grad.addColorStop(0, 'rgba(47,69,72,0)'); grad.addColorStop(1, 'rgba(37,56,59,0.95)');
    g.fillStyle = grad; g.fillRect(bx0, -cl.h * 0.6, bx1 - bx0, cl.h * 0.6 + 20);
    // contornos internos de cada cúmulo (lado en sombra)
    g.strokeStyle = 'rgba(27,39,41,0.6)'; g.lineWidth = 0.9; g.lineCap = 'round';
    for (const [x, y, rad] of cl.lobes) {
      if (y + rad < -2 || r() < 0.25) {
        const a0 = Math.PI * (0.05 + r() * 0.15), a1 = a0 + Math.PI * (0.35 + r() * 0.25);
        g.beginPath(); g.arc(x, y, rad * 0.94, a0, a1); g.stroke();
      }
    }
    // rayado de la panza
    g.strokeStyle = 'rgba(20,32,34,0.4)'; g.lineWidth = 0.7;
    g.beginPath();
    for (let x = bx0; x < bx1; x += 2.6 + r() * 1.4) {
      const l = 3 + r() * (cl.kind === 'stratus' ? 4 : 9);
      g.moveTo(x, -0.5); g.lineTo(x + l * 0.6, -0.5 - l);
    }
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    return { c, ox: -bx0, oy: -by0 };
  }

  const clouds = (function () {
    const r = rng(77), list = [];
    for (let i = 0; i < 7; i++) {
      const cl = makeCloud(500 + i * 13, 'cumulus');
      cl.x = (i / 7) * SKY_PERIOD + r() * 260;
      cl.y = 0.1 + r() * 0.22;
      cl.depth = 0.8 + r() * 0.35;
      cl.alpha = 0.92;
      list.push(cl);
    }
    for (let i = 0; i < 5; i++) {
      const cl = makeCloud(900 + i * 17, 'stratus');
      cl.x = (i / 5) * SKY_PERIOD + r() * 500;
      cl.y = 0.3 + r() * 0.14;
      cl.depth = 0.5 + r() * 0.2;
      cl.alpha = 0.55;
      list.push(cl);
    }
    list.sort((a, b) => a.depth - b.depth);
    return list;
  })();

  let skyGrad = null, skyH = 0, glow = null, glowKey = '';
  function drawSky(ctx, W, H) {
    if (!skyGrad || skyH !== H) {
      skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, '#5e8b8b');
      skyGrad.addColorStop(0.42, '#9cc2b9');
      skyGrad.addColorStop(0.72, '#cde1d6');
      skyGrad.addColorStop(1, '#dbe9de');
      skyH = H;
    }
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, H);
    const key = W + 'x' + H;
    if (glowKey !== key) {
      glow = ctx.createRadialGradient(W * 0.64, H * 0.52, 0, W * 0.64, H * 0.52, H * 0.85);
      glow.addColorStop(0, 'rgba(244,248,236,0.65)');
      glow.addColorStop(1, 'rgba(244,248,236,0)');
      glowKey = key;
    }
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  }

  function drawClouds(ctx, W, H, cam, s, base, t) {
    const res = Math.min(1.6, Math.round(base * 0.55 * 4) / 4);
    for (const cl of clouds) {
      if (!cl.sprite || cl.res !== res) { cl.sprite = renderCloud(cl, res); cl.res = res; }
      const k = s * 0.55 * cl.depth;
      const off = cam.x * 0.025 * cl.depth + t * 0.04 * cl.depth;
      const x = mod(cl.x - off, SKY_PERIOD) - 600;
      const sx = x * k;
      const sy = H * cl.y - (cam.y - 420) * 0.012 * s + cl.h * k;
      const sp = cl.sprite;
      const dw = sp.c.width / res * k, dh = sp.c.height / res * k;
      const dx = sx - sp.ox * k, dy = sy - sp.oy * k;
      if (dx > W || dx + dw < 0) continue;
      ctx.globalAlpha = cl.alpha;
      ctx.drawImage(sp.c, dx, dy, dw, dh);
    }
    ctx.globalAlpha = 1;
  }

  function drawBirds(ctx, W, H, cam, s, t) {
    const x0 = mod(W * 0.2 + t * 0.35 * s - cam.x * 0.03 * s, W + 400) - 200, y0 = H * 0.18;
    ctx.strokeStyle = 'rgba(27,39,41,0.75)'; ctx.lineWidth = Math.max(1, s * 0.7); ctx.lineCap = 'round';
    ctx.beginPath();
    const pos = [[0, 0], [16, -6], [30, 4], [8, 14], [42, -2]];
    pos.forEach(([bx, by], i) => {
      const flap = Math.sin(t * 0.18 + i * 1.7) * 2.2 * s;
      const x = x0 + bx * s, y = y0 + by * s + Math.sin(t * 0.02 + i) * 2 * s, w = 4.5 * s;
      ctx.moveTo(x - w, y - flap); ctx.quadraticCurveTo(x - w * 0.4, y - flap * 0.2, x, y + 1.5 * s);
      ctx.quadraticCurveTo(x + w * 0.4, y - flap * 0.2, x + w, y - flap);
    });
    ctx.stroke();
  }

  function haze(ctx, W, H, a) {
    ctx.fillStyle = 'rgba(214,232,222,' + a + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // base = escala sin zoom (para no regenerar los tramos cuando la cámara se aleja o acerca)
  function draw(ctx, W, H, cam, s, t) {
    frameNo++;
    budget = 1;
    const base = s / (cam.zoom || 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawSky(ctx, W, H);
    drawClouds(ctx, W, H, cam, s, base, t || 0);
    drawBirds(ctx, W, H, cam, s, t || 0);
    drawLayer(ctx, W, H, cam, s, base, LAYERS[0]);
    haze(ctx, W, H, 0.12);
    drawLayer(ctx, W, H, cam, s, base, LAYERS[1]);
    haze(ctx, W, H, 0.08);
    drawLayer(ctx, W, H, cam, s, base, LAYERS[2]);
    haze(ctx, W, H, 0.04);
  }

  root.BobBackdrop = { draw, clear, _debug: { clouds, renderCloud } };
})(window);
