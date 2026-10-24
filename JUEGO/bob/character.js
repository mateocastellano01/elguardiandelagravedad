// Renderizador de BoB a partir de una "pose" (números). Sin estado: lo usan el juego,
// la vista previa y el exportador de guías.
// Convención: origen = centro del círculo de los pies, +x = hacia adelante, +y = abajo, suelo en y = +13.
(function (root) {
  'use strict';

  const INK = '#070b0d';
  const SUIT = '#424c5b';
  const SUIT_BACK = '#2f3744';
  const SKIN = '#c3c25c';
  const SKIN_HI = '#dcdb82';
  const TIE = '#a31f33';

  const LEG = 13, ARM = 10.5;
  const KNEE = -1;   // las rodillas se doblan hacia adelante (+x)
  const ELBOW = 1;   // los codos se doblan hacia atrás (-x)

  // Miembro de dos huesos. `bend` > 0 dobla la articulación hacia -x cuando el miembro apunta hacia abajo.
  function ik(sx, sy, ex, ey, l1, l2, bend) {
    let dx = ex - sx, dy = ey - sy;
    let d = Math.hypot(dx, dy) || 0.001;
    const max = l1 + l2 - 0.01;
    if (d > max) { ex = sx + dx / d * max; ey = sy + dy / d * max; dx = ex - sx; dy = ey - sy; d = max; }
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / d, uy = dy / d;
    return { mx: sx + ux * a - uy * h * bend, my: sy + uy * a + ux * h * bend, ex, ey };
  }

  function limb(ctx, sx, sy, ex, ey, l1, l2, bend, width, color) {
    const j = ik(sx, sy, ex, ey, l1, l2, bend);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(j.mx, j.my); ctx.lineTo(j.ex, j.ey);
    ctx.strokeStyle = INK; ctx.lineWidth = width + 3.5; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    return j;
  }

  function shoe(ctx, x, y) {
    const ang = -Math.max(0, Math.min(0.7, (13 - y) * 0.05));
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#0d0f12'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(3.5, 1, 7, 3.8, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(5, -0.8, 3, 1, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  function hand(ctx, x, y) {
    ctx.fillStyle = SKIN; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill(); ctx.stroke();
  }

  function drawCup(ctx) {
    ctx.save();
    ctx.fillStyle = '#a2703f'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-3.5, -4); ctx.lineTo(3.5, -4); ctx.lineTo(2.5, 5); ctx.lineTo(-2.5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f3eadb'; ctx.fillRect(-4, -6, 8, 2.5); ctx.strokeRect(-4, -6, 8, 2.5);
    ctx.restore();
  }

  // Cabeza: cilindro redondeado, un poco más ancho arriba. Cuello en (0,-25), tope en y = -70.
  function drawHead(ctx, blink, mood) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5.5, -25);
    ctx.bezierCurveTo(-8, -34, -9, -50, -8.5, -60);
    ctx.bezierCurveTo(-8.2, -68, -3, -70.5, 1, -70.5);
    ctx.bezierCurveTo(6.5, -70.5, 10, -67, 10, -59);
    ctx.bezierCurveTo(10, -50, 9.5, -40, 9, -33);
    ctx.bezierCurveTo(9.2, -29.5, 8, -26, 4.5, -24.5);
    ctx.closePath();
    ctx.fillStyle = SKIN; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    // brillo y sombra para dar volumen
    ctx.strokeStyle = SKIN_HI; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-4.5, -36); ctx.bezierCurveTo(-5.5, -48, -5, -58, -2, -65); ctx.stroke();
    ctx.strokeStyle = 'rgba(70,75,20,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(6.5, -52); ctx.bezierCurveTo(7.5, -46, 7.2, -40, 7, -35); ctx.stroke();
    // ojo almendrado negro
    ctx.save(); ctx.translate(4.8, -38); ctx.rotate(0.35);
    ctx.fillStyle = '#050607';
    ctx.beginPath(); ctx.ellipse(0, 0, 3.3, blink ? 0.7 : 5.4, 0, 0, 7); ctx.fill();
    if (!blink) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(-1, -2.2, 1, 0, 7); ctx.fill(); }
    ctx.restore();
    // arrugas / cicatrices
    ctx.strokeStyle = 'rgba(40,50,15,0.7)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0.5, -33); ctx.lineTo(3.5, -30.5);
    ctx.moveTo(2.5, -35); ctx.lineTo(6, -32.5);
    ctx.stroke();
    // boca
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (mood === 'open') { ctx.ellipse(6.8, -28.5, 2.4, 2.2, 0, 0, 7); ctx.fillStyle = '#2a0c10'; ctx.fill(); }
    else { ctx.moveTo(4.5, -28.5); ctx.lineTo(8.8, -29); }
    ctx.stroke();
  }

  // pose: ver animations.js. o: { tie:{x,y}, blink, mood, squash, scale }
  function drawPose(ctx, pose, o) {
    o = o || {};
    const k = o.scale || 1.05;
    ctx.save();
    ctx.translate(0, 13);
    ctx.scale(k * (1 + (o.squash || 0) * 0.5), k * (1 - (o.squash || 0)));
    ctx.translate(0, -13);

    const hip = pose.hip;
    if (pose.body) { ctx.translate(0, hip); ctx.rotate(pose.body); ctx.translate(0, -hip); }
    const nx = pose.lean * 26 + 1, ny = hip - 25;

    // lado trasero
    limb(ctx, 0, hip, pose.fbx, pose.fby, LEG, LEG, KNEE, 6, SUIT_BACK);
    shoe(ctx, pose.fbx, pose.fby + 0.5);
    limb(ctx, nx, ny + 3, pose.hbx, pose.hby, ARM, ARM, ELBOW, 4.5, SUIT_BACK);
    hand(ctx, pose.hbx, pose.hby);

    // torso: saco, camisa y corbata
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, hip); ctx.lineTo(nx, ny);
    ctx.strokeStyle = INK; ctx.lineWidth = 13.5; ctx.stroke();
    ctx.strokeStyle = SUIT; ctx.lineWidth = 10; ctx.stroke();
    ctx.fillStyle = '#efece3'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(nx - 3, ny - 1); ctx.lineTo(nx + 4, ny - 1); ctx.lineTo(nx + 1, ny + 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    const tie = o.tie || { x: -2, y: 13 };
    ctx.fillStyle = TIE; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(nx - 1, ny + 1);
    ctx.quadraticCurveTo(nx + tie.x * 0.5 + 2, ny + 4, nx + tie.x, ny + tie.y);
    ctx.lineTo(nx + tie.x + 1.5, ny + tie.y + 3);
    ctx.quadraticCurveTo(nx + tie.x * 0.5 + 4, ny + 5, nx + 2, ny + 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // lado delantero
    limb(ctx, 0, hip, pose.fax, pose.fay, LEG, LEG, KNEE, 6, SUIT);
    shoe(ctx, pose.fax, pose.fay + 0.5);
    limb(ctx, nx, ny + 3, pose.hax, pose.hay, ARM, ARM, ELBOW, 4.5, SUIT);
    if (pose.cup > 0.05) { ctx.save(); ctx.translate(pose.hax + 1, pose.hay - 4); ctx.globalAlpha = Math.min(1, pose.cup * 2); drawCup(ctx); ctx.restore(); }
    hand(ctx, pose.hax, pose.hay);

    // cabeza apoyada en el cuello
    ctx.save();
    ctx.translate(nx, ny + 2);
    ctx.rotate(pose.head);
    ctx.scale(0.72, 0.72);
    ctx.translate(0, 25);
    drawHead(ctx, !!o.blink, o.mood || 'closed');
    ctx.restore();

    ctx.restore();
  }

  // Orbe Negro: usa la textura del ícono flotante de la web si está cargada.
  function drawOrb(ctx, ox, oy, img) {
    ctx.save(); ctx.translate(ox, oy);
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 20);
    g.addColorStop(0, 'rgba(120,90,200,0.3)'); g.addColorStop(1, 'rgba(120,90,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fill();
    if (img && img.complete && img.naturalWidth) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(1, 7.5, 6, 1.6, 0, 0, 7); ctx.fill();
      ctx.drawImage(img, -8, -8, 16, 16);
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#0a0a10'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(-2.2, -2.4, 2, 1.2, -0.6, 0, 7); ctx.fill();
    ctx.restore();
  }

  const api = { drawPose, drawOrb, drawHead, ik };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BobCharacter = api;
})(typeof window !== 'undefined' ? window : globalThis);
