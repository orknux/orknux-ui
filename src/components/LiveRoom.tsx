import { useEffect, useMemo, useRef, useState } from 'react';
import { graphql } from '../api/client';
import { colourOf, joinRoom, newViewer, pointerTo } from '../api/workflowLive';
import type { GraphMoved, Pointer, Viewer } from '../api/workflowLive';
import styles from './LiveRoom.module.css';

/**
 * Working together in the diagram, document and wireframe editors, as the
 * workflow editor has since #645: who else has it open, where they point, each
 * save as it lands, and saving as it goes. Issue #683.
 */

/** Which kind of thing a room is for, as `/api/live/{kind}/{id}` names it. */
export type LiveKind = 'diagram' | 'document' | 'wireframe';

/** How long an editor waits before saving when the server cannot be asked. */
const AUTOSAVE_FALLBACK_MS = 800;

let autosaveAsked: Promise<number> | null = null;

/** Admin Settings' pause before an editor saves, asked once per page load. */
export function editorAutosaveMillis(): Promise<number> {
  autosaveAsked ??= graphql<{ editorAutosaveMillis: number }>('query { editorAutosaveMillis }')
    .then((held) => held.editorAutosaveMillis)
    .catch(() => AUTOSAVE_FALLBACK_MS);
  return autosaveAsked;
}

export interface LiveRoom {
  /** This tab's name in the room, sent with each save so the room can tell it from the others'. */
  viewer: string;
  /** Who else has it open: one per login, this tab's own login left out only where it is this tab. */
  others: Viewer[];
  /** Where the others point, in the editor's own coordinates. */
  pointers: Pointer[];
  /** Says where this tab's pointer is; nulls when it has left the editor. */
  point: (x: number | null, y: number | null) => void;
}

/**
 * Sits this editor in the room of [kind] [id] while it is open. [onSaved] is
 * called for a save by anybody but this tab - another person, another tab of
 * theirs, or a model through the tools.
 */
export function useLiveRoom(kind: LiveKind, id: string | null, onSaved: (moved: GraphMoved) => void): LiveRoom {
  const viewer = useMemo(() => newViewer(), []);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [pointers, setPointers] = useState<Pointer[]>([]);
  // The newest handler, so a save that lands reads the editor as it is now.
  const saved = useRef(onSaved);
  saved.current = onSaved;

  useEffect(() => {
    if (id === null) return;
    setViewers([]);
    setPointers([]);
    return joinRoom(`/api/live/${kind}/${id}?viewer=${encodeURIComponent(viewer)}`, 'saved', {
      onHello: () => undefined,
      onViewers: setViewers,
      onPointer: (at) =>
        setPointers((held) => [...held.filter((one) => one.viewer !== at.viewer), ...(at.x === null || at.y === null ? [] : [at])]),
      onSaved: (moved) => {
        if (moved.viewer !== viewer) saved.current(moved);
      },
    });
  }, [kind, id, viewer]);

  const point = useMemo(
    () => (id === null ? () => undefined : pointerTo(`/api/live/${kind}/${id}/pointer`, viewer)),
    [kind, id, viewer],
  );

  const others = useMemo(() => {
    const seen = new Set<string>();
    return viewers.filter((one) => one.viewer !== viewer && !seen.has(one.login) && (seen.add(one.login), true));
  }, [viewers, viewer]);

  return { viewer, others, pointers, point };
}

/**
 * Saves [save] once nothing has changed for Admin Settings' pause, while
 * [unsaved]; [change] is anything that differs whenever the work does.
 * Paused while [paused] - a save already going, a model writing.
 */
export function useAutosave(unsaved: boolean, change: string, paused: boolean, save: () => Promise<unknown>): void {
  const [millis, setMillis] = useState<number | null>(null);
  const latest = useRef(save);
  latest.current = save;

  useEffect(() => {
    let left = false;
    void editorAutosaveMillis().then((held) => {
      if (!left) setMillis(held);
    });
    return () => {
      left = true;
    };
  }, []);

  useEffect(() => {
    if (!unsaved || paused || millis === null) return;
    const timer = window.setTimeout(() => void latest.current(), millis);
    return () => window.clearTimeout(timer);
  }, [unsaved, change, paused, millis]);
}

/** Who else has it open, by login, in the colour their pointer is drawn in. */
export function Presence({ others }: { others: Viewer[] }) {
  if (others.length === 0) return null;
  return (
    <span className={styles.presence} data-testid="presence">
      {others.map((one) => (
        <span
          key={one.login}
          className={styles.presenceDot}
          style={{ borderColor: colourOf(one.login) }}
          title={one.login}
          aria-label={one.login}
          data-login={one.login}
        >
          {one.login.slice(0, 2).toUpperCase()}
        </span>
      ))}
    </span>
  );
}

