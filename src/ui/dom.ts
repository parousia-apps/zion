import { t } from '../core/i18n';

/** Petits utilitaires DOM, sans framework. */

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Élément #${id} introuvable dans index.html`);
  return el as T;
}

/** Échappe le texte avant de l'insérer en HTML (le contenu JSON reste du texte). */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Remplit tous les [data-i18n] (texte) et [data-i18n-aria] (aria-label). */
export function translateDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria!));
  });
}

const live = () => document.getElementById('live');

/** Annonce un message aux lecteurs d'écran (région aria-live). */
export function announce(message: string): void {
  const el = live();
  if (!el) return;
  // Vider puis remplir : force la relecture même si le message est identique.
  el.textContent = '';
  window.setTimeout(() => (el.textContent = message), 50);
}

const SCREENS = ['screen-title', 'screen-setup', 'screen-stories', 'screen-journal', 'screen-game', 'screen-end'];

/** Affiche un écran et met le focus sur son titre (ou l'élément donné). */
export function showScreen(id: string, focus?: HTMLElement): void {
  for (const s of SCREENS) $(s).hidden = s !== id;
  const target = focus ?? $(id).querySelector<HTMLElement>('h1, h2');
  target?.focus({ preventScroll: true });
}

/** Fondu au noir le temps d'un callback (changement de monde). */
export async function fadeThrough(fn: () => void | Promise<void>, calm: boolean): Promise<void> {
  const fade = $('fade');
  if (calm) {
    await fn();
    return;
  }
  fade.classList.add('on');
  await wait(450);
  await fn();
  fade.classList.remove('on');
}

export const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Compteur animé (0 → n). */
export function countUp(el: HTMLElement, to: number, calm: boolean): void {
  if (calm || to === 0) {
    el.textContent = String(to);
    return;
  }
  let n = 0;
  el.textContent = '0';
  const timer = window.setInterval(() => {
    n++;
    el.textContent = String(n);
    if (n >= to) window.clearInterval(timer);
  }, 220);
}

/** Découpe un texte en mots animés un par un (typographie cinétique). */
export function kineticWords(el: HTMLElement, text: string, calm: boolean): void {
  if (calm) {
    el.textContent = text;
    return;
  }
  el.innerHTML = text
    .split(' ')
    .map((w, i) => `<span class="w" style="animation-delay:${Math.min(i * 45, 1500)}ms">${esc(w)}</span>`)
    .join(' ');
}
