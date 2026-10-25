import { graphql } from './client';
import type { PageOf } from './client';

/**
 * Where it came from.
 *
 * IMAGE and TASK are drawn - by a workflow's image node and by an agent
 * working a task. SAVED is not drawn at all: a file an agent made and decided
 * was worth keeping.
 */
export type ArtifactKind = 'IMAGE' | 'TASK' | 'SAVED' | 'DESIGN';

/** The model a picture was drawn with, what it was asked for beyond the prompt, and who asked. */
export interface ArtifactDrawing {
  /** Null once that model is removed; `model` still names it. */
  modelId: string | null;
  model: string;
  size: string | null;
  quality: string | null;
  style: string | null;
  drawnBy: string;
}

/**
 * One thing a run produced.
 *
 * Today that is a picture an image node drew, which was reachable only from the
 * run that drew it - fine while somebody remembers which run that was, useless
 * afterwards, and no way at all to see what is filling the disk.
 */
export interface Artifact {
  /** Prefixed with the kind: the two tables number their rows separately. */
  id: string;
  kind: ArtifactKind;
  /** Where it came from, named the way the page says it: "Run #12", "Task #4". */
  source: string;
  /** The rest of that address, under the workspace; blank where there is nothing to open. */
  sourcePath: string;
  /** What was asked for - the picture's caption. */
  prompt: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Where the bytes are: the same address the run graph's `<img>` uses. */
  url: string;
  /**
   * Where the same bytes can be read rather than saved, or null for a file
   * nothing renders.
   *
   * Its own address, so what a link is does not depend on what the file inside
   * it turns out to be: `url` hands the file over, always, and this one opens.
   */
  previewUrl: string | null;
  drawnAt: string;
  /** Where it was kept - a picture drawn in Design; null elsewhere. */
  drawnWith: ArtifactDrawing | null;
  /** What a picture drawn in Design is called; null for anything else, which goes by its prompt. */
  name: string | null;
  /** The picture this is an unsaved version of, in the image editor; null for a picture of its own. */
  versionOf: string | null;
  /** This picture's draft - its newest unsaved version - kept until saved or discarded; null where it has none. */
  draft: string | null;
  /** Where that draft's picture is: what a picture with a draft is shown as. */
  draftUrl?: string | null;
}

const ARTIFACT_FIELDS = `
  id kind source sourcePath prompt filename contentType sizeBytes url previewUrl drawnAt
  drawnWith { modelId model size quality style drawnBy } name versionOf draft draftUrl
`;

const WORKSPACE_ARTIFACTS_QUERY = `
  query WorkspaceArtifacts($workspaceId: ID!, $page: Int!, $size: Int!, $search: String, $drawn: Boolean) {
    workspaceArtifacts(workspaceId: $workspaceId, page: $page, size: $size, search: $search, drawn: $drawn) {
      content { ${ARTIFACT_FIELDS} }
      page
      size
      totalElements
      totalPages
    }
  }
`;

const DELETE_ARTIFACT_MUTATION = `
  mutation DeleteArtifact($id: ID!) {
    deleteArtifact(id: $id)
  }
`;

/**
 * @param search narrows to what a word appears in - the prompt or the filename.
 *
 * Asked of the server rather than sieved here, because the list is paged:
 * narrowing what arrived on page one would hide matches on page four.
 */
/**
 * One artifact, by the id the list gave it.
 *
 * What a link to an artifact resolves to. Null for one that is not there or
 * not this workspace's - the same answer for both, so an address cannot be
 * used to find out what another team has produced.
 */
export async function fetchWorkspaceArtifact(workspaceId: string, id: string): Promise<Artifact | null> {
  const data = await graphql<{ workspaceArtifact: Artifact | null }>(
    `query WorkspaceArtifact($workspaceId: ID!, $id: ID!) {
       workspaceArtifact(workspaceId: $workspaceId, id: $id) { ${ARTIFACT_FIELDS} }
     }`,
    { workspaceId, id },
  );
  return data.workspaceArtifact;
}

export async function fetchWorkspaceArtifacts(
  workspaceId: string,
  page = 0,
  size = 24,
  search = '',
  /** Only what an image model drew - Design's Images page. */
  drawn = false,
): Promise<PageOf<Artifact>> {
  const data = await graphql<{ workspaceArtifacts: PageOf<Artifact> }>(WORKSPACE_ARTIFACTS_QUERY, {
    workspaceId,
    page,
    size,
    search: search.trim() === '' ? null : search.trim(),
    drawn,
  });
  return data.workspaceArtifacts;
}

