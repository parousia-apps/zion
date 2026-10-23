import * as THREE from 'three';
import type { ModelKind, PersonLook } from '../types';

/**
 * Formes de SECOURS construites en code (sphères, cylindres...).
 *
 * Elles servent quand un modèle .glb n'a pas pu être chargé (réseau coupé,
 * fichier manquant) et pour les rares objets sans modèle (colombe, harpe).
 * Le jeu reste ainsi toujours jouable.
 *
 * Convention : chaque modèle est un THREE.Group posé au sol (y = 0) et
 * regarde vers +z (vers la caméra) quand sa rotation vaut 0.
 */

const materials = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: string): THREE.MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, m);
  }
  return m;
}

const glows = new Map<string, THREE.MeshBasicMaterial>();
/** Matériau non éclairé : toujours vif (lanternes, marqueurs). */
export function glow(color: string): THREE.MeshBasicMaterial {
  let m = glows.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    glows.set(color, m);
  }
  return m;
}

const geometries = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}

function part(g: THREE.BufferGeometry, material: THREE.Material | string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(g, typeof material === 'string' ? mat(material) : material);
  m.position.set(x, y, z);
  return m;
}

const sphere = (r: number, w = 10, h = 8) => geo(`s${r}-${w}-${h}`, () => new THREE.SphereGeometry(r, w, h));
const box = (x: number, y: number, z: number) => geo(`b${x}-${y}-${z}`, () => new THREE.BoxGeometry(x, y, z));
const cyl = (top: number, bottom: number, h: number, seg = 8) =>
  geo(`c${top}-${bottom}-${h}-${seg}`, () => new THREE.CylinderGeometry(top, bottom, h, seg));
