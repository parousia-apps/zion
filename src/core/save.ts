import { defaultSettings, type Settings } from './settings';

/**
 * Sauvegarde dans le localStorage : pas de compte, pas de serveur,
 * aucune donnée personnelle ne quitte l'appareil.
 *
 * Si on change la forme des données un jour, on incrémente VERSION et on
 * ajoute une migration dans load().
 */

const KEY = 'zion.save';
const VERSION = 1;

export interface QuestProgress {
  /** Index de l'étape en cours (toutes étapes de la quête mises à plat). */
  step: number;
  done: boolean;
}

/** Une page du carnet du veilleur : un défi accepté, et ce que l'enfant en raconte. */
export interface JournalEntry {
  questId: string;
  acceptedAt: number;
  /** « Je l'ai vécu » (aucun point, juste un souvenir). */
  lived?: boolean;
  note?: string;
  /** Le Gardien a déjà demandé des nouvelles. */
  asked?: boolean;
}

export interface SaveData {
  version: number;
  settings: Settings;
  quests: Record<string, QuestProgress>;
  journal: JournalEntry[];
  /** Versets appris (références). */
  verses: string[];
}

function fresh(): SaveData {
  return { version: VERSION, settings: defaultSettings(), quests: {}, journal: [], verses: [] };
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw) as Partial<SaveData>;
    // Fusion avec les valeurs par défaut : un nouveau réglage ajouté plus tard
    // aura sa valeur par défaut chez les joueurs existants.
    return {
      version: VERSION,
      settings: { ...defaultSettings(), ...data.settings },
      quests: data.quests ?? {},
      journal: data.journal ?? [],
      verses: data.verses ?? [],
    };
  } catch {
    // Navigation privée, stockage plein ou JSON abîmé : on repart de zéro sans planter.
    return fresh();
  }
}

export const save: SaveData = load();

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* stockage indisponible : le jeu reste jouable, sans sauvegarde */
  }
}

export function resetProgress(): void {
  save.quests = {};
  save.journal = [];
  save.verses = [];
  persist();
}