/** Gone from the list and gone from the disk. False if there was no such artifact. */
export async function deleteArtifact(id: string): Promise<boolean> {
  const data = await graphql<{ deleteArtifact: boolean }>(DELETE_ARTIFACT_MUTATION, { id });
  return data.deleteArtifact;
}

/** Where a saved artifact's bytes are, by the number a link to it carries. */
export function savedArtifactUrl(id: string): string {
  return `/api/artifacts/${id}`;
}

/** Where the same bytes are read rather than saved. */
export function savedArtifactPreviewUrl(id: string): string {
  return `/api/artifacts/${id}/preview`;
}

/**
 * What a saved artifact is, asked of the file itself.
 *
 * A link in an answer carries only the number and whatever the model called
 * it, and a title is a model's word for the file rather than the file's own
 * type. A HEAD request answers with the type the server holds without handing
 * the bytes over; a file it will not open for reading answers
 * application/octet-stream. Null for one that is not there or not this caller's.
 */
export async function fetchSavedArtifactType(id: string): Promise<{ type: string; filename: string } | null> {
  // The reading address, because the file's own answers every document as
  // application/octet-stream - it is a download - and says nothing of what it is.
  const answer = await fetch(savedArtifactPreviewUrl(id), { method: 'HEAD', credentials: 'same-origin' });
  if (!answer.ok) return null;
  /*
   * And the file's own name, off the disposition. What is not opened for
   * reading - an SVG, which could run script as a page - still answers
   * octet-stream here, and the name is the one thing that says what it is.
   */
  const disposition = answer.headers.get('Content-Disposition') ?? '';
  const named = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  return {
    type: (answer.headers.get('Content-Type') ?? '').toLowerCase().split(';')[0].trim(),
    filename: named === undefined ? '' : decodeURIComponent(named),
  };
}

/** A saved artifact's bytes, for a page that draws them itself. */
export async function fetchSavedArtifactBytes(id: string): Promise<ArrayBuffer> {
  return fetchDocumentBytes(savedArtifactUrl(id));
}

/**
 * A document's bytes, from an address the server gave for it - an artifact's
 * `url` or `previewUrl`, or a research's.
 *
 * For a page that draws the document itself rather than framing it: the
 * server serves every preview sandboxed, and a browser's own PDF reader does
 * not run in a sandboxed document, so a PDF is fetched and drawn by pdf.js.
 */
export async function fetchDocumentBytes(address: string): Promise<ArrayBuffer> {
  const answer = await fetch(address, { credentials: 'same-origin' });
  if (!answer.ok) throw new Error(`${address} answered ${answer.status}`);
  return answer.arrayBuffer();
}

/** What a picture is to be drawn from on Design's Images page. */
export interface DrawDesignImageInput {
  workspaceId: string;
  modelId: string;
  prompt: string;
  size: string | null;
  quality: string | null;
  style: string | null;
  /** What to call it; empty names it after its prompt's first words. */
  name?: string | null;
  /** What the picture must not contain; null takes the model's own. Only for a model that takes one. */
  negativePrompt?: string | null;
}

export type DesignImageJobStatus = 'QUEUED' | 'DRAWING' | 'DRAWN' | 'FAILED' | 'STOPPED';

/** A picture asked for in Design, on its way to being drawn. */
export interface DesignImageJob {
  id: string;
  status: DesignImageJobStatus;
  prompt: string;
  modelId: string | null;
  model: string;
  size: string | null;
  quality: string | null;
  style: string | null;
  /** What it was asked not to contain; null is none given. */
  negativePrompt: string | null;
  requestedBy: string;
  requestedAt: string;
  startedAt: string | null;
  /** Why it was not drawn, on a FAILED one. */
  reason: string | null;
  /** How many queued pictures are drawn before this one; null unless QUEUED. */
  ahead: number | null;
  /** What it will be called: the name given, or its prompt's first words. */
  name: string;
  /** The picture an edit changes; null for one drawn from nothing. */
  sourceId: string | null;
  /** The picture, once DRAWN. */
  image: Artifact | null;
  /** The algorithm an upscale uses; null for anything else. */
  upscaler: string | null;
  /** How many times larger an upscale makes the picture; null for anything else. */
  scale: number | null;
}

