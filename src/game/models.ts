import * as THREE from 'three';
import type { ModelKind, PersonLook, Vec2 } from '../types';
import { instance } from './assets';
import * as B from './buildings';
import { baseFor, createCharacter, type Character } from './characters';
import { buildProcedural, glow, mat, wheelchair } from './procedural';

export { glow, mat };

/**
 * L'« aiguilleur » des modèles 3D.
 *
 * Pour chaque type d'objet (ModelKind), il choisit :
 * 1. un vrai modèle .glb (Quaternius, CC0) s'il est chargé ;
 * 2. une construction texturée en code (maisons, tour...) ;
 * 3. sinon une forme de secours (procedural.ts).
 *
 * Convention : chaque modèle est posé au sol (y = 0) et regarde vers +z.
 */

export interface BuildOptions {
  look?: PersonLook;
  color?: string;
  size?: Vec2;
  scale?: number;
  /** Graine de variation (choix du palmier, forme de la maison...). */
  seed?: number;
}

export interface Animated {
  mixer: THREE.AnimationMixer;
  idle?: THREE.AnimationAction;
  walk?: THREE.AnimationAction;
  current: 'idle' | 'walk';
  character?: Character;
}

export type Solids = [number, number, number][];

export interface Built {
  obj: THREE.Group;
  anim?: Animated;
  solids?: Solids;
}

/** Fichiers .glb utilisés par chaque type d'objet (plusieurs = variantes). */
const ASSETS: Partial<Record<ModelKind, string[]>> = {
  sheep: ['sheep'],
  donkey: ['donkey'],
  horse: ['horse'],
  deer: ['deer'],
  stag: ['stag'],
  zebra: ['zebra'],
  tree: ['tree'],
  olive: ['tree2'],
  palm: ['palm1', 'palm2', 'palm3'],
  bush: ['bush', 'bushflowers'],
  flowers: ['flowers'],
  rock: ['rocks', 'rocklarge'],
  well: ['well'],
  stall: ['marketstand'],
  market: ['marketstalls'],
  cart: ['cart'],
  barrel: ['barrel'],
  crate: ['crate'],
  bench: ['bench'],
  bag: ['bag'],
  lamp: ['torch'],
};

/** Hauteur réelle visée, en mètres (chaque modèle source a sa propre échelle). */
const HEIGHT: Record<string, number> = {
  sheep: 0.95, donkey: 1.55, horse: 1.9, deer: 1.45, stag: 1.95, zebra: 1.55,
  tree: 5.2, tree2: 3.8, palm1: 6, palm2: 5.4, palm3: 6.4,
  bush: 1.1, bushflowers: 1.2, flowers: 0.35, rocks: 0.7, rocklarge: 1.4,
  well: 2.9, marketstand: 3.1, marketstalls: 3.2, cart: 2.4, barrel: 1, crate: 0.8,
  bench: 0.55, bag: 0.55, torch: 2.2, grass: 0.35, tallgrass: 0.8,
};

/** Obstacles par type, en coordonnées locales : [x, z, rayon]. */
const SOLIDS: Partial<Record<ModelKind, Solids>> = {
  tree: [[0, 0, 0.45]],
  olive: [[0, 0, 0.45]],
  palm: [[0, 0, 0.35]],
  rock: [[0, 0, 0.85]],
  well: [[0, 0, 1.3]],
  stall: [[-0.7, 0, 0.9], [0.7, 0, 0.9]],
  market: [[-1.4, 0, 1.4], [1.4, 0, 1.4]],
  cart: [[0, 0, 1]],
  barrel: [[0, 0, 0.45]],
  crate: [[0, 0, 0.45]],
  bench: [[-0.5, 0, 0.35], [0.5, 0, 0.35]],
  harp: [[0, 0, 0.6]],
  lamp: [[0, 0, 0.2]],
};

/** Modèles .glb nécessaires pour construire ce type d'objet (préchargement). */
export function assetsFor(kind: ModelKind, o: BuildOptions = {}): string[] {
  if (kind === 'person') return [baseFor(o.look ?? { tunic: '#ffffff' })];
  if (kind === 'house' || kind === 'tower') return ['archdoor', 'barrel', 'torch'];
  if (kind === 'pen') return ['fence'];
  if (kind === 'harp') return ['rocks'];
  return ASSETS[kind] ?? [];
}

const fit = new Map<string, { k: number; minY: number }>();

/** Instance d'un .glb, mise à l'échelle et posée au sol. */
function fitted(name: string) {
  const inst = instance(name);
  if (!inst) return null;
  let f = fit.get(name);
  if (!f) {
    // Indispensable avant de mesurer : place les os du squelette (sinon la taille est fausse).
    inst.obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inst.obj);
    const h = Math.max(0.001, box.max.y - box.min.y);
    f = { k: (HEIGHT[name] ?? h) / h, minY: box.min.y };
    fit.set(name, f);
  }
  inst.obj.children[0].position.y = -f.minY;
  inst.obj.scale.setScalar(f.k);
  return inst;
}

