// BoB — núcleo del juego: bucle fijo a 60 Hz, entrada, cámara, partículas, sonido y pantallas.
(function () {
  'use strict';
  const { Sim, C } = window.BobPhysics;
  const D = window.BobDraw, CH = window.BobCharacter;
  const $ = id => document.getElementById(id);

  const stage = $('stage'), canvas = $('c'), ctx = canvas.getContext('2d');
  // Unidades de juego visibles: alto fijo, pero nunca menos de MIN_VIEW_W de ancho (pantallas angostas).
  const VIEW_H = 400, MIN_VIEW_W = 640;
  let W = 0, H = 0, scale = 1;

  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(r.width * dpr));
    canvas.height = Math.max(2, Math.round(r.height * dpr));
    W = canvas.width; H = canvas.height;
    scale = Math.min(H / VIEW_H, W / MIN_VIEW_W);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Estado ----------
  let levelIdx = 0, level, sim;
  let state = 'title';
  let tAnim = 0;
  const cam = { x: 0, y: 0, zoom: 1 };
  const parts = [];
  const animator = new window.BobAnimator();
  window.BobSprites.load(window.BobAnims.defs);
  let fade = 0, doneT = 0, combo = 0, comboT = 0, shake = 0, lastY = 0;
  const bestKey = () => 'bob_best_time_' + levelIdx;

  function loadLevel(i) {
    levelIdx = i;
    level = window.BobLevels.levels[i]();
    sim = new Sim(level);
    parts.length = 0;
    animator.reset(sim.p);
    snapCamera();
    fade = 1; doneT = 0; combo = 0;
    lastY = sim.p.y;
    window.__bob = { sim, level, cam, animator, get state() { return state; } };
  }

  function snapCamera() {
    cam.x = sim.p.x; cam.y = sim.p.y - 50; cam.zoom = 1;
  }

  // ---------- Entrada ----------
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump',
  };
  const kb = {}, touch = {};
  let jumpEdge = false;

  window.addEventListener('keydown', e => {
    const act = KEYMAP[e.code];
    if (act) {
      e.preventDefault();
      if (!kb[act] && act === 'jump') jumpEdge = true;
      kb[act] = true;
      audio.unlock();
      if (state === 'title' && (act === 'jump')) startGame();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); togglePause(); }
    else if (e.code === 'KeyR' && state === 'play') { e.preventDefault(); if (!sim.p.dead) sim.die(); }
    else if (e.code === 'KeyM') toggleMute();
    else if (e.code === 'Enter' && state === 'title') startGame();
  });
  window.addEventListener('keyup', e => {
    const act = KEYMAP[e.code];
    if (act) { e.preventDefault(); kb[act] = false; }
  });
  // ?debug en la URL: no pausa al perder el foco (útil para probar con otra ventana al lado).
  const DEBUG = /[?&]debug\b/.test(location.search);
  window.addEventListener('blur', () => {
    if (DEBUG) return;
    for (const k in kb) kb[k] = false;
    if (state === 'play') togglePause();
  });
  document.addEventListener('visibilitychange', () => { if (!DEBUG && document.hidden && state === 'play') togglePause(); });

  document.querySelectorAll('.tbtn').forEach(b => {
    const act = b.dataset.act;
    const down = e => { e.preventDefault(); audio.unlock(); if (act === 'jump' && !touch.jump) jumpEdge = true; touch[act] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
    const up = e => { e.preventDefault(); touch[act] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
  });
  if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('is-touch');

  function readInput() {
    const inp = {
      left: !!(kb.left || touch.left), right: !!(kb.right || touch.right),
      down: !!(kb.down || touch.down), jump: !!(kb.jump || touch.jump),
      jumpPressed: jumpEdge,
    };
    jumpEdge = false;
    if (inp.left && inp.right) inp.left = inp.right = false;
    return inp;
  }

  // ---------- Sonido (sintetizado, sin archivos) ----------
  const audio = (() => {
    let ac = null, muted = localStorage.getItem('bob_muted') === '1';
    function unlock() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; } }
      if (ac.state === 'suspended') ac.resume();
    }
    function tone(f0, f1, dur, type, vol, delay) {
      if (!ac || muted) return;
      const t = ac.currentTime + (delay || 0);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    }
    return {
      unlock, tone,
      get muted() { return muted; },
      setMuted(m) { muted = m; localStorage.setItem('bob_muted', m ? '1' : '0'); },
    };
  })();

  const sfx = {
    jump() { audio.tone(300, 620, 0.14, 'triangle', 0.14); },
    walljump() { audio.tone(260, 700, 0.16, 'triangle', 0.14); },
    land(v) { audio.tone(140, 70, 0.1, 'sine', Math.min(0.2, 0.05 + v * 0.01)); },
    slide() { audio.tone(220, 110, 0.18, 'sawtooth', 0.04); },
    spring() { audio.tone(220, 900, 0.28, 'square', 0.1); },
    bean(c) { const f = 660 * Math.pow(1.0595, Math.min(c, 12)); audio.tone(f, f * 1.5, 0.12, 'square', 0.07); audio.tone(f * 1.5, f * 2, 0.14, 'triangle', 0.06, 0.06); },
    check() { audio.tone(440, 440, 0.1, 'triangle', 0.1); audio.tone(660, 660, 0.1, 'triangle', 0.1, 0.1); audio.tone(880, 880, 0.18, 'triangle', 0.1, 0.2); },
    splash() { audio.tone(300, 60, 0.3, 'sawtooth', 0.08); },
    goal() { [523, 659, 784, 1047].forEach((f, i) => audio.tone(f, f, 0.22, 'triangle', 0.12, i * 0.12)); },
    wallrun() { audio.tone(200, 500, 0.2, 'sawtooth', 0.05); },
  };

  // ---------- Partículas ----------
  function puff(x, y, n, spread, up, col) {
    for (let i = 0; i < n; i++) {
      parts.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * up, g: 0.05, life: 22 + Math.random() * 14, max: 36, r: 3 + Math.random() * 4, col: col || '240,230,210', grow: 0.15 });
    }
  }
  function sparks(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3.5;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.1, life: 24, max: 24, r: 2.5, col: col || '255,225,140', grow: -0.05 });
    }
  }
  function splash(x, y) {
    for (let i = 0; i < 22; i++) {
      parts.push({ x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 8, g: 0.45, life: 40, max: 40, r: 3 + Math.random() * 3, col: '190,235,235', grow: 0 });
    }
  }
  function updateParts() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.x += q.vx; q.y += q.vy; q.vy += q.g; q.r = Math.max(0.2, q.r + q.grow); q.vx *= 0.98;
      if (--q.life <= 0) parts.splice(i, 1);
    }
  }
  function drawParts() {
    for (const q of parts) {
      ctx.fillStyle = 'rgba(' + q.col + ',' + (q.life / q.max * 0.85).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
    }
  }

  // ---------- Eventos de la simulación ----------
  function handleEvents() {
    const p = sim.p;
    for (const e of sim.events) {
      animator.onEvent(e, p);
      switch (e.type) {
        case 'jump': puff(p.x, p.y + 12, 5, 3, 1.2); sfx.jump(); break;
        case 'walljump': puff(p.x + p.wallSide * -12, p.y, 5, 2, 1.5); sfx.walljump(); break;
        case 'land':
          if (e.impact > 3) { puff(p.x, p.y + 12, Math.min(10, 3 + e.impact), 5, 1.4); sfx.land(e.impact); }
          break;
        case 'slide': sfx.slide(); puff(p.x, p.y + 12, 4, 4, 1); break;
        case 'wallrun': sfx.wallrun(); break;
        case 'spring': sparks(p.x, p.y + 12, 12, '255,240,170'); sfx.spring(); shake = 4; break;
        case 'bean':
          combo = comboT > 0 ? combo + 1 : 0; comboT = 50;
          sparks(e.bx, e.by, 8); sfx.bean(combo);
          break;
        case 'checkpoint': sparks(e.cx, e.cy - 60, 18, '255,225,140'); sfx.check(); break;
        case 'death': fade = 0; sfx.splash(); break;
        case 'respawn': snapCamera(); fade = 1; animator.reset(p); break;
        case 'goal':
          for (let i = 0; i < 60; i++) {
            const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 7;
            const cols = ['255,225,140', '120,220,210', '230,90,110', '240,240,230'];
            parts.push({ x: p.x, y: p.y - 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, g: 0.2, life: 70, max: 70, r: 3.5, col: cols[i % 4], grow: -0.02 });
          }
          sfx.goal();
          break;
      }
    }
    sim.events.length = 0;
  }

  // ---------- Animación y cámara ----------
  function updateAnim() {
    const p = sim.p;
    animator.update(sim);
    if (comboT > 0) comboT--;
    if (p.grounded && p.sliding && Math.abs(p.gs) > 3 && animator.t % 3 === 0) puff(p.x - animator.vface * 8, p.y + 12, 1, 2, 0.8);
    if (p.grounded && Math.abs(p.gs) > 12 && animator.t % 4 === 0) puff(p.x - Math.sign(p.gs) * 10, p.y + 12, 1, 1.5, 0.5);
  }

  function updateCamera() {
    const p = sim.p;
    const speed = Math.hypot(p.vx, p.vy);
    const lookX = Math.max(-160, Math.min(160, p.vx * 13));
    const tx = p.x + lookX;
    let ty = p.y - 50;
    // Si no hay suelo debajo (pozo), baja la cámara para que se vea el agua.
    if (!p.grounded && p.vy > 2 && level.topY(p.x) === null) ty = Math.min(p.y + 40, level.waterY - 220);
    const dy = ty - cam.y;
    const dz = p.grounded ? 0 : 60;
    if (Math.abs(dy) > dz) ty = cam.y + dy - Math.sign(dy) * dz; else ty = cam.y;
    cam.x += (tx - cam.x) * 0.1;
    cam.y += (ty - cam.y) * (p.grounded ? 0.09 : 0.07);
    // Se aleja a alta velocidad para ver lo que viene.
    const tz = 1 - Math.min(speed, 19) / 19 * 0.25;
    cam.zoom += (tz - cam.zoom) * 0.03;
    if (shake > 0) shake *= 0.85;
  }

  // ---------- Bucle ----------
  function tick() {
    const inp = readInput();
    const p = sim.p;
    lastY = p.y;
    sim.step(inp);
    const surf = level.waterY - 140;
    if (!p.dead && lastY < surf && p.y >= surf) { splash(p.x, surf); sfx.splash(); }
    handleEvents();
    updateAnim();
    updateParts();
    updateCamera();
    if (fade > 0) fade = Math.max(0, fade - 0.04);
    if (sim.finished && state === 'play') {
      if (++doneT > 70) finish();
    }
  }

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    tAnim++;
    if (state === 'play') {
      acc += dt;
      let n = 0;
      while (acc >= 1000 / 60 && n++ < 5) { tick(); acc -= 1000 / 60; }
      if (n >= 5) acc = 0;
    } else {
      acc = 0;
      if (state === 'title') { updateAnim(); updateParts(); }
      if (fade > 0) fade = Math.max(0, fade - 0.04);
    }
    render();
    requestAnimationFrame(frame);
  }

  // ---------- Dibujo ----------
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    D.drawBackground(ctx, W, H, cam, scale * cam.zoom, tAnim);

    const s = scale * cam.zoom;
    const sx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(s, 0, 0, s, W / 2 - cam.x * s + sx, H / 2 - cam.y * s + sy);
    const view = { x0: cam.x - W / 2 / s, x1: cam.x + W / 2 / s, y0: cam.y - H / 2 / s, y1: cam.y + H / 2 / s };
    const t = tAnim;

    D.drawGround(ctx, level, view);
    for (const o of level.oneWays) if (o.x < view.x1 && o.x + o.w > view.x0) D.drawPlatform(ctx, o);
    for (const g of level.signs) if (Math.abs(g.x - cam.x) < W / 2 / s + 200) D.drawSign(ctx, g);
    for (const c of sim.checkpoints) if (Math.abs(c.x - cam.x) < W / 2 / s + 100) D.drawCheckpoint(ctx, c, t);
    D.drawGoal(ctx, level.goal, t);
    for (const sp of sim.springs) D.drawSpring(ctx, sp);
    for (const b of sim.beans) if (!b.got && b.x > view.x0 - 30 && b.x < view.x1 + 30) D.drawBean(ctx, b, t);

    const p = sim.p;
    if (!p.dead) {
      drawSpeedLines(p);
      animator.drawOrb(ctx);
      animator.draw(ctx, p);
    }
    drawParts();
    D.drawWater(ctx, level, view, t);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    D.drawVignette(ctx, W, H);
    drawHud();
    if (fade > 0 || p.dead) {
      const a = p.dead ? Math.min(1, (50 - p.deadT) / 25) : fade;
      ctx.fillStyle = 'rgba(5,10,14,' + a.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawSpeedLines(p) {
    const sp = Math.hypot(p.vx, p.vy);
    if (sp < 12) return;
    const a = Math.min(0.5, (sp - 12) / 8);
    ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const dx = -p.vx / sp, dy = -p.vy / sp;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const off = (i - 2) * 9 + Math.sin(animator.t * 0.7 + i) * 3;
      const bx = p.x + dy * off - dx * 16, by = p.y - 14 - dx * off - dy * 16;
      ctx.moveTo(bx, by); ctx.lineTo(bx + dx * (26 + i * 4), by + dy * (26 + i * 4));
    }
    ctx.stroke();
  }

  function drawHud() {
    if (state === 'title') return;
    const u = Math.max(1, H / 540);
    const pad = 14 * u;
    ctx.save();
    ctx.font = '700 ' + (22 * u) + 'px "Roboto Condensed", "Arial Narrow", sans-serif';
    ctx.textBaseline = 'middle';
    const total = sim.beans.length;
    const txt = sim.beanCount + ' / ' + total;
    const w = 70 * u + ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(8,18,24,0.62)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(pad, pad, w, 46 * u, 12 * u) : ctx.rect(pad, pad, w, 46 * u); ctx.fill();
    ctx.save(); ctx.translate(pad + 22 * u, pad + 41 * u); ctx.scale(0.55 * u, 0.55 * u); CH.drawHead(ctx, false, 'closed'); ctx.restore();
    ctx.save(); ctx.translate(pad + 62 * u, pad + 24 * u); ctx.scale(u * 0.9, u * 0.9); D.drawBean(ctx, { x: 0, y: 0 }, 0); ctx.restore();
    ctx.fillStyle = '#f1ecd8';
    ctx.fillText(txt, pad + 84 * u, pad + 24 * u);

    const secs = sim.frames / 60;
    const tt = Math.floor(secs / 60) + ':' + (secs % 60).toFixed(1).padStart(4, '0');
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,18,24,0.62)';
    const tw = ctx.measureText(tt).width + 28 * u;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W / 2 - tw / 2, pad, tw, 46 * u, 12 * u) : ctx.rect(W / 2 - tw / 2, pad, tw, 46 * u); ctx.fill();
    ctx.fillStyle = '#f1ecd8';
    ctx.fillText(tt, W / 2, pad + 24 * u);
    ctx.restore();
  }

  // ---------- Pantallas ----------
  const ov = $('ov');
  function show(name) {
    ov.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.dataset.for === name));
    ov.classList.toggle('on', !!name);
    if (name) { const b = ov.querySelector('.panel.on button'); if (b) b.focus({ preventScroll: true }); }
  }

  function startGame() {
    audio.unlock();
    window.focus();
    if (state === 'title' || state === 'done') { loadLevel(levelIdx); }
    state = 'play';
    show(null);
  }

  function togglePause() {
    if (state === 'play') { state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = 'play'; show(null); window.focus(); }
  }

  function restartLevel() { loadLevel(levelIdx); state = 'play'; show(null); window.focus(); }

  function finish() {
    state = 'done';
    const secs = sim.frames / 60;
    const prev = parseFloat(localStorage.getItem(bestKey()));
    const isBest = !prev || secs < prev;
    if (isBest) localStorage.setItem(bestKey(), String(secs));
    $('r-time').textContent = secs.toFixed(1) + ' s';
    $('r-beans').textContent = sim.beanCount + ' / ' + sim.beans.length;
    $('r-deaths').textContent = String(sim.deaths);
    $('r-best').textContent = isBest ? '¡Nuevo mejor tiempo!' : 'Mejor tiempo: ' + prev.toFixed(1) + ' s';
    show('done');
  }

  function toggleMute() {
    audio.setMuted(!audio.muted);
    $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
    $('btn-mute').setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  }

  function toggleFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => { try { window.parent.postMessage({ type: 'bob-fullscreen' }, '*'); } catch (_) {} });
    else try { window.parent.postMessage({ type: 'bob-fullscreen' }, '*'); } catch (_) {}
  }

  $('btn-start').addEventListener('click', startGame);
  $('btn-resume').addEventListener('click', togglePause);
  $('btn-restart').addEventListener('click', restartLevel);
  $('btn-again').addEventListener('click', restartLevel);
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-mute').addEventListener('click', toggleMute);
  $('btn-full').addEventListener('click', toggleFullscreen);
  $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';

  loadLevel(0);
  show('title');
  requestAnimationFrame(frame);
})();

