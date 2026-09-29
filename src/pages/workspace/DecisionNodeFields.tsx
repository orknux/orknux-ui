import { useRef } from 'react';
import type { DecisionOption, DecisionQuestion, DecisionQuestionKind } from '../../api/graph';
import type { Model } from '../../api/models';
import { DefinitionPicker } from '../../components/DefinitionPicker';
import { FieldHint } from '../../components/FieldHint';
import editor from './WorkflowEditorPage.module.css';
import styles from './DecisionNodeFields.module.css';
import { TrashIcon } from '../../components/TrashIcon';
import { t, tf } from '../../i18n';

/**
 * What a decision node asks: the model, the questions, which one branches, and
 * how sure an answer has to be to be taken. Issue #577.
 *
 * Its own file for the reason the retry panel has one: the editor is a canvas,
 * and a list of questions each holding a list of options is a form of its own.
 */

/** What the panel edits. A subset of the node, so the editor can hand it a draft. */
export interface DecisionDraft {
  decisionModelId?: string | null;
  decisionQuestions?: DecisionQuestion[];
  decisionBranchQuestion?: string | null;
  decisionThreshold?: number | null;
}

export type DecisionPatch = Partial<DecisionDraft>;

interface DecisionNodeFieldsProps {
  draft: DecisionDraft;
  /** The workspace's decision and chat models, enabled ones only; either kind answers. */
  models: Model[];
  onChange: (patch: DecisionPatch) => void;
}

const KINDS: DecisionQuestionKind[] = ['CHOICE', 'SCORE', 'NOUL'];

function kindLabel(kind: DecisionQuestionKind): string {
  switch (kind) {
    case 'CHOICE':
      return t('Choice');
    case 'SCORE':
      return t('Score');
    case 'NOUL':
      return t('Yes or no');
  }
}

/** A key a later node can point at: the same rule the server refuses by. */
function keyable(typed: string): string {
  return typed.replace(/[^A-Za-z0-9_]/g, '');
}

/** The next free `question`, `question2`, … on this node. */
function nextKey(questions: DecisionQuestion[]): string {
  const taken = new Set(questions.map((question) => question.key));
  for (let n = 1; ; n += 1) {
    const key = n === 1 ? 'question' : `question${n}`;
    if (!taken.has(key)) return key;
  }
}

/** What a new choice or score starts with: two rows, since fewer is nothing to choose between. */
function twoRows(): DecisionOption[] {
  return [
    { name: '', description: '' },
    { name: '', description: '' },
  ];
}

/** What the question box asks for, in the words of the kind. */
function prompted(kind: DecisionQuestionKind): string {
  switch (kind) {
    case 'CHOICE':
      return t('What should the model choose?');
    case 'SCORE':
      return t('What should the model rate?');
    case 'NOUL':
      return t('What should the model judge true or false?');
  }
}

/** A choice's or score's rows as drawn: never fewer than two, since fewer is nothing to choose between. */
function padded(question: DecisionQuestion): DecisionOption[] {
  if (question.kind === 'NOUL' || question.options.length >= 2) return question.options;
  return [...question.options, ...twoRows()].slice(0, 2);
}

/**
 * A key made from the wording: its first few words, lower case, joined by
 * underscores, and numbered where another question has it. Empty where the
 * wording has no word to make one from.
 */
