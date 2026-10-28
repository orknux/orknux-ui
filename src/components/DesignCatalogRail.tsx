import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { createDesignCatalog, deleteDesignCatalog, fetchDesignCatalogs, renameDesignCatalog } from '../api/designCatalogs';
import type { DesignCatalog, DesignCatalogKind } from '../api/designCatalogs';
import folderOpenIcon from '../assets/folder-open.svg';
import folderIcon from '../assets/folder.svg';
import penIcon from '../assets/pen.svg';
import plusIcon from '../assets/plus.svg';
import trashIcon from '../assets/trash-grey.svg';
import { t, tf } from '../i18n';
import rail from '../pages/workspace/WorkspaceMemoryPage.module.css';
import { CatalogNameDialog } from './CatalogNameDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { Loader } from './Loader';

/** The rail's own row for every catalog at once; not a catalog id. */
export const ALL_CATALOGS = 'all';

/**
 * A workspace's catalogs of one kind, and which one is being looked at - kept
 * in the address as `?catalog=`, so a link opens the page at a catalog.
 *
 * [fileIn] is where something new goes: the catalog being looked at, or the
 * workspace's default while every catalog is shown - never nowhere, so nobody
 * has to choose a catalog to make anything.
 */
export function useDesignCatalogs(workspaceId: string, kind: DesignCatalogKind) {
  const [catalogs, setCatalogs] = useState<DesignCatalog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useSearchParams();
  const selected = address.get('catalog') ?? ALL_CATALOGS;

  const reload = useCallback(async () => {
    if (workspaceId === '') return;
    try {
      setCatalogs(await fetchDesignCatalogs(workspaceId, kind));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not load the catalogs.'));
    }
  }, [workspaceId, kind]);
  useEffect(() => {
    setCatalogs(null);
    void reload();
  }, [reload]);

  const select = useCallback(
    (id: string) =>
      setAddress(
        (held) => {
          const next = new URLSearchParams(held);
          if (id === ALL_CATALOGS) next.delete('catalog');
          else next.set('catalog', id);
          return next;
        },
        { replace: true },
      ),
    [setAddress],
  );

  const current = catalogs?.find((one) => one.id === selected) ?? null;
  const fileIn = current?.id ?? catalogs?.find((one) => one.isDefault)?.id ?? null;
  /** The catalog asked for, or every one: an address naming a catalog that is gone shows them all. */
  const filter = selected === ALL_CATALOGS || (catalogs !== null && current === null) ? null : selected;
  return { catalogs, error, selected, select, current, fileIn, filter, reload };
}

export interface DesignCatalogRailProps {
  workspaceId: string;
  kind: DesignCatalogKind;
  catalogs: DesignCatalog[] | null;
  selected: string;
  onSelect: (id: string) => void;
  /** Read again after a catalog is made. */
  onChanged: () => Promise<void> | void;
  /** "IMAGE CATALOGS". */
  title: string;
  /** "All images". */
  allLabel: string;
  allIcon: string;
  /** What the rail holds under its title: the page's own search, where it has one. */
  children?: ReactNode;
}

/**
 * The column of catalogs down the left of a Design list - images, wireframes,
 * videos - as Documents and Memory draw theirs: every catalog at once first,
 * then each with what it holds, and a + to make another. One component for the
 * three pages, because they are one page over three kinds of thing.
 */
