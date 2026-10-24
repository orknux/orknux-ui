import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import dialog from '../../components/Dialog.module.css';
import { t, tf } from '../../i18n';
import styles from './ResearchPage.module.css';

/** A domain, lower case: `example.org`, `docs.example.co.uk`. */
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * What somebody typed, as the host it names, or null where it names none.
 * An address is welcome - `https://www.example.org/news` is example.org's - so
 * it is cut down to its host rather than refused for having a path.
 */
export function hostOf(typed: string): string | null {
  let held = typed.trim().toLowerCase();
  if (held === '') return null;
  held = held.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  held = held.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '');
  return HOST.test(held) ? held : null;
}

export interface SiteListProps {
  id: string;
  label: string;
  sites: string[];
  onChange: (sites: string[]) => void;
}

/**
 * Websites to keep to, or to avoid, as a list: typed and added with Enter or
 * Add, drawn as a row each with its own remove. A list rather than a text box,
 * so what will be searched is what is shown, and a typo is said at once rather
 * than found out after the research has searched the whole web.
 */
export function SiteList({ id, label, sites, onChange }: SiteListProps) {
  const [typed, setTyped] = useState('');
  const [refused, setRefused] = useState<string | null>(null);

  function add() {
    if (typed.trim() === '') return;
    const host = hostOf(typed);
    if (host === null) {
      setRefused(typed.trim());
      return;
    }
    if (!sites.includes(host)) onChange([...sites, host]);
    setTyped('');
    setRefused(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the site; it must not send the whole form.
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  }

  return (
    <div className={dialog.field} data-sites={id}>
      <label className={dialog.label} htmlFor={id}>{label}</label>
      <div className={styles.withButton}>
        <div className={dialog.inputWrapper}>
          <input
            id={id}
            className={dialog.input}
            value={typed}
            placeholder="example.org"
            onChange={(event) => {
              setTyped(event.target.value);
              setRefused(null);
            }}
            onKeyDown={onKeyDown}
            aria-invalid={refused !== null}
          />
        </div>
        <button type="button" className={dialog.ghost} onClick={add} disabled={typed.trim() === ''}>
          {t('Add')}
        </button>
      </div>
      {refused !== null && (
        <span className={dialog.error} role="alert" data-site-refused>
          {tf('Not a website: {typed}', { typed: refused })}
        </span>
      )}
      {sites.length > 0 && (
        <ul className={styles.chips}>
          {sites.map((site) => (
            <li key={site} className={styles.chip} data-site={site}>
              <span>{site}</span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => onChange(sites.filter((one) => one !== site))}
                aria-label={tf('Remove {name}', { name: site })}
                title={tf('Remove {name}', { name: site })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
