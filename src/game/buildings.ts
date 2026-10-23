import * as THREE from 'three';
import { instance } from './assets';
import { glow } from './procedural';
import { cloth, dirt, paving, plaster, stone, texturedMaterial, wood } from './textures';

/**
 * Constructions texturées, dans le style des villes anciennes du Proche-Orient :
 * maisons à toit plat enduites à la chaux, tour de guet et remparts en pierre,
 * fontaine, scène de fête, arche de Noé.
 *
 * Chaque bâtiment renvoie un THREE.Group et, dans userData.solids, la liste des
 * cercles d'obstacles [x, z, rayon] en coordonnées locales (pour les collisions).
 */

type Solids = [number, number, number][];

/** Boîte englobante fiable (matrices à jour avant la mesure). */
function measure(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

/** Générateur pseudo-aléatoire : la même graine donne toujours la même maison. */
export function seeded(seed: number) {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280 || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function boxMesh(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const lambert = (color: string) => new THREE.MeshLambertMaterial({ color });

/** Cercles couvrant un rectangle w × d centré (pour les collisions). */
function rectSolids(w: number, d: number, cx = 0, cz = 0): Solids {
  const out: Solids = [];
  const long = Math.max(w, d);
  const short = Math.min(w, d);
  const r = short / 2 + 0.05;
  const n = Math.max(1, Math.ceil(long / short));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -long / 2 + r + ((long - 2 * r) * i) / (n - 1);
    out.push(w >= d ? [cx + t, cz, r] : [cx, cz + t, r]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Maison                                                               */
/* ------------------------------------------------------------------ */

export interface HouseOptions {
  w?: number;
  d?: number;
  /** Couleur de la porte et des volets. */
  accent?: string;
  seed?: number;
}

export function house(o: HouseOptions = {}): THREE.Group {
  const rand = seeded(o.seed ?? 1);
  const w = o.w ?? 3.4 + rand() * 1.2;
  const d = o.d ?? 3.2 + rand() * 0.8;
  const h = 2.9 + rand() * 0.8;
  const accent = o.accent ?? '#1f6fd1';
  const wallColor = ['#f6f4ef', '#f1ece2', '#f7f3ea', '#efe9e1'][Math.floor(rand() * 4)];
  const g = new THREE.Group();
  const solids: Solids = rectSolids(w, d);

  // Murs enduits + socle en pierre
  const walls = texturedMaterial(plaster(wallColor), w / 2.2, h / 2.2);
  g.add(boxMesh(w, h, d, walls, 0, h / 2, 0));
  g.add(boxMesh(w + 0.08, 0.5, d + 0.08, texturedMaterial(stone('#c9bba5'), w / 1.5, 0.35), 0, 0.25, 0));

  // Toit plat et parapet
  const roofMat = texturedMaterial(plaster(wallColor), 1, 0.2);
  g.add(boxMesh(w + 0.1, 0.14, d + 0.1, roofMat, 0, h + 0.07, 0));
  const para = 0.38;
  g.add(boxMesh(w + 0.1, para, 0.14, roofMat, 0, h + para / 2 + 0.1, d / 2));
  g.add(boxMesh(w + 0.1, para, 0.14, roofMat, 0, h + para / 2 + 0.1, -d / 2));
  g.add(boxMesh(0.14, para, d + 0.1, roofMat, w / 2, h + para / 2 + 0.1, 0));
  g.add(boxMesh(0.14, para, d + 0.1, roofMat, -w / 2, h + para / 2 + 0.1, 0));

  // Poutres de bois qui dépassent sous le toit (typique des maisons anciennes)
  const beam = lambert('#6b4426');
  const beams = Math.floor(w / 0.7);
  for (let i = 0; i < beams; i++) {
    const x = -w / 2 + 0.35 + (i * (w - 0.7)) / Math.max(1, beams - 1);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 6), beam);
    b.rotation.x = Math.PI / 2;
    b.position.set(x, h - 0.15, d / 2 + 0.15);
    b.castShadow = true;
    g.add(b);
  }

  // Porte en arc (modèle CC0) ou porte simple en secours
  const doorX = (rand() - 0.5) * (w - 1.6);
  const doorModel = instance('archdoor');
  if (doorModel) {
    const door = doorModel.obj;
    const box = measure(door);
    const size = box.getSize(new THREE.Vector3());
    door.scale.setScalar(1.9 / size.y);
    door.position.set(doorX, 0.02, d / 2 + 0.02);
    door.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
        const mm = mesh.material as THREE.MeshStandardMaterial;
        if (mm.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.15) mm.color.set(accent);
      }
    });
    g.add(door);
  } else {
    g.add(boxMesh(0.9, 1.8, 0.08, lambert(accent), doorX, 0.9, d / 2 + 0.04));
  }
  // Encadrement de pierre au-dessus de la porte
  g.add(boxMesh(1.25, 0.16, 0.18, texturedMaterial(stone('#c9bba5'), 0.6, 0.1), doorX, 2.02, d / 2 + 0.06));

  // Fenêtres à volets
  const shutter = lambert(accent);
  const dark = lambert('#2b211b');
  const windowAt = (x: number, y: number, z: number, rotY: number) => {
    const win = new THREE.Group();
    win.add(boxMesh(0.55, 0.6, 0.06, dark, 0, 0, 0));
    win.add(boxMesh(0.24, 0.62, 0.05, shutter, -0.42, 0, 0.03));
    win.add(boxMesh(0.24, 0.62, 0.05, shutter, 0.42, 0, 0.03));
    win.add(boxMesh(0.75, 0.08, 0.14, beam, 0, 0.36, 0.04));
    win.position.set(x, y, z);
    win.rotation.y = rotY;
    g.add(win);
  };
  const otherX = doorX > 0 ? doorX - 1.4 : doorX + 1.4;
  if (Math.abs(otherX) < w / 2 - 0.4) windowAt(otherX, 1.75, d / 2 + 0.03, 0);
  windowAt(0, 1.8, -d / 2 - 0.03, Math.PI);
  windowAt(w / 2 + 0.03, 1.8, 0, Math.PI / 2);

  // Auvent rayé au-dessus de la porte (une maison sur deux)
  if (rand() > 0.5) {
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), texturedMaterial(cloth(accent, '#ffffff'), 1, 1, { side: THREE.DoubleSide }));
    awning.position.set(doorX, 2.3, d / 2 + 0.42);
    awning.rotation.x = -Math.PI / 2 + 0.35;
    awning.castShadow = true;
    g.add(awning);
  }

  // Escalier extérieur jusqu'au toit (une maison sur deux)
  if (rand() > 0.45) {
    const steps = 9;
    const stair = texturedMaterial(stone('#d6cab6'), 0.4, 0.2);
    const side = rand() > 0.5 ? 1 : -1;
    for (let i = 0; i < steps; i++) {
      const sh = ((i + 1) * h) / steps;
      g.add(boxMesh(0.75, sh, 0.32, stair, side * (w / 2 + 0.4), sh / 2, d / 2 - 0.3 - i * 0.32));
    }
    solids.push([side * (w / 2 + 0.4), d / 2 - 1.5, 0.75]);
  }

  // Sur le toit : jarres ou toile tendue
  if (rand() > 0.5) {
    const jar = instance('barrel');
    if (jar) {
      jar.obj.scale.setScalar(0.6);
      jar.obj.position.set(w / 2 - 0.6, h + 0.14, -d / 2 + 0.6);
      g.add(jar.obj);
    }
  } else {
    const canopy = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), texturedMaterial(cloth('#ffffff', accent), 1, 1, { side: THREE.DoubleSide }));
    canopy.rotation.x = -Math.PI / 2;
    canopy.position.set(-w / 4, h + 1.4, -d / 4);
    canopy.castShadow = true;
    g.add(canopy);
    for (const [px, pz] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 4), beam);
      pole.position.set(-w / 4 + px, h + 0.75, -d / 4 + pz);
      g.add(pole);
    }
  }

  g.userData.solids = solids;
  return g;
}

