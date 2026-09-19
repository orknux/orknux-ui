import { useState } from 'react';

/**
 * Which slice of a list somebody chose, remembered for them.
 *
 * The sibling of [usePageSize], and remembered the same way and for the same
 * reason: per person and per list, in local storage rather than in the
 * address. Somebody who works on one plugin's functions all afternoon was
 * being put back in front of every function in the workspace by every refresh,
 * and a choice a screen forgets is a choice somebody makes again and again.
 *
 * Not in the address, because it is a fact about the screen somebody is at
 * rather than about what they are looking at — a link they send should not
 * force their sieve on whoever opens it.
 *
 * [list] names the list and nothing else; the stored key is
 * `orknux.<list>.sieve`, alongside `orknux.<list>.page-size`.
 *
 * What is stored is whatever string the list uses for its own rows — `PLUGIN`,
 * `plugin:12`, an empty string for all of them — and it is handed back
 * unexamined. A value naming something that has since gone reads as a sieve
 * that matches nothing, which the list already draws as an empty page, and the
 * next choice replaces it. Validating it here would mean this file knowing
 * what every list's rows mean.
 */
export function useSieve(list: string): [string, (chosen: string) => void] {
  const key = `orknux.${list}.sieve`;
  const [sieve, setSieve] = useState(() => {
    try {
      return window.localStorage.getItem(key) ?? '';
    } catch {
      // A browser that refuses storage is a browser that does not remember,
      // which is the state this started in and is no reason to fail.
      return '';
    }
  });

  return [
    sieve,
    (chosen: string) => {
      setSieve(chosen);
      try {
        if (chosen === '') window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, chosen);
      } catch {
        // Chosen for this visit, forgotten by the next. Better than throwing
        // from a select.
      }
    },
  ];
}
