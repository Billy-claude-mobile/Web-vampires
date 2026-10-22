import { CONFIG } from '../config.js';
import { baseStats } from '../upgrades.js';
import { clamp } from '../utils.js';
import { Entity, drawShadow } from './entity.js';

export class Player extends Entity {
  constructor() {
    super(0, 0, CONFIG.player.radius);
    this.stats = baseStats(CONFIG.player.speed);
    this.blood = CONFIG.player.startBlood;
    this.invuln = 0;
    this.frenzy = 0;
    this.batAngle = 0;
    this.novaTimer = 0;
    this.hurtFlash = 0;
    this.moving = false;
  }

  get maxBlood() {
    return CONFIG.player.maxBlood;
  }

  get inFrenzy() {
    return this.frenzy > 0;
  }

  get biteRadius() {
    return this.radius + this.stats.biteRange;
  }

  get novaCooldown() {
    const n = CONFIG.nova;
    return Math.max(n.minCooldown, n.baseCooldown - (this.stats.nova - 1) * n.cooldownStep);
  }

  get novaRadius() {
    return CONFIG.nova.baseRadius + (this.stats.nova - 1) * CONFIG.nova.radiusStep;
  }

  /** Positions des chauves-souris en orbite. */
  get batPositions() {
    const { orbitRadius } = CONFIG.bats;
    const n = this.stats.bats;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = this.batAngle + (i / n) * Math.PI * 2;
      out.push({ x: this.x + Math.cos(a) * orbitRadius, y: this.y + Math.sin(a) * orbitRadius * 0.8 });
    }
    return out;
  }

  addBlood(amount) {
    this.blood = clamp(this.blood + amount, 0, this.maxBlood);
  }

  update(dt, game) {
    const dir = game.input.vector;
    const speed = this.stats.speed * (this.inFrenzy ? CONFIG.frenzy.speedMult : 1);
    this.moving = this.move(dir.x * speed, dir.y * speed, dt);

    this.invuln = Math.max(0, this.invuln - dt);
    this.frenzy = Math.max(0, this.frenzy - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.batAngle += CONFIG.bats.angularSpeed * dt;
  }

  draw(ctx, time) {
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);

    // Aura de frénésie
    if (this.inFrenzy) {
      const pulse = 1 + Math.sin(time * 12) * 0.1;
      const g = ctx.createRadialGradient(0, -r, 2, 0, -r, r * 3.2 * pulse);
      g.addColorStop(0, 'rgba(255, 60, 80, 0.55)');
      g.addColorStop(1, 'rgba(255, 0, 40, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -r, r * 3.2 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    drawShadow(ctx, r);

    // Clignote quand invulnérable après un coup
    if (this.invuln > 0 && !this.inFrenzy && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.4;

    ctx.scale(this.facing, 1);
    const bob = this.moving ? Math.sin(this.walkT * 14) * 1.5 : Math.sin(time * 2) * 0.8;
    const flap = this.moving ? Math.sin(this.walkT * 10) * 3 : 0;

    // Cape (extérieur noir, doublure rouge)
    ctx.fillStyle = '#140a18';
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 1.4 + bob);
    ctx.quadraticCurveTo(-r * 1.7 - flap, 0, -r * 1.25 - flap, r * 0.9);
    ctx.lineTo(r * 1.25 + flap, r * 0.9);
    ctx.quadraticCurveTo(r * 1.7 + flap, 0, r * 0.5, -r * 1.4 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8f0f24';
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 1.2 + bob);
    ctx.quadraticCurveTo(-r * 1.25 - flap, 0, -r * 0.95 - flap, r * 0.75);
    ctx.lineTo(r * 0.95 + flap, r * 0.75);
    ctx.quadraticCurveTo(r * 1.25 + flap, 0, r * 0.4, -r * 1.2 + bob);
    ctx.closePath();
    ctx.fill();

    // Costume
    ctx.fillStyle = '#1e1424';
    ctx.beginPath();
    ctx.roundRect(-r * 0.55, -r * 1.0 + bob, r * 1.1, r * 1.9, r * 0.3);
    ctx.fill();
    ctx.fillStyle = '#e9e1ea';
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, -r * 0.95 + bob);
    ctx.lineTo(0, -r * 0.2 + bob);
    ctx.lineTo(r * 0.25, -r * 0.95 + bob);
    ctx.fill();

    // Col relevé
    ctx.fillStyle = '#b3132e';
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, -r * 1.75 + bob);
    ctx.lineTo(-r * 0.2, -r * 0.95 + bob);
    ctx.lineTo(-r * 0.65, -r * 0.9 + bob);
    ctx.closePath();
    ctx.moveTo(r * 0.75, -r * 1.75 + bob);
    ctx.lineTo(r * 0.2, -r * 0.95 + bob);
    ctx.lineTo(r * 0.65, -r * 0.9 + bob);
    ctx.closePath();
    ctx.fill();

    // Tête
    const hy = -r * 1.55 + bob;
    ctx.fillStyle = this.hurtFlash > 0 ? '#ffb0b0' : '#ddd3e6';
    ctx.beginPath();
    ctx.arc(0, hy, r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Cheveux plaqués avec pointe frontale
    ctx.fillStyle = '#0b0710';
    ctx.beginPath();
    ctx.arc(0, hy - r * 0.05, r * 0.66, Math.PI * 1.02, Math.PI * 1.98);
    ctx.lineTo(r * 0.3, hy - r * 0.35);
    ctx.lineTo(0, hy - r * 0.05);
    ctx.lineTo(-r * 0.3, hy - r * 0.35);
    ctx.closePath();
    ctx.fill();

    // Yeux rouges luisants
    ctx.shadowColor = '#ff2040';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ff2a45';
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, hy + r * 0.05, r * 0.11, r * 0.07, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.22, hy + r * 0.05, r * 0.11, r * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Crocs
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, hy + r * 0.3);
    ctx.lineTo(-r * 0.09, hy + r * 0.48);
    ctx.lineTo(-r * 0.03, hy + r * 0.3);
    ctx.moveTo(r * 0.03, hy + r * 0.3);
    ctx.lineTo(r * 0.09, hy + r * 0.48);
    ctx.lineTo(r * 0.15, hy + r * 0.3);
    ctx.fill();

    ctx.restore();
  }

  drawBats(ctx, time) {
    for (const [i, b] of this.batPositions.entries()) drawBat(ctx, b.x, b.y, time + i, 1.3);
  }
}

export function drawBat(ctx, x, y, time, scale = 1) {
  const flap = Math.sin(time * 22) * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#1b0f22';
  ctx.strokeStyle = '#6d3a8a';
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 8, -10 * flap - 4, side * 15, -4 * flap);
    ctx.lineTo(side * 10, 2);
    ctx.lineTo(side * 7, -1);
    ctx.lineTo(side * 4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff3050';
  ctx.fillRect(-2.2, -2, 1.5, 1.5);
  ctx.fillRect(0.7, -2, 1.5, 1.5);
  ctx.restore();
}
