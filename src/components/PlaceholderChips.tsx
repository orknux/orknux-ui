import type { FieldOption } from './FieldPicker';
import styles from './PlaceholderChips.module.css';
import { t, tf } from '../i18n';

/** A well-formed placeholder: a dotted name between double braces, spaces allowed inside. The server reads the same. */
const PLACEHOLDER = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*\}\}$/;
/** Anything opened with `{{`, up to the next `}}` or the end. */
const OPENED = /\{\{[^}]*(\}\})?/g;

/** One `{{…}}` in a value, and whether the graph answers it - and if not, why. */
export interface Placeholder {
  written: string;
  field: string | null;
  answeredBy: FieldOption | null;
  problem: string | null;
}

/**
 * The `{{…}}` in a written value, each judged against what the graph offers:
 * the same rule the save refuses by, so what is red here is what a save would
 * be refused over.
 */
export function placeholdersIn(text: string, options: FieldOption[]): Placeholder[] {
  return Array.from(text.matchAll(OPENED)).map((match) => {
    const written = match[0];
    const field = PLACEHOLDER.exec(written)?.[1] ?? null;
    if (field === null) {
      return { written, field, answeredBy: null, problem: t('not a placeholder: write {{field}}') };
    }
    if (field.startsWith('variables.')) {
      return { written, field, answeredBy: null, problem: t('a workspace variable is a reference, not a placeholder') };
    }
    // A field, or a field inside one: `result.total` is answered by `result`.
    const answeredBy =
      options.find((option) => option.expression === field) ??
      options.find((option) => field.startsWith(`${option.expression}.`)) ??
      null;
    return { written, field, answeredBy, problem: answeredBy === null ? t('nothing in this workflow produces it') : null };
  });
}

/**
 * The placeholders of a written value, drawn under it: one answered looks like
 * the reference it is, naming the node it reads; one nothing answers is red,
 * with why, the moment it is typed.
 */
export function PlaceholderChips({ text, options }: { text: string; options: FieldOption[] }) {
  const found = placeholdersIn(text, options);
  if (found.length === 0) return null;
  return (
    <div className={styles.chips} data-testid="placeholder-chips">
      {found.map((one, index) =>
        one.problem === null ? (
          <span key={index} className={styles.chip} data-placeholder={one.field ?? ''} data-placeholder-ok="">
            <span className={styles.group}>{one.answeredBy?.groupName}</span>
            <span className={styles.field}>{one.field}</span>
          </span>
        ) : (
          <span
            key={index}
            className={`${styles.chip} ${styles.wrong}`}
            data-placeholder={one.field ?? one.written}
            data-placeholder-wrong=""
            role="alert"
            title={tf('{written}: {problem}', { written: one.written, problem: one.problem })}
          >
            <span className={styles.field}>{one.written}</span>
            <span className={styles.problem}>{one.problem}</span>
          </span>
        ),
      )}
    </div>
  );
}
