import { useEffect, useRef, useState } from 'react';

import { linkAllowed } from '../../api/diagrams';
import type { LinkedKind } from '../../api/diagrams';
import { t } from '../../i18n';
import styles from './DiagramLinkSearch.module.css';

/** One thing a link card can lead to, as the search lists it. */
export interface Linkable {
  kind: LinkedKind;
  id: string;
  name: string;
  catalogName: string;
  /** What it is for, or its first words: searched too. */
  about?: string;
}

export interface DiagramLinkSearchProps {
  /** The workspace's diagrams, documents and wireframes, as the editor holds them; null while they load. */
  items: Linkable[] | null;
  /** The diagram being edited, left off the list: a link does not lead to the page it is on. */
  exceptId: string;
  /** What was chosen: the link as a node stores it, and the name its card shows. */
  onPick: (link: string, name: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  /** Which list it opens on; a text element being made a link opens on its web address. */
  initialFilter?: 'all' | 'web';
  /** The words a web link starts with: the text element's own, when it is one being made a link. */
  initialWords?: string;
}

/** How many matches are listed before the rest are left to more typing; the list scrolls. */
const MOST = 50;

/** What the list is narrowed to: everything, one kind of thing, or a web address of one's own words. */
type Filter = 'all' | LinkedKind | 'web';

const FILTERS: { key: Filter; said: () => string }[] = [
  { key: 'all', said: () => t('All') },
  { key: 'diagram', said: () => t('Diagrams') },
  { key: 'document', said: () => t('Documents') },
  { key: 'wireframe', said: () => t('Wireframes') },
  { key: 'web', said: () => t('Web address') },
];

const KIND_SAID = { diagram: () => t('Diagram'), document: () => t('Document'), wireframe: () => t('Wireframe') } as const;

/** A web address as a card names it: its host and path, without the scheme. */
export function addressName(address: string): string {
  return address.trim().replace(/^https?:\/\//i, '').replace(/^mailto:/i, '').replace(/\/$/, '');
}

/**
 * One field that finds what a link card leads to: typing searches the
 * workspace's diagrams, documents and wireframes by name, and an address
 * pasted is offered as itself. Up and down walk the list, Enter takes the
 * lit row, Escape gives up. It replaced a dialog button over a borderless
 * second field, which read as a heading and a line of grey text.
 */
export function DiagramLinkSearch({ items, exceptId, onPick, onCancel, autoFocus, initialFilter = 'all', initialWords = '' }: DiagramLinkSearchProps) {
  const [said, setSaid] = useState('');
  const [lit, setLit] = useState(0);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [address, setAddress] = useState('');
  const [words, setWords] = useState(initialWords);
  const field = useRef<HTMLInputElement>(null);
  const addressField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) (initialFilter === 'web' ? addressField.current : field.current)?.focus();
  }, [autoFocus, initialFilter]);

  const typed = said.trim();
  const lower = typed.toLowerCase();
  const pasted = linkAllowed(typed) && !/^(diagram|document|wireframe):/i.test(typed) ? typed : null;
  const found = (items ?? [])
    .filter((one) => !(one.kind === 'diagram' && one.id === exceptId))
    .filter((one) => filter === 'all' || one.kind === filter)
    .filter((one) => lower === '' || one.name.toLowerCase().includes(lower) || one.catalogName.toLowerCase().includes(lower) || (one.about ?? '').toLowerCase().includes(lower))
    .slice(0, MOST);
  const rows: { link: string; name: string; kind: string; where: string }[] = [
    ...(pasted !== null ? [{ link: pasted, name: addressName(pasted), kind: t('Web address'), where: t('Opens in a new tab') }] : []),
    ...(pasted !== null ? [] : found.map((one) => ({ link: `${one.kind}:${one.id}`, name: one.name, kind: KIND_SAID[one.kind](), where: one.catalogName }))),
  ];
  const at = Math.min(lit, Math.max(0, rows.length - 1));

  const goodAddress = linkAllowed(address.trim()) && !/^(diagram|document|wireframe):/i.test(address.trim());
  const addAddress = () => {
    if (!goodAddress) return;
    const shown = words.trim();
    onPick(address.trim(), shown !== '' ? shown : addressName(address));
  };

  const tabs = (
    <div className={styles.filters} role="tablist" aria-label={t('What the link leads to')}>
      {FILTERS.map((one) => (
        <button
          key={one.key}
          type="button"
          role="tab"
          aria-selected={filter === one.key}
          className={`${styles.filter} ${filter === one.key ? styles.filterOn : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setFilter(one.key);
            setLit(0);
            // The web address form starts on its address; the rest go back to the search.
            window.requestAnimationFrame(() => (one.key === 'web' ? addressField.current : field.current)?.focus());
          }}
          data-testid={`diagram-link-filter-${one.key}`}
        >
          {one.said()}
        </button>
      ))}
    </div>
  );

  /*
   * A web address with words of one's own: the card shows the words and opens
   * the address, as a link in a document does. Typing an address into the
   * search still works; this is where the words are given.
   */
  if (filter === 'web') {
    return (
      <div className={styles.search} data-testid="diagram-link-search">
        {tabs}
        <form
          className={styles.webForm}
          onSubmit={(event) => {
            event.preventDefault();
            addAddress();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onCancel?.();
            }
          }}
        >
          <label className={styles.webField}>
            <span>{t('Address')}</span>
            <input
              ref={addressField}
              className={styles.field}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="https://…"
              aria-invalid={address.trim() !== '' && !goodAddress}
              data-testid="diagram-link-web-address"
            />
          </label>
          <label className={styles.webField}>
            <span>{t('Text to show')}</span>
            <input
              className={styles.field}
              value={words}
              onChange={(event) => setWords(event.target.value)}
              placeholder={address.trim() !== '' ? addressName(address) : t('The address itself, if left empty')}
              data-testid="diagram-link-web-text"
            />
          </label>
          <button type="submit" className={styles.webAdd} disabled={!goodAddress} data-testid="diagram-link-web-add">
            {t('Add link')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.search} data-testid="diagram-link-search">
      {tabs}
      <input
        ref={field}
        className={styles.field}
        value={said}
        onChange={(event) => {
          setSaid(event.target.value);
          setLit(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            if (rows.length > 0) setLit((at + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            const row = rows[at];
            if (row !== undefined) onPick(row.link, row.name);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel?.();
          }
        }}
        placeholder={filter === 'all' ? t('Search, or paste an address') : t('Search by name')}
        aria-label={t('What the link leads to')}
        data-testid="diagram-link-search-field"
      />
      <div className={styles.list} role="listbox" aria-label={t('What the link leads to')}>
        {items === null && <span className={styles.empty}>{t('Loading…')}</span>}
        {items !== null && rows.length === 0 && <span className={styles.empty}>{t('Nothing by that name. An address starts with https://')}</span>}
        {rows.map((row, index) => (
          <button
            key={row.link}
            type="button"
            role="option"
            aria-selected={index === at}
            className={`${styles.row} ${index === at ? styles.rowLit : ''}`}
            onMouseEnter={() => setLit(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(row.link, row.name)}
            data-testid="diagram-link-search-row"
          >
            <span className={styles.kind}>{row.kind}</span>
            <span className={styles.name}>{row.name}</span>
            {row.where !== '' && <span className={styles.where}>{row.where}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
