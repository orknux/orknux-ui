import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FocusEventHandler, KeyboardEvent, MouseEventHandler, ReactNode, Ref } from 'react';
import { createPortal } from 'react-dom';

import chevronDown12Icon from '../assets/chevron-down-12.svg';
import { t } from '../i18n';
import styles from './Select.module.css';

/**
 * From this many rows the list opens with a box to narrow it by typing - the
 * way `WorkspaceMenu` decides, by count. Higher than its seven: most of these
 * are fixed vocabularies of five to nine words, read at a glance, and a box
 * above them is one more thing between somebody and the word they can see.
 */
const SEARCH_FROM = 10;

/** No taller than this, however much room there is: past it the list scrolls. */
const TALLEST = 340;

/** Kept clear of the window's edge, so a list near it is never drawn against or past it. */
const EDGE = 8;

/** Between the control and its list. */
const GAP = 4;

/** Past this many rows the control stops sizing itself to its widest; see `Sizer`. */
const SIZE_UP_TO = 40;

interface Row {
  value: string;
  label: ReactNode;
  /** The row's words, for typing to it and narrowing by. */
  text: string;
  disabled: boolean;
  group: string | null;
  /** One line saying what the row means, from the option's `data-hint`; drawn beside the row it belongs to. */
  hint: string | null;
}

export interface SelectProps {
  value: string | number;
  /** Called with the chosen row's value, and only when it differs from the one held. Left out only by a control that is never enabled. */
  onChange?: (value: string) => void;
  /** `<option>` and `<optgroup>` elements, written exactly as for a native select. */
  children: ReactNode;
  id?: string;
  name?: string;
  /** The page's own class for the box, so it reads as one of that page's fields. */
  className?: string;
  disabled?: boolean;
  required?: boolean;
  title?: string;
  /** Drawn inside the box before the value, e.g. "Status". */
  prefix?: ReactNode;
  /** Off where the page already draws the chevron beside the box. */
  chevron?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  ref?: Ref<HTMLButtonElement>;
  [data: `data-${string}`]: string | undefined;
}

/** The words an option's children spell, however they were written. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** The rows a native select would have made of the same children. */
function rowsOf(children: ReactNode, group: string | null = null, groupDisabled = false, into: Row[] = []): Row[] {
  Children.forEach(children, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    const props = child.props;
    if (child.type === Fragment) {
      rowsOf(props.children as ReactNode, group, groupDisabled, into);
    } else if (child.type === 'optgroup') {
      rowsOf(props.children as ReactNode, String(props.label ?? ''), Boolean(props.disabled), into);
    } else if (child.type === 'option') {
      const text = textOf(props.children as ReactNode).trim();
      into.push({
        value: props.value === undefined ? text : String(props.value),
        label: props.children as ReactNode,
        text,
        disabled: groupDisabled || Boolean(props.disabled),
        group,
        hint: typeof props['data-hint'] === 'string' && props['data-hint'] !== '' ? props['data-hint'] : null,
      });
    }
  });
  return into;
}

/**
 * A choice of one from a list: a button showing the chosen row, opening the
 * application's own list.
 *
 * Every native select in the interface became this one. The operating system
 * draws a native select's menu - in its own font and colours, outside the
 * theme, on Windows a pale highlight on a dark page - and nothing written here
 * can shape it. This is the menu `WorkspaceMenu`, `MoveToCatalog` and
 * `ModelPicker` already draw, made general.
 *
 * Written the way a native select is - `<option>` and `<optgroup>` children,
 * `value`, `disabled`, an `id` a `<label htmlFor>` names - so a select became
 * one by changing its tag and its `onChange`, which hands over the value rather
 * than an event.
 *
 * It behaves as a select-only combobox: the arrows open it and move, Home and
 * End reach the ends, a letter jumps to the row it begins, Enter takes, Escape
 * leaves without changing anything, and a click elsewhere closes it. The keys
 * stay on the button the whole time - except with a long list, which opens with
 * a box to narrow it and the keys in that box.
 *
 * Drawn into the body - or into the open dialog it sits in, since a modal
 * dialog makes everything outside it inert - at a fixed position, flipped
 * above the button when there is more room there and kept inside the window
 * at either side, so a card that clips its overflow cannot cut it short and a
 * phone cannot push it off the screen.
 */
