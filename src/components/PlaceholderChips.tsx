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
  /** Where it starts in the text, so a highlight can be laid over exactly these characters. */
  at: number;
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
    const at = match.index ?? 0;
    const field = PLACEHOLDER.exec(written)?.[1] ?? null;
    if (field === null) {
      return { written, at, field, answeredBy: null, problem: t('not a placeholder: write {{field}}') };
    }
    /*
     * A workspace variable, by id: answered when it is one the list offers - the
     * workspace's own or a lent one, never a secret, which the save refuses too.
     */
    if (field.split('.')[0] === 'variables') {
      const variable = options.find((option) => option.expression === field) ?? null;
      return variable !== null
        ? { written, at, field, answeredBy: variable, problem: null }
        : { written, at, field, answeredBy: null, problem: t('not a variable this workspace can use') };
    }
    // A field, or a field inside one: `result.total` is answered by `result`.
    const answeredBy =
      options.find((option) => option.expression === field) ??
      options.find((option) => field.startsWith(`${option.expression}.`)) ??
      null;
    if (answeredBy !== null) return { written, at, field, answeredBy, problem: null };
    // A trigger's field written bare: it is read under the trigger's name, as the edges show it.
    const asTrigger = field.startsWith('trigger.') ? null : `trigger.${field}`;
    if (asTrigger !== null && options.some((option) => option.expression === asTrigger || asTrigger.startsWith(`${option.expression}.`))) {
      return { written, at, field, answeredBy: null, problem: tf('a trigger field: write {{{field}}}', { field: asTrigger }) };
    }
    return { written, at, field, answeredBy: null, problem: t('nothing in this workflow produces it') };
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
            {/* A variable by its name, since the id it is written with says nothing. */}
            <span className={styles.field}>
              {one.field?.startsWith('variables.') ? one.answeredBy?.field : one.field}
            </span>
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
