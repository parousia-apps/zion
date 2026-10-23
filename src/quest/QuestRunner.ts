import type { MoveDef, QuestDef, StepDef } from '../types';

/**
 * Le QuestRunner est la « machine à états » d'une quête.
 *
 * Analogie : c'est un reducer Redux. Il ne sait rien de la 3D ni du HTML.
 * On lui envoie des événements (le joueur a parlé à X, est entré dans la
 * zone Y, a fini un dialogue) et il répond par une liste d'actions à
 * exécuter (afficher un dialogue, montrer une entité, passer à l'étape
 * suivante...). C'est Game.ts qui exécute ces actions.
 *
 * Avantage : toute la logique de quête est testable sans navigateur
 * (voir QuestRunner.test.ts).
 */

export type RunnerAction =
  | { kind: 'chapter'; index: number }
  | { kind: 'step'; index: number; step: StepDef }
  | { kind: 'dialog'; key: string }
  | { kind: 'scroll'; key: string }
  | { kind: 'trait' }
  | { kind: 'show'; ids: string[] }
  | { kind: 'hide'; ids: string[] }
  | { kind: 'move'; moves: MoveDef[] }
  | { kind: 'follow'; id: string }
  | { kind: 'deliver'; id: string; zone: string }
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'complete' };

interface FlatStep {
  chapter: number;
  step: StepDef;
}

/** Préfixes des clés « en attente » pour les écrans qui ne sont pas des dialogues. */
export const scrollKey = (key: string) => `scroll:${key}`;
export const TRAIT_KEY = 'trait:';

export class QuestRunner {
  /** Toutes les étapes de tous les chapitres, à plat. */
  readonly flat: FlatStep[];
  index: number;
  following: string[] = [];
  delivered = new Set<string>();
  finished = false;
  /** Clé de l'écran (dialogue, parchemin, carte) dont la fermeture terminera l'étape. */
  private awaiting: string | null = null;

  constructor(readonly def: QuestDef, startIndex = 0) {
    this.flat = def.chapters.flatMap((c, chapter) => c.steps.map((step) => ({ chapter, step })));
    this.index = Math.min(Math.max(0, startIndex), this.flat.length - 1);
  }

  get step(): StepDef {
    return this.flat[this.index].step;
  }

  get chapter(): number {
    return this.flat[this.index].chapter;
  }

  /** Vrai quand on attend la fin d'un dialogue/écran : les autres événements sont ignorés. */
  get busy(): boolean {
    return this.awaiting !== null;
  }

  /** Étapes déjà franchies dans le chapitre courant (pour restaurer une sauvegarde). */
  historyInChapter(): StepDef[] {
    return this.flat
      .slice(0, this.index)
      .filter((f) => f.chapter === this.chapter)
      .map((f) => f.step);
  }

  start(): RunnerAction[] {
    return this.enterStep(null);
  }

  /** Le joueur appuie sur « action » près de l'entité `id`. */
  act(id: string): RunnerAction[] {
    if (this.busy || this.finished) return [];
    const s = this.step;
    if ((s.type === 'talk' || s.type === 'interact') && s.target === id) {
      return this.finishWith(s.dialog);
    }
    return [];
  }

  /** Le joueur touche une entité (pour les étapes "gather"). */
  touch(id: string): RunnerAction[] {
    if (this.busy || this.finished) return [];
    const s = this.step;
    if (s.type !== 'gather' || !s.targets.includes(id)) return [];
    if (this.following.includes(id) || this.delivered.has(id)) return [];
    const first = this.following.length === 0 && this.delivered.size === 0;
    this.following.push(id);
    const out: RunnerAction[] = [{ kind: 'follow', id }];
    const pickup = s.pickupDialogs?.[id] ?? (first ? s.pickupDialog : undefined);
    if (pickup) out.push({ kind: 'dialog', key: pickup });
    return out;
  }

  /** Le joueur se trouve dans la zone `zoneId`. Peut être appelé à chaque image. */
  enterZone(zoneId: string): RunnerAction[] {
    if (this.busy || this.finished) return [];
    const s = this.step;
    if (s.type === 'reach' && s.zone === zoneId) return this.finishWith(s.dialog);
    if (s.type === 'gather' && s.zone === zoneId && this.following.length > 0) {
      const out: RunnerAction[] = this.following.map((id) => ({ kind: 'deliver' as const, id, zone: zoneId }));
      this.following.forEach((id) => this.delivered.add(id));
      this.following = [];
      out.push(this.progressAction());
      if (this.delivered.size === s.targets.length) out.push(...this.finishWith(s.dialog));
      return out;
    }
    return [];
  }

  /** Un dialogue / parchemin / carte vient d'être fermé. */
  done(key: string): RunnerAction[] {
    if (key !== this.awaiting) return [];
    return this.next();
  }

  /** L'entité est-elle concernée par l'étape en cours ? (pour le marqueur et le guide) */
  pendingTargets(): string[] {
    const s = this.step;
    if (s.type === 'talk' || s.type === 'interact') return [s.target];
    if (s.type === 'gather') return s.targets.filter((t) => !this.following.includes(t) && !this.delivered.has(t));
    return [];
  }

  /* ---------------------------------------------------------------- */

  private enterStep(prevChapter: number | null): RunnerAction[] {
    const s = this.step;
    const out: RunnerAction[] = [];
    this.following = [];
    this.delivered.clear();
    if (prevChapter !== this.chapter) out.push({ kind: 'chapter', index: this.chapter });
    out.push({ kind: 'step', index: this.index, step: s });
    if (s.show?.length) out.push({ kind: 'show', ids: s.show });
    if (s.hide?.length) out.push({ kind: 'hide', ids: s.hide });
    if (s.moves?.length) out.push({ kind: 'move', moves: s.moves });
    if (s.type === 'gather') out.push(this.progressAction());
    if (s.startDialog) out.push({ kind: 'dialog', key: s.startDialog });

    if (s.type === 'scene') out.push(...this.finishWith(s.dialog));
    if (s.type === 'scroll') {
      this.awaiting = scrollKey(s.scroll);
      out.push({ kind: 'scroll', key: s.scroll });
    }
    if (s.type === 'trait') {
      this.awaiting = TRAIT_KEY;
      out.push({ kind: 'trait' });
    }
    return out;
  }

  /** Termine l'étape après le dialogue donné (ou tout de suite s'il n'y en a pas). */
  private finishWith(dialog?: string): RunnerAction[] {
    if (dialog) {
      this.awaiting = dialog;
      return [{ kind: 'dialog', key: dialog }];
    }
    return this.next();
  }

  private next(): RunnerAction[] {
    this.awaiting = null;
    if (this.index >= this.flat.length - 1) {
      this.finished = true;
      return [{ kind: 'complete' }];
    }
    const prevChapter = this.chapter;
    this.index++;
    return this.enterStep(prevChapter);
  }

  private progressAction(): RunnerAction {
    const s = this.step;
    const total = s.type === 'gather' ? s.targets.length : 0;
    return { kind: 'progress', done: this.delivered.size, total };
  }
}