const JOB_FIELDS = `id status prompt modelId model size quality style negativePrompt requestedBy requestedAt startedAt reason ahead name sourceId upscaler scale image { ${ARTIFACT_FIELDS} }`;

/** Queues a picture and answers at once; a refusal of what could never be drawn throws with its reason. */
export async function queueDesignImage(input: DrawDesignImageInput): Promise<DesignImageJob> {
  const data = await graphql<{ queueDesignImage: DesignImageJob }>(
    `mutation QueueDesignImage($input: DrawDesignImageInput!) { queueDesignImage(input: $input) { ${JOB_FIELDS} } }`,
    { input },
  );
  return data.queueDesignImage;
}

/** What the workspace has waiting, being drawn, or failed - oldest first. */
export async function fetchDesignImageQueue(workspaceId: string): Promise<DesignImageJob[]> {
  const data = await graphql<{ designImageQueue: DesignImageJob[] }>(
    `query DesignImageQueue($workspaceId: ID!) { designImageQueue(workspaceId: $workspaceId) { ${JOB_FIELDS} } }`,
    { workspaceId },
  );
  return data.designImageQueue;
}

/** One request in whatever state it is, with its picture once drawn; null for one not here. */
export async function fetchDesignImageJob(workspaceId: string, id: string): Promise<DesignImageJob | null> {
  const data = await graphql<{ designImageJob: DesignImageJob | null }>(
    `query DesignImageJob($workspaceId: ID!, $id: ID!) { designImageJob(workspaceId: $workspaceId, id: $id) { ${JOB_FIELDS} } }`,
    { workspaceId, id },
  );
  return data.designImageJob;
}

/**
 * What was asked of one picture in the image editor and not yet saved or
 * discarded, newest first - the editor's strip, read again when the page is.
 */
export async function fetchDesignImageHistory(workspaceId: string, imageId: string): Promise<DesignImageJob[]> {
  const data = await graphql<{ designImageHistory: DesignImageJob[] }>(
    `query DesignImageHistory($workspaceId: ID!, $imageId: ID!) { designImageHistory(workspaceId: $workspaceId, imageId: $imageId) { ${JOB_FIELDS} } }`,
    { workspaceId, imageId },
  );
  return data.designImageHistory;
}

/** Takes a queued or failed request off. */
export async function dismissDesignImageJob(id: string): Promise<boolean> {
  const data = await graphql<{ dismissDesignImageJob: boolean }>(
    `mutation DismissDesignImageJob($id: ID!) { dismissDesignImageJob(id: $id) }`,
    { id },
  );
  return data.dismissDesignImageJob;
}

/** Stops a picture waiting or being drawn: a queued one is never started, and a drawing one is thrown away. */
export async function stopDesignImageJob(workspaceId: string, id: string): Promise<DesignImageJob> {
  const data = await graphql<{ stopDesignImageJob: DesignImageJob }>(
    `mutation StopDesignImageJob($workspaceId: ID!, $id: ID!) { stopDesignImageJob(workspaceId: $workspaceId, id: $id) { ${JOB_FIELDS} } }`,
    { workspaceId, id },
  );
  return data.stopDesignImageJob;
}

/** Calls a picture drawn in Design something else; its file is named after it too. */
export async function renameDesignImage(workspaceId: string, id: string, name: string): Promise<Artifact> {
  const data = await graphql<{ renameDesignImage: Artifact }>(
    `mutation RenameDesignImage($workspaceId: ID!, $id: ID!, $name: String!) {
       renameDesignImage(workspaceId: $workspaceId, id: $id, name: $name) { ${ARTIFACT_FIELDS} }
     }`,
    { workspaceId, id, name },
  );
  return data.renameDesignImage;
}

/** A change to part of a picture, asked of an image model's `/images/edits`. */
export interface EditDesignImageInput {
  workspaceId: string;
  /** The picture to change, by its artifact id. */
  imageId: string;
  modelId: string;
  prompt: string;
  /** A PNG the picture's size, as a data URL, transparent where the change goes. */
  mask: string;
  name?: string | null;
  /** How far the selection's edge is softened, in the picture's own pixels; 0 is a hard edge, null the installation's. */
  feather?: number | null;
}

