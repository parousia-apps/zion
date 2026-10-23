#!/usr/bin/env node
/**
 * Optimise les modèles de assets-src/models/ vers public/models/ : `npm run models:build`.
 *
 * Analogie : c'est imagemin pour la 3D.
 * - on supprime les animations inutiles (un personnage en a 24, on en garde 4) ;
 * - on fusionne les données en double et on supprime ce qui ne sert pas ;
 * - on réduit les textures à 512 px maximum ;
 * - on compresse la géométrie (extension meshopt, décodée par Three.js).
 */
import { readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, resample, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { models } = JSON.parse(readFileSync(join(root, 'scripts', 'models.json'), 'utf8'));
const src = join(root, 'assets-src', 'models');
const out = join(root, 'public', 'models');
mkdirSync(out, { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('⚠️  sharp indisponible : les textures ne seront pas redimensionnées.');
}

let before = 0;
let after = 0;
for (const m of models) {
  const input = join(src, `${m.name}.glb`);
  try {
    statSync(input);
  } catch {
    console.warn(`⚠️  ${m.name} absent : lance d'abord npm run models:fetch`);
    continue;
  }
  const doc = await io.read(input);
  const keep = m.animations ? new RegExp(m.animations) : null;
  for (const anim of doc.getRoot().listAnimations()) {
    if (!keep || !keep.test(anim.getName())) anim.dispose();
  }
  const transforms = [dedup(), prune(), weld(), resample(), quantize()];
  if (sharp) transforms.push(textureCompress({ encoder: sharp, resize: [512, 512], targetFormat: 'webp' }));
  transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...transforms);
  const target = join(out, `${m.name}.glb`);
  await io.write(target, doc);
  const a = statSync(input).size;
  const b = statSync(target).size;
  before += a;
  after += b;
  console.log(`${m.name.padEnd(14)} ${(a / 1024).toFixed(0).padStart(6)} Ko → ${(b / 1024).toFixed(0).padStart(5)} Ko`);
}
console.log(`\nTotal : ${(before / 1048576).toFixed(1)} Mo → ${(after / 1048576).toFixed(1)} Mo`);
readdirSync(out);
