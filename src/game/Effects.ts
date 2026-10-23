import * as THREE from 'three';
import type { EffectName } from '../types';
import { audio } from '../core/audio';
import { buildModel } from './models';
import type { World } from './World';

/**
 * Effets visuels déclenchés par les dialogues (champ "fx" d'une réplique).
 *
 * Chaque effet a une version « calme » quand l'option Réduire les animations
 * est active : l'information passe toujours (sous-titre, couleur du ciel),
 * mais sans mouvement rapide ni particules.
 */

interface Running {
  update: (dt: number) => boolean; // renvoie false quand l'effet est fini
  dispose?: () => void;
}

export class Effects {
  private running: Running[] = [];
  private rain: THREE.Object3D & { geometry: THREE.BufferGeometry; material: THREE.Material } | null = null;
  /** Pluie qui dure tout le chapitre (météo) : elle ne s'arrête pas à la fin d'un dialogue. */
  private weather: 'rain' | 'storm' | null = null;
  private lightningTimer = 3;
  private readonly baseHemi: number;
  private readonly baseSun: number;

  constructor(
    private readonly world: World,
    private readonly anchor: () => THREE.Vector3,
    private readonly calm: boolean,
    private readonly lowQuality: boolean,
    /** Pour afficher un sous-titre (« [Tonnerre] ») sans dépendre de l'interface. */
    private readonly caption: (key: string) => void = () => {},
  ) {
    this.baseHemi = world.hemi.intensity;
    this.baseSun = world.sun.intensity;
  }

  /** Météo du chapitre : pluie ou orage qui durent jusqu'à un arc-en-ciel ou un « calme ». */
  setWeather(w: 'rain' | 'storm' | null): void {
    this.weather = w;
    if (w) this.startRain();
    else this.stopRain();
  }

  play(name: EffectName): void {
    switch (name) {
      case 'rain': return this.startRain();
      case 'dove': this.weather = null; this.stopRain(); return this.dove();
      case 'rainbow': this.weather = null; this.stopRain(); return this.rainbow();
      case 'harp': audio.harp(); return this.notes();
      case 'celebrate': audio.celebrate(); return this.confetti();
      case 'glow': audio.play('bell'); return this.glow();
      case 'heal': audio.play('chime'); return this.sparkles('#b9f6ca');
      case 'sunset': return this.sunset();
      case 'storm': return this.setWeather('storm');
      case 'calm': this.weather = null; return this.stopRain();
    }
  }

  /** Coupe les effets « d'ambiance » (pluie) à la fin d'un dialogue, sauf la météo du chapitre. */
  settle(): void {
    if (!this.weather) this.stopRain();
  }

  update(dt: number): void {
    // La pluie suit le joueur : il reste toujours sous l'averse.
    if (this.rain) {
      const c = this.anchor();
      this.rain.position.set(c.x, 0, c.z);
    }
    if (this.weather === 'storm') this.lightning(dt);
    this.running = this.running.filter((r) => {
      const alive = r.update(dt);
      if (!alive) r.dispose?.();
      return alive;
    });
  }

  dispose(): void {
    this.running.forEach((r) => r.dispose?.());
    this.running = [];
    this.stopRain();
  }

  /* ---------------------------------------------------------------- */

