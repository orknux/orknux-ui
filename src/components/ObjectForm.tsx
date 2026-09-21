import { DefinitionPicker } from './DefinitionPicker';
import type { DefinitionOption } from './DefinitionPicker';
import { FieldHint } from './FieldHint';
import { TrashIcon } from './TrashIcon';
import { FIELD_DESCRIPTION_LIMIT } from '../api/objects';
import type { ObjectPropertyInput, PropertyKind, WorkflowObject } from '../api/objects';
import { t } from '../i18n';

/**
 * One row of an object's shape, before it is a property.
 *
 * What it holds and how many of them are two answers rather than one. They used
 * to be a single picker value - `ARRAY:OBJECT:12` beside `OBJECT:12` - which
 * made every type appear twice in the list and made "a list of these" something
 * you found by scrolling rather than something you said.
 */
export interface Row {
  name: string;
  /** `STRING`, `NUMBER`, `BOOLEAN` or `OBJECT:12`. What one of it is. */
  type: string;
  /** One of that type, or a list of them. */
  many: boolean;
  /** What the field means, for whoever - or whatever - reads it. */
  description: string;
}

/**
 * What a type says, as the three parts anything storing one keeps.
 *
 * The pair on screen and the three in the database are the same answer written
 * two ways, and this is the one place that knows both. A saved object's
 * property is stored this way and so is a field an Object node names for
 * itself - the same question asked in two places, so not two answers.
 */
export function kindsOf(type: string, many: boolean): {
  kind: PropertyKind;
  elementKind?: PropertyKind;
  refObjectId?: string;
} {
  const [kind, refObjectId] = type.split(':');
  if (many) {
    return kind === 'OBJECT'
      ? { kind: 'ARRAY', refObjectId }
      : { kind: 'ARRAY', elementKind: kind as PropertyKind };
  }
  if (kind === 'OBJECT') return { kind: 'OBJECT', refObjectId };
  return { kind: kind as PropertyKind };
}

/** And back: what the two controls should be showing for what is stored. */
export function typeOf(held: {
  kind?: PropertyKind | null;
  elementKind?: PropertyKind | null;
  refObjectId?: string | null;
}): { type: string; many: boolean } {
  if (held.kind === 'ARRAY') {
    return {
      type: held.refObjectId != null ? `OBJECT:${held.refObjectId}` : `${held.elementKind ?? 'STRING'}`,
      many: true,
    };
  }
  if (held.kind === 'OBJECT') return { type: `OBJECT:${held.refObjectId}`, many: false };
  return { type: held.kind ?? 'STRING', many: false };
}

/** What the two controls mean together, unpacked for the server. */
export function asProperty(row: Row): ObjectPropertyInput {
  const description = row.description.trim();
  return {
    name: row.name,
    ...kindsOf(row.type, row.many),
    description: description === '' ? null : description,
  };
}

/**
 * And back again, so a saved object reopens on what it was saved with.
 *
 * An array saved before this existed comes back as its element type with Many
 * chosen, which is the same property said the new way - nothing is migrated and
 * nothing is lost, because the two halves were always in the row anyway.
 */
export function asRow(property: WorkflowObject['properties'][number]): Row {
  return { name: property.name, ...typeOf(property), description: property.description ?? '' };
}

/** A row to start from: a string, singular, waiting for a name. */
export const EMPTY_ROW: Row = { name: '', type: 'STRING', many: false, description: '' };

/**
 * What a field can be one of, built from what the workspace has named.
 *
 * The scalars first, because that is what most fields are, and then every shape
 * the workspace has - an object included in its own list, which is how a tree is
 * described. Each object carries its own description as the second line, so
 * choosing between two similar names does not mean opening both of them.
 *
 * Here rather than in either caller: both surfaces offer the same types, and two
 * lists of what a field may be is one list too many.
 */
export function typeOptionsOf(others: WorkflowObject[]): DefinitionOption[] {
  return [
    { value: 'STRING', label: 'string' },
    { value: 'NUMBER', label: 'number' },
    { value: 'BOOLEAN', label: 'boolean' },
    ...others.map((other) => ({
      value: `OBJECT:${other.id}`,
      label: other.name,
      hint: other.description ?? `${other.propertyCount} ${other.propertyCount === 1 ? 'field' : 'fields'}`,
    })),
  ];
}

/**
 * The class names the rows paint themselves with.
 *
 * Handed in rather than imported, for the reason `ActionForm` asks for them:
 * this editor is shown on two surfaces that are not the same. It is a card on
 * the object's own page and a column beside a workflow graph. The fields are
 * identical in both - so there is one editor - and the look belongs to whichever
 * frame is holding it.
 */
export interface ObjectFormStyles {
  /** The line shown where there are no properties at all. */
  empty: string;
  row: string;
  /** The name, type and Values controls, side by side. */
  main: string;
  field: string;
  label: string;
  nameCol: string;
  name: string;
  typeCol: string;
  holdsCol: string;
  /** The Single/List pair. */
  holds: string;
  holdsOption: string;
  holdsOptionActive: string;
  actionCol: string;
  delete: string;
  descriptionRow: string;
  description: string;
  footer: string;
  add: string;
}

