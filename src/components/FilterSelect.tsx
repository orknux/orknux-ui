import chevronDown12Icon from '../assets/chevron-down-12.svg';
import styles from './FilterSelect.module.css';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  /** What the control is called, read out and shown before the value: "Type". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** What the empty value means: "All types". */
  all: string;
  options: readonly FilterOption[];
  /** What a check finds it by. */
  testId?: string;
}

/**
 * A sieve beside a search box: one dimension of a list, narrowed to one value
 * or left open.
 *
 * Drawn as the audit log's filters are - the label muted, the value plain, the
 * chevron the app's own - so the three lists that take one read the same.
 * Nothing is drawn where there is only one value to choose, because a menu of
 * one is a label.
 */
export function FilterSelect({ label, value, onChange, all, options, testId }: FilterSelectProps) {
  if (options.length < 2) return null;
  return (
    <label className={styles.filter} data-testid={testId}>
      <span className={styles.label}>{label}</span>
      <select className={styles.select} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <img src={chevronDown12Icon} alt="" width={12} height={12} />
    </label>
  );
}