/** Queues the change and answers at once; the result is a new picture, the one changed stays. */
export async function queueDesignImageEdit(input: EditDesignImageInput): Promise<DesignImageJob> {
  const data = await graphql<{ queueDesignImageEdit: DesignImageJob }>(
    `mutation QueueDesignImageEdit($input: EditDesignImageInput!) { queueDesignImageEdit(input: $input) { ${JOB_FIELDS} } }`,
    { input },
  );
  return data.queueDesignImageEdit;
}

/** Where the image editor's own tools start and how far each may go, in the picture's own pixels: the installation's numbers. */
export interface ImageEditorSettings {
  brush: number;
  brushMost: number;
  blur: number;
  blurMost: number;
  /** How far the blur fades out inside a rectangle or lasso's edge to start with; 0 is a hard edge. */
  blurFalloff: number;
  blurFalloffMost: number;
  feather: number;
  featherMost: number;
  /** How many layers a picture may keep over it. */
  layersMost: number;
  /** How opaque the brush starts, in percent: every tip but the marker. */
  brushOpacity: number;
  /** How hard the soft tip's and the eraser's edge starts, in percent. */
  brushHardness: number;
  /** How opaque the marker starts, in percent. */
  markerOpacity: number;
}

export async function fetchDesignImageEditorSettings(workspaceId: string): Promise<ImageEditorSettings> {
  const data = await graphql<{ designImageEditorSettings: ImageEditorSettings }>(
    `query DesignImageEditorSettings($workspaceId: ID!) { designImageEditorSettings(workspaceId: $workspaceId) { brush brushMost blur blurMost blurFalloff blurFalloffMost feather featherMost layersMost brushOpacity brushHardness markerOpacity } }`,
    { workspaceId },
  );
  return data.designImageEditorSettings;
}

/**
 * A change the editor worked out itself - rotated, mirrored, cropped, painted -
 * kept as an unsaved version of the picture, as a model's change is. Answered
 * already drawn, with the version.
 */
export async function keepDesignImageChange(input: {
  workspaceId: string;
  /** The picture the change was made to, by its artifact id. */
  imageId: string;
  /** The changed picture, as a data URL. */
  image: string;
  /** What was done, as the history says it. */
  change: string;
  /** The layers it was made with, the picture itself first; image is then them flattened. Left out, the version is flat. */
  layers?: DesignImageLayerInput[];
}): Promise<DesignImageJob> {
  const data = await graphql<{ keepDesignImageChange: DesignImageJob }>(
    `mutation KeepDesignImageChange($input: KeepDesignImageChangeInput!) { keepDesignImageChange(input: $input) { ${JOB_FIELDS} } }`,
    { input },
  );
  return data.keepDesignImageChange;
}

/** One layer of a picture as a change is kept with it: its pixels as a PNG data URL. */
export interface DesignImageLayerInput {
  /** Null for the picture itself. */
  name: string | null;
  visible: boolean;
  /** The picture itself, under every layer: the first, and only there. */
  picture: boolean;
  image: string;
}

/** One layer of a picture as it was kept: the picture's own file is them flattened. */
export interface DesignImageLayer {
  id: string;
  /** Null for the picture itself. */
  name: string | null;
  visible: boolean;
  /** The picture itself, at the foot of the stack: its pixels without the layers over it. */
  picture: boolean;
  url: string;
}

/** A picture's layers, the picture itself first; empty for one kept flat. */
export async function fetchDesignImageLayers(workspaceId: string, imageId: string): Promise<DesignImageLayer[]> {
  const data = await graphql<{ designImageLayers: DesignImageLayer[] }>(
    `query DesignImageLayers($workspaceId: ID!, $imageId: ID!) { designImageLayers(workspaceId: $workspaceId, imageId: $imageId) { id name visible picture url } }`,
    { workspaceId, imageId },
  );
  return data.designImageLayers;
}

/** Saves an unsaved version over the picture it is a version of, and throws the picture's other versions away. */
export async function saveDesignImageVersion(workspaceId: string, id: string, asCopy = false): Promise<Artifact> {
  const data = await graphql<{ saveDesignImageVersion: Artifact }>(
    `mutation SaveDesignImageVersion($workspaceId: ID!, $id: ID!, $asCopy: Boolean) { saveDesignImageVersion(workspaceId: $workspaceId, id: $id, asCopy: $asCopy) { ${ARTIFACT_FIELDS} } }`,
    { workspaceId, id, asCopy },
  );
  return data.saveDesignImageVersion;
}

