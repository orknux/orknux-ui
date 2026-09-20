import { useEffect, useState } from 'react';

/**
 * What is being typed, and what has actually been asked for.
 *
 * Two values rather than one, because the ask is a round trip: sending one per
 * keystroke would be a query per letter and a list that flickers behind the
 * typing. The first is what the box shows and stays immediate; the second
 * settles a short pause after the typing stops, and is what a page passes to
 * the server.
 *
 * A hook rather than the same six lines on every catalogue page - there are ten
 * of them now, and ten copies of a debounce is ten chances to pick a different
 * delay and make the same control feel different depending on which list you
 * are looking at.
 *
 * @returns `[typed, setTyped, asked]`
 */
export function useSearch(delayMs = 300): [string, (value: string) => void, string] {
  const [typed, setTyped] = useState('');
  const [asked, setAsked] = useState('');

  useEffect(() => {
    const waiting = setTimeout(() => setAsked(typed), delayMs);
    return () => clearTimeout(waiting);
  }, [typed, delayMs]);

  return [typed, setTyped, asked];
}
