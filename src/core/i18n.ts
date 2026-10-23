import type { QuestText, WorldText } from '../types';

/**
 * Traductions.
 *
 * Chaque langue est un dossier dans src/content/i18n/<code>/ :
 *   ui.json             -> textes de l'interface (menus, boutons)
 *   quests/<id>.json    -> textes d'une quête
 *   worlds/<id>.json    -> noms des lieux et habitants d'un monde
 *
 * Pour ajouter une langue : copier le dossier "fr", traduire les valeurs,
 * puis ajouter une ligne dans LANGUAGES ci-dessous. Si une clé manque,
 * le français est utilisé à la place (repli).
 */

export interface Language {
  code: string;
  /** Nom de la langue écrit dans cette langue. */
  label: string;
  /** Code BCP 47 pour la synthèse vocale. */
  speech: string;
}

export const LANGUAGES: Language[] = [
  { code: 'fr', label: 'Français', speech: 'fr-FR' },
  { code: 'en', label: 'English', speech: 'en-GB' },
  // Exemples à décommenter quand les traductions existeront :
  // { code: 'fon', label: 'Fɔngbè', speech: 'fon' },
  // { code: 'yo', label: 'Yorùbá', speech: 'yo-NG' },
  // { code: 'ln', label: 'Lingála', speech: 'ln' },
];

const FALLBACK = 'fr';

type Dict = { [key: string]: string | Dict };
type Loader<T> = () => Promise<{ default: T }>;

// Vite découpe chaque fichier en morceau chargé à la demande :
// le joueur ne télécharge que la langue qu'il utilise.
const uiFiles = import.meta.glob<{ default: Dict }>('../content/i18n/*/ui.json');
const questFiles = import.meta.glob<{ default: QuestText }>('../content/i18n/*/quests/*.json');
const worldFiles = import.meta.glob<{ default: WorldText }>('../content/i18n/*/worlds/*.json');

let current = FALLBACK;
let ui: Dict = {};
let uiFallback: Dict = {};
let quests: Record<string, QuestText> = {};
let worlds: Record<string, WorldText> = {};

async function loadGroup<T>(files: Record<string, Loader<T>>, lang: string): Promise<Record<string, T>> {
  const out: Record<string, T> = {};
  const prefix = `../content/i18n/${lang}/`;
  await Promise.all(
    Object.entries(files)
      .filter(([path]) => path.startsWith(prefix))
      .map(async ([path, load]) => {
        const id = path.split('/').pop()!.replace('.json', '');
        out[id] = (await load()).default;
      }),
  );
  return out;
}

export async function setLanguage(code: string): Promise<void> {
  const lang = LANGUAGES.some((l) => l.code === code) ? code : FALLBACK;
  const [uiDict, fbDict, q, w, qFb, wFb] = await Promise.all([
    uiFiles[`../content/i18n/${lang}/ui.json`]?.().then((m) => m.default) ?? Promise.resolve({}),
    uiFiles[`../content/i18n/${FALLBACK}/ui.json`]().then((m) => m.default),
    loadGroup(questFiles, lang),
    loadGroup(worldFiles, lang),
    lang === FALLBACK ? Promise.resolve({}) : loadGroup(questFiles, FALLBACK),
    lang === FALLBACK ? Promise.resolve({}) : loadGroup(worldFiles, FALLBACK),
  ]);
  current = lang;
  ui = uiDict;
  uiFallback = fbDict;
  // Une quête pas encore traduite s'affiche en français plutôt que de manquer.
  quests = { ...qFb, ...q };
  worlds = { ...wFb, ...w };
}

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Typographie française : espace fine insécable avant « ! ? : ; » et dans les
 * guillemets, pour que la ponctuation ne passe jamais seule à la ligne.
 */
export function typo(text: string): string {
  return text.replace(/ ([!?:;»])/g, '\u202F$1').replace(/« /g, '«\u202F');
}

/** Texte d'interface. t('menu.play') ; t('hud.count', { done: 2, total: 6 }) */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = lookup(ui, key) ?? lookup(uiFallback, key) ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return typo(s);
}

export function questText(id: string): QuestText {
  return quests[id];
}

export function worldText(id: string): WorldText {
  return worlds[id] ?? { name: id, names: {} };
}

export function currentLanguage(): Language {
  return LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0];
}