/* ------------------------------------------------------------------ */
/* Tour des veilleurs                                                   */
/* ------------------------------------------------------------------ */

export function tower(): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = texturedMaterial(stone('#d3c6b0'), 4, 3);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 8.5, 20), stoneMat);
  body.position.y = 4.25;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // Corniche et créneaux
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.3, 0.5, 20), texturedMaterial(stone('#c4b59c'), 4, 0.3));
  top.position.y = 8.6;
  top.castShadow = true;
  g.add(top);
  const merlonMat = texturedMaterial(stone('#d3c6b0'), 0.3, 0.3);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = boxMesh(0.6, 0.7, 0.4, merlonMat, Math.sin(a) * 2.35, 9.2, Math.cos(a) * 2.35);
    m.rotation.y = a;
    g.add(m);
  }
  // Grand brasero : la lumière du Gardien qui ne s'éteint jamais
  const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.35, 0.6, 10), lambert('#5b3a22'));
  brazier.position.y = 9.2;
  g.add(brazier);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 8), glow('#ffb300'));
  flame.position.y = 9.95;
  flame.name = 'flame';
  g.add(flame);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 8), glow('#fff3b0'));
  inner.position.y = 9.8;
  g.add(inner);
  // Fenêtres étroites
  const dark = lambert('#2b211b');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const win = boxMesh(0.35, 0.9, 0.2, dark, Math.sin(a) * 2.3, 5.5 + (i % 2) * 1.2, Math.cos(a) * 2.3);
    win.rotation.y = a;
    g.add(win);
  }
  // Porte
  const doorModel = instance('archdoor');
  if (doorModel) {
    const size = measure(doorModel.obj).getSize(new THREE.Vector3());
    doorModel.obj.scale.setScalar(2.2 / size.y);
    doorModel.obj.position.set(0, 0, 2.55);
    g.add(doorModel.obj);
  } else {
    g.add(boxMesh(1.2, 2.1, 0.1, lambert('#5b3a22'), 0, 1.05, 2.58));
  }
  // Bannière bleue
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), texturedMaterial(cloth('#2340ff', '#1a2fd0'), 1, 1, { side: THREE.DoubleSide }));
  banner.position.set(1.4, 6.2, 2.15);
  banner.rotation.y = 0.55;
  g.add(banner);
  g.userData.solids = [[0, 0, 2.7]] as Solids;
  return g;
}

