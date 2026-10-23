import * as THREE from 'three';
import type { DialogLine, QuestDef, QuestText, SoundName } from '../types';
import { QuestRunner, TRAIT_KEY, scrollKey, type RunnerAction } from '../quest/QuestRunner';
import { getWorld } from '../content';
import { questText, t, worldText } from '../core/i18n';
import { audio } from '../core/audio';
import { music } from '../core/music';
import { speech } from '../core/speech';
import { persist, save } from '../core/save';
import type { Settings } from '../core/settings';
import { $, announce, fadeThrough } from '../ui/dom';
import type { Hud } from '../ui/Hud';
import type { DialogBox } from '../ui/DialogBox';
import type { ScrollView, TraitCard } from '../ui/Overlays';
import type { Engine } from './Engine';
import { Effects } from './Effects';
import { Input } from './Input';
import { Player } from './Player';
import { World, type EntityState } from './World';
import { preload } from './assets';
import { markerHeight } from './models';

/**
 * Une partie en cours (une quête).
 *
 * Game est le « chef d'orchestre » : il transmet les événements du joueur
 * au QuestRunner (la logique) et exécute les actions qu'il renvoie sur le
 * World (la 3D) et l'interface (le HTML).
 *
 * Toutes les actions passent par une file (this.seq) : un dialogue doit être
 * fini avant que l'étape suivante ne s'affiche, un changement de monde doit
 * être fini avant d'y faire apparaître quelqu'un, etc.
 */

export interface GameUI {
  hud: Hud;
  dialog: DialogBox;
  scroll: ScrollView;
  trait: TraitCard;
}

export interface GameCallbacks {
  onComplete: () => void;
  onMenu: () => void;
}

interface Target {
  pos: THREE.Vector3;
  /** Distance à laquelle on considère être arrivé. */
  stop: number;
  name: string;
  entity?: EntityState;
  zone?: string;
}

/** Caméra : position par rapport au joueur, et distance à laquelle elle regarde devant lui. */
const CAMERA_LANDSCAPE = { offset: new THREE.Vector3(0, 9, 10.5), ahead: 1 };
// En portrait (téléphone), l'écran est haut et étroit : on monte la caméra et on
// regarde plus loin devant, pour que le joueur soit dans le tiers bas de l'écran.
const CAMERA_PORTRAIT = { offset: new THREE.Vector3(0, 14, 10), ahead: 5 };

export class Game {
  private readonly runner: QuestRunner;
  private readonly text: QuestText;
  private readonly input: Input;
  private readonly unsubscribe: () => void;
  private world: World | null = null;
  private player: Player | null = null;
  private effects: Effects | null = null;
  private worldId = '';
  private names: Record<string, string> = {};
  private colors: Record<string, string> = {};

  private seq: Promise<void> = Promise.resolve();
  private pending = 0;
  private disposed = false;
  private paused = false;

  /** Marche automatique : vers un point touché, ou vers l'objectif (guide). */
  private walkTo: Target | null = null;
  private guiding = false;
  private stuck = { best: Infinity, timer: 0, detour: 0, side: 1, obstacle: '' };
  private nearest: EntityState | null = null;
  private beaconTimer = 1.5;
  private objectivePending = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(
    private readonly engine: Engine,
    private readonly ui: GameUI,
    private readonly def: QuestDef,
    startStep: number,
    private readonly settings: Settings,
    private readonly cb: GameCallbacks,
  ) {
    this.text = questText(def.id);
    this.runner = new QuestRunner(def, startStep);
    this.input = new Input(engine.renderer.domElement, $('joystick'), {
      action: () => this.onAction(),
      where: () => this.describeWhere(),
      guide: () => this.toggleGuide(),
      menu: () => this.cb.onMenu(),
      tap: (x, y) => this.onTap(x, y),
    });
    this.unsubscribe = engine.onUpdate((dt, time) => this.update(dt, time));
    if (import.meta.env.DEV) (window as unknown as { __zion: Game }).__zion = this;
  }

