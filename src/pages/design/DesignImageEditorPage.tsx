import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { drawDesignImage, fetchWorkspaceArtifact } from '../../api/artifacts';
import type { Artifact } from '../../api/artifacts';
import { fetchImageModelParameters } from '../../api/graph';
import type { ImageParameterSpec } from '../../api/graph';
import { fetchImageSizePresets } from '../../api/imagePresets';
import type { ImageSizePreset } from '../../api/imagePresets';
import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import type { SessionUser } from '../../api/session';
import redoIcon from '../../assets/redo.svg';
import undoIcon from '../../assets/undo.svg';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { shellUser } from '../../session/user';
import form from '../../components/Dialog.module.css';
import styles from './DesignImageEditorPage.module.css';
import { t } from '../../i18n';

export interface DesignImageEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

type Asked = { size: string; quality: string; style: string };
const NOTHING: Asked = { size: '', quality: '', style: '' };

/** One step undo goes back to: what the panel held and which picture was on the canvas. */
type Snapshot = { prompt: string; modelId: string; asked: Asked; source: Artifact | null };

/** How long typing in the prompt pauses before it counts as one step to undo. */
const TYPING_SETTLES_MS = 700;

/**
 * Where a picture is made and worked on: the canvas, and beside it what the
 * picture is drawn from - the prompt, the model and that model's parameters.
 *
 * A page of its own at the workflow editor's level rather than a dialog over
 * the gallery, because this is where the work happens and it keeps growing:
 * editing a region of a picture is the next thing on this canvas. Opened empty
 * for a new picture, or at one already drawn, with the prompt and parameters it
 * was drawn with filled in - all of them for a picture drawn here, the prompt
 * alone for one a run or a task drew, which kept nothing else.
 *
 * Straight to the image model chosen, not through an agent: the panel is the
 * interface, and an agent would choose some of it for whoever is drawing.
 */
