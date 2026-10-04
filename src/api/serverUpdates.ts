import { ApiError, graphql, refusalOf } from './client';
import { t } from '../i18n';

/**
 * Server updates, issue #584: what this server runs, what the official server
 * offers newer than it, and the jars the database keeps to roll back to. A jar
 * can also come from a URL, such as a company's Artifactory (#589).
 * Administrators only.
 */

export type ServerReleaseSource = 'ORKNUX_AI' | 'UPLOAD' | 'URL';
export type ServerReleaseState = 'STORED' | 'ACTIVATING' | 'ACTIVE' | 'FAILED';

export interface OfferedServerRelease {
  version: string;
  publishedAt: string;
  /** Markdown: that version's section of the changelog. */
  changelog: string;
  size: number;
  /** Already in the database, so Update only starts it. */
  stored: boolean;
}

export interface StoredServerRelease {
  id: string;
  version: string;
  source: ServerReleaseSource;
  /** Where a URL release came from, without its credential or query. */
  sourceUrl: string | null;
  size: number;
  schemaVersion: number;
  storedAt: string;
  storedBy: string;
  state: ServerReleaseState;
  failure: string | null;
  running: boolean;
  activatable: boolean;
  /** Why it cannot be started, where it cannot. */
  refusal: string | null;
}

export interface ServerUpdates {
  /** ORKNUX_SELF_UPDATE; false and the lists are empty. */
  enabled: boolean;
  runningVersion: string;
  runningRelease: StoredServerRelease | null;
  /** False outside the image's start loop: an update is stored, and somebody restarts it. */
  restartable: boolean;
  offered: boolean;
  offeredError: string | null;
  available: OfferedServerRelease[];
  stored: StoredServerRelease[];
  kept: number;
  imageVersion: string;
  imageActivatable: boolean;
  imageRefusal: string | null;
  /** ORKNUX_RELEASE_SOURCE_URL, to fill the URL field with. */
  sourceUrl: string | null;
  /** One switch per source, under ORKNUX_SELF_UPDATE (#589). */
  officialEnabled: boolean;
  uploadEnabled: boolean;
  urlEnabled: boolean;
  /** The largest jar taken, in MB, so a bigger one is refused before it is sent. */
  maxMb: number;
  /** ORKNUX_RELEASE_PIN (#593): the version every start runs, whatever is chosen here. */
  pin: string | null;
  /** Why the pin could not be honoured, so the image's own jar runs instead. */
  pinRefusal: string | null;
}

/** A release a repository's releases.json lists, its jarUrl already absolute. */
export interface ListedServerRelease {
  version: string;
  jarUrl: string;
  stored: boolean;
}

const STORED_FIELDS =
  'id version source sourceUrl size schemaVersion storedAt storedBy state failure running activatable refusal';

export async function fetchServerUpdates(): Promise<ServerUpdates> {
  const data = await graphql<{ serverUpdates: ServerUpdates }>(
    `query ServerUpdates {
      serverUpdates {
        enabled runningVersion restartable offered offeredError kept
        imageVersion imageActivatable imageRefusal
        sourceUrl officialEnabled uploadEnabled urlEnabled maxMb pin pinRefusal
        runningRelease { ${STORED_FIELDS} }
        available { version publishedAt changelog size stored }
        stored { ${STORED_FIELDS} }
      }
    }`,
  );
  return data.serverUpdates;
}

export type ServerReleaseDownloadState =
  | 'DOWNLOADING'
  | 'WAITING'
  | 'VERIFYING'
  | 'STORING'
  | 'RESTARTING'
  | 'DONE'
  | 'FAILED';

/**
 * A server jar on its way in (#602): Update and Fetch start one and answer at
 * once, and the server downloads, verifies and stores it by itself, writing
 * where it stands here about once a second.
 */
