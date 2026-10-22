import { useEffect, useState } from 'react';

import { fetchWorkspace } from '../../api/workspaces';

/** One question per workspace while the page is open, however many rows ask it. */
const asked = new Map<string, Promise<boolean>>();

/**
 * Whether the person here may read this workspace's secrets back - which is
 * what decides whether a Reveal is offered at all. False until the answer is
 * in: an eye that appears and then vanishes is worse than one that appears late.
 * The server refuses a reveal either way; this only keeps the control honest.
 */
export function useReadsSecrets(workspaceId: string): boolean {
  const [reads, setReads] = useState(false);
  useEffect(() => {
    if (workspaceId === '') return;
    let current = true;
    let question = asked.get(workspaceId);
    if (question === undefined) {
      question = fetchWorkspace(workspaceId).then((held) => held?.readsSecrets === true).catch(() => false);
      asked.set(workspaceId, question);
      // Asked again on the next page: roles change, and a stale yes is the wrong way to be wrong.
      void question.finally(() => window.setTimeout(() => asked.delete(workspaceId), 30_000));
    }
    void question.then((answer) => {
      if (current) setReads(answer);
    });
    return () => {
      current = false;
    };
  }, [workspaceId]);
  return reads;
}
