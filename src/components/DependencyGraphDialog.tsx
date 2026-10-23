import { useEffect, useMemo, useRef, useState } from 'react';

import type { DependencyKind } from '../api/dependants';
import { fetchDependencyGraph } from '../api/dependencyGraph';
import type { DependencyGraph } from '../api/dependencyGraph';
import { chainOf, DependencyGraphCanvas, DependencySelection, graphKey, narrowed } from './DependencyGraphCanvas';
import { Loader } from './Loader';
import { PanelClose } from './PanelClose';
import styles from './Dialog.module.css';
import own from './DependencyGraphDialog.module.css';
import { t } from '../i18n';

export interface DependencyGraphDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  kind: DependencyKind;
  componentId: string;
}

/**
 * One part's dependencies as a graph: what it uses, what uses it, and on down
 * both ways - the Used by list followed to the end, with the other direction
 * beside it.
 *
 * The workspace's whole graph is fetched and narrowed here to the part's chain,
 * so this and the Dependencies page draw from one answer and cannot disagree.
 */
export function DependencyGraphDialog({ open, onClose, workspaceId, kind, componentId }: DependencyGraphDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focus = graphKey(kind, componentId);
  const [selectedKey, setSelectedKey] = useState<string | null>(focus);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setGraph(null);
    setError(null);
    setSelectedKey(focus);
    fetchDependencyGraph(workspaceId)
      .then(setGraph)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the dependencies.')));
  }, [open, workspaceId, focus]);

  const chain = useMemo(() => {
    if (graph === null || !graph.nodes.some((node) => node.key === focus)) return null;
    return narrowed(graph, chainOf(focus, graph));
  }, [graph, focus]);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${own.graphDialog}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={t('Dependency graph')}
      data-testid="dependency-graph-dialog"
    >
      {open && (
        <div className={`${styles.body} ${own.body}`}>
          <header className={styles.header}>
            <h2 className={styles.title}>{t('Dependency graph')}</h2>
            <PanelClose onClose={onClose} />
          </header>
          {error !== null && <p className={styles.error}>{error}</p>}
          {error === null && graph === null && <Loader />}
          {graph !== null && chain === null && <p className={own.notice}>{t('Nothing uses this yet.')}</p>}
          {chain !== null && (
            <>
              <DependencySelection graph={chain} workspaceId={workspaceId} selectedKey={selectedKey} onOpen={onClose} />
              <DependencyGraphCanvas
                graph={chain}
                workspaceId={workspaceId}
                selectedKey={selectedKey}
                onSelect={(key) => setSelectedKey(key ?? focus)}
                className={own.canvas}
                focusKey={focus}
              />
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