  get calm(): boolean {
    return this.settings.reduceMotion;
  }

  /** Ombres portées réelles, sauf en mode économie. */
  get shadows(): boolean {
    return !this.settings.lowQuality;
  }

  start(): void {
    this.ui.hud.reset();
    this.ui.hud.captionsOn = this.settings.captions;
    this.handle(this.runner.start());
    this.engine.start();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.input.enabled = !paused;
    if (paused) this.stopWalking();
  }

  /** Bouton d'action (clavier, bouton à l'écran, ou touche Entrée). */
  onAction(): void {
    if (this.paused || this.disposed) return;
    if (this.ui.dialog.open) {
      this.ui.dialog.advance();
      return;
    }
    if (this.uiBusy || !this.nearest) return;
    const id = this.nearest.def.id;
    const actions = this.runner.act(id);
    if (actions.length) {
      this.stopWalking();
      this.handle(actions);
      return;
    }
    const idle = this.text.idle?.[id] ?? worldText(this.worldId).idle?.[id];
    if (idle) {
      this.stopWalking();
      this.enqueue(() => this.playLines(idle));
    }
  }

  toggleGuide(): void {
    if (this.paused || this.uiBusy) return;
    if (this.guiding) {
      this.stopWalking();
      return;
    }
    const target = this.guideTarget();
    if (!target) {
      this.ui.hud.toast(t('where.none'));
      return;
    }
    this.guiding = true;
    this.walkTo = target;
    this.resetStuck();
    this.ui.hud.setGuiding(true);
    this.ui.hud.toast(t('where.guiding', { name: target.name }));
    speech.speak(t('where.guiding', { name: target.name }));
    this.focusGame();
  }

  /** Décrit en mots où se trouve l'objectif (pour tous, et surtout sans la vue). */
  describeWhere(): void {
    if (this.paused || this.uiBusy || !this.player) return;
    const target = this.guideTarget();
    if (!target) {
      this.ui.hud.toast(t('where.none'));
      speech.speak(t('where.none'));
      return;
    }
    const dx = target.pos.x - this.player.position.x;
    const dz = target.pos.z - this.player.position.z;
    const dist = Math.hypot(dx, dz);
    let sentence: string;
    if (dist <= target.stop + 0.6) {
      sentence = t('where.here', { name: target.name });
    } else {
      const distance = dist < 4 ? t('where.close') : dist < 12 ? t('where.near') : t('where.far');
      sentence = t('where.sentence', { name: target.name, distance, dir: t(`where.dirs.${screenDirection(dx, dz)}`) });
    }
    this.ui.hud.toast(sentence, 5000);
    speech.speak(sentence);
    this.focusGame();
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    this.input.dispose();
    this.effects?.dispose();
    this.world?.dispose();
    audio.stopAll();
    speech.cancel();
    if (this.ui.dialog.open) this.ui.dialog.close();
    this.ui.hud.reset();
  }

  /* -------------------------------------------------- file d'actions */

  private get uiBusy(): boolean {
    return this.pending > 0 || this.ui.dialog.open || this.ui.scroll.open || this.ui.trait.open;
  }

  private enqueue(fn: () => void | Promise<void>): void {
    this.pending++;
    this.seq = this.seq
      .then(async () => {
        if (!this.disposed) await fn();
      })
      .catch((err) => console.error('[Zion]', err))
      .finally(() => this.pending--);
  }

  private handle(actions: RunnerAction[]): void {
    for (const a of actions) this.enqueue(() => this.apply(a));
  }

