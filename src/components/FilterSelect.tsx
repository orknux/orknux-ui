import { Select } from './Select';
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
  /** What a check finds it by: put on the control itself. */
  testId?: string;
}

/**
 * A sieve beside a search box: one dimension of a list, narrowed to one value
 * or left open.
 *
 * Drawn as the audit log's filters are - the label muted, the value plain, the
 * chevron the app's own - so the three lists that take one read the same. The
 * whole box is the one control, `Select`.
 * Drawn whenever there is a value at all, one included: a filter that comes and
 * goes with the data reads as missing, and one value still says what is there.
 */
export function FilterSelect({ label, value, onChange, all, options, testId }: FilterSelectProps) {
  if (options.length === 0) return null;
  return (
    <Select
      className={styles.filter}
      value={value}
      onChange={onChange}
      aria-label={label}
      data-testid={testId}
      prefix={<span className={styles.label}>{label}</span>}
    >
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </Select>
  );
}
