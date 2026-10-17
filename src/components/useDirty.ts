import { useEffect, useRef, useState } from 'react';

/**
 * Whether what a page would save differs from what it last agreed with the
 * server.
 *
 * `draft` is what the page's fields say - the values its Save sends, as plain
 * data. The baseline is taken from it whenever anything in `rebase` changes:
 * the record arriving or coming back from a save, the count a Discard bumps.
 * Taken after the render that shows that record, so the fields have already
 * been filled from it - and the page that has just opened counts as unchanged.
 *
 * Compared as JSON: what matters is what a save would send, not which objects
 * hold it, and the fields are rebuilt as new objects on every keystroke.
 */
export function useDirty(draft: unknown, rebase: unknown[]): boolean {
  const now = JSON.stringify(draft);
  const baseline = useRef<string | null>(null);
  const [, setTaken] = useState(0);

  useEffect(() => {
    baseline.current = now;
    // A render of its own, so the answer below is read against the new baseline.
    setTaken((held) => held + 1);
    // The baseline moves with what is passed in, not with every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, rebase);

  return baseline.current !== null && baseline.current !== now;
}