  private async apply(a: RunnerAction): Promise<void> {
    const world = this.world;
    switch (a.kind) {
      case 'chapter':
        await this.loadChapter(a.index);
        return;
      case 'step':
        this.onStep();
        return;
      case 'show':
        world?.show(a.ids);
        return;
      case 'hide':
        world?.hide(a.ids);
        return;
      case 'move':
        world?.move(a.moves);
        return;
      case 'follow':
        world?.follow(a.id);
        audio.pickup();
        this.ui.hud.toast(t('announce.follow', { name: this.names[a.id] ?? a.id }));
        return;
      case 'deliver':
        world?.deliver(a.id, a.zone);
        return;
      case 'progress':
        this.ui.hud.setCounter(a.done, a.total);
        if (a.done > 0) audio.play('chime', 0, 0.6);
        return;
      case 'dialog': {
        const lines = this.text.dialogs[a.key];
        if (lines) await this.playLines(lines);
        this.handle(this.runner.done(a.key));
        return;
      }
      case 'scroll': {
        const scroll = this.text.scrolls?.[a.key];
        if (scroll) {
          this.ui.scroll.calm = this.calm;
          await this.ui.scroll.play(scroll);
          this.focusGame();
        }
        this.handle(this.runner.done(scrollKey(a.key)));
        return;
      }
      case 'trait':
        this.ui.trait.calm = this.calm;
        await this.ui.trait.play(this.text, this.def.traitIcon);
        this.focusGame();
        this.handle(this.runner.done(TRAIT_KEY));
        return;
      case 'complete':
        save.quests[this.def.id] = { step: 0, done: true };
        persist();
        this.cb.onComplete();
        return;
    }
  }

  private onStep(): void {
    const step = this.runner.step;
    const objective = this.text.objectives[step.id] ?? null;
    this.ui.hud.setObjective(objective);
    if (step.type !== 'gather') this.ui.hud.setCounter(0, 0);
    this.world?.highlightZone(step.type === 'gather' || step.type === 'reach' ? step.zone : null);
    this.objectivePending = !!objective;
    this.stopWalking();
    const prev = save.quests[this.def.id];
    save.quests[this.def.id] = { step: this.runner.index, done: prev?.done ?? false };
    persist();
  }

  private async playLines(lines: DialogLine[]): Promise<void> {
    this.ui.hud.setAction(null);
    await this.ui.dialog.play(lines, {
      names: this.names,
      colors: this.colors,
      autoAdvance: this.settings.autoAdvance,
      onLine: (line) => {
        this.world?.gesture(line.who);
        if (line.fx) {
          this.effects?.play(line.fx);
          this.ui.hud.caption(t(`captions.${line.fx}`));
        }
        if (line.snd) this.playSound(line.snd);
      },
    });
    this.effects?.settle();
    this.focusGame();
  }

  private playSound(name: SoundName, pan = 0, volume = 1): void {
    audio.play(name, pan, volume);
    if (name === 'ping') return;
    const side = pan < -0.3 ? ` ${t('captions.fromLeft')}` : pan > 0.3 ? ` ${t('captions.fromRight')}` : '';
    this.ui.hud.caption(t(`captions.${name}`).replace(']', `${side}]`));
  }

  /* -------------------------------------------------- mondes */

  private async loadChapter(index: number): Promise<void> {
    const chapter = this.def.chapters[index];
    const wdef = getWorld(chapter.world);
    const wtext = worldText(chapter.world);
    await fadeThrough(async () => {
      // Téléchargement des modèles 3D de ce lieu (une seule fois ; ensuite ils sont en cache).
      await preload(World.assetsNeeded(wdef, chapter), (done, total) => this.ui.hud.loading(done, total));
      this.effects?.dispose();
      this.world?.dispose();
      this.worldId = chapter.world;
      this.world = new World(wdef, chapter, { reduceMotion: this.calm, shadows: this.shadows, lowQuality: this.settings.lowQuality });
      this.engine.scene.add(this.world.root);
      this.engine.scene.fog = this.world.fog;
      this.player = new Player(wdef.player.look, this.calm, this.shadows);
      this.world.root.add(this.player.obj);
      const start = chapter.player ?? wdef.player;
      this.player.place(start.pos[0], start.pos[1], start.rot ?? 180);
      const player = this.player;
      this.effects = new Effects(this.world, () => player.position, this.calm, this.settings.lowQuality);
      this.world.applyHistory(this.runner.historyInChapter());
      this.names = {
        narrator: t('dialog.narrator'),
        player: t('dialog.player'),
        ...wtext.names,
        ...this.text.names,
      };
      this.colors = { narrator: '#ffc21a', player: wdef.player.look.tunic };
      for (const [id, e] of this.world.entities) this.colors[id] = e.def.look?.tunic ?? this.def.color;
      this.ui.hud.setSouvenir(wdef.souvenir ? `${t('hud.souvenir')} · ${wtext.name}` : null);
      this.snapCamera();
    }, this.calm);
    announce(t('announce.worldEnter', { place: wtext.name }));
    music.play(wdef.souvenir ? 'souvenir' : 'zion');
    if (this.settings.music) this.ui.hud.caption(t(wdef.souvenir ? 'captions.musicSouvenir' : 'captions.music'));
  }