const cone = (r: number, h: number, seg = 8) => geo(`k${r}-${h}-${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const ico = (r: number) => geo(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0));

const C = {
  skin: '#a8693a',
  dark: '#2a2320',
  wood: '#8b4a1f',
  woodDark: '#5d3112',
  leaf: '#2fa84f',
  stone: '#c3ccd6',
  white: '#fbfbfb',
};

/* ------------------------------------------------------------------ */
/* Personnages                                                          */
/* ------------------------------------------------------------------ */

export function person(look: PersonLook): THREE.Group {
  const g = new THREE.Group();
  // "body" est animé séparément (petit rebond de marche) sans toucher à la position du groupe.
  const body = new THREE.Group();
  g.add(body);
  const skin = look.skin ?? C.skin;
  const seated = !!look.wheelchair;

  const robe = part(cyl(0.26, 0.42, 1.0), look.tunic, 0, 0.5, 0);
  if (seated) {
    robe.scale.y = 0.55;
    robe.position.y = 0.72;
  }
  body.add(robe);
  const lift = seated ? 0.22 : 0;
  body.add(part(cyl(0.29, 0.31, 0.12), look.accent ?? '#ffd23f', 0, 0.68 + lift, 0));
  const shoulders = part(sphere(0.3, 8, 6), look.tunic, 0, 0.98 + lift, 0);
  shoulders.scale.y = 0.6;
  body.add(shoulders);

  const head = new THREE.Group();
  head.position.y = 1.3 + lift;
  body.add(head);
  head.add(part(sphere(0.25, 12, 10), skin));
  head.add(part(sphere(0.035, 6, 4), C.dark, -0.09, 0.03, 0.22));
  head.add(part(sphere(0.035, 6, 4), C.dark, 0.09, 0.03, 0.22));
  if (look.hair) {
    const hair = part(geo('hair', () => new THREE.SphereGeometry(0.265, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), look.hair, 0, 0.01, -0.02);
    head.add(hair);
  }
  if (look.scarf) {
    head.add(part(geo('scarf', () => new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6)), look.scarf, 0, 0, -0.03));
    head.add(part(cyl(0.2, 0.28, 0.45), look.scarf, 0, -0.25, -0.12));
  }
  if (look.beard) {
    const beard = part(cone(0.17, 0.36), look.beard, 0, -0.2, 0.13);
    beard.rotation.x = Math.PI;
    head.add(beard);
  }

  for (const side of [-1, 1]) {
    const arm = part(geo('arm', () => new THREE.CapsuleGeometry(0.08, 0.42, 3, 6)), look.tunic, side * 0.36, 0.78 + lift, 0.04);
    arm.rotation.z = side * 0.22;
    if (seated) arm.rotation.x = -0.9;
    body.add(arm);
    body.add(part(sphere(0.09, 6, 5), skin, side * 0.42, seated ? 0.62 + lift : 0.53, seated ? 0.35 : 0.06));
  }

  if (look.staff) {
    const staff = part(cyl(0.04, 0.05, 1.9, 5), C.wood, 0.5, 0.95, 0.1);
    body.add(staff);
  }
  if (look.lantern) {
    body.add(part(cyl(0.1, 0.12, 0.2, 6), C.dark, -0.46, 0.38, 0.12));
    body.add(part(sphere(0.09, 8, 6), glow('#ffd84d'), -0.46, 0.38, 0.12));
  }
  if (seated) g.add(wheelchair());

  const h = look.height ?? 1;
  g.scale.setScalar(h);
  if (look.lying) {
    body.rotation.z = -Math.PI / 2;
    body.position.set(-0.7, 0.3, 0);
  }
  g.userData.body = body;
  return g;
}

export function wheelchair(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(box(0.6, 0.08, 0.55), '#263238', 0, 0.48, 0));
  g.add(part(box(0.6, 0.6, 0.06), '#263238', 0, 0.8, -0.28));
  for (const side of [-1, 1]) {
    const wheel = part(geo('wheel', () => new THREE.TorusGeometry(0.34, 0.04, 6, 16)), '#1565c0', side * 0.36, 0.36, -0.05);
    wheel.rotation.y = Math.PI / 2;
    g.add(wheel);
    g.add(part(sphere(0.07, 6, 5), '#263238', side * 0.25, 0.07, 0.3));
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* Animaux                                                              */
/* ------------------------------------------------------------------ */

function legs(color: string, h: number, r: number, dx: number, dz: number, body: THREE.Group) {
  for (const x of [-dx, dx]) for (const z of [-dz, dz]) body.add(part(cyl(r, r, h, 5), color, x, h / 2, z));
}

function sheep(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const wool = '#f7f7f2';
  for (const [x, y, z] of [[0, 0.62, 0], [0, 0.66, 0.22], [0, 0.66, -0.22], [0.17, 0.6, 0], [-0.17, 0.6, 0], [0, 0.8, 0]]) {
    body.add(part(ico(0.3), wool, x, y, z));
  }
  const head = part(sphere(0.17, 8, 6), C.dark, 0, 0.78, 0.42);
  head.scale.set(0.9, 1, 1.2);
  body.add(head);
  body.add(part(box(0.14, 0.05, 0.07), C.dark, -0.17, 0.83, 0.38));
  body.add(part(box(0.14, 0.05, 0.07), C.dark, 0.17, 0.83, 0.38));
  legs(C.dark, 0.42, 0.05, 0.15, 0.18, body);
  g.userData.body = body;
  return g;
}

function goat(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const fur = '#8d5a3b';
  const torso = part(geo('goatBody', () => new THREE.CapsuleGeometry(0.24, 0.5, 3, 8)), fur, 0, 0.62, 0);
  torso.rotation.x = Math.PI / 2;
  body.add(torso);
  body.add(part(box(0.22, 0.26, 0.32), fur, 0, 0.9, 0.42));
  body.add(part(sphere(0.06, 5, 4), C.dark, 0, 0.72, 0.52));
  for (const side of [-1, 1]) {
    const horn = part(cone(0.04, 0.22, 5), '#e9e2d0', side * 0.07, 1.1, 0.36);
    horn.rotation.x = -0.5;
    body.add(horn);
  }
  legs('#5d3a26', 0.42, 0.045, 0.13, 0.22, body);
  g.userData.body = body;
  return g;
}

function elephant(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const grey = '#8a96a8';
  const torso = part(sphere(0.75, 10, 8), grey, 0, 1.15, 0);
  torso.scale.set(1, 0.85, 1.25);
  body.add(torso);
  body.add(part(sphere(0.48, 10, 8), grey, 0, 1.45, 0.95));
  for (const side of [-1, 1]) {
    const ear = part(sphere(0.4, 8, 6), '#7a8598', side * 0.48, 1.45, 0.8);
    ear.scale.set(0.25, 1, 0.9);
    body.add(ear);
    body.add(part(sphere(0.05, 6, 4), C.dark, side * 0.2, 1.58, 1.35));
    const tusk = part(cone(0.05, 0.3, 5), C.white, side * 0.17, 1.15, 1.32);
    tusk.rotation.x = 2.2;
    body.add(tusk);
  }
  const trunk = part(cyl(0.08, 0.15, 0.85, 6), grey, 0, 1.0, 1.32);
  trunk.rotation.x = 0.25;
  body.add(trunk);
  legs(grey, 0.75, 0.19, 0.4, 0.5, body);
  g.userData.body = body;
  return g;
}

function giraffe(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const coat = '#f2b13b';
  const spot = '#9b5a1a';
  const torso = part(sphere(0.55, 10, 8), coat, 0, 1.6, 0);
  torso.scale.set(0.9, 0.8, 1.3);
  body.add(torso);
  const neck = part(cyl(0.12, 0.18, 1.4, 6), coat, 0, 2.35, 0.45);
  neck.rotation.x = 0.35;
  body.add(neck);
  const head = part(box(0.26, 0.26, 0.5), coat, 0, 3.05, 0.78);
  body.add(head);
  for (const side of [-1, 1]) {
    body.add(part(cyl(0.03, 0.03, 0.18, 4), spot, side * 0.08, 3.25, 0.68));
    body.add(part(sphere(0.04, 5, 4), C.dark, side * 0.13, 3.1, 0.9));
  }
  for (const [x, y, z] of [[0.35, 1.75, 0.2], [-0.35, 1.6, -0.25], [0.3, 1.5, -0.4], [-0.3, 1.8, 0.35]]) {
    const s = part(sphere(0.14, 6, 4), spot, x, y, z);
    s.scale.set(0.4, 1, 1);
    body.add(s);
  }
  legs(coat, 1.25, 0.07, 0.25, 0.45, body);
  g.userData.body = body;
  return g;
}

function rabbit(color = '#b07a4a'): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const torso = part(sphere(0.25, 8, 6), color, 0, 0.25, 0);
  torso.scale.set(1, 0.9, 1.2);
  body.add(torso);
  body.add(part(sphere(0.17, 8, 6), color, 0, 0.45, 0.22));
  body.add(part(sphere(0.07, 6, 4), C.white, 0, 0.3, -0.3));
  for (const side of [-1, 1]) {
    body.add(part(geo('ear', () => new THREE.CapsuleGeometry(0.04, 0.22, 2, 5)), color, side * 0.07, 0.7, 0.18));
    body.add(part(sphere(0.03, 5, 4), C.dark, side * 0.07, 0.5, 0.36));
  }
  g.userData.body = body;
  return g;
}

function donkey(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const coat = '#8b7d74';
  const torso = part(geo('donkeyBody', () => new THREE.CapsuleGeometry(0.33, 0.7, 3, 8)), coat, 0, 0.95, 0);
  torso.rotation.x = Math.PI / 2;
  body.add(torso);
  const neck = part(cyl(0.13, 0.18, 0.6, 6), coat, 0, 1.3, 0.55);
  neck.rotation.x = 0.6;
  body.add(neck);
  body.add(part(box(0.26, 0.28, 0.5), coat, 0, 1.55, 0.8));
  body.add(part(box(0.2, 0.12, 0.12), '#d9d0c9', 0, 1.47, 1.05));
  for (const side of [-1, 1]) {
    body.add(part(geo('dEar', () => new THREE.CapsuleGeometry(0.05, 0.25, 2, 5)), coat, side * 0.09, 1.85, 0.72));
    body.add(part(sphere(0.035, 5, 4), C.dark, side * 0.12, 1.62, 0.98));
  }
  body.add(part(box(0.7, 0.08, 0.6), '#c62828', 0, 1.3, 0));
  legs('#6d625a', 0.7, 0.07, 0.2, 0.42, body);
  g.userData.body = body;
  return g;
}

function dove(): THREE.Group {
  const g = new THREE.Group();
  const body = part(sphere(0.18, 8, 6), C.white);
  body.scale.set(0.8, 0.8, 1.4);
  g.add(body);
  g.add(part(sphere(0.11, 8, 6), C.white, 0, 0.1, 0.22));
  g.add(part(cone(0.03, 0.08, 4), '#ff9800', 0, 0.09, 0.35));
  for (const side of [-1, 1]) {
    const wing = part(box(0.45, 0.03, 0.22), C.white, side * 0.28, 0.05, 0);
    wing.name = side < 0 ? 'wingL' : 'wingR';
    g.add(wing);
  }
  g.add(part(box(0.12, 0.02, 0.1), '#7cb342', 0, 0.06, 0.4));
  return g;
}

/* ------------------------------------------------------------------ */
/* Nature                                                               */
/* ------------------------------------------------------------------ */

function tree(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(cyl(0.15, 0.22, 1.2, 6), C.wood, 0, 0.6, 0));
  g.add(part(ico(0.9), C.leaf, 0, 1.75, 0));
  g.add(part(ico(0.6), '#38c45c', 0.35, 2.3, 0.1));
  return g;
}

function palm(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const seg = part(cyl(0.12, 0.15, 0.6, 6), '#a1662f', i * 0.06, 0.3 + i * 0.55, 0);
    seg.rotation.z = -0.1;
    g.add(seg);
  }
  for (let i = 0; i < 6; i++) {
    const leaf = part(box(0.25, 0.05, 1.5), '#1f9e55', 0, 2.95, 0);
    const pivot = new THREE.Group();
    pivot.position.set(0.3, 2.95, 0);
    pivot.rotation.y = (i / 6) * Math.PI * 2;
    leaf.position.set(0, 0, 0.7);
    leaf.rotation.x = 0.45;
    pivot.add(leaf);
    g.add(pivot);
  }
  return g;
}

function olive(): THREE.Group {
  const g = new THREE.Group();
  const trunk = part(cyl(0.14, 0.26, 1.0, 6), '#6d4c41', 0, 0.5, 0);
  trunk.rotation.z = 0.15;
  g.add(trunk);
  for (const [x, y, z, r] of [[0, 1.35, 0, 0.7], [0.5, 1.2, 0.2, 0.5], [-0.45, 1.25, -0.2, 0.5]]) {
    const f = part(ico(r), '#8fb07a', x, y, z);
    f.scale.y = 0.7;
    g.add(f);
  }
  return g;
}

function rock(): THREE.Group {
  const g = new THREE.Group();
  const r = part(geo('rock', () => new THREE.DodecahedronGeometry(0.7, 0)), '#9aa3ad', 0, 0.35, 0);
  r.scale.set(1.2, 0.8, 1);
  g.add(r);
  return g;
}

function bush(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(ico(0.5), '#3cb65a', 0, 0.35, 0));
  g.add(part(ico(0.35), '#47c968', 0.4, 0.25, 0.1));
  return g;
}

function flowers(): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#ff4f7b', '#ffd23f', '#7c4dff', '#ff7a1a', '#ffffff'];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    const r = 0.25 + (i % 3) * 0.2;
    g.add(part(cyl(0.015, 0.015, 0.3, 3), '#2e7d32', Math.cos(a) * r, 0.15, Math.sin(a) * r));
    g.add(part(sphere(0.08, 6, 4), colors[i % colors.length], Math.cos(a) * r, 0.32, Math.sin(a) * r));
  }
  return g;
}

function water(size: [number, number]): THREE.Group {
  const g = new THREE.Group();
  const m = part(geo('water', () => new THREE.CircleGeometry(1, 24)), '#1e88e5', 0, 0.03, 0);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(size[0], size[1], 1);
  g.add(m);
  return g;
}

function road(size: [number, number], color = '#e8a65d'): THREE.Group {
  const g = new THREE.Group();
  const m = part(geo('plane', () => new THREE.PlaneGeometry(1, 1)), color, 0, 0.02, 0);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(size[0], size[1], 1);
  g.add(m);
  return g;
}

/* ------------------------------------------------------------------ */
/* Constructions                                                        */
/* ------------------------------------------------------------------ */

function house(accent = '#1f6fd1'): THREE.Group {
  const g = new THREE.Group();
  g.add(part(box(3, 2.2, 3), '#f5f7fa', 0, 1.1, 0));
  g.add(part(box(3.3, 0.2, 3.3), '#d84315', 0, 2.3, 0));
  g.add(part(box(0.8, 1.4, 0.1), accent, 0, 0.7, 1.51));
  for (const x of [-0.95, 0.95]) g.add(part(box(0.5, 0.5, 0.1), '#263238', x, 1.4, 1.51));
  g.add(part(box(3.3, 0.15, 0.3), accent, 0, 2.05, 1.6));
  return g;
}

function tower(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(cyl(2.1, 2.6, 7, 8), C.stone, 0, 3.5, 0));
  g.add(part(geo('balcony', () => new THREE.TorusGeometry(2.3, 0.18, 6, 16)), '#1a237e', 0, 7, 0).rotateX(Math.PI / 2));
  g.add(part(cyl(1.7, 2.0, 2, 8), C.stone, 0, 8, 0));
  g.add(part(cone(2.3, 2.6, 8), '#2340ff', 0, 10.3, 0));
  g.add(part(sphere(0.45, 10, 8), glow('#ffd84d'), 0, 8.3, 1.75));
  g.add(part(box(1.2, 2, 0.2), '#1a237e', 0, 1, 2.55));
  g.add(part(cyl(0.04, 0.04, 1.6, 4), C.dark, 0, 12.3, 0));
  g.add(part(box(0.9, 0.5, 0.04), '#ffc21a', 0.45, 12.8, 0));
  return g;
}

function stall(color = '#ff4f2e'): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1, 1]) for (const z of [-0.6, 0.6]) g.add(part(cyl(0.05, 0.05, 2, 4), C.wood, x, 1, z));
  const awning = part(box(2.4, 0.1, 1.6), color, 0, 2.05, 0.1);
  awning.rotation.x = 0.15;
  g.add(awning);
  g.add(part(box(2, 0.8, 1), C.wood, 0, 0.4, 0));
  const fruit = ['#ff9800', '#e53935', '#7cb342', '#ffd23f'];
  for (let i = 0; i < 6; i++) g.add(part(sphere(0.12, 6, 5), fruit[i % 4], -0.75 + i * 0.3, 0.9, 0.1));
  return g;
}

function ark(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(box(3.6, 2, 9), C.wood, 0, 1.6, 0));
  g.add(part(box(2.6, 0.8, 8.2), C.woodDark, 0, 0.4, 0));
  g.add(part(box(2.6, 1.6, 6), '#a65f2a', 0, 3.4, 0));
  const roof = part(geo('arkRoof', () => new THREE.CylinderGeometry(1.7, 1.7, 6.4, 3)), '#6b3412', 0, 4.6, 0);
  roof.rotation.x = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  g.add(roof);
  g.add(part(box(0.1, 1.4, 1.4), '#3e1f0a', 1.81, 1.6, 0));
  const ramp = part(box(3.8, 0.14, 1.5), '#a1662f', 3.4, 1.05, 0);
  ramp.rotation.z = -0.58;
  g.add(ramp);
  for (let i = -3; i <= 3; i++) g.add(part(box(3.65, 0.08, 0.08), C.woodDark, 0, 2.2, i * 1.2));
  return g;
}

function pen(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const r = 3 * scale;
  const gap = 0.9; // ouverture (radians) côté +z
  const arc = Math.PI * 2 - gap;
  const start = Math.PI / 2 + gap / 2;
  const posts = 14;
  for (let i = 0; i <= posts; i++) {
    const a = start + (arc * i) / posts;
    g.add(part(cyl(0.07, 0.07, 1.1, 5), C.wood, Math.cos(a) * r, 0.55, Math.sin(a) * r));
  }
  for (const y of [0.5, 0.95]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 4, 32, arc), mat('#a1662f'));
    // Le tore est créé « debout » : on le couche, puis on aligne son ouverture sur celle des poteaux.
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = start;
    rail.position.y = y;
    g.add(rail);
  }
  return g;
}

function well(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(cyl(0.8, 0.85, 0.8, 10), C.stone, 0, 0.4, 0));
  g.add(part(cyl(0.65, 0.65, 0.05, 10), '#1565c0', 0, 0.78, 0));
  for (const x of [-0.7, 0.7]) g.add(part(cyl(0.06, 0.06, 1.6, 4), C.wood, x, 1.2, 0));
  const roof = part(cone(1.1, 0.6, 4), '#d84315', 0, 2.2, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  return g;
}

function fountain(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(cyl(1.5, 1.6, 0.6, 12), '#90a4ae', 0, 0.3, 0));
  g.add(part(cyl(1.3, 1.3, 0.05, 12), '#29b6f6', 0, 0.58, 0));
  g.add(part(cyl(0.2, 0.3, 1.4, 8), '#b0bec5', 0, 1.0, 0));
  g.add(part(cyl(0.6, 0.3, 0.25, 10), '#90a4ae', 0, 1.7, 0));
  g.add(part(sphere(0.2, 8, 6), '#29b6f6', 0, 1.95, 0));
  return g;
}

function tent(color = '#c2410c'): THREE.Group {
  const g = new THREE.Group();
  const t = part(cone(1.6, 2.2, 6), color, 0, 1.1, 0);
  g.add(t);
  g.add(part(box(0.6, 1, 0.1), C.dark, 0, 0.5, 1.25));
  return g;
}

function harp(): THREE.Group {
  const g = new THREE.Group();
  g.add(rock().translateY(-0.1));
  const frame = new THREE.Group();
  frame.position.set(0, 0.55, 0);
  const arc = new THREE.Mesh(geo('harpArc', () => new THREE.TorusGeometry(0.35, 0.04, 5, 12, Math.PI)), mat('#d4a017'));
  arc.position.y = 0.35;
  frame.add(arc);
  frame.add(part(cyl(0.04, 0.04, 0.7, 5), '#d4a017', -0.35, 0.35, 0));
  for (let i = 0; i < 5; i++) frame.add(part(cyl(0.008, 0.008, 0.55, 3), '#fff8e1', -0.22 + i * 0.11, 0.35, 0));
  g.add(frame);
  return g;
}

function stage(color = '#7c4dff'): THREE.Group {
  const g = new THREE.Group();
  g.add(part(box(5, 0.5, 3), '#a0522d', 0, 0.25, -0.3));
  g.add(part(box(5, 2.6, 0.15), color, 0, 1.8, -1.75));
  for (const x of [-2.4, 2.4]) g.add(part(cyl(0.08, 0.08, 3.4, 5), C.wood, x, 1.7, -1.7));
  const lights = ['#ffd23f', '#ff4f7b', '#00c2a8', '#ffd23f', '#ff4f7b'];
  lights.forEach((c, i) => g.add(part(sphere(0.12, 6, 4), glow(c), -2 + i, 3.25, -1.65)));
  return g;
}

function ramp(): THREE.Group {
  const g = new THREE.Group();
  const r = part(box(1.2, 0.1, 2), '#00a86b', 0, 0.25, 0);
  r.rotation.x = 0.25;
  g.add(r);
  return g;
}

function lamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(part(cyl(0.06, 0.08, 2.4, 5), C.dark, 0, 1.2, 0));
  g.add(part(sphere(0.2, 8, 6), glow('#ffd84d'), 0, 2.5, 0));
  return g;
}

/* ------------------------------------------------------------------ */

export interface BuildOptions {
  look?: PersonLook;
  color?: string;
  size?: [number, number];
  scale?: number;
}

/** Point d'entrée unique : construit n'importe quel modèle par son nom. */
export function buildProcedural(kind: ModelKind, o: BuildOptions = {}): THREE.Group {
  switch (kind) {
    case 'person': return person(o.look ?? { tunic: '#2a5bd7' });
    case 'sheep': return sheep();
    case 'goat': return goat();
    case 'elephant': return elephant();
    case 'giraffe': return giraffe();
    case 'rabbit': return rabbit(o.color);
    case 'donkey': return donkey();
    case 'dove': return dove();
    case 'tree': return tree();
    case 'palm': return palm();
    case 'olive': return olive();
    case 'rock': return rock();
    case 'bush': return bush();
    case 'flowers': return flowers();
    case 'water': return water(o.size ?? [3, 3]);
    case 'road': return road(o.size ?? [3, 10], o.color);
    case 'house': return house(o.color);
    case 'tower': return tower();
    case 'stall': return stall(o.color);
    case 'ark': return ark();
    case 'pen': return pen(o.scale ?? 1);
    case 'well': return well();
    case 'fountain': return fountain();
    case 'tent': return tent(o.color);
    case 'harp': return harp();
    case 'stage': return stage(o.color);
    case 'ramp': return ramp();
    case 'lamp': return lamp();
    default: return bush();
  }
}
