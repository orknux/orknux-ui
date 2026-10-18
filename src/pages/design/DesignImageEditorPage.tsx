import { useEffect, useRef, useState } from 'react';
import type { FormEvent, WheelEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  deleteArtifact,
  dismissDesignImageJob,
  fetchDesignImageJob,
  fetchWorkspaceArtifact,
  queueDesignImage,
  renameDesignImage,
  saveDesignImage,
} from '../../api/artifacts';
import type { Artifact, DesignImageJob } from '../../api/artifacts';
import { fetchImageModelParameters } from '../../api/graph';
import type { ImageParameterSpec } from '../../api/graph';
import { fetchImageSizePresets } from '../../api/imagePresets';
import type { ImageSizePreset } from '../../api/imagePresets';
import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import type { SessionUser } from '../../api/session';
import pencilIcon from '../../assets/pencil.svg';
import redoIcon from '../../assets/redo.svg';
import undoIcon from '../../assets/undo.svg';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { matches, useRedoShortcut, useUndoShortcut, useZoomInShortcut, useZoomOutShortcut } from '../../session/shortcut';
import { shellUser } from '../../session/user';
import form from '../../components/Dialog.module.css';
import styles from './DesignImageEditorPage.module.css';
import { t, tf } from '../../i18n';

export interface DesignImageEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

type Asked = { size: string; quality: string; style: string };
const NOTHING: Asked = { size: '', quality: '', style: '' };

/** One request made on this page: the job, and its picture once drawn. */
type Made = { job: DesignImageJob };

/** What the canvas holds: a picture, a request on its way, or nothing yet. */
type Shown = { kind: 'picture'; picture: Artifact } | { kind: 'job'; jobId: string } | null;

/** One step undo goes back to: what the panel held and what was on the canvas. */
type Snapshot = { prompt: string; modelId: string; asked: Asked; shown: Shown; pendingName: string | null };

/** How long typing in the prompt pauses before it counts as one step to undo. */
const TYPING_SETTLES_MS = 700;
/** How often requests still on their way are asked about. */
const ASK_EVERY_MS = 1500;
/** Each zoom step, and how far zoom goes either way, as a share of the picture's own size. */
const ZOOM_STEP = 1.25;
const ZOOM_LEAST = 0.05;
const ZOOM_MOST = 8;

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
 * Generate queues rather than waits: a drawing can take minutes, so somebody can
 * ask for several, leave, and find them in the gallery. What is drawn here is a
 * draft until it is saved, and a draft discarded is deleted - five tries leave
 * the one that was wanted.
 *
 * Straight to the image model chosen, not through an agent: the panel is the
 * interface, and an agent would choose some of it for whoever is drawing.
 */