/* ------------------------------------------------------------------ */
/* Remparts                                                             */
/* ------------------------------------------------------------------ */

export function ramparts(radius: number, gateDeg: number): THREE.Group {
  const g = new THREE.Group();
  const segments = 32;
  const gate = (gateDeg * Math.PI) / 180;
  const len = ((Math.PI * 2 * radius) / segments) * 1.03;
  const wallMat = texturedMaterial(stone('#cdbfa8'), len / 2, 1.6);
  const merlonMat = texturedMaterial(stone('#c2b39b'), 0.3, 0.3);
  const towerMat = texturedMaterial(stone('#c8b9a1'), 3, 2);
  const wallGeo = new THREE.BoxGeometry(len, 3.4, 1.4);
  const merlonGeo = new THREE.BoxGeometry(0.55, 0.6, 1.45);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const diff = Math.atan2(Math.sin(a - gate), Math.cos(a - gate));
    if (Math.abs(diff) < 0.1) continue; // la porte
    const seg = new THREE.Group();
    seg.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    seg.rotation.y = a;
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 1.7;
    wall.castShadow = wall.receiveShadow = true;
    seg.add(wall);
    for (const x of [-len / 3, 0, len / 3]) {
      const m = new THREE.Mesh(merlonGeo, merlonMat);
      m.position.set(x, 3.7, 0);
      seg.add(m);
    }
    g.add(seg);
    // Une tour toutes les 4 sections
    if (i % 4 === 2) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 5, 12), towerMat);
      t.position.set(Math.sin(a) * radius, 2.5, Math.cos(a) * radius);
      t.castShadow = true;
      g.add(t);
    }
  }
  // Porte de la ville : deux tours et une arche
  for (const side of [-0.13, 0.13]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 5.6, 12), towerMat);
    t.position.set(Math.sin(gate + side) * radius, 2.8, Math.cos(gate + side) * radius);
    t.castShadow = true;
    g.add(t);
    const torch = instance('torch');
    if (torch) {
      const size = measure(torch.obj).getSize(new THREE.Vector3());
      torch.obj.scale.setScalar(1.6 / size.y);
      torch.obj.position.set(Math.sin(gate + side * 0.6) * (radius - 1.3), 0, Math.cos(gate + side * 0.6) * (radius - 1.3));
      g.add(torch.obj);
    }
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.45, 8, 16, Math.PI), merlonMat);
  arch.position.set(Math.sin(gate) * radius, 3.6, Math.cos(gate) * radius);
  arch.rotation.y = gate;
  g.add(arch);
  return g;
}

