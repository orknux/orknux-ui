import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import chevronIcon from '../../assets/chevron-down.svg';
import { ARCHITECTURE_KINDS, FLOWCHART_KINDS, UML_KINDS } from '../../api/diagrams';
import type { DiagramNodeKind } from '../../api/diagrams';
import { t } from '../../i18n';
import { matches } from '../../session/shortcut';
import type { Shortcut } from '../../session/shortcut';
import { ShapeIcon } from './DiagramShapes';
import styles from './DiagramEditorPage.module.css';

/** A shape the menu leads with: one of the toolbar's own, under the icon its button has. */
export interface AddBasic {
  kind: DiagramNodeKind;
  icon: string;
  label: string;
}

/** How near the window's edge the menu may come. */
const EDGE = 8;

/** How far the shapes of a category stand from the menu, and how far above its row they start, so the first lines up with it. */
const GAP = 4;
const ROW_INSET = 5;

/** How many shapes the menu remembers as recently used. */
const RECENT_KEPT = 5;
const RECENT_KEY = 'orknux.diagram.add-recent';

type GroupId = 'basic' | 'flowchart' | 'architecture' | 'uml';

/** What this browser keeps under [key], as a list of names; nothing where it keeps nothing. */
function readList(key: string): string[] | null {
  try {
    const held: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return Array.isArray(held) ? held.filter((one): one is string => typeof one === 'string') : null;
  } catch {
    return null;
  }
}

function writeList(key: string, list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // A browser that keeps nothing starts the menu from its categories each time.
  }
}

/**
 * A shape put on a diagram, from the Add menu or the toolbar: it heads the
 * menu's recently used next time. Kept per browser - what somebody reaches
 * for is theirs, and nothing anybody else should see.
 */
export function rememberAdded(kind: DiagramNodeKind) {
  writeList(RECENT_KEY, [kind, ...(readList(RECENT_KEY) ?? []).filter((one) => one !== kind)].slice(0, RECENT_KEPT));
}

/**
 * Every shape a diagram can hold, where the pointer is: what the Add shortcut
 * opens, as it opens the workflow editor's Add menu. What was used last leads,
 * and the rest are under four categories, each of which opens its shapes in a
 * menu to the right of it - so another category is a move of the pointer away,
 * where folding them open in the one list ran forty rows long and a scroll to
 * find the next one. With nothing used yet the basic shapes are opened at once.
 *
 * The search has the keyboard at once, and Enter there takes the first shape
 * shown; the arrows lead out of it and walk the rows, Enter puts the shape down
 * where the menu was opened; on a category Enter or the right arrow opens its
 * shapes, and the left arrow comes back. Escape - or the shortcut again, with
 * nothing typed - puts the menu away.
 *
 * Drawn over the whole page, like the right-click menu, so nothing on the
 * canvas can sit over it; and kept inside the window, the shapes opening to
 * the left where there is no room on the right.
 */
