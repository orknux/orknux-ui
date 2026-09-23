import type { ScalarType } from '../api/variables';
import { TypedValueField } from './TypedValueField';
import own from './TypedValueField.module.css';
import { t } from '../i18n';

export interface ListValueFieldProps {
  /** The stored text: a JSON array, or whatever was there before it was a list. */
  value: string;
  onChange: (value: string) => void;
  elementType: ScalarType;
  workspaceId: string;
  /** A plugin's type each element is, or null for a plain scalar. */
  customType: string | null;
  args: Record<string, string>;
  suggests: boolean;
  className?: string;
  ariaLabel: string;
  readOnly?: boolean;
  onEnter?: () => void;
  onEscape?: () => void;
}

/**
 * The elements of a list variable, one row each. Issue #377.
 *
 * What is stored is a JSON array in the same text column every variable has;
 * what is drawn is one field per element, because a person editing "the
 * channels to notify" thinks in channels, not in brackets and quotes. Each
 * row is the same field a scalar of the element type gets - so a list of
 * Slack users has the picker on every row.
 *
 * Text that is not a JSON array - a value from before the variable became a
 * list - is drawn as one row holding it, rather than lost.
 */
export function ListValueField({
  value,
  onChange,
  elementType,
  workspaceId,
  customType,
  args,
  suggests,
  className,
  ariaLabel,
  readOnly = false,
  onEnter,
  onEscape,
}: ListValueFieldProps) {
  const elements = parse(value);

  const write = (next: string[]) => onChange(JSON.stringify(next));
  const set = (at: number, one: string) => write(elements.map((held, index) => (index === at ? one : held)));
  const remove = (at: number) => write(elements.filter((_, index) => index !== at));
  const add = () => write([...elements, '']);

  return (
    <div className={own.list} data-list-of={customType ?? elementType.toLowerCase()}>
      {elements.map((one, at) => (
        <div key={at} className={own.listRow}>
          {elementType === 'BOOLEAN' ? (
            <select
              className={className}
              value={one === 'true' || one === 'false' ? one : ''}
              aria-label={`${ariaLabel} ${at + 1}`}
              disabled={readOnly}
              onChange={(event) => set(at, event.target.value)}
            >
              <option value="">{t('—')}</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : customType !== null ? (
            <TypedValueField
              className={className}
              value={one}
              onChange={(next) => set(at, next)}
              workspaceId={workspaceId}
              type={customType}
              args={args}
              suggests={suggests}
              ariaLabel={`${ariaLabel} ${at + 1}`}
              readOnly={readOnly}
              onEnter={onEnter}
              onEscape={onEscape}
            />
          ) : (
            <input
              className={className}
              value={one}
              inputMode={elementType === 'NUMBER' ? 'decimal' : undefined}
              aria-label={`${ariaLabel} ${at + 1}`}
              readOnly={readOnly}
              spellCheck={false}
              onChange={(event) => set(at, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onEnter?.();
                if (event.key === 'Escape') onEscape?.();
              }}
            />
          )}
          {!readOnly && (
            <button
              type="button"
              className={own.listRemove}
              onClick={() => remove(at)}
              aria-label={`${t('Remove')} ${ariaLabel} ${at + 1}`}
              title={t('Remove')}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" className={own.listAdd} onClick={add} data-list-add>
          {t('+ Add')}
        </button>
      )}
    </div>
  );
}

/** The elements as text, whatever the stored text was. */
function parse(value: string): string[] {
  if (value.trim() === '') return [];
  try {
    const held: unknown = JSON.parse(value);
    if (Array.isArray(held)) return held.map((one) => (typeof one === 'string' ? one : JSON.stringify(one)));
  } catch {
    /* Not JSON: one element, kept. */
  }
  return [value];
}
