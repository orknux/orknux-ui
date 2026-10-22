import { costAmount, tokenCount } from '../../api/chat';
import chevronDown12Icon from '../../assets/chevron-down-12.svg';
import { zoned } from '../../session/timeZone';
import styles from './AdminReportsPage.module.css';
import { Select } from '../../components/Select';

/** What every report on Admin > Reports draws alike: its pickers, its tiles, its dates. */

export function Picker({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.picker}>
      <span className={styles.pickerLabel}>{label}</span>
      <span className={styles.pickerBox}>
        <Select className={styles.pickerSelect} value={value} onChange={(picked) => onChange(picked)} chevron={false}>
          {children}
        </Select>
        <img className={styles.pickerChevron} src={chevronDown12Icon} alt="" width={12} height={12} />
      </span>
    </label>
  );
}

export function Tile({ label, value, exact, children }: { label: string; value: string; exact?: number; children: React.ReactNode }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue} title={exact === undefined ? undefined : tokenCount(exact)}>{value}</span>
      <span className={styles.tileNote}>{children}</span>
    </div>
  );
}

export function costOf(cost: string | null, partly: boolean): string {
  if (cost === null) return '—';
  return `${costAmount(Number(cost))}${partly ? '+' : ''}`;
}

export function share(part: number, whole: number): string {
  if (whole === 0) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

export function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', zoned({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })).format(date);
}