export function DiagramAddMenu({
  at,
  basics,
  labelOf,
  closeKey,
  onPick,
  onClose,
}: {
  at: { x: number; y: number };
  basics: AddBasic[];
  labelOf: (kind: DiagramNodeKind) => string;
  closeKey: Shortcut;
  onPick: (kind: DiagramNodeKind) => void;
  onClose: () => void;
}) {
  const list = useRef<HTMLDivElement | null>(null);
  const side = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState(at);
  const groups: { id: GroupId; heading: string; kinds: { kind: DiagramNodeKind; icon?: string; label: string }[] }[] = [
    { id: 'basic', heading: t('Basic shapes'), kinds: basics },
    ...([
      ['flowchart', t('Flowchart'), FLOWCHART_KINDS],
      ['architecture', t('Architecture'), ARCHITECTURE_KINDS],
      ['uml', 'UML', UML_KINDS],
    ] as const).map(([id, heading, kinds]) => ({ id, heading, kinds: kinds.map((kind) => ({ kind, label: labelOf(kind) })) })),
  ];
  const known = new Map(groups.flatMap((group) => group.kinds.map((one) => [one.kind, one] as const)));
  // What is typed into the search, and every shape whose name has it in.
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement | null>(null);
  const wanted = query.trim().toLowerCase();
  const found = wanted === '' ? null : [...known.values()].filter((one) => one.label.toLowerCase().includes(wanted) || one.kind.includes(wanted));
  // Read once, as it opens: a shape picked now is recent the next time, not halfway through this one.
  const [recent] = useState(() => (readList(RECENT_KEY) ?? []).flatMap((kind) => known.get(kind as DiagramNodeKind) ?? []));
  // The category whose shapes are open beside the menu; the basic shapes where nothing has been used yet.
  const [shown, setShown] = useState<GroupId | null>(() => (recent.length === 0 ? 'basic' : null));
  const [sidePlace, setSidePlace] = useState<{ x: number; y: number } | null>(null);
  const group = groups.find((one) => one.id === shown) ?? null;

  // Kept inside the window as it opens.
  useLayoutEffect(() => {
    const held = list.current;
    if (held === null) return;
    const drawn = held.getBoundingClientRect();
    setPlace({
      x: Math.max(EDGE, Math.min(at.x, window.innerWidth - drawn.width - EDGE)),
      y: Math.max(EDGE, Math.min(at.y, window.innerHeight - drawn.height - EDGE)),
    });
  }, [at]);

  // The shapes beside their category's row: to its right, or its left where the window ends, and never under the window's foot.
  useLayoutEffect(() => {
    const menu = list.current?.getBoundingClientRect();
    const row = list.current?.querySelector(`[data-group="${shown}"]`)?.getBoundingClientRect();
    const drawn = side.current?.getBoundingClientRect();
    if (shown === null || menu === undefined || row === undefined || drawn === undefined) {
      setSidePlace(null);
      return;
    }
    const right = menu.right + GAP;
    const x = right + drawn.width <= window.innerWidth - EDGE ? right : Math.max(EDGE, menu.left - GAP - drawn.width);
    const y = Math.max(EDGE, Math.min(row.top - ROW_INSET, window.innerHeight - drawn.height - EDGE));
    setSidePlace({ x, y });
  }, [shown, place]);

  // The search has the keyboard as the menu opens: a name typed is the quickest way to any of some forty shapes, and the arrows lead out of it.
  useEffect(() => {
    search.current?.focus();
  }, []);

  /** The first shape the menu shows: the one used last, or the first in the category open beside it. */
  function firstShape(): HTMLElement | null {
    return list.current?.querySelector<HTMLElement>('[data-kind]') ?? side.current?.querySelector<HTMLElement>('[data-kind]') ?? list.current?.querySelector<HTMLElement>('[role="menuitem"]') ?? null;
  }

  /** Opens [id]'s shapes beside it, and puts the keyboard on the first of them where [focus] says so. */
  function openGroup(id: GroupId, focus: boolean) {
    setShown(id);
    if (focus) requestAnimationFrame(() => side.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  }

  /** Walks [rows] with the arrows and Home and End; up from the top of the menu goes back to the search. Says whether it took the key. */
  function walk(event: ReactKeyboardEvent<HTMLDivElement>, rows: HTMLElement[], top = false): boolean {
    if (rows.length === 0) return false;
    const now = rows.indexOf(document.activeElement as HTMLElement);
    if (top && event.key === 'ArrowUp' && now <= 0) {
      event.preventDefault();
      search.current?.focus();
      return true;
    }
    const to =
      event.key === 'ArrowDown' ? (now + 1) % rows.length
      : event.key === 'ArrowUp' ? (now - 1 + rows.length) % rows.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? rows.length - 1
      : null;
    if (to === null) return false;
    event.preventDefault();
    rows[to].focus();
    return true;
  }

  /** What both menus do with a key before their own: keep it from the canvas, and close on Escape or the shortcut. */
  function closing(event: ReactKeyboardEvent<HTMLDivElement>): boolean {
    // The menu's keys are its own while it is open: the canvas would take an arrow for a nudge and Enter for a label.
    event.stopPropagation();
    if (event.key === 'Escape' || matches(event.nativeEvent, closeKey)) {
      event.preventDefault();
      onClose();
      return true;
    }
    return false;
  }

  function keys(event: ReactKeyboardEvent<HTMLDivElement>) {
    /*
     * In the search, a letter is a letter, and Escape empties it before it
     * closes the menu. Empty, the shortcut still puts the menu away, as the key
     * pressed twice always has; once something is typed, it is a letter too.
     * The arrows go to the shapes, and Enter takes the first of them - what
     * was found, or with nothing typed the first the menu shows.
     */
    if (event.target === search.current) {
      event.stopPropagation();
      if (event.key === 'Escape' || (query === '' && matches(event.nativeEvent, closeKey))) {
        event.preventDefault();
        if (event.key === 'Escape' && query !== '') setQuery('');
        else onClose();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (found !== null) {
          if (found.length > 0) onPick(found[0].kind);
        } else {
          firstShape()?.click();
        }
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        firstShape()?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const rows = list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        rows?.[rows.length - 1]?.focus();
      }
      return;
    }
    if (closing(event)) return;
    if (typedAhead(event)) return;
    const here = (document.activeElement as HTMLElement | null)?.dataset.group as GroupId | undefined;
    if (event.key === 'ArrowRight' && here !== undefined) {
      event.preventDefault();
      openGroup(here, true);
      return;
    }
    walk(event, Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []), true);
  }

  /** Typed on a row of either menu, a letter starts a search: the keyboard goes to the field, the letter with it. */
  function typedAhead(event: ReactKeyboardEvent<HTMLDivElement>): boolean {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.key === ' ') return false;
    event.preventDefault();
    setQuery((now) => now + event.key);
    setShown(null);
    search.current?.focus();
    return true;
  }

  function sideKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (closing(event)) return;
    if (typedAhead(event)) return;
    if (event.key === 'ArrowLeft' && shown !== null) {
      event.preventDefault();
      list.current?.querySelector<HTMLElement>(`[data-group="${shown}"]`)?.focus();
      setShown(null);
      return;
    }
    walk(event, Array.from(side.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []));
  }

  const shapeRow = (one: { kind: DiagramNodeKind; icon?: string; label: string }, testId: string) => (
    <button
      key={one.kind}
      type="button"
      role="menuitem"
      className={`${styles.menuItem} ${styles.menuItemIcon}`}
      onClick={() => onPick(one.kind)}
      data-kind={one.kind}
      data-testid={testId}
    >
      {one.icon !== undefined ? <img src={one.icon} alt="" width={16} height={16} /> : <ShapeIcon kind={one.kind} />}
      {one.label}
    </button>
  );

  return createPortal(
    <>
      <div
        className={styles.rightMenuShade}
        onMouseDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={list}
        className={`${styles.rightMenu} ${styles.addAtMenu}`}
        style={{ left: place.x, top: place.y }}
        role="menu"
        aria-label={t('Add a shape')}
        onKeyDown={keys}
        data-testid="diagram-add-menu"
      >
        <input
          ref={search}
          className={styles.addSearch}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShown(null);
          }}
          placeholder={t('Search shapes')}
          aria-label={t('Search shapes')}
          data-testid="diagram-add-search"
        />
        {found !== null ? (
          // Searching, every shape whose name has what was typed, out of all the categories at once.
          found.length > 0 ? (
            found.map((one) => shapeRow(one, `diagram-add-menu-${one.kind}`))
          ) : (
            <p className={styles.addSearchNone}>{t('No shape is called that')}</p>
          )
        ) : (
          <>
            {recent.length > 0 && (
              <>
                <span className={styles.menuHeading}>{t('Recently used')}</span>
                {/* Pointing at a recent shape puts away the category open beside the menu: the pointer has left it. */}
                <div className={styles.addMenuRecent} onMouseEnter={() => setShown(null)}>
                  {recent.map((one) => shapeRow(one, `diagram-add-recent-${one.kind}`))}
                </div>
                <span className={styles.addMenuRule} aria-hidden="true" />
              </>
            )}
            {groups.map((one) => (
              <button
                key={one.id}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={shown === one.id}
                className={`${styles.menuItem} ${styles.menuItemIcon} ${styles.addMenuGroup} ${shown === one.id ? styles.addMenuGroupOn : ''}`}
                onClick={() => openGroup(one.id, true)}
                onMouseEnter={() => setShown(one.id)}
                data-group={one.id}
                data-testid={`diagram-add-group-${one.id}`}
              >
                {one.heading}
                <span className={styles.addMenuCount}>{one.kinds.length}</span>
                <img src={chevronIcon} alt="" width={14} height={14} className={styles.addMenuGroupArrow} />
              </button>
            ))}
          </>
        )}
      </div>
      {group !== null && found === null && (
        <div
          ref={side}
          className={`${styles.rightMenu} ${styles.addAtMenu} ${styles.addSideMenu}`}
          // Measured where it cannot be seen, then put beside its row.
          style={sidePlace === null ? { left: 0, top: 0, visibility: 'hidden' } : { left: sidePlace.x, top: sidePlace.y }}
          role="menu"
          aria-label={group.heading}
          onKeyDown={sideKeys}
          data-group-shown={group.id}
          data-testid="diagram-add-side"
        >
          {group.kinds.map((one) => shapeRow(one, `diagram-add-menu-${one.kind}`))}
        </div>
      )}
    </>,
    document.body,
  );
}
