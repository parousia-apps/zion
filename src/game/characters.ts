import * as THREE from 'three';
import type { PersonLook } from '../types';
import { instance } from './assets';

/**
 * Personnages humains à partir des modèles Quaternius (CC0), « habillés »
 * pour l'époque biblique.
 *
 * Les trois modèles de base partagent le même squelette (62 os) et les
 * mêmes animations (Idle, Walk, Wave, Interact). On les personnalise :
 * - teinte de peau, cheveux/barbe, couleurs des vêtements (matériaux clonés) ;
 * - tunique longue (« jupe » en forme de cloche accrochée à l'os des hanches),
 *   ceinture, voile accroché à l'os de la tête ;
 * - accessoires modernes masqués (sac à dos, casque, épée) ;
 * - enfants : plus petits, avec une tête un peu plus grosse (vraies proportions).
 */

export type CharacterBase = 'man' | 'man2' | 'woman';

/** Quel modèle de base pour quelle apparence (si "base" n'est pas précisé). */
export function baseFor(look: PersonLook): CharacterBase {
  if (look.base) return look.base;
  if (look.beard) return 'man';
  if (look.scarf) return 'woman';
  return 'man2';
}

/** Rôle de chaque matériau des modèles sources. */
const ROLES: Record<CharacterBase, Record<string, 'tunic' | 'under' | 'accent' | 'feet' | 'hair' | 'keep'>> = {
  man: { Green: 'tunic', LightGreen: 'tunic', Brown2: 'under', Brown: 'accent', Black: 'feet', Grey: 'feet', Hair: 'hair', Eyebrows: 'hair', Gold: 'accent' },
  man2: { Worker_Yellow: 'tunic', Worker_Vest: 'tunic', LightBrown: 'tunic', Brown2: 'under', Brown: 'under', Black: 'feet', Grey: 'feet', Moustache: 'hair', Eyebrows: 'hair' },
  woman: { White: 'tunic', Orange: 'under', Grey: 'feet', Hair_Blond: 'hair', Hair_Brown: 'hair', Brown: 'hair' },
};
/** Maillages à cacher (accessoires modernes) : sac à dos, casque de chantier. */
const HIDE = /Backpack|Worker_Head_1/;
/** Les garçons n'ont pas de moustache. */
const CHILD_HIDE = /Moustache|Worker_Head_5/;

const SKIN_DEFAULT = '#a8693a';
const SANDALS = '#6b4226';

function darker(hex: string, k = 0.75): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

export interface Character {
  obj: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<'idle' | 'walk' | 'wave' | 'interact', THREE.AnimationAction>>;
  bones: Record<string, THREE.Bone>;
  current: string;
}

/** Fabrique un personnage ; null si le modèle n'est pas chargé (on utilisera la forme de secours). */
export function createCharacter(look: PersonLook): Character | null {
  const base = baseFor(look);
  const inst = instance(base);
  if (!inst) return null;
  const { obj, clips } = inst;
  const roles = ROLES[base];
  const colors: Record<string, THREE.Color> = {
    tunic: new THREE.Color(look.tunic),
    under: darker(look.tunic, 0.7),
    accent: new THREE.Color(look.accent ?? '#c8a24a'),
    feet: new THREE.Color(SANDALS),
    hair: new THREE.Color(look.beard ?? look.hair ?? '#2a1a10'),
  };
  const child = (look.height ?? 1) < 0.9;
  const dressed = !look.wheelchair;

  const bones: Record<string, THREE.Bone> = {};
  // Chaque personnage a ses propres matériaux (sinon recolorer l'un recolorerait tous les autres).
  const cloned = new Map<THREE.Material, THREE.Material>();
  obj.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    // Sous la tunique longue, les jambes ne se voient pas : on les masque (rien ne dépasse, moins de calcul).
    if (HIDE.test(mesh.name) || (child && CHILD_HIDE.test(mesh.name)) || (dressed && /_Legs/.test(mesh.name))) {
      mesh.visible = false;
      return;
    }
    // Les maillages animés peuvent sortir de leur boîte de départ : on évite qu'ils disparaissent.
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((m) => {
      let c = cloned.get(m);
      if (!c) {
        c = m.clone();
        const std = c as THREE.MeshStandardMaterial;
        const role = roles[m.name];
        if (m.name === 'Skin') std.color.set(look.skin ?? SKIN_DEFAULT);
        else if (role && role !== 'keep') std.color.copy(colors[role]);
        std.roughness = 0.85;
        std.metalness = 0;
        cloned.set(m, c);
      }
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });

  // Les tenues sont mesurées dans la pose de repos du modèle (environ 1,8 m de haut).
  obj.updateMatrixWorld(true);
  if (bones.Hips && dressed) dress(obj, bones.Hips, look);
  if (bones.Head && look.scarf) veil(obj, bones.Head, look.scarf);

  // Enfants : plus petits, tête un peu plus grosse.
  const h = look.height ?? 1;
  obj.scale.setScalar(h);
  if (h < 0.9 && bones.Head) bones.Head.scale.setScalar(1.18);

  const mixer = new THREE.AnimationMixer(obj);
  const clip = (re: RegExp) => clips.find((c) => re.test(c.name));
  const actions: Character['actions'] = {};
  const idle = clip(/\|Idle$/);
  const walk = clip(/\|Walk$/);
  const wave = clip(/\|Wave$/);
  const interact = clip(/\|Interact$/);
  if (idle) actions.idle = mixer.clipAction(idle);
  if (walk) actions.walk = mixer.clipAction(walk);
  for (const [k, c] of [['wave', wave], ['interact', interact]] as const) {
    if (!c) continue;
    const a = mixer.clipAction(c);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    actions[k] = a;
  }
  // Désynchronise les personnages : ils ne respirent pas tous en même temps.
  actions.idle?.play();
  if (actions.idle) actions.idle.time = Math.random() * actions.idle.getClip().duration;

  return { obj, mixer, actions, bones, current: 'idle' };
}