function slugged(instructions: string, taken: string[]): string {
  const words = instructions.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  let base = words.slice(0, 4).join('_');
  if (base === '') return '';
  if (/^[0-9]/.test(base)) base = `q_${base}`;
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}${n}`;
  return key;
}

/*
 * Whether a key is still one the wording made rather than one somebody chose:
 * the `question` a card starts with, the slug of its wording, or a slug the
 * wording has since grown past - a key frozen partway through typing, which is
 * what the old check left behind and a reload then kept for good.
 */
function madeByWording(key: string, instructions: string, taken: string[]): boolean {
  if (/^question\d*$/.test(key)) return true;
  const slug = slugged(instructions, taken);
  return slug !== '' && (key === slug || slug.startsWith(key) || key.startsWith(slug));
}

/** Where a later node finds the answer: under the key, in the field its kind answers with. */
function readAs(question: DecisionQuestion): string {
  const field = question.kind === 'CHOICE' ? 'choice' : question.kind === 'SCORE' ? 'score' : 'noul';
  return `${question.key || '…'}.${field}`;
}

/** A noul's two sides, keyed as its criteria are; what the model reads for each. */
function side(question: DecisionQuestion, name: 'true' | 'false'): string {
  return question.options.find((option) => option.name === name)?.description ?? '';
}

export function DecisionNodeFields({ draft, models, onChange }: DecisionNodeFieldsProps) {
  const questions = draft.decisionQuestions ?? [];
  const branch = draft.decisionBranchQuestion ?? null;
  // What the node can branch on: a choice, by its options, or a yes-or-no, by Yes and No.
  const choices = questions.filter((question) => branchable(question.kind));

  /*
   * Which cards' keys somebody typed. Decided once per card, from the key it had
   * when first seen, then kept here rather than worked out again on every
   * keystroke: the check it replaced compared the key with the wording, and
   * typing fast the wording it read lagged a letter behind, the two stopped
   * matching, and the key froze - "rate_questi". Remounted per node.
   */
  const chosen = useRef<Map<number, boolean>>(new Map());
  const keyChosen = (index: number): boolean => {
    const known = chosen.current.get(index);
    if (known !== undefined) return known;
    const question = questions[index];
    const others = questions.filter((_, at) => at !== index).map((held) => held.key);
    const decided = !madeByWording(question.key, question.instructions, others);
    chosen.current.set(index, decided);
    return decided;
  };

  function put(index: number, changed: DecisionQuestion) {
    const was = questions[index];
    const next = questions.map((held, at) => (at === index ? changed : held));
    // The branch follows its question through a rename, and lets go of one
    // that stopped being a choice - only a choice has options to leave by.
    let branching = branch;
    if (was.key === branch) branching = branchable(changed.kind) ? changed.key : null;
    onChange({ decisionQuestions: next, decisionBranchQuestion: branching });
  }

  function remove(index: number) {
    const gone = questions[index];
    // The cards after it move up one, and what is known of their keys with them.
    chosen.current = new Map(
      [...chosen.current].filter(([at]) => at !== index).map(([at, was]) => [at > index ? at - 1 : at, was]),
    );
    onChange({
      decisionQuestions: questions.filter((_, at) => at !== index),
      decisionBranchQuestion: gone.key === branch ? null : branch,
    });
  }

  // Against the rows as drawn, so typing into one of the two a list is padded to keeps it.
  function putOption(index: number, at: number, option: DecisionOption) {
    const question = questions[index];
    put(index, { ...question, options: padded(question).map((held, n) => (n === at ? option : held)) });
  }

  /*
   * The question's wording, and its key with it while the key is still one
   * nobody chose - the `question` a new card starts with, or what the wording
   * came to before - so most people never have to touch the key at all.
   */
  function ask(index: number, instructions: string) {
    const question = questions[index];
    const others = questions.filter((_, at) => at !== index).map((held) => held.key);
    const key = keyChosen(index) ? question.key : slugged(instructions, others) || question.key;
    put(index, { ...question, instructions, key });
  }

  /** The key made from the wording again, and following it from here on. */
  function followWording(index: number) {
    const question = questions[index];
    const others = questions.filter((_, at) => at !== index).map((held) => held.key);
    chosen.current.set(index, false);
    put(index, { ...question, key: slugged(question.instructions, others) || nextKey(questions) });
  }

  function putSide(index: number, name: 'true' | 'false', description: string) {
    const question = questions[index];
    const other = question.options.filter((option) => option.name !== name && (option.name === 'true' || option.name === 'false'));
    put(index, { ...question, options: [...other, { name, description }] });
  }

  return (
    <>
      <div className={editor.field}>
        <span className={editor.labelWithHint}>
          <label className={editor.label} htmlFor="node-decision-model">
            {t('Model')}
          </label>
          <FieldHint label={t('Model')}>
            {t('Either kind works: a decision model (Jev, Laya) is faster and calibrated; a chat model works with any provider, but its probabilities are its own estimate.')}
          </FieldHint>
        </span>
        <DefinitionPicker
          id="node-decision-model"
          value={draft.decisionModelId ?? ''}
          options={[...models]
            // Decision models first: they are what the node was made for.
            .sort((left, right) => Number(right.kind === 'DECISION') - Number(left.kind === 'DECISION'))
            .map((model) => ({
              value: model.id,
              label: model.name,
              hint: model.kind === 'DECISION' ? t('Decision model') : t('Chat model'),
            }))}
          onChoose={(chosen) => onChange({ decisionModelId: chosen || null })}
          placeholder={models.length === 0 ? t('This workspace has no decision or chat model') : t('Choose a model…')}
          searchPlaceholder={t('Search models…')}
        />
      </div>

      <div className={editor.field} data-testid="decision-questions">
        <span className={editor.labelRow}>
          <span className={editor.labelWithHint}>
            <span className={editor.label}>{t('Questions')}</span>
            <FieldHint label={t('Questions')}>
              <p>
                {t('Each answer comes back under its key with its probabilities, for later nodes to read. A choice picks one option, a score places the state on levels lowest first, and yes or no gives the probability a statement holds.')}
              </p>
            </FieldHint>
          </span>
          <button
            type="button"
            className={editor.parameterSync}
            onClick={() =>
              onChange({
                decisionQuestions: [
                  ...questions,
                  // Two empty options to fill, so a choice looks like one from the start.
                  { key: nextKey(questions), kind: 'CHOICE', instructions: '', options: twoRows() },
                ],
              })
            }
          >
            {t('+ Add question')}
          </button>
        </span>

        {questions.length === 0 && <p className={editor.fieldNote}>{t('No questions yet, so this node asks nothing.')}</p>}

        {questions.map((question, index) => {
          const rows = padded(question);
          return (
            /*
              Read top to bottom as a question: what kind it is, what is
              asked, what the answers are, and last - demoted, since most
              people never touch it - the key its answer is read under.
            */
            <div className={styles.question} key={index} data-testid="decision-question">
              <div className={styles.questionHead}>
                <div className={styles.segments} role="radiogroup" aria-label={t('Kind')} data-testid="decision-kind">
                  {KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={question.kind === kind}
                      className={`${styles.segment} ${question.kind === kind ? styles.segmentOn : ''}`}
                      onClick={() => {
                        if (kind === question.kind) return;
                        // A yes-or-no has its two fixed sides and nothing else;
                        // a choice and a score share a list, so one kept moving
                        // between them keeps what it had.
                        const kept = kind === 'NOUL' || question.kind === 'NOUL' ? [] : question.options;
                        put(index, { ...question, kind, options: kept });
                      }}
                    >
                      {kindLabel(kind)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={t('Remove question')}
                  title={t('Remove question')}
                  onClick={() => remove(index)}
                >
                  <TrashIcon />
                </button>
              </div>

              <label className={styles.control}>
                <span className={styles.controlLabel}>{question.kind === 'NOUL' ? t('Statement') : t('Question')}</span>
                <input
                  className={`${editor.input} ${styles.box}`}
                  value={question.instructions}
                  placeholder={prompted(question.kind)}
                  data-testid="decision-asked"
                  onChange={(event) => ask(index, event.target.value)}
                />
              </label>

              <div className={styles.control} data-testid="decision-answers">
                <span className={styles.controlLabel}>
                  {question.kind === 'NOUL' ? t('Answers') : question.kind === 'SCORE' ? t('Levels, lowest first') : t('Options')}
                </span>
                {question.kind === 'NOUL' ? (
                  /*
                    Two fixed answers, each tagged with its word, so it reads
                    as a table of Yes and No and not as a list to fill in.
                  */
                  <div className={styles.options}>
                    {(['true', 'false'] as const).map((name) => (
                      <div className={styles.option} key={name}>
                        <span className={styles.sideTag} data-testid="decision-side">
                          {name === 'true' ? t('Yes') : t('No')}
                        </span>
                        <input
                          className={`${editor.input} ${styles.box}`}
                          value={side(question, name)}
                          placeholder={name === 'true' ? t('What yes means (optional)') : t('What no means (optional)')}
                          aria-label={name === 'true' ? t('What yes means') : t('What no means')}
                          onChange={(event) => putSide(index, name, event.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  /*
                    A numbered list, never fewer than two rows: a choice's
                    options, or a score's levels lowest first, where the number
                    is the level the answer comes back as.
                  */
                  <div className={styles.options}>
                    {rows.map((option, at) => (
                      <div className={styles.option} key={at} data-testid="decision-option">
                        <span className={styles.marker} aria-hidden="true">
                          {question.kind === 'SCORE' ? at : `${at + 1}.`}
                        </span>
                        <input
                          className={`${editor.input} ${styles.box} ${styles.optionName}`}
                          value={option.name}
                          maxLength={64}
                          placeholder={
                            question.kind === 'SCORE' ? (at === 0 ? t('Lowest level') : t('Level')) : t('Option')
                          }
                          aria-label={question.kind === 'SCORE' ? t('Level name') : t('Option name')}
                          onChange={(event) => putOption(index, at, { ...option, name: event.target.value })}
                        />
                        <input
                          className={`${editor.input} ${styles.box}`}
                          value={option.description}
                          placeholder={t('What it means (optional)')}
                          aria-label={t('What it means')}
                          onChange={(event) => putOption(index, at, { ...option, description: event.target.value })}
                        />
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={question.kind === 'SCORE' ? t('Remove level') : t('Remove option')}
                          title={question.kind === 'SCORE' ? t('Remove level') : t('Remove option')}
                          onClick={() => put(index, { ...question, options: rows.filter((_, n) => n !== at) })}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={`${editor.parameterSync} ${styles.addOption}`}
                      onClick={() => put(index, { ...question, options: [...rows, { name: '', description: '' }] })}
                    >
                      {question.kind === 'SCORE' ? t('+ Add level') : t('+ Add option')}
                    </button>
                  </div>
                )}
              </div>

              <label className={styles.keyRow} data-testid="decision-key">
                <span className={styles.controlLabel}>{t('Output key')}</span>
                <input
                  className={`${editor.input} ${styles.box} ${styles.key}`}
                  value={question.key}
                  aria-label={t('Output key')}
                  spellCheck={false}
                  onChange={(event) => {
                    chosen.current.set(index, true);
                    put(index, { ...question, key: keyable(event.target.value) });
                  }}
                />
                {keyChosen(index) && question.instructions.trim() !== '' && (
                  <button
                    type="button"
                    className={styles.keyReset}
                    onClick={() => followWording(index)}
                    title={t('Make the key from the question again')}
                    aria-label={t('Make the key from the question again')}
                    data-key-reset=""
                  >
                    ↺
                  </button>
                )}
                <span className={styles.keyNote}>{tf('Later nodes read {path}', { path: readAs(question) })}</span>
              </label>
            </div>
          );
        })}
      </div>

      <div className={editor.field}>
        <span className={editor.labelWithHint}>
          <label className={editor.label} htmlFor="node-decision-branch">
            {t('Branch on')}
          </label>
          <FieldHint label={t('Branch on')}>
            {t('A choice leaves by one line per option, a yes-or-no by Yes or No, and either by Unsure when the answer is under the threshold. None, and the run carries straight on with the answers.')}
          </FieldHint>
        </span>
        <div className={editor.inputWrapper}>
          <select
            id="node-decision-branch"
            className={`${editor.input} ${editor.select}`}
            value={branch ?? ''}
            onChange={(event) => onChange({ decisionBranchQuestion: event.target.value || null })}
          >
            <option value="">{t('No branching')}</option>
            {choices.map((question) => (
              <option key={question.key} value={question.key}>
                {question.key}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={editor.field}>
        <span className={editor.labelWithHint}>
          <label className={editor.label} htmlFor="node-decision-threshold">
            {t('Threshold')}
          </label>
          <FieldHint label={t('Threshold')}>
            {t('How sure an answer has to be, from 0 to 1, to be taken. Under it the answer is marked unsure, and a branching node leaves by its unsure line. Empty takes every answer.')}
          </FieldHint>
        </span>
        <div className={editor.inputWrapper}>
          <input
            id="node-decision-threshold"
            className={editor.input}
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={draft.decisionThreshold ?? ''}
            placeholder={t('Every answer is taken')}
            onChange={(event) => {
              const typed = event.target.value;
              const parsed = Number(typed);
              onChange({
                decisionThreshold: typed === '' || !Number.isFinite(parsed) ? null : Math.min(1, Math.max(0, parsed)),
              });
            }}
          />
        </div>
      </div>
    </>
  );
}

/**
 * The ways out a decision node offers on the canvas, beside Unsure: one per
 * option of its branching choice, named and deduplicated as the server keeps
 * them, or `yes` and `no` for a yes-or-no. Empty for a node that does not
 * branch.
 */
export function decisionWays(draft: DecisionDraft): string[] {
  const branching = (draft.decisionQuestions ?? []).find(
    (question) => branchable(question.kind) && question.key === draft.decisionBranchQuestion,
  );
  if (branching === undefined) return [];
  if (branching.kind === 'NOUL') return [YES, NO];
  const names = [...new Set(branching.options.map((option) => option.name.trim()).filter((name) => name !== ''))];
  // One option is nothing to choose between; the node says so instead.
  return names.length >= 2 ? names : [];
}

/**
 * Why a node set to branch draws no doors, or null where it draws them or is
 * not set to branch: its choice has fewer than two named options.
 */
export function decisionNote(draft: DecisionDraft): string | null {
  const branching = (draft.decisionQuestions ?? []).find(
    (question) => question.kind === 'CHOICE' && question.key === draft.decisionBranchQuestion,
  );
  if (branching === undefined || decisionWays(draft).length > 0) return null;
  return t('Branches once its choice has two options');
}

/** What a way out is called on its handle: an option by its name, a yes-or-no's two in words. */
export function wayLabel(way: string, draft: DecisionDraft): string {
  const branching = (draft.decisionQuestions ?? []).find((question) => question.key === draft.decisionBranchQuestion);
  if (branching?.kind !== 'NOUL') return way;
  return way === YES ? t('Yes') : t('No');
}

/** Whether a question of this kind can pick the line a run leaves by; a score cannot. */
function branchable(kind: DecisionQuestionKind): boolean {
  return kind === 'CHOICE' || kind === 'NOUL';
}

/** The options a yes-or-no leaves by, as its lines carry them; the server uses the same two words. */
const YES = 'yes';
const NO = 'no';

/** The handle an option leaves by, and back. `unsure` is its own. */
export const UNSURE_HANDLE = 'unsure';
export const optionHandle = (option: string) => `opt:${option}`;
export const optionOf = (handle: string | null | undefined): string | null =>
  handle !== null && handle !== undefined && handle.startsWith('opt:') ? handle.slice('opt:'.length) : null;
