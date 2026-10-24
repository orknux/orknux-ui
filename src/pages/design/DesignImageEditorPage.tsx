import { useEffect, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  discardDesignImageVersions,
  dismissDesignImageJob,
  fetchDesignImageHistory,
  fetchDesignImageEditorSettings,
  fetchDesignImageJob,
  fetchWorkspaceArtifact,
  importDesignImage,
  keepDesignImageChange,
  queueDesignImage,
  queueDesignImageEdit,
  queueDesignImageHarmonize,
  queueDesignImageUpscale,
  renameDesignImage,
  saveDesignImageVersion,
  stopDesignImageJob,
} from '../../api/artifacts';
import type { Artifact, DesignImageJob } from '../../api/artifacts';
import { fetchImageModelParameters } from '../../api/graph';
import type { ImageParameterSpec } from '../../api/graph';
import { fetchImageSizePresets } from '../../api/imagePresets';
import type { ImageSizePreset } from '../../api/imagePresets';
import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import type { SessionUser } from '../../api/session';
import blurIcon from '../../assets/blur.svg';
import brushIcon from '../../assets/brush.svg';
import cropIcon from '../../assets/crop.svg';
import flipHorizontalIcon from '../../assets/flip-horizontal.svg';
import flipVerticalIcon from '../../assets/flip-vertical.svg';
import pencilIcon from '../../assets/pencil.svg';
import redoIcon from '../../assets/redo.svg';
import rotateLeftIcon from '../../assets/rotate-left.svg';
import rotateRightIcon from '../../assets/rotate-right.svg';
import selectAllIcon from '../../assets/select-all.svg';
import lassoIcon from '../../assets/select-lasso.svg';
import rectangleIcon from '../../assets/select-rectangle.svg';
import undoIcon from '../../assets/undo.svg';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { UnsavedWorkDialog } from '../../components/UnsavedWorkDialog';
import { askBeforeLeaving, useLeaveGuard } from '../../components/leaveGuard';
import {
  matches,
  useMagicAllShortcut,
  useSaveShortcut,
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
import { DesignHarmonizeDialog } from './DesignHarmonizeDialog';
import { DesignPicturePickerDialog } from './DesignPicturePickerDialog';
import layersIcon from '../../assets/layers.svg';
import { DesignUpscaleDialog } from './DesignUpscaleDialog';
import { exportPicture, readPictureFile } from './pictureFiles';
import type { ExportFormat } from './pictureFiles';
import { blurredInside, boxOf, canvasOf, cropped, layered, loadImage, mirrored, painted, rotated, strokePath } from './pictureEdits';
import type { Layer, Point, Stroke } from './pictureEdits';
import { t, tf } from '../../i18n';
import { Select } from '../../components/Select';
import { videoFromPicturePath } from './useVideoFromPicture';

export interface DesignImageEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** Marks the editor's own move to New - undo back past a drawing - which is not somebody asking for a new picture. */
const OWN_MOVE = 'orknuxEditorMove';

/**
 * The editor as the routes hold it: a fresh page where somebody arrives at New
 * from anywhere else, and the same page across the editor's own moves.
 *
 * Both halves matter. A picture's editor left for New must not carry that
 * picture's state, which is why New used to be keyed in the routes; but the
 * editor moves itself between the two addresses - a picture drawn on New moves
 * the address to its own, and undoing it moves it back - and a key on one route
 * remounted the page on every such move, so a drawn picture took its undo, and
 * everything else on the page, with it. So the page is renewed here, by what
 * moved the address, rather than by which route it is on.
 */
export function DesignImageEditorRoute(props: DesignImageEditorPageProps) {
  const location = useLocation();
  const [seen, setSeen] = useState(location.pathname);
  const [generation, setGeneration] = useState(0);
  if (seen !== location.pathname) {
    setSeen(location.pathname);
    const own = (location.state as Record<string, unknown> | null)?.[OWN_MOVE] === true;
    if (location.pathname.endsWith('/design/images/new') && !own) setGeneration((held) => held + 1);
  }
  return <DesignImageEditorPage key={generation} {...props} />;
}

type Asked = { size: string; quality: string; style: string };
const NOTHING: Asked = { size: '', quality: '', style: '' };

/** One request made on this page: the job, and its picture once drawn. */
type Made = { job: DesignImageJob };

/** What the canvas holds: a picture, a request on its way, or nothing yet. */
type Shown = { kind: 'picture'; picture: Artifact } | { kind: 'job'; jobId: string } | null;

/** Which way of selecting part of the picture is in hand. */
type MagicTool = 'rectangle' | 'lasso';

/** What the pointer does on the picture: a Magic selection, or one of the editor's own tools. */
type Tool = MagicTool | 'crop' | 'brush' | 'blur' | 'layers';

/** Whether a tool selects with a rectangle - two corners - rather than a lasso's outline. */
const boxed = (tool: Tool | null) => tool === 'rectangle' || tool === 'crop';

/** One step undo goes back to: what the panel held and what was on the canvas. */
type Snapshot = { prompt: string; modelId: string; asked: Asked; shown: Shown; pendingName: string | null; strokes: Stroke[]; layers: Layer[] };

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
  /** The workspace's upscale models: what the Upscale window offers, and nothing else. */
  const [upscalers, setUpscalers] = useState<Model[]>([]);
  const [upscaling, setUpscaling] = useState(false);
  /** Models are loaded and none of them upscales: the button says so rather than opening an empty window. */
  const noUpscaler = models !== null && upscalers.length === 0;
  const [harmonizing, setHarmonizing] = useState(false);
  /**
   * What Harmonize redraws with: each Stable Diffusion WebUI, by its upscale
   * model. Not an image model - its edit endpoint takes no strength, so it
   * redrew the whole picture rather than lightly, and an instruction put what
   * it asked for over all of it.
   */
  const harmonizers = upscalers;
  const noHarmonizer = models !== null && harmonizers.length === 0;
  const [exporting, setExporting] = useState(false);
  /** Import's menu open: a file, or a picture already in Orknux. */
  const [importMenu, setImportMenu] = useState(false);
  /** The window of pictures in Orknux open, and what the one chosen is for. */
  const [picking, setPicking] = useState<'open' | 'layer' | null>(null);
  /** A file being dragged over the canvas, which a drop opens here. */
  const [dropping, setDropping] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  /** A file picked to lay over the picture as a layer. */
  const layerFileRef = useRef<HTMLInputElement>(null);
  const [modelId, setModelId] = useState('');
  const [spec, setSpec] = useState<ImageParameterSpec[]>([]);
  const [presets, setPresets] = useState<ImageSizePreset[]>([]);
  const [prompt, setPrompt] = useState('');
  /** What the picture must not contain; sent only to a model that takes one, and empty takes the model's own. */
  const [negativePrompt, setNegativePrompt] = useState('');
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
  const allKey = useMagicAllShortcut();
  const saveKey = useSaveShortcut();
  const location = useLocation();
  /** Where to go once the leave guard has let go of its history - a copy just saved. */
  const goingTo = useRef<string | null>(null);

  const picture = shown?.kind === 'picture' ? shown.picture : null;
  /** The model chosen, for whether it takes a negative prompt and what its own is. */
  const chosen = models?.find((one) => one.id === modelId) ?? null;
  const takesNegative = chosen?.takesNegativePrompt ?? false;
  const job = shown?.kind === 'job' ? (made.find((one) => one.job.id === shown.jobId)?.job ?? null) : null;

  useEffect(() => {
    if (workspaceId === '') return;
    fetchModels(workspaceId)
      .then((all) => {
        setModels(all.filter((one) => one.kind === 'IMAGE'));
        setUpscalers(all.filter((one) => one.kind === 'UPSCALE' && one.enabled));
      })
      .catch(() => setModels([]));
    fetchImageSizePresets(workspaceId).then(setPresets).catch(() => setPresets([]));
    fetchDesignImageEditorSettings(workspaceId)
      .then((settings) => {
        setBrushMost(settings.brushMost);
        setBrushSize((held) => held ?? settings.brush);
        setBlurMost(settings.blurMost);
        setBlurRadius((held) => held ?? settings.blur);
        setFeatherMost(settings.featherMost);
        setFeather((held) => held ?? settings.feather);
      })
      .catch(() => undefined);
  }, [workspaceId]);

  // The picture opened, and what it was drawn from.
  useEffect(() => {
    if (artifactId === undefined || workspaceId === '') return;
    // Already shown - itself, or a version of it the address stands for.
    if (picture?.id === artifactId || picture?.versionOf === artifactId) return;
    let left = false;
    fetchWorkspaceArtifact(workspaceId, artifactId)
      .then(async (found) => {
        if (left || found === null) return;
        // A picture with a draft opens at the draft: unsaved changes are kept until Save or Discard, across leaving and restarts.
        const draft = found.draft === null ? null : await fetchWorkspaceArtifact(workspaceId, found.draft).catch(() => null);
        if (left) return;
        setShown({ kind: 'picture', picture: draft ?? found });
        setPrompt(found.prompt);
        // Its history from the server, not from this page's memory, or a reload empties the strip while the versions are kept.
        void fetchDesignImageHistory(workspaceId, found.id)
          .then((history) => {
            if (left) return;
            const read = new Set(history.map((one) => one.id));
            setMade((held) => [...held.filter((one) => !read.has(one.job.id)), ...history.map((job) => ({ job }))]);
          })
          .catch(() => undefined);
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
        setNegativePrompt(found.negativePrompt ?? '');
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
                navigate(`/workspace/${workspaceId}/design/images/${now.image?.versionOf ?? now.image?.id}/edit`, { replace: true });
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

  const now = (): Snapshot => ({ prompt, modelId, asked, shown, pendingName, strokes, layers });
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
    // The zoom stays: an edit's result is looked at where the change was looked at. Fit is the way back.
    // A request still on its way keeps the address where it is; its picture moves it when it comes.
    if (next?.kind === 'job') return;
    const path =
      next?.kind === 'picture'
        ? // A version is shown at the picture it is a version of: Save then moves nothing, and the leave guard's history holds.
          `/workspace/${workspaceId}/design/images/${next.picture.versionOf ?? next.picture.id}/edit`
        : `/workspace/${workspaceId}/design/images/new`;
    navigate(path, { replace: true, state: { [OWN_MOVE]: true } });
  };
  const restore = (to: Snapshot) => {
    setPrompt(to.prompt);
    // Another model reads its parameters afresh, and keeps these where it takes them.
    if (to.modelId !== modelId) setCarried(to.asked);
    setModelId(to.modelId);
    setAsked(to.asked);
    show(to.shown);
    setPendingName(to.pendingName);
    setStrokes(to.strokes);
    setLayers(to.layers);
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

  const keys = useRef({ undo, redo, zoomIn, zoomOut, forget: () => {}, pick: (_: Tool) => {}, all: () => {}, apply: (): boolean => false, save: async () => true, bringIn: async (_: File, __?: boolean) => {} });
  keys.current = { undo, redo, zoomIn, zoomOut, forget: () => {}, pick: (_: Tool) => {}, all: () => {}, apply: (): boolean => false, save: async () => true, bringIn: async (_: File, __?: boolean) => {} };
  // The shortcuts chosen in Preferences; the number pad's + and - zoom too. Not in a text box,
  // where the box's own undo of its text applies.
  useEffect(() => {
    const pressed = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        keys.current.forget();
        return;
      }
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
      // Save, chosen in Preferences, heard in a text box too - as the other editors hear it.
      if (matches(event, saveKey)) {
        event.preventDefault();
        void keys.current.save();
        return;
      }
      if (matches(event, zoomInKey) || ((event.ctrlKey || event.metaKey) && event.code === 'NumpadAdd')) {
        event.preventDefault();
        keys.current.zoomIn();
      } else if (matches(event, zoomOutKey) || ((event.ctrlKey || event.metaKey) && event.code === 'NumpadSubtract')) {
        event.preventDefault();
        keys.current.zoomOut();
      } else if (typing) {
        return;
      } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && keys.current.apply()) {
        // The tool in hand applied - a crop selected - as its bar's button would.
        event.preventDefault();
      } else if (matches(event, rectangleKey)) {
        event.preventDefault();
        keys.current.pick('rectangle');
      } else if (matches(event, lassoKey)) {
        event.preventDefault();
        keys.current.pick('lasso');
      } else if (matches(event, allKey)) {
        event.preventDefault();
        keys.current.all();
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
  }, [undoKey, redoKey, zoomInKey, zoomOutKey, rectangleKey, lassoKey, allKey, saveKey]);

  // -- Magic edit ---------------------------------------------------------

  /*
   * Select part of the picture with a rectangle or a lasso, say what to change
   * there, and the image model's edit endpoint redraws only that: the result is
   * a new picture, queued like any other, and the one changed stays as it was.
   */
  const [tool, setTool] = useState<Tool | null>(null);
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
  /**
   * How far the edge of a change blends into the picture, in its own pixels -
   * so zoom does not change it. Starts where Admin Settings says; null sends
   * none and the server takes the installation's.
   */
  const [feather, setFeather] = useState<number | null>(null);
  const [featherMost, setFeatherMost] = useState<number | null>(null);
  const [changing, setChanging] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // A picture pasted anywhere on the page opens like one imported; text pasted into a box stays text.
  keys.current.bringIn = bringIn;
  useEffect(() => {
    const pasted = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((one) => one.type.startsWith('image/'));
      if (file === undefined) return;
      event.preventDefault();
      void keys.current.bringIn(file, true);
    };
    window.addEventListener('paste', pasted);
    return () => window.removeEventListener('paste', pasted);
  }, []);

  useEffect(() => {
    if (!exporting && !importMenu) return;
    const away = (event: MouseEvent) => {
      const inside = (selector: string) => event.target instanceof Element && event.target.closest(selector) !== null;
      if (!inside('[data-testid="editor-export-menu"], [data-testid="editor-export"]')) setExporting(false);
      if (!inside('[data-testid="editor-import-menu"], [data-testid="editor-import"]')) setImportMenu(false);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [exporting, importMenu]);

  /** The picture's own size, once it has loaded: what the selection layer draws in. */
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  // The model a change is asked of: the panel's own, until one is chosen here.
  useEffect(() => {
    if (editModelId === '' && modelId !== '') setEditModelId(modelId);
  }, [modelId, editModelId]);

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
    if (selectsBox()) setSelecting([selecting[0], at]);
    else setSelecting([...selecting, at]);
  };
  const finishSelecting = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (selecting === null) return;
    const drawn = selecting;
    setSelecting(null);
    const outline =
      selectsBox() && drawn.length === 2
        ? [drawn[0], { x: drawn[1].x, y: drawn[0].y }, drawn[1], { x: drawn[0].x, y: drawn[1].y }]
        : drawn;
    const xs = outline.map((point) => point.x);
    const ys = outline.map((point) => point.y);
    if (outline.length < 3 || Math.max(...xs) - Math.min(...xs) < SMALLEST_SELECTION || Math.max(...ys) - Math.min(...ys) < SMALLEST_SELECTION) return;
    setSelection(outline);
    // A crop or a blur is applied from its bar; only a Magic selection asks what to change, by the pointer.
    if (tool === 'crop' || tool === 'blur') return;
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
        feather,
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

  /** The picture made larger: a version of it, drawn behind the page as an edit is, its whole frame pulsing meanwhile. */
  async function upscale(upscaleModelId: string, algorithm: string, scale: number) {
    const shownPicture = pictureRef.current;
    if (picture === null || shownPicture === null) return;
    const queued = await queueDesignImageUpscale({ workspaceId, imageId: picture.id, modelId: upscaleModelId, algorithm, scale });
    const width = shownPicture.naturalWidth;
    const height = shownPicture.naturalHeight;
    remember();
    setChangingOver((held) => ({
      ...held,
      [queued.id]: { url: picture.url, width, height, points: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] },
    }));
    setMade((held) => [{ job: queued }, ...held]);
    forget();
    setUpscaling(false);
    show({ kind: 'job', jobId: queued.id });
  }

  /** The whole picture redrawn lightly, so a Magic edit's seams blend: a version of it, its whole frame pulsing meanwhile, as an upscale is. */
  async function harmonize(harmonizeModelId: string, described: string, strength: number | null, checkpoint: string | null) {
    const shownPicture = pictureRef.current;
    if (picture === null || shownPicture === null) return;
    const queued = await queueDesignImageHarmonize({
      workspaceId,
      imageId: picture.id,
      modelId: harmonizeModelId,
      prompt: described,
      strength,
      checkpoint,
    });
    const width = shownPicture.naturalWidth;
    const height = shownPicture.naturalHeight;
    remember();
    setChangingOver((held) => ({
      ...held,
      [queued.id]: { url: picture.url, width, height, points: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] },
    }));
    setMade((held) => [{ job: queued }, ...held]);
    forget();
    setHarmonizing(false);
    show({ kind: 'job', jobId: queued.id });
  }

  /*
   * Layers: pictures laid over the one being edited - from a file or from
   * Orknux - each moved by dragging it, sized, made more or less opaque,
   * hidden, and put above or below the others, until they are merged into
   * the picture as one version. Every change to them is a step undo takes
   * back. They are held on the page until merged, as a rename is, so leaving
   * with some asks first; a tool that changes the picture merges them first.
   */
  const [layers, setLayers] = useState<Layer[]>([]);
  /** The layer being worked on: dragging moves it, the panel marks it. */
  const [layerId, setLayerId] = useState<string | null>(null);
  /** Each layer's picture, loaded once, so merging draws at once. */
  const layerImages = useRef(new Map<string, HTMLImageElement>());
  const layerCount = useRef(0);
  /** A layer being dragged: where the pointer went down, and where the layer was then. */
  const [dragging, setDragging] = useState<{ id: string; from: Point; x: number; y: number } | null>(null);

  /**
   * The picture shown, on a canvas of its own at its own size, with the layers
   * and what the brush has painted over it and not yet kept - so a tool used
   * next works on what is on the screen. Null before it has loaded.
   */
  const pictureCanvas = (): HTMLCanvasElement | null => {
    const shownPicture = pictureRef.current;
    if (picture === null || shownPicture === null || shownPicture.naturalWidth === 0) return null;
    let drawn = canvasOf(shownPicture);
    const over = layers
      .filter((one) => one.visible)
      .flatMap((layer) => {
        const image = layerImages.current.get(layer.url);
        return image === undefined ? [] : [{ image, layer }];
      });
    if (over.length > 0) drawn = layered(drawn, over);
    return strokes.length === 0 ? drawn : painted(drawn, strokes);
  };

  /** A picture laid over the one shown as a new layer, fitted inside it and centred, on top of the others. */
  async function addLayer(url: string, name: string) {
    if (natural === null) return;
    try {
      const image = layerImages.current.get(url) ?? (await loadImage(url));
      layerImages.current.set(url, image);
      const scale = Math.min(1, natural.width / image.naturalWidth, natural.height / image.naturalHeight);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      layerCount.current += 1;
      const id = `layer-${layerCount.current}`;
      remember();
      setLayers((held) => [
        ...held,
        { id, name, url, x: Math.round((natural.width - width) / 2), y: Math.round((natural.height - height) / 2), width, height, opacity: 1, visible: true },
      ]);
      setLayerId(id);
      setTool('layers');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not open that file.'));
    }
  }
  /** One layer changed; the step before it is remembered only where [step] says so, as a drag is one step and not one per move. */
  const changeLayer = (id: string, change: Partial<Layer>, step = true) => {
    if (step) remember();
    setLayers((held) => held.map((one) => (one.id === id ? { ...one, ...change } : one)));
  };
  /** A layer moved up or down the stack: up is nearer the top, drawn over the rest. */
  const restack = (id: string, by: 1 | -1) => {
    const at = layers.findIndex((one) => one.id === id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= layers.length) return;
    remember();
    const next = [...layers];
    [next[at], next[to]] = [next[to], next[at]];
    setLayers(next);
  };
  const removeLayer = (id: string) => {
    remember();
    setLayers((held) => held.filter((one) => one.id !== id));
  };
  /** The layers merged into the picture, as one version. */
  async function mergeLayers(): Promise<void> {
    const drawn = layers.length === 0 ? null : pictureCanvas();
    if (drawn !== null) await keepChange(drawn, t('Layers merged'));
  }
  const startDragging = (event: ReactPointerEvent<SVGElement>, layer: Layer) => {
    if (tool !== 'layers' || event.button !== 0) return;
    const at = onPicture(event);
    if (at === null) return;
    event.stopPropagation();
    (event.currentTarget.ownerSVGElement ?? event.currentTarget).setPointerCapture(event.pointerId);
    setLayerId(layer.id);
    remember();
    setDragging({ id: layer.id, from: at, x: layer.x, y: layer.y });
  };
  const keepDragging = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging === null) return;
    const shownPicture = pictureRef.current;
    if (shownPicture === null) return;
    // Not clamped to the picture: a layer may hang over its edge, and what hangs over is cut off when merged.
    const box = shownPicture.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * shownPicture.naturalWidth;
    const y = ((event.clientY - box.top) / box.height) * shownPicture.naturalHeight;
    changeLayer(dragging.id, { x: Math.round(dragging.x + x - dragging.from.x), y: Math.round(dragging.y + y - dragging.from.y) }, false);
  };

  /** Keeps a change worked out here, and shows it; throws where it could not be kept. */
  async function keepNow(drawn: HTMLCanvasElement, change: string): Promise<Artifact | null> {
    if (picture === null) return null;
    const kept = await keepDesignImageChange({ workspaceId, imageId: picture.id, image: drawn.toDataURL('image/png'), change });
    // The state it replaces goes on the stack, strokes not yet kept included: undo goes back to them.
    remember();
    setStrokes([]);
    setLayers([]);
    setMade((held) => [{ job: kept }, ...held]);
    forget();
    if (kept.image !== null) show({ kind: 'picture', picture: kept.image });
    return kept.image;
  }

  /**
   * A change worked out here kept as a version of the picture shown - a draft
   * Save writes and Discard throws away, and a step undo goes back over, as a
   * model's change is. Answers the version, or null where it could not be kept.
   */
  async function keepChange(drawn: HTMLCanvasElement, change: string): Promise<Artifact | null> {
    if (picture === null || busy) return null;
    setBusy(true);
    setError(null);
    try {
      return await keepNow(drawn, change);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not keep the change.'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** A quarter turn, or a mirror image: done at once, as a version of the picture. */
  const turn = (way: 'left' | 'right') => {
    const drawn = pictureCanvas();
    if (drawn !== null) void keepChange(rotated(drawn, way), way === 'left' ? t('Rotated left') : t('Rotated right'));
  };
  const mirror = (axis: 'horizontal' | 'vertical') => {
    const drawn = pictureCanvas();
    if (drawn !== null) void keepChange(mirrored(drawn, axis), axis === 'horizontal' ? t('Flipped horizontally') : t('Flipped vertically'));
  };

  /*
   * The brush: strokes painted over the picture, drawn on the screen as they
   * go and kept as one version when it is applied - or put down, or saved.
   * Each stroke is a step undo takes back. Its width is in the picture's own
   * pixels, so zooming does not change it; it starts where Admin Settings says.
   */
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [stroking, setStroking] = useState<Stroke | null>(null);
  const [brushSize, setBrushSize] = useState<number | null>(null);
  const [brushMost, setBrushMost] = useState<number | null>(null);
  const [brushColour, setBrushColour] = useState('#000000');
  /** What has been done on the page and not yet kept: strokes painted, layers laid over. */
  const pending = strokes.length > 0 || layers.length > 0;
  const startStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool !== 'brush' || event.button !== 0 || brushSize === null) return;
    const at = onPicture(event);
    if (at === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setStroking({ colour: brushColour, size: brushSize, points: [at] });
  };
  const keepStroking = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (stroking === null) return;
    const at = onPicture(event);
    if (at !== null) setStroking({ ...stroking, points: [...stroking.points, at] });
  };
  const finishStroke = () => {
    if (stroking === null) return;
    remember();
    setStrokes((held) => [...held, stroking]);
    setStroking(null);
  };
  /** What the brush painted, kept as a version of the picture. */
  async function applyPaint(): Promise<void> {
    const drawn = strokes.length === 0 ? null : pictureCanvas();
    if (drawn !== null) await keepChange(drawn, t('Painted with the brush'));
  }

  /*
   * Selective blur: part of the picture selected with a rectangle or a lasso,
   * as Magic edit selects, and blurred inside it only. The tool stays in hand,
   * so one part after another can be blurred; each is a version.
   */
  const [blurShape, setBlurShape] = useState<'rectangle' | 'lasso'>('rectangle');
  const [blurRadius, setBlurRadius] = useState<number | null>(null);
  const [blurMost, setBlurMost] = useState<number | null>(null);
  /** Whether the tool in hand selects with a rectangle - two corners - rather than a lasso's outline. */
  const selectsBox = () => boxed(tool) || (tool === 'blur' && blurShape === 'rectangle');
  function applyBlur() {
    const drawn = pictureCanvas();
    if (drawn === null || selection === null || tool !== 'blur' || blurRadius === null) return;
    void keepChange(blurredInside(drawn, selection, blurRadius), tf('Blurred, {radius} px', { radius: blurRadius }));
  }

  /** The box a crop selection keeps, in the picture's whole pixels; null with nothing selected to crop to. */
  const cropBox = tool === 'crop' && selection !== null && natural !== null ? boxOf(selection, natural.width, natural.height) : null;
  /** The picture made what is inside the crop's box; the tool is put down once it is kept. */
  function applyCrop() {
    const drawn = pictureCanvas();
    if (drawn === null || selection === null || tool !== 'crop') return;
    const box = boxOf(selection, drawn.width, drawn.height);
    void keepChange(cropped(drawn, box), tf('Cropped to {width}×{height}', { width: box.width, height: box.height })).then((kept) => {
      if (kept !== null) setTool(null);
    });
  }

  /**
   * A file brought in - picked, or dropped on the canvas - kept as a picture of
   * its own and opened here. An .orkx file brings its name and prompt with it.
   */
  async function bringIn(file: File, pasted = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const read = await readPictureFile(file);
      const kept =
        'archive' in read
          ? await importDesignImage({ workspaceId, archive: read.archive })
          : // A pasted picture's file is always "image.png", which names nothing.
            await importDesignImage({ workspaceId, image: read.image, name: pasted ? t('Pasted picture') : read.name });
      navigate(`/workspace/${workspaceId}/design/images/${kept.id}/edit`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not open that file.'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * A picture already in Orknux opened here - Design's own, or one a run, a
   * task or an agent drew or kept. Opened as it is rather than copied, as a file
   * is: it is already somewhere to be found, and a copy would be a second
   * picture in the gallery nobody asked for. Save writes over it; Save as copy
   * leaves it as it was.
   */
  function openFromOrknux(chosen: Artifact) {
    if (chosen.id === picture?.id || chosen.id === picture?.versionOf) return;
    navigate(`/workspace/${workspaceId}/design/images/${chosen.id}/edit`);
  }

  async function exportAs(format: ExportFormat) {
    setExporting(false);
    if (picture === null) return;
    try {
      await exportPicture(workspaceId, picture, pendingName ?? picture.name ?? t('Picture'), format);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not export the picture.'));
    }
  }

  /** The selection's outline as the layer over the picture draws it. */
  /** The selection's outline in the picture's own pixels, which is what the layer over it draws in. */
  const outlineOf = (points: Point[]) => {
    const corners =
      selectsBox() && points.length === 2
        ? [points[0], { x: points[1].x, y: points[0].y }, points[1], { x: points[0].x, y: points[1].y }]
        : points;
    return corners.map((point) => `${point.x},${point.y}`).join(' ');
  };

  keys.current.forget = forget;
  /** The whole picture selected, and what to change asked over its middle. */
  const selectAll = () => {
    const shownPicture = pictureRef.current;
    const area = canvasRef.current;
    if (picture === null || shownPicture === null || area === null || shownPicture.naturalWidth === 0) return;
    const width = shownPicture.naturalWidth;
    const height = shownPicture.naturalHeight;
    setSelecting(null);
    setSelection([{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]);
    // Asked over the middle of what can be seen of the picture, which zoomed may be less than all of it.
    const box = shownPicture.getBoundingClientRect();
    const around = area.getBoundingClientRect();
    const left = Math.max(box.left, around.left) - around.left;
    const right = Math.min(box.right, around.right) - around.left;
    const top = Math.max(box.top, around.top) - around.top;
    const bottom = Math.min(box.bottom, around.bottom) - around.top;
    setAskAt({ x: (left + right) / 2 - 150, y: (top + bottom) / 2 - 100 });
  };

  keys.current.all = selectAll;
  keys.current.save = () => save();
  /** A tool picked by its shortcut, or put down by it again; nothing without a picture to select on. */
  keys.current.pick = (which: Tool) => pick(which);
  /** A tool picked, or put down by picking it again; nothing without a picture to use it on. */
  function pick(which: Tool) {
    if (picture === null) return;
    forget();
    // The brush put down keeps what it painted, so nothing painted is left floating over another tool.
    if (tool === 'brush' && strokes.length > 0) void applyPaint();
    setTool((held) => (held === which ? null : which));
  }
  /** What Enter applies with the tool in hand; false where it applies nothing, and Enter is left alone. */
  keys.current.apply = () => {
    if (tool === 'crop' && selection !== null) {
      applyCrop();
      return true;
    }
    if (tool === 'blur' && selection !== null) {
      applyBlur();
      return true;
    }
    return false;
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
        // Never to a model that takes none: the server refuses one there rather than drawing without it.
        negativePrompt: takesNegative && negativePrompt.trim() !== '' ? negativePrompt.trim() : null,
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
  /**
   * Writes what is held: changes made here saved over the picture, and a new
   * name. Answers whether it was written, for the leave guard.
   */
  async function save(): Promise<boolean> {
    if (picture === null || busy) return !unsaved && !drafted;
    if (picture.versionOf == null && pendingName === null && !pending) return true;
    setBusy(true);
    setError(null);
    try {
      // What the brush painted and the layers laid over are kept first, and saved with the rest.
      const painting = pending ? pictureCanvas() : null;
      const said = layers.length > 0 ? t('Layers merged') : t('Painted with the brush');
      const current = (painting === null ? null : await keepNow(painting, said)) ?? picture;
      let kept = current;
      if (current.versionOf != null) {
        const of = current.versionOf;
        kept = await saveDesignImageVersion(workspaceId, current.id);
        // The versions are gone; what they were is now the picture.
        setMade((held) => held.filter((one) => one.job.image?.versionOf !== of));
        setPast([]);
        setFuture([]);
      }
      if (pendingName !== null) kept = await renameDesignImage(workspaceId, kept.id, pendingName);
      setPendingName(null);
      setShown({ kind: 'picture', picture: kept });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the picture.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * The changes made here saved as a picture of its own, and the picture they
   * were made to left as it was saved - its unsaved changes thrown away. The
   * editor then goes on with the copy.
   */
  async function saveAsCopy(): Promise<void> {
    if (picture === null || picture.versionOf == null || busy) return;
    const of = picture.versionOf;
    setBusy(true);
    setError(null);
    try {
      let copy = await saveDesignImageVersion(workspaceId, picture.id, true);
      if (pendingName !== null) copy = await renameDesignImage(workspaceId, copy.id, pendingName);
      setPendingName(null);
      setMade((held) => held.filter((one) => one.job.image?.versionOf !== of));
      setPast([]);
      setFuture([]);
      const to = `/workspace/${workspaceId}/design/images/${copy.id}/edit`;
      setShown({ kind: 'picture', picture: copy });
      // With a rename held, the leave guard holds a spare history entry: moved to once it has stepped off it,
      // or that step lands back on the original. Without one there is nothing to wait for.
      if (unsaved) goingTo.current = to;
      else navigate(to, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the picture.'));
    } finally {
      setBusy(false);
    }
  }

  /** The changes made here thrown away, back to the picture as it was saved. */
  async function dropVersions(): Promise<void> {
    const of = picture?.versionOf ?? null;
    if (of === null) return;
    await discardDesignImageVersions(workspaceId, of);
    setMade((held) => held.filter((one) => one.job.image?.versionOf !== of));
    setPast([]);
    setFuture([]);
    const original = await fetchWorkspaceArtifact(workspaceId, of).catch(() => null);
    show(original === null ? null : { kind: 'picture', picture: original });
  }

  /** A rename not saved let go, or a request still waiting taken off; the canvas moves to the one before. */
  /** Stops the request shown, waiting or being drawn; it stays in view, said to be stopped. */
  async function stop() {
    if (job === null || (job.status !== 'QUEUED' && job.status !== 'DRAWING')) return;
    const id = job.id;
    setBusy(true);
    setError(null);
    try {
      const now = await stopDesignImageJob(workspaceId, id);
      setMade((held) => held.map((one) => (one.job.id === id ? { job: now } : one)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not stop it.'));
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (busy) return;
    // Strokes and layers not yet kept go first: they are the newest thing on the page.
    if (pending) {
      remember();
      setStrokes([]);
      setLayers([]);
      return;
    }
    if (pendingName !== null) {
      setPendingName(null);
      return;
    }
    if (picture?.versionOf != null) {
      setBusy(true);
      try {
        await dropVersions();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('Could not discard it.'));
      } finally {
        setBusy(false);
      }
      return;
    }
    const dropping = job !== null && (job.status === 'QUEUED' || job.status === 'FAILED' || job.status === 'STOPPED') ? job.id : null;
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

  /**
   * What leaving would lose: a rename, which is held on the page alone. Changes
   * drawn here are a draft kept by the server, so leaving loses nothing of them.
   */
  const unsaved = picture !== null && (pendingName !== null || pending);
  /** The picture shown is a draft: changes Save would write over the picture. */
  const drafted = picture !== null && picture.versionOf != null;
  useEffect(() => {
    const to = goingTo.current;
    if (to === null || unsaved) return;
    if ((location.state as Record<string, unknown> | null)?.orknuxUnsavedWork === true) return;
    goingTo.current = null;
    navigate(to, { replace: true });
  }, [location.key, unsaved]);
  const canSave = unsaved || drafted;
  const guard = useLeaveGuard({ unsaved, backTo: `/workspace/${workspaceId}/design/images`, save });
  const canDiscard =
    canSave || pendingName !== null || (job !== null && (job.status === 'QUEUED' || job.status === 'FAILED' || job.status === 'STOPPED'));

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
        {picture?.versionOf != null && (
          <span className={styles.unsavedMark} data-testid="editor-unsaved" title={t('Changes not saved yet, kept until Save or Discard')}>
            {t('Draft')}
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
              disabled={picture === null || pending}
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
              disabled={picture === null || pending}
              aria-pressed={tool === 'lasso'}
              title={`${t('Magic lasso select')} (${lassoKey})`}
              aria-label={t('Magic lasso select')}
              data-testid="magic-lasso"
            >
              <img src={lassoIcon} alt="" width={16} height={16} />
            </button>
            <button
              type="button"
              className={styles.tool}
              onClick={selectAll}
              disabled={picture === null || pending}
              title={`${t('Magic select all')} (${allKey})`}
              aria-label={t('Magic select all')}
              data-testid="magic-all"
            >
              <img src={selectAllIcon} alt="" width={16} height={16} />
            </button>
          </div>
          <span className={styles.toolbarGap} aria-hidden="true" />
          {/* With no upscale model, why not and where to add one - at once on hover, not after a title's delay. */}
          <span className={styles.upscaleWrap} data-testid="editor-upscale-wrap">
            <button
              type="button"
              className={`${form.ghost} ${styles.toolbarButton}`}
              onClick={() => {
                forget();
                setUpscaling(true);
              }}
              disabled={picture === null || busy || noUpscaler || pending}
              title={noUpscaler ? undefined : t('Make the picture larger with an upscale model')}
              data-testid="editor-upscale"
            >
              {t('Upscale')}
            </button>
            {noUpscaler && (
              <span className={styles.upscaleHint} role="tooltip" data-testid="editor-upscale-hint">
                {t('There is no upscale model in this workspace. Add a Stable Diffusion WebUI provider and an Upscale model under it.')}{' '}
                <Link to={`/workspace/${workspaceId}/models`} data-testid="editor-upscale-models">
                  {t('Go to Models')}
                </Link>
              </span>
            )}
          </span>
          {/* Beside Upscale, and like it says at once why not and where to add a model. */}
          <span className={styles.upscaleWrap} data-testid="editor-harmonize-wrap">
            <button
              type="button"
              className={`${form.ghost} ${styles.toolbarButton}`}
              onClick={() => {
                forget();
                setHarmonizing(true);
              }}
              disabled={picture === null || busy || noHarmonizer || pending}
              title={noHarmonizer ? undefined : t('Redraw the whole picture lightly, so the seams between changed parts blend')}
              data-testid="editor-harmonize"
            >
              {t('Harmonize')}
            </button>
            {noHarmonizer && (
              <span className={styles.upscaleHint} role="tooltip" data-testid="editor-harmonize-hint">
                {t('Harmonize redraws lightly through a Stable Diffusion WebUI, and this workspace has none. Add a WebUI provider and an Upscale model under it.')}{' '}
                <Link to={`/workspace/${workspaceId}/models`} data-testid="editor-harmonize-models">
                  {t('Go to Models')}
                </Link>
              </span>
            )}
          </span>
          <button
            type="button"
            className={`${form.ghost} ${styles.toolbarButton}`}
            onClick={() => {
              if (picture === null) return;
              const to = videoFromPicturePath(workspaceId, picture.id);
              if (!askBeforeLeaving(to)) navigate(to);
            }}
            disabled={picture === null || busy || pending}
            title={t('Make a video that starts from this picture')}
            data-testid="editor-to-video"
          >
            {t('Convert to video')}
          </button>
          <span className={styles.toolbarGap} aria-hidden="true" />
          <div className={styles.exportMenu}>
            <button
              type="button"
              className={`${form.ghost} ${styles.toolbarButton}`}
              onClick={() => setImportMenu((held) => !held)}
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={importMenu}
              title={t('Open a picture from a file or from Orknux, or drop one on the canvas')}
              data-testid="editor-import"
            >
              {t('Import')} ▾
            </button>
            {importMenu && (
              <div className={styles.exportItems} role="menu" data-testid="editor-import-menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setImportMenu(false);
                    importRef.current?.click();
                  }}
                  data-testid="editor-import-from-file"
                >
                  {t('From a file…')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setImportMenu(false);
                    setPicking('open');
                  }}
                  data-testid="editor-import-from-orknux"
                >
                  {t('From Orknux…')}
                </button>
              </div>
            )}
          </div>
          <input
            ref={importRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,.orkx"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file !== undefined) void bringIn(file);
            }}
            data-testid="editor-import-file"
          />
          <div className={styles.exportMenu}>
            <button
              type="button"
              className={`${form.ghost} ${styles.toolbarButton}`}
              onClick={() => setExporting((held) => !held)}
              disabled={picture === null}
              aria-haspopup="menu"
              aria-expanded={exporting}
              data-testid="editor-export"
            >
              {t('Export')} ▾
            </button>
            {exporting && (
              <div className={styles.exportItems} role="menu" data-testid="editor-export-menu">
                <button type="button" role="menuitem" onClick={() => void exportAs('png')} data-testid="editor-export-png">
                  PNG
                </button>
                <button type="button" role="menuitem" onClick={() => void exportAs('jpeg')} data-testid="editor-export-jpeg">
                  JPEG
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void exportAs('orkx')}
                  title={t('An archive of the picture with its name, prompt and parameters, to import into Orknux again')}
                  data-testid="editor-export-orkx"
                >
                  {t('Orknux (.orkx)')}
                </button>
              </div>
            )}
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
          {/* A blank canvas, without going back to the gallery for it; unsaved changes here are asked about on the way out. */}
          <Link
            className={form.ghost}
            style={{ textDecoration: 'none' }}
            to={`/workspace/${workspaceId}/design/images/new`}
            title={t('Start a new picture')}
            data-testid="editor-new"
          >
            {t('New')}
          </Link>
          <button type="button" className={form.ghost} onClick={discard} disabled={!canDiscard || busy} data-testid="editor-discard">
            {t('Discard')}
          </button>
          <button
            type="button"
            className={form.ghost}
            onClick={() => void saveAsCopy()}
            disabled={picture?.versionOf == null || busy}
            title={t('Saves the changes as a new picture and leaves this one as it was')}
            data-testid="editor-save-copy"
          >
            {t('Save as copy')}
          </button>
          <button type="button" className={form.filled} onClick={save} disabled={!canSave || busy} data-testid="editor-save">
            {t('Save')}
          </button>
        </div>
      </div>

      <div className={styles.editor}>
        {/* What the editor does to the picture itself, without a model: down the canvas's left, as an editor's tools are. */}
        <div className={styles.rail} role="toolbar" aria-orientation="vertical" aria-label={t('Edit')} data-testid="editor-tools">
          <button
            type="button"
            className={styles.tool}
            onClick={() => turn('left')}
            disabled={picture === null || busy}
            title={t('Rotate left')}
            aria-label={t('Rotate left')}
            data-testid="editor-rotate-left"
          >
            <img src={rotateLeftIcon} alt="" width={16} height={16} />
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={() => turn('right')}
            disabled={picture === null || busy}
            title={t('Rotate right')}
            aria-label={t('Rotate right')}
            data-testid="editor-rotate-right"
          >
            <img src={rotateRightIcon} alt="" width={16} height={16} />
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={() => mirror('horizontal')}
            disabled={picture === null || busy}
            title={t('Flip horizontally')}
            aria-label={t('Flip horizontally')}
            data-testid="editor-flip-horizontal"
          >
            <img src={flipHorizontalIcon} alt="" width={16} height={16} />
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={() => mirror('vertical')}
            disabled={picture === null || busy}
            title={t('Flip vertically')}
            aria-label={t('Flip vertically')}
            data-testid="editor-flip-vertical"
          >
            <img src={flipVerticalIcon} alt="" width={16} height={16} />
          </button>
          <span className={styles.railGap} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.tool} ${tool === 'brush' ? styles.railOn : ''}`}
            onClick={() => pick('brush')}
            disabled={picture === null || busy}
            aria-pressed={tool === 'brush'}
            title={t('Brush')}
            aria-label={t('Brush')}
            data-testid="editor-brush"
          >
            <img src={brushIcon} alt="" width={16} height={16} />
          </button>
          <button
            type="button"
            className={`${styles.tool} ${tool === 'crop' ? styles.railOn : ''}`}
            onClick={() => pick('crop')}
            disabled={picture === null || busy}
            aria-pressed={tool === 'crop'}
            title={t('Crop')}
            aria-label={t('Crop')}
            data-testid="editor-crop"
          >
            <img src={cropIcon} alt="" width={16} height={16} />
          </button>
          <button
            type="button"
            className={`${styles.tool} ${tool === 'blur' ? styles.railOn : ''}`}
            onClick={() => pick('blur')}
            disabled={picture === null || busy}
            aria-pressed={tool === 'blur'}
            title={t('Blur')}
            aria-label={t('Blur')}
            data-testid="editor-blur"
          >
            <img src={blurIcon} alt="" width={16} height={16} />
          </button>
          <span className={styles.railGap} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.tool} ${tool === 'layers' ? styles.railOn : ''}`}
            onClick={() => pick('layers')}
            disabled={picture === null || busy}
            aria-pressed={tool === 'layers'}
            title={t('Layers')}
            aria-label={t('Layers')}
            data-testid="editor-layers"
          >
            <img src={layersIcon} alt="" width={16} height={16} />
          </button>
        </div>
        <div
          className={`${styles.canvas} ${dropping ? styles.canvasDropping : ''}`}
          data-testid="editor-canvas"
          onWheel={onWheel}
          ref={canvasRef}
          onDragOver={(event) => {
            if (!Array.from(event.dataTransfer.types).includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDropping(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDropping(false);
          }}
          onDrop={(event) => {
            const file = event.dataTransfer.files[0];
            if (file === undefined) return;
            event.preventDefault();
            setDropping(false);
            void bringIn(file);
          }}
        >
          {tool === 'brush' && (
            <div className={styles.options} role="toolbar" aria-label={t('Brush')} data-testid="brush-options">
              <label className={styles.optionsField}>
                <span>{t('Size')}</span>
                <input
                  type="range"
                  min={1}
                  max={brushMost ?? brushSize ?? 1}
                  value={brushSize ?? 1}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  data-testid="brush-size"
                />
                <span className={styles.optionsValue}>{brushSize ?? ''}</span>
              </label>
              <label className={styles.optionsField}>
                <span>{t('Colour')}</span>
                <input type="color" value={brushColour} onChange={(event) => setBrushColour(event.target.value)} data-testid="brush-colour" />
              </label>
              <button
                type="button"
                className={form.ghost}
                onClick={() => {
                  if (strokes.length > 0) {
                    remember();
                    setStrokes([]);
                  }
                  setTool(null);
                }}
                data-testid="brush-cancel"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                className={form.filled}
                onClick={() => void applyPaint().then(() => setTool(null))}
                disabled={strokes.length === 0 || busy}
                data-testid="brush-apply"
              >
                {t('Apply')}
              </button>
            </div>
          )}
          {tool === 'blur' && (
            <div className={styles.options} role="toolbar" aria-label={t('Blur')} data-testid="blur-options">
              <button
                type="button"
                className={`${styles.tool} ${blurShape === 'rectangle' ? styles.railOn : ''}`}
                onClick={() => {
                  forget();
                  setBlurShape('rectangle');
                }}
                aria-pressed={blurShape === 'rectangle'}
                title={t('Rectangle')}
                aria-label={t('Rectangle')}
                data-testid="blur-rectangle"
              >
                <img src={rectangleIcon} alt="" width={16} height={16} />
              </button>
              <button
                type="button"
                className={`${styles.tool} ${blurShape === 'lasso' ? styles.railOn : ''}`}
                onClick={() => {
                  forget();
                  setBlurShape('lasso');
                }}
                aria-pressed={blurShape === 'lasso'}
                title={t('Lasso')}
                aria-label={t('Lasso')}
                data-testid="blur-lasso"
              >
                <img src={lassoIcon} alt="" width={16} height={16} />
              </button>
              <label className={styles.optionsField}>
                <span>{t('Radius')}</span>
                <input
                  type="range"
                  min={1}
                  max={blurMost ?? blurRadius ?? 1}
                  value={blurRadius ?? 1}
                  onChange={(event) => setBlurRadius(Number(event.target.value))}
                  data-testid="blur-radius"
                />
                <span className={styles.optionsValue}>{blurRadius ?? ''}</span>
              </label>
              <button
                type="button"
                className={form.ghost}
                onClick={() => {
                  forget();
                  setTool(null);
                }}
                data-testid="blur-cancel"
              >
                {t('Cancel')}
              </button>
              <button type="button" className={form.filled} onClick={applyBlur} disabled={selection === null || blurRadius === null || busy} data-testid="blur-apply">
                {t('Blur')}
              </button>
            </div>
          )}
          {tool === 'layers' && (
            <div className={styles.layersPanel} role="group" aria-label={t('Layers')} data-testid="layers-panel">
              <div className={styles.layersHead}>
                <span>{t('Layers')}</span>
                <button type="button" className={form.ghost} onClick={() => layerFileRef.current?.click()} data-testid="layers-add-file">
                  {t('From a file…')}
                </button>
                <button type="button" className={form.ghost} onClick={() => setPicking('layer')} data-testid="layers-add-orknux">
                  {t('From Orknux…')}
                </button>
                <input
                  ref={layerFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file === undefined) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') void addLayer(reader.result, file.name.replace(/\.[^.]+$/, ''));
                    };
                    reader.readAsDataURL(file);
                  }}
                  data-testid="layers-file"
                />
              </div>
              {/* The top of the stack first, as it is seen; the picture itself at the foot, where it always is. */}
              {[...layers].reverse().map((layer) => (
                <div
                  key={layer.id}
                  className={`${styles.layerRow} ${layer.id === layerId ? styles.layerRowOn : ''}`}
                  onClick={() => setLayerId(layer.id)}
                  data-testid="layer-row"
                  data-id={layer.id}
                >
                  <div className={styles.layerTop}>
                    <img src={layer.url} alt="" className={styles.layerThumb} />
                    <span className={styles.layerName} title={layer.name}>{layer.name}</span>
                    <button
                      type="button"
                      className={styles.tool}
                      onClick={() => changeLayer(layer.id, { visible: !layer.visible })}
                      aria-pressed={!layer.visible}
                      title={layer.visible ? t('Hide') : t('Show')}
                      aria-label={layer.visible ? t('Hide') : t('Show')}
                      data-testid="layer-visible"
                    >
                      {layer.visible ? '◉' : '○'}
                    </button>
                    <button type="button" className={styles.tool} onClick={() => restack(layer.id, 1)} title={t('Move up')} aria-label={t('Move up')} data-testid="layer-up">
                      ↑
                    </button>
                    <button type="button" className={styles.tool} onClick={() => restack(layer.id, -1)} title={t('Move down')} aria-label={t('Move down')} data-testid="layer-down">
                      ↓
                    </button>
                    <button type="button" className={styles.tool} onClick={() => removeLayer(layer.id)} title={t('Remove')} aria-label={t('Remove')} data-testid="layer-remove">
                      ×
                    </button>
                  </div>
                  <label className={styles.optionsField}>
                    <span>{t('Opacity')}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(layer.opacity * 100)}
                      onPointerDown={remember}
                      onKeyDown={remember}
                      onChange={(event) => changeLayer(layer.id, { opacity: Number(event.target.value) / 100 }, false)}
                      data-testid="layer-opacity"
                    />
                    <span className={styles.optionsValue}>{Math.round(layer.opacity * 100)}%</span>
                  </label>
                  <label className={styles.optionsField}>
                    <span>{t('Size')}</span>
                    <input
                      type="range"
                      min={5}
                      max={400}
                      value={Math.round((layer.width / (layerImages.current.get(layer.url)?.naturalWidth ?? layer.width)) * 100)}
                      onPointerDown={remember}
                      onKeyDown={remember}
                      onChange={(event) => {
                        const image = layerImages.current.get(layer.url);
                        if (image === undefined) return;
                        const scale = Number(event.target.value) / 100;
                        const width = Math.max(1, Math.round(image.naturalWidth * scale));
                        const height = Math.max(1, Math.round(image.naturalHeight * scale));
                        // Sized about its middle, so it stays where it was put.
                        changeLayer(
                          layer.id,
                          { width, height, x: Math.round(layer.x + (layer.width - width) / 2), y: Math.round(layer.y + (layer.height - height) / 2) },
                          false,
                        );
                      }}
                      data-testid="layer-size"
                    />
                    <span className={styles.optionsValue}>
                      {Math.round((layer.width / (layerImages.current.get(layer.url)?.naturalWidth ?? layer.width)) * 100)}%
                    </span>
                  </label>
                </div>
              ))}
              <div className={`${styles.layerRow} ${styles.layerBase}`} data-testid="layer-base">
                <div className={styles.layerTop}>
                  {picture !== null && <img src={picture.url} alt="" className={styles.layerThumb} />}
                  <span className={styles.layerName}>{t('Picture')}</span>
                </div>
              </div>
              <button type="button" className={form.filled} onClick={() => void mergeLayers()} disabled={layers.length === 0 || busy} data-testid="layers-merge">
                {t('Merge layers')}
              </button>
            </div>
          )}
          {tool === 'crop' && (
            <div className={styles.options} role="toolbar" aria-label={t('Crop')} data-testid="crop-options">
              <span className={styles.optionsValue} data-testid="crop-size">
                {cropBox === null ? t('Select the part to keep') : `${cropBox.width} × ${cropBox.height}`}
              </span>
              <button
                type="button"
                className={form.ghost}
                onClick={() => {
                  forget();
                  setTool(null);
                }}
                data-testid="crop-cancel"
              >
                {t('Cancel')}
              </button>
              <button type="button" className={form.filled} onClick={applyCrop} disabled={cropBox === null || busy} data-testid="crop-apply">
                {t('Crop')}
              </button>
            </div>
          )}
          {dropping && (
            <div className={styles.dropHint} data-testid="editor-drop-hint">
              {t('Drop a picture to open it here')}
            </div>
          )}
          <div className={`${styles.stage} ${zoom === null ? '' : styles.stageZoomed}`}>
            {/*
              A change that failed leaves the picture it was asked of, so the
              picture stays and the failure is said over it - hiding it read as
              the picture being lost. Its size is said as a fact beside the
              model's own words, and nothing is guessed about why: a server may
              answer "no results" for any reason, and only it knows which.
            */}
            {job !== null && job.status === 'FAILED' && (
              <p className={`${styles.failed} ${changingOver[job.id] === undefined ? '' : styles.failedOver}`} role="alert" data-testid="editor-failed">
                {tf('Not drawn: {reason}', { reason: job.reason ?? t('the model gave no reason') })}
                {changingOver[job.id] !== undefined && (
                  <>
                    {' '}
                    {tf('The picture asked of is {width}×{height}.', {
                      width: changingOver[job.id].width,
                      height: changingOver[job.id].height,
                    })}
                  </>
                )}
              </p>
            )}
            {job !== null && job.status === 'STOPPED' && (
              <p className={`${styles.stopped} ${changingOver[job.id] === undefined ? '' : styles.stoppedOver}`} role="status" data-testid="editor-stopped">
                {t('Stopped')}
              </p>
            )}
            {job !== null && (job.status === 'QUEUED' || job.status === 'DRAWING') ? (
              changingOver[job.id] !== undefined ? (
                (() => {
                  const over = changingOver[job.id];
                  const points = over.points;
                  return (
                    // The picture being changed stays in view, what is being redrawn highlighted, and the wait said under it.
                    <div className={styles.changing}>
                    <div className={styles.changingFrame} data-testid="editor-changing">
                      <img
                        src={over.url}
                        alt=""
                        className={zoom === null ? styles.changingPicture : styles.pictureZoomed}
                        style={zoom === null ? undefined : { width: `${over.width * zoom}px`, height: `${over.height * zoom}px` }}
                      />
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
                        <button type="button" className={`${form.ghost} ${styles.stop}`} onClick={() => void stop()} disabled={busy} data-testid="editor-stop">
                          {t('Stop')}
                        </button>
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
                  <button type="button" className={`${form.ghost} ${styles.stop}`} onClick={() => void stop()} disabled={busy} data-testid="editor-stop">
                    {t('Stop')}
                  </button>
                </div>
              )
            ) : picture === null && (job?.status === 'FAILED' || job?.status === 'STOPPED') && changingOver[job.id] !== undefined ? (
              <div className={styles.pictureFrame}>
                <img
                  src={changingOver[job.id].url}
                  alt=""
                  className={zoom === null ? styles.picture : styles.pictureZoomed}
                  style={
                    zoom === null
                      ? undefined
                      : { width: `${changingOver[job.id].width * zoom}px`, height: `${changingOver[job.id].height * zoom}px` }
                  }
                  data-testid="editor-failed-picture"
                />
              </div>
            ) : picture === null ? (
              <p className={styles.empty}>{t('Describe a picture on the right and generate it.')}</p>
            ) : (
              /*
                The selection is drawn in the picture's own frame, in its own
                pixels: it scrolls, zooms and is cut off with the picture, where
                laid over it from outside it drifted off a picture zoomed past
                the canvas and scrolled.
              */
              <div className={styles.pictureFrame}>
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
                  onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                  data-testid="editor-picture"
                />
                {natural !== null && layers.length > 0 && (
                  // The layers over the picture, in its own pixels, the first lowest; dragged with the Layers tool in hand.
                  <svg
                    className={`${styles.selectLayer} ${tool === 'layers' ? styles.layersOn : ''}`}
                    viewBox={`0 0 ${natural.width} ${natural.height}`}
                    preserveAspectRatio="none"
                    onPointerMove={keepDragging}
                    onPointerUp={() => setDragging(null)}
                    data-testid="layers-layer"
                  >
                    {layers.map((layer) =>
                      layer.visible ? (
                        <image
                          key={layer.id}
                          href={layer.url}
                          x={layer.x}
                          y={layer.y}
                          width={layer.width}
                          height={layer.height}
                          opacity={layer.opacity}
                          preserveAspectRatio="none"
                          className={tool === 'layers' ? styles.layerImage : undefined}
                          onPointerDown={(event) => startDragging(event, layer)}
                          data-testid="layer-image"
                          data-id={layer.id}
                        />
                      ) : null,
                    )}
                    {tool === 'layers' &&
                      layers
                        .filter((layer) => layer.id === layerId && layer.visible)
                        .map((layer) => (
                          <rect key="chosen" className={styles.cropEdge} x={layer.x} y={layer.y} width={layer.width} height={layer.height} pointerEvents="none" />
                        ))}
                  </svg>
                )}
                {natural !== null && (tool === 'brush' || strokes.length > 0) && (
                  // What the brush paints, over the picture in its own pixels, as it will be kept.
                  <svg
                    className={`${styles.selectLayer} ${tool === 'brush' ? styles.selectLayerOn : ''}`}
                    viewBox={`0 0 ${natural.width} ${natural.height}`}
                    preserveAspectRatio="none"
                    onPointerDown={startStroke}
                    onPointerMove={keepStroking}
                    onPointerUp={finishStroke}
                    data-testid="brush-layer"
                  >
                    {[...strokes, ...(stroking === null ? [] : [stroking])].map((stroke, index) => (
                      <path
                        key={index}
                        d={strokePath(stroke.points)}
                        fill="none"
                        stroke={stroke.colour}
                        strokeWidth={stroke.size}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </svg>
                )}
                {natural !== null && tool !== 'brush' && tool !== 'layers' && (tool !== null || selection !== null) && (
                  <svg
                    className={`${styles.selectLayer} ${tool !== null ? styles.selectLayerOn : ''}`}
                    viewBox={`0 0 ${natural.width} ${natural.height}`}
                    preserveAspectRatio="none"
                    onPointerDown={startSelecting}
                    onPointerMove={keepSelecting}
                    onPointerUp={finishSelecting}
                    data-testid="magic-layer"
                  >
                    {(selecting ?? selection) !== null &&
                      (tool === 'crop' ? (
                        // What a crop leaves out, dimmed around what it keeps.
                        <>
                          <path
                            className={styles.cropShade}
                            fillRule="evenodd"
                            d={`M0 0H${natural.width}V${natural.height}H0Z M${outlineOf(selecting ?? selection ?? []).replace(/ /g, ' L')}Z`}
                          />
                          <polygon className={styles.cropEdge} points={outlineOf(selecting ?? selection ?? [])} data-testid="crop-selection" />
                        </>
                      ) : tool === 'blur' ? (
                        <polygon className={styles.cropEdge} points={outlineOf(selecting ?? selection ?? [])} data-testid="blur-selection" />
                      ) : (
                        <polygon className={styles.selected} points={outlineOf(selecting ?? selection ?? [])} data-testid="magic-selection" />
                      ))}
                  </svg>
                )}
              </div>
            )}
          </div>
          {selection !== null && askAt !== null && (
            <form
              className={styles.ask}
              style={{
                left: Math.max(8, Math.min(askAt.x + 12, (canvasRef.current?.clientWidth ?? 0) - 320)),
                top: Math.max(8, Math.min(askAt.y + 12, (canvasRef.current?.clientHeight ?? 0) - 260)),
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
              <Select
                className={`${form.input} ${form.select}`}
                value={editModelId}
                onChange={(picked) => setEditModelId(picked)}
                aria-label={t('Edit model')}
                title={t('Edit model')}
                data-testid="magic-model"
              >
                {(models ?? []).map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name} · {one.providerName}
                  </option>
                ))}
              </Select>
              {/* How far the edge of the change blends into the picture, in its own pixels; 0 is a hard edge. */}
              <label className={styles.optionsField}>
                <span>{t('Feather')}</span>
                <input
                  className={`${form.input} ${styles.askNumber}`}
                  type="number"
                  min={0}
                  max={featherMost ?? undefined}
                  value={feather ?? ''}
                  onChange={(event) => setFeather(event.target.value === '' ? null : Math.max(0, Math.round(Number(event.target.value))))}
                  data-testid="magic-feather"
                />
                <span>px</span>
              </label>
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
            /*
              Newest first, so the one on the left is on top - the last asked
              for, made from the ones to its right. Each is numbered in the
              order it was asked for, 1 the first, under its picture.
            */
            <div
              className={styles.strip}
              aria-label={t('Asked for here')}
              title={t('Numbered in the order asked for: the highest, on the left, is on top')}
              data-testid="editor-strip"
            >
              {made.map(({ job: one }, index) => {
                const chosen =
                  (shown?.kind === 'job' && shown.jobId === one.id) ||
                  (shown?.kind === 'picture' && one.image !== null && shown.picture.id === one.image.id);
                const order = made.length - index;
                return (
                  <div key={one.id} className={styles.stripCell}>
                    <button
                      type="button"
                      className={`${styles.stripItem} ${chosen ? styles.stripChosen : ''}`}
                      onClick={() => {
                        if (chosen) return;
                        remember();
                        setStrokes([]);
                        show(one.image !== null ? { kind: 'picture', picture: one.image } : { kind: 'job', jobId: one.id });
                      }}
                      title={one.prompt}
                      data-status={one.status}
                    >
                      {one.image !== null ? (
                        <img src={one.image.url} alt={one.prompt} />
                      ) : one.status === 'FAILED' ? (
                        <span className={styles.stripFailed}>!</span>
                      ) : one.status === 'STOPPED' ? (
                        <span className={styles.stripStopped} aria-label={t('Stopped')}>■</span>
                      ) : (
                        <Loader label="" delay={0} size={28} />
                      )}
                    </button>
                    <span className={styles.stripOrder} data-testid="editor-strip-order">{order}</span>
                  </div>
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

          {takesNegative && (
            <div className={form.field} data-testid="image-negative-prompt">
              <label className={form.label} htmlFor="image-negative">{t('Negative prompt')}</label>
              <div className={form.inputWrapper}>
                <input
                  id="image-negative"
                  className={form.input}
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder={chosen?.negativePrompt ?? t('What the picture must not contain')}
                />
              </div>
            </div>
          )}

          <div className={form.field}>
            <label className={form.label} htmlFor="image-model">{t('Model')}</label>
            <div className={form.inputWrapper}>
              <Select
                id="image-model"
                className={`${form.input} ${form.select}`}
                value={modelId}
                onChange={(picked) => {
                  remember();
                  setModelId(picked);
                }}
                disabled={models === null || models.length === 0}
              >
                {models !== null && models.length === 0 && <option value="">{t('This workspace has no image model')}</option>}
                {(models ?? []).map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name} · {one.providerName}
                  </option>
                ))}
              </Select>
            </div>
            {models !== null && models.length === 0 && (
              <Link className={styles.configureLink} to={`/workspace/${workspaceId}/models`} data-testid="editor-models-link">
                {t('Add an image model in Models')}
              </Link>
            )}
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
                    <Select
                      className={`${form.input} ${form.select}`}
                      aria-label={t('Preset')}
                      value=""
                      onChange={(id) => {
                        const picked = presets.find((preset) => preset.id === id);
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
                    </Select>
                  </div>
                )}
              </div>
            ) : (
              <div key={one.name} className={form.field} data-testid={`image-${one.name}`}>
                <label className={form.label} htmlFor={`image-${one.name}`}>{labelOf(one.name)}</label>
                <div className={form.inputWrapper}>
                  <Select
                    id={`image-${one.name}`}
                    className={`${form.input} ${form.select}`}
                    value={asked[one.name as keyof Asked] ?? ''}
                    onChange={(picked) => {
                      remember();
                      setAsked({ ...asked, [one.name]: picked });
                    }}
                  >
                    <option value="">{t('Model default')}</option>
                    {one.choices.map((choice) => (
                      <option key={choice} value={choice}>{choice}</option>
                    ))}
                  </Select>
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
      <DesignUpscaleDialog
        open={upscaling}
        workspaceId={workspaceId}
        models={upscalers}
        width={natural?.width ?? 0}
        height={natural?.height ?? 0}
        onClose={() => setUpscaling(false)}
        onUpscale={upscale}
      />
      <DesignHarmonizeDialog
        open={harmonizing}
        workspaceId={workspaceId}
        models={harmonizers}
        defaultModelId={modelId}
        prompt={picture?.prompt ?? prompt}
        onClose={() => setHarmonizing(false)}
        onHarmonize={harmonize}
      />
      <DesignPicturePickerDialog
        open={picking !== null}
        workspaceId={workspaceId}
        onClose={() => setPicking(null)}
        title={picking === 'layer' ? t('Add a layer from Orknux') : t('Import from Orknux')}
        onPick={(chosen) => {
          const forLayer = picking === 'layer';
          setPicking(null);
          if (forLayer) void addLayer(chosen.url, chosen.name ?? chosen.prompt);
          else openFromOrknux(chosen);
        }}
      />
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
