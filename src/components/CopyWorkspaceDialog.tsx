import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { WorkspaceCopyPart } from '../api/workspaces';
import { t } from '../i18n';
import styles from './Dialog.module.css';
import own from './CopyWorkspaceDialog.module.css';

/** What can be copied, in the groups the dialog draws them in, with what each one is. */
const GROUPS: Array<{ heading: string; parts: Array<{ part: WorkspaceCopyPart; label: string; hint: string }> }> = [
  {
    heading: t('Connections and models'),
    parts: [
      { part: 'CONNECTIONS', label: t('Connections'), hint: t('Without their credentials') },
      { part: 'MCP_SERVERS', label: t('MCP servers'), hint: t('Without their credentials') },
      { part: 'MODELS', label: t('Model providers and models'), hint: t('Without their keys') },
    ],
  },
  {
    heading: t('What it knows'),
    parts: [
      { part: 'VARIABLES', label: t('Variables'), hint: t('Values come; secrets come empty') },
      { part: 'MEMORIES', label: t('Memories'), hint: t('Every catalog and what is in it') },
    ],
  },
  {
    heading: t('What it does'),
    parts: [
      { part: 'OBJECTS', label: t('Objects'), hint: '' },
      { part: 'FUNCTIONS', label: t('Functions'), hint: '' },
      { part: 'CONDITIONS', label: t('Conditions'), hint: '' },
      { part: 'TOOLS', label: t('Tools'), hint: '' },
      { part: 'SKILLS', label: t('Skills'), hint: '' },
      { part: 'ACTIONS', label: t('Actions'), hint: '' },
      { part: 'AGENTS', label: t('Agents'), hint: '' },
      { part: 'TRIGGERS', label: t('Triggers'), hint: t('Arrive switched off') },
      { part: 'WORKFLOWS', label: t('Workflows'), hint: t('Arrive as drafts') },
    ],
  },
];

const EVERY: WorkspaceCopyPart[] = GROUPS.flatMap((group) => group.parts.map((one) => one.part));

/** Where the last choice is kept, so the next copy starts from it. */
const REMEMBERED = 'orknux.workspaceCopyParts';

function remembered(): Set<WorkspaceCopyPart> {
  try {
    const held = JSON.parse(window.localStorage.getItem(REMEMBERED) ?? 'null') as unknown;
    if (Array.isArray(held)) return new Set(held.filter((one): one is WorkspaceCopyPart => EVERY.includes(one)));
  } catch {
    // Unreadable or turned off: everything, as a copy was before there was a choice.
  }
  return new Set(EVERY);
}

export interface CopyWorkspaceDialogProps {
  /** The workspace being copied; null while the dialog is closed. */
  workspace: { id: string; name: string } | null;
  onClose: () => void;
  /** Starts the copy; a blank name is the server's to choose. */
  onCopy: (name: string | null, parts: WorkspaceCopyPart[]) => void;
}

/**
 * What a copy of a workspace takes with it, asked before it starts.
 *
 * Its own settings always come; everything else is a switch, grouped by what it
 * is. Leaving out something another part needs is allowed - the copy says what
 * it could not bring and why - so the switches are a choice, not a puzzle.
 */
export function CopyWorkspaceDialog({ workspace, onClose, onCopy }: CopyWorkspaceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<Set<WorkspaceCopyPart>>(remembered);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (workspace !== null && !dialog.open) {
      setName('');
      setChosen(remembered());
      dialog.showModal();
    } else if (workspace === null && dialog.open) {
      dialog.close();
    }
  }, [workspace]);

  function toggle(part: WorkspaceCopyPart, on: boolean) {
    setChosen((was) => {
      const next = new Set(was);
      if (on) next.add(part);
      else next.delete(part);
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parts = EVERY.filter((part) => chosen.has(part));
    try {
      window.localStorage.setItem(REMEMBERED, JSON.stringify(parts));
    } catch {
      // Not remembered is not broken.
    }
    onCopy(name.trim() === '' ? null : name.trim(), parts);
  }

  return (
    <dialog ref={dialogRef} className={`${styles.dialog} ${styles.dialogWide}`} onCancel={onClose} onClose={onClose} data-testid="copy-workspace-dialog">
      <form className={styles.body} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <h2 className={styles.title}>{workspace === null ? t('Copy workspace') : `${t('Copy')} ${workspace.name}`}</h2>
        </header>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="copy-workspace-name">
            {t('Name')} <span className={styles.optional}>{t('optional')}</span>
          </label>
          <input
            id="copy-workspace-name"
            className={styles.input}
            value={name}
            placeholder={workspace === null ? '' : `${workspace.name} ${t('copy')}`}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className={own.head}>
          <span className={styles.label}>{t('What to copy')}</span>
          <span className={own.quick}>
            <button type="button" className={own.link} onClick={() => setChosen(new Set(EVERY))}>
              {t('All')}
            </button>
            <button type="button" className={own.link} onClick={() => setChosen(new Set())}>
              {t('None')}
            </button>
          </span>
        </div>

        <div className={own.groups}>
          {GROUPS.map((group) => (
            <fieldset key={group.heading} className={own.group}>
              <legend className={own.legend}>{group.heading}</legend>
              {group.parts.map(({ part, label, hint }) => (
                <label key={part} className={own.part}>
                  <input
                    type="checkbox"
                    checked={chosen.has(part)}
                    onChange={(event) => toggle(part, event.target.checked)}
                    data-copy-part={part}
                  />
                  <span className={own.partText}>
                    <span>{label}</span>
                    {hint !== '' && <span className={own.hint}>{hint}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>

        <p className={styles.dialogMessage}>{t('Its own settings always come; its runs, sessions and roles never do.')}</p>

        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className={styles.filled}>
            {t('Copy')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