/* ------------------------------------------------------------------ */
/* Autres constructions                                                 */
/* ------------------------------------------------------------------ */

export function fountain(): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = texturedMaterial(stone('#d9ccb6'), 3, 0.4);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.8, 0.7, 8), stoneMat);
  basin.position.y = 0.35;
  basin.castShadow = basin.receiveShadow = true;
  g.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 8), new THREE.MeshLambertMaterial({ color: '#3fa7e0' }));
  water.position.y = 0.62;
  water.name = 'water';
  g.add(water);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.5, 8), stoneMat);
  column.position.y = 1.2;
  column.castShadow = true;
  g.add(column);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.3, 0.3, 10), stoneMat);
  bowl.position.y = 1.95;
  bowl.castShadow = true;
  g.add(bowl);
  const spout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshLambertMaterial({ color: '#8fd3ff', transparent: true, opacity: 0.85 }));
  spout.position.y = 2.2;
  g.add(spout);
  g.userData.solids = [[0, 0, 1.85]] as Solids;
  return g;
}

export function stage(color = '#7c4dff'): THREE.Group {
  const g = new THREE.Group();
  const planks = texturedMaterial(wood('#9a6233'), 2, 1.5);
  g.add(boxMesh(5.4, 0.55, 3.2, planks, 0, 0.275, -0.4));
  // Marches à l'avant (la rampe pour Élie est ajoutée par la quête)
  for (let i = 0; i < 2; i++) g.add(boxMesh(1.4, 0.18 * (i + 1), 0.35, planks, -1.4, 0.09 * (i + 1), 1.4 - i * 0.35));
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3), texturedMaterial(cloth(color, '#ffc21a'), 2, 1, { side: THREE.DoubleSide }));
  curtain.position.set(0, 2, -1.95);
  g.add(curtain);
  const postMat = lambert('#5b3a22');
  for (const x of [-2.7, 2.7]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.8, 6), postMat);
    post.position.set(x, 1.9, -1.9);
    post.castShadow = true;
    g.add(post);
  }
  // Guirlande de lumières
  const lights = ['#ffd23f', '#ff4f7b', '#00c2a8', '#ffffff'];
  for (let i = 0; i < 11; i++) {
    const x = -2.6 + i * 0.52;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glow(lights[i % 4]));
    bulb.position.set(x, 3.55 - Math.sin((i / 10) * Math.PI) * 0.35, -1.85);
    g.add(bulb);
  }
  g.userData.solids = [[-1.6, -0.6, 1.3], [0, -0.6, 1.3], [1.6, -0.6, 1.3]] as Solids;
  return g;
}

