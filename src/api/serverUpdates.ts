import { ApiError, graphql, refusalOf } from './client';
import { t } from '../i18n';

/**
 * Server updates, issue #584: what this server runs, what orknux.ai offers newer
 * than it, and the jars the database keeps to roll back to. Administrators only.
 */

export type ServerReleaseSource = 'ORKNUX_AI' | 'UPLOAD';
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
}

const STORED_FIELDS = 'id version source size schemaVersion storedAt storedBy state failure running activatable refusal';

export async function fetchServerUpdates(): Promise<ServerUpdates> {
  const data = await graphql<{ serverUpdates: ServerUpdates }>(
    `query ServerUpdates {
      serverUpdates {
        enabled runningVersion restartable offered offeredError kept
        imageVersion imageActivatable imageRefusal
        runningRelease { ${STORED_FIELDS} }
        available { version publishedAt changelog size stored }
        stored { ${STORED_FIELDS} }
      }
    }`,
  );
  return data.serverUpdates;
}

/** Whether the server will restart itself now. */
export async function installServerRelease(version: string): Promise<boolean> {
  const data = await graphql<{ installServerRelease: { restarting: boolean } }>(
    'mutation Install($version: String!) { installServerRelease(version: $version) { restarting } }',
    { version },
  );
  return data.installServerRelease.restarting;
}

export async function activateServerRelease(id: string): Promise<boolean> {
  const data = await graphql<{ activateServerRelease: { restarting: boolean } }>(
    'mutation Activate($id: ID!) { activateServerRelease(id: $id) { restarting } }',
    { id },
  );
  return data.activateServerRelease.restarting;
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

/** Whether the server answers again, for the page waiting out a restart. */
export async function serverAnswers(): Promise<boolean> {
  try {
    const answer = await fetch('/api/auth/method', { credentials: 'include', cache: 'no-store' });
    return answer.ok;
  } catch {
    return false;
  }
}
