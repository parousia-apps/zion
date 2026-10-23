#!/usr/bin/env node
/**
 * Vérifie la cohérence du contenu (quêtes, mondes, traductions).
 * Lancé automatiquement par `npm run build`, ou à la main : `npm run check:content`.
 *
 * Erreur  = le jeu planterait ou bloquerait (cible inexistante, dialogue manquant…).
 * Alerte  = traduction incomplète (le français sera affiché à la place).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : []);

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const EFFECTS = ['rain', 'rainbow', 'dove', 'harp', 'celebrate', 'glow', 'heal', 'sunset'];
const SOUNDS = ['bleat', 'cry', 'chime', 'thunder', 'drum', 'bell', 'ping'];

const worlds = Object.fromEntries(list(join(root, 'worlds')).map((f) => [f.replace('.json', ''), read(join(root, 'worlds', f))]));
const quests = list(join(root, 'quests')).map((f) => ({ file: f, def: read(join(root, 'quests', f)) }));
const langs = readdirSync(join(root, 'i18n'));
const REF = 'fr';

const text = (lang, kind, id) => {
  const p = join(root, 'i18n', lang, kind, `${id}.json`);
  return existsSync(p) ? read(p) : null;
};

for (const [id, w] of Object.entries(worlds)) {
  if (w.id !== id) err(`worlds/${id}.json : "id" vaut "${w.id}" au lieu de "${id}"`);
}

for (const { file, def } of quests) {
  const where = `quests/${file}`;
  if (`${def.id}.json` !== file) err(`${where} : "id" (${def.id}) doit correspondre au nom du fichier`);
  const ref = text(REF, 'quests', def.id);
  if (!ref) {
    err(`${where} : texte manquant i18n/${REF}/quests/${def.id}.json`);
    continue;
  }
  const stepIds = new Set();
  const dialogKeys = new Set();
  const scrollKeys = new Set();
  def.chapters.forEach((ch, ci) => {
    const w = worlds[ch.world];
    if (!w) return err(`${where} chapitre ${ci + 1} : monde inconnu "${ch.world}"`);
    const entities = new Set([...w.entities, ...(ch.entities ?? [])].map((e) => e.id));
    const zones = new Set([...w.zones, ...(ch.zones ?? [])].map((z) => z.id));
    for (const s of ch.steps) {
      const at = `${where} étape "${s.id}"`;
      if (stepIds.has(s.id)) err(`${at} : id en double`);
      stepIds.add(s.id);
      for (const id of [...(s.show ?? []), ...(s.hide ?? []), ...(s.moves ?? []).map((m) => m.id)]) {
        if (!entities.has(id)) err(`${at} : entité inconnue "${id}"`);
      }
      if ((s.type === 'talk' || s.type === 'interact') && !entities.has(s.target)) err(`${at} : cible inconnue "${s.target}"`);
      if (s.type === 'gather') {
        s.targets.forEach((id) => entities.has(id) || err(`${at} : cible inconnue "${id}"`));
        if (s.beacon && !SOUNDS.includes(s.beacon)) err(`${at} : son de balise inconnu "${s.beacon}"`);
      }
      if ((s.type === 'gather' || s.type === 'reach') && !zones.has(s.zone)) err(`${at} : zone inconnue "${s.zone}"`);
      for (const k of [s.dialog, s.startDialog, s.pickupDialog, ...Object.values(s.pickupDialogs ?? {})]) if (k) dialogKeys.add(k);
      if (s.type === 'scroll') scrollKeys.add(s.scroll);
    }
  });

  for (const k of dialogKeys) if (!ref.dialogs?.[k]) err(`${where} : dialogue "${k}" absent de i18n/${REF}/quests/${def.id}.json`);
  for (const k of scrollKeys) if (!ref.scrolls?.[k]) err(`${where} : parchemin "${k}" absent du texte`);

  for (const [key, lines] of Object.entries(ref.dialogs ?? {})) {
    for (const l of lines) {
      if (l.fx && !EFFECTS.includes(l.fx)) err(`${def.id} dialogue "${key}" : effet inconnu "${l.fx}"`);
      if (l.snd && !SOUNDS.includes(l.snd)) err(`${def.id} dialogue "${key}" : son inconnu "${l.snd}"`);
    }
  }

  // Les autres langues doivent avoir la même structure que le français.
  for (const lang of langs.filter((l) => l !== REF)) {
    const tr = text(lang, 'quests', def.id);
    if (!tr) {
      warn(`[${lang}] quête "${def.id}" non traduite (le français sera utilisé)`);
      continue;
    }
    for (const [key, lines] of Object.entries(ref.dialogs ?? {})) {
      const other = tr.dialogs?.[key];
      if (!other) {
        err(`[${lang}] ${def.id} : dialogue "${key}" manquant`);
        continue;
      }
      if (other.length !== lines.length) err(`[${lang}] ${def.id} : dialogue "${key}" a ${other.length} répliques au lieu de ${lines.length}`);
      lines.forEach((l, i) => {
        const o = other[i];
        if (o && (o.who !== l.who || o.fx !== l.fx || o.snd !== l.snd)) err(`[${lang}] ${def.id} : "${key}" réplique ${i + 1} : who/fx/snd différents du français`);
      });
    }
    for (const key of Object.keys(ref.scrolls ?? {})) if (!tr.scrolls?.[key]) err(`[${lang}] ${def.id} : parchemin "${key}" manquant`);
    for (const key of Object.keys(ref.objectives ?? {})) if (!tr.objectives?.[key]) warn(`[${lang}] ${def.id} : objectif "${key}" manquant`);
  }
}

// Interface : clés présentes en français mais absentes ailleurs.
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const refUi = new Set(flat(read(join(root, 'i18n', REF, 'ui.json'))));
for (const lang of langs.filter((l) => l !== REF)) {
  const p = join(root, 'i18n', lang, 'ui.json');
  if (!existsSync(p)) {
    warn(`[${lang}] ui.json absent`);
    continue;
  }
  const keys = new Set(flat(read(p)));
  for (const k of refUi) if (!keys.has(k)) warn(`[${lang}] ui.json : clé "${k}" manquante`);
  for (const w of Object.keys(worlds)) if (!text(lang, 'worlds', w)) warn(`[${lang}] monde "${w}" non traduit`);
}

for (const w of warnings) console.warn(`⚠️  ${w}`);
for (const e of errors) console.error(`❌ ${e}`);
console.log(`\nContenu : ${quests.length} quêtes, ${Object.keys(worlds).length} mondes, langues : ${langs.join(', ')}.`);
if (errors.length) {
  console.error(`${errors.length} erreur(s).`);
  process.exit(1);
}
console.log(warnings.length ? `OK avec ${warnings.length} alerte(s).` : 'Tout est cohérent ✓');
