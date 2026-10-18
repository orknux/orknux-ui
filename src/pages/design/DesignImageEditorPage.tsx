import { useEffect, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  dismissDesignImageJob,
  fetchDesignImageJob,
  fetchWorkspaceArtifact,
  queueDesignImage,
  queueDesignImageEdit,
  renameDesignImage,
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
import lassoIcon from '../../assets/select-lasso.svg';
import rectangleIcon from '../../assets/select-rectangle.svg';
import undoIcon from '../../assets/undo.svg';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { UnsavedWorkDialog } from '../../components/UnsavedWorkDialog';
import { askBeforeLeaving, useLeaveGuard } from '../../components/leaveGuard';
import {
  matches,
  useMagicLassoShortcut,
  useMagicRectangleShortcut,
  useRedoShortcut,
  useUndoShortcut,
  useZoomInShortcut,
  useZoomOutShortcut,
} from '../../session/shortcut';
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

/** A point on the picture, in its own pixels. */
type Point = { x: number; y: number };

/** Which way of selecting part of the picture is in hand. */
type MagicTool = 'rectangle' | 'lasso';

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
/** A selection smaller than this many pixels across is a slip of the hand, not a selection. */
const SMALLEST_SELECTION = 4;

/**
 * The selection as a mask the picture's size: opaque everywhere, transparent
 * inside the selection - where the standard edit interface puts the change.
 */
function maskOf(points: Point[], width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const pen = canvas.getContext('2d');
  if (pen === null) return '';
  pen.fillStyle = '#000';
  pen.fillRect(0, 0, width, height);
  pen.globalCompositeOperation = 'destination-out';
  pen.beginPath();
  points.forEach((point, index) => (index === 0 ? pen.moveTo(point.x, point.y) : pen.lineTo(point.x, point.y)));
  pen.closePath();
  pen.fill();
  return canvas.toDataURL('image/png');
}

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
 * ask for several, leave, and find them in the gallery. Save writes what is
 * held on the page - a new name - and only lights when there is one; leaving
 * with one unsaved asks first.
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
  const rectangleKey = useMagicRectangleShortcut();
  const lassoKey = useMagicLassoShortcut();

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
        if (found.sourceId !== null && found.status !== 'DRAWN') {
          void fetchWorkspaceArtifact(workspaceId, found.sourceId)
            .then((source) => {
              if (left || source === null) return;
              const probe = new Image();
              probe.onload = () =>
                setChangingOver((held) => ({
                  ...held,
                  [found.id]: { url: source.url, width: probe.naturalWidth, height: probe.naturalHeight, points: null },
                }));
              probe.src = source.url;
            })
            .catch(() => undefined);
        }
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

  const keys = useRef({ undo, redo, zoomIn, zoomOut, forget: () => {}, pick: (_: MagicTool) => {} });
  keys.current = { undo, redo, zoomIn, zoomOut, forget: () => {}, pick: (_: MagicTool) => {} };
  // The shortcuts chosen in Preferences; the number pad's + and - zoom too. Not in a text box,
  // where the box's own undo of its text applies.
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        keys.current.forget();
        return;
      }
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
      if (matches(event, zoomInKey) || ((event.ctrlKey || event.metaKey) && event.code === 'NumpadAdd')) {
        event.preventDefault();
        keys.current.zoomIn();
      } else if (matches(event, zoomOutKey) || ((event.ctrlKey || event.metaKey) && event.code === 'NumpadSubtract')) {
        event.preventDefault();
        keys.current.zoomOut();
      } else if (typing) {
        return;
      } else if (matches(event, rectangleKey)) {
        event.preventDefault();
        keys.current.pick('rectangle');
      } else if (matches(event, lassoKey)) {
        event.preventDefault();
        keys.current.pick('lasso');
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
  }, [undoKey, redoKey, zoomInKey, zoomOutKey, rectangleKey, lassoKey]);

  // -- Magic edit ---------------------------------------------------------

  /*
   * Select part of the picture with a rectangle or a lasso, say what to change
   * there, and the image model's edit endpoint redraws only that: the result is
   * a new picture, queued like any other, and the one changed stays as it was.
   */
  const [tool, setTool] = useState<MagicTool | null>(null);
  /**
   * What each change asked here is drawn over: the picture, and the selection
   * in its pixels - null where the selection is not known, for a change opened
   * from the gallery. So the picture stays on the canvas while it is drawn,
   * with only the part being changed veiled.
   */
  const [changingOver, setChangingOver] = useState<
    Record<string, { url: string; width: number; height: number; points: Point[] | null }>
  >({});
  /** The selection being drawn, and the finished one, in the picture's own pixels. */
  const [selecting, setSelecting] = useState<Point[] | null>(null);
  const [selection, setSelection] = useState<Point[] | null>(null);
  /** Where on the canvas the change is asked for: next to where the pointer let go. */
  const [askAt, setAskAt] = useState<{ x: number; y: number } | null>(null);
  const [change, setChange] = useState('');
  const [editModelId, setEditModelId] = useState('');
  const [changing, setChanging] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  /** Where the picture is drawn on the canvas, which the selection layer is laid over. */
  const [frame, setFrame] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // The model a change is asked of: the panel's own, until one is chosen here.
  useEffect(() => {
    if (editModelId === '' && modelId !== '') setEditModelId(modelId);
  }, [modelId, editModelId]);

  const measure = () => {
    const shownPicture = pictureRef.current;
    const area = canvasRef.current;
    if (shownPicture === null || area === null) {
      setFrame(null);
      return;
    }
    const box = shownPicture.getBoundingClientRect();
    const around = area.getBoundingClientRect();
    setFrame({ left: box.left - around.left, top: box.top - around.top, width: box.width, height: box.height });
  };
  useEffect(() => {
    measure();
    const area = canvasRef.current;
    if (area === null) return;
    const watcher = new ResizeObserver(measure);
    watcher.observe(area);
    window.addEventListener('resize', measure);
    return () => {
      watcher.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [picture?.id, zoom]);

  /** A selection is about the picture it was drawn on; another picture starts afresh. */
  const forget = () => {
    setSelecting(null);
    setSelection(null);
    setAskAt(null);
  };
  useEffect(forget, [picture?.id]);

  /** The pointer, in the picture's own pixels. */
  const onPicture = (event: ReactPointerEvent): Point | null => {
    const shownPicture = pictureRef.current;
    if (shownPicture === null) return null;
    const box = shownPicture.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * shownPicture.naturalWidth;
    const y = ((event.clientY - box.top) / box.height) * shownPicture.naturalHeight;
    return {
      x: Math.min(shownPicture.naturalWidth, Math.max(0, x)),
      y: Math.min(shownPicture.naturalHeight, Math.max(0, y)),
    };
  };

  const startSelecting = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === null || event.button !== 0) return;
    const at = onPicture(event);
    if (at === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection(null);
    setAskAt(null);
    setSelecting([at]);
  };
  const keepSelecting = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (selecting === null) return;
    const at = onPicture(event);
    if (at === null) return;
    if (tool === 'rectangle') setSelecting([selecting[0], at]);
    else setSelecting([...selecting, at]);
  };
  const finishSelecting = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (selecting === null) return;
    const drawn = selecting;
    setSelecting(null);
    const outline =
      tool === 'rectangle' && drawn.length === 2
        ? [drawn[0], { x: drawn[1].x, y: drawn[0].y }, drawn[1], { x: drawn[0].x, y: drawn[1].y }]
        : drawn;
    const xs = outline.map((point) => point.x);
    const ys = outline.map((point) => point.y);
    if (outline.length < 3 || Math.max(...xs) - Math.min(...xs) < SMALLEST_SELECTION || Math.max(...ys) - Math.min(...ys) < SMALLEST_SELECTION) return;
    setSelection(outline);
    const around = canvasRef.current?.getBoundingClientRect();
    if (around === undefined) return;
    setAskAt({ x: event.clientX - around.left, y: event.clientY - around.top });
  };

  async function changeSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shownPicture = pictureRef.current;
    if (picture === null || selection === null || shownPicture === null || change.trim() === '' || editModelId === '' || changing) return;
    setChanging(true);
    setError(null);
    try {
      const queued = await queueDesignImageEdit({
        workspaceId,
        imageId: picture.id,
        modelId: editModelId,
        prompt: change.trim(),
        mask: maskOf(selection, shownPicture.naturalWidth, shownPicture.naturalHeight),
      });
      remember();
      setChangingOver((held) => ({
        ...held,
        [queued.id]: { url: picture.url, width: shownPicture.naturalWidth, height: shownPicture.naturalHeight, points: selection },
      }));
      setMade((held) => [{ job: queued }, ...held]);
      setChange('');
      forget();
      show({ kind: 'job', jobId: queued.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not ask for the change.'));
    } finally {
      setChanging(false);
    }
  }

  /** The selection's outline as the layer over the picture draws it. */
  const outlineOf = (points: Point[]) => {
    const shownPicture = pictureRef.current;
    if (shownPicture === null || frame === null) return '';
    const sx = frame.width / shownPicture.naturalWidth;
    const sy = frame.height / shownPicture.naturalHeight;
    const corners =
      tool === 'rectangle' && points.length === 2
        ? [points[0], { x: points[1].x, y: points[0].y }, points[1], { x: points[0].x, y: points[1].y }]
        : points;
    return corners.map((point) => `${point.x * sx},${point.y * sy}`).join(' ');
  };

  keys.current.forget = forget;
  /** A tool picked by its shortcut, or put down by it again; nothing without a picture to select on. */
  keys.current.pick = (which: MagicTool) => {
    if (picture === null) return;
    forget();
    setTool((held) => (held === which ? null : which));
  };

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

  /** Writes what is held: a new name. Answers whether it was written, for the leave guard. */
  async function save(): Promise<boolean> {
    if (picture === null || pendingName === null || busy) return pendingName === null;
    setBusy(true);
    setError(null);
    try {
      const kept = await renameDesignImage(workspaceId, picture.id, pendingName);
      setPendingName(null);
      setShown({ kind: 'picture', picture: kept });
      setMade((held) => held.map((one) => (one.job.image?.id === kept.id ? { job: { ...one.job, image: kept } } : one)));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the picture.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** A rename not saved let go, or a request still waiting taken off; the canvas moves to the one before. */
  async function discard() {
    if (busy) return;
    if (pendingName !== null) {
      setPendingName(null);
      return;
    }
    const dropping = job !== null && (job.status === 'QUEUED' || job.status === 'FAILED') ? job.id : null;
    if (dropping === null) return;
    setBusy(true);
    setError(null);
    try {
      await dismissDesignImageJob(dropping);
      const rest = made.filter((one) => one.job.id !== dropping);
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

  /** Something on the page that Save would write and leaving would lose. */
  const unsaved = picture !== null && pendingName !== null;
  const canSave = unsaved;
  const guard = useLeaveGuard({ unsaved, backTo: `/workspace/${workspaceId}/design/images`, save });
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
          onClick={() => {
            const to = `/workspace/${workspaceId}/design/images${picture === null ? '' : `/${picture.id}`}`;
            if (!askBeforeLeaving(to)) navigate(to);
          }}
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
        <div className={styles.toolbarRight}>
          {/* Selecting part of the picture to change: its own group, in the colour the product gives what is magic. */}
          <div className={styles.magic} role="group" aria-label={t('Magic edit')} data-testid="magic-edit">
            {/* Words, not an icon: an icon in a row of tools reads as one more tool. */}
            <span className={styles.magicMark} aria-hidden="true">{t('Magic')}</span>
            <button
              type="button"
              className={`${styles.tool} ${tool === 'rectangle' ? styles.toolOn : ''}`}
              onClick={() => {
                forget();
                setTool((held) => (held === 'rectangle' ? null : 'rectangle'));
              }}
              disabled={picture === null}
              aria-pressed={tool === 'rectangle'}
              title={`${t('Magic rectangle select')} (${rectangleKey})`}
              aria-label={t('Magic rectangle select')}
              data-testid="magic-rectangle"
            >
              <img src={rectangleIcon} alt="" width={16} height={16} />
            </button>
            <button
              type="button"
              className={`${styles.tool} ${tool === 'lasso' ? styles.toolOn : ''}`}
              onClick={() => {
                forget();
                setTool((held) => (held === 'lasso' ? null : 'lasso'));
              }}
              disabled={picture === null}
              aria-pressed={tool === 'lasso'}
              title={`${t('Magic lasso select')} (${lassoKey})`}
              aria-label={t('Magic lasso select')}
              data-testid="magic-lasso"
            >
              <img src={lassoIcon} alt="" width={16} height={16} />
            </button>
          </div>
          <span className={styles.toolbarGap} aria-hidden="true" />
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
            {t('Save')}
          </button>
        </div>
      </div>

      <div className={styles.editor}>
        <div className={styles.canvas} data-testid="editor-canvas" onWheel={onWheel} ref={canvasRef}>
          <div className={`${styles.stage} ${zoom === null ? '' : styles.stageZoomed}`} onScroll={measure}>
            {job !== null && job.status !== 'DRAWN' ? (
              job.status === 'FAILED' ? (
                <p className={styles.failed} role="alert" data-testid="editor-failed">
                  {tf('Not drawn: {reason}', { reason: job.reason ?? t('the model gave no reason') })}
                </p>
              ) : changingOver[job.id] !== undefined ? (
                (() => {
                  const over = changingOver[job.id];
                  const points = over.points;
                  return (
                    // The picture being changed stays in view, what is being redrawn highlighted, and the wait said under it.
                    <div className={styles.changing}>
                    <div className={styles.changingFrame} data-testid="editor-changing">
                      <img src={over.url} alt="" className={styles.changingPicture} />
                      <svg
                        className={styles.changingLayer}
                        viewBox={`0 0 ${over.width} ${over.height}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        {points === null ? (
                          <rect className={styles.changingArea} x={0} y={0} width={over.width} height={over.height} />
                        ) : (
                          <polygon className={styles.changingArea} points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
                        )}
                      </svg>
                    </div>
                      <div className={styles.changingMark} data-testid="editor-drawing">
                        <Loader
                          label={
                            job.status === 'QUEUED' && (job.ahead ?? 0) > 0
                              ? tf('Queued, {ahead} ahead…', { ahead: job.ahead ?? 0 })
                              : t('Drawing…')
                          }
                          delay={0}
                          size={40}
                        />
                      </div>
                    </div>
                  );
                })()
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
                onLoad={measure}
                data-testid="editor-picture"
              />
            )}
          </div>
          {picture !== null && frame !== null && (tool !== null || selection !== null) && (
            <svg
              className={`${styles.selectLayer} ${tool !== null ? styles.selectLayerOn : ''}`}
              style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
              onPointerDown={startSelecting}
              onPointerMove={keepSelecting}
              onPointerUp={finishSelecting}
              data-testid="magic-layer"
            >
              {(selecting ?? selection) !== null && (
                <polygon className={styles.selected} points={outlineOf(selecting ?? selection ?? [])} data-testid="magic-selection" />
              )}
            </svg>
          )}
          {selection !== null && askAt !== null && (
            <form
              className={styles.ask}
              style={{
                left: Math.max(8, Math.min(askAt.x + 12, (canvasRef.current?.clientWidth ?? 0) - 320)),
                top: Math.max(8, Math.min(askAt.y + 12, (canvasRef.current?.clientHeight ?? 0) - 220)),
              }}
              onSubmit={changeSelection}
              data-testid="magic-ask"
            >
              <textarea
                className={`${form.input} ${form.textarea} ${styles.askPrompt}`}
                value={change}
                onChange={(event) => setChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={t('What to change here')}
                aria-label={t('What to change here')}
                autoFocus
                data-testid="magic-prompt"
              />
              <select
                className={`${form.input} ${form.select}`}
                value={editModelId}
                onChange={(event) => setEditModelId(event.target.value)}
                aria-label={t('Edit model')}
                title={t('Edit model')}
                data-testid="magic-model"
              >
                {(models ?? []).map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name} · {one.providerName}
                  </option>
                ))}
              </select>
              <div className={styles.askActions}>
                <button type="button" className={form.ghost} onClick={forget}>
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  className={`${form.filled} ${styles.askChange}`}
                  disabled={change.trim() === '' || editModelId === '' || changing}
                  data-testid="magic-change"
                >
                  {t('Change')}
                </button>
              </div>
            </form>
          )}
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
      <UnsavedWorkDialog
        subject={guard.asking ? (pendingName ?? picture?.name ?? t('This picture')) : null}
        creating={false}
        onStay={guard.stay}
        onLeave={guard.leave}
        onSaveAndLeave={guard.saveAndLeave}
      />
    </AppShell>
  );
}