/** Passe en douceur d'une animation à l'autre (fondu de 0,25 s). */
export function setMotion(c: Character, motion: 'idle' | 'walk', speed = 1): void {
  const next = c.actions[motion] ?? c.actions.idle;
  if (!next) return;
  next.timeScale = speed;
  if (c.current === motion) return;
  const prev = c.actions[c.current as 'idle' | 'walk'];
  next.reset().play();
  if (prev && prev !== next) prev.crossFadeTo(next, 0.25, false);
  c.current = motion;
}

/** Petit geste (saluer, montrer) joué une fois par-dessus la pose courante. */
export function gesture(c: Character, kind: 'wave' | 'interact'): void {
  const a = c.actions[kind];
  if (!a) return;
  a.reset();
  a.setEffectiveWeight(1);
  a.fadeIn(0.2).play();
}

/** Assis (fauteuil roulant) : on plie les jambes après chaque mise à jour d'animation. */
export function poseSeated(c: Character): void {
  const b = c.bones;
  for (const side of ['L', 'R']) {
    b[`UpperLeg${side}`]?.rotation.set(-Math.PI / 2.1, 0, side === 'L' ? 0.08 : -0.08);
    b[`LowerLeg${side}`]?.rotation.set(Math.PI / 2.1, 0, 0);
  }
}

/* ------------------------------------------------------------------ */
/* Vêtements ajoutés                                                    */
/* ------------------------------------------------------------------ */

let robeGeo: THREE.LatheGeometry | null = null;
let beltGeo: THREE.CylinderGeometry | null = null;

/** Accroche un objet à un os en gardant l'orientation du personnage (et non celle de l'os). */
function attach(bone: THREE.Bone, root: THREE.Object3D, child: THREE.Object3D, worldPos: THREE.Vector3) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
  const rootQuat = root.getWorldQuaternion(new THREE.Quaternion());
  const boneQuat = bone.getWorldQuaternion(new THREE.Quaternion());
  child.position.copy(worldPos.applyMatrix4(inv));
  child.quaternion.copy(boneQuat.invert().multiply(rootQuat));
  // Compense l'échelle éventuelle de l'os (certains exports sont en centimètres).
  const s = bone.getWorldScale(new THREE.Vector3());
  const rs = root.getWorldScale(new THREE.Vector3());
  child.scale.set(rs.x / s.x, rs.y / s.y, rs.z / s.z);
  bone.add(child);
}

/** Tunique longue jusqu'aux chevilles + ceinture. */
function dress(root: THREE.Object3D, hips: THREE.Bone, look: PersonLook) {
  const hipY = hips.getWorldPosition(new THREE.Vector3()).y - root.getWorldPosition(new THREE.Vector3()).y;
  // Profil de la tunique : de la taille (en haut) vers les chevilles (en bas), en mètres.
  robeGeo ??= new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.33, -0.92),
      new THREE.Vector2(0.3, -0.6),
      new THREE.Vector2(0.26, -0.3),
      new THREE.Vector2(0.21, -0.05),
      new THREE.Vector2(0.18, 0.12),
    ],
    14,
  );
  const robe = new THREE.Mesh(
    robeGeo,
    new THREE.MeshStandardMaterial({ color: look.tunic, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }),
  );
  robe.castShadow = true;
  robe.scale.set(1, (hipY + 0.02) / 0.94, 0.95);
  const anchor = new THREE.Group();
  anchor.add(robe);
  const at = root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, hipY + 0.02, 0));
  attach(hips, root, anchor, at);

  // Ceinture : une bande de tissu qui épouse le haut de la tunique.
  beltGeo ??= new THREE.CylinderGeometry(0.2, 0.205, 0.09, 16, 1, true);
  const belt = new THREE.Mesh(beltGeo, new THREE.MeshStandardMaterial({ color: look.accent ?? '#c8a24a', roughness: 0.8, side: THREE.DoubleSide }));
  belt.scale.set(1, 1, 0.95);
  belt.position.y = 0.09;
  anchor.add(belt);
}

/**
 * Voile posé sur le haut et l'arrière de la tête, qui retombe dans le dos
 * jusqu'aux épaules. Le visage reste entièrement dégagé.
 */
function veil(root: THREE.Object3D, head: THREE.Bone, color: string) {
  const headPos = head.getWorldPosition(new THREE.Vector3());
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, flatShading: true });
  // Calotte : une demi-sphère inclinée vers l'arrière, qui laisse le front et le visage libres.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
  cap.position.set(0, 0.1, -0.03);
  cap.rotation.x = -0.45;
  cap.scale.set(1.08, 1.05, 1.15);
  // Pan de tissu dans le dos uniquement (demi-cylindre côté nuque).
  const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.34, 12, 1, true, Math.PI * 0.5, Math.PI), mat);
  drape.position.set(0, -0.02, -0.05);
  g.add(cap, drape);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  attach(head, root, g, headPos);
}
