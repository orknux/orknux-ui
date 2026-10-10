import { useState } from 'react';

import styles from './LabelPicker.module.css';
import { t } from '../i18n';

/**
 * How many existing labels are offered at once - the issue page's number, for
 * its reason: six is a glance, and anybody with forty labels is typing.
 */
const SUGGESTIONS = 6;

export interface LabelPickerProps {
  /** What is chosen, in the order it was chosen. */
  labels: string[];
  /** What already exists, offered as you type; the ones chosen are left out. */
  known: string[];
  onChange: (labels: string[]) => void;
  /** Names the box for a screen reader, and is its placeholder. */
  placeholder: string;
  id?: string;
  disabled?: boolean;
}

/**
 * A set of labels: chips that are removed by pressing them, a box to type a new
 * one into, and the labels that already exist offered under it.
 *
 * The issue page's labels, lifted into a component of their own when a second
 * screen needed them - the same chips, the same dashed suggestions narrowed as
 * you type, and the same reason for them: a label is only useful while
 * everybody spells it the same way, and suggesting what exists is what keeps
 * that from drifting.
 */
export function LabelPicker({ labels, known, onChange, placeholder, id, disabled = false }: LabelPickerProps) {
  const [draft, setDraft] = useState('');

  function add(wanted: string) {
    const label = wanted.trim();
    setDraft('');
    if (label === '' || labels.includes(label)) return;
    onChange([...labels, label]);
  }

  const typed = draft.trim().toLowerCase();
  const offered = known
    .filter((one) => !labels.includes(one) && (typed === '' || one.toLowerCase().includes(typed)))
    .slice(0, SUGGESTIONS);

  return (
    <div className={styles.picker}>
      {labels.length > 0 && (
        <div className={styles.chips}>
          {labels.map((label) => (
            <button
              key={label}
              type="button"
              className={styles.chip}
              title={t('Remove this label')}
              data-label-chip={label}
              disabled={disabled}
              onClick={() => onChange(labels.filter((held) => held !== label))}
            >
              {label} ×
            </button>
          ))}
        </div>
      )}
      <input
        id={id}
        className={styles.input}
        type="text"
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
      />
      {offered.length > 0 && !disabled && (
        <div className={styles.suggestions}>
          {offered.map((one) => (
            <button
              key={one}
              type="button"
              className={styles.suggestion}
              data-label-suggestion={one}
              // Pressed rather than clicked, so the box losing focus does not add what was half-typed first.
              onMouseDown={(event) => {
                event.preventDefault();
                setDraft('');
                onChange([...labels, one]);
              }}
            >
              + {one}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