export function DesignCatalogRail(props: DesignCatalogRailProps) {
  const { workspaceId, kind, catalogs, selected, onSelect } = props;
  const [making, setMaking] = useState(false);
  const total = catalogs?.reduce((sum, one) => sum + one.count, 0);

  return (
    <aside className={rail.catalogs} data-testid="design-catalogs" data-kind={kind}>
      <header className={rail.catalogsHeader}>
        <p className={rail.catalogsTitle}>{props.title}</p>
        <button
          type="button"
          className={rail.newCatalog}
          onClick={() => setMaking(true)}
          aria-label={t('New catalog')}
          title={t('New catalog')}
          data-testid="new-design-catalog"
        >
          <img src={plusIcon} alt="" width={10} height={10} />
        </button>
      </header>

      {props.children}

      <div className={rail.catalogsList}>
        <button
          type="button"
          className={selected === ALL_CATALOGS ? rail.catalogCurrent : rail.catalog}
          onClick={() => onSelect(ALL_CATALOGS)}
          aria-current={selected === ALL_CATALOGS ? 'true' : undefined}
          data-testid="design-catalog-row"
          data-catalog={ALL_CATALOGS}
        >
          <img src={props.allIcon} alt="" width={14} height={14} />
          <span className={rail.catalogName}>{props.allLabel}</span>
          <span className={selected === ALL_CATALOGS ? rail.countCurrent : rail.count}>{total ?? ''}</span>
        </button>
        {catalogs === null && (
          <p className={rail.sidebarNote}>
            <Loader />
          </p>
        )}
        {catalogs?.map((catalog) => {
          const open = catalog.id === selected;
          return (
            <button
              key={catalog.id}
              type="button"
              className={open ? rail.catalogCurrent : rail.catalog}
              onClick={() => onSelect(catalog.id)}
              aria-current={open ? 'true' : undefined}
              data-testid="design-catalog-row"
              data-catalog={catalog.name}
              data-default={catalog.isDefault ? 'true' : undefined}
            >
              <img src={open ? folderOpenIcon : folderIcon} alt="" width={14} height={14} />
              <span className={rail.catalogName}>{catalog.name}</span>
              <span className={open ? rail.countCurrent : rail.count} data-testid="design-catalog-count">
                {catalog.count}
              </span>
            </button>
          );
        })}
      </div>

      <CatalogNameDialog
        open={making}
        title={t('New catalog')}
        message={t('Anything new made here is filed in the catalog being looked at.')}
        submitLabel={t('Create')}
        initialName=""
        onClose={() => setMaking(false)}
        onSubmit={async (name) => {
          const made = await createDesignCatalog(workspaceId, kind, name);
          setMaking(false);
          await props.onChanged();
          onSelect(made.id);
        }}
      />
    </aside>
  );
}

export interface DesignCatalogActionsProps {
  workspaceId: string;
  kind: DesignCatalogKind;
  /** The catalog being looked at; nothing is drawn while every catalog is. */
  current: DesignCatalog | null;
  onChanged: () => Promise<void> | void;
  /** After the catalog being looked at is deleted: every catalog is shown again. */
  onDeleted: () => void;
}

/**
 * Rename and delete for the catalog being looked at, beside its name. Delete is
 * not offered for the default, which is where anything not filed elsewhere is;
 * one that still holds anything is refused by the server, in its words.
 */
export function DesignCatalogActions({ workspaceId, kind, current, onChanged, onDeleted }: DesignCatalogActionsProps) {
  const [renaming, setRenaming] = useState<DesignCatalog | null>(null);
  const [removing, setRemoving] = useState<DesignCatalog | null>(null);
  if (current === null) return null;
  return (
    <div className={rail.catalogActions}>
      <button
        type="button"
        className={rail.iconButton}
        onClick={() => setRenaming(current)}
        aria-label={tf('Rename {name}', { name: current.name })}
        title={t('Rename')}
        data-testid="rename-design-catalog"
      >
        <img src={penIcon} alt="" width={14} height={14} />
      </button>
      {!current.isDefault && (
        <button
          type="button"
          className={rail.iconButton}
          onClick={() => setRemoving(current)}
          aria-label={tf('Delete {name}', { name: current.name })}
          title={t('Delete')}
          data-testid="delete-design-catalog"
        >
          <img src={trashIcon} alt="" width={14} height={14} />
        </button>
      )}

      <CatalogNameDialog
        open={renaming !== null}
        title={t('Rename the catalog')}
        message={t('Anything new made here is filed in the catalog being looked at.')}
        submitLabel={t('Rename')}
        initialName={renaming?.name ?? ''}
        onClose={() => setRenaming(null)}
        onSubmit={async (name) => {
          if (renaming === null) return;
          await renameDesignCatalog(workspaceId, kind, renaming.id, name);
          setRenaming(null);
          await onChanged();
        }}
      />
      <ConfirmDialog
        subject={removing?.name ?? null}
        kind="removeDesignCatalog"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing === null) return;
          await deleteDesignCatalog(workspaceId, kind, removing.id);
          setRemoving(null);
          onDeleted();
          await onChanged();
        }}
      />
    </div>
  );
}
