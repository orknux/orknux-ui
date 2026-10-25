import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import { createResearchMode, fetchResearchModes, startResearch } from '../../api/research';
import type { Research, ResearchLanguage, ResearchMode, ResearchOutputFormat } from '../../api/research';
import { fetchWorkspaceWorkflows } from '../../api/workflows';
import type { WorkspaceWorkflow } from '../../api/workflows';
import dialog from '../../components/Dialog.module.css';
import { ModelPicker } from '../../components/ModelPicker';
import { useSieve } from '../../components/sieve';
import { Select } from '../../components/Select';
import { DocumentPicker } from './DocumentPicker';
import type { PickedDocument } from './DocumentPicker';
import { languageLabel, modeLabel } from './researchLabels';
import { SiteList } from './SiteList';
import styles from './ResearchPage.module.css';
import { t } from '../../i18n';

export interface NewResearchDialogProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  /** Handed the research just started. */
  onStarted: (started: Research) => void;
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

const LANGUAGES: ResearchLanguage[] = ['ACADEMIC', 'COLLOQUIAL', 'FORMAL'];

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
  const [workflows, setWorkflows] = useState<WorkspaceWorkflow[]>([]);

  const [question, setQuestion] = useState('');
  const [modeId, setModeId] = useState('');
  const [modelId, setModelId] = useState('');
  // The model last chosen here, remembered for whoever starts the next research in this workspace.
  const [lastModel, rememberModel] = useSieve(`research.model.${workspaceId}`);
  // On, as every research was before it could be switched off.
  const [webSearch, setWebSearch] = useState(true);
  // On, unless this person last left it off: a report with its pictures is what most research is for.
  const [lastImages, rememberImages] = useSieve(`research.images.${workspaceId}`);
  const [images, setImages] = useState(lastImages !== 'off');
  // A second model reading the report before it is saved, and which one: both remembered, as the model is.
  const [lastReview, rememberReview] = useSieve(`research.review.${workspaceId}`);
  const [lastReviewer, rememberReviewer] = useSieve(`research.reviewer.${workspaceId}`);
  const [review, setReview] = useState(lastReview === 'on');
  const [reviewerId, setReviewerId] = useState('');
  const [include, setInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [picked, setPicked] = useState<PickedDocument[]>([]);
  const [language, setLanguage] = useState<ResearchLanguage>('FORMAL');
  // A file to keep and send on, which is what most research is for.
  const [format, setFormat] = useState<ResearchOutputFormat>('PDF');

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
      setInclude([]);
      setExclude([]);
      setPicked([]);
      setWebSearch(true);
      setImages(lastImages !== 'off');
      setReview(lastReview === 'on');
      setAdding(false);
      setError(null);
      setSubmitting(false);
      held.showModal();
      Promise.all([fetchResearchModes(workspaceId), fetchModels(workspaceId)])
        .then(([foundModes, foundModels]) => {
          setModes(foundModes);
          setModeId((chosen) => (foundModes.some((mode) => mode.id === chosen) ? chosen : (foundModes[0]?.id ?? '')));
          const chat = foundModels.filter((model) => model.kind === 'CHAT');
          setModels(chat);
          // A research always has its model: the one chosen last, or the first there is.
          setModelId((chosen) =>
            chat.some((model) => model.id === chosen)
              ? chosen
              : chat.some((model) => model.id === lastModel)
                ? lastModel
                : (chat[0]?.id ?? ''));
          // The reviewer chosen last; none until somebody picks one, since reviewing with the writer's own model is a choice.
          setReviewerId((chosen) =>
            chat.some((model) => model.id === chosen) ? chosen : chat.some((model) => model.id === lastReviewer) ? lastReviewer : '');
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
    if (question.trim() === '' || modeId === '' || modelId === '' || (review && reviewerId === '') || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const started = await startResearch({
        workspaceId,
        question: question.trim(),
        modeId,
        modelId,
        language,
        outputFormat: format,
        websitesInclude: include,
        websitesExclude: exclude,
        documentsInclude: picked.filter((one) => one.use === 'INCLUDE').map((one) => one.document.id),
        documentsExclude: picked.filter((one) => one.use === 'EXCLUDE').map((one) => one.document.id),
        useWebSearch: webSearch,
        includeImages: images,
        review,
        reviewerModelId: review ? reviewerId : null,
      });
      onStarted(started);
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
                  onChange={(picked) => {
                    setModelId(picked);
                    rememberModel(picked);
                  }}
                  none={t('No chat model')}
                  required
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

          <div className={styles.checks}>
            <label className={dialog.checkboxField}>
              <input
                type="checkbox"
                id="research-web-search"
                checked={webSearch}
                onChange={(event) => setWebSearch(event.target.checked)}
                data-web-search
              />
              {t('Use web search')}
            </label>

            <label className={dialog.checkboxField}>
              <input
                type="checkbox"
                id="research-include-images"
                checked={images}
                onChange={(event) => {
                  setImages(event.target.checked);
                  rememberImages(event.target.checked ? 'on' : 'off');
                }}
                data-include-images
              />
              {t('Include images')}
            </label>

            <label className={dialog.checkboxField}>
              <input
                type="checkbox"
                id="research-review"
                checked={review}
                onChange={(event) => {
                  setReview(event.target.checked);
                  rememberReview(event.target.checked ? 'on' : 'off');
                }}
                data-review
              />
              {t('Review')}
            </label>
          </div>

          {review && (
            <div className={dialog.field} data-reviewer>
              <label className={dialog.label} htmlFor="research-reviewer">{t('Reviewer')}</label>
              <div className={dialog.inputWrapper}>
                <ModelPicker
                  id="research-reviewer"
                  className={dialog.input}
                  value={reviewerId}
                  models={models}
                  onChange={(picked) => {
                    setReviewerId(picked);
                    rememberReviewer(picked);
                  }}
                  none={t('Choose a model')}
                  required
                  workspaceId={workspaceId}
                />
              </div>
            </div>
          )}

          <fieldset className={styles.group}>
            <legend className={dialog.label}>{t('Websites')}</legend>
            <div className={styles.pair}>
              <SiteList id="research-websites-include" label={t('Include')} sites={include} onChange={setInclude} />
              <SiteList id="research-websites-exclude" label={t('Exclude')} sites={exclude} onChange={setExclude} />
            </div>
          </fieldset>

          <DocumentPicker workspaceId={workspaceId} picked={picked} onChange={setPicked} />

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
          <button
            type="submit"
            className={dialog.filled}
            disabled={question.trim() === '' || modeId === '' || modelId === '' || (review && reviewerId === '') || submitting}
          >
            {submitting ? t('Starting…') : t('Start')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
