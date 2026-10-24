// Carga y dibujo de los sprites de BoB (opcional: si no hay sprites, se usa la animación procedural).
(function (root) {
  'use strict';

  const cfg = root.BOB_SPRITES || { size: 512, pivot: [256, 380], ppu: 4, ext: 'webp', anims: {} };
  const sets = {};

  const pad = n => (n < 10 ? '0' : '') + n;

  // Cada entrada del manifest puede ser true/false o un objeto { listo, ms, orden }.
  function entry(name) {
    const e = cfg.anims[name];
    if (!e) return null;
    return e === true ? { listo: true } : e;
  }
  function enabled(name) { const e = entry(name); return !!(e && e.listo); }

  // Duraciones por frame (ms) y orden de reproducción, si están definidos en el manifest.
  function timing(name, frames) {
    const e = entry(name);
    if (!e || (!e.ms && !e.orden)) return null;
    const order = e.orden || Array.from({ length: frames }, (_, i) => i);
    const ms = order.map((_, i) => (Array.isArray(e.ms) ? e.ms[i] : e.ms) || 125);
    const total = ms.reduce((a, b) => a + b, 0);
    return { order, ms, total };
  }

  // Carga todos los frames de las animaciones marcadas como listas (o de todas, si all = true; lo usa preview.html).
  // Si falta alguno, esa animación queda procedural.
  function load(defs, all) {
    for (const name in defs) {
      if (!defs[name] || (!all && !enabled(name))) continue;
      const n = defs[name].frames;
      const set = { imgs: [], ok: 0, failed: false };
      sets[name] = set;
      for (let k = 0; k < n; k++) {
        const img = new Image();
        const src = 'sprites/' + name + '/' + name + '_' + pad(k) + '.' + (cfg.ext || 'png');
        img.onload = () => { set.ok++; };
        img.onerror = () => { set.failed = true; if (!all) console.warn('[BoB] falta el sprite ' + src); };
        img.src = src;
        set.imgs.push(img);
      }
    }
  }

  function ready(name) {
    const s = sets[name];
    return !!s && !s.failed && s.ok === s.imgs.length;
  }

  // Frame a mostrar a partir del tiempo (ms) transcurrido en la animación, según el manifest.
  function frameAt(name, frames, ms, loop) {
    const t = timing(name, frames);
    if (!t) return null;
    let x = loop ? ms % t.total : Math.min(ms, t.total - 1);
    for (let i = 0; i < t.ms.length; i++) {
      if (x < t.ms[i]) return t.order[i];
      x -= t.ms[i];
    }
    return t.order[t.order.length - 1];
  }

  // Dibuja el frame k en coordenadas locales del personaje (origen = centro de los pies, mirando a +x).
  function draw(ctx, name, k) {
    const s = sets[name];
    const img = s.imgs[Math.max(0, Math.min(s.imgs.length - 1, k))];
    const ppu = cfg.ppu;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -cfg.pivot[0] / ppu, -cfg.pivot[1] / ppu, cfg.size / ppu, cfg.size / ppu);
  }

  // Parámetro extra de una animación en el manifest (por ejemplo zancada o fpsMax de "run").
  function param(name, key, def) {
    const e = entry(name);
    return e && e[key] != null ? e[key] : def;
  }

  root.BobSprites = { cfg, load, ready, draw, pad, enabled, timing, frameAt, param };
})(window);
