import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Chargement des modèles 3D (.glb) de public/models/.
 *
 * Analogie : un cache de fetch. Chaque fichier n'est téléchargé qu'une seule
 * fois ; ensuite on en fabrique autant de copies que nécessaire (instance()).
 * Les modèles sont compressés avec meshopt (voir scripts/optimize-models.mjs),
 * d'où le MeshoptDecoder.
 */

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const pending = new Map<string, Promise<GLTF | null>>();
const loaded = new Map<string, GLTF>();
const base = `${import.meta.env.BASE_URL}models/`;

function load(name: string): Promise<GLTF | null> {
  let p = pending.get(name);
  if (!p) {
    p = loader
      .loadAsync(`${base}${name}.glb`)
      .then((gltf) => {
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        loaded.set(name, gltf);
        return gltf;
      })
      // Un modèle manquant ne doit jamais bloquer le jeu : on utilisera la forme de secours.
      .catch((err) => {
        console.warn(`[Zion] modèle ${name} indisponible`, err);
        return null;
      });
    pending.set(name, p);
  }
  return p;
}

/** Charge une liste de modèles ; onProgress(fait, total) pour la barre de chargement. */
export async function preload(names: Iterable<string>, onProgress?: (done: number, total: number) => void): Promise<void> {
  const list = [...new Set(names)];
  let done = 0;
  onProgress?.(0, list.length);
  await Promise.all(
    list.map((n) =>
      load(n).then(() => {
        done++;
        onProgress?.(done, list.length);
      }),
    ),
  );
}

export function isLoaded(name: string): boolean {
  return loaded.has(name);
}

export interface ModelInstance {
  obj: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** Une copie indépendante d'un modèle chargé (null s'il n'est pas chargé). */
export function instance(name: string): ModelInstance | null {
  const gltf = loaded.get(name);
  if (!gltf) return null;
  const obj = new THREE.Group();
  // SkeletonUtils.clone recopie aussi les squelettes : chaque personnage s'anime seul.
  obj.add(gltf.animations.length ? cloneSkinned(gltf.scene) : gltf.scene.clone());
  return { obj, clips: gltf.animations };
}

/** Récupère les maillages d'un modèle chargé (pour l'instanciation de l'herbe, etc.). */
export function meshesOf(name: string): THREE.Mesh[] {
  const gltf = loaded.get(name);
  if (!gltf) return [];
  const out: THREE.Mesh[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}
