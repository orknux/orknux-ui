import { useCallback, useEffect, useState } from 'react';

import { fetchProviders } from '../api/models';
import { fetchSharesGiven, fetchSharesReceived, removeWorkspaceShare, shareWithWorkspace } from '../api/sharing';
import type { ShareKind, WorkspaceShare } from '../api/sharing';
import { fetchVariableCatalogs } from '../api/variables';
import { fetchWorkspaces } from '../api/workspaces';
import chevronDown12Icon from '../assets/chevron-down-12.svg';
import { t } from '../i18n';
import { FieldHint } from './FieldHint';
import table from './WorkspaceMembers.module.css';
import styles from './WorkspaceSharing.module.css';
import { Select } from './Select';

interface Choice {
  id: string;
  name: string;
}

const KINDS: ShareKind[] = ['VARIABLE_CATALOG', 'MODEL_PROVIDER'];

/** The picker's value for every workspace listed, as one press. */
const ALL = '*';

function kindName(kind: ShareKind): string {
  return kind === 'VARIABLE_CATALOG' ? t('Variable catalog') : t('Model provider');
}

/**
 * Workspace Settings > Sharing: what this workspace lends other workspaces,
 * and what they lend it.
 *
 * Lent, not copied - the borrower's agents use the one catalog or provider,
 * so what its owner changes is what they use next. And used, not seen: the
 * borrower's people still cannot open this workspace. Each change is made the
 * moment it is pressed, as an issue type is, since taking a share back takes
 * the borrower's agents off it and that is not something to leave pending
 * behind a Save.
 */
export function WorkspaceSharing({ workspaceId }: { workspaceId: string }) {
  const [given, setGiven] = useState<WorkspaceShare[] | null>(null);
  const [received, setReceived] = useState<WorkspaceShare[]>([]);
  const [catalogs, setCatalogs] = useState<Choice[]>([]);
  const [providers, setProviders] = useState<Choice[]>([]);
  const [workspaces, setWorkspaces] = useState<Choice[]>([]);
  const [kind, setKind] = useState<ShareKind>('VARIABLE_CATALOG');
  const [component, setComponent] = useState('');
  const [grantee, setGrantee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchSharesGiven(workspaceId)
      .then(setGiven)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load what is shared.')));
    fetchSharesReceived(workspaceId).then(setReceived).catch(() => setReceived([]));
  }, [workspaceId]);

  useEffect(() => {
    load();
    fetchVariableCatalogs(workspaceId)
      .then((held) => setCatalogs(held.map((one) => ({ id: one.id, name: one.name }))))
      .catch(() => setCatalogs([]));
    fetchProviders(workspaceId)
      .then((held) => setProviders(held.map((one) => ({ id: one.id, name: one.name }))))
      .catch(() => setProviders([]));
    // Only the workspaces the person here can see: a picker is no way to learn another's name.
    fetchWorkspaces(0, 200)
      .then((held) => setWorkspaces(held.content.filter((one) => one.id !== workspaceId).map((one) => ({ id: one.id, name: one.name }))))
      .catch(() => setWorkspaces([]));
  }, [workspaceId, load]);

  const choices = kind === 'VARIABLE_CATALOG' ? catalogs : providers;

  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('Could not change what is shared.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={table.card} data-testid="workspace-sharing">
      <span className={table.heading}>
        <h2 id="sharing" className={table.title}>{t('Sharing')}</h2>
        <FieldHint label={t('Sharing')}>
          {t("Lends this workspace's variable catalogs and model providers to other workspaces. Their agents use them as they are here; their people still cannot open this workspace. Taking a share back takes it from their agents at once.")}
        </FieldHint>
      </span>

      <div className={styles.add}>
        <Picker label={t('Share')} value={kind} onChange={(value) => { setKind(value as ShareKind); setComponent(''); }}>
          {KINDS.map((one) => <option key={one} value={one}>{kindName(one)}</option>)}
        </Picker>
        <Picker label={kindName(kind)} value={component} onChange={setComponent} testId="share-component">
          <option value="">{t('Choose…')}</option>
          {choices.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}
        </Picker>
        <Picker label={t('With workspace')} value={grantee} onChange={setGrantee} testId="share-workspace">
          <option value="">{t('Choose…')}</option>
          {workspaces.length > 1 && <option value={ALL}>{t('All workspaces')}</option>}
          {workspaces.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}
        </Picker>
        <button
          type="button"
          className={styles.share}
          disabled={busy || component === '' || grantee === ''}
          onClick={() => void act(async () => {
            // Every workspace listed now, one share each; one made later is shared with on its own.
            const lent = new Set((given ?? []).filter((one) => one.kind === kind && one.componentId === component).map((one) => one.granteeWorkspaceId));
            const to = grantee === ALL ? workspaces.map((one) => one.id).filter((id) => !lent.has(id)) : [grantee];
            for (const one of to) await shareWithWorkspace(workspaceId, one, kind, component);
            setComponent('');
          })}
        >
          {t('Share')}
        </button>
      </div>

      {error !== null && <p className={table.error} role="alert">{error}</p>}

      {given !== null && given.length > 0 && (
        <div className={table.tableBox}>
          <table className={table.table} data-testid="shares-given">
            <thead>
              <tr>
                <th>{t('Shared')}</th>
                <th>{t('With workspace')}</th>
                <th>{t('By')}</th>
                <th aria-label={t('Actions')} />
              </tr>
            </thead>
            <tbody>
              {given.map((share) => (
                <tr key={share.id} data-testid="share-given">
                  <td>
                    <span className={table.person}>
                      <span className={table.name}>{share.componentName ?? t('Removed')}</span>
                      <span className={table.detail}>{kindName(share.kind)}</span>
                    </span>
                  </td>
                  <td>{share.granteeWorkspaceName ?? t('Removed workspace')}</td>
                  <td className={table.through}>{share.createdBy}</td>
                  <td className={styles.actions}>
                    <button
                      type="button"
                      className={styles.unshare}
                      disabled={busy}
                      onClick={() => void act(() => removeWorkspaceShare(share.id))}
                    >
                      {t('Stop sharing')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {received.length > 0 && (
        <div className={table.tableBox}>
          <table className={table.table} data-testid="shares-received">
            <thead>
              <tr>
                <th>{t('Shared with this workspace')}</th>
                <th>{t('From workspace')}</th>
              </tr>
            </thead>
            <tbody>
              {received.map((share) => (
                <tr key={share.id} data-testid="share-received">
                  <td>
                    <span className={table.person}>
                      <span className={table.name}>{share.componentName ?? t('Removed')}</span>
                      <span className={table.detail}>{kindName(share.kind)}</span>
                    </span>
                  </td>
                  <td>{share.ownerWorkspaceName ?? t('Removed workspace')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Picker({ label, value, onChange, children, testId }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={table.pickerBox}>
        <Select className={table.picker} value={value} onChange={(picked) => onChange(picked)} data-testid={testId} chevron={false}>
          {children}
        </Select>
        <img className={table.chevron} src={chevronDown12Icon} alt="" width={12} height={12} />
      </span>
    </label>
  );
}
