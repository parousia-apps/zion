import * as THREE from 'three';
import type { PersonLook } from '../types';
import { buildModel, type Animated } from './models';
import { turnTowards, type World } from './World';

/**
 * Le personnage du joueur.
 *
 * Il reçoit une direction « écran » (x vers la droite, y vers le haut) et la
 * convertit en direction « monde ». Comme la caméra regarde toujours dans la
 * même direction (vers -z), haut de l'écran = -z. Pas de caméra qui tourne :
 * c'est plus simple pour les enfants et ça évite le mal des transports.
 */
export class Player {
  readonly obj: THREE.Group;
  speed = 4.2;
  moving = false;
  private readonly anim?: Animated;
  private bob = 0;

  constructor(look: PersonLook, private readonly reduceMotion: boolean, shadows: boolean) {
    const built = buildModel('person', { look });
    this.obj = built.obj;
    this.anim = built.anim;
    if (!shadows) {
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 16),
        new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.03;
      this.obj.add(shadow);
    }
    // Petit anneau coloré sous le joueur pour le repérer d'un coup d'œil.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 28), new THREE.MeshBasicMaterial({ color: '#00e0b0' }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.obj.add(ring);
  }

  get position(): THREE.Vector3 {
    return this.obj.position;
  }

  place(x: number, z: number, rotDeg = 180) {
    this.obj.position.set(x, 0, z);
    this.obj.rotation.y = (rotDeg * Math.PI) / 180;
  }

  /** dir : direction écran, longueur 0 à 1 (le joystick permet d'aller doucement). */
  update(dt: number, dir: { x: number; y: number }, world: World) {
    const len = Math.min(1, Math.hypot(dir.x, dir.y));
    this.moving = len > 0.05;
    if (this.moving) {
      const wx = dir.x / Math.max(len, 1e-6);
      const wz = -dir.y / Math.max(len, 1e-6);
      this.obj.position.x += wx * this.speed * len * dt;
      this.obj.position.z += wz * this.speed * len * dt;
      world.collide(this.obj.position);
      this.obj.rotation.y = turnTowards(this.obj.rotation.y, Math.atan2(wx, wz), dt * 12);
    }
    const a = this.anim;
    if (a) {
      const next = this.moving ? 'walk' : 'idle';
      const action = next === 'walk' ? a.walk : a.idle;
      // L'animation de marche accélère avec la vitesse : les pieds ne « glissent » pas.
      if (action && this.moving) action.timeScale = 0.6 + len * 0.9;
      if (a.current !== next && action) {
        const prev = a.current === 'walk' ? a.walk : a.idle;
        action.reset().play();
        if (prev && prev !== action) prev.crossFadeTo(action, 0.2, false);
        a.current = next;
      }
      a.mixer.update(this.reduceMotion ? dt * 0.8 : dt);
    } else if (!this.reduceMotion) {
      // Forme de secours : petit rebond de marche.
      const body = this.obj.userData.body as THREE.Object3D | undefined;
      this.bob += dt * 11 * len;
      if (body) body.position.y = this.moving ? Math.abs(Math.sin(this.bob)) * 0.1 : 0;
    }
  }
}
