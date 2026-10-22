import { CONFIG } from '../config.js';
import { dirTo, rand } from '../utils.js';
import { drawHumanoid, drawShadow } from './entity.js';
import { Human } from './humans.js';

/**
 * Ennemis débloqués après les boss (voir CONFIG.progression.unlocks).
 * Ils restent des proies mordables : le danger vient de leurs attaques annoncées.
 */

/** Limier : chien de chasse rapide qui s'accroupit (télégraphe) puis bondit. */
export class Hound extends Human {
  constructor(x, y) {
    super(x, y, CONFIG.hound);
    this.kind = 'hound';
    this.state = 'chase'; // chase → crouch → lunge → recover
    this.timer = 0;
    this.cooldown = rand(0.5, 1.5);
    this.lungeAngle = 0;
  }

  /** Un limier en plein bond blesse au contact au lieu de se faire mordre. */
  get dangerous() {
    return this.state === 'lunge';
  }

  /** Arrête le bond après avoir touché le joueur. */
  endLunge() {
    this.state = 'recover';
    this.timer = this.cfg.recoverTime;
  }

  update(dt, game) {
    const cfg = this.cfg;
    const p = game.player;
    const to = dirTo(this, p);
    this.timer -= dt;
    this.cooldown -= dt;

    switch (this.state) {
      case 'chase': {
        const speed = cfg.speed * game.threat.speed * p.stats.preySlow;
        this.move(to.x * speed, to.y * speed, dt);
        if (to.d < cfg.lungeRange && this.cooldown <= 0 && game.isOnScreen(this, 10)) {
          this.state = 'crouch';
          this.timer = cfg.crouchTime;
          this.lungeAngle = Math.atan2(p.y - this.y, p.x - this.x);
          this.facing = Math.cos(this.lungeAngle) >= 0 ? 1 : -1;
          game.audio.aim();
        }
        break;
      }
      case 'crouch':
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = cfg.lungeTime;
        }
        break;
      case 'lunge': {
        const speed = cfg.lungeSpeed * game.threat.speed;
        this.move(Math.cos(this.lungeAngle) * speed, Math.sin(this.lungeAngle) * speed, dt);
        if (this.timer <= 0) this.endLunge();
        break;
      }
      case 'recover':
        if (this.timer <= 0) {
          this.state = 'chase';
          this.cooldown = cfg.cooldown;
        }
        break;
      default:
    }
  }

  drawAim(ctx) {
    if (this.state !== 'crouch') return;
    const k = 1 - this.timer / this.cfg.crouchTime;
    const len = this.cfg.lungeSpeed * this.cfg.lungeTime;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.lungeAngle);
    ctx.fillStyle = `rgba(255, 30, 50, ${0.12 + k * 0.25})`;
    ctx.fillRect(0, -this.radius, len, this.radius * 2);
    ctx.fillStyle = 'rgba(255, 60, 80, 0.45)';
    ctx.fillRect(0, -this.radius, len * k, this.radius * 2);
    ctx.restore();
  }

  draw(ctx, time) {
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);
    drawShadow(ctx, r);
    ctx.scale(this.facing, 1);
    const crouch = this.state === 'crouch' ? 3 : 0;
    const run = this.state === 'chase' || this.state === 'lunge' ? Math.sin(this.walkT * 18) * 2 : 0;

    // Pattes
    ctx.fillStyle = '#3b2c22';
    ctx.fillRect(-r * 0.9, -r * 0.1 + run, r * 0.3, r * 0.9 - crouch);
    ctx.fillRect(r * 0.5, -r * 0.1 - run, r * 0.3, r * 0.9 - crouch);
    // Corps
    ctx.fillStyle = '#5e4a3a';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.4 + crouch, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // Queue
    ctx.strokeStyle = '#5e4a3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, -r * 0.5 + crouch);
    ctx.quadraticCurveTo(-r * 1.6, -r * 1.2 + Math.sin(time * 14) * 3, -r * 1.7, -r * 0.9);
    ctx.stroke();
    // Tête et museau
    ctx.fillStyle = '#6e5848';
    ctx.beginPath();
    ctx.arc(r * 1.0, -r * 0.85 + crouch, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 1.45, -r * 0.7 + crouch, r * 0.35, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Oreille
    ctx.fillStyle = '#3b2c22';
    ctx.beginPath();
    ctx.moveTo(r * 0.8, -r * 1.2 + crouch);
    ctx.lineTo(r * 0.95, -r * 1.65 + crouch);
    ctx.lineTo(r * 1.1, -r * 1.2 + crouch);
    ctx.fill();
    // Œil (rouge pendant l'attaque) et collier
    ctx.fillStyle = this.state === 'crouch' || this.state === 'lunge' ? '#ff3050' : '#1a1a1a';
    ctx.beginPath();
    ctx.arc(r * 1.12, -r * 0.92 + crouch, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9e1424';
    ctx.fillRect(r * 0.6, -r * 0.6 + crouch, r * 0.2, r * 0.45);
    ctx.restore();
  }
}

