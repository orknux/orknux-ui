import styles from './ColumnHeader.module.css';

export interface ColumnHeaderProps<Order extends string> {
  /** What the column is called, as the table already spells it. */
  label: string;
  /**
   * What the server calls this order, or absent where the column is not one.
   *
   * A column of buttons is not a column of data - there is nothing to be in the
   * order of - so it is drawn as the plain heading it always was rather than as
   * a control that does nothing when pressed.
   */
  order?: Order;
  /** Which column the list is in the order of now. */
  current?: Order;
  ascending?: boolean;
  onSort?: (order: Order) => void;
  /** The table's own class for this column's width and alignment. */
  className: string;
}

/**
 * One heading of a table, pressable where the list can be put in its order.
 *
 * Issue #358 asked for every table view to be sortable by any of its columns,
 * and the ask is the same shape as the one that produced `usePageSize`: a
 * control people expected on every list existed on two of them. So the heading
 * is a component rather than a span each page draws for itself, and what a press
 * means is decided once.
 *
 * The arrow is drawn only on the column the list is actually in the order of.
 * An arrow on every heading says nothing about which one is doing the ordering,
 * and reads as six controls all switched on.
 *
 * `aria-sort` goes on the heading itself, which is what a screen reader reads to
 * say "sorted ascending" - the button inside it carries the press and the label
 * only.
 */
export function ColumnHeader<Order extends string>({
  label,
  order,
  current,
  ascending = true,
  onSort,
  className,
}: ColumnHeaderProps<Order>) {
  if (order === undefined || onSort === undefined) {
    return <span className={className}>{label}</span>;
  }

  const sorted = current === order;
  return (
    <span
      className={`${className} ${styles.head}`}
      aria-sort={sorted ? (ascending ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={sorted ? `${styles.press} ${styles.pressOn}` : styles.press}
        onClick={() => onSort(order)}
        title={
          sorted
            ? `${label}: ${ascending ? 'A to Z' : 'Z to A'}. Press to turn it round.`
            : `Order by ${label}`
        }
      >
        {label}
        {/*
          The mark is text rather than an image: it sits on the baseline of a
          heading half a line high, and an icon at that size was a smudge that
          had to be looked at to be read.
        */}
        {sorted && <span className={styles.mark}>{ascending ? '▲' : '▼'}</span>}
      </button>
    </span>
  );
}
