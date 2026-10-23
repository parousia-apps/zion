#!/usr/bin/env node
/**
 * Télécharge les modèles sources listés dans scripts/models.json vers assets-src/models/.
 * À lancer une seule fois (ou après avoir ajouté un modèle) : `npm run models:fetch`.
 * Les fichiers déjà présents ne sont pas retéléchargés.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { models } = JSON.parse(readFileSync(join(root, 'scripts', 'models.json'), 'utf8'));
const out = join(root, 'assets-src', 'models');
mkdirSync(out, { recursive: true });

for (const m of models) {
  const file = join(out, `${m.name}.glb`);
  if (existsSync(file)) continue;
  process.stdout.write(`↓ ${m.name} … `);
  const res = await fetch(m.url);
  if (!res.ok) {
    console.log(`échec (${res.status})`);
    continue;
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log('ok');
}
console.log('Modèles sources prêts dans assets-src/models/.');
