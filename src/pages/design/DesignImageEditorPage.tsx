import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasHTMLAttributes, FormEvent, PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  discardDesignImageVersions,
  dismissDesignImageJob,
  fetchDesignImageHistory,
  fetchDesignImageLayers,
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
import { imagePaceLine, imagePaceOf } from './imagePace';
import type { ImagePace } from './imagePace';
import { fetchImageModelParameters } from '../../api/graph';
import type { ImageParameterSpec } from '../../api/graph';
import { fetchImageSizePresets } from '../../api/imagePresets';
import type { ImageSizePreset } from '../../api/imagePresets';
import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import type { SessionUser } from '../../api/session';
import blurIcon from '../../assets/blur.svg';
import chevronIcon from '../../assets/chevron-down-12.svg';
import blurGradientIcon from '../../assets/blur-gradient.svg';
import brushIcon from '../../assets/brush.svg';
import brushHardIcon from '../../assets/brush-hard.svg';
import brushMarkerIcon from '../../assets/brush-marker.svg';
import brushSoftIcon from '../../assets/brush-soft.svg';
import brushSquareIcon from '../../assets/brush-square.svg';
import eraserIcon from '../../assets/eraser.svg';
import cropIcon from '../../assets/crop.svg';
import flipHorizontalIcon from '../../assets/flip-horizontal.svg';
import flipVerticalIcon from '../../assets/flip-vertical.svg';
import trashIcon from '../../assets/trash-2.svg';
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
  useImageEditorShortcuts,
  IMAGE_EDITOR_SHORTCUTS,
} from '../../session/shortcut';
import { shellUser } from '../../session/user';
import form from '../../components/Dialog.module.css';
import { useSieve } from '../../components/sieve';
import { OpenDefinitionIcon } from '../../components/OpenDefinitionIcon';
import styles from './DesignImageEditorPage.module.css';
import { DesignHarmonizeDialog } from './DesignHarmonizeDialog';
import { DesignPicturePickerDialog } from './DesignPicturePickerDialog';
import layersIcon from '../../assets/layers.svg';
import videoIcon from '../../assets/video.svg';
import { DesignUpscaleDialog } from './DesignUpscaleDialog';
import { exportPicture, readPictureFile } from './pictureFiles';
import type { ExportFormat } from './pictureFiles';
import { blurredAlong, blurredInside, boxOf, canvasFrom, canvasOf, cropped, emptyLayer, flattened, mirrored, painted, rotated } from './pictureEdits';
import type { BrushStyle, Layer, Point, Stroke } from './pictureEdits';
import { t, tf } from '../../i18n';
import { Select } from '../../components/Select';
import { videoFromPicturePath } from './useVideoFromPicture';

export interface DesignImageEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * A layer's pixels on the page: its canvas copied into one of the page's own,
 * since a canvas can be shown in one place only and the layer's is held by
 * undo as well. Drawn again whenever the layer is a new canvas.
 */
function LayerView({ pixels, ...rest }: { pixels: HTMLCanvasElement } & CanvasHTMLAttributes<HTMLCanvasElement> & { 'data-testid'?: string; 'data-id'?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const pen = canvas?.getContext('2d');
    if (canvas == null || pen == null) return;
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    pen.clearRect(0, 0, canvas.width, canvas.height);
    pen.drawImage(pixels, 0, 0);
  }, [pixels]);
  return <canvas ref={ref} {...rest} />;
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
type Tool = MagicTool | 'crop' | 'brush' | 'blur';
/** The brush's tips, in the order its bar offers them, each with the one word its button is called. */
const BRUSH_STYLES: { style: BrushStyle; label: () => string; icon: string }[] = [
  { style: 'hard', label: () => t('Hard'), icon: brushHardIcon },
  { style: 'soft', label: () => t('Soft'), icon: brushSoftIcon },
  { style: 'square', label: () => t('Square'), icon: brushSquareIcon },
  { style: 'marker', label: () => t('Marker'), icon: brushMarkerIcon },
  { style: 'eraser', label: () => t('Eraser'), icon: eraserIcon },
];
/** Whether a tip has an edge to soften: the soft one, and the eraser. */
const softens = (style: BrushStyle) => style === 'soft' || style === 'eraser';

/** How the blur selects: a box, an outline, or a line from sharp to blurred. */
type BlurShape = 'rectangle' | 'lasso' | 'gradient';

/** Whether a tool selects with a rectangle - two corners - rather than a lasso's outline. */
const boxed = (tool: Tool | null) => tool === 'rectangle' || tool === 'crop';

/** One step undo goes back to: what the panel held and what was on the canvas. */
type Snapshot = {
  prompt: string;
  modelId: string;
  asked: Asked;
  shown: Shown;
  pendingName: string | null;
  strokes: Stroke[];
  layers: Layer[];
  layerId: string;
  baseVisible: boolean;
  baseUrl: string | null;
  layersDirty: boolean;
  /*
   * What was in hand and selected when the change was made, so undoing a blur,
   * a crop or an edit gives back the selection it was made over - to adjust
   * and apply again - rather than the picture alone with the selection gone.
   */
  tool: Tool | null;
  selection: Point[] | null;
  blurShape: BlurShape;
};

/** The picture's own place in the layers: at the foot of the stack, never taken away, renamed or moved. */
const PICTURE_LAYER = 'picture';