export function DesignImageEditorPage({ session, onSignOut }: DesignImageEditorPageProps) {
  const { workspaceId = '', artifactId } = useParams();
  const navigate = useNavigate();
  /** A request opened from the gallery while it waits or draws: `?job=` on the New address. */
  const [searching] = useSearchParams();
  const jobAsked = searching.get('job');
  const [shown, setShown] = useState<Shown>(null);
  const [models, setModels] = useState<Model[] | null>(null);
  const [modelId, setModelId] = useState('');
  const [spec, setSpec] = useState<ImageParameterSpec[]>([]);
  const [presets, setPresets] = useState<ImageSizePreset[]>([]);
  const [prompt, setPrompt] = useState('');
  const [asked, setAsked] = useState<Asked>(NOTHING);
  /** What was asked when a picture was opened, held until its model's parameters are known. */
  const [carried, setCarried] = useState<Asked | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What was asked for on this page, newest first: the strip under the canvas. */
  const [made, setMade] = useState<Made[]>([]);
  /** Steps to undo, oldest first, and steps undone that can be redone. */
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  /** Null fits the picture to the canvas; a number is its scale against its own size. */
  const [zoom, setZoom] = useState<number | null>(null);
  const typingFrom = useRef<Snapshot | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const pictureRef = useRef<HTMLImageElement | null>(null);
  const undoKey = useUndoShortcut();
  const redoKey = useRedoShortcut();
  const zoomInKey = useZoomInShortcut();
  const zoomOutKey = useZoomOutShortcut();

  const picture = shown?.kind === 'picture' ? shown.picture : null;
  const job = shown?.kind === 'job' ? (made.find((one) => one.job.id === shown.jobId)?.job ?? null) : null;

  useEffect(() => {
    if (workspaceId === '') return;
    fetchModels(workspaceId)
      .then((all) => setModels(all.filter((one) => one.kind === 'IMAGE')))
      .catch(() => setModels([]));
    fetchImageSizePresets(workspaceId).then(setPresets).catch(() => setPresets([]));
  }, [workspaceId]);

  // The picture opened, and what it was drawn from.
  useEffect(() => {
    if (artifactId === undefined || workspaceId === '') return;
    if (picture?.id === artifactId) return;
    let left = false;
    fetchWorkspaceArtifact(workspaceId, artifactId)
      .then((found) => {
        if (left || found === null) return;
        setShown({ kind: 'picture', picture: found });
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

  // A request opened from the gallery: what it was asked with, and the canvas waiting for it.
  useEffect(() => {
    if (jobAsked === null || workspaceId === '') return;
    let left = false;
    fetchDesignImageJob(workspaceId, jobAsked)
      .then((found) => {
        if (left || found === null) return;
        setMade((held) => (held.some((one) => one.job.id === found.id) ? held : [{ job: found }, ...held]));
        setPrompt(found.prompt);
        if (found.modelId !== null) setModelId(found.modelId);
        setCarried({ size: found.size ?? '', quality: found.quality ?? '', style: found.style ?? '' });
        if (found.status === 'DRAWN' && found.image !== null) show({ kind: 'picture', picture: found.image });
        else setShown({ kind: 'job', jobId: found.id });
      })
      .catch(() => undefined);
    return () => {
      left = true;
    };
  }, [jobAsked, workspaceId]);

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

  // Requests on their way are asked about until each is drawn or has failed.
  const waiting = made.filter((one) => one.job.status === 'QUEUED' || one.job.status === 'DRAWING').map((one) => one.job.id);
  useEffect(() => {
    if (waiting.length === 0) return;
    const ask = window.setInterval(() => {
      waiting.forEach((id) => {
        fetchDesignImageJob(workspaceId, id)
          .then((now) => {
            if (now === null) return;
            setMade((held) => held.map((one) => (one.job.id === id ? { job: now } : one)));
            // The picture asked for last, on the canvas the moment it comes.
            if (now.status === 'DRAWN' && now.image !== null) {
              setShown((held) => {
                if (held?.kind !== 'job' || held.jobId !== id) return held;
                navigate(`/workspace/${workspaceId}/design/images/${now.image?.id}/edit`, { replace: true });
                return { kind: 'picture', picture: now.image as Artifact };
              });
            }
          })
          .catch(() => undefined);
      });
    }, ASK_EVERY_MS);
    return () => window.clearInterval(ask);
  }, [waiting.join(','), workspaceId]);

  // -- Undo and redo ------------------------------------------------------

  const now = (): Snapshot => ({ prompt, modelId, asked, shown, pendingName });
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
  const show = (next: Shown) => {
    setShown(next);
    setPendingName(null);
    setZoom(null);
    const path =
      next?.kind === 'picture'
        ? `/workspace/${workspaceId}/design/images/${next.picture.id}/edit`
        : `/workspace/${workspaceId}/design/images/new`;
    navigate(path, { replace: true });
  };
  const restore = (to: Snapshot) => {
    setPrompt(to.prompt);
    // Another model reads its parameters afresh, and keeps these where it takes them.
    if (to.modelId !== modelId) setCarried(to.asked);
    setModelId(to.modelId);
    setAsked(to.asked);
    show(to.shown);
    setPendingName(to.pendingName);
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

  // -- Zoom ---------------------------------------------------------------

  /** The scale the picture is drawn at now, fitted or not. */
  const scaleNow = (): number => {
    if (zoom !== null) return zoom;
    const shownPicture = pictureRef.current;
    if (shownPicture === null || shownPicture.naturalWidth === 0) return 1;
    return shownPicture.clientWidth / shownPicture.naturalWidth;
  };
  const zoomBy = (factor: number) => setZoom(Math.min(ZOOM_MOST, Math.max(ZOOM_LEAST, scaleNow() * factor)));
  const zoomIn = () => zoomBy(ZOOM_STEP);
  const zoomOut = () => zoomBy(1 / ZOOM_STEP);

  const keys = useRef({ undo, redo, zoomIn, zoomOut });
  keys.current = { undo, redo, zoomIn, zoomOut };
  // The shortcuts chosen in Preferences; the number pad's + and - zoom too. Not in a text box,
  // where the box's own undo of its text applies.
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
      if (matches(event, zoomInKey) || ((event.ctrlKey || event.metaKey) && event.code === 'NumpadAdd')) {
        event.preventDefault();
        keys.current.zoomIn();
      } else if (matches(event, zoomOutKey) || ((event.ctrlKey || event.metaKey) && event.code === 'NumpadSubtract')) {
        event.preventDefault();
        keys.current.zoomOut();
      } else if (typing) {
        return;
      } else if (matches(event, undoKey)) {
        event.preventDefault();
        keys.current.undo();
      } else if (matches(event, redoKey) || ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'y')) {
        event.preventDefault();
        keys.current.redo();
      }
    };
    document.addEventListener('keydown', pressed);
    return () => document.removeEventListener('keydown', pressed);
  }, [undoKey, redoKey, zoomInKey, zoomOutKey]);

  // -- Generate, save, discard -------------------------------------------

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (prompt.trim() === '' || modelId === '' || queueing) return;
    setQueueing(true);
    setError(null);
    try {
      const queued = await queueDesignImage({
        workspaceId,
        modelId,
        prompt: prompt.trim(),
        size: asked.size || null,
        quality: asked.quality || null,
        style: asked.style || null,
        name: newName || null,
      });
      remember();
      setNewName('');
      setMade((held) => [{ job: queued }, ...held]);
      show({ kind: 'job', jobId: queued.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not queue the picture.'));
    } finally {
      setQueueing(false);
    }
  }

  /** Writes what is held: a new name, and the draft kept. */
  async function save() {
    if (picture === null || (!picture.draft && pendingName === null) || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (pendingName !== null) await renameDesignImage(workspaceId, picture.id, pendingName);
      setPendingName(null);
      const kept = picture.draft
        ? await saveDesignImage(workspaceId, picture.id)
        : ((await fetchWorkspaceArtifact(workspaceId, picture.id)) ?? picture);
      setShown({ kind: 'picture', picture: kept });
      setMade((held) => held.map((one) => (one.job.image?.id === kept.id ? { job: { ...one.job, image: kept } } : one)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the picture.'));
    } finally {
      setBusy(false);
    }
  }

  /** A draft deleted, or a request still waiting taken off; the canvas moves to the one before. */
  async function discard() {
    if (busy) return;
    // A rename not saved is what goes first; the picture itself only when nothing else is held.
    if (pendingName !== null) {
      setPendingName(null);
      return;
    }
    const leaving = picture !== null && picture.draft ? picture.id : null;
    const dropping = job !== null && (job.status === 'QUEUED' || job.status === 'FAILED') ? job.id : null;
    if (leaving === null && dropping === null) return;
    setBusy(true);
    setError(null);
    try {
      if (leaving !== null) await deleteArtifact(leaving);
      if (dropping !== null) await dismissDesignImageJob(dropping);
      const rest = made.filter((one) => one.job.id !== dropping && one.job.image?.id !== leaving);
      setMade(rest);
      // A step that pointed at what is gone cannot be gone back to.
      setPast([]);
      setFuture([]);
      const next = rest[0];
      show(
        next === undefined
          ? null
          : next.job.image !== null
            ? { kind: 'picture', picture: next.job.image }
            : { kind: 'job', jobId: next.job.id },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not discard it.'));
    } finally {
      setBusy(false);
    }
  }

  /** The name being typed over the title, or null while it is only shown. */
  const [naming, setNaming] = useState<string | null>(null);
  /** The name a new picture is given before it is drawn; empty leaves it to the prompt. */
  const [newName, setNewName] = useState('');
  /** A new name for the picture shown, written only by Save. */
  const [pendingName, setPendingName] = useState<string | null>(null);
  function rename() {
    if (naming === null) return;
    // Nothing drawn yet: the name goes with the next Generate.
    if (picture === null) {
      setNewName(naming.trim());
      setNaming(null);
      return;
    }
    const called = naming.trim();
    setNaming(null);
    // Held until Save, like every other change on a page that saves - and a step undo goes back over.
    const next = called === '' || called === picture.name ? null : called;
    if (next === pendingName) return;
    remember();
    setPendingName(next);
  }

  const canSave = picture !== null && (picture.draft || pendingName !== null);
  const canDiscard = canSave || pendingName !== null || (job !== null && (job.status === 'QUEUED' || job.status === 'FAILED'));

  const [width = '', height = ''] = asked.size.split('x');
  const sizeOf = (w: string, h: string) => (w === '' && h === '' ? '' : `${w}x${h}`);
  const labelOf = (name: string) => (name === 'size' ? t('Size') : name === 'quality' ? t('Quality') : t('Style'));

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || picture === null) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  };

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
          onClick={() => navigate(`/workspace/${workspaceId}/design/images${picture === null ? '' : `/${picture.id}`}`)}
          data-testid="editor-back"
        >
          ← {t('Images')}
        </button>
        {/*
          What the picture is called: a name for one drawn here, renamed by
          clicking it; its prompt, cut short, for one a run or a task drew.
        */}
        {naming !== null ? (
          <input
            className={styles.titleInput}
            value={naming}
            onChange={(event) => setNaming(event.target.value)}
            onBlur={rename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') rename();
              if (event.key === 'Escape') setNaming(null);
            }}
            aria-label={t('Name')}
            placeholder={picture === null ? t('Named after the prompt if left empty') : undefined}
            autoFocus
            data-testid="editor-name-input"
          />
        ) : picture !== null && picture.name !== null ? (
          <button
            type="button"
            className={styles.toolbarTitle}
            onClick={() => setNaming(pendingName ?? picture.name ?? '')}
            title={`${pendingName ?? picture.name} - ${t('click to rename')}`}
            data-testid="editor-name"
          >
            {pendingName ?? picture.name}
          </button>
        ) : picture === null && job === null ? (
          <button
            type="button"
            className={styles.toolbarTitle}
            onClick={() => setNaming(newName)}
            title={t('Click to name the picture before it is drawn')}
            data-testid="editor-name"
          >
            {newName || t('New image')}
          </button>
        ) : (
          <span className={styles.toolbarTitle} title={picture?.prompt ?? job?.prompt} data-testid="editor-name">
            {picture !== null ? picture.prompt : (job?.name ?? job?.prompt)}
          </span>
        )}
        {/* Said as a control and not only as a title that happens to be clickable. */}
        {naming === null && (picture === null ? job === null : picture.name !== null) && (
          <button
            type="button"
            className={styles.tool}
            onClick={() => setNaming(picture === null ? newName : (pendingName ?? picture.name ?? ''))}
            title={picture === null ? t('Name the picture') : t('Rename the picture')}
            aria-label={picture === null ? t('Name the picture') : t('Rename the picture')}
            data-testid="editor-rename"
          >
            <img src={pencilIcon} alt="" width={14} height={14} />
          </button>
        )}
        {picture?.draft === true && <span className={styles.draftMark}>{t('Draft')}</span>}
        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.tool}
            onClick={zoomOut}
            disabled={picture === null}
            title={`${t('Zoom out')} (${zoomOutKey})`}
            aria-label={t('Zoom out')}
            data-testid="editor-zoom-out"
          >
            −
          </button>
          <button
            type="button"
            className={styles.zoomLevel}
            onClick={() => setZoom(null)}
            disabled={picture === null}
            title={t('Fit to the canvas')}
            data-testid="editor-zoom"
          >
            {zoom === null ? t('Fit') : `${Math.round(zoom * 100)}%`}
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={zoomIn}
            disabled={picture === null}
            title={`${t('Zoom in')} (${zoomInKey})`}
            aria-label={t('Zoom in')}
            data-testid="editor-zoom-in"
          >
            +
          </button>
          <span className={styles.toolbarGap} aria-hidden="true" />
          <button
            type="button"
            className={styles.tool}
            onClick={undo}
            disabled={past.length === 0 && prompt === (typingFrom.current?.prompt ?? prompt)}
            title={`${t('Undo')} (${undoKey})`}
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
            title={`${t('Redo')} (${redoKey})`}
            aria-label={t('Redo')}
            data-testid="editor-redo"
          >
            <img src={redoIcon} alt="" width={16} height={16} />
          </button>
          <span className={styles.toolbarGap} aria-hidden="true" />
          <button type="button" className={form.ghost} onClick={discard} disabled={!canDiscard || busy} data-testid="editor-discard">
            {t('Discard')}
          </button>
          <button type="button" className={form.filled} onClick={save} disabled={!canSave || busy} data-testid="editor-save">
            {picture !== null && !picture.draft && pendingName === null ? t('Saved') : t('Save')}
          </button>
        </div>
      </div>

      <div className={styles.editor}>
        <div className={styles.canvas} data-testid="editor-canvas" onWheel={onWheel}>
          <div className={`${styles.stage} ${zoom === null ? '' : styles.stageZoomed}`}>
            {job !== null && job.status !== 'DRAWN' ? (
              job.status === 'FAILED' ? (
                <p className={styles.failed} role="alert" data-testid="editor-failed">
                  {tf('Not drawn: {reason}', { reason: job.reason ?? t('the model gave no reason') })}
                </p>
              ) : (
                // One mark from the first moment, saying what it is waiting for: a drawing is never quick enough to hide it.
                <div className={styles.waiting} data-testid="editor-drawing">
                  <Loader
                    label={
                      job.status === 'QUEUED' && (job.ahead ?? 0) > 0
                        ? tf('Queued, {ahead} ahead…', { ahead: job.ahead ?? 0 })
                        : t('Drawing…')
                    }
                    delay={0}
                    size={72}
                  />
                </div>
              )
            ) : picture === null ? (
              <p className={styles.empty}>{t('Describe a picture on the right and generate it.')}</p>
            ) : (
              <img
                ref={pictureRef}
                src={picture.url}
                alt={picture.prompt}
                className={zoom === null ? styles.picture : styles.pictureZoomed}
                style={
                  zoom === null || pictureRef.current === null
                    ? undefined
                    : { width: `${pictureRef.current.naturalWidth * zoom}px`, height: `${pictureRef.current.naturalHeight * zoom}px` }
                }
                data-testid="editor-picture"
              />
            )}
          </div>
          {made.length > 0 && (
            <div className={styles.strip} aria-label={t('Asked for here')}>
              {made.map(({ job: one }) => {
                const chosen =
                  (shown?.kind === 'job' && shown.jobId === one.id) ||
                  (shown?.kind === 'picture' && one.image !== null && shown.picture.id === one.image.id);
                return (
                  <button
                    key={one.id}
                    type="button"
                    className={`${styles.stripItem} ${chosen ? styles.stripChosen : ''}`}
                    onClick={() => {
                      if (chosen) return;
                      remember();
                      show(one.image !== null ? { kind: 'picture', picture: one.image } : { kind: 'job', jobId: one.id });
                    }}
                    title={one.prompt}
                    data-status={one.status}
                  >
                    {one.image !== null ? (
                      <img src={one.image.url} alt={one.prompt} />
                    ) : one.status === 'FAILED' ? (
                      <span className={styles.stripFailed}>!</span>
                    ) : (
                      <Loader label="" delay={0} size={28} />
                    )}
                  </button>
                );
              })}
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
            disabled={prompt.trim() === '' || modelId === '' || queueing}
          >
            {t('Generate')}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