export function ark(): THREE.Group {
  const g = new THREE.Group();
  const hull = texturedMaterial(wood('#7a4a22'), 4, 1);
  const dark = texturedMaterial(wood('#5a3416'), 3, 1);
  g.add(boxMesh(3.6, 2, 9, hull, 0, 1.6, 0));
  g.add(boxMesh(2.6, 0.8, 8.2, dark, 0, 0.4, 0));
  g.add(boxMesh(2.6, 1.6, 6, texturedMaterial(wood('#8c5a2c'), 3, 1), 0, 3.4, 0));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 6.4, 3), dark);
  roof.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  roof.position.y = 4.6;
  roof.castShadow = true;
  g.add(roof);
  g.add(boxMesh(0.1, 1.4, 1.4, lambert('#2b1a0e'), 1.81, 1.6, 0));
  const ramp = boxMesh(3.8, 0.14, 1.5, texturedMaterial(wood('#a1662f'), 1, 2), 3.4, 1.05, 0);
  ramp.rotation.z = -0.58;
  g.add(ramp);
  g.userData.solids = [[0, -3, 2.2], [0, 0, 2.2], [0, 3, 2.2]] as Solids;
  return g;
}

/** Tente en toile (campement de Noé). */
export function tent(color = '#c2410c'): THREE.Group {
  const g = new THREE.Group();
  const canvas = texturedMaterial(cloth(color, '#f2efe6'), 3, 1);
  const t = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.3, 6, 1, true), canvas);
  t.position.y = 1.15;
  t.castShadow = true;
  (t.material as THREE.Material).side = THREE.DoubleSide;
  g.add(t);
  g.add(boxMesh(0.6, 1, 0.06, lambert('#2b211b'), 0, 0.5, 1.3));
  g.userData.solids = [[0, 0, 1.5]] as Solids;
  return g;
}

/** Enclos : un cercle de barrières en bois (modèle CC0), ouvert côté +z. */
export function pen(radius = 3): THREE.Group {
  const g = new THREE.Group();
  const gap = 0.9;
  const segments = 12;
  const arc = Math.PI * 2 - gap;
  const start = Math.PI / 2 + gap / 2;
  const chord = 2 * radius * Math.sin(arc / segments / 2);
  for (let i = 0; i < segments; i++) {
    const a0 = start + (arc * i) / segments;
    const a1 = start + (arc * (i + 1)) / segments;
    const mid = (a0 + a1) / 2;
    const f = instance('fence');
    let seg: THREE.Object3D;
    if (f) {
      const size = measure(f.obj).getSize(new THREE.Vector3());
      f.obj.scale.set(chord / size.x, 1 / size.y, 1);
      seg = f.obj;
    } else {
      seg = boxMesh(chord, 0.9, 0.08, lambert('#8b5a2b'), 0, 0.45, 0);
    }
    const holder = new THREE.Group();
    holder.add(seg);
    holder.position.set(Math.cos(mid) * radius, 0, Math.sin(mid) * radius);
    holder.rotation.y = -mid + Math.PI / 2;
    g.add(holder);
  }
  return g;
}

/** Rampe pour fauteuil roulant. */
export function ramp(): THREE.Group {
  const g = new THREE.Group();
  const r = boxMesh(1.3, 0.1, 2.2, texturedMaterial(wood('#c0874f'), 1, 2), 0, 0.28, 0);
  r.rotation.x = 0.25;
  g.add(r);
  return g;
}

/** Sol décoratif plat : pavés, terre ou eau. */
export function groundPatch(kind: 'plaza' | 'road' | 'water', size: [number, number], color?: string): THREE.Group {
  const g = new THREE.Group();
  let material: THREE.Material;
  if (kind === 'water') material = new THREE.MeshLambertMaterial({ color: color ?? '#2b8fd6' });
  else if (kind === 'plaza') material = texturedMaterial(paving(color ?? '#dccaa6'), size[0] / 2.5, size[1] / 2.5);
  else material = texturedMaterial(dirt(color ?? '#d9b07a'), size[0] / 3, size[1] / 3);
  const geo = kind === 'water' ? new THREE.CircleGeometry(1, 28) : new THREE.PlaneGeometry(1, 1);
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(size[0], size[1], 1);
  m.position.y = kind === 'plaza' ? 0.025 : 0.02;
  m.receiveShadow = true;
  g.add(m);
  if (kind === 'water') g.userData.solids = [[0, 0, Math.min(size[0], size[1])]] as Solids;
  return g;
}

