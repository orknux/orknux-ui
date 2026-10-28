import { graphql } from './client';
import { fetchModels } from './models';
import type { Model } from './models';

/** How a video setting is asked for: one of its choices, a whole number, or a picture of the workspace's. */
export type VideoSettingKind = 'CHOICE' | 'NUMBER' | 'PICTURE';

/** The settings a video model may take; which it does is the model's server's answer. */
export type VideoSettingName = 'seconds' | 'size' | 'frames' | 'fps' | 'width' | 'height' | 'seed' | 'startImage';

/** One thing a video model takes beyond the prompt. */
export interface VideoSetting {
  name: VideoSettingName;
  kind: VideoSettingKind;
  choices: string[];
  /** A NUMBER's bounds, as text: a seed is wider than a JavaScript number is exact. */
  least: string | null;
  most: string | null;
  /** What the server uses when it is left out, where it says. */
  preset: string | null;
}

export interface VideoSettings {
  settings: VideoSetting[];
  /** Why nothing could be learnt, where nothing could. */
  reason: string | null;
}

export type DesignVideoStatus = 'QUEUED' | 'GENERATING' | 'DONE' | 'FAILED' | 'STOPPED';

/** A video asked for on Design's Videos page, and where it is on its way to being made. */
export interface DesignVideo {
  id: string;
  status: DesignVideoStatus;
  name: string;
  prompt: string;
  modelId: string | null;
  model: string;
  seconds: number | null;
  size: string | null;
  frames: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  seed: string | null;
  startImageId: string | null;
  startImageUrl: string | null;
  requestedBy: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  reason: string | null;
  /** How far it has got, in percent, where its server says. */
  progress: number | null;
  /** Whether progress counts only the sampling steps, as stable-diffusion.cpp's does: the decode after them is not in it. */
  progressSamplingOnly: boolean;
  /** The server's clock when this was read, to count from startedAt on the same clock. */
  asOf: string;
  /** How many queued videos are made before this one; null unless QUEUED. */
  ahead: number | null;
  /** The file, once DONE. */
  url: string | null;
  posterUrl: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  /** The video this is a version of; null for one a video model made. */
  versionOf: string | null;
  /** The video an upscale took its frames from; null for anything else. */
  upscaledFrom: string | null;
  upscaler: string | null;
  /** How many times larger an upscale makes it. */
  scale: number | null;
  /** How many of an upscale's frames are done, of framesTotal; null until they are counted. */
  framesDone: number | null;
  framesTotal: number | null;
  /** The catalog it is filed in: the default where it was never filed. A version is in its original's. */
  catalogId: string;
  catalogName: string;
}

const VIDEO_FIELDS = `
  id status name prompt modelId model seconds size frames fps width height seed startImageId startImageUrl
  requestedBy requestedAt startedAt finishedAt reason progress progressSamplingOnly asOf ahead url posterUrl contentType sizeBytes durationSeconds
  versionOf upscaledFrom upscaler scale framesDone framesTotal catalogId catalogName
`;

/** What one video model takes, asked of its server now. */
export async function fetchVideoSettings(workspaceId: string, modelId: string): Promise<VideoSettings> {
  const data = await graphql<{ designVideoSettings: VideoSettings }>(
    `query DesignVideoSettings($workspaceId: ID!, $modelId: ID!) {
       designVideoSettings(workspaceId: $workspaceId, modelId: $modelId) {
         reason settings { name kind choices least most preset }
       }
     }`,
    { workspaceId, modelId },
  );
  return data.designVideoSettings;
}

/** The workspace's videos, newest first. */
export async function fetchDesignVideos(workspaceId: string, search = '', catalogId: string | null = null): Promise<DesignVideo[]> {
  const data = await graphql<{ designVideos: DesignVideo[] }>(
    `query DesignVideos($workspaceId: ID!, $search: String, $catalogId: ID) {
       designVideos(workspaceId: $workspaceId, search: $search, catalogId: $catalogId) { ${VIDEO_FIELDS} }
     }`,
    { workspaceId, search: search.trim() === '' ? null : search.trim(), catalogId },
  );
  return data.designVideos;
}

export async function fetchDesignVideo(workspaceId: string, id: string): Promise<DesignVideo | null> {
  const data = await graphql<{ designVideo: DesignVideo | null }>(
    `query DesignVideo($workspaceId: ID!, $id: ID!) { designVideo(workspaceId: $workspaceId, id: $id) { ${VIDEO_FIELDS} } }`,
    { workspaceId, id },
  );
  return data.designVideo;
}