export function DesignImageEditorPage({ session, onSignOut }: DesignImageEditorPageProps) {
  const { workspaceId = '', artifactId } = useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState<Artifact | null>(null);
  const [models, setModels] = useState<Model[] | null>(null);
  const [modelId, setModelId] = useState('');
  const [spec, setSpec] = useState<ImageParameterSpec[]>([]);
  const [presets, setPresets] = useState<ImageSizePreset[]>([]);
  const [prompt, setPrompt] = useState('');
  const [asked, setAsked] = useState<Asked>(NOTHING);
  /** What was asked when a picture was opened, held until its model's parameters are known. */
  const [carried, setCarried] = useState<Asked | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What was drawn on this page, newest first: the strip under the canvas. */
  const [made, setMade] = useState<Artifact[]>([]);
  /** Steps to undo, oldest first, and steps undone that can be redone. */
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  /** The state before a burst of typing in the prompt, until the typing settles into one step. */
  const typingFrom = useRef<Snapshot | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);

  const now = (): Snapshot => ({ prompt, modelId, asked, source });
  const settleTyping = () => {
    window.clearTimeout(typingTimer.current);
    const from = typingFrom.current;
    typingFrom.current = null;
    if (from !== null && from.prompt !== prompt) {
      setPast((held) => [...held, from]);
      setFuture([]);
    }
  };
  /** A change worth undoing: the state it replaces goes on the stack. */
  const remember = () => {
    settleTyping();
    setPast((held) => [...held, now()]);
    setFuture([]);
  };
  const restore = (to: Snapshot) => {
    setPrompt(to.prompt);
    // Another model reads its parameters afresh, and keeps these where it takes them.
    if (to.modelId !== modelId) setCarried(to.asked);
    setModelId(to.modelId);
    setAsked(to.asked);
    if (to.source?.id !== source?.id) {
      setSource(to.source);
      navigate(
        to.source === null
          ? `/workspace/${workspaceId}/design/images/new`
          : `/workspace/${workspaceId}/design/images/${to.source.id}/edit`,
        { replace: true },
      );
    }
  };
  const undo = () => {
    settleTyping();
    if (past.length === 0) return;
    const to = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((ahead) => [now(), ...ahead]);
    restore(to);
  };
  const redo = () => {
    settleTyping();
    if (future.length === 0) return;
    const [to, ...rest] = future;
    setFuture(rest);
    setPast((held) => [...held, now()]);
    restore(to);
  };
  const keys = useRef({ undo, redo });
  keys.current = { undo, redo };
  // Ctrl+Z, and Ctrl+Shift+Z or Ctrl+Y - except in a text box, where the box's own undo of its text applies.
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        keys.current.undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        keys.current.redo();
      }
    };
    document.addEventListener('keydown', pressed);
    return () => document.removeEventListener('keydown', pressed);
  }, []);

  useEffect(() => {
    if (workspaceId === '') return;
    fetchModels(workspaceId)
      .then((all) => setModels(all.filter((one) => one.kind === 'IMAGE')))
      .catch(() => setModels([]));
    fetchImageSizePresets(workspaceId).then(setPresets).catch(() => setPresets([]));
  }, [workspaceId]);

  // The picture opened, and what it was drawn from.
  useEffect(() => {
    if (artifactId === undefined || workspaceId === '') {
      setSource(null);
      return;
    }
    if (source?.id === artifactId) return;
    let left = false;
    fetchWorkspaceArtifact(workspaceId, artifactId)
      .then((found) => {
        if (left || found === null) return;
        setSource(found);
        setPrompt(found.prompt);
        const drawn = found.drawnWith;
        if (drawn !== null) {
          if (drawn.modelId !== null) setModelId(drawn.modelId);
          setCarried({ size: drawn.size ?? '', quality: drawn.quality ?? '', style: drawn.style ?? '' });
        }
      })
      .catch(() => undefined);
    return () => {
      left = true;
    };
  }, [artifactId, workspaceId]);

  // The model drawn with when it is still here; otherwise the first that draws.
  useEffect(() => {
    if (models === null) return;
    setModelId((held) => (models.some((one) => one.id === held) ? held : (models[0]?.id ?? '')));
  }, [models]);

  // A model takes its own parameters: what it does not take is let go.
  useEffect(() => {
    if (modelId === '') {
      setSpec([]);
      return;
    }
    fetchImageModelParameters(modelId)
      .then((taken) => {
        setSpec(taken);
        setAsked((held) => {
          const from = carried ?? held;
          const named = new Set(taken.map((one) => one.name));
          return {
            size: named.has('size') ? from.size : '',
            quality: named.has('quality') ? from.quality : '',
            style: named.has('style') ? from.style : '',
          };
        });
        setCarried(null);
      })
      .catch(() => setSpec([]));
  }, [modelId]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (prompt.trim() === '' || modelId === '' || drawing) return;
    setDrawing(true);
    setError(null);
    try {
      const drawn = await drawDesignImage({
        workspaceId,
        modelId,
        prompt: prompt.trim(),
        size: asked.size || null,
        quality: asked.quality || null,
        style: asked.style || null,
      });
      remember();
      setMade((held) => [drawn, ...held]);
      setSource(drawn);
      navigate(`/workspace/${workspaceId}/design/images/${drawn.id}/edit`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not draw the picture.'));
    } finally {
      setDrawing(false);
    }
  }

  const [width = '', height = ''] = asked.size.split('x');
  const sizeOf = (w: string, h: string) => (w === '' && h === '' ? '' : `${w}x${h}`);
  const labelOf = (name: string) => (name === 'size' ? t('Size') : name === 'quality' ? t('Quality') : t('Style'));
  const shown = source;

  return (
    <AppShell
      title={t('Image editor')}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={null}
      hideSidebar
      fills
    >
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate(`/workspace/${workspaceId}/design/images${shown === null ? '' : `/${shown.id}`}`)}
          data-testid="editor-back"
        >
          ← {t('Images')}
        </button>
        <span className={styles.toolbarTitle}>{shown === null ? t('New image') : shown.filename}</span>
        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.tool}
            onClick={undo}
            disabled={past.length === 0 && prompt === (typingFrom.current?.prompt ?? prompt)}
            title={t('Undo (Ctrl+Z)')}
            aria-label={t('Undo')}
            data-testid="editor-undo"
          >
            <img src={undoIcon} alt="" width={16} height={16} />
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={redo}
            disabled={future.length === 0}
            title={t('Redo (Ctrl+Shift+Z)')}
            aria-label={t('Redo')}
            data-testid="editor-redo"
          >
            <img src={redoIcon} alt="" width={16} height={16} />
          </button>
        </div>
      </div>

      <div className={styles.editor}>
        <div className={styles.canvas} data-testid="editor-canvas">
          {drawing ? (
            // One mark from the first moment, saying what it is waiting for: a drawing is never quick enough to hide it.
            <div className={styles.waiting} data-testid="editor-drawing">
              <Loader label={t('Drawing…')} delay={0} size={72} />
            </div>
          ) : shown === null ? (
            <p className={styles.empty}>{t('Describe a picture on the right and generate it.')}</p>
          ) : (
            <img src={shown.url} alt={shown.prompt} className={styles.picture} data-testid="editor-picture" />
          )}
          {made.length > 1 && (
            <div className={styles.strip} aria-label={t('Drawn here')}>
              {made.map((one) => (
                <button
                  key={one.id}
                  type="button"
                  className={`${styles.stripItem} ${one.id === shown?.id ? styles.stripChosen : ''}`}
                  onClick={() => {
                    if (one.id === shown?.id) return;
                    remember();
                    setSource(one);
                    navigate(`/workspace/${workspaceId}/design/images/${one.id}/edit`, { replace: true });
                  }}
                  title={one.prompt}
                >
                  <img src={one.url} alt={one.prompt} />
                </button>
              ))}
            </div>
          )}
        </div>

        <form className={styles.panel} onSubmit={generate} data-testid="editor-panel">
          <div className={form.field}>
            <label className={form.label} htmlFor="image-prompt">{t('Prompt')}</label>
            <div className={`${form.inputWrapper} ${form.inputWrapperTall}`}>
              <textarea
                id="image-prompt"
                className={`${form.input} ${form.textarea} ${styles.prompt}`}
                value={prompt}
                onChange={(event) => {
                  if (typingFrom.current === null) typingFrom.current = now();
                  window.clearTimeout(typingTimer.current);
                  typingTimer.current = window.setTimeout(settleTyping, TYPING_SETTLES_MS);
                  setPrompt(event.target.value);
                }}
                onBlur={settleTyping}
                placeholder={t('What the picture should be of')}
                autoFocus={artifactId === undefined}
              />
            </div>
          </div>

          <div className={form.field}>
            <label className={form.label} htmlFor="image-model">{t('Model')}</label>
            <div className={form.inputWrapper}>
              <select
                id="image-model"
                className={`${form.input} ${form.select}`}
                value={modelId}
                onChange={(event) => {
                  remember();
                  setModelId(event.target.value);
                }}
                disabled={models === null || models.length === 0}
              >
                {models !== null && models.length === 0 && <option value="">{t('This workspace has no image model')}</option>}
                {(models ?? []).map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name} · {one.providerName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {spec.map((one) =>
            one.kind === 'DIMENSIONS' ? (
              <div key={one.name} className={form.field} data-testid="image-size">
                <label className={form.label} htmlFor="image-width">{t('Size')}</label>
                <div className={styles.sides}>
                  <div className={form.inputWrapper}>
                    <input
                      id="image-width"
                      className={`${form.input} ${form.inputMono}`}
                      type="number"
                      min={one.minSide ?? 1}
                      max={one.maxSide ?? undefined}
                      step={one.step ?? 1}
                      placeholder={t('Width')}
                      aria-label={t('Width')}
                      value={width}
                      onChange={(event) => {
                        remember();
                        setAsked({ ...asked, size: sizeOf(event.target.value, height) });
                      }}
                    />
                  </div>
                  <span aria-hidden="true">×</span>
                  <div className={form.inputWrapper}>
                    <input
                      className={`${form.input} ${form.inputMono}`}
                      type="number"
                      min={one.minSide ?? 1}
                      max={one.maxSide ?? undefined}
                      step={one.step ?? 1}
                      placeholder={t('Height')}
                      aria-label={t('Height')}
                      value={height}
                      onChange={(event) => {
                        remember();
                        setAsked({ ...asked, size: sizeOf(width, event.target.value) });
                      }}
                    />
                  </div>
                </div>
                {presets.length > 0 && (
                  <div className={form.inputWrapper}>
                    <select
                      className={`${form.input} ${form.select}`}
                      aria-label={t('Preset')}
                      value=""
                      onChange={(event) => {
                        const picked = presets.find((preset) => preset.id === event.target.value);
                        if (picked === undefined) return;
                        remember();
                        setAsked({ ...asked, size: `${picked.width}x${picked.height}` });
                      }}
                    >
                      <option value="">{t('Preset…')}</option>
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name} ({preset.width}×{preset.height})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div key={one.name} className={form.field} data-testid={`image-${one.name}`}>
                <label className={form.label} htmlFor={`image-${one.name}`}>{labelOf(one.name)}</label>
                <div className={form.inputWrapper}>
                  <select
                    id={`image-${one.name}`}
                    className={`${form.input} ${form.select}`}
                    value={asked[one.name as keyof Asked] ?? ''}
                    onChange={(event) => {
                      remember();
                      setAsked({ ...asked, [one.name]: event.target.value });
                    }}
                  >
                    <option value="">{t('Model default')}</option>
                    {one.choices.map((choice) => (
                      <option key={choice} value={choice}>{choice}</option>
                    ))}
                  </select>
                </div>
              </div>
            ),
          )}

          {error !== null && (
            <p className={form.error} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className={`${form.filled} ${styles.generate}`}
            disabled={prompt.trim() === '' || modelId === '' || drawing}
          >
            {drawing ? t('Drawing…') : t('Generate')}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
