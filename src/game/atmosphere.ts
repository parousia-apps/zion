import * as THREE from 'three';
import { buildProcedural } from './procedural';

/**
 * L'atmosphère d'un lieu : ce qui le rend vivant et lui donne une « présence ».
 * - un soleil avec son halo, des nuages qui dérivent ;
 * - des halos lumineux autour des sources de lumière (torches, brasero) ;
 * - de la poussière dorée qui flotte dans la lumière ;
 * - des colombes qui tournent autour de la tour, des papillons près des fleurs.
 *
 * Tout est léger (sprites et points, pas de post-traitement coûteux) et
 * s'arrête avec l'option « Réduire les animations ».
 */

export interface AtmosphereOptions {
  calm: boolean;
  low: boolean;
  /** Centre autour duquel tournent les colombes (la tour du Gardien), s'il y en a un. */
  doveCenter?: THREE.Vector3;
  /** Endroits fleuris où volent les papillons. */
  flowerSpots: THREE.Vector3[];
  /** Couleur chaude du soleil. */
  sunColor: string;
}

/* ------------------------------------------------------------------ */
/* Textures dessinées en code                                           */
/* ------------------------------------------------------------------ */

let glowTex: THREE.CanvasTexture | null = null;
/** Halo rond et doux (dégradé radial) : pour le soleil et les lumières. */
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,200,0.55)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let cloudTex: THREE.CanvasTexture | null = null;
/** Nuage cotonneux : plusieurs disques flous superposés. */
function cloudTexture(): THREE.CanvasTexture {
  if (cloudTex) return cloudTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const puffs = [[70, 78, 46], [120, 60, 58], [175, 76, 44], [100, 88, 40], [150, 92, 38]];
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(255,250,245,0.6)');
    g.addColorStop(1, 'rgba(255,245,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  return cloudTex;
}

/** Sprite lumineux additif (halo) à poser sur une source de lumière. */
export function halo(color: string, size: number, opacity = 0.8): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  s.scale.setScalar(size);
  s.userData.baseOpacity = opacity;
  return s;
}

/* ------------------------------------------------------------------ */

interface Flyer {
  obj: THREE.Object3D;
  update: (dt: number, t: number) => void;
}

export class Atmosphere {
  readonly root = new THREE.Group();
  private readonly clouds: THREE.Sprite[] = [];
  private readonly halos: THREE.Sprite[] = [];
  private readonly flyers: Flyer[] = [];
  private dust: THREE.Points | null = null;
  private readonly disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(private readonly opts: AtmosphereOptions, sunDirection: THREE.Vector3) {
    // Soleil : un disque lumineux et son grand halo, loin dans le ciel.
    const sunPos = sunDirection.clone().normalize().multiplyScalar(150);
    const sun = halo('#fff4d6', 60, 1);
    sun.position.copy(sunPos);
    const sunCore = halo('#ffffff', 16, 1);
    sunCore.position.copy(sunPos);
    this.root.add(sun, sunCore);

    // Nuages
    const n = opts.low ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, opacity: 0.85, depthWrite: false, fog: false });
      this.disposables.push(mat);
      const cloud = new THREE.Sprite(mat);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const r = 90 + Math.random() * 40;
      cloud.position.set(Math.cos(a) * r, 38 + Math.random() * 26, Math.sin(a) * r - 30);
      const s = 34 + Math.random() * 30;
      cloud.scale.set(s, s / 2, 1);
      this.clouds.push(cloud);
      this.root.add(cloud);
    }

    if (!opts.calm && !opts.low) this.buildDust();
    if (opts.doveCenter) this.buildDoves(opts.doveCenter);
    if (!opts.calm) this.buildButterflies(opts.flowerSpots.slice(0, opts.low ? 3 : 6));
  }

  /** Ajoute un halo lumineux qui « respire » doucement (torches, brasero, lumières). */
  addLight(position: THREE.Vector3, color: string, size: number) {
    const h = halo(color, size, 0.7);
    h.position.copy(position);
    this.halos.push(h);
    this.root.add(h);
  }

  private buildDust() {
    const count = 160;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set([(Math.random() - 0.5) * 24, Math.random() * 6, (Math.random() - 0.5) * 24], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTexture(),
      color: '#ffe7a8',
      size: 0.12,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.disposables.push(geo, mat);
    this.dust = new THREE.Points(geo, mat);
    this.root.add(this.dust);
  }

  private buildDoves(center: THREE.Vector3) {
    const count = this.opts.low ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const bird = buildProcedural('dove');
      bird.scale.setScalar(0.9);
      const wingL = bird.getObjectByName('wingL');
      const wingR = bird.getObjectByName('wingR');
      const radius = 4.5 + i * 0.9;
      const height = 10 + (i % 3) * 1.4;
      const speed = 0.35 + i * 0.05;
      const phase = (i / count) * Math.PI * 2;
      this.root.add(bird);
      this.flyers.push({
        obj: bird,
        update: (_dt, t) => {
          const a = this.opts.calm ? phase : phase + t * speed;
          bird.position.set(center.x + Math.cos(a) * radius, height + Math.sin(t * 0.8 + i) * 0.5, center.z + Math.sin(a) * radius);
          bird.rotation.y = -a; // tangente au cercle
          const flap = this.opts.calm ? 0.2 : Math.sin(t * 11 + i) * 0.7;
          if (wingL) wingL.rotation.z = flap;
          if (wingR) wingR.rotation.z = -flap;
        },
      });
    }
  }

  private buildButterflies(spots: THREE.Vector3[]) {
    const colors = ['#ff7ab6', '#ffd23f', '#7cc6ff', '#ffffff', '#ff9f43'];
    spots.forEach((spot, i) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide });
      const wingGeo = new THREE.CircleGeometry(0.09, 8);
      this.disposables.push(mat, wingGeo);
      const left = new THREE.Mesh(wingGeo, mat);
      const right = new THREE.Mesh(wingGeo, mat);
      left.position.x = -0.07;
      right.position.x = 0.07;
      g.add(left, right);
      this.root.add(g);
      const seed = i * 1.7;
      this.flyers.push({
        obj: g,
        update: (_dt, t) => {
          const k = t * 0.6 + seed;
          g.position.set(spot.x + Math.sin(k) * 1.2, 0.8 + Math.sin(k * 2.3) * 0.35, spot.z + Math.cos(k * 0.8) * 1.2);
          const flap = Math.sin(t * 16 + seed) * 1.1;
          left.rotation.y = flap;
          right.rotation.y = -flap;
          g.rotation.y = k;
        },
      });
    });
  }

  update(dt: number, t: number, player: THREE.Vector3) {
    if (!this.opts.calm) {
      for (const c of this.clouds) {
        c.position.x += dt * 0.6;
        if (c.position.x > 140) c.position.x = -140;
      }
      for (const [i, h] of this.halos.entries()) {
        (h.material as THREE.SpriteMaterial).opacity = h.userData.baseOpacity * (0.85 + Math.sin(t * 2.2 + i) * 0.15);
      }
    }
    for (const f of this.flyers) f.update(dt, t);
    if (this.dust) {
      // La poussière suit le joueur et monte lentement, comme dans un rayon de soleil.
      this.dust.position.set(player.x, 0, player.z);
      const a = this.dust.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) + dt * 0.15;
        if (y > 6) y = 0;
        a.setY(i, y);
        a.setX(i, a.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.05);
      }
      a.needsUpdate = true;
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
