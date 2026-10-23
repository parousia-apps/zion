import { t, typo } from '../core/i18n';
import { $, announce } from './dom';

/**
 * Affichage tête haute pendant le jeu : objectif, compteur, bouton d'action,
 * sous-titres des bruitages et messages courts (toast).
 */
export class Hud {
  private readonly objective = $('objective');
  private readonly objectiveText = $('objective-text');
  private readonly counter = $('counter');
  private readonly action = $<HTMLButtonElement>('btn-action');
  private readonly captions = $('captions');
  private readonly toastEl = $('toast');
  private toastTimer = 0;
  private actionLabel = '';
  captionsOn = true;

  setObjective(text: string | null): void {
    if (!text) {
      this.objective.hidden = true;
      return;
    }
    this.objective.hidden = false;
    this.objectiveText.textContent = typo(text);
    this.objective.classList.remove('changed');
    void this.objective.offsetWidth;
    this.objective.classList.add('changed');
  }

  setCounter(done: number, total: number): void {
    this.counter.hidden = total === 0;
    this.counter.textContent = t('hud.count', { done, total });
    this.counter.setAttribute('aria-label', t('announce.delivered', { done, total }));
    this.counter.classList.remove('bump');
    void this.counter.offsetWidth;
    this.counter.classList.add('bump');
  }

  /** Affiche (ou cache) le gros bouton d'action avec son verbe. */
  setAction(label: string | null): void {
    if (label === this.actionLabel) return;
    this.actionLabel = label ?? '';
    this.action.hidden = !label;
    if (label) {
      this.action.innerHTML = '';
      this.action.append(label);
      const key = document.createElement('span');
      key.className = 'action-key';
      key.setAttribute('aria-hidden', 'true');
      key.textContent = t('hud.actionKey');
      this.action.append(key);
    }
  }

  /** Sous-titre de bruitage, ex. « [Bêlement, à gauche] ». */
  caption(text: string, ms = 3500): void {
    if (!this.captionsOn) return;
    const el = document.createElement('div');
    el.className = 'caption';
    el.textContent = text;
    this.captions.append(el);
    while (this.captions.children.length > 3) this.captions.firstElementChild?.remove();
    window.setTimeout(() => el.remove(), ms);
  }

  /** Message bref, affiché ET annoncé aux lecteurs d'écran. */
  toast(text: string, ms = 3500): void {
    // Les noms commencent parfois par un article (« l'éléphante te suit ») : majuscule en tête de phrase.
    text = typo(text.charAt(0).toUpperCase() + text.slice(1));
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
    announce(text);
  }

  setSouvenir(label: string | null): void {
    $('souvenir-frame').hidden = !label;
    const el = $('souvenir-label');
    el.hidden = !label;
    el.textContent = label ?? '';
  }

  setGuiding(on: boolean): void {
    const btn = $('btn-guide');
    btn.setAttribute('aria-pressed', String(on));
    $('guide-label').textContent = on ? t('hud.stopGuide') : t('hud.guide');
  }

  /** Barre de chargement des modèles 3D (cachée quand tout est prêt). */
  loading(done: number, total: number): void {
    const box = $('loading');
    const pct = total ? Math.round((done / total) * 100) : 100;
    box.hidden = done >= total;
    $('loading-pct').textContent = String(pct);
    $('loading-fill').style.width = `${pct}%`;
  }

  reset(): void {
    this.setObjective(null);
    this.counter.hidden = true;
    this.setAction(null);
    this.captions.innerHTML = '';
    this.setSouvenir(null);
    this.setGuiding(false);
  }
}