/* ------------------------------------------------------------------ */
/* Signes du Royaume                                                    */
/* ------------------------------------------------------------------ */

/**
 * L'arbre du grain de sénevé (Matthieu 13.31-32). `growth` va de 0 (une pousse)
 * à 4 (un grand arbre fleuri avec des nids) : il grandit avec les missions vécues.
 */
export function mustardTree(growth: number): THREE.Group {
  const g = new THREE.Group();
  const k = Math.min(4, Math.max(0, growth));
  const scale = 0.35 + k * 0.28;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.4, 8), lambert('#7b5233'));
  trunk.position.y = 0.7;
  trunk.castShadow = true;
  const tree = new THREE.Group();
  tree.add(trunk);
  const leaf = new THREE.MeshLambertMaterial({ color: '#5aa64a' });
  const blossom = new THREE.MeshBasicMaterial({ color: '#ffe066' });
  const crowns: [number, number, number, number][] = [[0, 1.75, 0, 0.75], [0.45, 1.5, 0.2, 0.5], [-0.45, 1.55, -0.1, 0.55], [0.1, 2.2, -0.2, 0.5]];
  crowns.forEach(([x, y, z, r], i) => {
    if (k === 0 && i > 0) return;
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf);
    c.position.set(x, y, z);
    c.castShadow = true;
    tree.add(c);
  });
  // Fleurs jaunes : de plus en plus nombreuses à mesure que l'arbre grandit.
  const rand = seeded(7);
  for (let i = 0; i < k * 10; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.5 + rand() * 0.35;
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), blossom);
    f.position.set(Math.cos(a) * r, 1.4 + rand() * 1, Math.sin(a) * r);
    tree.add(f);
  }
  // À partir de 3 missions : des nids où les oiseaux viennent se poser.
  if (k >= 3) {
    const nest = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 6, 12), lambert('#8b5a2b'));
    nest.rotation.x = Math.PI / 2;
    nest.position.set(0.35, 1.95, 0.45);
    tree.add(nest);
  }
  tree.scale.setScalar(scale);
  g.add(tree);
  // Bordure de pierre autour de l'arbre
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 6, 20), texturedMaterial(stone('#d3c6b0'), 2, 0.3));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  g.add(ring);
  g.userData.solids = [[0, 0, 0.8]] as Solids;
  return g;
}

/** Treille de vigne avec des grappes (Jean 15 : « Je suis le cep »). */
export function vineArbor(): THREE.Group {
  const g = new THREE.Group();
  const woodMat = texturedMaterial(wood('#7a4a22'), 0.3, 1);
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.4, 6), woodMat);
    post.position.set(x, 1.2, z);
    post.castShadow = true;
    g.add(post);
  }
  for (const z of [-0.9, 0, 0.9]) g.add(boxMesh(2.9, 0.08, 0.08, woodMat, 0, 2.4, z));
  const leaf = new THREE.MeshLambertMaterial({ color: '#4c9a3f', side: THREE.DoubleSide });
  const rand = seeded(11);
  for (let i = 0; i < 26; i++) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), leaf);
    l.position.set(-1.3 + rand() * 2.6, 2.45 + rand() * 0.15, -0.95 + rand() * 1.9);
    l.scale.y = 0.45;
    l.castShadow = true;
    g.add(l);
  }
  const grape = new THREE.MeshLambertMaterial({ color: '#5b2a86' });
  for (let i = 0; i < 6; i++) {
    const cluster = new THREE.Group();
    for (let j = 0; j < 9; j++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), grape);
      b.position.set((rand() - 0.5) * 0.14, -j * 0.035, (rand() - 0.5) * 0.14);
      b.scale.setScalar(1 - j * 0.06);
      cluster.add(b);
    }
    cluster.position.set(-1.1 + rand() * 2.2, 2.3, -0.8 + rand() * 1.6);
    g.add(cluster);
  }
  // Le cep : un tronc tordu qui monte le long d'un poteau
  const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 2.4, 6), lambert('#5d3a1a'));
  vine.position.set(-1.15, 1.2, 0.9);
  vine.rotation.z = 0.1;
  g.add(vine);
  g.userData.solids = [[-1.3, -0.9, 0.2], [1.3, -0.9, 0.2], [-1.3, 0.9, 0.2], [1.3, 0.9, 0.2]] as Solids;
  return g;
}

