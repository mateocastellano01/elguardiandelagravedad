// Física de BoB: terreno como segmentos, personaje como cápsula (dos círculos).
// Movimiento por velocidad sobre la superficie (gs) para ganar impulso en bajadas,
// subir pendientes con carrera y salir disparado de las rampas.
// No toca el DOM: se puede probar desde Node.
(function (root) {
  'use strict';

  const C = {
    FEET_R: 13, HEAD_R: 11, HEAD_OFF: 30,
    SLIDE_HEAD_R: 10, SLIDE_HEAD_X: 12, SLIDE_HEAD_Y: -6,
    GRAV: 0.55, MAX_FALL: 15,
    SLOPE_G: 0.62,
    ACCEL: 0.2, ACCEL_START: 0.35, DECEL: 0.65, FRICTION: 0.28,
    MAX_RUN: 9.5, OVER_DRAG: 0.035, SLIDE_FRIC: 0.045, MAX_SPEED: 19,
    AIR_ACC: 0.28, MAX_AIR: 9.5,
    JUMP_V: 11.2, JUMP_CUT: 4.2, COYOTE: 6, BUFFER: 7,
    WALL_SLIDE: 2.4, WALL_JUMP_X: 7.2, WALL_JUMP_Y: 11, WALL_LOCK: 8,
    WALLRUN_MIN: 7, WALLRUN_FRAMES: 26,
    SPRING_V: 16.5,
    GROUND_NY: -0.5,
  };

  // ---------- Mundo: segmentos con rejilla espacial ----------
  class World {
    constructor(level) {
      this.segs = [];
      this.cell = 128;
      this.grid = new Map();
      this.stamp = 0;
      for (const g of level.ground) this.addPoly(g.poly);
      for (const s of level.solids) this.addPoly(s.poly);
      for (const o of level.oneWays) this.addOneWay(o.x, o.y, o.w);
    }

    addPoly(pts) {
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      const sign = area > 0 ? 1 : -1;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        this.addSeg(a[0], a[1], b[0], b[1], sign * dy / len, -sign * dx / len, false);
      }
    }

    addOneWay(x, y, w) {
      this.addSeg(x, y, x + w, y, 0, -1, true);
    }

    addSeg(ax, ay, bx, by, nx, ny, ow) {
      const dx = bx - ax, dy = by - ay;
      const seg = { ax, ay, bx, by, dx, dy, len2: dx * dx + dy * dy, nx, ny, ow, stamp: 0 };
      this.segs.push(seg);
      const cs = this.cell;
      const x0 = Math.floor(Math.min(ax, bx) / cs), x1 = Math.floor(Math.max(ax, bx) / cs);
      const y0 = Math.floor(Math.min(ay, by) / cs), y1 = Math.floor(Math.max(ay, by) / cs);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = cx + ',' + cy;
          let arr = this.grid.get(k);
          if (!arr) { arr = []; this.grid.set(k, arr); }
          arr.push(seg);
        }
      }
    }

    query(x0, y0, x1, y1, fn) {
      const cs = this.cell;
      this.stamp++;
      const cx0 = Math.floor(x0 / cs), cx1 = Math.floor(x1 / cs);
      const cy0 = Math.floor(y0 / cs), cy1 = Math.floor(y1 / cs);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const arr = this.grid.get(cx + ',' + cy);
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const s = arr[i];
            if (s.stamp === this.stamp) continue;
            s.stamp = this.stamp;
            fn(s);
          }
        }
      }
    }
  }

  const cp = { x: 0, y: 0, t: 0 };
  function closest(seg, px, py) {
    let t = ((px - seg.ax) * seg.dx + (py - seg.ay) * seg.dy) / seg.len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    cp.x = seg.ax + seg.dx * t;
    cp.y = seg.ay + seg.dy * t;
    cp.t = t;
    return cp;
  }

  // ---------- Simulación ----------
  class Sim {
    constructor(level) {
      this.level = level;
      this.world = new World(level);
      this.events = [];
      this.beans = level.beans.map(b => ({ x: b[0], y: b[1], got: false }));
      this.springs = level.springs.map(s => ({ x: s.x, y: s.y, t: 0 }));
      this.checkpoints = level.checkpoints.map(c => ({ x: c.x, y: c.y, hit: false }));
      this.respawnPoint = { x: level.spawn.x, y: level.spawn.y };
      this.beanCount = 0;
      this.frames = 0;
      this.finished = false;
      this.deaths = 0;
      this.p = this.makePlayer();
      this.placeAt(this.respawnPoint);
    }

    makePlayer() {
      return {
        x: 0, y: 0, vx: 0, vy: 0, gs: 0, nx: 0, ny: -1,
        grounded: false, groundOW: false, facing: 1,
        sliding: false, slideCD: 0, jumping: false,
        coyote: 0, jumpBuf: 0, airGrace: 0, dropT: 0,
        wallN: null, wallPrev: null, wallT: 0, wallSide: 0, wallRun: 0, lock: 0,
        dead: false, deadT: 0,
      };
    }

    placeAt(pt) {
      const p = this.p;
      p.x = pt.x; p.y = pt.y - C.FEET_R - 1;
      p.vx = p.vy = p.gs = 0;
      p.nx = 0; p.ny = -1;
      p.grounded = false; p.sliding = false; p.jumping = false;
      p.wallRun = 0; p.wallN = p.wallPrev = null; p.wallT = 0; p.lock = 0;
      p.coyote = 0; p.jumpBuf = 0; p.dead = false;
    }

    emit(type, extra) {
      const e = { type, x: this.p.x, y: this.p.y };
      if (extra) Object.assign(e, extra);
      this.events.push(e);
    }

    circles(p) {
      const feet = { x: p.x, y: p.y, r: C.FEET_R, feet: true };
      const head = p.sliding
        ? { x: p.x + p.facing * C.SLIDE_HEAD_X, y: p.y + C.SLIDE_HEAD_Y, r: C.SLIDE_HEAD_R }
        : { x: p.x, y: p.y - C.HEAD_OFF, r: C.HEAD_R };
      return [feet, head];
    }

    // Las plataformas de una vía solo cuentan si venís cayendo por encima.
    oneWayOk(p, seg, cy) {
      if (p.dropT > 0) return false;
      if (!p.grounded && p.vy < 0) return false;
      return cy < seg.ay;
    }

    // Empuja al personaje fuera de los sólidos. Devuelve los contactos de este paso.
    resolve(p) {
      const out = { ground: null, groundInto: 0, wall: null, wallInto: 0, ceil: false };
      for (let it = 0; it < 3; it++) {
        let moved = false;
        for (const c of this.circles(p)) {
          this.world.query(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r, seg => {
            if (seg.ow && !this.oneWayOk(p, seg, c.y)) return;
            const q = closest(seg, c.x, c.y);
            const dx = c.x - q.x, dy = c.y - q.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= c.r * c.r) return;
            let nx, ny, pen;
            const side = dx * seg.nx + dy * seg.ny;
            if (q.t > 0 && q.t < 1 && side < 0) {
              nx = seg.nx; ny = seg.ny; pen = c.r - side;
            } else {
              const d = Math.sqrt(d2);
              if (d < 1e-6) { nx = seg.nx; ny = seg.ny; pen = c.r; }
              else { nx = dx / d; ny = dy / d; pen = c.r - d; }
            }
            p.x += nx * pen; p.y += ny * pen;
            c.x += nx * pen; c.y += ny * pen;
            moved = true;
            const vn = p.vx * nx + p.vy * ny;
            let into = 0;
            if (vn < 0) { into = -vn; p.vx -= vn * nx; p.vy -= vn * ny; }
            if (c.feet && ny < C.GROUND_NY) {
              if (!out.ground || ny < out.ground.ny) out.ground = { nx, ny, ow: seg.ow };
              out.groundInto = Math.max(out.groundInto, into);
            } else if (ny > 0.5) {
              out.ceil = true;
            } else if (ny >= C.GROUND_NY && Math.abs(nx) > 0.5 && !seg.ow) {
              if (into >= out.wallInto) { out.wall = { nx, ny }; out.wallInto = into; }
            }
          });
        }
        if (!moved) break;
      }
      return out;
    }

    findGround(p, reach) {
      const r = C.FEET_R;
      let best = null, bd = Infinity;
      this.world.query(p.x - r - reach, p.y - r - reach, p.x + r + reach, p.y + r + reach, seg => {
        if (seg.ow && !this.oneWayOk(p, seg, p.y)) return;
        const q = closest(seg, p.x, p.y);
        const dx = p.x - q.x, dy = p.y - q.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r + reach || d < 1e-6) return;
        const ny = dy / d;
        if (ny >= C.GROUND_NY) return;
        if (d < bd) { bd = d; best = { px: q.x, py: q.y, nx: dx / d, ny, ow: seg.ow }; }
      });
      return best;
    }

    overlaps(x, y, r) {
      let hit = false;
      this.world.query(x - r, y - r, x + r, y + r, seg => {
        if (hit || seg.ow) return;
        const q = closest(seg, x, y);
        const dx = x - q.x, dy = y - q.y;
        if (dx * dx + dy * dy < r * r) hit = true;
      });
      return hit;
    }

    canStand(p) {
      return !this.overlaps(p.x, p.y - C.HEAD_OFF, C.HEAD_R);
    }

    // ---------- Paso de simulación (60 Hz) ----------
    // inp: { left, right, down, jump (mantenida), jumpPressed (flanco) }
    step(inp) {
      const p = this.p;
      if (this.finished) return;
      if (p.dead) {
        if (--p.deadT <= 0) this.respawn();
        return;
      }
      this.frames++;
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      p.dir = dir;
      if (inp.jumpPressed) p.jumpBuf = C.BUFFER; else if (p.jumpBuf > 0) p.jumpBuf--;
      if (p.lock > 0) p.lock--;
      if (p.dropT > 0) p.dropT--;
      if (p.slideCD > 0) p.slideCD--;
      if (p.airGrace > 0) p.airGrace--;
      if (p.wallT > 0) p.wallT--;
      p.wallPrev = p.wallN;
      p.wallN = null;

      if (p.grounded) this.groundStep(inp, dir); else this.airStep(inp, dir);

      this.checkSprings(inp);
      this.checkPickups();
      if (p.y > this.level.waterY + 60) this.die();
    }

    groundStep(inp, dir) {
      const p = this.p;
      p.coyote = C.COYOTE;

      if (inp.down && !p.sliding) {
        p.sliding = true;
        if (Math.abs(p.gs) > 4 && p.slideCD <= 0) {
          p.gs *= 1.12;
          p.slideCD = 24;
          this.emit('slide');
        }
      } else if (!inp.down && p.sliding && this.canStand(p)) {
        p.sliding = false;
      }

      if (p.jumpBuf > 0) {
        if (inp.down && p.groundOW) {
          p.dropT = 14; p.grounded = false; p.jumpBuf = 0; p.sliding = false;
          p.vx = -p.ny * p.gs; p.vy = 1; p.y += 2;
          return this.airStep(inp, dir);
        }
        this.doJump();
        return this.airStep(inp, dir);
      }

      const tx = -p.ny, ty = p.nx;
      let gs = p.gs;
      gs += C.SLOPE_G * ty * (p.sliding ? 1.35 : 1);

      if (!p.sliding) {
        if (dir !== 0) {
          p.facing = dir;
          if (gs * dir < 0) gs += dir * C.DECEL;
          else if (gs * dir < C.MAX_RUN) {
            const prev = gs;
            gs += dir * (Math.abs(gs) < 2 ? C.ACCEL_START : C.ACCEL);
            if (Math.abs(gs) > C.MAX_RUN && Math.abs(prev) <= C.MAX_RUN) gs = dir * C.MAX_RUN;
          } else {
            gs -= dir * C.OVER_DRAG;
          }
        } else {
          gs -= Math.sign(gs) * Math.min(Math.abs(gs), C.FRICTION);
        }
      } else {
        const f = Math.abs(gs) < 2 ? 0.15 : C.SLIDE_FRIC;
        gs -= Math.sign(gs) * Math.min(Math.abs(gs), f);
        if (Math.abs(gs) > 1) p.facing = Math.sign(gs);
      }
      gs = Math.max(-C.MAX_SPEED, Math.min(C.MAX_SPEED, gs));

      p.gs = gs;
      p.vx = tx * gs; p.vy = ty * gs;
      const n = Math.max(1, Math.ceil(Math.abs(gs) / 6));
      const reach = Math.min(16, 5 + Math.abs(gs) * 0.7);

      for (let i = 0; i < n; i++) {
        p.x += p.vx / n; p.y += p.vy / n;
        const c = this.resolve(p);

        if (c.wall) {
          p.wallN = c.wall; p.wallT = 6; p.wallSide = Math.sign(c.wall.nx);
          if (dir !== 0 && c.wall.nx * dir < 0 && c.wallInto >= C.WALLRUN_MIN) {
            this.startWallRun(c.wallInto);
            return;
          }
        }
        if (c.wall || c.ceil) p.gs = p.vx * -p.ny + p.vy * p.nx;

        const onx = p.nx, ony = p.ny;
        let g = this.findGround(p, reach);
        // Un giro brusco hacia afuera de la superficie es un borde convexo (lomo de rampa): sale volando.
        if (g && p.gs !== 0) {
          const dnx = -g.ny * Math.sign(p.gs), dny = g.nx * Math.sign(p.gs);
          const convex = dnx * onx + dny * ony < 0;
          if (convex && g.nx * onx + g.ny * ony < 0.94) g = null;
        }
        if (g) {
          p.x = g.px + g.nx * C.FEET_R; p.y = g.py + g.ny * C.FEET_R;
          p.nx = g.nx; p.ny = g.ny; p.groundOW = g.ow;
          p.vx = -p.ny * p.gs; p.vy = p.nx * p.gs;
        } else {
          p.grounded = false; p.sliding = false; p.coyote = C.COYOTE;
          p.vx = -ony * p.gs; p.vy = onx * p.gs;
          return;
        }
      }
    }

    doJump() {
      const p = this.p;
      const tx = -p.ny, ty = p.nx;
      const J = C.JUMP_V + Math.min(Math.abs(p.gs), 12) * 0.1;
      p.vx = tx * p.gs + p.nx * J;
      p.vy = ty * p.gs + p.ny * J;
      if (p.sliding) p.vx *= 1.08;
      p.grounded = false; p.sliding = false; p.jumping = true;
      p.coyote = 0; p.jumpBuf = 0; p.airGrace = 3;
      this.emit('jump');
    }

    startWallRun(into) {
      const p = this.p;
      p.grounded = false; p.sliding = false; p.jumping = false;
      p.wallRun = C.WALLRUN_FRAMES;
      p.vy = -Math.min(into * 0.95, 10.5);
      p.airGrace = 2;
      this.emit('wallrun');
    }

    airStep(inp, dir) {
      const p = this.p;
      if (p.coyote > 0) p.coyote--;

      if (p.jumpBuf > 0) {
        if (p.coyote > 0) {
          p.vy = -C.JUMP_V; p.jumping = true; p.coyote = 0; p.jumpBuf = 0; p.airGrace = 3;
          this.emit('jump');
        } else if (p.wallT > 0) {
          p.vx = p.wallSide * C.WALL_JUMP_X;
          p.vy = -C.WALL_JUMP_Y;
          p.facing = p.wallSide;
          p.lock = C.WALL_LOCK; p.wallRun = 0; p.jumping = true;
          p.jumpBuf = 0; p.wallT = 0; p.airGrace = 2;
          this.emit('walljump');
        }
      }

      if (dir !== 0 && p.lock <= 0) {
        p.facing = dir;
        if (p.vx * dir < C.MAX_AIR) {
          p.vx += dir * C.AIR_ACC;
          if (p.vx * dir > C.MAX_AIR && p.vx * dir - C.AIR_ACC < C.MAX_AIR) p.vx = dir * C.MAX_AIR;
        }
      }

      let g = C.GRAV;
      if (p.wallRun > 0) {
        if (p.wallPrev && dir !== 0 && p.wallPrev.nx * dir < 0) { g *= 0.25; p.wallRun--; }
        else p.wallRun = 0;
      }
      p.vy = Math.min(p.vy + g, C.MAX_FALL);

      if (!inp.jump && p.jumping && p.vy < -C.JUMP_CUT) p.vy = -C.JUMP_CUT;
      if (p.wallPrev && dir !== 0 && p.wallPrev.nx * dir < 0 && p.vy > C.WALL_SLIDE && p.wallRun <= 0) {
        p.vy = C.WALL_SLIDE;
      }
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > C.MAX_SPEED + 3) { p.vx *= (C.MAX_SPEED + 3) / sp; p.vy *= (C.MAX_SPEED + 3) / sp; }

      const n = Math.max(1, Math.ceil(sp / 6));
      for (let i = 0; i < n; i++) {
        p.x += p.vx / n; p.y += p.vy / n;
        const c = this.resolve(p);
        if (c.wall) {
          p.wallN = c.wall; p.wallT = 6; p.wallSide = Math.sign(c.wall.nx);
          if (p.wallRun <= 0 && p.vy > -2 && dir !== 0 && c.wall.nx * dir < 0 && c.wallInto >= C.WALLRUN_MIN) {
            p.wallRun = C.WALLRUN_FRAMES;
            p.vy = -Math.min(c.wallInto * 0.95, 10.5);
            this.emit('wallrun');
          }
        }
        if (c.ground && p.airGrace <= 0 && (c.groundInto > 0 || p.vy >= 0)) {
          p.grounded = true; p.jumping = false; p.wallRun = 0;
          p.nx = c.ground.nx; p.ny = c.ground.ny; p.groundOW = c.ground.ow;
          p.gs = p.vx * -p.ny + p.vy * p.nx;
          p.vx = -p.ny * p.gs; p.vy = p.nx * p.gs;
          this.emit('land', { impact: c.groundInto });
          return;
        }
      }
    }

    checkSprings() {
      const p = this.p;
      for (const s of this.springs) {
        if (s.t > 0) s.t--;
        const feet = p.y + C.FEET_R;
        if (Math.abs(p.x - s.x) < 24 && feet > s.y - 16 && feet < s.y + 8 && (p.vy >= -1 || p.grounded) && s.t <= 0) {
          p.vx = p.grounded ? -p.ny * p.gs : p.vx;
          p.vy = -C.SPRING_V;
          p.grounded = false; p.sliding = false; p.jumping = false; p.wallRun = 0;
          p.coyote = 0; p.airGrace = 3;
          s.t = 14;
          this.emit('spring');
        }
      }
    }

    checkPickups() {
      const p = this.p;
      for (const b of this.beans) {
        if (b.got) continue;
        const dx = b.x - p.x, dy = b.y - (p.y - 8);
        if (dx * dx + dy * dy < 26 * 26) {
          b.got = true; this.beanCount++;
          this.emit('bean', { bx: b.x, by: b.y });
        }
      }
      for (const c of this.checkpoints) {
        if (!c.hit && Math.abs(p.x - c.x) < 34 && Math.abs(p.y - c.y) < 200) {
          c.hit = true;
          this.respawnPoint = { x: c.x, y: c.y };
          this.emit('checkpoint', { cx: c.x, cy: c.y });
        }
      }
      const g = this.level.goal;
      if (Math.abs(p.x - g.x) < 40 && Math.abs(p.y - g.y) < 140) {
        this.finished = true;
        this.emit('goal');
      }
    }

    die() {
      const p = this.p;
      p.dead = true; p.deadT = 50; this.deaths++;
      this.emit('death');
    }

    respawn() {
      this.placeAt(this.respawnPoint);
      this.emit('respawn');
    }
  }

  const api = { C, World, Sim };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BobPhysics = api;
})(typeof window !== 'undefined' ? window : globalThis);
