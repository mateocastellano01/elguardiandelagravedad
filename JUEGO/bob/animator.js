// Animador de BoB: elige la animación según el estado de la simulación, mezcla poses
// entre animaciones, agrega movimiento secundario (corbata, cabeza, squash) y dibuja
// con sprites si existen o con el renderizador procedural si no.
(function (root) {
  'use strict';

  const A = root.BobAnims, CH = root.BobCharacter, S = root.BobSprites;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = t => t * t * (3 - 2 * t);
  const ORB_IMG = new Image();
  ORB_IMG.src = 'assets/orbe.webp';

  class Animator {
    constructor() {
      this.name = 'idle';
      this.time = 0;
      this.msT = 0;
      this.done = false;
      this.runCycle = 0;
      this.pose = A.sample('idle', 0);
      this.prevPose = this.pose;
      this.blend = 1; this.blendLen = 1;
      this.faceX = 1; this.vface = 1;
      this.tilt = 0; this.sq = 0;
      this.tie = { x: -2, y: 13, vx: 0, vy: 0 };
      this.head = { v: 0, x: 0 };
      this.orb = { x: 0, y: 0 };
      this.t = 0; this.idleT = 0; this.blinkT = 120; this.blink = false;
      this.wasSliding = false; this.lastVy = 0;
      this.useSprites = true;
    }

    reset(p) {
      this.orb.x = p.x - 20; this.orb.y = p.y - 46;
      this.name = 'idle'; this.time = 0; this.msT = 0; this.done = false;
      this.pose = A.sample('idle', 0); this.prevPose = this.pose; this.blend = 1;
      this.faceX = this.vface = p.facing || 1;
      this.sq = 0; this.lastVy = 0; this.wasSliding = false;
    }

    play(name, blendFrames) {
      if (this.name === name) return;
      this.prevPose = this.pose;
      this.blend = 0; this.blendLen = blendFrames == null ? 5 : blendFrames;
      this.name = name; this.time = 0; this.msT = 0; this.done = false;
    }

    usingSprites(name) { return this.useSprites && S.ready(name); }

    onEvent(e, p) {
      switch (e.type) {
        case 'jump': this.sq = -0.2; break;
        case 'walljump': this.sq = -0.14; this.play('wall_jump', 2); break;
        case 'spring': this.sq = -0.25; this.play('spring', 2); break;
        case 'land':
          if (e.impact > 3) this.sq = Math.min(0.32, e.impact * 0.026);
          if (e.impact > 4 && Math.abs(p.gs) < 3.5) this.play('land', 2);
          break;
      }
    }

    pick(p, skidding) {
      const n = this.name;
      if (p.sliding) {
        if (n === 'slide_start' && !this.done) return 'slide_start';
        return n === 'slide' || n === 'slide_start' ? 'slide' : 'slide_start';
      }
      if (p.wallRun > 0) return 'wall_run';
      if (!p.grounded) {
        if (n === 'wall_jump' && !this.done) return n;
        if (n === 'spring' && !this.done) return n;
        if (p.wallPrev && p.vy > 0 && p.vx * p.wallPrev.nx <= 0.5) return 'wall_slide';
        return 'air';
      }
      if (this.wasSliding && n !== 'slide_end') return 'slide_end';
      if (n === 'slide_end' && !this.done) return n;
      if (n === 'land' && !this.done && Math.abs(p.gs) < 3.5) return n;
      if (skidding) return 'skid';
      if (Math.abs(p.gs) > 0.7) return 'run';
      if (n === 'idle_sip' && !this.done) return n;
      // No mezclar estilos: si idle ya usa tu dibujo y el sorbo de café todavía es procedural, se queda en idle.
      const sipOk = !this.usingSprites('idle') || this.usingSprites('idle_sip');
      if (n === 'idle' && this.idleT > 240 && sipOk) return 'idle_sip';
      return 'idle';
    }

    update(sim) {
      const p = sim.p;
      this.t++;
      const g = p.grounded;
      const sp = g ? Math.abs(p.gs) : Math.abs(p.vx);
      const skidding = g && !p.sliding && p.dir !== 0 && p.gs * p.dir < 0 && Math.abs(p.gs) > 3;

      // cara visible: mira hacia donde se mueve, no hacia donde empuja la entrada
      if (p.sliding) this.vface = Math.abs(p.gs) > 1 ? Math.sign(p.gs) : p.facing;
      else if (g && Math.abs(p.gs) > 2.5) this.vface = Math.sign(p.gs);
      else if (p.wallRun > 0 && p.wallPrev) this.vface = -Math.sign(p.wallPrev.nx);
      else if (!g && p.wallPrev && p.vy > 0 && this.name === 'wall_slide') this.vface = -Math.sign(p.wallPrev.nx);
      else this.vface = p.facing;
      this.faceX += (this.vface - this.faceX) * 0.5;
      if (Math.abs(this.vface - this.faceX) < 0.08) this.faceX = this.vface;

      const want = this.pick(p, skidding);
      let blendLen = 5;
      if (want === 'air' || want === 'wall_slide') blendLen = 3;
      if (want === 'slide_start' || want === 'skid') blendLen = 2;
      this.play(want, blendLen);

      this.idleT = this.name === 'idle' || this.name === 'idle_sip' ? this.idleT + 1 : 0;
      if (this.name === 'idle_sip' && this.done) this.idleT = 0;

      // tiempo de la animación
      const d = A.defs[this.name];
      this.msT += 1000 / 60;
      const st = this.usingSprites(this.name) ? S.timing(this.name, d.frames) : null;
      let u;
      if (d.byVelocity) {
        u = clamp((p.vy + 12) / 24, 0, 1);
      } else if (this.name === 'run') {
        if (this.usingSprites('run')) {
          // Dibujos: avanza según la distancia recorrida (una vuelta completa cada `zancada` unidades), con tope de fps.
          const n = d.frames;
          const stride = S.param('run', 'zancada', 100);
          const lo = S.param('run', 'fpsMin', 8) / 60 / n, hi = S.param('run', 'fpsMax', 24) / 60 / n;
          this.runCycle += clamp(sp / stride, lo, hi);
        } else {
          const swing = 7 + 0.4 * clamp(sp, 2, 17);
          this.runCycle += Math.min(0.6, sp * Math.PI / (2 * swing)) / (Math.PI * 2);
        }
        u = this.runCycle % 1;
      } else if (st) {
        u = d.loop ? (this.msT % st.total) / st.total : Math.min(1, this.msT / st.total);
        if (!d.loop && this.msT >= st.total) this.done = true;
      } else {
        this.time += d.fps / 60;
        if (d.loop) u = (this.time / d.frames) % 1;
        else {
          u = this.time / (d.frames - 1);
          if (u >= 1) { u = 1; this.done = true; }
        }
      }
      this.u = u;
      this.speed = sp;

      const cur = A.sample(this.name, u, { speed: sp });
      if (this.blend < this.blendLen) {
        this.blend++;
        this.pose = A.lerpPose(this.prevPose, cur, smooth(this.blend / this.blendLen));
      } else this.pose = cur;

      // inclinación según la pendiente
      const theta = Math.atan2(p.nx, -p.ny);
      const target = g ? theta * (p.sliding ? 1 : 0.5) : 0;
      this.tilt += (target - this.tilt) * 0.25;

      // squash & stretch: se estira con la velocidad vertical, se aplasta al aterrizar
      const sqTarget = g ? 0 : -clamp(Math.abs(p.vy) * 0.008, 0, 0.1);
      this.sq += (sqTarget - this.sq) * 0.2;

      // movimiento secundario
      const ay = p.vy - this.lastVy;
      this.lastVy = p.vy;
      const tt = this.tie;
      const sfast = Math.min(sp, 14);
      const tx = -2 - sfast * 0.9;
      const ty = 13 - sfast * 0.3 - clamp(p.vy * 0.45, -3, 9) + (sp > 8 ? Math.sin(this.t * 0.4) * 0.9 : 0);
      tt.vx = (tt.vx + (tx - tt.x) * 0.3) * 0.62;
      tt.vy = (tt.vy + (ty - tt.y) * 0.3 - ay * 0.4) * 0.62;
      tt.x += tt.vx; tt.y += tt.vy;
      tt.y = clamp(tt.y, 2, 17);

      const hh = this.head;
      hh.v = (hh.v + (-clamp(ay, -6, 6) * 0.02 - hh.x) * 0.25) * 0.6;
      hh.x += hh.v;

      if (--this.blinkT <= 0) { this.blink = !this.blink; this.blinkT = this.blink ? 6 : 90 + Math.random() * 150; }

      const ox = p.x - this.vface * 20, oy = p.y - 46 + Math.sin(this.t * 0.05) * 5;
      this.orb.x += (ox - this.orb.x) * 0.12; this.orb.y += (oy - this.orb.y) * 0.12;
      this.wasSliding = p.sliding;
    }

    spriteFrame() {
      const d = A.defs[this.name], n = d.frames;
      if (d.byVelocity) return Math.round(this.u * (n - 1));
      if (!d.speedScaled) {
        const k = S.frameAt(this.name, n, this.msT, d.loop);
        if (k !== null) return k;
      }
      if (d.loop || d.speedScaled) return Math.floor(this.u * n) % n;
      return Math.min(n - 1, Math.floor(this.time + 0.0001));
    }

    drawOrb(ctx) { CH.drawOrb(ctx, this.orb.x, this.orb.y, ORB_IMG); }

    draw(ctx, p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(this.tilt);
      ctx.scale(this.faceX, 1);
      if (this.useSprites && S.ready(this.name)) {
        ctx.translate(0, 13);
        ctx.scale(1 + this.sq * 0.5, 1 - this.sq);
        ctx.translate(0, -13);
        S.draw(ctx, this.name, this.spriteFrame());
      } else {
        const pose = Object.assign({}, this.pose);
        pose.head += this.head.x;
        CH.drawPose(ctx, pose, { tie: this.tie, blink: this.blink, mood: this.pose.mood, squash: this.sq });
      }
      ctx.restore();
    }
  }

  root.BobAnimator = Animator;
})(window);
