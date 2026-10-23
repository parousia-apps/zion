import { describe, expect, it } from 'vitest';
import { QuestRunner, TRAIT_KEY, scrollKey } from './QuestRunner';
import type { QuestDef } from '../types';

const quest: QuestDef = {
  id: 'test',
  order: 1,
  icon: '⭐',
  traitIcon: '❤️',
  color: '#000',
  chapters: [
    {
      world: 'zion',
      steps: [
        { id: 'hello', type: 'talk', target: 'gardien', dialog: 'welcome' },
        { id: 'story', type: 'scroll', scroll: 'story' },
      ],
    },
    {
      world: 'noe',
      steps: [
        { id: 'animals', type: 'gather', targets: ['a', 'b'], zone: 'arche', pickupDialog: 'pick' },
        { id: 'board', type: 'reach', zone: 'arche' },
        { id: 'trait', type: 'trait' },
      ],
    },
  ],
};

const kinds = (actions: { kind: string }[]) => actions.map((a) => a.kind);

describe('QuestRunner', () => {
  it('démarre sur le premier chapitre et la première étape', () => {
    const r = new QuestRunner(quest);
    expect(kinds(r.start())).toEqual(['chapter', 'step']);
    expect(r.step.id).toBe('hello');
  });

  it("ignore l'action sur une entité qui n'est pas la cible", () => {
    const r = new QuestRunner(quest);
    r.start();
    expect(r.act('quelquun')).toEqual([]);
  });

  it('parler à la cible lance le dialogue, et sa fin passe à l’étape suivante', () => {
    const r = new QuestRunner(quest);
    r.start();
    expect(r.act('gardien')).toEqual([{ kind: 'dialog', key: 'welcome' }]);
    expect(r.busy).toBe(true);
    // pendant le dialogue, une deuxième action est ignorée
    expect(r.act('gardien')).toEqual([]);
    const next = r.done('welcome');
    expect(kinds(next)).toEqual(['step', 'scroll']);
    expect(r.step.id).toBe('story');
  });

  it('change de chapitre quand on passe dans un autre monde', () => {
    const r = new QuestRunner(quest, 1);
    r.start();
    const next = r.done(scrollKey('story'));
    expect(next[0]).toEqual({ kind: 'chapter', index: 1 });
    expect(r.step.id).toBe('animals');
  });

  it('gather : les entités suivent puis sont livrées dans la zone', () => {
    const r = new QuestRunner(quest, 2);
    r.start();
    expect(kinds(r.touch('a'))).toEqual(['follow', 'dialog']); // dialogue au premier ramassage
    r.done('pick');
    expect(r.touch('a')).toEqual([]); // déjà en train de suivre
    expect(r.enterZone('ailleurs')).toEqual([]);
    const delivered = r.enterZone('arche');
    expect(delivered).toContainEqual({ kind: 'deliver', id: 'a', zone: 'arche' });
    expect(delivered).toContainEqual({ kind: 'progress', done: 1, total: 2 });
    expect(r.step.id).toBe('animals');
    expect(kinds(r.touch('b'))).toEqual(['follow']); // pas de dialogue la 2e fois
    const last = r.enterZone('arche');
    expect(r.step.id).toBe('board');
    expect(kinds(last)).toContain('step');
  });

  it('gather : un dialogue propre à une cible précise', () => {
    const q: QuestDef = {
      ...quest,
      chapters: [{ world: 'zion', steps: [{ id: 'g', type: 'gather', targets: ['a', 'b'], zone: 'z', pickupDialogs: { b: 'hello-b' } }] }],
    };
    const r = new QuestRunner(q);
    r.start();
    expect(kinds(r.touch('a'))).toEqual(['follow']);
    expect(r.touch('b')).toContainEqual({ kind: 'dialog', key: 'hello-b' });
  });

  it('reach sans dialogue enchaîne directement', () => {
    const r = new QuestRunner(quest, 3);
    r.start();
    expect(kinds(r.enterZone('arche'))).toEqual(['step', 'trait']);
  });

  it('la dernière étape termine la quête', () => {
    const r = new QuestRunner(quest, 4);
    r.start();
    expect(r.done(TRAIT_KEY)).toEqual([{ kind: 'complete' }]);
    expect(r.finished).toBe(true);
  });

  it("restaure l'historique du chapitre courant", () => {
    const r = new QuestRunner(quest, 3);
    expect(r.historyInChapter().map((s) => s.id)).toEqual(['animals']);
  });
});
