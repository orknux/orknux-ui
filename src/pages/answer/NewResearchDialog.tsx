import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import { createResearchMode, fetchResearchDocuments, fetchResearchModes, startResearch } from '../../api/research';
import type { ResearchDocument, ResearchLanguage, ResearchMode, ResearchOutputFormat } from '../../api/research';
import { fetchWorkspaceWorkflows } from '../../api/workflows';
import type { WorkspaceWorkflow } from '../../api/workflows';
import dialog from '../../components/Dialog.module.css';
import { ModelPicker } from '../../components/ModelPicker';
import { Select } from '../../components/Select';
import { languageLabel, modeLabel } from './researchLabels';
import styles from './ResearchPage.module.css';
import { t } from '../../i18n';

export interface NewResearchDialogProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  onStarted: () => void;
}

/** How long a mode usually takes, said beside the option rather than in it. */
function modeHint(mode: ResearchMode): string {
  switch (mode.kind) {
    case 'SHALLOW':
      return t('Usually a few minutes');
    case 'MEDIUM':
      return t('Usually several minutes');
    case 'DEEP':
      return t('More than several minutes');
    default:
      return mode.workflowName ?? t('Its workflow is gone');
  }
}

/** What a document is to this research. */
type Use = 'NONE' | 'INCLUDE' | 'EXCLUDE';

const LANGUAGES: ResearchLanguage[] = ['ACADEMIC', 'COLLOQUIAL', 'FORMAL'];

