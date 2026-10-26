import { payloadOf, readEventStream } from './sse';

/**
 * The workflow editor's live channel: who else has the workflow open, where
 * their pointers are, and that somebody saved the graph. Issue #645. Since
 * #683 every editor that saves as it goes sits in a room the same way, so the
 * room itself is [joinRoom] and [pointerTo]; see `live.ts` for the others.
 */

/** One open editor - one tab - as the others are shown it. */
export interface Viewer {
  viewer: string;
  login: string;
}

/** Where a viewer's pointer is on the canvas, in the canvas's own coordinates; null when it has left. */
export interface Pointer extends Viewer {
  x: number | null;
  y: number | null;
}

/** It was saved: its new revision, and which editor saved it (null for a tool). */
export interface GraphMoved {
  revision: number;
  viewer: string | null;
  login: string;
}

export interface LiveHandlers {
  /** The revision the draft was at as the stream opened. */
  onHello: (revision: number) => void;
  onViewers: (viewers: Viewer[]) => void;
  onPointer: (pointer: Pointer) => void;
  onGraph: (moved: GraphMoved) => void;
}

/** What a room tells an open editor; [onSaved] is a save by anybody, this editor's own included. */
export interface RoomHandlers {
  onHello: (revision: number) => void;
  onViewers: (viewers: Viewer[]) => void;
  onPointer: (pointer: Pointer) => void;
  onSaved: (moved: GraphMoved) => void;
}

/**
 * How long to wait before opening the stream again after it failed - the same
 * wait, for the same reason, as the task page's.
 */
const RETURN_AFTER_MS = 2_000;

/** A name for this open editor, made up once per tab and sent with every save and pointer. */
export function newViewer(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Sits this editor in the workflow's room until the returned function is
 * called. A dropped stream is opened again: the room is told this viewer is
 * there once more, and what was missed is only pointers and a revision the
 * hello carries. A workflow's save comes under `graph`.
 */
export function joinWorkflow(
  workspaceId: string,
  workflowId: string,
  viewer: string,
  handlers: LiveHandlers,
): () => void {
  return joinRoom(`/api/workspaces/${workspaceId}/workflows/${workflowId}/live?viewer=${encodeURIComponent(viewer)}`, 'graph', {
    onHello: handlers.onHello,
    onViewers: handlers.onViewers,
    onPointer: handlers.onPointer,
    onSaved: handlers.onGraph,
  });
}

/**
 * Sits an editor in the room the stream at [address] is, until the returned
 * function is called, opening it again whenever it drops. [savedEvent] is the
 * name a save comes under: `graph` for a workflow, `saved` for the rest.
 */
export function joinRoom(address: string, savedEvent: string, handlers: RoomHandlers): () => void {
  const stopper = new AbortController();
  let stopped = false;

  async function stint(): Promise<void> {
    const response = await fetch(address, {
      credentials: 'same-origin',
      headers: { Accept: 'text/event-stream' },
      signal: stopper.signal,
    });
    await readEventStream(response, (frame) => {
      if (frame.event === 'hello') {
        const hello = payloadOf<{ revision: number }>(frame);
        if (hello !== null) handlers.onHello(hello.revision);
      } else if (frame.event === 'presence') {
        const here = payloadOf<{ viewers: Viewer[] }>(frame);
        if (here !== null) handlers.onViewers(here.viewers);
      } else if (frame.event === 'pointer') {
        const at = payloadOf<Pointer>(frame);
        if (at !== null) handlers.onPointer(at);
      } else if (frame.event === savedEvent) {
        const moved = payloadOf<GraphMoved>(frame);
        if (moved !== null) handlers.onSaved(moved);
      }
    });
  }

  void (async () => {
    for (;;) {
      if (stopped) return;
      try {
        await stint();
      } catch (cause: unknown) {
        if (stopped || (cause instanceof DOMException && cause.name === 'AbortError')) return;
      }
      if (stopped) return;
      await new Promise((wake) => {
        window.setTimeout(wake, RETURN_AFTER_MS);
      });
    }
  })();

  return () => {
    stopped = true;
    stopper.abort();
  };
}

/**
 * Where this editor's pointer is, for the others. One at a time: a call still
 * on its way when the pointer moves again is followed by the newest place
 * once it lands, rather than queued behind every place in between.
 */
export function pointerSender(workspaceId: string, workflowId: string, viewer: string): (x: number | null, y: number | null) => void {
  return pointerTo(`/api/workspaces/${workspaceId}/workflows/${workflowId}/live/pointer`, viewer);
}

/** The same, for any room: the pointer is posted to [address]. */
export function pointerTo(address: string, viewer: string): (x: number | null, y: number | null) => void {
  let sending = false;
  let next: { x: number | null; y: number | null } | null = null;

  async function send(at: { x: number | null; y: number | null }) {
    sending = true;
    try {
      await fetch(address, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ viewer, ...at }),
      });
    } catch {
      // A pointer that did not arrive is replaced by the next one; nothing to say.
    } finally {
      sending = false;
      if (next !== null) {
        const held = next;
        next = null;
        void send(held);
      }
    }
  }

  return (x, y) => {
    if (sending) next = { x, y };
    else void send({ x, y });
  };
}

/** How many presence colours `tokens.css` holds. */
const PRESENCE_COLOURS = 6;

/** The colour a login is drawn in, the same in every tab that draws it: one of the presence tokens. */
export function colourOf(login: string): string {
  let hash = 0;
  for (const letter of login) hash = (hash * 31 + letter.charCodeAt(0)) | 0;
  return `var(--color-presence-${(Math.abs(hash) % PRESENCE_COLOURS) + 1})`;
}