  /* -------------------------------------------------- boucle */

  private update(dt: number, time: number): void {
    const world = this.world;
    const player = this.player;
    if (!world || !player || this.disposed) return;
    const active = !this.paused && !this.uiBusy;

    let dir = { x: 0, y: 0 };
    if (active) {
      if (this.input.hasManualInput()) {
        if (this.walkTo) this.stopWalking();
        dir = this.input.direction();
      } else if (this.walkTo) {
        dir = this.steer(dt);
      }
    }
    player.update(dt, dir, world);
    world.followSun(player.position);
    world.update(dt, time, player.obj);
    this.effects?.update(dt);
    this.followCamera(dt);

    const target = this.runner.busy ? null : this.guideTarget();
    world.setMarker(target?.entity ? target.pos : target?.zone ? target.pos : null, target?.entity ? markerHeight(target.entity.def.model, target.entity.def.look) : 1.2);

    if (!active) {
      this.ui.hud.setAction(null);
      return;
    }
    this.checkGather();
    this.checkZones();
    this.checkNearest();
    this.beacon(dt, target);
    if (this.objectivePending) {
      this.objectivePending = false;
      const text = this.text.objectives[this.runner.step.id];
      if (text) {
        announce(t('announce.objective', { text }));
        speech.speak(t('announce.objective', { text }));
      }
    }
  }

  private checkGather(): void {
    const step = this.runner.step;
    if (step.type !== 'gather') return;
    const p = this.player!.position;
    for (const id of this.runner.pendingTargets()) {
      const e = this.world!.entity(id);
      if (!e || !e.obj.visible) continue;
      if (e.obj.position.distanceTo(p) <= Math.max(1.6, e.reach * 0.9)) this.handle(this.runner.touch(id));
    }
  }

  private checkZones(): void {
    const step = this.runner.step;
    if (step.type !== 'gather' && step.type !== 'reach') return;
    const zone = this.world!.zones.get(step.zone);
    if (!zone) return;
    const p = this.player!.position;
    if (Math.hypot(p.x - zone.pos[0], p.z - zone.pos[1]) <= zone.radius) {
      const actions = this.runner.enterZone(step.zone);
      if (actions.length) {
        if (step.type === 'reach') this.stopWalking();
        this.handle(actions);
      }
    }
  }

  /** Trouve l'entité la plus proche avec qui on peut interagir et met à jour le bouton. */
  private checkNearest(): void {
    const p = this.player!.position;
    const step = this.runner.step;
    const target = step.type === 'talk' || step.type === 'interact' ? step.target : null;
    const idle = { ...worldText(this.worldId).idle, ...this.text.idle };
    let best: EntityState | null = null;
    let bestD = Infinity;
    for (const [id, e] of this.world!.entities) {
      if (!e.obj.visible || e.mode === 'follow') continue;
      if (id !== target && !idle[id]) continue;
      const d = e.obj.position.distanceTo(p);
      // La cible de l'étape est prioritaire sur les bavardages.
      const score = id === target ? d - 1 : d;
      if (d <= e.reach && score < bestD) {
        best = e;
        bestD = score;
      }
    }
    if (best !== this.nearest && best) audio.play('ping', 0, 0.25);
    this.nearest = best;
    if (!best) {
      this.ui.hud.setAction(null);
      return;
    }
    const id = best.def.id;
    const name = this.names[id] ?? id;
    const verb = this.text.verbs?.[id];
    const isUse = step.type === 'interact' && id === target;
    this.ui.hud.setAction(verb ?? (isUse ? t('hud.use', { name }) : t('hud.talk', { name })));
    // Arrivé près de la cible avec le guide : on s'arrête et on explique quoi faire.
    if (this.guiding && id === target) {
      this.stopWalking();
      const msg = t('where.arrived', { name });
      this.ui.hud.toast(msg);
      speech.speak(msg);
    }
  }