/** A list typed one to a line, or with commas. */
function linesOf(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** What the "runs" choice of a new mode holds: a mode to copy, or a workflow. */
const COPY = 'copy:';
const WORKFLOW = 'workflow:';

/**
 * A new research: the question, how deep, with which model, where to look and
 * where not to, in which register, and as what. Issue #659.
 *
 * Every mode is a workflow of the workspace, so "Add mode" is a name and a
 * workflow - one of the workspace's, or a copy of another mode's to change.
 */
export function NewResearchDialog({ open, workspaceId, onClose, onStarted }: NewResearchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [modes, setModes] = useState<ResearchMode[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [workflows, setWorkflows] = useState<WorkspaceWorkflow[]>([]);

  const [question, setQuestion] = useState('');
  const [modeId, setModeId] = useState('');
  const [modelId, setModelId] = useState('');
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [uses, setUses] = useState<Record<string, Use>>({});
  const [language, setLanguage] = useState<ResearchLanguage>('FORMAL');
  const [format, setFormat] = useState<ResearchOutputFormat>('DOCUMENT');

  const [adding, setAdding] = useState(false);
  const [modeName, setModeName] = useState('');
  const [modeRuns, setModeRuns] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const held = dialogRef.current;
    if (held === null) return;
    if (open && !held.open) {
      setQuestion('');
      setInclude('');
      setExclude('');
      setUses({});
      setAdding(false);
      setError(null);
      setSubmitting(false);
      held.showModal();
      Promise.all([fetchResearchModes(workspaceId), fetchModels(workspaceId), fetchResearchDocuments(workspaceId)])
        .then(([foundModes, foundModels, foundDocuments]) => {
          setModes(foundModes);
          setModeId((chosen) => (foundModes.some((mode) => mode.id === chosen) ? chosen : (foundModes[0]?.id ?? '')));
          setModels(foundModels.filter((model) => model.kind === 'CHAT'));
          setDocuments(foundDocuments);
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load what a research needs.')));
    } else if (!open && held.open) {
      held.close();
    }
  }, [open, workspaceId]);

  /** Opens the small form for a mode of one's own, with the workflows to pick from. */
  function startAdding() {
    setAdding(true);
    setModeName('');
    setModeRuns(modes[0] === undefined ? '' : COPY + modes[0].id);
    fetchWorkspaceWorkflows(workspaceId, 0, 200)
      .then((found) => setWorkflows(found.content))
      .catch(() => setWorkflows([]));
  }

  async function addMode() {
    if (modeName.trim() === '' || modeRuns === '') return;
    setError(null);
    try {
      const made = await createResearchMode({
        workspaceId,
        name: modeName.trim(),
        copyOfModeId: modeRuns.startsWith(COPY) ? modeRuns.slice(COPY.length) : null,
        workflowId: modeRuns.startsWith(WORKFLOW) ? modeRuns.slice(WORKFLOW.length) : null,
      });
      setModes((held) => [...held, made]);
      setModeId(made.id);
      setAdding(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not add the mode.'));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim() === '' || modeId === '' || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await startResearch({
        workspaceId,
        question: question.trim(),
        modeId,
        modelId: modelId === '' ? null : modelId,
        language,
        outputFormat: format,
        websitesInclude: linesOf(include),
        websitesExclude: linesOf(exclude),
        documentsInclude: Object.keys(uses).filter((id) => uses[id] === 'INCLUDE'),
        documentsExclude: Object.keys(uses).filter((id) => uses[id] === 'EXCLUDE'),
      });
      onStarted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not start the research.'));
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`${dialog.dialog} ${styles.dialogSize}`}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="new-research-title"
    >
      <form className={`${dialog.body} ${styles.dialogBody}`} onSubmit={handleSubmit}>
        <header className={dialog.header}>
          <h2 className={dialog.title} id="new-research-title">{t('New research')}</h2>
        </header>

        <div className={dialog.fields}>
          <div className={dialog.field}>
            <label className={dialog.label} htmlFor="research-question">{t('Question')}</label>
            <div className={`${dialog.inputWrapper} ${dialog.inputWrapperTall}`}>
              <textarea
                id="research-question"
                className={`${dialog.input} ${dialog.textarea}`}
                placeholder={t('What should be researched?')}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          <div className={styles.pair}>
            <div className={dialog.field}>
              <label className={dialog.label} htmlFor="research-mode">{t('Mode')}</label>
              <div className={styles.withButton}>
                <div className={dialog.inputWrapper}>
                  <Select id="research-mode" className={dialog.input} value={modeId} onChange={setModeId}>
                    {modes.map((mode) => (
                      <option key={mode.id} value={mode.id} data-hint={modeHint(mode)}>
                        {modeLabel(mode.kind, mode.name)}
                      </option>
                    ))}
                  </Select>
                </div>
                <button type="button" className={dialog.ghost} onClick={startAdding} disabled={adding}>
                  {t('Add mode')}
                </button>
              </div>
            </div>

            <div className={dialog.field}>
              <label className={dialog.label} htmlFor="research-model">{t('Model')}</label>
              <div className={dialog.inputWrapper}>
                <ModelPicker
                  id="research-model"
                  className={dialog.input}
                  value={modelId}
                  models={models}
                  onChange={setModelId}
                  none={t('Set in the mode')}
                  workspaceId={workspaceId}
                />
              </div>
            </div>
          </div>

          {adding && (
            <div className={styles.addMode} data-adding-mode>
              <div className={dialog.field}>
                <label className={dialog.label} htmlFor="research-mode-name">{t('Mode name')}</label>
                <div className={dialog.inputWrapper}>
                  <input
                    id="research-mode-name"
                    className={dialog.input}
                    value={modeName}
                    onChange={(event) => setModeName(event.target.value)}
                    placeholder={t('e.g. Patents')}
                  />
                </div>
              </div>
              <div className={dialog.field}>
                <label className={dialog.label} htmlFor="research-mode-runs">{t('Runs')}</label>
                <div className={dialog.inputWrapper}>
                  <Select id="research-mode-runs" className={dialog.input} value={modeRuns} onChange={setModeRuns}>
                    <optgroup label={t('A copy of')}>
                      {modes.map((mode) => (
                        <option key={mode.id} value={COPY + mode.id}>{modeLabel(mode.kind, mode.name)}</option>
                      ))}
                    </optgroup>
                    <optgroup label={t('A workflow')}>
                      {workflows.map((workflow) => (
                        <option key={workflow.workflowId} value={WORKFLOW + workflow.workflowId}>{workflow.name}</option>
                      ))}
                    </optgroup>
                  </Select>
                </div>
              </div>
              <div className={styles.addModeActions}>
                <button type="button" className={dialog.ghost} onClick={() => setAdding(false)}>{t('Cancel')}</button>
                <button type="button" className={dialog.filled} onClick={() => void addMode()} disabled={modeName.trim() === ''}>
                  {t('Add')}
                </button>
              </div>
            </div>
          )}

          <fieldset className={styles.group}>
            <legend className={dialog.label}>{t('Websites')}</legend>
            <div className={styles.pair}>
              <div className={dialog.field}>
                <label className={dialog.label} htmlFor="research-websites-include">{t('Include')}</label>
                <div className={`${dialog.inputWrapper} ${styles.short}`}>
                  <textarea
                    id="research-websites-include"
                    className={`${dialog.input} ${dialog.textarea}`}
                    placeholder="example.org"
                    value={include}
                    onChange={(event) => setInclude(event.target.value)}
                  />
                </div>
              </div>
              <div className={dialog.field}>
                <label className={dialog.label} htmlFor="research-websites-exclude">{t('Exclude')}</label>
                <div className={`${dialog.inputWrapper} ${styles.short}`}>
                  <textarea
                    id="research-websites-exclude"
                    className={`${dialog.input} ${dialog.textarea}`}
                    placeholder="example.com"
                    value={exclude}
                    onChange={(event) => setExclude(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className={styles.group} data-documents>
            <legend className={dialog.label}>{t('Documents')}</legend>
            {documents.length === 0 ? (
              <span className={styles.muted}>{t('No documents yet.')}</span>
            ) : (
              <ul className={styles.documents}>
                {documents.map((document) => (
                  <li key={document.id} className={styles.documentRow}>
                    <span className={styles.documentName} title={document.description}>{document.name}</span>
                    <Select
                      className={styles.documentUse}
                      value={uses[document.id] ?? 'NONE'}
                      onChange={(value) => setUses((held) => ({ ...held, [document.id]: value as Use }))}
                      aria-label={document.name}
                    >
                      <option value="NONE">{t('Not used')}</option>
                      <option value="INCLUDE">{t('Include')}</option>
                      <option value="EXCLUDE">{t('Exclude')}</option>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <div className={styles.pair}>
            <div className={dialog.field}>
              <label className={dialog.label} htmlFor="research-language">{t('Language')}</label>
              <div className={dialog.inputWrapper}>
                <Select id="research-language" className={dialog.input} value={language} onChange={(value) => setLanguage(value as ResearchLanguage)}>
                  {LANGUAGES.map((one) => (
                    <option key={one} value={one}>{languageLabel(one)}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className={dialog.field}>
              <label className={dialog.label} htmlFor="research-format">{t('Output')}</label>
              <div className={dialog.inputWrapper}>
                <Select id="research-format" className={dialog.input} value={format} onChange={(value) => setFormat(value as ResearchOutputFormat)}>
                  <option value="PDF">{t('PDF')}</option>
                  <option value="DOCUMENT">{t('Document')}</option>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {error !== null && (
          <p className={dialog.error} role="alert">
            {error}
          </p>
        )}

        <div className={dialog.actions}>
          <button type="button" className={dialog.ghost} onClick={onClose} disabled={submitting}>
            {t('Cancel')}
          </button>
          <button type="submit" className={dialog.filled} disabled={question.trim() === '' || modeId === '' || submitting}>
            {submitting ? t('Starting…') : t('Start')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
