import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { dependantLabel, dependantPath } from '../api/dependants';
import type { Dependant, DependencyKind } from '../api/dependants';
import { fetchDependencyGraph } from '../api/dependencyGraph';
import type { DependencyGraph, DependencyGraphNode } from '../api/dependencyGraph';
import { Loader } from './Loader';
import { OpenDefinitionIcon } from './OpenDefinitionIcon';
import { PanelClose } from './PanelClose';
import styles from './Dialog.module.css';
import own from './DependencyTreeDialog.module.css';
import { t } from '../i18n';

export interface DependencyTreeDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  kind: DependencyKind;
  componentId: string;
}

/** One row of a branch, and the rows under it. */
export interface TreeBranch {
  node: DependencyGraphNode;
  children: TreeBranch[];
  /** Already drawn higher up this branch's tree: named, and not followed again. */
  repeat: boolean;
}

/** The key a part goes by on the graph: the server's `KIND:id`. */
function graphKey(kind: DependencyKind, id: string): string {
  return `${kind}:${id}`;
}

function asDependant(node: DependencyGraphNode, workspaceId: string): Dependant {
  return {
    kind: node.kind,
    id: node.id,
    name: node.name,
    workspaceId: node.kind === 'LIBRARY' ? null : workspaceId,
    workspaceName: null,
    published: node.published,
    section: node.section,
  };
}

/**
 * The parts under `root` one way along the arrows - what it uses, or what uses
 * it - followed to the end.
 *
 * A graph is not a tree: two things can use one part, and a part can come back
 * round to itself. So each part is followed the first time it is reached, and
 * any later time it is a row marked as shown above - which keeps the tree as
 * large as the graph and no larger, and ends every loop.
 */
export function branchesOf(root: string, graph: DependencyGraph, uses: boolean): TreeBranch[] {
  const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const next = (key: string) =>
    graph.edges
      .filter((edge) => (uses ? edge.from : edge.to) === key)
      .map((edge) => byKey.get(uses ? edge.to : edge.from))
      .filter((node): node is DependencyGraphNode => node !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set([root]);
  const grow = (key: string): TreeBranch[] =>
    next(key).map((node) => {
      if (seen.has(node.key)) return { node, children: [], repeat: true };
      seen.add(node.key);
      return { node, children: grow(node.key), repeat: false };
    });
  return grow(root);
}

interface BranchProps {
  branch: TreeBranch;
  workspaceId: string;
  onOpen: () => void;
}

function Branch({ branch, workspaceId, onOpen }: BranchProps) {
  const [expanded, setExpanded] = useState(true);
  const dependant = asDependant(branch.node, workspaceId);
  const parent = branch.children.length > 0;
  return (
    <li
      role="treeitem"
      aria-expanded={parent ? expanded : undefined}
      className={own.item}
      data-tree-name={branch.node.name}
      data-tree-repeat={branch.repeat ? '' : undefined}
    >
      <div className={own.row}>
        {parent ? (
          <button
            type="button"
            className={own.toggle}
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? t('Collapse') : t('Expand')}
          >
            <span className={expanded ? own.chevronOpen : own.chevron} aria-hidden="true">
              ▸
            </span>
          </button>
        ) : (
          <span className={own.leaf} aria-hidden="true" />
        )}
        <Link className={own.link} to={dependantPath(dependant)} onClick={onOpen}>
          <span className={own.name}>{branch.node.name}</span>
          <span className={own.kind}>{dependantLabel(dependant)}</span>
          {branch.repeat && <span className={own.repeat}>{t('shown above')}</span>}
          <span className={own.mark}>
            <OpenDefinitionIcon />
          </span>
        </Link>
      </div>
      {parent && expanded && (
        <ul role="group" className={own.children}>
          {branch.children.map((child) => (
            <Branch key={child.node.key} branch={child} workspaceId={workspaceId} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface SideProps {
  title: string;
  empty: string;
  branches: TreeBranch[];
  workspaceId: string;
  onOpen: () => void;
  side: string;
}

function Side({ title, empty, branches, workspaceId, onOpen, side }: SideProps) {
  return (
    <section className={own.side} data-tree-side={side}>
      <h3 className={own.sideTitle}>{title}</h3>
      {branches.length === 0 ? (
        <p className={own.empty}>{empty}</p>
      ) : (
        <ul role="tree" aria-label={title} className={own.tree}>
          {branches.map((branch) => (
            <Branch key={branch.node.key} branch={branch} workspaceId={workspaceId} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One part's dependencies as a tree: what it uses, followed down, and what uses
 * it, followed up - the Used by list followed to the end, with the other
 * direction beside it.
 *
 * The workspace's whole graph is fetched and walked here, so this and every
 * Used by list answer from the same rows and cannot disagree.
 */
export function DependencyTreeDialog({ open, onClose, workspaceId, kind, componentId }: DependencyTreeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = graphKey(kind, componentId);

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
    fetchDependencyGraph(workspaceId)
      .then(setGraph)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the dependencies.')));
  }, [open, workspaceId]);

  const tree = useMemo(() => {
    const part = graph?.nodes.find((node) => node.key === root);
    if (graph === null || part === undefined) return null;
    return { part, uses: branchesOf(root, graph, true), usedBy: branchesOf(root, graph, false) };
  }, [graph, root]);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${own.treeDialog}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={t('Dependency tree')}
      data-testid="dependency-tree-dialog"
    >
      {open && (
        <div className={`${styles.body} ${own.body}`}>
          <header className={styles.header}>
            <h2 className={styles.title}>{t('Dependency tree')}</h2>
            <PanelClose onClose={onClose} />
          </header>
          {error !== null && <p className={styles.error}>{error}</p>}
          {/*
            At once rather than after the house quiet period: somebody has just
            pressed for this, and an empty dialog for three seconds reads as one
            that has nothing to show.
          */}
          {error === null && graph === null && (
            <div className={own.waiting} data-testid="dependency-tree-loading">
              <Loader delay={0} />
            </div>
          )}
          {graph !== null && tree === null && <p className={own.empty}>{t('Nothing uses this yet.')}</p>}
          {tree !== null && (
            <>
              <p className={own.root} data-testid="dependency-tree-root">
                <span className={own.rootName}>{tree.part.name}</span>
                <span className={own.kind}>{dependantLabel(asDependant(tree.part, workspaceId))}</span>
              </p>
              <div className={own.sides}>
                <Side
                  side="uses"
                  title={t('Uses')}
                  empty={t('Uses nothing.')}
                  branches={tree.uses}
                  workspaceId={workspaceId}
                  onOpen={onClose}
                />
                <Side
                  side="used-by"
                  title={t('Used by')}
                  empty={t('Nothing uses this yet.')}
                  branches={tree.usedBy}
                  workspaceId={workspaceId}
                  onOpen={onClose}
                />
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