export interface ServerReleaseDownload {
  id: string;
  source: ServerReleaseSource;
  /** Listed by the official server, or read from a URL's jar once verified. */
  version: string | null;
  host: string;
  state: ServerReleaseDownloadState;
  received: number;
  total: number | null;
  bytesPerSecond: number;
  attempts: number;
  /** Connections that went on from the bytes already held rather than starting again. */
  resumed: number;
  failedInRow: number;
  /** While WAITING, when the next connection is made. */
  nextAttemptAt: string | null;
  /** Why the last connection broke, while it is retried. */
  lastError: string | null;
  /** Update starts the release once stored; Fetch only stores it. */
  activate: boolean;
  releaseId: string | null;
  failure: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const DOWNLOAD_FIELDS =
  'id source version host state received total bytesPerSecond attempts resumed failedInRow nextAttemptAt lastError activate releaseId failure startedAt finishedAt';

/** Starts downloading a release the official server offers; the server carries on by itself. */
export async function installServerRelease(version: string): Promise<ServerReleaseDownload> {
  const data = await graphql<{ installServerRelease: ServerReleaseDownload }>(
    `mutation Install($version: String!) { installServerRelease(version: $version) { ${DOWNLOAD_FIELDS} } }`,
    { version },
  );
  return data.installServerRelease;
}

/** The newest download nobody has put away, or null: what the page polls while one runs. */
export async function fetchServerReleaseDownload(): Promise<ServerReleaseDownload | null> {
  const data = await graphql<{ serverReleaseDownload: ServerReleaseDownload | null }>(
    `query ServerReleaseDownload { serverReleaseDownload { ${DOWNLOAD_FIELDS} } }`,
  );
  return data.serverReleaseDownload;
}

/** Puts away how a download ended, so the page stops showing it. */
export async function dismissServerReleaseDownload(id: string): Promise<void> {
  await graphql<{ dismissServerReleaseDownload: boolean }>(
    'mutation Dismiss($id: ID!) { dismissServerReleaseDownload(id: $id) }',
    { id },
  );
}

export async function activateServerRelease(id: string): Promise<boolean> {
  const data = await graphql<{ activateServerRelease: { restarting: boolean } }>(
    'mutation Activate($id: ID!) { activateServerRelease(id: $id) { restarting } }',
    { id },
  );
  return data.activateServerRelease.restarting;
}

/** Takes a kept release out of the history; the server refuses the one running or chosen. */
export async function removeServerRelease(id: string): Promise<void> {
  await graphql<{ removeServerRelease: boolean }>('mutation Remove($id: ID!) { removeServerRelease(id: $id) }', { id });
}

export async function activateImageRelease(): Promise<boolean> {
  const data = await graphql<{ activateImageRelease: { restarting: boolean } }>(
    'mutation Image { activateImageRelease { restarting } }',
  );
  return data.activateImageRelease.restarting;
}

/**
 * A jar from the administrator's disk, verified and stored; starting it is the
 * same button as for any other stored release. The body is the jar itself, not
 * a form - see ServerReleaseAPI for why.
 */
export async function uploadServerRelease(file: File): Promise<string> {
  const answer = await fetch('/api/server-releases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
    credentials: 'include',
  });
  const body = (await answer.json().catch(() => ({}))) as {
    version?: string;
    message?: string;
    code?: string;
    arguments?: Record<string, unknown>;
  };
  if (!answer.ok) {
    const message = body.message ?? t('The jar could not be uploaded.');
    throw new ApiError(refusalOf(message, body.code, body.arguments), answer.status, body.code, body.arguments);
  }
  return body.version ?? '';
}

/**
 * A jar at a URL, fetched by the server through its proxy rules in the
 * background (#602), verified like an upload and stored without being
 * started. The credential is sent to that host and never comes back.
 */
export async function installServerReleaseFromUrl(url: string, credential: string): Promise<ServerReleaseDownload> {
  const data = await graphql<{ installServerReleaseFromUrl: ServerReleaseDownload }>(
    `mutation FromUrl($url: String!, $credential: String) { installServerReleaseFromUrl(url: $url, credential: $credential) { ${DOWNLOAD_FIELDS} } }`,
    { url, credential: credential.trim() === '' ? null : credential },
  );
  return data.installServerReleaseFromUrl;
}

/** What releases.json in the directory at [url] lists newer than what runs. */
export async function serverReleasesAtUrl(url: string, credential: string): Promise<ListedServerRelease[]> {
  const data = await graphql<{ serverReleasesAtUrl: ListedServerRelease[] }>(
    'query AtUrl($url: String!, $credential: String) { serverReleasesAtUrl(url: $url, credential: $credential) { version jarUrl stored } }',
    { url, credential: credential.trim() === '' ? null : credential },
  );
  return data.serverReleasesAtUrl;
}

/** Whether the server answers again, for the page waiting out a restart. */
export async function serverAnswers(): Promise<boolean> {
  try {
    const answer = await fetch('/api/auth/method', { credentials: 'include', cache: 'no-store' });
    return answer.ok;
  } catch {
    return false;
  }
}
