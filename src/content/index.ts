import type { QuestDef, WorldDef } from '../types';

/**
 * Chargement du contenu structurel. Vite inclut automatiquement tout fichier
 * JSON déposé dans quests/ ou worlds/ : ajouter une quête = ajouter un fichier.
 */

const questModules = import.meta.glob<{ default: QuestDef }>('./quests/*.json', { eager: true });
const worldModules = import.meta.glob<{ default: WorldDef }>('./worlds/*.json', { eager: true });

export const QUESTS: QuestDef[] = Object.values(questModules)
  .map((m) => m.default)
  .sort((a, b) => a.order - b.order);

const WORLDS = new Map(Object.values(worldModules).map((m) => [m.default.id, m.default]));

export function getQuest(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

export function getWorld(id: string): WorldDef {
  const w = WORLDS.get(id);
  if (!w) throw new Error(`Monde inconnu : ${id}`);
  return w;
}
