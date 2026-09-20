import type { ReactNode } from 'react';
import searchIcon from '../assets/search.svg';
import styles from './SearchBox.module.css';
import { t } from '../i18n';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** What the empty box says, e.g. "Search agents...". */
  placeholder: string;
  /** What the control is called, where the placeholder is not enough. */
  label?: string;
}

/**
 * The box a list is narrowed with.
 *
 * An icon and a field sharing one border, which is what Variables has worn
 * since it got a search. It is a component rather than a fourth copy of the
 * same twelve lines: Artifacts, Agents and Models all wanted one, and three
 * more copies is three more places for the same control to drift into three
 * different shapes.
 *
 * It holds no state and knows nothing about what it is narrowing - whether the
 * page sieves what it already has or asks the server again is the page's
 * business, and the two are not interchangeable. A paged list has to ask the
 * server, because narrowing what arrived on page one hides matches on page
 * four and calls that "no results".
 */
export function SearchBox({ value, onChange, placeholder, label }: SearchBoxProps) {
  return (
    <div className={styles.box}>
      <img src={searchIcon} alt="" width={14} height={14} />
      <input
        type="search"
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
      />
    </div>
  );
}

/**
 * Where a search box goes: first thing on the left, under the title.
 *
 * A wrapper rather than a margin on the box itself, because one page puts its
 * box on a filter bar beside another control and must not inherit the spacing
 * of a box that stands alone.
 *
 * `inset` is for a row that lives inside a card. Those carry their padding on
 * the header and on each row rather than on the card, so a row dropped
 * straight in sits flush against the border with everything around it indented.
 */
export function SearchRow({ children, inset = false }: { children: ReactNode; inset?: boolean }) {
  return <div className={inset ? `${styles.row} ${styles.rowInset}` : styles.row}>{children}</div>;
}

/** What a search box is called where nothing more specific fits. */
export const SEARCH_LABEL = t('Search');