export function Select(props: SelectProps) {
  const {
    value,
    onChange,
    children,
    id,
    name,
    className,
    disabled,
    required,
    title,
    prefix,
    chevron = true,
    onFocus,
    onMouseDown,
    ref,
  } = props;
  const data = Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-')));

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();
  const hintBox = useRef<HTMLDivElement>(null);

  const held = String(value);
  const rows = useMemo(() => rowsOf(children), [children]);
  const searchable = rows.length >= SEARCH_FROM;
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle === ''
        ? rows
        : rows.filter((row) => row.text.toLowerCase().includes(needle) || (row.group ?? '').toLowerCase().includes(needle)),
    [rows, needle],
  );
  // A value no row holds shows the first row, as a native select does.
  const chosen = rows.find((row) => row.value === held) ?? rows[0];

  const firstUsable = (from: Row[]) => Math.max(0, from.findIndex((row) => !row.disabled));

  const hinted = open ? shown[at] : undefined;
  const hint = hinted?.hint ?? null;

  /*
   * The active row's hint, beside the list at that row's height: on the right
   * where there is room, otherwise on the left. Placed after the list has been,
   * so it follows the row wherever the list ended up.
   */
  useLayoutEffect(() => {
    const box = hintBox.current;
    const row = list.current?.querySelector<HTMLElement>(`[data-index="${at}"]`);
    const menu = panel.current;
    if (box === null || row === null || row === undefined || menu === null) return;
    const wide = document.documentElement.clientWidth;
    const side = menu.getBoundingClientRect();
    const line = row.getBoundingClientRect();
    const width = box.offsetWidth;
    const right = side.right + GAP;
    box.style.left = `${right + width <= wide - EDGE ? right : Math.max(EDGE, side.left - GAP - width)}px`;
    box.style.top = `${Math.max(EDGE, Math.min(line.top + (line.height - box.offsetHeight) / 2, window.innerHeight - EDGE - box.offsetHeight))}px`;
  });

  useLayoutEffect(() => {
    if (!open || host === null) return;
    const placeIt = () => {
      const box = button.current?.getBoundingClientRect();
      const menu = panel.current;
      if (box === undefined || menu === null) return;
      const wide = document.documentElement.clientWidth;
      const high = window.innerHeight;
      menu.style.minWidth = `${Math.min(box.width, wide - 2 * EDGE)}px`;
      menu.style.maxWidth = `${wide - 2 * EDGE}px`;
      menu.style.maxHeight = `${TALLEST}px`;
      const natural = menu.offsetHeight;
      const below = high - box.bottom - GAP - EDGE;
      const above = box.top - GAP - EDGE;
      const up = natural > below && above > below;
      menu.style.maxHeight = `${Math.max(80, Math.min(TALLEST, up ? above : below))}px`;
      menu.style.top = up ? '' : `${box.bottom + GAP}px`;
      menu.style.bottom = up ? `${high - box.top + GAP}px` : '';
      menu.style.left = `${Math.max(EDGE, Math.min(box.left, wide - EDGE - menu.offsetWidth))}px`;
    };
    placeIt();
    window.addEventListener('resize', placeIt);
    window.addEventListener('scroll', placeIt, true);
    return () => {
      window.removeEventListener('resize', placeIt);
      window.removeEventListener('scroll', placeIt, true);
    };
  }, [open, host, shown.length]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      // The label a control is wrapped in clicks it too; that click is the one to act on.
      if (button.current?.closest('label')?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at, open]);

  // Shut when it can no longer be used, rather than leaving a list open that takes nothing.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  /** Opens on the chosen row, or on the row a letter typed to open it begins. */
  function openIt(typedFirst?: string) {
    if (disabled) return;
    const current = rows.findIndex((row) => row.value === held && !row.disabled);
    typed.current = { text: '', at: 0 };
    setQuery(searchable && typedFirst !== undefined ? typedFirst : '');
    setAt(current === -1 ? firstUsable(rows) : current);
    setHost(button.current?.closest('dialog') ?? document.body);
    setOpen(true);
    if (searchable) window.requestAnimationFrame(() => filter.current?.focus());
    else if (typedFirst !== undefined) window.requestAnimationFrame(() => typeAhead(typedFirst, current));
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function choose(row: Row | undefined) {
    if (row === undefined || row.disabled) return;
    close();
    if (row.value !== held) onChange?.(row.value);
  }

  /** The next row from here that can be chosen, one step at a time, wrapping. */
  function step(from: number, by: 1 | -1): number {
    for (let moved = 1; moved <= shown.length; moved += 1) {
      const next = (from + by * moved + shown.length * moved) % shown.length;
      if (!shown[next].disabled) return next;
    }
    return from;
  }

  /** A letter, or a few typed quickly, jump to the row they begin; one letter again moves to the next such row. */
  function typeAhead(key: string, from = at) {
    const now = Date.now();
    typed.current = { text: now - typed.current.at > 700 ? key : typed.current.text + key, at: now };
    const prefixTyped = typed.current.text.toLowerCase();
    const start = prefixTyped.length === 1 ? from + 1 : from;
    for (let moved = 0; moved < shown.length; moved += 1) {
      const index = (Math.max(0, start) + moved) % shown.length;
      const row = shown[index];
      if (!row.disabled && row.text.toLowerCase().startsWith(prefixTyped)) {
        setAt(index);
        return;
      }
    }
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
      if (event.altKey) choose(shown[at]);
      else if (shown.length > 0) setAt((was) => step(was, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End' || event.key === 'PageUp' || event.key === 'PageDown') {
      if (event.target === filter.current && (event.key === 'Home' || event.key === 'End')) return;
      event.preventDefault();
      const top = event.key === 'Home' || event.key === 'PageUp';
      setAt(top ? firstUsable(shown) : Math.max(0, shown.length - 1 - firstUsable([...shown].reverse())));
    } else if (event.key === 'Enter' || (event.key === ' ' && event.target !== filter.current)) {
      event.preventDefault();
      choose(shown[at]);
    } else if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      typeAhead(event.key);
    }
  }

  function onButtonKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (open) {
      onKey(event);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openIt();
    } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      openIt(event.key);
    }
  }

  const active = open && shown[at] !== undefined ? `${listId}-${at}` : undefined;
  const setButton = (element: HTMLButtonElement | null) => {
    button.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref !== null && ref !== undefined) (ref as { current: HTMLButtonElement | null }).current = element;
  };

  return (
    <>
      <button
        {...data}
        ref={setButton}
        id={id}
        name={name}
        type="button"
        className={className === undefined ? styles.trigger : `${styles.trigger} ${className}`}
        disabled={disabled}
        title={title}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={searchable ? undefined : active}
        aria-label={props['aria-label']}
        aria-labelledby={props['aria-labelledby']}
        aria-describedby={props['aria-describedby']}
        aria-required={required || undefined}
        data-select=""
        data-value={held}
        data-option-count={rows.length}
        onClick={() => (open ? setOpen(false) : openIt())}
        onKeyDown={onButtonKey}
        onFocus={onFocus}
        onMouseDown={onMouseDown}
      >
        {prefix}
        <Sizer rows={rows} chosen={chosen} />
        {chevron && <img className={styles.chevron} src={chevronDown12Icon} alt="" width={12} height={12} />}
      </button>

      {open &&
        host !== null &&
        createPortal(
          <div
            ref={panel}
            className={styles.panel}
            onKeyDown={onKey}
            // The keys stay where they are: a press on a row must not take focus from the button or the box.
            onMouseDown={(event) => {
              if (event.target !== filter.current) event.preventDefault();
            }}
          >
            {searchable && (
              <input
                ref={filter}
                className={styles.filter}
                type="search"
                value={query}
                spellCheck={false}
                placeholder={t('Filter the list')}
                aria-label={t('Filter the list')}
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
              aria-label={props['aria-label']}
              aria-labelledby={props['aria-label'] === undefined ? (props['aria-labelledby'] ?? id) : undefined}
              tabIndex={-1}
              data-select-menu={id ?? ''}
            >
              {shown.map((row, index) => {
                const current = row.value === held;
                const heading = row.group !== null && row.group !== shown[index - 1]?.group;
                return (
                  <Fragment key={`${row.group ?? ''}\u0000${row.value}\u0000${index}`}>
                    {heading && (
                      <li className={styles.group} role="presentation">
                        {row.group}
                      </li>
                    )}
                    <li
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={current}
                      aria-disabled={row.disabled || undefined}
                      data-index={index}
                      data-value={row.value}
                      data-group={row.group ?? undefined}
                      aria-describedby={index === at && row.hint !== null ? `${listId}-hint` : undefined}
                      className={[
                        styles.option,
                        index === at ? styles.optionAt : '',
                        current ? styles.optionCurrent : '',
                        row.disabled ? styles.optionDisabled : '',
                        row.group !== null ? styles.optionInGroup : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onPointerMove={() => {
                        if (!row.disabled) setAt(index);
                      }}
                      onClick={() => choose(row)}
                    >
                      <span className={styles.optionName}>{row.label}</span>
                      {current && (
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
                  </Fragment>
                );
              })}
            </ul>
            {shown.length === 0 && <p className={styles.none}>{t('Nothing matches that.')}</p>}
          </div>,
          host,
        )}
      {open &&
        host !== null &&
        hint !== null &&
        createPortal(
          <div ref={hintBox} id={`${listId}-hint`} className={styles.hint} role="tooltip" data-select-hint={hinted?.value}>
            {hint}
          </div>,
          host,
        )}
    </>
  );
}

/**
 * The chosen row's words, in a box as wide as the widest row's.
 *
 * A native select is as wide as its longest option, whichever is chosen, so a
 * row of filters does not shuffle sideways when one of them changes. Every row
 * is laid in the same cell and all but the chosen one hidden, which keeps that
 * for a list of ordinary length; a very long one sizes to the chosen row alone.
 * The hidden rows are drawn from an attribute rather than as text, so the
 * button's own text is the chosen row's words and nothing else - what a reader
 * of the page, a search for the words on it, or a test finds there.
 */
function Sizer({ rows, chosen }: { rows: Row[]; chosen: Row | undefined }) {
  return (
    <span className={styles.value}>
      {rows.length <= SIZE_UP_TO &&
        rows.map((row, index) =>
          row === chosen ? null : (
            <span key={index} className={styles.sizer} aria-hidden="true" data-label={row.text} />
          ),
        )}
      <span className={styles.shown} data-select-label="">
        {chosen?.label}
      </span>
    </span>
  );
}
