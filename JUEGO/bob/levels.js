// Niveles de BoB. El terreno se dibuja con trazos: rectas (l), curvas suaves (s) y rampas (q).
(function (root) {
  'use strict';

  const BOTTOM = 1500;

  class Path {
    constructor(x, y) { this.pts = [[x, y]]; }
    last() { return this.pts[this.pts.length - 1]; }
    l(x, y) { this.pts.push([x, y]); return this; }
    h(dx) { const [x, y] = this.last(); return this.l(x + dx, y); }
    // Curva en S con tangentes horizontales en ambos extremos: lomas y valles suaves.
    s(x, y) {
      const [x0, y0] = this.last();
      return this.c(x0 + (x - x0) / 2, y0, x0 + (x - x0) / 2, y, x, y);
    }
    q(cx, cy, x, y) {
      const [x0, y0] = this.last();
      const n = Math.max(8, Math.ceil((Math.abs(x - x0) + Math.abs(y - y0)) / 14));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        this.pts.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]);
      }
      return this;
    }
    c(c1x, c1y, c2x, c2y, x, y) {
      const [x0, y0] = this.last();
      const n = Math.max(8, Math.ceil((Math.abs(x - x0) + Math.abs(y - y0)) / 14));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        this.pts.push([
          u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
          u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
        ]);
      }
      return this;
    }
  }

  class Level {
    constructor(name) {
      this.name = name;
      this.ground = []; this.solids = []; this.oneWays = [];
      this.beans = []; this.springs = []; this.checkpoints = []; this.signs = [];
      this.spawn = { x: 0, y: 0 }; this.goal = { x: 0, y: 0 };
      this.waterY = 1000;
    }
    path(x, y) { return new Path(x, y); }
    addGround(path) {
      const top = path.pts;
      const first = top[0], last = top[top.length - 1];
      this.ground.push({ top, poly: top.concat([[last[0], BOTTOM], [first[0], BOTTOM]]) });
      return this;
    }
    block(x0, y0, x1, y1) {
      this.solids.push({ poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
      return this;
    }
    platform(x, y, w) { this.oneWays.push({ x, y, w }); return this; }
    topY(x) {
      for (const g of this.ground) {
        const t = g.top;
        if (x < t[0][0] || x > t[t.length - 1][0]) continue;
        for (let i = 1; i < t.length; i++) {
          if (x <= t[i][0] && t[i][0] !== t[i - 1][0]) {
            const k = (x - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
            return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * k;
          }
        }
      }
      return null;
    }
    // Hilera de cafés siguiendo el relieve.
    along(x0, x1, step, lift) {
      for (let x = x0; x <= x1; x += step) {
        const y = this.topY(x);
        if (y !== null) this.beans.push([x, y - lift]);
      }
      return this;
    }
    // Arco de cafés entre dos puntos, útil para marcar el salto ideal.
    arc(x0, y0, x1, y1, height, n) {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        this.beans.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * height]);
      }
      return this;
    }
    bean(x, y) { this.beans.push([x, y]); return this; }
    spring(x) { this.springs.push({ x, y: this.topY(x) }); return this; }
    checkpoint(x, y) { this.checkpoints.push({ x, y: y === undefined ? this.topY(x) : y }); return this; }
    sign(x, text) { this.signs.push({ x, y: this.topY(x), text }); return this; }
  }

  function level1() {
    const L = new Level('Av. 9 de Julio inundada');

    // Tramo inicial: llano para aprender a correr y saltar, con una loma suave.
    L.addGround(
      L.path(-300, 600).l(800, 600)
        .s(1250, 540).l(1500, 540)
        // Gran bajada: acá se gana el impulso.
        .s(2100, 760).l(2400, 760)
        // Rampa de lanzamiento sobre el pozo.
        .q(2700, 760, 2850, 640)
    );
    // Aterrizaje y pozo con resorte.
    L.addGround(L.path(3040, 650).l(3600, 650));
    L.spawn = { x: 40, y: 600 };

    // Cadena de plataformas hacia la zona de paredes.
    L.platform(3600, 500, 300).platform(3990, 420, 220).platform(4290, 340, 220);

    // Pasillo con pared para saltar de pared en pared.
    L.addGround(L.path(4650, 520).l(5100, 520).l(5100, 130).l(5700, 130)
      // Descenso largo a toda velocidad.
      .s(6800, 560).l(7050, 560)
      .s(7350, 500).s(7650, 560).l(7900, 560)
      .l(9100, 560));
    L.block(4700, -500, 4900, 440);
    // Túnel bajo: solo se cruza deslizándose.
    L.block(7950, 200, 8350, 520);

    L.checkpoint(40, 600);
    L.checkpoint(1550, 540);
    L.checkpoint(3250, 650);
    L.checkpoint(4720, 520);
    L.checkpoint(5400, 130);
    L.checkpoint(7000, 560);
    L.goal = { x: 8800, y: 560 };

    L.spring(3430);

    L.sign(160, '← →  correr');
    L.sign(700, '↑  saltar (mantené para más altura)');
    L.sign(1350, 'Las bajadas dan impulso');
    L.sign(2150, '↓  deslizarse');
    L.sign(2520, '¡Rampa! Llegá con velocidad');
    L.sign(3330, 'Resorte');
    L.sign(4600, 'Contra la pared: saltá para impulsarte');
    L.sign(7820, '↓  deslizate bajo el túnel');

    // Cafés
    L.along(300, 720, 70, 42);
    L.bean(930, 420).bean(990, 400).bean(1050, 420);
    L.platform(900, 470, 180);
    L.along(1000, 1450, 75, 42);
    L.along(1650, 2060, 65, 42);
    L.arc(2860, 600, 3030, 610, 110, 5);
    L.along(3150, 3380, 70, 42);
    L.bean(3720, 460).bean(3800, 460);
    L.bean(4070, 380).bean(4140, 380);
    L.bean(4370, 300).bean(4440, 300);
    L.bean(5000, 400).bean(5000, 330).bean(5000, 260).bean(5000, 190);
    L.along(5160, 5640, 80, 42);
    L.along(5850, 6700, 80, 46);
    L.along(6900, 7650, 80, 42);
    L.along(7980, 8320, 70, 28);
    L.along(8450, 8700, 80, 42);

    return L;
  }

  const api = { Level, Path, levels: [level1] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BobLevels = api;
})(typeof window !== 'undefined' ? window : globalThis);



