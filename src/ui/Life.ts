import type { QuestText } from '../types';
import { QUESTS } from '../content';
import { currentLanguage, questText, t, typo } from '../core/i18n';
import { persist, save, type JournalEntry } from '../core/save';
import { speech } from '../core/speech';
import { audio } from '../core/audio';
import { $, announce, esc } from './dom';
import { renderIcon } from './illustrations';

/**
 * « La vie après la mission » : tout ce qui prolonge le jeu dans la vraie vie.
 * - Ouvre ta Bible (où trouver le passage, lien de lecture, question du Gardien) ;
 * - une prière ; le défi du veilleur pour la semaine ; le verset à retenir ;
 * - le carnet du veilleur (privé, sans points ni classement) ;
 * - le Gardien qui demande des nouvelles au retour ;
 * - la veillée en famille (voir Veillee.ts).
 *
 * Principe : on ne compte pas les bonnes actions (Matthieu 6.1-4). Le carnet
 * garde des souvenirs, pas un score.
 */

const DAY = 24 * 3600 * 1000;

/** Lien de lecture en ligne, dans une traduction du domaine public. */
function bibleLink(query: string): string {
  const version = currentLanguage().code === 'fr' ? 'LSG' : 'WEB';
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(query)}&version=${version}`;
}

/* ------------------------------------------------------------------ */
/* Écran de fin : « Prolonger la mission »                              */
/* ------------------------------------------------------------------ */

export function renderLife(questId: string, calm: boolean): void {
  const box = $('end-life');
  const text = questText(questId);
  const life = text.life;
  box.hidden = !life;
  if (!life) return;
  const accepted = save.journal.some((j) => j.questId === questId && Date.now() - j.acceptedAt < 7 * DAY);
  box.innerHTML = `
    <h3 class="life-heading">${esc(t('life.heading'))}</h3>
    <div class="life-family">
      <p>${esc(t('veillee.invite'))}</p>
      <button class="btn btn-primary" data-veillee="${questId}"><span aria-hidden="true">🔥</span> ${esc(t('veillee.button'))}</button>
    </div>

    <article class="life-step">
      <h4><span aria-hidden="true">📖</span> ${esc(t('life.bible'))}</h4>
      <p class="life-ref">${esc(life.bibleRef)}</p>
      <p>${esc(typo(life.bibleWhere))}</p>
      <div class="life-actions">
        <button class="btn btn-primary btn-small" id="life-read">${esc(t('life.read'))}</button>
        <a class="btn btn-light btn-small" href="${bibleLink(life.bibleQuery)}" target="_blank" rel="noopener">${esc(t('life.readOnline'))}</a>
      </div>
      <p class="life-question" id="life-question" hidden><strong>${esc(t('life.keeperAsks'))}</strong> ${esc(typo(life.bibleQuestion))}</p>
    </article>

    <article class="life-step">
      <h4><span aria-hidden="true">🙏</span> ${esc(t('life.prayer'))}</h4>
      <p class="life-prayer">${esc(typo(life.prayer))}</p>
      <button class="btn btn-light btn-small" id="life-pray"><span aria-hidden="true">🔊</span> ${esc(t('life.listenPrayer'))}</button>
    </article>

    <article class="life-step">
      <h4><span aria-hidden="true">🌱</span> ${esc(t('life.challenge'))}</h4>
      <p>${esc(typo(life.challenge))}</p>
      <button class="btn btn-primary btn-small" id="life-accept" ${accepted ? 'disabled' : ''}>${esc(accepted ? t('life.accepted') : t('life.accept'))}</button>
    </article>

    <article class="life-step">
      <h4><span aria-hidden="true">✨</span> ${esc(t('life.verse'))}</h4>
      <blockquote class="life-verse">« ${esc(life.verse)} »<cite>${esc(life.verseRef)}</cite></blockquote>
      <button class="btn btn-light btn-small" id="life-learn">${esc(t('life.learn'))}</button>
    </article>

    <p class="life-go">${esc(t('life.goLive'))}</p>`;

  $('life-read').addEventListener('click', () => {
    const q = $('life-question');
    q.hidden = false;
    speech.speak([t('life.keeperAsks'), life.bibleQuestion]);
    q.focus?.();
  });
  $('life-pray').addEventListener('click', () => speech.speak(life.prayer));
  $('life-accept').addEventListener('click', (e) => {
    save.journal.push({ questId, acceptedAt: Date.now() });
    persist();
    const b = e.currentTarget as HTMLButtonElement;
    b.disabled = true;
    b.textContent = t('life.accepted');
    audio.play('chime');
    announce(t('life.acceptedLong'));
  });
  $('life-learn').addEventListener('click', () => openVerseGame(life.verse, life.verseRef, calm));
}

/* ------------------------------------------------------------------ */
/* Jeu du verset : remettre les mots dans l'ordre                       */
/* ------------------------------------------------------------------ */

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Jamais déjà dans l'ordre : sinon il n'y a rien à faire.
  return a.every((v, i) => v === list[i]) && a.length > 1 ? shuffle(list) : a;
}

export function openVerseGame(verse: string, ref: string, calm: boolean): void {
  const dlg = $<HTMLDialogElement>('dlg-verse');
  const words = verse.replace(/[«»]/g, '').split(/\s+/).filter(Boolean);
  let next = 0;
  $('verse-ref').textContent = ref;
  const built = $('verse-built');
  const pool = $('verse-pool');
  const status = $('verse-status');
  built.innerHTML = words.map(() => '<span class="verse-slot" aria-hidden="true">…</span>').join(' ');
  status.textContent = t('life.verseHelp');
  pool.innerHTML = shuffle(words.map((w, i) => ({ w, i })))
    .map(({ w, i }) => `<button class="btn btn-light btn-small verse-word" data-i="${i}">${esc(w)}</button>`)
    .join('');
  pool.querySelectorAll<HTMLButtonElement>('.verse-word').forEach((b) => {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      // On accepte aussi un mot identique placé ailleurs (« et », « de »…).
      if (i === next || words[i] === words[next]) {
        const slot = built.children[next] as HTMLElement;
        slot.textContent = words[next];
        slot.classList.add('filled');
        slot.removeAttribute('aria-hidden');
        b.disabled = true;
        b.classList.add('used');
        next++;
        audio.play('ping', 0, 0.4);
        if (next === words.length) {
          status.textContent = t('life.verseDone');
          if (!save.verses.includes(ref)) save.verses.push(ref);
          persist();
          audio.celebrate();
          speech.speak([verse, ref]);
          announce(t('life.verseDone'));
        }
      } else {
        // Pas d'échec : un petit signe, et on réessaie.
        status.textContent = t('life.verseTry');
        if (!calm) {
          b.classList.remove('shake');
          void b.offsetWidth;
          b.classList.add('shake');
        }
      }
    });
  });
  $('verse-listen').onclick = () => speech.speak([verse, ref]);
  $('verse-close').onclick = () => dlg.close();
  dlg.showModal();
  (pool.querySelector('button') as HTMLButtonElement | null)?.focus();
}

/* ------------------------------------------------------------------ */
/* Le Gardien demande des nouvelles                                      */
/* ------------------------------------------------------------------ */

/** Défi accepté il y a au moins un jour, dont le Gardien n'a pas encore demandé de nouvelles. */
function pendingFollowup(): JournalEntry | undefined {
  return save.journal.find((j) => !j.asked && !j.lived && Date.now() - j.acceptedAt > DAY);
}

export function renderFollowup(onOpenJournal: () => void): void {
  const box = $('followup');
  const entry = pendingFollowup();
  box.hidden = !entry;
  if (!entry) return;
  const text = questText(entry.questId);
  box.innerHTML = `
    <p class="followup-who">${esc(t('journal.keeper'))}</p>
    <p class="followup-q">${esc(typo(text.life?.followup ?? ''))}</p>
    <div class="life-actions">
      <button class="btn btn-primary btn-small" id="fu-yes">${esc(t('journal.yesTell'))}</button>
      <button class="btn btn-light btn-small" id="fu-not">${esc(t('journal.notYet'))}</button>
    </div>
    <p class="note" id="fu-msg" hidden></p>`;
  speech.speak([t('journal.keeper'), text.life?.followup ?? '']);
  $('fu-yes').addEventListener('click', () => {
    entry.asked = true;
    entry.lived = true;
    persist();
    onOpenJournal();
  });
  $('fu-not').addEventListener('click', () => {
    entry.asked = true;
    persist();
    const msg = $('fu-msg');
    msg.hidden = false;
    msg.textContent = t('journal.encourage');
    speech.speak(t('journal.encourage'));
  });
}

/* ------------------------------------------------------------------ */
/* Carnet du veilleur                                                   */
/* ------------------------------------------------------------------ */

export function renderJournal(): void {
  const list = $('journal-list');
  const lang = currentLanguage().code;
  if (!save.journal.length) {
    list.innerHTML = `<li class="journal-empty page">${esc(t('journal.empty'))}</li>`;
  } else {
    list.innerHTML = [...save.journal]
      .map((j, i) => ({ j, i }))
      .reverse()
      .map(({ j, i }) => {
        const q = QUESTS.find((x) => x.id === j.questId);
        const text: QuestText | undefined = questText(j.questId);
        const date = new Date(j.acceptedAt).toLocaleDateString(lang, { day: 'numeric', month: 'long' });
        return `<li class="journal-entry page${j.family ? ' family' : ''}">
          <div class="journal-head"><span class="mini-ill">${q ? renderIcon(q.traitIcon) : ''}</span>
            <div><p class="journal-trait">${esc(text?.trait.name ?? '')}${j.family ? ` · ${esc(t('journal.family'))}` : ''}</p><p class="note">${esc(t('journal.since', { date }))}</p></div></div>
          <p>${esc(typo(text?.life?.challenge ?? ''))}</p>
          <label class="switch"><input type="checkbox" role="switch" data-lived="${i}" ${j.lived ? 'checked' : ''}/><span>${esc(t('journal.lived'))}</span></label>
          <label class="field"><span>${esc(t('journal.tell'))}</span><textarea data-note="${i}" rows="3" placeholder="${esc(t('journal.placeholder'))}">${esc(j.note ?? '')}</textarea></label>
        </li>`;
      })
      .join('');
  }
  list.querySelectorAll<HTMLInputElement>('input[data-lived]').forEach((c) =>
    c.addEventListener('change', () => {
      save.journal[Number(c.dataset.lived)].lived = c.checked;
      persist();
    }),
  );
  list.querySelectorAll<HTMLTextAreaElement>('textarea[data-note]').forEach((ta) =>
    ta.addEventListener('input', () => {
      save.journal[Number(ta.dataset.note)].note = ta.value;
      persist();
    }),
  );
  $('journal-verses').innerHTML = save.verses.length
    ? save.verses.map((v) => `<li>✨ ${esc(v)}</li>`).join('')
    : `<li class="note">${esc(t('journal.noVerse'))}</li>`;
}
