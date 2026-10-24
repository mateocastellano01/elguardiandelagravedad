// Animaciones de BoB definidas como poses clave interpoladas con Catmull-Rom.
// Una pose es un objeto de números (ver KEYS). Las coordenadas son locales al personaje:
// origen = centro del círculo de los pies, +x adelante, +y abajo, suelo en y = 13.
(function (root) {
  'use strict';

  const KEYS = ['hip', 'lean', 'fax', 'fay', 'fbx', 'fby', 'hax', 'hay', 'hbx', 'hby', 'head', 'body', 'cup'];
  const BASE = { hip: -12, lean: 0.02, fax: 3, fay: 13, fbx: -3, fby: 13, hax: 3, hay: -15, hbx: -3, hby: -15, head: 0, body: 0, cup: 0 };

  // fa/fb = pie delantero/trasero, ha/hb = mano delantera/trasera.
  function K(o) {
    const p = Object.assign({}, BASE, o);
    if (o.fa) { p.fax = o.fa[0]; p.fay = o.fa[1]; }
    if (o.fb) { p.fbx = o.fb[0]; p.fby = o.fb[1]; }
    if (o.ha) { p.hax = o.ha[0]; p.hay = o.ha[1]; }
    if (o.hb) { p.hbx = o.hb[0]; p.hby = o.hb[1]; }
    delete p.fa; delete p.fb; delete p.ha; delete p.hb;
    return p;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  function sampleKeys(keys, u, loop) {
    const n = keys.length;
    let i, t, idx;
    if (loop) {
      const pos = (((u % 1) + 1) % 1) * n;
      i = Math.floor(pos); t = pos - i;
      idx = [(i - 1 + n) % n, i % n, (i + 1) % n, (i + 2) % n];
    } else {
      const pos = clamp(u, 0, 1) * (n - 1);
      i = Math.min(Math.floor(pos), n - 2); t = pos - i;
      idx = [Math.max(i - 1, 0), i, i + 1, Math.min(i + 2, n - 1)];
    }
    const out = {};
    for (const k of KEYS) out[k] = cr(keys[idx[0]][k], keys[idx[1]][k], keys[idx[2]][k], keys[idx[3]][k], t);
    return out;
  }

  // ---- Carrera: ciclo continuo, el pie sube al balancearse hacia adelante y apoya yendo hacia atrás ----
  function runPose(u, speed) {
    const sp = clamp(speed == null ? 9.5 : speed, 2, 17);
    const ph = u * Math.PI * 2;
    const sw = 7 + 0.4 * sp, lift = 8 + 0.45 * sp, arm = 7 + 0.5 * sp;
    const lean = 0.06 + 0.014 * sp;
    const s = Math.sin(ph), c = Math.cos(ph);
    return K({
      hip: -12 + 1.2 * Math.cos(2 * ph) - sp * 0.04,
      lean,
      fa: [s * sw, 13 - Math.max(0, c) * lift],
      fb: [-s * sw, 13 - Math.max(0, -c) * lift],
      ha: [-s * arm + 2, -17 + s * 3.5 - sp * 0.1],
      hb: [s * arm + 2, -17 - s * 3.5 - sp * 0.1],
      head: lean * 0.3 + Math.sin(2 * ph) * 0.012,
    });
  }

  function wallRunPose(u) {
    const s = Math.sin(u * Math.PI * 2);
    return K({
      hip: -9, lean: -0.05, head: -0.05,
      fa: [10, 6 + 5 * s], fb: [10, 6 - 5 * s],
      ha: [13, -46 - 4 * s], hb: [13, -46 + 4 * s],
    });
  }

  const SLIDE_END = K({ body: -1.15, hip: -2, fa: [8, 13], fb: [3, 13], ha: [14, -12], hb: [10, -6], lean: 0.05 });

  // frames = cuántos dibujos hay que hacer. fps = velocidad de reproducción por defecto.
  // loop = el último frame enlaza con el primero. Los de una sola pasada reparten sus frames entre 0 y 1.
  const defs = {
    idle: {
      frames: 8, fps: 8, loop: true,
      desc: 'De pie, respirando. Peso apoyado en ambos pies, brazos sueltos.',
      keys: [
        K({}),
        K({ hip: -12.6, hay: -15.8, hby: -15.8, head: 0.02, lean: 0.03 }),
        K({ hip: -12.2, hay: -15.4, hby: -15.4, head: 0.01 }),
        K({ hip: -11.6, hay: -14.4, hby: -14.4, head: -0.015, lean: 0.01 }),
      ],
    },
    idle_sip: {
      frames: 16, fps: 10, loop: false,
      desc: 'Se queda quieto un rato y toma un sorbo de su café. Empieza y termina en la pose de idle.',
      keys: [
        K({}),
        K({ ha: [4, -20], cup: 0.4, lean: 0.03 }),
        K({ ha: [8, -33], cup: 1, lean: 0.04, head: 0.02 }),
        K({ ha: [8, -33], cup: 1, lean: 0.04, head: -0.1 }),
        K({ ha: [8, -33], cup: 1, lean: 0.04, head: -0.1 }),
        K({ ha: [5, -20], cup: 0.4, lean: 0.03 }),
        K({}),
      ],
    },
    skid: {
      frames: 3, fps: 12, loop: true,
      desc: 'Frenada: viene corriendo y se inclina hacia atrás deslizando los pies. Mira hacia donde VA, no hacia donde quiere ir.',
      keys: [
        K({ lean: -0.25, hip: -8, fa: [12, 13], fb: [6, 13], ha: [10, -30], hb: [-8, -26], head: 0.12 }),
        K({ lean: -0.28, hip: -7.5, fa: [13, 13], fb: [7, 13], ha: [11, -32], hb: [-9, -24], head: 0.14 }),
        K({ lean: -0.22, hip: -8.5, fa: [11, 13], fb: [5, 13], ha: [9, -29], hb: [-7, -27], head: 0.1 }),
      ],
    },
    run: {
      frames: 8, fps: 14, loop: true, speedScaled: true,
      desc: 'Ciclo de carrera (2 pasos). Frame 0 = pie delantero pasando por abajo. En el juego el fps se ajusta a la velocidad.',
      sample: (u, o) => runPose(u, o && o.speed),
    },
    air: {
      frames: 8, fps: 0, loop: false, byVelocity: true,
      desc: 'En el aire. NO es una animación de tiempo: el frame depende de la velocidad vertical. 0 = subiendo fuerte, 3-4 = punto más alto, 7 = cayendo rápido.',
      keys: [
        K({ hip: -9, lean: 0.1, fa: [9, 4], fb: [-5, 9], ha: [17, -50], hb: [-12, -46], head: -0.1 }),
        K({ hip: -9.5, lean: 0.06, fa: [10, 5], fb: [-3, 8], ha: [18, -46], hb: [-14, -42], head: -0.06 }),
        K({ hip: -10, lean: 0.02, fa: [8, 8], fb: [-5, 10], ha: [19, -43], hb: [-15, -39], head: 0 }),
        K({ hip: -11, lean: -0.02, fa: [6, 12], fb: [-7, 11], ha: [20, -39], hb: [-17, -35], head: 0.06 }),
      ],
      mood: u => (u < 0.4 ? 'open' : 'closed'),
    },
    land: {
      frames: 4, fps: 22, loop: false,
      desc: 'Aterrizaje: agacha, absorbe el golpe y se reincorpora. Termina en la pose de idle.',
      keys: [
        K({ hip: -4, lean: 0.28, fa: [9, 13], fb: [-6, 13], ha: [11, -8], hb: [-5, -6], head: -0.12 }),
        K({ hip: -6.5, lean: 0.2, fa: [7, 13], fb: [-5, 13], ha: [9, -10], hb: [-5, -9], head: -0.08 }),
        K({ hip: -9.5, lean: 0.08, fa: [5, 13], fb: [-4, 13], ha: [5, -13], hb: [-4, -13], head: -0.03 }),
        K({}),
      ],
    },
    slide_start: {
      frames: 3, fps: 24, loop: false,
      desc: 'Del corrimiento a tirarse hacia atrás para deslizar. El último frame es igual al primero de "slide".',
      keys: [
        K({ body: -0.4, hip: -8, lean: 0.1, fa: [8, 13], fb: [2, 13], ha: [12, -22], hb: [8, -18] }),
        K({ body: -0.85, hip: -5, lean: 0.08, fa: [8, 13], fb: [3, 13], ha: [13, -16], hb: [9, -10] }),
        SLIDE_END,
      ],
    },
    slide: {
      frames: 3, fps: 8, loop: true,
      desc: 'Deslizando de espaldas, piernas adelante. Movimiento mínimo (se mantiene muy quieto).',
      keys: [
        SLIDE_END,
        K({ body: -1.19, hip: -2.5, fa: [8, 13], fb: [3, 13], ha: [15, -13], hb: [11, -7], lean: 0.05 }),
        K({ body: -1.12, hip: -1.5, fa: [9, 13], fb: [4, 13], ha: [14, -11], hb: [10, -5], lean: 0.05 }),
      ],
    },
    slide_end: {
      frames: 3, fps: 24, loop: false,
      desc: 'Se levanta del deslizamiento. Empieza igual que "slide" y termina en idle/carrera.',
      keys: [
        SLIDE_END,
        K({ body: -0.6, hip: -6, lean: 0.12, fa: [8, 13], fb: [2, 13], ha: [12, -20], hb: [8, -14] }),
        K({ body: -0.15, hip: -10, lean: 0.08, fa: [5, 13], fb: [-2, 13], ha: [6, -16], hb: [-2, -16] }),
      ],
    },
    wall_slide: {
      frames: 4, fps: 6, loop: true,
      desc: 'Pegado a una pared (la pared queda adelante, en +x). Resbala despacio, manos arriba.',
      keys: [
        K({ hip: -9, lean: 0.05, fa: [9, 5], fb: [6, 12], ha: [13, -48], hb: [12, -41] }),
        K({ hip: -9.3, lean: 0.05, fa: [9, 6], fb: [6, 11], ha: [13, -47], hb: [12, -40] }),
        K({ hip: -9, lean: 0.05, fa: [9, 7], fb: [6, 10], ha: [13, -48], hb: [12, -42] }),
        K({ hip: -8.7, lean: 0.05, fa: [9, 6], fb: [6, 11], ha: [13, -49], hb: [12, -41] }),
      ],
    },
    wall_run: {
      frames: 6, fps: 14, loop: true,
      desc: 'Corriendo hacia arriba por la pared (pared adelante, en +x). Los pies alternan pasos contra la pared.',
      mood: () => 'open',
      sample: u => wallRunPose(u),
    },
    wall_jump: {
      frames: 3, fps: 18, loop: false,
      desc: 'Impulso para despegarse de la pared. Ya mira hacia donde sale disparado: la pared queda ATRÁS (en -x).',
      keys: [
        K({ hip: -9, lean: 0.12, fa: [-8, 8], fb: [-5, 12], ha: [10, -44], hb: [8, -38], head: -0.05 }),
        K({ hip: -10, lean: 0.1, fa: [-5, 9], fb: [-2, 10], ha: [11, -46], hb: [8, -40], head: -0.08 }),
        K({ hip: -9.5, lean: 0.08, fa: [8, 5], fb: [-4, 9], ha: [10, -50], hb: [-4, -46], head: -0.1 }),
      ],
      mood: () => 'open',
    },
    spring: {
      frames: 3, fps: 18, loop: false,
      desc: 'Rebota en un resorte: se comprime, estira y sale disparado con los brazos arriba.',
      keys: [
        K({ hip: -4, lean: 0.15, fa: [8, 13], fb: [-6, 13], ha: [10, -6], hb: [-4, -6] }),
        K({ hip: -13, lean: 0.02, fa: [3, 13], fb: [-3, 13], ha: [6, -52], hb: [-6, -50] }),
        K({ hip: -12, lean: 0.02, fa: [4, 9], fb: [-3, 12], ha: [8, -52], hb: [-6, -48] }),
      ],
      mood: () => 'open',
    },
  };

  // u (0..1) del frame k: en las de ciclo, k/N; en las de una pasada, k/(N-1).
  function frameU(name, k) {
    const d = defs[name];
    return d.loop || d.speedScaled ? k / d.frames : k / (d.frames - 1);
  }

  function sample(name, u, opts) {
    const d = defs[name];
    const pose = d.sample ? d.sample(u, opts) : sampleKeys(d.keys, u, d.loop);
    pose.mood = d.mood ? d.mood(u) : 'closed';
    return pose;
  }

  function lerpPose(a, b, t) {
    const out = {};
    for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
    out.mood = b.mood;
    return out;
  }

  const api = { KEYS, defs, K, sample, sampleKeys, frameU, lerpPose, runPose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BobAnims = api;
})(typeof window !== 'undefined' ? window : globalThis);
