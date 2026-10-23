import * as THREE from 'three';
import type { ChapterDef, EntityDef, MoveDef, StepDef, Vec2, WorldDef, ZoneDef } from '../types';
import { meshesOf } from './assets';
import { ramparts, seeded } from './buildings';
import { poseSeated } from './characters';
import { assetsFor, buildModel, defaultReach, followGap, glow, type Animated, type Solids } from './models';
import { grass, texturedMaterial } from './textures';
import { Atmosphere } from './atmosphere';

/**
 * Le monde 3D d'un chapitre : sol, ciel, lumière, décor, entités et zones.
 *
 * Il est construit à partir d'un WorldDef (le lieu) auquel on ajoute les
 * entités et zones propres au chapitre de la quête. Quand on change de
 * chapitre, on détruit le monde et on en construit un nouveau.
 */

export type EntityMode = 'idle' | 'follow' | 'move' | 'gone';

export interface EntityState {
  def: EntityDef;
  obj: THREE.Group;
  anim?: Animated;
  mode: EntityMode;
  home: THREE.Vector3;
  dest?: THREE.Vector3;
  hideOnArrive?: boolean;
  speed: number;
  reach: number;
  /** Prochain moment où l'entité choisit un nouveau point de promenade. */
  wanderAt: number;
}

interface Solid {
  x: number;
  z: number;
  r: number;
}

export interface WorldOptions {
  reduceMotion: boolean;
  /** Ombres portées réelles (désactivées en mode économie). */
  shadows: boolean;
  lowQuality: boolean;
  /** Nombre de missions vécues : fait grandir l'arbre du Royaume. */
  growth: number;
}

const PLAYER_RADIUS = 0.35;
/** Au-delà de cette distance du joueur, on ne calcule plus les animations (économie). */
const ANIMATION_RANGE = 32;
const deg = (d = 0) => (d * Math.PI) / 180;
/** Graine stable à partir d'une position : le même palmier au même endroit à chaque partie. */
const seedOf = (p: Vec2) => Math.abs(Math.round(p[0] * 13.7 + p[1] * 7.3));

export class World {
  readonly root = new THREE.Group();
  readonly entities = new Map<string, EntityState>();
  readonly zones = new Map<string, ZoneDef & { ring: THREE.Mesh }>();
  readonly radius: number;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly skyMaterial: THREE.MeshBasicMaterial;
  /** Brouillard léger couleur d'horizon : adoucit le bord du monde. */
  readonly fog: THREE.Fog;
  private readonly solids: Solid[] = [];
  private readonly followers: EntityState[] = [];
  private readonly marker: THREE.Mesh;
  private readonly owned: THREE.BufferGeometry[] = [];
  private readonly flats: { x: number; z: number; w: number; d: number }[] = [];
  private readonly reduceMotion: boolean;
  private atmosphere: Atmosphere | null = null;
  /** Direction du soleil (bas sur l'horizon : lumière dorée et ombres longues). */
  private readonly sunOffset = new THREE.Vector3(11, 10, 5);
  private readonly villagers: EntityState[] = [];

  /** Liste des modèles .glb à précharger avant de construire ce monde. */
  static assetsNeeded(def: WorldDef, chapter: ChapterDef): string[] {
    const names = new Set<string>(['grass', 'tallgrass', 'flowers', 'torch']);
    for (const p of def.props) assetsFor(p.model, { color: p.color }).forEach((n) => names.add(n));
    for (const e of [...def.entities, ...(chapter.entities ?? [])]) assetsFor(e.model, { look: e.look }).forEach((n) => names.add(n));
    assetsFor('person', { look: def.player.look }).forEach((n) => names.add(n));
    return [...names];
  }

  constructor(readonly def: WorldDef, chapter: ChapterDef, private readonly opts: WorldOptions) {
    this.reduceMotion = opts.reduceMotion;
    // Le chapitre peut changer le ciel et le sol (la même ville sous l'orage, puis au matin).
    const env = { ...def.environment, ...chapter.env };
    this.radius = env.radius;

    // Ciel : une grande sphère vue de l'intérieur, avec un dégradé par sommet.
    const skyGeo = new THREE.SphereGeometry(180, 16, 12);
    this.owned.push(skyGeo);
    const top = new THREE.Color(env.sky[0]);
    const horizon = new THREE.Color(env.sky[1]);
    const colors: number[] = [];
    const pos = skyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / 180);
      const c = horizon.clone().lerp(top, Math.pow(t, 0.6));
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.skyMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    this.root.add(new THREE.Mesh(skyGeo, this.skyMaterial));