  private startRain() {
    audio.rain(true);
    this.world.hemi.intensity = this.baseHemi * 0.6;
    this.world.sun.intensity = this.baseSun * 0.15;
    if (this.calm || this.rain) return;
    // Des traits de pluie (segments de 45 cm) plutôt que des points : on voit l'averse tomber.
    const count = this.lowQuality ? 250 : 700;
    const pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 30;
      const y = Math.random() * 14;
      const z = (Math.random() - 0.5) * 30;
      pos.set([x, y, z, x - 0.06, y + 0.45, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0.55 }));
    this.world.root.add(this.rain);
    const rain = this.rain;
    this.running.push({
      update: (dt) => {
        if (this.rain !== rain) return false;
        const a = rain.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < count * 2; i += 2) {
          let y = a.getY(i) - dt * 16;
          if (y < 0) y += 14;
          a.setY(i, y);
          a.setY(i + 1, y + 0.45);
        }
        a.needsUpdate = true;
        return true;
      },
    });
  }

  /**
   * Éclair : une lueur douce qui monte puis redescend, puis le tonnerre.
   * Jamais de clignotement rapide (protection des personnes photosensibles) :
   * au plus un éclair toutes les 5 secondes, sur près d'une demi-seconde.
   */
  private lightning(dt: number) {
    this.lightningTimer -= dt;
    if (this.lightningTimer > 0) return;
    this.lightningTimer = 5 + Math.random() * 5;
    window.setTimeout(() => {
      audio.play('thunder');
      this.caption('captions.thunder');
    }, 700);
    if (this.calm) return;
    let t = 0;
    const base = this.world.hemi.intensity;
    this.running.push({
      update: (d) => {
        t += d;
        const k = Math.sin(Math.min(1, t / 0.45) * Math.PI);
        this.world.hemi.intensity = base + k * 1.1;
        return t < 0.45;
      },
      dispose: () => (this.world.hemi.intensity = base),
    });
  }

  private stopRain() {
    audio.rain(false);
    this.world.hemi.intensity = this.baseHemi;
    this.world.sun.intensity = this.baseSun;
    if (this.rain) {
      this.rain.geometry.dispose();
      (this.rain.material as THREE.Material).dispose();
      this.rain.removeFromParent();
      this.rain = null;
    }
  }

  private rainbow() {
    const colors = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#3949ab', '#8e24aa'];
    const group = new THREE.Group();
    colors.forEach((c, i) => {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(16 - i * 0.6, 0.32, 6, 48, Math.PI),
        new THREE.MeshBasicMaterial({ color: c, fog: false }),
      );
      group.add(arc);
    });
    const c = this.anchor();
    group.position.set(c.x, -1, c.z - 30);
    this.world.root.add(group);
    if (this.calm) return;
    group.scale.setScalar(0.01);
    let t = 0;
    this.running.push({
      update: (dt) => {
        t = Math.min(1, t + dt / 2.5);
        group.scale.setScalar(easeOut(t));
        return t < 1;
      },
    });
  }

  private dove() {
    const bird = buildModel('dove').obj;
    const c = this.anchor();
    this.world.root.add(bird);
    if (this.calm) {
      bird.position.set(c.x + 1, 2.4, c.z - 1);
      return;
    }
    let t = 0;
    const wingL = bird.getObjectByName('wingL');
    const wingR = bird.getObjectByName('wingR');
    this.running.push({
      update: (dt) => {
        t += dt;
        // Un grand cercle dans le ciel puis la colombe se pose près du joueur.
        const k = Math.min(1, t / 6);
        const a = k * Math.PI * 2;
        const r = 8 * (1 - k) + 1;
        bird.position.set(c.x + Math.cos(a) * r, 2.4 + Math.sin(k * Math.PI) * 4, c.z - 2 + Math.sin(a) * r);
        bird.rotation.y = -a;
        const flap = k < 1 ? Math.sin(t * 18) * 0.6 : 0;
        if (wingL) wingL.rotation.z = flap;
        if (wingR) wingR.rotation.z = -flap;
        return k < 1;
      },
    });
  }

  private sunset() {
    // Lumière chaude mais légère : on garde des couleurs franches.
    this.world.hemi.color.set('#ffe0c8');
    this.world.sun.color.set('#ffc48a');
    this.world.skyMaterial.color.set('#ffd9c2');
  }

  /** Notes de musique (♪) qui s'envolent. */
  private notes() {
    if (this.calm) return;
    const tex = noteTexture();
    const c = this.anchor();
    for (let i = 0; i < 6; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: i % 2 ? '#ffd23f' : '#ff4f7b', transparent: true }));
      sprite.scale.setScalar(0.6);
      sprite.position.set(c.x + (Math.random() - 0.5), 1.5, c.z + (Math.random() - 0.5));
      this.world.root.add(sprite);
      let t = -i * 0.35;
      const drift = (Math.random() - 0.5) * 1.5;
      this.running.push({
        update: (dt) => {
          t += dt;
          if (t < 0) {
            sprite.visible = false;
            return true;
          }
          sprite.visible = true;
          sprite.position.y = 1.5 + t * 1.2;
          sprite.position.x += drift * dt;
          sprite.material.opacity = Math.max(0, 1 - t / 2.5);
          return t < 2.5;
        },
        dispose: () => {
          sprite.material.dispose();
          sprite.removeFromParent();
        },
      });
    }
  }

  private confetti() {
    if (this.calm) return;
    const count = this.lowQuality ? 80 : 200;
    const c = this.anchor();
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel: THREE.Vector3[] = [];
    const palette = ['#ff4f2e', '#ffd23f', '#00c2a8', '#2340ff', '#ff4f7b'].map((h) => new THREE.Color(h));
    for (let i = 0; i < count; i++) {
      pos.set([c.x, 1.5, c.z], i * 3);
      const p = palette[i % palette.length];
      col.set([p.r, p.g, p.b], i * 3);
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 5, (Math.random() - 0.5) * 6));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.18, vertexColors: true }));
    this.world.root.add(points);
    let t = 0;
    this.running.push({
      update: (dt) => {
        t += dt;
        const a = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < count; i++) {
          vel[i].y -= 9 * dt;
          a.setXYZ(i, a.getX(i) + vel[i].x * dt, Math.max(0.05, a.getY(i) + vel[i].y * dt), a.getZ(i) + vel[i].z * dt);
        }
        a.needsUpdate = true;
        return t < 3;
      },
      dispose: () => {
        geo.dispose();
        (points.material as THREE.Material).dispose();
        points.removeFromParent();
      },
    });
  }

  /** Lumière dorée qui monte autour du joueur (onction de David). */
  private glow() {
    const c = this.anchor();
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 3, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.position.set(c.x, 1.5, c.z);
    this.world.root.add(ring);
    let t = 0;
    this.running.push({
      update: (dt) => {
        t += dt;
        if (!this.calm) ring.scale.y = 0.5 + Math.sin(t * 2) * 0.1 + t * 0.2;
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.35 * Math.max(0, 1 - t / 5);
        return t < 5;
      },
      dispose: () => {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
        ring.removeFromParent();
      },
    });
  }

  private sparkles(color: string) {
    if (this.calm) return;
    const c = this.anchor();
    const geo = new THREE.BufferGeometry();
    const n = 40;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([c.x + (Math.random() - 0.5) * 2, Math.random() * 1.5, c.z + (Math.random() - 0.5) * 2], i * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.15, transparent: true }));
    this.world.root.add(pts);
    let t = 0;
    this.running.push({
      update: (dt) => {
        t += dt;
        pts.position.y = t * 0.8;
        (pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - t / 2);
        return t < 2;
      },
      dispose: () => {
        geo.dispose();
        (pts.material as THREE.Material).dispose();
        pts.removeFromParent();
      },
    });
  }
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

let noteTex: THREE.CanvasTexture | null = null;
function noteTexture() {
  if (noteTex) return noteTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♪', 32, 34);
  noteTex = new THREE.CanvasTexture(cv);
  return noteTex;
}