  /** Où le joueur doit-il aller maintenant ? */
  private guideTarget(): Target | null {
    const world = this.world;
    const player = this.player;
    if (!world || !player) return null;
    const step = this.runner.step;
    const entityTarget = (id: string): Target | null => {
      const e = world.entity(id);
      if (!e || !e.obj.visible) return null;
      return { pos: e.obj.position, stop: Math.max(1.2, e.reach * 0.7), name: this.names[id] ?? id, entity: e };
    };
    const zoneTarget = (id: string): Target | null => {
      const z = world.zones.get(id);
      if (!z) return null;
      return { pos: new THREE.Vector3(z.pos[0], 0, z.pos[1]), stop: 0.3, name: this.names[id] ?? t('where.zone'), zone: id };
    };
    if (step.type === 'talk' || step.type === 'interact') return entityTarget(step.target);
    if (step.type === 'reach') return zoneTarget(step.zone);
    if (step.type === 'gather') {
      const p = player.position;
      const pending = this.runner
        .pendingTargets()
        .map(entityTarget)
        .filter((x): x is Target => !!x)
        .sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
      return pending[0] ?? zoneTarget(step.zone);
    }
    return null;
  }

  /** Direction de marche automatique, avec un petit contournement si on est bloqué. */
  private steer(dt: number): { x: number; y: number } {
    const p = this.player!.position;
    if (this.guiding) {
      const fresh = this.guideTarget();
      if (!fresh) {
        this.stopWalking();
        return { x: 0, y: 0 };
      }
      this.walkTo = fresh;
    }
    const target = this.walkTo!;
    const dx = target.pos.x - p.x;
    const dz = target.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d <= target.stop) {
      if (!this.guiding) this.stopWalking();
      return { x: 0, y: 0 };
    }
    // Détection de blocage : si on ne se rapproche plus, on contourne.
    if (d < this.stuck.best - 0.2) {
      this.stuck.best = d;
      this.stuck.timer = 0;
    } else {
      this.stuck.timer += dt;
    }
    if (this.stuck.timer > 1.5) {
      this.stuck.detour = 0.9;
      this.stuck.timer = 0;
      this.stuck.best = d;
    }
    let x = dx / d;
    let y = -dz / d;
    // Un obstacle sur la route ? On le longe par le côté le plus proche (vecteur perpendiculaire).
    const obstacle = this.world!.firstObstacle(p, target.pos);
    if (obstacle) {
      const ox = obstacle.x - p.x;
      const oz = obstacle.z - p.z;
      // Côté choisi une fois pour toutes tant que le même obstacle gêne (évite les hésitations).
      const key = `${obstacle.x.toFixed(1)},${obstacle.z.toFixed(1)}`;
      if (this.stuck.obstacle !== key) {
        this.stuck.obstacle = key;
        this.stuck.side = (dx / d) * oz - (dz / d) * ox > 0 ? -1 : 1;
      }
      const od = Math.hypot(ox, oz) || 1;
      // Direction tangente au cercle, légèrement écartée de son centre.
      const tx = (-oz / od) * this.stuck.side - (ox / od) * 0.35;
      const tz = (ox / od) * this.stuck.side - (oz / od) * 0.35;
      const tl = Math.hypot(tx, tz) || 1;
      x = tx / tl;
      y = -tz / tl;
    } else {
      this.stuck.obstacle = '';
    }
    if (this.stuck.detour > 0) {
      this.stuck.detour -= dt;
      const a = 1.2 * this.stuck.side;
      [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    }
    return { x, y };
  }