    // Sol en herbe texturée
    const groundGeo = new THREE.CircleGeometry(env.radius + 60, 48);
    this.owned.push(groundGeo);
    const groundSize = (env.radius + 60) * 2;
    const ground = new THREE.Mesh(groundGeo, texturedMaterial(grass(env.ground), groundSize / 6, groundSize / 6));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);

    // Lumière : ciel + soleil chaud. Le soleil suit le joueur (voir followSun) pour des ombres nettes.
    this.fog = new THREE.Fog(env.sky[1], env.radius * 1.5, env.radius * 4.5);
    // Lumière de fin d'après-midi : soleil doré assez bas, ciel un peu plus doux.
    this.hemi = new THREE.HemisphereLight(env.sky[1], env.ground, 1.35);
    this.sun = new THREE.DirectionalLight('#ffdcaa', 2.9);
    this.sun.position.copy(this.sunOffset);
    if (opts.shadows) {
      this.sun.castShadow = true;
      const size = opts.lowQuality ? 512 : 1024;
      this.sun.shadow.mapSize.set(size, size);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -18;
      cam.right = cam.top = 18;
      cam.near = 1;
      cam.far = 60;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.04;
    }
    this.root.add(this.hemi, this.sun, this.sun.target);

    if (env.walls) this.root.add(ramparts(env.walls.radius, env.walls.gate));
    else if (env.dream) this.buildCloudRing(env.radius + 6);
    else this.buildHills(env.radius + 10);

    for (const p of def.props) {
      const built = buildModel(p.model, { color: p.color, size: p.size, scale: p.scale, seed: seedOf(p.pos), growth: opts.growth });
      this.place(built.obj, p.pos, p.rot, p.model === 'pen' ? 1 : p.scale);
      this.root.add(built.obj);
      this.addSolids(built.solids, p.pos, p.rot, p.scale);
      if (p.model === 'road' || p.model === 'plaza') {
        const [w, d] = p.size ?? [3, 10];
        this.flats.push({ x: p.pos[0], z: p.pos[1], w, d });
      }
    }

    for (const e of [...def.entities, ...(chapter.entities ?? [])]) this.addEntity(e);

    for (const z of [...def.zones, ...(chapter.zones ?? [])]) {
      const ringGeo = new THREE.RingGeometry(z.radius - 0.25, z.radius, 40);
      this.owned.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(z.pos[0], 0.06, z.pos[1]);
      ring.visible = false;
      this.root.add(ring);
      this.zones.set(z.id, { ...z, ring });
    }

    if (!env.dream) this.scatterVegetation();
    this.buildAtmosphere();
    if (!def.souvenir && this.flats.length) this.spawnVillagers(opts.lowQuality ? 3 : 6);

    // Marqueur d'objectif : un losange doré qui flotte au-dessus de la cible.
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), glow('#ffc21a'));
    this.owned.push(this.marker.geometry);
    this.marker.visible = false;
    this.root.add(this.marker);
  }

  /* --------------------------- construction ---------------------- */

  private place(obj: THREE.Object3D, p: Vec2, rot?: number, scale?: number) {
    obj.position.set(p[0], 0, p[1]);
    obj.rotation.y = deg(rot);
    if (scale) obj.scale.multiplyScalar(scale);
  }

  private addSolids(circles: Solids | undefined, p: Vec2, rot = 0, scale = 1) {
    if (!circles) return;
    const a = deg(rot);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (const [x, z, r] of circles) {
      // Rotation du cercle local dans le repère du monde.
      this.solids.push({ x: p[0] + (x * cos + z * sin) * scale, z: p[1] + (-x * sin + z * cos) * scale, r: r * scale });
    }
  }

  private addEntity(e: EntityDef) {
    const built = buildModel(e.model, { look: e.look, color: e.color, seed: seedOf(e.pos), stele: e.stele });
    const obj = built.obj;
    this.place(obj, e.pos, e.rot, e.scale);
    if (!this.opts.shadows) {
      // Sans ombres réelles : une ombre « tampon » (disque sombre), presque gratuite.
      const shadow = new THREE.Mesh(blobGeometry(), blobMaterial());
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.03;
      shadow.scale.setScalar(['horse', 'zebra', 'stag', 'deer', 'donkey', 'elephant', 'giraffe'].includes(e.model) ? 1.4 : e.look?.lying ? 1.2 : 0.7);
      obj.add(shadow);
    }
    obj.visible = !e.hidden;
    this.root.add(obj);
    if (!['person', 'sheep', 'goat', 'rabbit', 'dove', 'donkey', 'elephant', 'giraffe', 'horse', 'deer', 'stag', 'zebra'].includes(e.model)) {
      this.addSolids(built.solids, e.pos, e.rot, e.scale);
    }
    this.entities.set(e.id, {
      def: e,
      obj,
      anim: built.anim,
      mode: e.hidden ? 'gone' : 'idle',
      home: obj.position.clone(),
      speed: 3,
      reach: e.reach ?? defaultReach(e.model),
      wanderAt: Math.random() * 4,
    });
  }

  private buildHills(r: number) {
    const geoHill = new THREE.SphereGeometry(1, 14, 8);
    this.owned.push(geoHill);
    const hillMat = texturedMaterial(grass(this.def.environment.ground === '#7fc95a' ? '#5fae45' : this.def.environment.ground), 6, 6);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const hill = new THREE.Mesh(geoHill, hillMat);
      const s = 7 + ((i * 7) % 5);
      hill.scale.set(s * 1.3, s * 0.5, s);
      hill.position.set(Math.sin(a) * (r + s * 0.4), -1, Math.cos(a) * (r + s * 0.4));
      hill.receiveShadow = true;
      this.root.add(hill);
    }
  }

  /** Monde du rêve : une couronne de grands nuages à la place des collines. */
  private buildCloudRing(r: number) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const built = buildModel('cloudpuff', { seed: i + 3 });
      built.obj.scale.setScalar(2.4 + (i % 3) * 0.6);
      built.obj.position.set(Math.sin(a) * r, -1, Math.cos(a) * r);
      this.root.add(built.obj);
    }
  }

  /**
   * Herbes hautes et fleurs semées au hasard (hors chemins et obstacles).
   * InstancedMesh : le même brin dessiné des centaines de fois en un seul
   * appel au processeur graphique, comme un sprite CSS réutilisé.
   */
  private scatterVegetation() {
    const rand = seeded(this.radius * 31 + this.def.id.length);
    const free = (x: number, z: number) => {
      if (Math.hypot(x, z) > this.radius + 4) return false;
      for (const f of this.flats) if (Math.abs(x - f.x) < f.w / 2 + 0.3 && Math.abs(z - f.z) < f.d / 2 + 0.3) return false;
      for (const s of this.solids) if (Math.hypot(x - s.x, z - s.z) < s.r + 0.4) return false;
      for (const z2 of this.zones.values()) if (Math.hypot(x - z2.pos[0], z - z2.pos[1]) < z2.radius) return false;
      return true;
    };
    const low = this.opts.lowQuality;
    const plan: [string, number, number][] = [
      ['grass', low ? 90 : 260, 0.35],
      ['tallgrass', low ? 20 : 60, 0.8],
      ['flowers', low ? 15 : 45, 0.35],
    ];
    for (const [name, count, height] of plan) {
      const meshes = meshesOf(name);
      if (!meshes.length) continue;
      const box = new THREE.Box3();
      meshes.forEach((m) => box.expandByObject(m));
      const k = height / Math.max(0.001, box.max.y - box.min.y);
      const matrices: THREE.Matrix4[] = [];
      for (let tries = 0; matrices.length < count && tries < count * 8; tries++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * (this.radius + 3);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (!free(x, z)) continue;
        const s = k * (0.7 + rand() * 0.6);
        matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x, -box.min.y * s, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28), new THREE.Vector3(s, s, s)));
      }
      for (const m of meshes) {
        const inst = new THREE.InstancedMesh(m.geometry, m.material, matrices.length);
        matrices.forEach((mat, i) => inst.setMatrixAt(i, mat.clone().multiply(m.matrixWorld)));
        inst.instanceMatrix.needsUpdate = true;
        inst.receiveShadow = true;
        inst.computeBoundingSphere();
        this.root.add(inst);
      }
    }
  }

  /** Ciel, halos lumineux, poussière dorée, colombes, papillons (voir atmosphere.ts). */
  private buildAtmosphere() {
    const tower = this.def.props.find((p) => p.model === 'tower');
    const flowerSpots = this.def.props
      .filter((p) => p.model === 'flowers' || p.model === 'bush')
      .map((p) => new THREE.Vector3(p.pos[0], 0, p.pos[1]));
    this.atmosphere = new Atmosphere(
      {
        calm: this.reduceMotion,
        low: this.opts.lowQuality,
        doveCenter: tower ? new THREE.Vector3(tower.pos[0], 0, tower.pos[1]) : undefined,
        flowerSpots,
        sunColor: '#ffdcaa',
      },
      this.sunOffset,
    );
    // Halos autour des sources de lumière : la présence de la lumière dans la cité.
    for (const p of this.def.props) {
      const at = new THREE.Vector3(p.pos[0], 0, p.pos[1]);
      if (p.model === 'lamp') this.atmosphere.addLight(at.setY(2.15), '#ffb347', 1.6);
      if (p.model === 'tower') this.atmosphere.addLight(at.setY(9.9), '#ffc04d', 7);
      if (p.model === 'stage') this.atmosphere.addLight(at.add(new THREE.Vector3(0, 3.3, -1.8)), '#ffd6f0', 6);
    }
    this.root.add(this.atmosphere.root);
  }

  /**
   * Des habitants qui vont et viennent sur la place et dans les rues :
   * la cité vit même quand on ne leur parle pas.
   */
  private spawnVillagers(count: number) {
    const rand = seeded(count * 97 + this.radius);
    const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
    const tunics = ['#8d6e63', '#c0392b', '#2e86c1', '#d4a017', '#6c3483', '#1e8449', '#e67e22', '#5d6d7e', '#a04000', '#1a5276'];
    const skins = ['#5c3a21', '#7a4a2a', '#8d5524', '#a8693a', '#c68642'];
    const scarves = ['#f2efe6', '#7d3c98', '#2874a6', '#b03a2e', '#117a65'];
    for (let i = 0; i < count; i++) {
      const woman = rand() > 0.5;
      const elder = rand() > 0.7;
      const look: EntityDef['look'] = woman
        ? { base: 'woman', tunic: pick(tunics), accent: pick(tunics), scarf: pick(scarves), skin: pick(skins) }
        : { base: rand() > 0.5 ? 'man' : 'man2', tunic: pick(tunics), accent: pick(tunics), skin: pick(skins), hair: elder ? '#cfcfcf' : '#1b1b1b', beard: elder ? '#e0e0e0' : undefined };
      const start = this.randomStreetPoint(rand);
      const id = `~habitant${i}`;
      this.addEntity({ id, model: 'person', pos: [start.x, start.z], rot: rand() * 360, look });
      const e = this.entities.get(id)!;
      e.speed = 1 + rand() * 0.5;
      this.villagers.push(e);
    }
  }

  private randomStreetPoint(rand: () => number): THREE.Vector3 {
    const f = this.flats[Math.floor(rand() * this.flats.length)];
    return new THREE.Vector3(f.x + (rand() - 0.5) * (f.w - 1), 0, f.z + (rand() - 0.5) * (f.d - 1));
  }

  /* ------------------------------ API ---------------------------- */

  entity(id: string): EntityState | undefined {
    return this.entities.get(id);
  }

  show(ids: string[]) {
    for (const id of ids) {
      const e = this.entities.get(id);
      if (!e) continue;
      e.obj.visible = true;
      if (e.mode === 'gone') e.mode = 'idle';
    }
  }

  hide(ids: string[]) {
    for (const id of ids) {
      const e = this.entities.get(id);
      if (!e) continue;
      e.obj.visible = false;
      e.mode = 'gone';
    }
  }

  move(moves: MoveDef[], instant = false) {
    for (const m of moves) {
      const e = this.entities.get(m.id);
      if (!e) continue;
      const dest = new THREE.Vector3(m.to[0], 0, m.to[1]);
      if (instant || this.reduceMotion) {
        e.obj.position.copy(dest);
        e.home.copy(dest);
        if (m.hide) this.hide([m.id]);
        continue;
      }
      e.obj.visible = true;
      e.mode = 'move';
      e.dest = dest;
      e.hideOnArrive = !!m.hide;
      e.speed = m.speed ?? 2.2;
    }
  }

  follow(id: string) {
    const e = this.entities.get(id);
    if (!e || this.followers.includes(e)) return;
    e.mode = 'follow';
    this.followers.push(e);
  }

  /** L'entité entre dans la zone et s'y installe (ou y disparaît si absorb). */
  deliver(id: string, zoneId: string) {
    const e = this.entities.get(id);
    const z = this.zones.get(zoneId);
    if (!e || !z) return;
    const i = this.followers.indexOf(e);
    if (i >= 0) this.followers.splice(i, 1);
    const a = Math.random() * Math.PI * 2;
    const d = z.absorb ? 0 : z.radius * 0.55 * Math.random();
    e.dest = new THREE.Vector3(z.pos[0] + Math.cos(a) * d, 0, z.pos[1] + Math.sin(a) * d);
    e.mode = 'move';
    e.speed = 2.6;
    e.hideOnArrive = !!z.absorb;
  }

  /** Un personnage fait un petit geste (quand il commence à parler). */
  gesture(id: string) {
    const c = this.entities.get(id)?.anim?.character;
    const a = c?.actions.wave;
    if (!a || this.reduceMotion) return;
    a.reset().fadeIn(0.2).play();
  }

  /** Remet le monde dans l'état d'une partie sauvegardée en cours de chapitre. */
  applyHistory(steps: StepDef[]) {
    for (const s of steps) {
      if (s.show) this.show(s.show);
      if (s.hide) this.hide(s.hide);
      if (s.moves) this.move(s.moves, true);
      if (s.type === 'gather') {
        const z = this.zones.get(s.zone);
        if (!z) continue;
        s.targets.forEach((id, i) => {
          const e = this.entities.get(id);
          if (!e) return;
          if (z.absorb) return this.hide([id]);
          const a = (i / s.targets.length) * Math.PI * 2;
          e.obj.position.set(z.pos[0] + Math.cos(a) * z.radius * 0.5, 0, z.pos[1] + Math.sin(a) * z.radius * 0.5);
          e.home.copy(e.obj.position);
        });
      }
    }
  }

  highlightZone(id: string | null) {
    for (const [zid, z] of this.zones) z.ring.visible = zid === id;
  }

  setMarker(target: THREE.Vector3 | null, height = 2.4) {
    this.marker.visible = !!target;
    if (target) this.marker.position.set(target.x, height, target.z);
  }

  /** Le soleil (et sa zone d'ombre) suit le joueur. */
  followSun(p: THREE.Vector3) {
    this.sun.position.set(p.x + this.sunOffset.x, this.sunOffset.y, p.z + this.sunOffset.z);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  /**
   * Premier obstacle qui coupe le trajet from → to (pour que le guide le contourne).
   * Renvoie le centre et le rayon (marge du joueur comprise), ou null si la voie est libre.
   */
  firstObstacle(from: THREE.Vector3, to: THREE.Vector3): Solid | null {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return null;
    let best: Solid | null = null;
    let bestT = Infinity;
    for (const s of this.solids) {
      // Un obstacle posé sur la destination elle-même (la harpe sur son rocher) n'est pas à contourner.
      if (Math.hypot(s.x - to.x, s.z - to.z) < s.r + 0.5) continue;
      const r = s.r + PLAYER_RADIUS + 0.15;
      // Projection du centre de l'obstacle sur le segment.
      const t = ((s.x - from.x) * dx + (s.z - from.z) * dz) / len2;
      if (t < 0 || t > 1) continue;
      const px = from.x + dx * t - s.x;
      const pz = from.z + dz * t - s.z;
      if (px * px + pz * pz < r * r && t < bestT) {
        bestT = t;
        best = { x: s.x, z: s.z, r };
      }
    }
    return best;
  }

  /** Repousse un cercle (le joueur) hors des obstacles et le garde dans la carte. */
  collide(p: THREE.Vector3) {
    for (const s of this.solids) {
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const min = s.r + PLAYER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = s.x + (dx / d) * min;
        p.z = s.z + (dz / d) * min;
      }
    }
    const d = Math.hypot(p.x, p.z);
    if (d > this.radius) {
      p.x *= this.radius / d;
      p.z *= this.radius / d;
    }
  }

  /* ---------------------------- animation ------------------------ */

  update(dt: number, t: number, player: THREE.Object3D) {
    const calm = this.reduceMotion;
    if (this.marker.visible) {
      this.marker.rotation.y += dt * 2;
      if (!calm) this.marker.position.y += Math.sin(t * 3) * 0.004;
    }
    for (const z of this.zones.values()) {
      if (z.ring.visible && !calm) (z.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 4) * 0.3;
    }

    // File indienne : chaque suiveur suit celui qui le précède.
    let leader: THREE.Object3D = player;
    let leaderGap = 1.1;
    for (const e of this.followers) {
      const gap = Math.max(followGap(e.def.model), leaderGap);
      this.chase(e, leader.position, gap, 4.6, dt);
      leader = e.obj;
      leaderGap = followGap(e.def.model) * 0.8;
    }

    this.atmosphere?.update(dt, t, player.position);
    // Les habitants repartent vers un autre point de la ville une fois arrivés.
    if (!calm) {
      for (const v of this.villagers) {
        if (v.mode === 'idle' && t > v.wanderAt) {
          v.wanderAt = t + 4 + Math.random() * 6;
          // On choisit une destination dont le chemin ne traverse pas d'obstacle (fontaine, étal…).
          for (let tries = 0; tries < 8; tries++) {
            const dest = this.randomStreetPoint(Math.random);
            if (!this.firstObstacle(v.obj.position, dest)) {
              v.dest = dest;
              v.mode = 'move';
              break;
            }
          }
        }
      }
    }

    for (const e of this.entities.values()) {
      if (e.mode === 'move' && e.dest) {
        const arrived = this.chase(e, e.dest, 0.05, e.speed, dt);
        if (arrived) {
          e.home.copy(e.dest);
          e.mode = 'idle';
          if (this.villagers.includes(e)) e.wanderAt = t + 2 + Math.random() * 5;
          if (e.hideOnArrive) this.hide([e.def.id]);
        }
      } else if (e.mode === 'idle') {
        this.idle(e, dt, t);
      }
      // Les animations ne sont calculées que près du joueur (économie de batterie).
      if (e.anim && e.obj.visible && e.obj.position.distanceTo(player.position) < ANIMATION_RANGE) {
        e.anim.mixer.update(calm ? dt * 0.6 : dt);
        if (e.def.look?.wheelchair && e.anim.character) poseSeated(e.anim.character);
      }
    }
  }

  /** Avance vers une cible en s'arrêtant à `gap`. Renvoie true si arrivé. */
  private chase(e: EntityState, target: THREE.Vector3, gap: number, speed: number, dt: number): boolean {
    const p = e.obj.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d <= gap) {
      this.motion(e, false, speed);
      return true;
    }
    const step = Math.min(d - gap, speed * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    e.obj.rotation.y = turnTowards(e.obj.rotation.y, Math.atan2(dx, dz), dt * 8);
    this.motion(e, step > 0.001, speed);
    return false;
  }

  private idle(e: EntityState, dt: number, t: number) {
    const w = e.def.wander ?? 0;
    if (w > 0 && !this.reduceMotion) {
      if (t > e.wanderAt) {
        e.wanderAt = t + 3 + Math.random() * 4;
        const a = Math.random() * Math.PI * 2;
        e.dest = new THREE.Vector3(e.home.x + Math.cos(a) * w * Math.random(), 0, e.home.z + Math.sin(a) * w * Math.random());
      }
      if (e.dest) {
        const arrived = this.chase(e, e.dest, 0.1, 0.9, dt);
        if (arrived) e.dest = undefined;
        return;
      }
    }
    this.motion(e, false, 1);
  }

  /** Bascule entre l'animation de repos et celle de marche (fondu enchaîné). */
  private motion(e: EntityState, walking: boolean, speed: number) {
    const a = e.anim;
    if (!a || e.def.look?.lying || e.def.look?.wheelchair) return;
    const next = walking ? 'walk' : 'idle';
    const action = next === 'walk' ? a.walk : a.idle;
    if (action) action.timeScale = walking ? Math.min(1.6, Math.max(0.7, speed / 2.2)) : 1;
    if (a.current === next || !action) return;
    const prev = a.current === 'walk' ? a.walk : a.idle;
    action.reset().play();
    if (prev && prev !== action) prev.crossFadeTo(action, 0.25, false);
    a.current = next;
  }

  dispose() {
    this.atmosphere?.dispose();
    this.root.removeFromParent();
    // Les géométries partagées (modèles .glb) restent en cache pour le monde suivant.
    for (const g of this.owned) g.dispose();
  }
}

let blob: THREE.CircleGeometry | null = null;
let blobMat: THREE.MeshBasicMaterial | null = null;
function blobGeometry() {
  return (blob ??= new THREE.CircleGeometry(0.8, 16));
}
function blobMaterial() {
  return (blobMat ??= new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }));
}

/** Tourne un angle vers un autre par le chemin le plus court. */
export function turnTowards(current: number, target: number, amount: number): number {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return current + Math.max(-amount, Math.min(amount, diff));
}

