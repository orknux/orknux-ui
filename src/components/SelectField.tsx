import { Select } from './Select';
import styles from './SelectField.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  /** Shown before the value, e.g. "Status:". Omitted when the value speaks for itself. */
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** For screen readers when there is no visible label. */
  ariaLabel?: string;
  className?: string;
}

/**
 * A choice whose whole box opens it, with its name drawn inside the box.
 *
 * A native select beside a word inside a label looked like one control and
 * behaved like two: clicking the word focused the select without opening it.
 * The box is the control now - `Select`, the application's own - with the
 * label, the chosen option's text and the chevron all inside the one button.
 */
export function SelectField({ label, value, options, onChange, ariaLabel, className }: SelectFieldProps) {
  return (
    <Select
      className={className === undefined ? styles.selectField : `${styles.selectField} ${className}`}
      value={value}
      onChange={onChange}
      aria-label={ariaLabel ?? label}
      prefix={label !== undefined && <span className={styles.label}>{label}</span>}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
