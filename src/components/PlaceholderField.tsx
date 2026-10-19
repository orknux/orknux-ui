import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import type { FieldOption } from './FieldPicker';
import { placeholdersIn } from './PlaceholderChips';
import own from './PlaceholderField.module.css';
import { t } from '../i18n';

export interface PlaceholderFieldProps {
  /** The field's own id, which its label points at. */
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** What a `{{…}}` may name: the same list the Reference tab picks from. */
  options: FieldOption[];
  placeholder?: string;
}

/** How many suggestions are offered at once; the rest are found by typing more. */
const SHOWN = 8;

/** A dotted name being typed after `{{`, and nothing that could not be one. */
const TYPING = /^\s*([A-Za-z0-9_.]*)$/;

/** What is left of a placeholder after the caret, swallowed when one is put in. */
const TAIL = /^[A-Za-z0-9_.]*\s*(\}\}|\})?/;

/**
 * The `{{` the caret is inside, and what has been typed after it - or null
 * where the caret is in ordinary text.
 *
 * Read back from the caret rather than kept as typing happens, so a click into
 * the middle of a half-written placeholder offers the list again, and a caret
 * moved out of one puts it away, without a second record of where things are.
 */
function openedAt(text: string, caret: number): { start: number; typed: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('{{');
  if (start < 0) return null;
  const typed = TYPING.exec(before.slice(start + 2));
  return typed === null ? null : { start, typed: typed[1] };
}

/**
 * A written value, multi-line and dragged taller, with its `{{…}}` placeholders
 * lit as they are typed and the fields that could fill one offered after `{{`.
 *
 * The highlight is the arrangement the skill editor uses (see AGENTS.md): the
 * text is drawn in a layer underneath, and the textarea on top is transparent
 * but for the caret and the selection. The two share every property that
 * decides where a glyph lands, and the marks are colour alone, because a bold
 * or padded run measures differently and pulls the caret off its letter.
 *
 * Lit by the rule `PlaceholderChips` judges by, so a placeholder green here is
 * one the chips under it name a node for, and one red here is one a save would
 * be refused over.
 */
export function PlaceholderField({ id, value, onChange, options, placeholder }: PlaceholderFieldProps) {
  const area = useRef<HTMLTextAreaElement>(null);
  const under = useRef<HTMLDivElement>(null);
  /** Where the caret is to go once the value a pick produced has been drawn. */
  const pendingCaret = useRef<number | null>(null);

  const [caret, setCaret] = useState<number | null>(null);
  /** Which row the arrows are on. The first, since `{{` is already a request for the list. */
  const [at, setAt] = useState(0);
  /** The `{{` an Escape put away, so it stays away until another is typed. */
  const [dismissed, setDismissed] = useState<number | null>(null);

  const opened = caret === null ? null : openedAt(value, caret);

  /*
   * A variable is offered by the Reference tab and refused as a placeholder,
   * so it is not offered here: a suggestion that turns red the moment it is
   * taken is worse than none.
   */
  const rows = useMemo(() => {
    if (opened === null) return [];
    const typed = opened.typed.toLowerCase();
    const usable = options.filter((option) => !option.expression.startsWith('variables.'));
    const starting = usable.filter((option) => option.expression.toLowerCase().startsWith(typed));
    const containing = usable.filter(
      (option) => !starting.includes(option) && option.expression.toLowerCase().includes(typed),
    );
    return [...starting, ...containing].slice(0, SHOWN);
  }, [opened, options]);

  const showing = opened !== null && opened.start !== dismissed && rows.length > 0;
  const current = Math.min(at, Math.max(rows.length - 1, 0));

  useLayoutEffect(() => {
    const field = area.current;
    if (field !== null && pendingCaret.current !== null) {
      field.setSelectionRange(pendingCaret.current, pendingCaret.current);
      setCaret(pendingCaret.current);
      pendingCaret.current = null;
    }
    // The layer underneath scrolls with the field, or the marks drift off their words.
    if (field !== null && under.current !== null) under.current.scrollTop = field.scrollTop;
  }, [value]);

  function noteCaret() {
    const field = area.current;
    if (field === null) return;
    const next = field.selectionStart === field.selectionEnd ? field.selectionStart : null;
    setCaret(next);
    if (next === null || openedAt(field.value, next)?.start !== opened?.start) setAt(0);
  }

  function take(option: FieldOption) {
    if (opened === null || caret === null) return;
    const after = value.slice(caret);
    const tail = TAIL.exec(after)?.[0] ?? '';
    const written = `{{ ${option.expression} }}`;
    pendingCaret.current = opened.start + written.length;
    onChange(value.slice(0, opened.start) + written + after.slice(tail.length));
    setAt(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!showing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAt(current + 1 > rows.length - 1 ? 0 : current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setAt(current - 1 < 0 ? rows.length - 1 : current - 1);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      take(rows[current]);
    } else if (event.key === 'Escape') {
      // Stopped, so putting the list away does not also close the panel around it.
      event.preventDefault();
      event.stopPropagation();
      setDismissed(opened.start);
    }
  }

  /*
   * The text again, with each placeholder marked. A space at the end because a
   * block drops a final empty line that a textarea keeps, and the caret on that
   * line would otherwise sit below everything drawn.
   */
  const drawn: ReactNode[] = [];
  let from = 0;
  placeholdersIn(value, options).forEach((one, index) => {
    if (one.at > from) drawn.push(value.slice(from, one.at));
    drawn.push(
      <mark
        key={index}
        className={one.problem === null ? own.answered : own.unanswered}
        data-mark={one.problem === null ? 'answered' : 'unanswered'}
      >
        {one.written}
      </mark>,
    );
    from = one.at + one.written.length;
  });
  drawn.push(`${value.slice(from)} `);

  return (
    <div className={own.field}>
      <div className={own.frame}>
        <div className={own.under} ref={under} aria-hidden="true" data-testid="placeholder-highlight">
          {drawn}
        </div>
        <textarea
          id={id}
          ref={area}
          className={own.text}
          value={value}
          rows={2}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showing}
          aria-controls={`${id}-placeholders`}
          aria-activedescendant={showing ? `${id}-placeholder-${current}` : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            const next = event.target.selectionStart;
            setCaret(next);
            // Typing a fresh `{{` is asking again, whatever was put away before.
            if (openedAt(event.target.value, next)?.start !== dismissed) setDismissed(null);
          }}
          onSelect={noteCaret}
          onClick={noteCaret}
          onBlur={() => setCaret(null)}
          onKeyDown={onKeyDown}
          onScroll={(event) => {
            if (under.current !== null) under.current.scrollTop = event.currentTarget.scrollTop;
          }}
        />
      </div>

      {showing && (
        <div
          id={`${id}-placeholders`}
          className={own.menu}
          role="listbox"
          aria-label={t('Fields to write in')}
          data-testid="placeholder-suggestions"
          // The field keeps the focus through a click on a row, so typing carries on.
          onMouseDown={(event) => event.preventDefault()}
        >
          {rows.map((option, index) => (
            <button
              key={`${option.groupKey}:${option.expression}`}
              id={`${id}-placeholder-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === current}
              className={index === current ? `${own.option} ${own.optionAt}` : own.option}
              data-expression={option.expression}
              onMouseMove={() => setAt(index)}
              onClick={() => take(option)}
            >
              <span className={own.optionField}>{option.expression}</span>
              <span className={own.optionGroup}>{option.groupName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
