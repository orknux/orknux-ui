import { useState } from 'react';

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
