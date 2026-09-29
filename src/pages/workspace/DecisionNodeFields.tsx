import type { DecisionOption, DecisionQuestion, DecisionQuestionKind } from '../../api/graph';
import type { Model } from '../../api/models';
import { DefinitionPicker } from '../../components/DefinitionPicker';
import { FieldHint } from '../../components/FieldHint';
import editor from './WorkflowEditorPage.module.css';
import styles from './DecisionNodeFields.module.css';
import { t } from '../../i18n';

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
  /** The workspace's decision models, enabled ones only. */
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

/** A noul's two sides, keyed as its criteria are; what the model reads for each. */
function side(question: DecisionQuestion, name: 'true' | 'false'): string {
  return question.options.find((option) => option.name === name)?.description ?? '';
}

export function DecisionNodeFields({ draft, models, onChange }: DecisionNodeFieldsProps) {
  const questions = draft.decisionQuestions ?? [];
  const branch = draft.decisionBranchQuestion ?? null;
  const choices = questions.filter((question) => question.kind === 'CHOICE');

  function put(index: number, changed: DecisionQuestion) {
    const was = questions[index];
    const next = questions.map((held, at) => (at === index ? changed : held));
    // The branch follows its question through a rename, and lets go of one
    // that stopped being a choice - only a choice has options to leave by.
    let branching = branch;
    if (was.key === branch) branching = changed.kind === 'CHOICE' ? changed.key : null;
    onChange({ decisionQuestions: next, decisionBranchQuestion: branching });
  }

  function remove(index: number) {
    const gone = questions[index];
    onChange({
      decisionQuestions: questions.filter((_, at) => at !== index),
      decisionBranchQuestion: gone.key === branch ? null : branch,
    });
  }

  function putOption(index: number, at: number, option: DecisionOption) {
    const question = questions[index];
    put(index, { ...question, options: question.options.map((held, n) => (n === at ? option : held)) });
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
            {t('Decision Model')}
          </label>
          <FieldHint label={t('Decision Model')}>
            {t('Which of this workspace’s decision models answers: Jev, or a Laya of your own. Add one under Models with a Decision model provider.')}
          </FieldHint>
        </span>
        <DefinitionPicker
          id="node-decision-model"
          value={draft.decisionModelId ?? ''}
          options={models.map((model) => ({ value: model.id, label: model.name }))}
          onChoose={(chosen) => onChange({ decisionModelId: chosen || null })}
          placeholder={models.length === 0 ? t('This workspace has no decision model') : t('Choose a decision model…')}
          searchPlaceholder={t('Search decision models…')}
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
                  { key: nextKey(questions), kind: 'CHOICE', instructions: '', options: [] },
                ],
              })
            }
          >
            {t('+ Add question')}
          </button>
        </span>

        {questions.length === 0 && <p className={editor.fieldNote}>{t('No questions yet, so this node asks nothing.')}</p>}

        {questions.map((question, index) => (
          <div className={styles.question} key={index} data-testid="decision-question">
            <div className={styles.questionHead}>
              <input
                className={`${editor.input} ${styles.key}`}
                value={question.key}
                aria-label={t('Question key')}
                spellCheck={false}
                onChange={(event) => put(index, { ...question, key: keyable(event.target.value) })}
              />
              <select
                className={`${editor.input} ${editor.select} ${styles.kind}`}
                value={question.kind}
                aria-label={t('Question type')}
                onChange={(event) => {
                  const kind = event.target.value as DecisionQuestionKind;
                  // A noul keeps only its two sides; a choice and a score keep
                  // what they had, since options and levels are both a list.
                  put(index, { ...question, kind, options: kind === 'NOUL' ? [] : question.kind === 'NOUL' ? [] : question.options });
                }}
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindLabel(kind)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={editor.parameterSync}
                aria-label={t('Remove question')}
                onClick={() => remove(index)}
              >
                {t('Remove')}
              </button>
            </div>
            <input
              className={`${editor.input} ${styles.box}`}
              value={question.instructions}
              placeholder={t('What is being asked')}
              aria-label={t('Question')}
              onChange={(event) => put(index, { ...question, instructions: event.target.value })}
            />

            {question.kind === 'NOUL' ? (
              <div className={styles.options}>
                <input
                  className={`${editor.input} ${styles.box}`}
                  value={side(question, 'true')}
                  placeholder={t('What yes means (optional)')}
                  aria-label={t('What yes means')}
                  onChange={(event) => putSide(index, 'true', event.target.value)}
                />
                <input
                  className={`${editor.input} ${styles.box}`}
                  value={side(question, 'false')}
                  placeholder={t('What no means (optional)')}
                  aria-label={t('What no means')}
                  onChange={(event) => putSide(index, 'false', event.target.value)}
                />
              </div>
            ) : (
              <div className={styles.options}>
                {question.options.map((option, at) => (
                  <div className={styles.option} key={at}>
                    <input
                      className={`${editor.input} ${styles.box} ${styles.optionName}`}
                      value={option.name}
                      maxLength={64}
                      placeholder={question.kind === 'SCORE' ? t('Level') : t('Option')}
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
                      className={editor.parameterSync}
                      aria-label={question.kind === 'SCORE' ? t('Remove level') : t('Remove option')}
                      onClick={() => put(index, { ...question, options: question.options.filter((_, n) => n !== at) })}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={`${editor.parameterSync} ${styles.addOption}`}
                  onClick={() => put(index, { ...question, options: [...question.options, { name: '', description: '' }] })}
                >
                  {question.kind === 'SCORE' ? t('+ Add level') : t('+ Add option')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={editor.field}>
        <span className={editor.labelWithHint}>
          <label className={editor.label} htmlFor="node-decision-branch">
            {t('Branch on')}
          </label>
          <FieldHint label={t('Branch on')}>
            {t('A choice question whose option picks the line the run leaves by: one handle per option, and one for an answer too unsure to take. None, and the run carries straight on with the answers.')}
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
 * The ways out a decision node offers on the canvas: one per option of its
 * branching choice, named and deduplicated as the server keeps them. Empty for
 * a node that does not branch.
 */
export function decisionWays(draft: DecisionDraft): string[] {
  const branching = (draft.decisionQuestions ?? []).find(
    (question) => question.kind === 'CHOICE' && question.key === draft.decisionBranchQuestion,
  );
  if (branching === undefined) return [];
  const names = branching.options.map((option) => option.name.trim()).filter((name) => name !== '');
  return [...new Set(names)];
}

/** The handle an option leaves by, and back. `unsure` is its own. */
export const UNSURE_HANDLE = 'unsure';
export const optionHandle = (option: string) => `opt:${option}`;
export const optionOf = (handle: string | null | undefined): string | null =>
  handle !== null && handle !== undefined && handle.startsWith('opt:') ? handle.slice('opt:'.length) : null;