/** Throws away every unsaved version of a picture. */
export async function discardDesignImageVersions(workspaceId: string, id: string): Promise<boolean> {
  const data = await graphql<{ discardDesignImageVersions: boolean }>(
    `mutation DiscardDesignImageVersions($workspaceId: ID!, $id: ID!) { discardDesignImageVersions(workspaceId: $workspaceId, id: $id) }`,
    { workspaceId, id },
  );
  return data.discardDesignImageVersions;
}

/** A picture made larger by an upscale model: an unsaved version of it, as an edit's is. */
export async function queueDesignImageUpscale(input: {
  workspaceId: string;
  imageId: string;
  modelId: string;
  algorithm: string | null;
  scale: number;
}): Promise<DesignImageJob> {
  const data = await graphql<{ queueDesignImageUpscale: DesignImageJob }>(
    `mutation QueueDesignImageUpscale($input: UpscaleDesignImageInput!) { queueDesignImageUpscale(input: $input) { ${JOB_FIELDS} } }`,
    { input },
  );
  return data.queueDesignImageUpscale;
}

/** What an upscale model's server can make a picture larger with, asked of it now. */
export interface UpscaleAlgorithms {
  names: string[];
  preferred: string | null;
  /** Why the server could not be asked; names is then empty. */
  reason: string | null;
  /** Of names, the restoration models Clean up offers - SCUNet, SwinIR, FBCNN, 1x models. */
  restorers: string[];
}

export async function fetchDesignUpscaleAlgorithms(workspaceId: string, modelId: string): Promise<UpscaleAlgorithms> {
  const data = await graphql<{ designUpscaleAlgorithms: UpscaleAlgorithms }>(
    `query DesignUpscaleAlgorithms($workspaceId: ID!, $modelId: ID!) { designUpscaleAlgorithms(workspaceId: $workspaceId, modelId: $modelId) { names preferred reason restorers } }`,
    { workspaceId, modelId },
  );
  return data.designUpscaleAlgorithms;
}

/** The whole picture redrawn lightly, so the seams a Magic edit left blend: an unsaved version of it, as an edit's is. */
export async function queueDesignImageHarmonize(input: {
  workspaceId: string;
  imageId: string;
  modelId: string;
  prompt: string;
  /** A WebUI's denoising strength; null where the model takes none. */
  strength: number | null;
  checkpoint: string | null;
}): Promise<DesignImageJob> {
  const data = await graphql<{ queueDesignImageHarmonize: DesignImageJob }>(
    `mutation QueueDesignImageHarmonize($input: HarmonizeDesignImageInput!) { queueDesignImageHarmonize(input: $input) { ${JOB_FIELDS} } }`,
    { input },
  );
  return data.queueDesignImageHarmonize;
}

/** What Harmonize can be asked with one model. */
export interface HarmonizeOptions {
  /** A Stable Diffusion WebUI takes a strength; the standard edit endpoint does not. */
  strengthTaken: boolean;
  /** Where the strength starts: the installation's setting. */
  strength: number;
  /** A WebUI's checkpoints, the loaded one first. */
  checkpoints: string[];
  preferredCheckpoint: string | null;
  /** Why the WebUI could not be asked; checkpoints is then empty. */
  reason: string | null;
}

export async function fetchDesignHarmonizeOptions(workspaceId: string, modelId: string): Promise<HarmonizeOptions> {
  const data = await graphql<{ designHarmonizeOptions: HarmonizeOptions }>(
    `query DesignHarmonizeOptions($workspaceId: ID!, $modelId: ID!) { designHarmonizeOptions(workspaceId: $workspaceId, modelId: $modelId) { strengthTaken strength checkpoints preferredCheckpoint reason } }`,
    { workspaceId, modelId },
  );
  return data.designHarmonizeOptions;
}

/** Keeps a picture brought in from outside - a picture's file, or an .orkx archive - as a Design picture. */
export async function importDesignImage(input: {
  workspaceId: string;
  /** A picture's file, as a data URL. */
  image?: string;
  /** An .orkx archive, as a data URL: the picture with its project. */
  archive?: string;
  name?: string | null;
  prompt?: string | null;
}): Promise<Artifact> {
  const data = await graphql<{ importDesignImage: Artifact }>(
    `mutation ImportDesignImage($input: ImportDesignImageInput!) { importDesignImage(input: $input) { ${ARTIFACT_FIELDS} } }`,
    { input },
  );
  return data.importDesignImage;
}