/** Petit champ de blé doré, qui ondule au vent (Jean 12.24). */
export function wheatField(size: [number, number]): THREE.Group {
  const g = new THREE.Group();
  g.add(groundPatch('road', size, '#b98a4e'));
  const stalk = new THREE.CylinderGeometry(0.012, 0.015, 0.9, 3);
  stalk.translate(0, 0.45, 0);
  const ear = new THREE.CapsuleGeometry(0.035, 0.12, 2, 4);
  ear.translate(0, 0.95, 0);
  const stalkMat = new THREE.MeshLambertMaterial({ color: '#d9a93a' });
  const earMat = new THREE.MeshLambertMaterial({ color: '#f0c04a' });
  const count = Math.floor(size[0] * size[1] * 22);
  const stalks = new THREE.InstancedMesh(stalk, stalkMat, count);
  const ears = new THREE.InstancedMesh(ear, earMat, count);
  const rand = seeded(size[0] * 13);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.25, rand() * 6, (rand() - 0.5) * 0.25));
    m.compose(new THREE.Vector3((rand() - 0.5) * size[0], 0, (rand() - 0.5) * size[1]), q, new THREE.Vector3(1, 0.8 + rand() * 0.4, 1));
    stalks.setMatrixAt(i, m);
    ears.setMatrixAt(i, m);
  }
  stalks.castShadow = ears.castShadow = true;
  g.add(stalks, ears);
  g.name = 'wheat';
  return g;
}

/** Symbole doré gravé sur une pierre, dessiné sur un canvas. */
function steleTexture(symbol: string, label: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d8ccb8';
  ctx.fillRect(0, 0, 256, 320);
  ctx.strokeStyle = '#b8860b';
  ctx.fillStyle = '#c9971c';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.translate(128, 130);
  switch (symbol) {
    case 'light': // lampe à huile et sa flamme
      ctx.beginPath(); ctx.ellipse(0, 30, 62, 24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(55, 22); ctx.lineTo(90, 10); ctx.stroke();
      ctx.fillStyle = '#e8a300';
      ctx.beginPath(); ctx.moveTo(92, -50); ctx.quadraticCurveTo(112, -10, 92, 4); ctx.quadraticCurveTo(72, -10, 92, -50); ctx.fill();
      break;
    case 'water': // goutte d'eau vive et vaguelettes
      ctx.beginPath(); ctx.moveTo(0, -80); ctx.quadraticCurveTo(55, 0, 0, 40); ctx.quadraticCurveTo(-55, 0, 0, -80); ctx.fill();
      for (const y of [65, 88]) { ctx.beginPath(); ctx.moveTo(-70, y); ctx.quadraticCurveTo(-35, y - 14, 0, y); ctx.quadraticCurveTo(35, y + 14, 70, y); ctx.stroke(); }
      break;
    case 'shepherd': // bâton de berger
      ctx.beginPath(); ctx.moveTo(10, 95); ctx.lineTo(10, -40); ctx.arc(-25, -40, 35, 0, Math.PI, true); ctx.lineTo(-60, -20); ctx.stroke();
      break;
    case 'vine': // grappe de raisin et feuille
      for (const [x, y] of [[-20, -20], [20, -20], [-30, 15], [0, 15], [30, 15], [-15, 48], [15, 48], [0, 78]]) { ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, -80); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(40, -70, 34, 18, -0.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'seed': // pousse qui sort de la terre
      ctx.beginPath(); ctx.moveTo(0, 90); ctx.lineTo(0, -40); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-35, -20, 38, 16, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(35, -55, 38, 16, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-80, 90); ctx.lineTo(80, 90); ctx.stroke();
      break;
  }
  ctx.restore();
  ctx.fillStyle = '#7a5a10';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 128, 290);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Pierre gravée d'une parole de Jésus : on s'en approche pour la lire et l'écouter. */
export function stele(symbol: string, label: string): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = texturedMaterial(stone('#cfc3ae'), 0.6, 0.8);
  const body = boxMesh(0.9, 1.1, 0.25, stoneMat, 0, 0.55, 0);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 16, 1, false, 0, Math.PI), stoneMat);
  top.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  top.position.y = 1.1;
  top.castShadow = true;
  g.add(body, top);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.9), new THREE.MeshLambertMaterial({ map: steleTexture(symbol, label) }));
  face.position.set(0, 0.68, 0.13);
  g.add(face);
  g.add(boxMesh(1.1, 0.16, 0.45, texturedMaterial(stone('#bfb299'), 0.6, 0.2), 0, 0.08, 0));
  g.userData.solids = [[0, 0, 0.5]] as Solids;
  return g;
}

