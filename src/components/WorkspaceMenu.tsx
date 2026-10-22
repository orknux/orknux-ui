import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

import chevronDown12Icon from '../assets/chevron-down-12.svg';
import { t } from '../i18n';
import styles from './WorkspaceMenu.module.css';

/** Past this many, the menu offers a box to narrow it by name. */
const SEARCH_FROM = 7;

export interface WorkspaceMenuProps {
  workspaces: Array<{ id: string; name: string }>;
  selectedId: string;
  /** @returns whether the switch happened; false means a page asked to be asked. */
  onSelect: (id: string) => boolean;
}

/** One or two letters for a workspace: the first of each of its first two words. */
function initialsOf(name: string): string {
  const words = name.trim().split(/[\s_-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** A colour of its own per workspace, the same every time it is drawn, from its id. */
function hueOf(id: string): CSSProperties {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return { '--hue': hash } as CSSProperties;
}

/**
 * The workspace in the top bar, and the list to move to another.
 *
 * Drawn here rather than left to the platform: a native select drops a menu
 * the operating system paints, which on Windows is a pale highlight on a dark
 * page with the chosen name washed out in it. This one is the application's
 * own - each workspace with its initials in a colour of its own, the current
 * one ticked, a box to narrow a long list - and it still behaves as a listbox:
 * the arrows move, Enter chooses, Escape closes, and a letter jumps to a name.
 */
export function WorkspaceMenu({ workspaces, selectedId, onSelect }: WorkspaceMenuProps) {
  const [open, setOpen] = useState(false);
  const [looking, setLooking] = useState('');
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const current = workspaces.find((one) => one.id === selectedId);
  const searchable = workspaces.length >= SEARCH_FROM;
  const shown = useMemo(() => {
    const wanted = looking.trim().toLowerCase();
    return wanted === '' ? workspaces : workspaces.filter((one) => one.name.toLowerCase().includes(wanted));
  }, [workspaces, looking]);

  // Opening starts on the workspace already chosen, with the keys in the menu.
  useEffect(() => {
    if (!open) return;
    setLooking('');
    setAt(Math.max(0, workspaces.findIndex((one) => one.id === selectedId)));
    window.requestAnimationFrame(() => (search.current ?? list.current)?.focus());
  }, [open, workspaces, selectedId]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (box.current !== null && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at, open]);

  function choose(id: string) {
    setOpen(false);
    button.current?.focus();
    if (id !== selectedId) onSelect(id);
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setAt((was) => (shown.length === 0 ? 0 : (was + step + shown.length) % shown.length));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setAt(event.key === 'Home' ? 0 : Math.max(0, shown.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = shown[at];
      if (chosen !== undefined) choose(chosen.id);
    } else if (!searchable && event.key.length === 1 && /\S/.test(event.key)) {
      // No box to type into: a letter jumps to the next name starting with it.
      const letter = event.key.toLowerCase();
      const from = (at + 1) % Math.max(1, shown.length);
      const order = [...shown.slice(from), ...shown.slice(0, from)];
      const next = order.find((one) => one.name.toLowerCase().startsWith(letter));
      if (next !== undefined) setAt(shown.indexOf(next));
    }
  }

  const active = shown[at] === undefined ? undefined : `${listId}-${shown[at].id}`;

  return (
    <div className={styles.menu} ref={box}>
      <button
        ref={button}
        type="button"
        className={open ? `${styles.current} ${styles.currentOpen}` : styles.current}
        aria-label={t('Selected workspace')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-workspace-id={selectedId}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
          } else if (open) {
            // Keys pressed before focus has moved into the menu still reach it.
            onKey(event);
          }
        }}
      >
        <span className={styles.badge} style={hueOf(selectedId)} aria-hidden="true">
          {initialsOf(current?.name ?? '')}
        </span>
        <span className={styles.name}>{current?.name}</span>
        <img
          className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
          src={chevronDown12Icon}
          alt=""
          width={12}
          height={12}
        />
      </button>

      {open && (
        <div className={styles.panel} onKeyDown={onKey}>
          <div className={styles.panelHead}>{t('Workspaces')}</div>
          {searchable && (
            <input
              ref={search}
              className={styles.search}
              type="search"
              value={looking}
              placeholder={t('Find a workspace…')}
              aria-label={t('Find a workspace')}
              aria-controls={listId}
              aria-activedescendant={active}
              onChange={(event) => {
                setLooking(event.target.value);
                setAt(0);
              }}
            />
          )}
          <ul
            ref={list}
            id={listId}
            className={styles.list}
            role="listbox"
            aria-label={t('Workspaces')}
            tabIndex={-1}
            aria-activedescendant={active}
          >
            {shown.length === 0 && <li className={styles.none}>{t('No workspace by that name.')}</li>}
            {shown.map((one, index) => {
              const chosen = one.id === selectedId;
              return (
                <li
                  key={one.id}
                  id={`${listId}-${one.id}`}
                  role="option"
                  aria-selected={chosen}
                  data-index={index}
                  data-workspace-id={one.id}
                  className={[styles.option, index === at ? styles.optionAt : '', chosen ? styles.optionChosen : '']
                    .filter(Boolean)
                    .join(' ')}
                  onPointerMove={() => setAt(index)}
                  onClick={() => choose(one.id)}
                >
                  <span className={styles.badge} style={hueOf(one.id)} aria-hidden="true">
                    {initialsOf(one.name)}
                  </span>
                  <span className={styles.optionName} data-workspace-name="">
                    {one.name}
                  </span>
                  {chosen && (
                    <svg className={styles.tick} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path
                        d="M3 7.5l2.5 2.5L11 4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
