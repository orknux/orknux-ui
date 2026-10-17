import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { CodeEditor } from './CodeEditor';
import styles from './Dialog.module.css';
import { DrawerEdge } from './DrawerWidth';
import { PanelClose, panelEscape } from './PanelClose';
import own from './SchemaDialog.module.css';
import { t, tf } from '../i18n';

export interface SchemaDialogProps {
  /** Over the page, or beside the workflow editor's graph; see NameDialog. */
  placement?: 'modal' | 'panel';
  open: boolean;
  onClose: () => void;
  /** Makes the object; a refusal thrown here is shown under the form. */
  onSubmit: (name: string, description: string, schema: string) => Promise<void>;
}

/** What the box holds, read the way the server will read it - so the person hears before pressing Create. */
export type SchemaReading =
  | { ok: false; says: string }
  | { ok: true; properties: number; nested: number; arrays: number; leftBehind: string[]; renamed: string[] };

/** The keywords a schema may carry that nothing here can hold a value to. */
const LEFT_BEHIND = ['required', 'enum', 'const', 'format', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'oneOf', 'anyOf', 'allOf', 'additionalProperties', 'default'];

type Node = Record<string, unknown>;
const isNode = (value: unknown): value is Node => value !== null && typeof value === 'object' && !Array.isArray(value);
const typeOf = (node: Node): string | null => {
  const type = node.type;
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) return (type.find((one) => one !== 'null') as string | undefined) ?? null;
  return null;
};
const isObjectSchema = (node: Node): boolean => typeOf(node) === 'object' || isNode(node.properties);
/** What a property may be called: what can be written after a dot, which is how a property is read. The server writes the rest with underscores. */
const USABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `{"$ref": "#/definitions/Address"}` read as the definition, as the server reads it; anything else as it is. */
function resolve(node: unknown, root: Node, hops = 0): unknown {
  if (!isNode(node) || typeof node.$ref !== 'string' || hops > 20) return node;
  if (!node.$ref.startsWith('#/')) return { type: 'object' };
  let at: unknown = root;
  for (const step of node.$ref.slice(2).split('/')) {
    if (!isNode(at)) return { type: 'object' };
    at = at[step.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return at === undefined ? { type: 'object' } : resolve(at, root, hops + 1);
}

export function readSchema(text: string): SchemaReading | null {
  if (text.trim() === '') return null;
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (cause) {
    return { ok: false, says: tf('Not JSON: {why}', { why: cause instanceof Error ? cause.message : String(cause) }) };
  }
  if (!isNode(root)) return { ok: false, says: t('A JSON Schema is a JSON object.') };
  if (!isObjectSchema(root)) {
    const type = typeOf(root);
    return {
      ok: false,
      says: type === null
        ? t('The schema says neither "type": "object" nor "properties", so there is nothing to read as one.')
        : tf('The schema describes a {type}, not an object.', { type }),
    };
  }
  if (!isNode(root.properties) || Object.keys(root.properties).length === 0) return { ok: false, says: t('The schema names no properties.') };

  const top = root;
  let nested = 0;
  let arrays = 0;
  const renamed: string[] = [];
  const leftBehind = new Set<string>();
  const walk = (raw: unknown, depth: number) => {
    const node = resolve(raw, top);
    if (!isNode(node) || depth > 40) return;
    LEFT_BEHIND.forEach((keyword) => { if (keyword in node) leftBehind.add(keyword); });
    if (isNode(node.properties)) {
      Object.entries(node.properties).forEach(([key, raw]) => {
        if (!USABLE_NAME.test(key)) renamed.push(key);
        const child = resolve(raw, top);
        if (!isNode(child)) return;
        if (isObjectSchema(child)) nested += 1;
        if (typeOf(child) === 'array') {
          arrays += 1;
          const items = resolve(child.items, top);
          if (isNode(items) && isObjectSchema(items)) nested += 1;
          walk(items, depth + 1);
        }
        walk(child, depth + 1);
      });
    }
  };
  walk(top, 0);
  return { ok: true, properties: Object.keys(root.properties).length, nested, arrays, leftBehind: [...leftBehind], renamed };
}

/**
 * An object from a JSON Schema somebody pastes: a name for it, and the schema.
 *
 * The box is the app's own code editor in JSON mode, so the schema reads as
 * code and a missing comma is marked where it is. Over the box, on the label's
 * line, what the schema reads as - read here as the server will read it on
 * Create, so a refusal is not the first news: a count of what will be made,
 * or the reason nothing would be. Create waits until it reads.
 */
export function SchemaDialog({ placement = 'modal', open, onClose, onSubmit }: SchemaDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schema, setSchema] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reading = useMemo(() => readSchema(schema), [schema]);
  const readable = reading !== null && reading.ok;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      setName('');
      setDescription('');
      setSchema('');
      setError(null);
      setSubmitting(false);
      if (placement === 'panel') dialog.show();
      else dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, placement]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === '' || !readable || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name.trim(), description.trim(), schema);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not create it.'));
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${placement === 'panel' ? styles.dialogPanel : styles.dialogWider}`}
      onCancel={onClose}
      onClose={onClose}
      onKeyDown={panelEscape(placement, onClose)}
      data-testid="schema-dialog"
    >
      <DrawerEdge placement={placement} />
      <form className={styles.body} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <h2 className={styles.title}>{t('Object from JSON Schema')}</h2>
          {placement === 'panel' && <PanelClose onClose={onClose} />}
        </header>
        <p className={styles.dialogMessage}>
          {t('Its properties become the object\'s; an object inside it is defined in place. Types and descriptions are kept, the rest of the schema is not.')}
        </p>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="schema-object-name">{t('Name')}</label>
            <div className={styles.inputWrapper}>
              <input
                id="schema-object-name"
                className={`${styles.input} ${styles.inputMono}`}
                type="text"
                placeholder="Order"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                required
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="schema-object-description">{t('Description')}</label>
            <div className={styles.inputWrapper}>
              <input
                id="schema-object-description"
                className={styles.input}
                type="text"
                placeholder={t('What this shape is, for whoever points at it.')}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <div className={styles.field}>
            <div className={own.labelRow}>
              <span className={styles.label} id="schema-object-schema-label">{t('JSON Schema')}</span>
              {/* One word, green or red; what it is based on waits on the hover. */}
              {reading !== null && (
                <span
                  className={reading.ok ? own.valid : own.invalid}
                  role="status"
                  data-testid="schema-reading"
                  data-valid={reading.ok ? 'true' : 'false'}
                  title={reading.ok
                    ? [
                        tf('{count} properties', { count: reading.properties }),
                        reading.nested > 0 ? tf('{count} defined in place', { count: reading.nested }) : null,
                        reading.arrays > 0 ? tf('{count} arrays', { count: reading.arrays }) : null,
                        reading.leftBehind.length > 0 ? tf('left behind: {keywords}', { keywords: reading.leftBehind.join(', ') }) : null,
                        reading.renamed.length > 0 ? tf('written with underscores: {keys}', { keys: reading.renamed.join(', ') }) : null,
                      ].filter((part) => part !== null).join(' · ')
                    : reading.says}
                >
                  <span className={own.dot} aria-hidden="true" />
                  {reading.ok ? t('Valid') : t('Invalid')}
                </span>
              )}
            </div>
            <div className={`${styles.inputWrapper} ${own.schemaWrapper}`} data-testid="schema-box">
              <CodeEditor value={schema} onChange={setSchema} language="json" ariaLabel={t('JSON Schema')} />
            </div>
          </div>
        </div>

        {error !== null && (
          <p className={styles.error} role="alert">{error}</p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={submitting}>{t('Cancel')}</button>
          <button type="submit" className={styles.filled} disabled={submitting || name.trim() === '' || !readable}>
            {submitting ? t('Creating…') : t('Create Object')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
