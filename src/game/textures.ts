import * as THREE from 'three';

/**
 * Textures dessinées en code sur un <canvas> : enduit, pierre, pavés, bois, herbe.
 *
 * Analogie : au lieu de télécharger des images JPG, on les « peint » au
 * démarrage avec l'API Canvas 2D (fillRect, arc...). Zéro octet à télécharger,
 * et chaque texture est créée une seule fois puis réutilisée.
 *
 * Un générateur aléatoire « à graine » (seeded) garantit que la même texture
 * est identique à chaque partie.
 */

const cache = new Map<string, THREE.CanvasTexture>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let seed = 0;
  for (const c of key) seed = (seed * 31 + c.charCodeAt(0)) | 0;
  draw(ctx, rng(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Variation légère d'une couleur (pour éviter les aplats « plastique »). */
function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

/** Taches douces : donnent un aspect de matière naturelle. */
function mottle(ctx: CanvasRenderingContext2D, rand: () => number, size: number, color: string, count: number, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const r = 2 + rand() * size * 0.06;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Enduit à la chaux, légèrement irrégulier. */
export function plaster(color = '#f3f1ec'): THREE.CanvasTexture {
  return make(`plaster${color}`, 256, (ctx, rand) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
    mottle(ctx, rand, 256, shade(color, -0.08), 140, 0.12);
    mottle(ctx, rand, 256, shade(color, 0.05), 120, 0.15);
    // Petites fissures
    ctx.strokeStyle = shade(color, -0.2);
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = rand() * 256;
      let y = rand() * 256;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (rand() - 0.5) * 30;
        y += rand() * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

/** Pierre de taille : rangées de blocs avec joints. */
export function stone(color = '#cbbfae'): THREE.CanvasTexture {
  return make(`stone${color}`, 256, (ctx, rand) => {
    ctx.fillStyle = shade(color, -0.25);
    ctx.fillRect(0, 0, 256, 256);
    const rows = 8;
    const h = 256 / rows;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -h * 0.8 : 0;
      while (x < 256) {
        const w = h * (1.2 + rand() * 1.2);
        ctx.fillStyle = shade(color, (rand() - 0.5) * 0.12);
        ctx.fillRect(x + 2, r * h + 2, w - 4, h - 4);
        x += w;
      }
    }
    mottle(ctx, rand, 256, shade(color, -0.15), 160, 0.15);
  });
}

/** Pavés irréguliers pour les places et les rues. */
export function paving(color = '#d9c7a3'): THREE.CanvasTexture {
  return make(`paving${color}`, 256, (ctx, rand) => {
    ctx.fillStyle = shade(color, -0.22);
    ctx.fillRect(0, 0, 256, 256);
    const n = 8;
    const s = 256 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = shade(color, (rand() - 0.5) * 0.14);
        const jx = (rand() - 0.5) * 4;
        const jy = (rand() - 0.5) * 4;
        ctx.beginPath();
        ctx.roundRect(i * s + 2 + jx, j * s + 2 + jy, s - 4, s - 4, 5);
        ctx.fill();
      }
    }
    mottle(ctx, rand, 256, shade(color, -0.1), 80, 0.12);
  });
}

/** Planches de bois. */
export function wood(color = '#8b5a2b'): THREE.CanvasTexture {
  return make(`wood${color}`, 256, (ctx, rand) => {
    const planks = 6;
    const w = 256 / planks;
    for (let i = 0; i < planks; i++) {
      ctx.fillStyle = shade(color, (rand() - 0.5) * 0.12);
      ctx.fillRect(i * w, 0, w, 256);
      ctx.strokeStyle = shade(color, -0.12);
      ctx.globalAlpha = 0.4;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        const x = i * w + rand() * w;
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 4, 80, x - 4, 170, x + 2, 256);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade(color, -0.3);
      ctx.fillRect(i * w, 0, 2, 256);
    }
  });
}

/** Herbe vue de haut : variations de verts et brins. */
export function grass(color = '#6fbf4a'): THREE.CanvasTexture {
  return make(`grass${color}`, 512, (ctx, rand) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 512);
    mottle(ctx, rand, 512, shade(color, -0.1), 300, 0.18);
    mottle(ctx, rand, 512, shade(color, 0.08), 260, 0.16);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 1800; i++) {
      const x = rand() * 512;
      const y = rand() * 512;
      ctx.strokeStyle = shade(color, (rand() - 0.5) * 0.25);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 4, y - 4 - rand() * 5);
      ctx.stroke();
    }
  });
}

/** Terre / sable des chemins. */
export function dirt(color = '#d8b27a'): THREE.CanvasTexture {
  return make(`dirt${color}`, 256, (ctx, rand) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
    mottle(ctx, rand, 256, shade(color, -0.12), 200, 0.2);
    mottle(ctx, rand, 256, shade(color, 0.08), 200, 0.2);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = shade(color, (rand() - 0.5) * 0.3);
      ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
  });
}

/** Tissu rayé (auvents, tentures). */
export function cloth(a: string, b: string): THREE.CanvasTexture {
  return make(`cloth${a}${b}`, 128, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? a : b;
      ctx.fillRect(i * 16, 0, 16, 128);
    }
  });
}

/** Matériau texturé répété `rx × ry` fois (les textures sont partagées, pas les répétitions). */
export function texturedMaterial(tex: THREE.Texture, rx = 1, ry = 1, opts: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return new THREE.MeshLambertMaterial({ map: t, ...opts });
}
