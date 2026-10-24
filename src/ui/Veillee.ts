import { questText, t, typo } from '../core/i18n';
import { persist, save } from '../core/save';
import { speech } from '../core/speech';
import { audio } from '../core/audio';
import { $, announce, esc } from './dom';

/**
 * La veillée en famille : un moment à vivre ensemble autour du feu, sur un seul écran.
 *
 * Étapes : combien êtes-vous ? → questions du Gardien, avec un bâton de parole
 * qui passe de joueur en joueur → activité → prière dite ensemble (« Amen ! »)
 * → défi de la famille pour la semaine (rangé dans le carnet).
 *
 * Analogie : un petit « wizard » (formulaire en plusieurs étapes) dont chaque
 * écran est rendu par une fonction ; `step` est l'état, `render()` l'affichage.
 */

/** Couleurs des joueurs (le bâton de parole prend la couleur de celui qui parle). */
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#f2b705', '#8e24aa', '#fb8c00', '#00acc1', '#d81b60'];

type Step = 'count' | 'question' | 'activity' | 'prayer' | 'challenge' | 'end';

export class Veillee {
  private readonly root = $('veillee');
  private readonly stage = $('veillee-stage');
  private questId = '';
  private players = 3;
  private speaker = 0;
  private question = 0;
  private step: Step = 'count';
  private amens = new Set<number>();
  private opener: HTMLElement | null = null;

