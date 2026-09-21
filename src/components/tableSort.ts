import { useState } from 'react';

/**
 * Rows put in order here, for the lists that are not paged by the server.
 *
 * Most tables are a page of a longer list, and those are ordered by the server
 * because ordering the twenty rows on screen is not ordering the two hundred.
 * A few are not: the models, the connections and the plugins arrive whole,
 * because they are short lists a workspace has a handful of. Those are ordered
 * here, which is correct precisely because nothing was left behind.
 *
 * [keyOf] is what the column holds for a row; [tieOf] is what breaks a draw, and
 * is the name in every caller so far - rows sharing a status must not shuffle
 * between renders.
 */
export function ordered<T>(
  rows: T[],
  keyOf: (row: T) => string | number | boolean | null | undefined,
  ascending: boolean,
  tieOf?: (row: T) => string,
): T[] {
  const said = (value: string | number | boolean | null | undefined): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? '1' : '0';
    // Numbers padded so 9 sorts before 10, which a plain comparison gets wrong.
    if (typeof value === 'number') return value.toString().padStart(12, '0');
    return value.toLowerCase();
  };

  const sorted = [...rows].sort((left, right) => {
    const by = said(keyOf(left)).localeCompare(said(keyOf(right)));
    if (by !== 0) return by;
    return tieOf === undefined ? 0 : tieOf(left).toLowerCase().localeCompare(tieOf(right).toLowerCase());
  });
  return ascending ? sorted : sorted.reverse();
}

/**
 * Which column a list is ordered by, and which way round.
 *
 * Remembered per person and per list, the way the page size is and for the same
 * reason: somebody who reads actions by name and runs by when they started is
 * not being inconsistent. Not in the address, because it is a fact about the
 * screen somebody is at rather than about what they are looking at, so a link
 * they send should not force their order on whoever opens it.
 *
 * [list] names the list and nothing else: the keys are
 * `orknux.<list>.sort-order` and `orknux.<list>.sort-ascending`.
 *
 * The default direction is the caller's, and callers disagree on purpose - a
 * column of names is read A to Z and a column of timestamps newest first - so a
 * list says what its own first column means.
 *
 * @returns `[order, ascending, sortBy]`, where `sortBy(column)` takes a press:
 * the same column again turns it round, a different one starts on that column's
 * own natural direction.
 */
export function useTableSort<Order extends string>(
  list: string,
  fallback: Order,
  fallbackAscending = true,
  /** Columns read newest-first when they are first pressed: dates, counts. */
  descending: readonly Order[] = [],
): [Order, boolean, (column: Order) => void] {
  const orderKey = `orknux.${list}.sort-order`;
  const directionKey = `orknux.${list}.sort-ascending`;

  const [order, setOrder] = useState<Order>(() => {
    const held = window.localStorage.getItem(orderKey);
    return (held as Order | null) ?? fallback;
  });
  const [ascending, setAscending] = useState(() => {
    const held = window.localStorage.getItem(directionKey);
    return held === null ? fallbackAscending : held === 'true';
  });

  return [
    order,
    ascending,
    (column: Order) => {
      const turning = column === order;
      const wanted = turning ? !ascending : !descending.includes(column);
      setOrder(column);
      setAscending(wanted);
      window.localStorage.setItem(orderKey, column);
      window.localStorage.setItem(directionKey, String(wanted));
    },
  ];
}