function animate(obj: THREE.Object3D, clips: THREE.AnimationClip[]): Animated | undefined {
  if (!clips.length) return undefined;
  const mixer = new THREE.AnimationMixer(obj);
  const pick = (re: RegExp) => clips.find((c) => re.test(c.name));
  const idleClip = pick(/idle/i) ?? pick(/eat/i) ?? clips[0];
  const walkClip = pick(/walk/i) ?? pick(/run|gallop/i);
  const idle = mixer.clipAction(idleClip);
  idle.play();
  idle.time = Math.random() * idleClip.duration;
  return { mixer, idle, walk: walkClip ? mixer.clipAction(walkClip) : undefined, current: 'idle' };
}

/** Construit n'importe quel objet par son type. */
export function buildModel(kind: ModelKind, o: BuildOptions = {}): Built {
  const seed = o.seed ?? 1;
  const solidsFrom = (obj: THREE.Group, fallback?: Solids): Built => ({
    obj,
    solids: (obj.userData.solids as Solids | undefined) ?? fallback ?? SOLIDS[kind],
  });

  switch (kind) {
    case 'person': {
      const look = o.look ?? { tunic: '#2a5bd7' };
      const c = createCharacter(look);
      if (!c) return { obj: buildProcedural('person', o) };
      const wrap = new THREE.Group();
      wrap.add(c.obj);
      if (look.wheelchair) {
        const chair = wheelchair();
        chair.scale.setScalar(1 / (look.height ?? 1));
        wrap.add(chair);
        c.obj.position.y = 0.05;
      }
      if (look.lying) {
        // Allongé sur le dos, au sol.
        c.obj.rotation.x = -Math.PI / 2;
        c.obj.position.set(0, 0.18, -0.85);
      }
      return { obj: wrap, anim: { mixer: c.mixer, idle: c.actions.idle, walk: c.actions.walk, current: 'idle', character: c } };
    }
    case 'house': {
      const [w, d] = o.size ?? [0, 0];
      return solidsFrom(B.house({ w: w || undefined, d: d || undefined, accent: o.color, seed }));
    }
    case 'tower': return solidsFrom(B.tower());
    case 'fountain': return solidsFrom(B.fountain());
    case 'stage': return solidsFrom(B.stage(o.color));
    case 'ark': return solidsFrom(B.ark());
    case 'tent': return solidsFrom(B.tent(o.color));
    case 'pen': return { obj: B.pen(3 * (o.scale ?? 1)) };
    case 'ramp': return { obj: B.ramp() };
    case 'water': return solidsFrom(B.groundPatch('water', o.size ?? [3, 3], o.color));
    case 'road': return { obj: B.groundPatch('road', o.size ?? [3, 10], o.color) };
    case 'plaza': return { obj: B.groundPatch('plaza', o.size ?? [8, 8], o.color) };
    case 'harp': {
      const g = buildProcedural('harp');
      const rock = fitted('rocks');
      if (rock) {
        g.children[0].visible = false; // on remplace le rocher de secours par le vrai
        rock.obj.scale.multiplyScalar(0.8);
        g.add(rock.obj);
      }
      return solidsFrom(g);
    }
  }

  const names = ASSETS[kind];
  if (names) {
    const name = names[Math.floor(Math.abs(seed)) % names.length];
    const inst = fitted(name);
    if (inst) {
      const wrap = new THREE.Group();
      wrap.add(inst.obj);
      if (o.scale) wrap.scale.setScalar(o.scale);
      // Petite rotation aléatoire de la végétation : la nature n'est jamais alignée.
      if (['tree', 'olive', 'palm', 'bush', 'rock', 'flowers'].includes(kind)) inst.obj.rotation.y = seed * 1.7;
      return { obj: wrap, anim: animate(inst.obj, inst.clips), solids: SOLIDS[kind] };
    }
  }
  return { obj: buildProcedural(kind, o), solids: SOLIDS[kind] };
}

/** Distance à laquelle on peut interagir, selon la taille du modèle. */
export function defaultReach(kind: ModelKind): number {
  switch (kind) {
    case 'elephant': return 2.6;
    case 'giraffe':
    case 'horse':
    case 'zebra':
    case 'stag':
    case 'deer':
    case 'donkey': return 2.2;
    case 'pen': return 4.2;
    case 'stage': return 3.5;
    case 'harp': return 1.9;
    default: return 1.8;
  }
}

/** Espacement quand l'entité suit le joueur en file indienne. */
export function followGap(kind: ModelKind): number {
  if (kind === 'elephant') return 2.4;
  if (['giraffe', 'donkey', 'horse', 'zebra', 'stag', 'deer'].includes(kind)) return 2.1;
  return 1.3;
}

/** Hauteur du marqueur doré au-dessus d'une entité. */
export function markerHeight(kind: ModelKind, look?: PersonLook): number {
  switch (kind) {
    case 'giraffe': return 4.2;
    case 'elephant': return 3.4;
    case 'horse':
    case 'stag': return 2.7;
    case 'donkey':
    case 'zebra':
    case 'deer': return 2.4;
    case 'person': return look?.lying ? 1.2 : 2.4 * (look?.height ?? 1);
    case 'harp': return 2;
    default: return 1.8;
  }
}