/** Herboriste : garde ses distances et lance des fioles d'ail qui laissent un nuage. */
export class Herbalist extends Human {
  constructor(x, y) {
    super(x, y, CONFIG.herbalist);
    this.kind = 'herbalist';
    this.throwTimer = rand(1.5, 3);
    this.windup = 0;
  }

  update(dt, game) {
    const cfg = this.cfg;
    const p = game.player;
    const to = dirTo(this, p);

    // Bras levé avant le lancer : courte annonce visuelle
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        game.throwGarlic(this.x, this.y - this.radius * 2, p.x, p.y);
        this.throwTimer = rand(cfg.throwMin, cfg.throwMax) / game.threat.fireRate;
      }
      return;
    }

    const speed = cfg.speed * game.threat.speed;
    if (to.d > cfg.rangeMax) this.move(to.x * speed, to.y * speed, dt);
    else if (to.d < cfg.rangeMin) this.move(-to.x * speed, -to.y * speed, dt);

    this.throwTimer -= dt;
    if (this.throwTimer <= 0 && game.isOnScreen(this, 20)) {
      this.windup = cfg.windup;
      this.facing = to.x >= 0 ? 1 : -1;
    }
  }

  draw(ctx) {
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);
    drawShadow(ctx, r);
    ctx.scale(this.facing, 1);
    const hy = drawHumanoid(ctx, { r, bob: this.walkT, body: '#4f6b3a', skin: this.skin, hair: null, legs: '#2e3a22' });
    // Capuche verte
    ctx.fillStyle = '#3c5a2c';
    ctx.beginPath();
    ctx.arc(0, hy - r * 0.05, r * 0.7, Math.PI, Math.PI * 2);
    ctx.fill();
    // Ceinture de gousses d'ail
    ctx.fillStyle = '#f2ecd8';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * r * 0.4, -r * 0.05, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fiole brandie pendant l'élan
    if (this.windup > 0) {
      ctx.fillStyle = '#c8e6a0';
      ctx.beginPath();
      ctx.arc(r * 0.6, hy - r * 0.9, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Fiole d'ail : vole jusqu'à sa cible (point d'impact annoncé), puis nuage persistant. */
export class GarlicCloud {
  constructor(fromX, fromY, x, y) {
    const cfg = CONFIG.herbalist.cloud;
    this.fromX = fromX;
    this.fromY = fromY;
    this.x = x;
    this.y = y;
    this.radius = cfg.radius;
    this.flight = CONFIG.herbalist.flightTime;
    this.maxFlight = this.flight;
    this.life = cfg.duration;
    this.dead = false;
  }

  /** Le nuage n'agit qu'une fois la fiole tombée. */
  get active() {
    return this.flight <= 0 && this.life > 0;
  }

  contains(e) {
    return this.active && Math.hypot(e.x - this.x, e.y - this.y) < this.radius;
  }

  update(dt) {
    if (this.flight > 0) {
      this.flight -= dt;
      return;
    }
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx, time) {
    if (this.flight > 0) {
      // Zone d'impact annoncée + fiole en vol (arc parabolique)
      const k = 1 - this.flight / this.maxFlight;
      ctx.strokeStyle = `rgba(190, 230, 140, ${0.4 + k * 0.5})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const fx = this.fromX + (this.x - this.fromX) * k;
      const fy = this.fromY + (this.y - this.fromY) * k - Math.sin(k * Math.PI) * 90;
      ctx.fillStyle = '#c8e6a0';
      ctx.beginPath();
      ctx.arc(fx, fy, 5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const fade = Math.min(1, this.life / 0.6);
    for (let i = 0; i < 5; i++) {
      const a = time * 0.6 + i * 1.3;
      const ox = Math.cos(a) * this.radius * 0.35;
      const oy = Math.sin(a * 1.3) * this.radius * 0.25;
      ctx.fillStyle = `rgba(170, 210, 120, ${0.16 * fade})`;
      ctx.beginPath();
      ctx.arc(this.x + ox, this.y + oy, this.radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = `rgba(200, 240, 150, ${0.5 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