/* ------------------------------------------------------------------ */
/* Le conte d'Amani : la ville d'ERO et le rêve                         */
/* ------------------------------------------------------------------ */

/** Texture de chaume : brins dorés serrés. */
function thatch(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c99a4a';
  ctx.fillRect(0, 0, 128, 128);
  const rand = seeded(5);
  for (let i = 0; i < 500; i++) {
    const x = rand() * 128;
    const y = rand() * 128;
    ctx.strokeStyle = ['#a8792f', '#e0b866', '#b98a3a', '#d6a955'][i % 4];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y + 10 + rand() * 8);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Case ronde aux murs de terre et au toit de chaume (la ville d'ERO). */
export function hut(seed = 1, door = '#6b3c1c'): THREE.Group {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const r = 1.7 + rand() * 0.5;
  const wallH = 1.9 + rand() * 0.3;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, wallH, 20), texturedMaterial(stone('#c98c5a'), 3, 1));
  wall.position.y = wallH / 2;
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);
  const roofTex = thatch();
  roofTex.repeat.set(4, 1.5);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.45, 2.2 + rand() * 0.4, 20, 1, true), new THREE.MeshLambertMaterial({ map: roofTex, side: THREE.DoubleSide }));
  roof.position.y = wallH + 1;
  roof.castShadow = true;
  g.add(roof);
  // Porte arrondie et fenêtre
  const doorMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12, 1, false, 0, Math.PI), lambert(door));
  doorMesh.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  doorMesh.position.set(0, 1.25, r * 1.02);
  g.add(doorMesh);
  g.add(boxMesh(0.84, 1.25, 0.1, lambert(door), 0, 0.62, r * 1.02));
  const win = boxMesh(0.4, 0.4, 0.1, lambert('#2b211b'), r * 0.72, 1.25, r * 0.72);
  win.rotation.y = Math.PI / 4;
  g.add(win);
  // Une jarre et un tonneau près de la porte
  const jar = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lambert('#b5562a'));
  jar.scale.y = 1.2;
  jar.position.set(0.9, 0.3, r + 0.3);
  jar.castShadow = true;
  g.add(jar);
  g.userData.solids = [[0, 0, r + 0.15]] as Solids;
  return g;
}

/** Nuage du monde du rêve : des boules douces et lumineuses. */
export function cloudPuff(seed = 1): THREE.Group {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: '#fff4fb', emissive: '#3a2a55', emissiveIntensity: 0.25 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.8 + rand() * 0.9, 14, 10), mat);
    s.position.set((rand() - 0.5) * 3.4, 0.4 + rand() * 0.6, (rand() - 0.5) * 2);
    g.add(s);
  }
  g.userData.solids = [[0, 0, 1.4]] as Solids;
  return g;
}
