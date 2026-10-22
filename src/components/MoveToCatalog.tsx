import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import folderIcon from '../assets/folder.svg';
import moveIcon from '../assets/move.svg';
import { t, tf } from '../i18n';
import styles from './MoveToCatalog.module.css';

export interface MoveToCatalogProps {
  /** What is being moved, as the row names it: for the button's label and the check's handle. */
  name: string;
  /** Every catalog of the same kind in this workspace; the one it is in is left out here. */
  catalogs: Array<{ id: string; name: string }>;
  currentCatalogId: string;
  /** Sends it to the server; a refusal is thrown and shown in the menu. */
  move: (catalogId: string) => Promise<unknown>;
  /** Reloads whatever lists it, once the server has agreed. */
  onMoved: () => void | Promise<void>;
  /** The page's own icon-button class, so the control sits among the row's others as one of them. */
  className?: string;
}

/**
 * A row's "move to another catalog": an icon that opens the list of the others.
 *
 * One control for variables, secrets, skills and memories, because the act is
 * the same act on four kinds of thing and four menus would drift apart. The
 * list is the application's own rather than a native select, for the reason
 * `WorkspaceMenu` gives, and it behaves as a listbox the same way: arrows,
 * Enter, Escape, and a click elsewhere closes it.
 *
 * Drawn into the body at a fixed position rather than under the button: the
 * variables table clips what overflows it, and a menu cut off at the table's
 * edge on the last row is a menu with its last choices missing.
 *
 * A refusal - a name already taken in the catalog chosen - stays in the open
 * menu, under the choice that caused it, in the server's own words.
 */
export function MoveToCatalog({ name, catalogs, currentCatalogId, move, onMoved, className }: MoveToCatalogProps) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [place, setPlace] = useState<CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const others = catalogs.filter((one) => one.id !== currentCatalogId);

  useLayoutEffect(() => {
    if (!open || button.current === null) return;
    const placeIt = () => {
      const box = button.current?.getBoundingClientRect();
      if (box === undefined) return;
      const below = window.innerHeight - box.bottom;
      // Above the button when there is more room there, so the last row's menu is not pushed off the screen.
      setPlace(
        below < 240 && box.top > below
          ? { right: window.innerWidth - box.right, bottom: window.innerHeight - box.top + 6 }
          : { right: window.innerWidth - box.right, top: box.bottom + 6 },
      );
    };
    placeIt();
    window.addEventListener('resize', placeIt);
    window.addEventListener('scroll', placeIt, true);
    return () => {
      window.removeEventListener('resize', placeIt);
      window.removeEventListener('scroll', placeIt, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setAt(0);
    setRefused(null);
    window.requestAnimationFrame(() => list.current?.focus());
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at, open]);

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  async function choose(catalogId: string) {
    if (busy) return;
    setBusy(true);
    setRefused(null);
    try {
      await move(catalogId);
      setOpen(false);
      await onMoved();
    } catch (cause) {
      setRefused(cause instanceof Error ? cause.message : t('That could not be moved.'));
    } finally {
      setBusy(false);
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setAt((was) => (others.length === 0 ? 0 : (was + step + others.length) % others.length));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setAt(event.key === 'Home' ? 0 : Math.max(0, others.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = others[at];
      if (chosen !== undefined) void choose(chosen.id);
    }
  }

  // Left out rather than drawn and disabled: with one catalog there is nowhere to move it.
  if (others.length === 0) return null;

  const active = others[at] === undefined ? undefined : `${listId}-${others[at].id}`;

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className ?? styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={tf('Move {name} to another catalog', { name })}
        title={t('Move to…')}
        data-move-to={name}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
          } else if (open) {
            onKey(event);
          }
        }}
      >
        <img src={moveIcon} alt="" width={14} height={14} />
      </button>

      {open &&
        createPortal(
          <div ref={panel} className={styles.panel} style={place} onKeyDown={onKey} data-move-menu={name}>
            <div className={styles.panelHead}>{t('Move to')}</div>
            <ul
              ref={list}
              id={listId}
              className={styles.list}
              role="listbox"
              aria-label={tf('Move {name} to another catalog', { name })}
              aria-busy={busy}
              tabIndex={-1}
              aria-activedescendant={active}
            >
              {others.map((one, index) => (
                <li
                  key={one.id}
                  id={`${listId}-${one.id}`}
                  role="option"
                  aria-selected={index === at}
                  aria-disabled={busy}
                  data-index={index}
                  data-catalog-id={one.id}
                  className={index === at ? `${styles.option} ${styles.optionAt}` : styles.option}
                  onPointerMove={() => setAt(index)}
                  onClick={() => void choose(one.id)}
                >
                  <img src={folderIcon} alt="" width={14} height={14} />
                  <span className={styles.optionName}>{one.name}</span>
                </li>
              ))}
            </ul>
            {refused !== null && (
              <p className={styles.refused} role="alert" data-move-refused="">
                {refused}
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