/** What a video is asked with: the prompt, and only the settings the model said it takes. */
export interface QueueDesignVideo {
  workspaceId: string;
  modelId: string;
  prompt: string;
  name?: string | null;
  seconds?: number | null;
  size?: string | null;
  frames?: number | null;
  fps?: number | null;
  width?: number | null;
  height?: number | null;
  seed?: string | null;
  startImageId?: string | null;
  /** The video catalog to file it in; the default where it is left out. */
  catalogId?: string | null;
}

export async function queueDesignVideo(input: QueueDesignVideo): Promise<DesignVideo> {
  const data = await graphql<{ queueDesignVideo: DesignVideo }>(
    `mutation QueueDesignVideo($input: QueueDesignVideoInput!) { queueDesignVideo(input: $input) { ${VIDEO_FIELDS} } }`,
    { input },
  );
  return data.queueDesignVideo;
}

/** A finished video made larger, frame by frame, by an upscale model: a new version, the video kept as it was. */
export async function queueDesignVideoUpscale(input: {
  workspaceId: string;
  videoId: string;
  modelId: string;
  /** One of the WebUI's algorithms; null is the model's own. */
  algorithm: string | null;
  scale: number;
}): Promise<DesignVideo> {
  const data = await graphql<{ queueDesignVideoUpscale: DesignVideo }>(
    `mutation QueueDesignVideoUpscale($input: UpscaleDesignVideoInput!) { queueDesignVideoUpscale(input: $input) { ${VIDEO_FIELDS} } }`,
    { input },
  );
  return data.queueDesignVideoUpscale;
}

export async function stopDesignVideo(workspaceId: string, id: string): Promise<DesignVideo> {
  const data = await graphql<{ stopDesignVideo: DesignVideo }>(
    `mutation StopDesignVideo($workspaceId: ID!, $id: ID!) { stopDesignVideo(workspaceId: $workspaceId, id: $id) { ${VIDEO_FIELDS} } }`,
    { workspaceId, id },
  );
  return data.stopDesignVideo;
}

export async function removeDesignVideo(workspaceId: string, id: string): Promise<boolean> {
  const data = await graphql<{ removeDesignVideo: boolean }>(
    `mutation RemoveDesignVideo($workspaceId: ID!, $id: ID!) { removeDesignVideo(workspaceId: $workspaceId, id: $id) }`,
    { workspaceId, id },
  );
  return data.removeDesignVideo;
}

/** What a finished video may be exported as. */
export type VideoExportFormat = 'GIF' | 'MP4' | 'MKV';

/** A video converted for download: where it is, and what it came to. */
export interface VideoExport {
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

/** Converts a finished video on the server, while this waits, and answers where to download it from. */
export async function exportDesignVideo(workspaceId: string, id: string, format: VideoExportFormat): Promise<VideoExport> {
  const data = await graphql<{ exportDesignVideo: VideoExport }>(
    `mutation ExportDesignVideo($workspaceId: ID!, $id: ID!, $format: DesignVideoExportFormat!) {
       exportDesignVideo(workspaceId: $workspaceId, id: $id, format: $format) { url filename contentType sizeBytes }
     }`,
    { workspaceId, id, format },
  );
  return data.exportDesignVideo;
}

/** Whether a video is still on its way. */
export function onTheWay(video: DesignVideo): boolean {
  return video.status === 'QUEUED' || video.status === 'GENERATING';
}

/** Whether the file plays in a `<video>`; an animated WebP is shown as a picture instead. */
export function playable(video: DesignVideo): boolean {
  return (video.contentType ?? '').startsWith('video/');
}

/**
 * The workspace's video models that take a picture to start from, asked of
 * each model's server: what "Convert to video" needs to lead anywhere.
 */
export async function fetchVideoModelsFromPicture(workspaceId: string): Promise<Model[]> {
  const models = (await fetchModels(workspaceId)).filter((one) => one.kind === 'VIDEO' && one.enabled);
  const taking = await Promise.all(
    models.map((one) =>
      fetchVideoSettings(workspaceId, one.id)
        .then((answer) => answer.settings.some((setting) => setting.name === 'startImage'))
        .catch(() => false),
    ),
  );
  return models.filter((_, index) => taking[index]);
}