/**
 * The others' pointers, inside a positioned element: [place] turns a pointer's
 * coordinates into pixels within it, so a canvas that is panned and zoomed
 * draws them where they point.
 */
export function LivePointers({ pointers, place }: { pointers: Pointer[]; place: (x: number, y: number) => { left: number; top: number } }) {
  return (
    <div className={styles.pointers} aria-hidden="true">
      {pointers.map((one) => {
        if (one.x === null || one.y === null) return null;
        const at = place(one.x, one.y);
        return (
          <div
            key={one.viewer}
            className={styles.pointer}
            data-pointer={one.login}
            style={{ transform: `translate(${at.left}px, ${at.top}px)`, color: colourOf(one.login) }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M1 1 L1 13 L4.5 9.5 L7 15 L9 14 L6.5 8.5 L11.5 8.5 Z" fill="currentColor" stroke="var(--color-bg)" strokeWidth="1" />
            </svg>
            <span className={styles.pointerName} style={{ background: colourOf(one.login) }}>{one.login}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What two editors made of one list since they both read [base], merged by
 * id: what this one changed stays as it changed it, what the other changed
 * comes in, and what either removed - without the other changing it - goes.
 * Order is theirs, with this editor's own additions after. Diagrams' nodes and
 * edges, wireframes' elements.
 */
export function mergeById<T extends { id: string }>(base: T[], mine: T[], theirs: T[]): T[] {
  const was = new Map(base.map((one) => [one.id, JSON.stringify(one)]));
  const mineById = new Map(mine.map((one) => [one.id, one]));
  const theirIds = new Set(theirs.map((one) => one.id));
  const merged: T[] = [];
  for (const their of theirs) {
    const own = mineById.get(their.id);
    const before = was.get(their.id);
    if (own === undefined) {
      // Gone here: kept only where they changed it since, which is their work.
      if (before === undefined || JSON.stringify(their) !== before) merged.push(their);
      continue;
    }
    merged.push(before !== undefined && JSON.stringify(own) !== before ? own : their);
  }
  for (const own of mine) {
    if (theirIds.has(own.id)) continue;
    const before = was.get(own.id);
    // Removed there: kept only where this editor changed it since; new here: kept.
    if (before === undefined || JSON.stringify(own) !== before) merged.push(own);
  }
  return merged;
}

/**
 * The same for a list with no ids - a document's blocks - by a three-way merge
 * of the lines: a stretch only one side changed takes that side's lines, and
 * a stretch both changed keeps theirs and then this editor's, so nobody's
 * writing is lost. It does not merge inside a block.
 */
export function mergeLines<T>(base: T[], mine: T[], theirs: T[]): T[] {
  const key = (one: T) => JSON.stringify(one);
  const b = base.map(key);
  const aligned = (other: string[]) => {
    // Longest common subsequence of base and [other], as pairs of indexes.
    const rows = b.length + 1;
    const cols = other.length + 1;
    const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    for (let i = b.length - 1; i >= 0; i--)
      for (let j = other.length - 1; j >= 0; j--)
        table[i][j] = b[i] === other[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    const pairs = new Map<number, number>();
    for (let i = 0, j = 0; i < b.length && j < other.length; ) {
      if (b[i] === other[j]) {
        pairs.set(i, j);
        i++;
        j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) i++;
      else j++;
    }
    return pairs;
  };
  const m = mine.map(key);
  const th = theirs.map(key);
  const inMine = aligned(m);
  const inTheirs = aligned(th);
  // The base lines both sides kept, in order: the stable points between which each side's changes sit.
  const stable = b.map((_, i) => i).filter((i) => inMine.has(i) && inTheirs.has(i));
  const merged: T[] = [];
  let mAt = 0;
  let tAt = 0;
  let bAt = 0;
  for (const i of [...stable, b.length]) {
    const mEnd = i === b.length ? mine.length : (inMine.get(i) as number);
    const tEnd = i === b.length ? theirs.length : (inTheirs.get(i) as number);
    const baseChunk = b.slice(bAt, i).join('\n');
    const mineChunk = mine.slice(mAt, mEnd);
    const theirChunk = theirs.slice(tAt, tEnd);
    const mineSame = mineChunk.map(key).join('\n') === baseChunk;
    const theirSame = theirChunk.map(key).join('\n') === baseChunk;
    if (mineSame) merged.push(...theirChunk);
    else if (theirSame) merged.push(...mineChunk);
    else if (mineChunk.map(key).join('\n') === theirChunk.map(key).join('\n')) merged.push(...mineChunk);
    else merged.push(...theirChunk, ...mineChunk);
    if (i < b.length) merged.push(base[i]);
    mAt = mEnd + 1;
    tAt = tEnd + 1;
    bAt = i + 1;
  }
  return merged;
}
