/** Base commune à toutes les entités du monde. */
export class Entity {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.dead = false;
    this.walkT = Math.random() * 10;
    this.facing = 1; // 1 = droite, -1 = gauche
  }

  move(vx, vy, dt) {
    this.x += vx * dt;
    this.y += vy * dt;
    const moving = Math.abs(vx) + Math.abs(vy) > 5;
    if (moving) this.walkT += dt;
    if (Math.abs(vx) > 5) this.facing = Math.sign(vx);
    return moving;
  }

  // eslint-disable-next-line no-unused-vars
  update(dt, game) {}

  // eslint-disable-next-line no-unused-vars
  draw(ctx, time) {}
}

/** Ombre portée au sol. */
export function drawShadow(ctx, r) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.9, r * 1.05, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Silhouette humanoïde simple et lisible vue de face (style « chibi »).
 * L'origine est aux pieds du personnage, centrée.
 */
export function drawHumanoid(ctx, { r, bob, body, skin, hair, legs = '#2a2230', scared = false, eyes = '#1a1a1a' }) {
  // Jambes
  const step = Math.sin(bob * 14) * 3;
  ctx.fillStyle = legs;
  ctx.fillRect(-r * 0.45, r * 0.2 + step * 0.3, r * 0.35, r * 0.65);
  ctx.fillRect(r * 0.1, r * 0.2 - step * 0.3, r * 0.35, r * 0.65);

  const lift = Math.abs(Math.sin(bob * 14)) * 2;

  // Corps
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-r * 0.7, -r * 0.7 - lift, r * 1.4, r * 1.15, r * 0.35);
  ctx.fill();

  // Tête
  const hy = -r * 1.25 - lift;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, hy, r * 0.62, 0, Math.PI * 2);
  ctx.fill();

  // Cheveux
  if (hair) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(0, hy - r * 0.1, r * 0.64, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  // Yeux
  ctx.fillStyle = eyes;
  const eyeR = scared ? r * 0.14 : r * 0.09;
  ctx.beginPath();
  ctx.arc(-r * 0.22, hy + r * 0.08, eyeR, 0, Math.PI * 2);
  ctx.arc(r * 0.22, hy + r * 0.08, eyeR, 0, Math.PI * 2);
  ctx.fill();
  if (scared) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-r * 0.22, hy + r * 0.08, eyeR * 0.45, 0, Math.PI * 2);
    ctx.arc(r * 0.22, hy + r * 0.08, eyeR * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  return hy;
}
