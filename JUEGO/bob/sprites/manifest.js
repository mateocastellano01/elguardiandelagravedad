// Configuración de los sprites de BoB.
// Cada animación puede ser:
//   false                          -> usa la animación procedural (dibujada por código)
//   true                           -> usa tus sprites, a la velocidad por defecto de la animación
//   { listo: true, ms: [...] }     -> usa tus sprites con una duración (en milisegundos) para cada frame
//   { listo: true, orden: [...] }  -> reproduce los frames en otro orden (se pueden repetir frames)
// Si falta algún frame, el juego vuelve solo a la versión procedural (y avisa en la consola).
// Ver sprites/README.md para el flujo completo.
window.BOB_SPRITES = {
  size: 512,          // los sprites generados miden 512 x 512 px
  pivot: [256, 380],  // píxel del centro de los pies (el suelo queda en y = 432)
  ppu: 4,             // píxeles por unidad de juego
  ext: 'webp',
  anims: {
    // 00 = ojos abiertos (pausa larga), 01–05 = parpadeo, 06–07 = ojos abiertos.
    idle: { listo: true, ms: [1700, 45, 45, 90, 45, 45, 400, 400] },
    idle_sip: false,
    skid: false,
    // zancada = unidades que avanza BoB en un ciclo completo (8 frames); fpsMax = tope de dibujos por segundo.
    run: { listo: true, zancada: 100, fpsMin: 8, fpsMax: 24 },
    air: false,
    land: false,
    slide_start: false,
    slide: false,
    slide_end: false,
    wall_slide: false,
    wall_run: false,
    wall_jump: false,
    spring: false,
  },
};