  constructor() {
    $('veillee-close').addEventListener('click', () => this.close());
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  open(questId: string): void {
    this.questId = questId;
    this.step = 'count';
    this.question = 0;
    this.speaker = 0;
    this.amens.clear();
    this.opener = document.activeElement as HTMLElement | null;
    $('veillee-title').textContent = `${t('veillee.heading')} · ${questText(questId).title}`;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    speech.cancel();
    this.root.hidden = true;
    this.opener?.focus({ preventScroll: true });
  }

  private go(step: Step): void {
    this.step = step;
    this.render();
  }

  /** Le Gardien parle : texte affiché ET lu à voix haute. */
  private say(text: string | string[]): string {
    speech.speak(text);
    const shown = Array.isArray(text) ? text.join(' ') : text;
    return `<p class="v-keeper"><span class="v-keeper-name">${esc(t('journal.keeper'))}</span>${esc(typo(shown))}</p>`;
  }

  private render(): void {
    const life = questText(this.questId).life;
    if (!life) return;
    const s = this.stage;
    switch (this.step) {
      case 'count': {
        s.innerHTML =
          this.say(t('veillee.welcome')) +
          `<p class="v-ask" id="v-count-label">${esc(t('veillee.howMany'))}</p>
           <div class="v-count" role="group" aria-labelledby="v-count-label">
             ${[2, 3, 4, 5, 6, 7, 8].map((n) => `<button class="btn ${n === this.players ? 'btn-primary' : 'btn-light'} v-num" data-n="${n}" aria-pressed="${n === this.players}">${n}</button>`).join('')}
           </div>
           <button class="btn btn-primary btn-xl" id="v-start">${esc(t('veillee.start'))}</button>`;
        s.querySelectorAll<HTMLButtonElement>('.v-num').forEach((b) =>
          b.addEventListener('click', () => {
            this.players = Number(b.dataset.n);
            this.render();
            (s.querySelector(`.v-num[data-n="${this.players}"]`) as HTMLButtonElement | null)?.focus();
          }),
        );
        $('v-start').addEventListener('click', () => this.go('question'));
        break;
      }
      case 'question': {
        const q = life.family[this.question];
        const color = COLORS[this.speaker % COLORS.length];
        const last = this.question === life.family.length - 1;
        s.innerHTML =
          `<p class="v-progress">${esc(t('veillee.questionN', { n: this.question + 1, total: life.family.length }))}</p>` +
          this.say(q) +
          `<div class="v-stick" style="--stick:${color}">
             <span class="v-stick-icon" aria-hidden="true"></span>
             <p aria-live="polite">${esc(t('veillee.stick', { n: this.speaker + 1 }))}</p>
           </div>
           <div class="v-players" aria-hidden="true">${Array.from({ length: this.players }, (_, i) => `<span class="v-player ${i === this.speaker ? 'active' : ''}" style="background:${COLORS[i % COLORS.length]}">${i + 1}</span>`).join('')}</div>
           <div class="life-actions v-actions">
             <button class="btn btn-light" id="v-pass">${esc(t('veillee.pass'))}</button>
             <button class="btn btn-primary" id="v-next">${esc(last ? t('veillee.toActivity') : t('veillee.nextQuestion'))}</button>
           </div>`;
        $('v-pass').addEventListener('click', () => {
          this.speaker = (this.speaker + 1) % this.players;
          audio.play('ping', 0, 0.5);
          announce(t('veillee.stick', { n: this.speaker + 1 }));
          this.render();
          $('v-pass').focus();
        });
        $('v-next').addEventListener('click', () => {
          if (last) return this.go('activity');
          this.question++;
          this.speaker = (this.speaker + 1) % this.players;
          this.render();
          $('v-next').focus();
        });
        break;
      }
      case 'activity':
        s.innerHTML =
          this.say([t('veillee.activityIntro'), life.activity]) +
          `<div class="life-actions v-actions"><button class="btn btn-primary" id="v-next">${esc(t('veillee.toPrayer'))}</button></div>`;
        $('v-next').addEventListener('click', () => this.go('prayer'));
        break;
      case 'prayer': {
        speech.speak([t('veillee.prayerIntro'), life.prayer]);
        s.innerHTML =
          `<p class="v-keeper"><span class="v-keeper-name">${esc(t('journal.keeper'))}</span>${esc(t('veillee.prayerIntro'))}</p>
           <blockquote class="v-prayer">${esc(typo(life.prayer))}</blockquote>
           <p class="v-ask">${esc(t('veillee.amenAsk'))}</p>
           <div class="v-count">${Array.from({ length: this.players }, (_, i) => `<button class="btn v-amen ${this.amens.has(i) ? 'done' : ''}" data-i="${i}" style="--c:${COLORS[i % COLORS.length]}" aria-pressed="${this.amens.has(i)}">${esc(t('veillee.amen'))} ${i + 1}</button>`).join('')}</div>
           <div class="life-actions v-actions"><button class="btn btn-primary" id="v-next" ${this.amens.size < this.players ? 'disabled' : ''}>${esc(t('veillee.toChallenge'))}</button></div>`;
        s.querySelectorAll<HTMLButtonElement>('.v-amen').forEach((b) =>
          b.addEventListener('click', () => {
            this.amens.add(Number(b.dataset.i));
            this.sparks();
            audio.play('chime', 0, 0.5);
            b.classList.add('done');
            b.setAttribute('aria-pressed', 'true');
            if (this.amens.size >= this.players) {
              const next = $<HTMLButtonElement>('v-next');
              next.disabled = false;
              audio.celebrate();
              announce(t('veillee.allAmen'));
              next.focus();
            }
          }),
        );
        $('v-next').addEventListener('click', () => this.go('challenge'));
        break;
      }
      case 'challenge': {
        const already = save.journal.some((j) => j.questId === this.questId && j.family && Date.now() - j.acceptedAt < 7 * 864e5);
        s.innerHTML =
          this.say([t('veillee.challengeIntro'), life.challenge]) +
          `<div class="life-actions v-actions">
             <button class="btn btn-primary" id="v-accept" ${already ? 'disabled' : ''}>${esc(already ? t('life.accepted') : t('veillee.acceptFamily'))}</button>
             <button class="btn btn-light" id="v-next">${esc(t('veillee.finish'))}</button>
           </div>`;
        $('v-accept').addEventListener('click', (e) => {
          save.journal.push({ questId: this.questId, acceptedAt: Date.now(), family: true });
          persist();
          const b = e.currentTarget as HTMLButtonElement;
          b.disabled = true;
          b.textContent = t('life.accepted');
          audio.play('bell');
          announce(t('life.acceptedLong'));
        });
        $('v-next').addEventListener('click', () => this.go('end'));
        break;
      }
      case 'end':
        s.innerHTML =
          this.say(t('veillee.goodbye')) +
          `<div class="life-actions v-actions"><button class="btn btn-primary btn-xl" id="v-done">${esc(t('veillee.close'))}</button></div>`;
        $('v-done').addEventListener('click', () => this.close());
        break;
    }
    // Le focus va au premier bouton de l'étape : on peut tout faire au clavier.
    (s.querySelector('button:not([disabled])') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  /** Des étincelles montent du feu à chaque « Amen ! ». */
  private sparks(): void {
    if (document.documentElement.classList.contains('rm')) return;
    const fire = $('veillee-fire');
    for (let i = 0; i < 8; i++) {
      const sp = document.createElement('span');
      sp.className = 'v-spark';
      sp.style.left = `${40 + Math.random() * 20}%`;
      sp.style.animationDelay = `${Math.random() * 0.3}s`;
      sp.style.setProperty('--dx', `${(Math.random() - 0.5) * 80}px`);
      fire.append(sp);
      window.setTimeout(() => sp.remove(), 1600);
    }
  }
}
