import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import chevronDown12Icon from '../assets/chevron-down-12.svg';
import type { Model } from '../api/models';
import { t, tf } from '../i18n';
import styles from './ModelPicker.module.css';

/** From this many models the list opens with a box to narrow it by typing. */
const FILTER_FROM = 8;

export interface ModelPickerProps {
  /** The trigger's id, so the field's `<label htmlFor>` still names it. */
  id: string;
  /** The chosen model's id; empty is the "none" row. */
  value: string;
  /** The models on offer, already narrowed to the kind this field takes. */
  models: Model[];
  onChange: (value: string) => void;
  /** What the empty choice says, e.g. "None — this agent cannot run". */
  none: string;
  /** Where set, a model from another workspace is marked as shared. */
  workspaceId?: string;
  disabled?: boolean;
  /** The trigger's class, from the form it sits in, so it reads as that form's field. */
  className?: string;
}

/**
 * A model field: a button showing the chosen model and its provider, opening
 * the application's own list.
 *
 * Not a native select, for two reasons. The operating system draws that list,
 * in its own font and colours, outside the theme; and an `<option>` is one line
 * of plain text, so two providers serving a model of the same name came out as
 * two identical rows with nothing to tell them apart. Here every row says whose
 * model it is, and so does the button once one is chosen.
 *
 * It behaves as a listbox the way `MoveToCatalog` does - arrows, Home, End,
 * Enter, Escape, a click elsewhere closes it - and with many models it opens
 * with a box that narrows the list as one types. Drawn into the body at a fixed
 * position, so a dialog or a card that clips its overflow cannot cut it short.
 */
export function ModelPicker({ id, value, models, onChange, none, workspaceId, disabled, className }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const [place, setPlace] = useState<CSSProperties>({});
  const [host, setHost] = useState<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();

  const filtering = models.length >= FILTER_FROM;
  const needle = query.trim().toLowerCase();
  const shown = needle === ''
    ? models
    : models.filter((one) => one.name.toLowerCase().includes(needle) || one.providerName.toLowerCase().includes(needle));
  // The "none" row first, and only while nothing is typed: nobody types to find it.
  const rows: Array<Model | null> = needle === '' ? [null, ...shown] : shown;
  const chosen = models.find((one) => one.id === value);

  const nameOf = (model: Model) =>
    workspaceId === undefined || model.workspaceId === workspaceId ? model.name : tf('{model} · shared', { model: model.name });

  useLayoutEffect(() => {
    if (!open || button.current === null) return;
    const placeIt = () => {
      // The box the button sits in, so the list is as wide as the field it opens from.
      const box = (button.current?.parentElement ?? button.current)?.getBoundingClientRect();
      if (box === undefined) return;
      const below = window.innerHeight - box.bottom;
      const above = below < 260 && box.top > below;
      // No taller than the room on its side, so the last rows are never drawn off the screen.
      const room = Math.max(120, Math.min(340, (above ? box.top : below) - 16));
      setPlace(
        above
          ? { left: box.left, width: box.width, maxHeight: room, bottom: window.innerHeight - box.top + 4 }
          : { left: box.left, width: box.width, maxHeight: room, top: box.bottom + 4 },
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
    setQuery('');
    const current = models.findIndex((one) => one.id === value);
    setAt(current === -1 ? 0 : current + 1);
    window.requestAnimationFrame(() => (filter.current ?? list.current)?.focus());
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
    // Only on opening: the list it starts from is the one in front of it then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at, open]);

  /**
   * Into the open dialog it sits in, where there is one: a modal dialog makes
   * everything outside it inert, so a list drawn into the body there could be
   * seen and not clicked.
   */
  function openIt() {
    setHost(button.current?.closest('dialog') ?? document.body);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function choose(row: Model | null) {
    onChange(row === null ? '' : row.id);
    close();
  }

  /** Without a filter box, a letter jumps to the first row it begins. */
  function typeAhead(key: string) {
    const now = Date.now();
    typed.current = { text: now - typed.current.at > 700 ? key : typed.current.text + key, at: now };
    const prefix = typed.current.text.toLowerCase();
    const found = rows.findIndex((row) => row !== null && row.name.toLowerCase().startsWith(prefix));
    if (found !== -1) setAt(found);
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setAt((was) => (rows.length === 0 ? 0 : (was + step + rows.length) % rows.length));
    } else if (event.key === 'Home' || event.key === 'End') {
      if (event.target === filter.current) return;
      event.preventDefault();
      setAt(event.key === 'Home' ? 0 : Math.max(0, rows.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[at];
      if (row !== undefined) choose(row);
    } else if (!filtering && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeAhead(event.key);
    }
  }

  const active = rows[at] === undefined ? undefined : `${listId}-${at}`;

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className={className === undefined ? styles.trigger : `${styles.trigger} ${className}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-model-picker=""
        data-value={value}
        onClick={() => (open ? setOpen(false) : openIt())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            openIt();
          } else if (open) {
            onKey(event);
          }
        }}
      >
        {value === '' ? (
          <span className={styles.name}>{none}</span>
        ) : (
          <>
            <span className={styles.name}>{chosen === undefined ? '' : nameOf(chosen)}</span>
            {chosen !== undefined && <span className={styles.provider} data-model-provider="">{chosen.providerName}</span>}
          </>
        )}
        <img src={chevronDown12Icon} alt="" width={12} height={12} />
      </button>

      {open &&
        host !== null &&
        createPortal(
          <div ref={panel} className={styles.panel} style={place} onKeyDown={onKey} data-model-menu={id}>
            {filtering && (
              <input
                ref={filter}
                className={styles.filter}
                type="search"
                value={query}
                spellCheck={false}
                placeholder={t('Filter models')}
                aria-label={t('Filter models')}
                aria-controls={listId}
                aria-activedescendant={active}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setAt(0);
                }}
              />
            )}
            <ul
              ref={list}
              id={listId}
              className={styles.list}
              role="listbox"
              aria-labelledby={id}
              tabIndex={-1}
              aria-activedescendant={active}
            >
              {rows.map((row, index) => {
                const current = (row === null ? '' : row.id) === value;
                return (
                  <li
                    key={row === null ? '' : row.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={current}
                    data-index={index}
                    data-value={row === null ? '' : row.id}
                    data-at={index === at ? '' : undefined}
                    className={`${styles.option}${index === at ? ` ${styles.optionAt}` : ''}${current ? ` ${styles.optionCurrent}` : ''}`}
                    onPointerMove={() => setAt(index)}
                    onClick={() => choose(row)}
                  >
                    {row === null ? (
                      <span className={styles.name}>{none}</span>
                    ) : (
                      <>
                        <span className={styles.name} data-model-name="">{nameOf(row)}</span>
                        <span className={styles.provider} data-model-provider="">{row.providerName}</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {rows.length === 0 && <p className={styles.empty}>{t('No model matches')}</p>}
          </div>,
          host,
        )}
    </>
  );
}