/** How long typing in the prompt pauses before it counts as one step to undo. */
const TYPING_SETTLES_MS = 700;
/** How often requests still on their way are asked about. */
const ASK_EVERY_MS = 1500;
/** Each zoom step, and how far zoom goes either way, as a share of the picture's own size. */
const ZOOM_STEP = 1.25;
const ZOOM_LEAST = 0.05;
const ZOOM_MOST = 8;
/** Each step of [ and ] on the brush's width, as a share of it - as zoom steps are - and never less than a pixel. */
const BRUSH_STEP = 1.2;
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
  /**
   * Clean up's window open: the upscale road at 1x, through a WebUI's
   * restoration models, for the blocks and speckle repeated edits leave.
   */
  const [cleaning, setCleaning] = useState(false);
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
  /** The menu of what a model does with the whole picture open: Upscale, Clean up, Harmonize. */
  const [modelMenu, setModelMenu] = useState(false);
  /** The window of pictures in Orknux open, and what the one chosen is for. */
  const [picking, setPicking] = useState(false);
  /** A file being dragged over the canvas, which a drop opens here. */
  const [dropping, setDropping] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
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
  /** The rail's tools, the brush's width and the blur's shapes, as Preferences has them. */
  const editorKeys = useImageEditorShortcuts();
  const location = useLocation();
  /**
   * Where to go once the leave guard has let go of its history - a copy just
   * saved, or the video page after Save & Leave - and whether that replaces
   * the editor's entry: the copy's editor does, the video page goes on top, so
   * Back from it is the editor.
   */
  const goingTo = useRef<{ to: string; replace: boolean } | null>(null);

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
        setBrushOpacity((held) => held ?? settings.brushOpacity);
        setMarkerOpacity((held) => held ?? settings.markerOpacity);
        setBrushHardness((held) => held ?? settings.brushHardness);
        setBlurMost(settings.blurMost);
        setBlurRadius((held) => held ?? settings.blur);
        setBlurFalloffMost(settings.blurFalloffMost);
        setBlurFalloff((held) => held ?? settings.blurFalloff);
        setFeatherMost(settings.featherMost);
        setFeather((held) => held ?? settings.feather);
        setLayersMost(settings.layersMost);
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

  // How long the picture shown has taken, and how long is left where anything knows; see imagePaceLine.
  const [pace, setPace] = useState<ImagePace | null>(null);
  useEffect(() => setPace(imagePaceOf(job, Date.now())), [job]);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (pace === null) return;
    const tick = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [pace === null]);
  const paceSaid = pace === null || pace.jobId !== job?.id ? null : imagePaceLine(pace, Math.max(clock, Date.now()));

  // -- Undo and redo ------------------------------------------------------

  const now = (): Snapshot => ({
    prompt,
    modelId,
    asked,
    shown,
    pendingName,
    strokes,
    layers,
    layerId,
    baseVisible,
    baseUrl,
    layersDirty,
    tool,
    selection,
    blurShape,
  });
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
    setLayerId(to.layerId);
    setBaseVisible(to.baseVisible);
    setBaseUrl(to.baseUrl);
    setLayersDirty(to.layersDirty);
    // The step holds its picture's layers already: nothing is read again for it.
    if (to.shown?.kind === 'picture') layersFor.current = to.shown.picture.id;
    setTool(to.tool);
    setBlurShape(to.blurShape);
    setSelection(to.selection);
    keepsSelection.current = to.shown?.kind === 'picture' && to.shown.picture.id !== picture?.id;
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

  const keys = useRef({ undo, redo, zoomIn, zoomOut, forget: () => {}, pick: (_: Tool) => {}, all: () => {}, apply: (): boolean => false, save: async () => true, bringIn: async (_: File, __?: boolean) => {}, tool: (_: KeyboardEvent): boolean => false });
  keys.current = { undo, redo, zoomIn, zoomOut, forget: () => {}, pick: (_: Tool) => {}, all: () => {}, apply: (): boolean => false, save: async () => true, bringIn: async (_: File, __?: boolean) => {}, tool: (_: KeyboardEvent): boolean => false };
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
      } else if (keys.current.tool(event)) {
        // One of the editor's own tools, by the key Preferences gives it.
        event.preventDefault();
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
    if (!exporting && !importMenu && !modelMenu) return;
    const away = (event: MouseEvent) => {
      const inside = (selector: string) => event.target instanceof Element && event.target.closest(selector) !== null;
      if (!inside('[data-testid="editor-export-menu"], [data-testid="editor-export"]')) setExporting(false);
      if (!inside('[data-testid="editor-import-menu"], [data-testid="editor-import"]')) setImportMenu(false);
      if (!inside('[data-testid="editor-ai-menu"], [data-testid="editor-ai"]')) setModelMenu(false);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [exporting, importMenu, modelMenu]);

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
  // Another picture drops what was selected over the last - unless undo or redo brought it there with its own selection.
  const keepsSelection = useRef(false);
  useEffect(() => {
    if (keepsSelection.current) {
      keepsSelection.current = false;
      return;
    }
    forget();
  }, [picture?.id]);

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
    if (moveLineEnd(event) || selecting === null) return;
    const at = onPicture(event);
    if (at === null) return;
    if (selectsBox() || selectsLine()) setSelecting([selecting[0], at]);
    else setSelecting([...selecting, at]);
  };
  const finishSelecting = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (lineEnd !== null) {
      setLineEnd(null);
      return;
    }
    if (selecting === null) return;
    const drawn = selecting;
    setSelecting(null);
    if (selectsLine()) {
      const [from, to] = [drawn[0], drawn[drawn.length - 1]];
      if (Math.hypot(to.x - from.x, to.y - from.y) >= SMALLEST_SELECTION) setSelection([from, to]);
      return;
    }
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
    const selected = selection;
    setChanging(true);
    setError(null);
    try {
      const seen = await asSeen();
      if (seen === null) return;
      const queued = await queueDesignImageEdit({
        workspaceId,
        imageId: seen.id,
        modelId: editModelId,
        prompt: change.trim(),
        mask: maskOf(selected, shownPicture.naturalWidth, shownPicture.naturalHeight),
        feather,
      });
      remember();
      setChangingOver((held) => ({
        ...held,
        [queued.id]: { url: seen.url, width: shownPicture.naturalWidth, height: shownPicture.naturalHeight, points: selected },
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
    const seen = await asSeen();
    if (seen === null) return;
    const queued = await queueDesignImageUpscale({ workspaceId, imageId: seen.id, modelId: upscaleModelId, algorithm, scale });
    const width = shownPicture.naturalWidth;
    const height = shownPicture.naturalHeight;
    remember();
    setChangingOver((held) => ({
      ...held,
      [queued.id]: { url: seen.url, width, height, points: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] },
    }));
    setMade((held) => [{ job: queued }, ...held]);
    forget();
    setUpscaling(false);
    setCleaning(false);
    show({ kind: 'job', jobId: queued.id });
  }

  /** The whole picture redrawn lightly, so a Magic edit's seams blend: a version of it, its whole frame pulsing meanwhile, as an upscale is. */
  async function harmonize(harmonizeModelId: string, described: string, strength: number | null, checkpoint: string | null) {
    const shownPicture = pictureRef.current;
    if (picture === null || shownPicture === null) return;
    const seen = await asSeen();
    if (seen === null) return;
    const queued = await queueDesignImageHarmonize({
      workspaceId,
      imageId: seen.id,
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
      [queued.id]: { url: seen.url, width, height, points: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] },
    }));
    setMade((held) => [{ job: queued }, ...held]);
    forget();
    setHarmonizing(false);
    show({ kind: 'job', jobId: queued.id });
  }

  /*
   * Layers, as any image editor has them: the picture at the foot of the
   * stack, and over it layers of pixels of their own - added empty, painted
   * and blurred on, renamed, hidden, and put above or below one another. The
   * brush and the blur work on the layer chosen; what is shown is every layer
   * shown, the first lowest. Every change to them is a step undo takes back.
   *
   * They are kept with the picture (reversing #633, where Save flattened
   * them): every version is kept with the layers it was made with, beside the
   * file - which is them flattened, so whatever else reads the picture reads
   * what it looks like - and opening a picture brings its layers back. Only
   * Flatten merges them. A model is handed the picture as it looks, and its
   * change comes back as a layer of its own over them.
   */
  const [layers, setLayers] = useState<Layer[]>([]);
  /** The layer the brush and the blur work on: one of the layers, or the picture itself. */
  const [layerId, setLayerId] = useState<string>(PICTURE_LAYER);
  /** The picture itself hidden, so only the layers over it are seen. */
  const [baseVisible, setBaseVisible] = useState(true);
  /**
   * Where the picture's own pixels are - under the layers - where it has
   * layers; null where its file is all there is. The file is the layers
   * flattened, and drawing the layers over it would draw them twice.
   */
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  /** The layers changed since they were last kept: what Save, Discard and the leave guard are about. */
  const [layersDirty, setLayersDirty] = useState(false);
  /** Counts every change to the layers, so a keep finishing late knows whether one came after it. */
  const layerEdits = useRef(0);
  /** Which picture's layers are on the page: another picture shown has its own read. */
  const layersFor = useRef<string | null>(null);
  // Whether the layers panel is open, remembered for whoever uses the editor, as a list's filter is.
  const [layersRemembered, rememberLayers] = useSieve('image-editor.layers');
  // Shown unless somebody closed it: it sits in the side panel now, out of the picture's way.
  const layersOpen = layersRemembered !== 'closed';
  const setLayersOpen = (next: boolean | ((held: boolean) => boolean)) =>
    rememberLayers((typeof next === 'function' ? next(layersOpen) : next) ? 'open' : 'closed');
  const layersSection = useRef<HTMLDivElement>(null);
  /** The rail's Layers and its key open the section and bring it into view; its heading is what folds it. */
  const showLayers = () => {
    setLayersOpen(true);
    window.requestAnimationFrame(() => layersSection.current?.scrollIntoView({ block: 'nearest' }));
  };
  /** How many layers a picture may keep over the picture itself: the installation's number. */
  const [layersMost, setLayersMost] = useState<number | null>(null);
  const layerCount = useRef(0);
  /** A layer's row being dragged to another place in the stack. */
  const [movingRow, setMovingRow] = useState<string | null>(null);
  /** The layer whose name is being typed over, and what has been typed. */
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  /** The layer chosen, or null where it is the picture itself. */
  const activeLayer = layers.find((one) => one.id === layerId) ?? null;

  /** A change to the layers, not yet kept. */
  const touchLayers = () => {
    layerEdits.current += 1;
    setLayersDirty(true);
  };

  /**
   * A picture's layers as they were kept, read onto the page; none for one kept
   * flat. Where the picture shown is another than the one they were read for,
   * the page starts without any, so the last picture's are never seen over it.
   */
  const reading = useRef(0);
  async function readLayers(of: Artifact, clearFirst: boolean): Promise<void> {
    const ticket = (reading.current += 1);
    layersFor.current = of.id;
    if (clearFirst) {
      setLayers([]);
      setBaseUrl(null);
      setBaseVisible(true);
      setLayerId(PICTURE_LAYER);
      setLayersDirty(false);
    }
    try {
      const kept = await fetchDesignImageLayers(workspaceId, of.id);
      const over = kept.filter((one) => !one.picture);
      const pixels = await Promise.all(over.map((one) => canvasFrom(one.url)));
      if (reading.current !== ticket || layersFor.current !== of.id) return;
      const base = kept.find((one) => one.picture) ?? null;
      const read: Layer[] = over.map((one, at) => {
        layerCount.current += 1;
        return { id: `layer-${layerCount.current}`, name: one.name ?? tf('Layer {number}', { number: at + 1 }), visible: one.visible, pixels: pixels[at] };
      });
      setLayers(read);
      setBaseUrl(base?.url ?? null);
      setBaseVisible(base?.visible ?? true);
      setLayerId(PICTURE_LAYER);
      setLayersDirty(false);
    } catch {
      // Unread, the picture is still its file as it looks; nothing is lost by showing that.
    }
  }
  // Another picture shown - opened, chosen on the strip, drawn by a model - brings its own layers.
  useEffect(() => {
    if (picture === null || layersFor.current === picture.id) return;
    void readLayers(picture, true);
  }, [picture?.id]);

  /** The picture alone, on a canvas of its own at its own size; null before it has loaded. */
  const baseCanvas = (): HTMLCanvasElement | null => {
    const shownPicture = pictureRef.current;
    if (picture === null || shownPicture === null || shownPicture.naturalWidth === 0) return null;
    return canvasOf(shownPicture);
  };
  /** The picture alone with what the brush painted on it and has not kept. */
  const paintedBase = (): HTMLCanvasElement | null => {
    const base = baseCanvas();
    return base === null || strokes.length === 0 ? base : painted(base, strokes);
  };

  /**
   * What is on the screen as one picture: the picture and the layers shown,
   * with what the brush has painted on the picture and not yet kept - so a
   * tool that works on the whole of it, or a model, has exactly what is seen.
   */
  const pictureCanvas = (): HTMLCanvasElement | null => {
    const shownPicture = pictureRef.current;
    if (picture === null || shownPicture === null || shownPicture.naturalWidth === 0) return null;
    const under = !baseVisible ? null : strokes.length > 0 ? painted(canvasOf(shownPicture), strokes) : shownPicture;
    return flattened(shownPicture.naturalWidth, shownPicture.naturalHeight, under, layers);
  };

  /** A layer's pixels changed, as one step undo takes back. */
  const repaintLayer = (id: string, pixels: HTMLCanvasElement) => {
    remember();
    touchLayers();
    setLayers((held) => held.map((one) => (one.id === id ? { ...one, pixels } : one)));
  };
  /** A layer chosen to work on; what the brush painted on the picture is kept first, so it is not carried over. */
  const chooseLayer = (id: string) => {
    if (id === layerId) return;
    if (strokes.length > 0) void applyPaint();
    // The eraser takes paint off a layer; the picture itself has nothing under it to show, so the brush goes back to a tip that paints.
    if (id === PICTURE_LAYER && brushStyle === 'eraser') setBrushStyle('hard');
    setLayerId(id);
  };
  /** An empty layer, above the one chosen, and chosen itself. */
  const newLayer = () => {
    if (natural === null) return;
    if (layersMost !== null && layers.length >= layersMost) return;
    layerCount.current += 1;
    // Numbered after the layers there are, skipping a name one of them already has.
    let number = layers.length + 1;
    while (layers.some((one) => one.name === tf('Layer {number}', { number }))) number += 1;
    const layer: Layer = {
      id: `layer-${layerCount.current}`,
      name: tf('Layer {number}', { number }),
      visible: true,
      pixels: emptyLayer(natural.width, natural.height),
    };
    const at = layers.findIndex((one) => one.id === layerId) + 1;
    if (strokes.length > 0) void applyPaint();
    remember();
    touchLayers();
    setLayers([...layers.slice(0, at), layer, ...layers.slice(at)]);
    setLayerId(layer.id);
  };
  /** A layer taken away from its own row; where it was the chosen one, the one under it is chosen next. The picture itself is never taken away. */
  const removeLayer = (id: string) => {
    const at = layers.findIndex((one) => one.id === id);
    if (at < 0) return;
    remember();
    touchLayers();
    const rest = layers.filter((one) => one.id !== id);
    setLayers(rest);
    if (layerId === id) setLayerId(rest[at - 1]?.id ?? PICTURE_LAYER);
  };
  /** A layer put at another place in the stack, counted from the foot; the picture stays under them all. */
  const moveLayer = (id: string, to: number) => {
    const at = layers.findIndex((one) => one.id === id);
    if (at < 0 || to < 0 || to >= layers.length || to === at) return;
    remember();
    touchLayers();
    const next = layers.filter((one) => one.id !== id);
    next.splice(to, 0, layers[at]);
    setLayers(next);
  };
  const showLayer = (id: string) => {
    remember();
    touchLayers();
    if (id === PICTURE_LAYER) setBaseVisible(!baseVisible);
    else setLayers((held) => held.map((one) => (one.id === id ? { ...one, visible: !one.visible } : one)));
  };
  const finishRenaming = () => {
    if (renaming === null) return;
    const called = renaming.name.trim();
    const layer = layers.find((one) => one.id === renaming.id);
    setRenaming(null);
    if (layer === undefined || called === '' || called === layer.name) return;
    remember();
    touchLayers();
    setLayers((held) => held.map((one) => (one.id === layer.id ? { ...one, name: called } : one)));
  };
  /** The layers shown flattened into the picture, as one version: the one thing that merges them. */
  async function flattenLayers(): Promise<void> {
    const drawn = layers.length === 0 ? null : pictureCanvas();
    if (drawn !== null) await keepChange({ base: drawn, baseVisible: true, layers: [] }, t('Layers flattened'), true);
  }
  /**
   * The picture as a model is to be handed it: what is on the page kept as a
   * version first, where the layers were changed since they were. The version
   * keeps them, and the model's change comes back as a layer over them.
   * Throws where it could not be kept.
   */
  async function asSeen(): Promise<Artifact | null> {
    if (picture === null || (!layersDirty && strokes.length === 0)) return picture;
    const base = paintedBase();
    return base === null ? null : keepNow({ base, baseVisible, layers }, t('Layers changed'), false);
  }

  /**
   * What one version is kept as: the picture's own pixels, whether they are
   * shown, and the layers over them, the first lowest. Without layers - and
   * with the picture shown - it is the picture alone, kept flat.
   */
  type Stack = { base: HTMLCanvasElement; baseVisible: boolean; layers: Layer[] };

  /**
   * Keeps a change worked out here, and shows it; throws where it could not be
   * kept. The version's file is the stack flattened, which is what everything
   * else reads, and the layers are kept beside it. [restacked] says the change
   * made the layers what [stack] holds - a turn, a crop, Flatten - rather than
   * leaving them as they are on the page.
   */
  async function keepNow(stack: Stack, change: string, restacked: boolean): Promise<Artifact | null> {
    if (picture === null) return null;
    const edit = layerEdits.current;
    const layered = stack.layers.length > 0 || !stack.baseVisible;
    const image = layered
      ? flattened(stack.base.width, stack.base.height, stack.baseVisible ? stack.base : null, stack.layers).toDataURL('image/png')
      : stack.base.toDataURL('image/png');
    const baseImage = layered ? stack.base.toDataURL('image/png') : null;
    const kept = await keepDesignImageChange({
      workspaceId,
      imageId: picture.id,
      image,
      change,
      layers:
        baseImage === null
          ? undefined
          : [
              { name: null, visible: stack.baseVisible, picture: true, image: baseImage },
              ...stack.layers.map((one) => ({ name: one.name, visible: one.visible, picture: false, image: one.pixels.toDataURL('image/png') })),
            ],
    });
    // The state it replaces goes on the stack, strokes not yet kept included: undo goes back to them.
    remember();
    setStrokes([]);
    setBaseUrl(baseImage);
    if (restacked) {
      setLayers(stack.layers);
      setBaseVisible(stack.baseVisible);
      if (!stack.layers.some((one) => one.id === layerId)) setLayerId(PICTURE_LAYER);
    }
    // Kept as they are, unless they were changed again while this was on its way.
    if (layerEdits.current === edit) setLayersDirty(false);
    setMade((held) => [{ job: kept }, ...held]);
    forget();
    if (kept.image !== null) {
      layersFor.current = kept.image.id;
      show({ kind: 'picture', picture: kept.image });
    }
    return kept.image;
  }

  /**
   * A change worked out here kept as a version of the picture shown - a draft
   * Save writes and Discard throws away, and a step undo goes back over, as a
   * model's change is. Answers the version, or null where it could not be kept.
   */
  async function keepChange(stack: Stack, change: string, restacked: boolean): Promise<Artifact | null> {
    if (picture === null || busy) return null;
    setBusy(true);
    setError(null);
    try {
      return await keepNow(stack, change, restacked);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not keep the change.'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** Every layer of the picture, its own pixels included, changed alike - a turn, a mirror image, a crop - and kept. */
  const everyLayer = (change: (pixels: HTMLCanvasElement) => HTMLCanvasElement, said: string) => {
    const base = paintedBase();
    if (base === null) return Promise.resolve(null);
    return keepChange(
      { base: change(base), baseVisible, layers: layers.map((one) => ({ ...one, pixels: change(one.pixels) })) },
      said,
      true,
    );
  };

  /** A quarter turn, or a mirror image: done at once to every layer, as a version of the picture. */
  const turn = (way: 'left' | 'right') => void everyLayer((pixels) => rotated(pixels, way), way === 'left' ? t('Rotated left') : t('Rotated right'));
  const mirror = (axis: 'horizontal' | 'vertical') =>
    void everyLayer((pixels) => mirrored(pixels, axis), axis === 'horizontal' ? t('Flipped horizontally') : t('Flipped vertically'));

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
  /** The tip in hand. */
  const [brushStyle, setBrushStyle] = useState<BrushStyle>('hard');
  /**
   * How opaque the brush paints, in percent, starting where Admin Settings
   * says - the marker's apart from the rest, since a marker is see-through.
   */
  const [brushOpacity, setBrushOpacity] = useState<number | null>(null);
  const [markerOpacity, setMarkerOpacity] = useState<number | null>(null);
  /** How hard the soft tip's and the eraser's edge is, in percent; 0 fades across half the width. */
  const [brushHardness, setBrushHardness] = useState<number | null>(null);
  /** The opacity the tip in hand paints at, in percent. */
  const opacityNow = brushStyle === 'marker' ? markerOpacity : brushOpacity;
  /** The eraser takes paint off a layer, and the picture itself has no layer under it: it is off there. */
  const erasesNothing = brushStyle === 'eraser' && activeLayer === null;
  /** What has been done on the page and not yet kept: strokes painted on the picture, layers changed. */
  const pending = strokes.length > 0 || layersDirty;
  /** How hard a pen is pressed, from 0 to 1; null for a mouse or a finger, which say nothing of it. */
  const pressureOf = (event: ReactPointerEvent) => (event.pointerType === 'pen' ? event.pressure : null);
  const startStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool !== 'brush' || event.button !== 0 || brushSize === null || erasesNothing) return;
    const at = onPicture(event);
    if (at === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const pressure = pressureOf(event);
    setStroking({
      colour: brushColour,
      size: brushSize,
      points: [at],
      style: brushStyle,
      opacity: (opacityNow ?? 100) / 100,
      hardness: softens(brushStyle) ? (brushHardness ?? 100) / 100 : 1,
      pressures: pressure === null ? null : [pressure],
    });
  };
  const keepStroking = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (stroking === null) return;
    const at = onPicture(event);
    if (at === null) return;
    const pressure = pressureOf(event);
    setStroking({
      ...stroking,
      points: [...stroking.points, at],
      pressures: stroking.pressures === null ? null : [...stroking.pressures, pressure ?? stroking.pressures[stroking.pressures.length - 1] ?? 1],
    });
  };
  /** A stroke finished: into the layer chosen at once, or over the picture until Apply keeps it as a version. */
  const finishStroke = () => {
    if (stroking === null) return;
    if (activeLayer !== null) repaintLayer(activeLayer.id, painted(activeLayer.pixels, [stroking]));
    else {
      remember();
      setStrokes((held) => [...held, stroking]);
    }
    setStroking(null);
  };
  /**
   * What the brush has painted and not kept, as it will be kept: the picture
   * with its strokes - drawn whole over it, so a marker darkens it on the
   * screen as it will in the version - and the layer being painted on.
   */
  const basePainted = useMemo(() => {
    const shown = stroking === null || activeLayer !== null ? strokes : [...strokes, stroking];
    const base = shown.length === 0 ? null : baseCanvas();
    return base === null ? null : painted(base, shown);
  }, [strokes, stroking, activeLayer, natural, baseUrl]);
  const layerPainted = useMemo(
    () => (stroking === null || activeLayer === null ? null : painted(activeLayer.pixels, [stroking])),
    [stroking, activeLayer],
  );

  /** What the brush painted on the picture, kept as a version of it; the layers over it stay, and are kept with it. */
  async function applyPaint(): Promise<void> {
    const base = strokes.length === 0 ? null : paintedBase();
    if (base !== null) await keepChange({ base, baseVisible, layers }, t('Painted with the brush'), false);
  }

  /*
   * Selective blur: part of the picture selected with a rectangle or a lasso,
   * as Magic edit selects, and blurred inside it only. The tool stays in hand,
   * so one part after another can be blurred; each is a version.
   */
  const [blurShape, setBlurShape] = useState<BlurShape>('rectangle');
  const [blurRadius, setBlurRadius] = useState<number | null>(null);
  const [blurMost, setBlurMost] = useState<number | null>(null);
  /**
   * How far a rectangle or lasso's blur fades out inside its edge, in the
   * picture's own pixels; 0 is a hard edge. Starts where Admin Settings says.
   */
  const [blurFalloff, setBlurFalloff] = useState<number | null>(null);
  const [blurFalloffMost, setBlurFalloffMost] = useState<number | null>(null);
  /** A gradual blur growing both ways from its start - a sharp band - rather than one way. */
  const [blurMirrored, setBlurMirrored] = useState(false);
  /** Which end of a gradual blur's line is being dragged to adjust it: 0 its start, 1 its end. */
  const [lineEnd, setLineEnd] = useState<0 | 1 | null>(null);
  /** Whether the tool in hand selects with a rectangle - two corners - rather than a lasso's outline. */
  const selectsBox = () => boxed(tool) || (tool === 'blur' && blurShape === 'rectangle');
  /** Whether the tool in hand draws a line - a gradual blur's, from sharp to blurred. */
  const selectsLine = () => tool === 'blur' && blurShape === 'gradient';
  /** The blur applied to the layer chosen: at once to a layer, and as a version to the picture itself. */
  function applyBlur() {
    const drawn = activeLayer?.pixels ?? baseCanvas();
    if (drawn === null || selection === null || tool !== 'blur' || blurRadius === null) return;
    if (blurShape === 'gradient' && selection.length !== 2) return;
    const falloff = blurFalloff ?? 0;
    const blurred =
      blurShape === 'gradient'
        ? blurredAlong(drawn, selection[0], selection[1], blurRadius, blurMirrored)
        : blurredInside(drawn, selection, blurRadius, falloff);
    if (activeLayer !== null) {
      repaintLayer(activeLayer.id, blurred);
      forget();
      return;
    }
    const said =
      blurShape === 'gradient'
        ? blurMirrored
          ? tf('Blurred gradually both ways, {radius} px', { radius: blurRadius })
          : tf('Blurred gradually, {radius} px', { radius: blurRadius })
        : falloff > 0
          ? tf('Blurred, {radius} px, edge softened {falloff} px', { radius: blurRadius, falloff })
          : tf('Blurred, {radius} px', { radius: blurRadius });
    void keepChange({ base: blurred, baseVisible, layers }, said, false);
  }
  /** A gradual blur's line end taken in hand, to be dragged where it should be. */
  const takeLineEnd = (event: ReactPointerEvent<SVGCircleElement>, end: 0 | 1) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget.ownerSVGElement ?? event.currentTarget).setPointerCapture(event.pointerId);
    setLineEnd(end);
  };
  const moveLineEnd = (event: ReactPointerEvent<SVGSVGElement>): boolean => {
    if (lineEnd === null || selection === null || selection.length !== 2) return false;
    const at = onPicture(event);
    if (at !== null) setSelection(lineEnd === 0 ? [at, selection[1]] : [selection[0], at]);
    return true;
  };

  /** The box a crop selection keeps, in the picture's whole pixels; null with nothing selected to crop to. */
  const cropBox = tool === 'crop' && selection !== null && natural !== null ? boxOf(selection, natural.width, natural.height) : null;
  /** The picture made what is inside the crop's box, every layer with it; the tool is put down once it is kept. */
  function applyCrop() {
    if (selection === null || tool !== 'crop' || natural === null) return;
    const box = boxOf(selection, natural.width, natural.height);
    void everyLayer((pixels) => cropped(pixels, box), tf('Cropped to {width}×{height}', { width: box.width, height: box.height })).then((kept) => {
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
  /**
   * One of the editor's own tools, by its key: what its button on the rail,
   * the brush's width or the blur's bar would do. False for a key that is
   * none of them, which is then left alone.
   */
  keys.current.tool = (event: KeyboardEvent): boolean => {
    const name = IMAGE_EDITOR_SHORTCUTS.find((one) => matches(event, editorKeys[one]));
    if (name === undefined) return false;
    const free = picture !== null && !busy;
    switch (name) {
      case 'rotateLeft':
      case 'rotateRight':
        if (free) turn(name === 'rotateLeft' ? 'left' : 'right');
        break;
      case 'flipHorizontal':
      case 'flipVertical':
        if (free) mirror(name === 'flipHorizontal' ? 'horizontal' : 'vertical');
        break;
      case 'brush':
      case 'crop':
      case 'blur':
        if (free) pick(name);
        break;
      case 'layers':
        if (picture !== null) showLayers();
        break;
      case 'brushSmaller':
        setBrushSize((held) => (held === null ? held : Math.max(1, Math.min(held - 1, Math.round(held / BRUSH_STEP)))));
        break;
      case 'brushLarger':
        setBrushSize((held) => (held === null ? held : Math.min(brushMost ?? held, Math.max(held + 1, Math.round(held * BRUSH_STEP)))));
        break;
      case 'blurRectangle':
      case 'blurLasso':
      case 'blurGradual': {
        if (!free) break;
        // The blur picked up with that shape, or the shape changed under the blur in hand.
        const shape: BlurShape = name === 'blurRectangle' ? 'rectangle' : name === 'blurLasso' ? 'lasso' : 'gradient';
        if (tool === 'blur') forget();
        else pick('blur');
        setBlurShape(shape);
        break;
      }
    }
    return true;
  };
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
      // What the brush painted and the layers as they are now are kept first - the layers as layers - and saved with the rest.
      const current = (await keepPending()) ?? picture;
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
      savedPicture.current = kept;
      // The picture took the version's layers with it, and the page holds them already.
      layersFor.current = kept.id;
      setShown({ kind: 'picture', picture: kept });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the picture.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** What is on the page and not yet kept, kept as a version: strokes on the picture, layers changed. Null where there is none. */
  async function keepPending(): Promise<Artifact | null> {
    if (!pending) return null;
    const base = paintedBase();
    if (base === null) return null;
    return keepNow({ base, baseVisible, layers }, layersDirty ? t('Layers changed') : t('Painted with the brush'), false);
  }

  /**
   * The changes made here saved as a picture of its own, and the picture they
   * were made to left as it was saved - its unsaved changes thrown away. The
   * editor then goes on with the copy.
   */
  async function saveAsCopy(): Promise<void> {
    if (picture === null || (picture.versionOf == null && !pending) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const current = (await keepPending()) ?? picture;
      const of = current.versionOf;
      if (of == null) return;
      let copy = await saveDesignImageVersion(workspaceId, current.id, true);
      if (pendingName !== null) copy = await renameDesignImage(workspaceId, copy.id, pendingName);
      setPendingName(null);
      setMade((held) => held.filter((one) => one.job.image?.versionOf !== of));
      setPast([]);
      setFuture([]);
      const to = `/workspace/${workspaceId}/design/images/${copy.id}/edit`;
      // The copy is the version itself, layers and all, which the page holds already.
      layersFor.current = copy.id;
      setShown({ kind: 'picture', picture: copy });
      // With a rename held, the leave guard holds a spare history entry: moved to once it has stepped off it,
      // or that step lands back on the original. Without one there is nothing to wait for.
      if (unsaved) goingTo.current = { to, replace: true };
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
    // Strokes and layer changes not yet kept go first: they are the newest thing on the page. The layers go back to how they were kept.
    if (pending) {
      remember();
      setStrokes([]);
      if (layersDirty && picture !== null) {
        layerEdits.current += 1;
        void readLayers(picture, false);
      }
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
    navigate(to.to, { replace: to.replace });
  }, [location.key, unsaved]);
  const canSave = unsaved || drafted;
  const guard = useLeaveGuard({ unsaved, backTo: `/workspace/${workspaceId}/design/images`, save });

  /**
   * Convert to video, asked first where there is anything Save would write -
   * a version drafted, layers or strokes not kept, a new name - and gone
   * straight to the video page where there is not. Leave starts the video
   * from the picture as it was last saved, which is what leaving without
   * saving means; Save & Leave saves first and starts it from what was saved.
   */
  const [videoAsking, setVideoAsking] = useState(false);
  /** The picture Save last wrote, for Save & Leave to start the video from. */
  const savedPicture = useRef<Artifact | null>(null);
  function toVideo() {
    if (picture === null || busy) return;
    if (canSave) {
      setVideoAsking(true);
      return;
    }
    navigate(videoFromPicturePath(workspaceId, picture.id));
  }
  /** Leaves for the video page: over the leave guard's spare entry where it holds one, so Back from there is the editor once. */
  function leaveForVideo(to: string) {
    const onGuardEntry = (location.state as Record<string, unknown> | null)?.orknuxUnsavedWork === true;
    navigate(to, { replace: onGuardEntry });
  }
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
              disabled={picture === null || strokes.length > 0}
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
              disabled={picture === null || strokes.length > 0}
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
              disabled={picture === null || strokes.length > 0}
              title={`${t('Magic select all')} (${allKey})`}
              aria-label={t('Magic select all')}
              data-testid="magic-all"
            >
              <img src={selectAllIcon} alt="" width={16} height={16} />
            </button>
          </div>
          <span className={styles.toolbarGap} aria-hidden="true" />
          {/*
            What a model does with the whole picture, in one menu: as four
            buttons of their own they pushed the picture's name off the bar.
            Convert to video is the one that leaves the editor, and stands
            beside the menu as a button of its own.
            With no model for one, its item is off and says why and where to
            add one, at once on hover, not after a title's delay.
          */}
          <div className={styles.exportMenu}>
            <button
              type="button"
              className={`${form.ghost} ${styles.toolbarButton}`}
              onClick={() => setModelMenu((held) => !held)}
              disabled={picture === null}
              aria-haspopup="menu"
              aria-expanded={modelMenu}
              title={t('Upscale, clean up or harmonize with a model')}
              data-testid="editor-ai"
            >
              {t('AI')} ▾
            </button>
            {modelMenu && (
              <div className={`${styles.exportItems} ${styles.modelItems}`} role="menu" data-testid="editor-ai-menu">
                <span className={styles.upscaleWrap} role="none" data-testid="editor-upscale-wrap">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setModelMenu(false);
                      forget();
                      setUpscaling(true);
                    }}
                    disabled={picture === null || busy || noUpscaler || strokes.length > 0}
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
                {/* The same road as Upscale, at 1x. */}
                <span className={styles.upscaleWrap} role="none" data-testid="editor-cleanup-wrap">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setModelMenu(false);
                      forget();
                      setCleaning(true);
                    }}
                    disabled={picture === null || busy || noUpscaler || strokes.length > 0}
                    title={noUpscaler ? undefined : t('Remove the blocks and speckle repeated edits leave, with a restoration model')}
                    data-testid="editor-cleanup"
                  >
                    {t('Clean up')}
                  </button>
                  {noUpscaler && (
                    <span className={styles.upscaleHint} role="tooltip" data-testid="editor-cleanup-hint">
                      {t('There is no upscale model in this workspace. Add a Stable Diffusion WebUI provider and an Upscale model under it.')}{' '}
                      <Link to={`/workspace/${workspaceId}/models`} data-testid="editor-cleanup-models">
                        {t('Go to Models')}
                      </Link>
                    </span>
                  )}
                </span>
                <span className={styles.upscaleWrap} role="none" data-testid="editor-harmonize-wrap">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setModelMenu(false);
                      forget();
                      setHarmonizing(true);
                    }}
                    disabled={picture === null || busy || noHarmonizer || strokes.length > 0}
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
              </div>
            )}
          </div>
          {/*
            Convert to video on the bar itself, beside the menu it used to be
            in: an icon, since its words would take the room the picture's
            name needs at 1280 wide.
          */}
          <button
            type="button"
            className={styles.tool}
            onClick={toVideo}
            disabled={picture === null || busy}
            title={t('Make a video that starts from this picture')}
            aria-label={t('Convert to video')}
            data-testid="editor-to-video"
          >
            <img src={videoIcon} alt="" width={16} height={16} />
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
                    setPicking(true);
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
            className={`${form.ghost} ${styles.toolbarButton}`}
            style={{ textDecoration: 'none' }}
            to={`/workspace/${workspaceId}/design/images/new`}
            title={t('Start a new picture')}
            data-testid="editor-new"
          >
            {t('New')}
          </Link>
          <button type="button" className={`${form.ghost} ${styles.toolbarButton}`} onClick={discard} disabled={!canDiscard || busy} data-testid="editor-discard">
            {t('Discard')}
          </button>
          <button
            type="button"
            className={`${form.ghost} ${styles.toolbarButton}`}
            onClick={() => void saveAsCopy()}
            disabled={(picture?.versionOf == null && !pending) || busy}
            title={t('Saves the changes as a new picture and leaves this one as it was')}
            data-testid="editor-save-copy"
          >
            {t('Save as copy')}
          </button>
          <button type="button" className={`${form.filled} ${styles.toolbarButton}`} onClick={save} disabled={!canSave || busy} data-testid="editor-save">
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
            title={`${t('Rotate left')} (${editorKeys.rotateLeft})`}
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
            title={`${t('Rotate right')} (${editorKeys.rotateRight})`}
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
            title={`${t('Flip horizontally')} (${editorKeys.flipHorizontal})`}
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
            title={`${t('Flip vertically')} (${editorKeys.flipVertical})`}
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
            title={`${t('Brush')} (${editorKeys.brush})`}
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
            title={`${t('Crop')} (${editorKeys.crop})`}
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
            title={`${t('Blur')} (${editorKeys.blur})`}
            aria-label={t('Blur')}
            data-testid="editor-blur"
          >
            <img src={blurIcon} alt="" width={16} height={16} />
          </button>
          <span className={styles.railGap} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.tool} ${layersOpen ? styles.railOn : ''}`}
            onClick={showLayers}
            disabled={picture === null}
            aria-pressed={layersOpen}
            title={`${t('Layers')} (${editorKeys.layers})`}
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
                  title={`${editorKeys.brushSmaller} ${editorKeys.brushLarger}`}
                  data-testid="brush-size"
                />
                <span className={styles.optionsValue}>{brushSize ?? ''}</span>
              </label>
              <div className={styles.optionsGroup} role="radiogroup" aria-label={t('Tip')} data-testid="brush-styles">
                {BRUSH_STYLES.map((one) => (
                  <button
                    key={one.style}
                    type="button"
                    role="radio"
                    className={`${styles.tool} ${brushStyle === one.style ? styles.railOn : ''}`}
                    onClick={() => setBrushStyle(one.style)}
                    disabled={one.style === 'eraser' && activeLayer === null}
                    aria-checked={brushStyle === one.style}
                    title={one.label()}
                    aria-label={one.label()}
                    data-testid={`brush-style-${one.style}`}
                  >
                    <img src={one.icon} alt="" width={16} height={16} />
                  </button>
                ))}
              </div>
              {brushStyle !== 'eraser' && (
                <label className={styles.optionsField}>
                  <span>{t('Colour')}</span>
                  <input type="color" value={brushColour} onChange={(event) => setBrushColour(event.target.value)} data-testid="brush-colour" />
                </label>
              )}
              <label className={styles.optionsField}>
                <span>{t('Opacity')}</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={opacityNow ?? 100}
                  onChange={(event) => (brushStyle === 'marker' ? setMarkerOpacity : setBrushOpacity)(Number(event.target.value))}
                  data-testid="brush-opacity"
                />
                <span className={styles.optionsValue}>{opacityNow === null ? '' : `${opacityNow}%`}</span>
              </label>
              {softens(brushStyle) && (
                <label className={styles.optionsField}>
                  <span>{t('Hardness')}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={brushHardness ?? 100}
                    onChange={(event) => setBrushHardness(Number(event.target.value))}
                    data-testid="brush-hardness"
                  />
                  <span className={styles.optionsValue}>{brushHardness === null ? '' : `${brushHardness}%`}</span>
                </label>
              )}
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
                title={`${t('Rectangle')} (${editorKeys.blurRectangle})`}
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
                title={`${t('Lasso')} (${editorKeys.blurLasso})`}
                aria-label={t('Lasso')}
                data-testid="blur-lasso"
              >
                <img src={lassoIcon} alt="" width={16} height={16} />
              </button>
              <button
                type="button"
                className={`${styles.tool} ${blurShape === 'gradient' ? styles.railOn : ''}`}
                onClick={() => {
                  forget();
                  setBlurShape('gradient');
                }}
                aria-pressed={blurShape === 'gradient'}
                title={`${t('Gradual')} (${editorKeys.blurGradual})`}
                aria-label={t('Gradual')}
                data-testid="blur-gradient"
              >
                <img src={blurGradientIcon} alt="" width={16} height={16} />
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
              {blurShape === 'gradient' ? (
                <label className={styles.optionsField}>
                  <input type="checkbox" checked={blurMirrored} onChange={(event) => setBlurMirrored(event.target.checked)} data-testid="blur-mirrored" />
                  <span>{t('Mirrored')}</span>
                </label>
              ) : (
                <label className={styles.optionsField}>
                  <span>{t('Falloff')}</span>
                  <input
                    type="range"
                    min={0}
                    max={blurFalloffMost ?? blurFalloff ?? 0}
                    value={blurFalloff ?? 0}
                    onChange={(event) => setBlurFalloff(Number(event.target.value))}
                    data-testid="blur-falloff"
                  />
                  <span className={styles.optionsValue}>{blurFalloff ?? ''}</span>
                </label>
              )}
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
                        {paceSaid !== null && (
                          <span className={styles.pace} data-testid="editor-drawing-time">
                            {paceSaid}
                          </span>
                        )}
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
                  {paceSaid !== null && (
                    <span className={styles.pace} data-testid="editor-drawing-time">
                      {paceSaid}
                    </span>
                  )}
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
                  src={baseUrl ?? picture.url}
                  alt={picture.prompt}
                  className={`${zoom === null ? styles.picture : styles.pictureZoomed} ${baseVisible ? '' : styles.pictureHidden}`}
                  style={
                    zoom === null || pictureRef.current === null
                      ? undefined
                      : { width: `${pictureRef.current.naturalWidth * zoom}px`, height: `${pictureRef.current.naturalHeight * zoom}px` }
                  }
                  onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                  data-testid="editor-picture"
                />
                {basePainted !== null && baseVisible && (
                  // The picture with the strokes on it not yet kept, under the layers as the picture is.
                  <LayerView pixels={basePainted} className={styles.layerPixels} data-testid="brush-paint" />
                )}
                {layers.map((layer) =>
                  layer.visible ? (
                    // Each layer shown over the picture, the first lowest, at the picture's size; the one being painted as it is painted.
                    <LayerView
                      key={layer.id}
                      pixels={layerPainted !== null && layer.id === layerId ? layerPainted : layer.pixels}
                      className={styles.layerPixels}
                      data-testid="layer-canvas"
                      data-id={layer.id}
                    />
                  ) : null,
                )}
                {natural !== null && (tool === 'brush' || strokes.length > 0) && (
                  // Where the brush is put to the picture, in its own pixels; what it paints is drawn on the canvases under it.
                  <svg
                    className={`${styles.selectLayer} ${tool === 'brush' ? styles.selectLayerOn : ''}`}
                    viewBox={`0 0 ${natural.width} ${natural.height}`}
                    preserveAspectRatio="none"
                    onPointerDown={startStroke}
                    onPointerMove={keepStroking}
                    onPointerUp={finishStroke}
                    data-strokes={strokes.length + (stroking === null ? 0 : 1)}
                    data-testid="brush-layer"
                  />
                )}
                {natural !== null && tool !== 'brush' && (tool !== null || selection !== null) && (
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
                      ) : tool === 'blur' && blurShape === 'gradient' ? (
                        (() => {
                          const line = selecting ?? selection ?? [];
                          const from = line[0];
                          const to = line[line.length - 1];
                          // A handle the same size on the screen at any zoom: its radius in the picture's pixels.
                          const handle = 6 / scaleNow();
                          return (
                            <g data-testid="blur-line">
                              <line className={styles.gradientLine} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                              <circle
                                className={styles.gradientHandle}
                                cx={from.x}
                                cy={from.y}
                                r={handle}
                                onPointerDown={(event) => takeLineEnd(event, 0)}
                                data-testid="blur-line-start"
                              />
                              <circle
                                className={`${styles.gradientHandle} ${styles.gradientHandleEnd}`}
                                cx={to.x}
                                cy={to.y}
                                r={handle}
                                onPointerDown={(event) => takeLineEnd(event, 1)}
                                data-testid="blur-line-end"
                              />
                            </g>
                          );
                        })()
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

        <div className={styles.panel}>
        <form className={styles.panelForm} onSubmit={generate} data-testid="editor-panel">
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
            <span className={form.labelRow}>
              <label className={form.label} htmlFor="image-model">{t('Model')}</label>
              {modelId !== '' && (models ?? []).some((one) => one.id === modelId) && (
                <Link
                  className={form.jump}
                  to={`/workspace/${workspaceId}/models/${modelId}`}
                  target="_blank"
                  rel="noreferrer"
                  title={t('Opens the model in a new tab')}
                  aria-label={t('Open the model')}
                  data-testid="image-model-link"
                >
                  <OpenDefinitionIcon />
                </Link>
              )}
            </span>
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
          {/* Beside the prompt rather than over the picture, where it covered what was being painted. */}
          {picture !== null && (
            <div ref={layersSection} className={styles.layersPanel} role="group" aria-label={t('Layers')} data-testid="layers-panel">
              <div className={styles.layersHead}>
                <button
                  type="button"
                  className={styles.layersToggle}
                  onClick={() => setLayersOpen((held) => !held)}
                  aria-expanded={layersOpen}
                  data-testid="layers-collapse"
                >
                  <img src={chevronIcon} alt="" width={12} height={12} className={layersOpen ? undefined : styles.layersToggleShut} />
                  {t('Layers')}
                </button>
                <button
                  type="button"
                  className={form.ghost}
                  onClick={newLayer}
                  disabled={natural === null || (layersMost !== null && layers.length >= layersMost)}
                  title={layersMost !== null && layers.length >= layersMost ? tf('At most {count} layers', { count: layersMost }) : undefined}
                  data-testid="layers-new"
                >
                  {t('New layer')}
                </button>
                <button type="button" className={form.ghost} onClick={() => void flattenLayers()} disabled={layers.length === 0 || busy} data-testid="layers-flatten">
                  {t('Flatten')}
                </button>
              </div>
              {layersOpen && (
                <>
              {/* The top of the stack first, as it is seen; the picture itself at the foot, where it always is. */}
              {layers
                .map((layer, at) => ({ layer, at }))
                .reverse()
                .map(({ layer, at }) => (
                  <div
                    key={layer.id}
                    className={`${styles.layerRow} ${layer.id === layerId ? styles.layerRowOn : ''} ${movingRow === layer.id ? styles.layerRowMoving : ''}`}
                    onClick={() => chooseLayer(layer.id)}
                    draggable={renaming?.id !== layer.id}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      setMovingRow(layer.id);
                    }}
                    onDragOver={(event) => {
                      if (movingRow !== null) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (movingRow !== null) moveLayer(movingRow, at);
                      setMovingRow(null);
                    }}
                    onDragEnd={() => setMovingRow(null)}
                    aria-selected={layer.id === layerId}
                    data-testid="layer-row"
                    data-id={layer.id}
                  >
                    <div className={styles.layerTop}>
                      <LayerView pixels={layer.pixels} className={`${styles.layerThumb} ${styles.layerThumbClear}`} />
                      {renaming?.id === layer.id ? (
                        <input
                          className={`${form.input} ${styles.layerNameInput}`}
                          value={renaming.name}
                          onChange={(event) => setRenaming({ id: layer.id, name: event.target.value })}
                          onBlur={finishRenaming}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') finishRenaming();
                            if (event.key === 'Escape') setRenaming(null);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={t('Name')}
                          maxLength={255}
                          autoFocus
                          data-testid="layer-name-input"
                        />
                      ) : (
                        <span
                          className={styles.layerName}
                          title={layer.name}
                          onDoubleClick={() => setRenaming({ id: layer.id, name: layer.name })}
                          data-testid="layer-name"
                        >
                          {layer.name}
                        </span>
                      )}
                      <button
                        type="button"
                        className={styles.tool}
                        onClick={() => setRenaming({ id: layer.id, name: layer.name })}
                        title={t('Rename')}
                        aria-label={t('Rename')}
                        data-testid="layer-rename"
                      >
                        <img src={pencilIcon} alt="" width={12} height={12} />
                      </button>
                      <button
                        type="button"
                        className={styles.tool}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeLayer(layer.id);
                        }}
                        title={t('Remove layer')}
                        aria-label={t('Remove layer')}
                        data-testid="layer-remove"
                      >
                        <img src={trashIcon} alt="" width={12} height={12} />
                      </button>
                      <button
                        type="button"
                        className={styles.tool}
                        onClick={() => showLayer(layer.id)}
                        aria-pressed={!layer.visible}
                        title={layer.visible ? t('Hide') : t('Show')}
                        aria-label={layer.visible ? t('Hide') : t('Show')}
                        data-testid="layer-visible"
                      >
                        {layer.visible ? '◉' : '○'}
                      </button>
                      <button
                        type="button"
                        className={styles.tool}
                        onClick={() => moveLayer(layer.id, at + 1)}
                        disabled={at === layers.length - 1}
                        title={t('Move up')}
                        aria-label={t('Move up')}
                        data-testid="layer-up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.tool}
                        onClick={() => moveLayer(layer.id, at - 1)}
                        disabled={at === 0}
                        title={t('Move down')}
                        aria-label={t('Move down')}
                        data-testid="layer-down"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              <div
                className={`${styles.layerRow} ${styles.layerBase} ${layerId === PICTURE_LAYER ? styles.layerRowOn : ''}`}
                onClick={() => chooseLayer(PICTURE_LAYER)}
                onDragOver={(event) => {
                  if (movingRow !== null) event.preventDefault();
                }}
                onDrop={(event) => {
                  // Dropped on the picture: as low as a layer goes, just over it.
                  event.preventDefault();
                  if (movingRow !== null) moveLayer(movingRow, 0);
                  setMovingRow(null);
                }}
                aria-selected={layerId === PICTURE_LAYER}
                data-testid="layer-base"
              >
                <div className={styles.layerTop}>
                  <img src={baseUrl ?? picture.url} alt="" className={styles.layerThumb} />
                  <span className={styles.layerName}>{t('Picture')}</span>
                  <button
                    type="button"
                    className={styles.tool}
                    onClick={() => showLayer(PICTURE_LAYER)}
                    aria-pressed={!baseVisible}
                    title={baseVisible ? t('Hide') : t('Show')}
                    aria-label={baseVisible ? t('Hide') : t('Show')}
                    data-testid="layer-base-visible"
                  >
                    {baseVisible ? '◉' : '○'}
                  </button>
                </div>
              </div>
                </>
              )}
            </div>
          )}
        </div>
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
      <DesignUpscaleDialog
        open={cleaning}
        cleanUp
        workspaceId={workspaceId}
        models={upscalers}
        width={natural?.width ?? 0}
        height={natural?.height ?? 0}
        onClose={() => setCleaning(false)}
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
        open={picking}
        workspaceId={workspaceId}
        onClose={() => setPicking(false)}
        title={t('Import from Orknux')}
        onPick={(chosen) => {
          setPicking(false);
          openFromOrknux(chosen);
        }}
      />
      <UnsavedWorkDialog
        subject={guard.asking ? (pendingName ?? picture?.name ?? t('This picture')) : null}
        creating={false}
        onStay={guard.stay}
        onLeave={guard.leave}
        onSaveAndLeave={guard.saveAndLeave}
      />
      <UnsavedWorkDialog
        subject={videoAsking ? (pendingName ?? picture?.name ?? t('This picture')) : null}
        creating={false}
        onStay={() => setVideoAsking(false)}
        onLeave={() => {
          if (picture === null) return;
          setVideoAsking(false);
          leaveForVideo(videoFromPicturePath(workspaceId, picture.versionOf ?? picture.id));
        }}
        onSaveAndLeave={async () => {
          const held = unsaved;
          savedPicture.current = null;
          if (!(await save())) return false;
          const kept = savedPicture.current as Artifact | null;
          const to = videoFromPicturePath(workspaceId, kept?.id ?? picture?.versionOf ?? picture?.id ?? '');
          setVideoAsking(false);
          // With something unsaved the leave guard holds a spare history entry and steps off it once saved: gone after it has.
          if (held) goingTo.current = { to, replace: false };
          else navigate(to);
          return true;
        }}
      />
    </AppShell>
  );
}