export interface ObjectFormProps {
  /** The shape being edited, as rows. Controlled: the frame holds it. */
  rows: Row[];
  onChange: (rows: Row[]) => void;
  /** What a property may point at, from [typeOptionsOf]. */
  typeOptions: DefinitionOption[];
  styles: ObjectFormStyles;
  /**
   * Where each control's id and each label's `htmlFor` start.
   *
   * Two of these can be on one screen - a node's panel beside the page it came
   * from is not a case, but a second editor anywhere would be - and two labels
   * pointing at `property-name-0` point at the same box.
   */
  idPrefix?: string;
}

/**
 * An object's properties: a name, a type, how many, and a sentence.
 *
 * A table rather than text because they are a list of pairs, and every one of
 * them has to resolve - a type nobody can look up is the thing this exists to
 * prevent. Controlled rather than stateful: the page holds this shape to compare
 * against what was loaded, and the workflow panel holds it to know when to
 * write, so a copy in here would be a third version of the same answer.
 */
export function ObjectForm({ rows, onChange, typeOptions, styles, idPrefix = 'property' }: ObjectFormProps) {
  const edit = (index: number, change: Partial<Row>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));

  return (
    <>
      {rows.length === 0 && (
        <p className={styles.empty}>
          {/*
            The sentence that was here is behind the (?), where an explanation
            of a thing belongs - it was four lines of prose under an empty list,
            read once by whoever arrived and skipped by everybody after. Issue
            #360.
          */}
          <span className={styles.label}>
            {t('No properties yet.')}
            <FieldHint label={t('Properties')}>
              {t(
                'Each one is a name, a type and a sentence saying what it means — the sentence is what a reader has instead of guessing from the name, and what a model has instead of nothing at all.',
              )}
            </FieldHint>
          </span>
        </p>
      )}

      {rows.map((row, index) => {
        const called = row.name || `property ${index + 1}`;
        return (
          <div className={styles.row} key={index}>
            <div className={styles.main}>
              <span className={`${styles.field} ${styles.nameCol}`}>
                <label className={styles.label} htmlFor={`${idPrefix}-name-${index}`}>
                  {t('Name')}
                </label>
                <input
                  id={`${idPrefix}-name-${index}`}
                  className={styles.name}
                  value={row.name}
                  spellCheck={false}
                  placeholder="channel"
                  onChange={(event) => edit(index, { name: event.target.value })}
                />
              </span>
              <span className={`${styles.field} ${styles.typeCol}`}>
                <label className={styles.label} htmlFor={`${idPrefix}-type-${index}`}>
                  {t('Type')}
                </label>
                <DefinitionPicker
                  id={`${idPrefix}-type-${index}`}
                  value={row.type}
                  options={typeOptions}
                  onChoose={(value) => edit(index, { type: value })}
                  placeholder={t('Choose a type…')}
                  searchPlaceholder={t('Search types…')}
                  ariaLabel={`Type of ${called}`}
                />
              </span>
              {/*
                Scalar or vector, asked once for whichever type is chosen.
                Two buttons rather than a checkbox because both answers are
                worth reading: a field carrying a single value is a decision
                somebody made, not the absence of one.
              */}
              <span className={`${styles.field} ${styles.holdsCol}`}>
                <span className={styles.label} id={`${idPrefix}-values-${index}`}>
                  {t('Values')}
                </span>
                <span className={styles.holds} role="group" aria-label={`Whether ${called} is a single value or a list`}>
                  <button
                    type="button"
                    aria-pressed={!row.many}
                    className={row.many ? styles.holdsOption : styles.holdsOptionActive}
                    onClick={() => edit(index, { many: false })}
                  >
                    {t('Single')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={row.many}
                    className={row.many ? styles.holdsOptionActive : styles.holdsOption}
                    onClick={() => edit(index, { many: true })}
                  >
                    {t('List')}
                  </button>
                </span>
              </span>
              <span className={styles.actionCol}>
                <button
                  type="button"
                  className={styles.delete}
                  aria-label={`Remove ${called}`}
                  title={t('Remove this property')}
                  onClick={() => onChange(rows.filter((_, at) => at !== index))}
                >
                  <TrashIcon />
                </button>
              </span>
            </div>
            {/*
              The sentence, on a line of its own, labelled and always visible.
              Labelled because a placeholder disappears the moment somebody
              types, and a field whose only explanation vanishes on first use
              explains nothing to the person who comes back to it.
              Behind a disclosure it would be written for the fields
              somebody remembered to open, which is the half that needed
              explaining least.
            */}
            <div className={`${styles.field} ${styles.descriptionRow}`}>
              <label className={styles.label} htmlFor={`${idPrefix}-description-${index}`}>
                {t('Description')}
              </label>
              <input
                id={`${idPrefix}-description-${index}`}
                className={styles.description}
                value={row.description}
                maxLength={FIELD_DESCRIPTION_LIMIT}
                placeholder={t('What this field means, for a reader and for a model')}
                onChange={(event) => edit(index, { description: event.target.value })}
              />
            </div>
          </div>
        );
      })}

      <footer className={styles.footer}>
        <button type="button" className={styles.add} onClick={() => onChange([...rows, { ...EMPTY_ROW }])}>
          {t('+ Add Property')}
        </button>
      </footer>
    </>
  );
}