  private stopWalking(): void {
    this.walkTo = null;
    if (this.guiding) {
      this.guiding = false;
      this.ui.hud.setGuiding(false);
    }
  }

  private resetStuck(): void {
    this.stuck = { best: Infinity, timer: 0, detour: 0, side: 1, obstacle: '' };
  }

  private onTap(clientX: number, clientY: number): void {
    if (this.paused || this.uiBusy || !this.world) return;
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.engine.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return;
    // Toucher près d'un personnage = marcher jusqu'à lui.
    let entity: EntityState | undefined;
    for (const e of this.world.entities.values()) {
      if (e.obj.visible && e.obj.position.distanceTo(hit) < 1.4) entity = e;
    }
    this.guiding = false;
    this.ui.hud.setGuiding(false);
    this.resetStuck();
    this.walkTo = entity
      ? { pos: entity.obj.position, stop: Math.max(1.1, entity.reach * 0.7), name: entity.def.id, entity }
      : { pos: hit, stop: 0.25, name: '' };
  }

  /** Bip spatialisé vers l'objectif, toutes les ~2,5 s. */
  private beacon(dt: number, target: Target | null): void {
    if (!this.settings.beacon || !target || !this.player) return;
    this.beaconTimer -= dt;
    if (this.beaconTimer > 0) return;
    this.beaconTimer = 2.5;
    const dx = target.pos.x - this.player.position.x;
    const dz = target.pos.z - this.player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < target.stop + 0.5) return;
    const pan = Math.max(-1, Math.min(1, dx / 8));
    const volume = Math.max(0.3, Math.min(1, 1 - dist / 40));
    const step = this.runner.step;
    const sound: SoundName = step.type === 'gather' && step.beacon && target.entity ? step.beacon : 'ping';
    this.playSound(sound, pan, volume);
  }

  /* -------------------------------------------------- caméra */

  private cameraRig() {
    return this.engine.camera.aspect < 1 ? CAMERA_PORTRAIT : CAMERA_LANDSCAPE;
  }

  private snapCamera(): void {
    this.followCamera(1);
  }

  private followCamera(dt: number): void {
    const p = this.player!.position;
    const cam = this.engine.camera;
    const rig = this.cameraRig();
    const goal = p.clone().add(rig.offset);
    cam.position.lerp(goal, dt >= 1 ? 1 : 1 - Math.exp(-dt * 5));
    // On vise un point devant le joueur, calculé depuis la position (lissée) de la caméra.
    cam.lookAt(cam.position.x - rig.offset.x, 0.8, cam.position.z - rig.offset.z - rig.ahead);
  }

  private focusGame(): void {
    $('screen-game').focus({ preventScroll: true });
  }

  /* -------------------------------------------------- outils de test (dev uniquement) */

  /** Téléporte le joueur (utilisé par les tests automatisés en développement). */
  debugTeleport(x: number, z: number): void {
    this.player?.place(x, z);
  }

  debugState() {
    return {
      step: this.runner.step.id,
      index: this.runner.index,
      busy: this.runner.busy,
      finished: this.runner.finished,
      pending: this.pending,
      following: [...this.runner.following],
      nearest: this.nearest?.def.id ?? null,
      player: this.player ? [this.player.position.x, this.player.position.z] : null,
      target: this.guideTarget()?.name ?? null,
      targetId: this.guideTarget()?.entity?.def.id ?? null,
    };
  }
}

/** Direction écran en 8 secteurs (haut = s'éloigner de la caméra). */
function screenDirection(dx: number, dz: number): string {
  const angle = (Math.atan2(dx, -dz) * 180) / Math.PI; // 0 = haut, 90 = droite
  const sectors = ['up', 'upRight', 'right', 'downRight', 'down', 'downLeft', 'left', 'upLeft'];
  const i = Math.round(((angle + 360) % 360) / 45) % 8;
  return sectors[i];
}
