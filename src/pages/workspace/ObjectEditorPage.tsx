import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  deleteObject,
  fetchObject,
  fetchWorkspaceObjects,
  updateObject,
  validateObject,
} from '../../api/objects';
import type { WorkflowObject } from '../../api/objects';
import type { SessionUser } from '../../api/session';
import { timeAgo } from '../../api/tools';
import fileTextIcon from '../../assets/file-text.svg';
import { AppShell } from '../../components/AppShell';
import { BackLink } from '../../components/BackLink';
import { Loader } from '../../components/Loader';
import { ObjectForm, asProperty, asRow, typeOptionsOf } from '../../components/ObjectForm';
import type { ObjectFormStyles, Row } from '../../components/ObjectForm';
import { UnsavedWorkDialog } from '../../components/UnsavedWorkDialog';
import { UsedBy } from '../../components/UsedBy';
import { ValidationStatus } from '../../components/ValidationStatus';
import type { Validation } from '../../components/ValidationStatus';
import { useLeaveGuard } from '../../components/leaveGuard';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { shellUser } from '../../session/user';
import styles from './EditorPage.module.css';
import { t } from '../../i18n';

export interface ObjectEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** Every object in the workspace fits the type picker. */
const ALL_OBJECTS = 200;

/**
 * The classes the shape's rows are drawn with here.
 *
 * A card on a page of its own; the workflow editor's panel hands the same
 * editor a column's worth instead. See `ObjectFormStyles`.
 */
const FORM_STYLES: ObjectFormStyles = {
  empty: styles.propertyEmpty,
  row: styles.propertyRow,
  main: styles.propertyMain,
  field: styles.propertyField,
  label: styles.propertyLabel,
  nameCol: styles.propertyNameCol,
  name: styles.propertyName,
  typeCol: styles.propertyTypeCol,
  holdsCol: styles.propertyHoldsCol,
  holds: styles.holds,
  holdsOption: styles.holdsOption,
  holdsOptionActive: styles.holdsOptionActive,
  actionCol: styles.propertyActionCol,
  delete: styles.propertyDelete,
  descriptionRow: styles.propertyDescriptionRow,
  description: styles.propertyDescription,
  footer: styles.editorFooter,
  add: styles.addProperty,
};

/**
 * One object: its properties on the left, what it is on the right.
 *
 * The properties are a table rather than text because they are a list of pairs,
 * and every one of them has to resolve — a type nobody can look up is the thing
 * this screen exists to prevent.
 */
export function ObjectEditorPage({ session, onSignOut }: ObjectEditorPageProps) {
  const { workspaceId = '', objectId = '' } = useParams();
  const navigate = useNavigate();

  const [held, setHeld] = useState<WorkflowObject | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  /** Everything nameable, so a property can point at another shape. */
  const [others, setOthers] = useState<WorkflowObject[]>([]);
  const [status, setStatus] = useState<Validation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [removing, setRemoving] = useState(false);

  function apply(loaded: WorkflowObject) {
    setHeld(loaded);
    setName(loaded.name);
    setDescription(loaded.description ?? '');
    setRows(loaded.properties.map(asRow));
    setSaved(true);
    setStatus(null);
  }

  useEffect(() => {
    if (objectId === '') return;
    /*
     * An answer that is no longer wanted is dropped rather than applied.
     *
     * This fills the form from what came back, so a reply landing late writes
     * the stored version over whatever is in the boxes - somebody's typing, or
     * the record they opened after this one. Nothing on screen says it
     * happened: it is the state behind the fields that is replaced, and the
     * state is what the save sends. #324, #862 and #863 were three reports of
     * it on three pages.
     */
    let abandoned = false;
    fetchObject(objectId)
      .then((loaded) => {
        if (abandoned) return;
        if (loaded === null) setLoadError(t('That object does not exist, or you do not have access to it.'));
        else apply(loaded);
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setLoadError(cause instanceof Error ? cause.message : t('Could not load the object.'));
      });
    return () => {
      abandoned = true;
    };
  }, [objectId]);

  useEffect(() => {
    if (workspaceId === '') return;
    fetchWorkspaceObjects(workspaceId, 0, ALL_OBJECTS)
      .then((page) => setOthers(page.content))
      .catch(() => setOthers([]));
  }, [workspaceId]);

  /** What a field can be one of; the same list the workflow panel offers. */
  const typeOptions = useMemo(() => typeOptionsOf(others), [others]);

  /** Anything the editor changed: unsaved, and the last check no longer applies. */
  function edited(changed: Row[]) {
    setRows(changed);
    setSaved(false);
    // The rows the last check looked at are gone, and so is what it found.
    setStatus(null);
  }

  async function handleValidate() {
    try {
      const checked = await validateObject(workspaceId, rows.map(asProperty));
      setStatus(
        checked.valid
          ? { ok: true, message: "every property's type resolves" }
          : { ok: false, message: checked.message },
      );
    } catch (cause) {
      setStatus({ ok: false, message: cause instanceof Error ? cause.message : t('Could not check the schema.'), whole: true });
    }
  }

  /**
   * Stores what is on screen, and says whether it landed.
   *
   * The answer is for `Save & Leave` in the dialog below: leaving on a save the
   * server refused - a property naming a type it cannot resolve, a row with no
   * name - is exactly the loss the whole guard exists to prevent.
   */
  async function handleSave(): Promise<boolean> {
    if (held === null || saving) return false;
    setSaving(true);
    setSaveError(null);
    try {
      apply(
        await updateObject(held.id, {
          name,
          description,
          properties: rows.map(asProperty),
        }),
      );
      // A save the server accepted has already been through the rules Validate
      // asks for - it resolves every reference on the way in and refuses the
      // rest - so this green stands on a round trip rather than on hope.
      setStatus({ ok: true, message: "every property's type resolves" });
      return true;
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t('Could not save the object.'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  /**
   * There is work on this screen the server has not been told about.
   *
   * Measured against what was loaded, not against whether anybody has typed.
   * The page keeps a `saved` flag as well - it is what lights the inline
   * "Saved." - but a flag can only ever say that a key was pressed. Somebody
   * who types a character and deletes it has changed nothing, and being asked
   * to confirm losing nothing is how a prompt teaches people to click through
   * prompts.
   *
   * The properties are compared as the payload a save would send rather than
   * row by row, because that is the only comparison that agrees with what
   * leaving would actually cost. It also means a blank row somebody added does
   * count as a change - unlike a function's or a tool's parameters, this
   * editor sends every row it has, so an unnamed one is work on its way to the
   * server and not a half-typed nothing.
   *
   * `held` is the baseline and it maintains itself: `apply` sets it on load and
   * again from what a save stored, so saving and then leaving asks nothing.
   * An object is always one that exists - there is no create route to this page
   * - so a null baseline means still loading, and there is nothing to lose yet.
   */
  const unsaved = useMemo(() => {
    if (held === null) return false;
    const sent = JSON.stringify(rows.map(asProperty));
    const was = JSON.stringify(held.properties.map(asRow).map(asProperty));
    return name.trim() !== held.name.trim() || description.trim() !== (held.description ?? '').trim() || sent !== was;
  }, [held, name, description, rows]);

  /*
   * The three ways out, and the question before any of them: a link, a Back
   * press, a closed tab. Shared with the function and tool editors, because all
   * three lose work the same way; see `useLeaveGuard`.
   */
  const guard = useLeaveGuard({
    unsaved,
    backTo: `/workspace/${workspaceId}/objects`,
    save: handleSave,
  });

  async function handleDelete() {
    if (held === null || removing) return;
    setRemoving(true);
    try {
      await deleteObject(held.id);
      navigate(`/workspace/${workspaceId}/objects`);
    } catch (cause) {
      setRemoving(false);
      // Refused while something still points at it, and the reason says which.
      setSaveError(cause instanceof Error ? cause.message : t('Could not delete the object.'));
    }
  }

  return (
    <AppShell
      title={held?.name}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<WorkspaceSidebar workspaceId={workspaceId} />}
    >
      <header className={styles.headerBlock}>
        <p className={styles.breadcrumbs}>
          <BackLink to={`/workspace/${workspaceId}/objects`} label={t('Objects')} />
          <Link className={styles.crumbLink} to={`/workspace/${workspaceId}/objects`}>
            {t('Objects')}
          </Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{held?.name ?? '…'}</span>
        </p>
        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <h1 className={styles.pageTitle}>{held?.name ?? 'Object'}</h1>
          </div>
          <div className={styles.actions}>
            {saved && saveError === null && <span className={styles.savedInline}>{t('Saved.')}</span>}
            {/*
              Beside the button it is about. It used to sit in the footer at the
              far end of a row from "+ Add Property", a control it has nothing
              to do with - see `ValidationStatus`.
            */}
            <ValidationStatus
              subject={t("The properties")}
              status={status}
              explains={
                <>
                  Validate resolves every property's type against this workspace: the built-in ones, and the
                  objects a property names. It answers whether this shape could be stored and used, and says which
                  property is the problem if it could not.
                </>
              }
            />
            <button type="button" className={styles.secondaryButton} onClick={() => void handleValidate()}>
              {t('Validate')}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSave()}
              disabled={saving || held === null}
            >
              {saving ? t('Saving…') : t('Save Changes')}
            </button>
          </div>
        </div>
      </header>

      {loadError !== null ? (
        <p className={styles.loadError} role="alert">
          {loadError}
        </p>
      ) : held === null ? (
        <Loader />
      ) : (
        <>
          {saveError !== null && (
            <p className={styles.error} role="alert">
              {saveError}
            </p>
          )}

          <div className={styles.split}>
            <section className={styles.editorCard}>
              <header className={styles.editorHeader}>
                <span className={styles.editorTitle}>
                  <img src={fileTextIcon} alt="" width={16} height={16} />
                  {t('Object Schema Definition')}
                </span>
                <span className={styles.editorBadge}>Typed Schema</span>
              </header>

              <ObjectForm
                rows={rows}
                onChange={edited}
                typeOptions={typeOptions}
                styles={FORM_STYLES}
              />
            </section>

            <aside className={styles.panel}>
              <div className={styles.panelSection}>
                <h2 className={styles.panelHeading}>Object Details</h2>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="object-name">
                    {t('Name')}
                  </label>
                  <input
                    id="object-name"
                    className={`${styles.input} ${styles.inputMono}`}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setSaved(false);
                    }}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="object-description">
                    {t('Description')}
                  </label>
                  <textarea
                    id="object-description"
                    className={styles.textarea}
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      setSaved(false);
                    }}
                    placeholder={t('What this shape is, for whoever points at it.')}
                  />
                </div>
              </div>

              {held !== null && (
                <div className={styles.metadata}>
                  <span className={styles.metadataLabel}>Last modified</span>
                  <span className={styles.metadataValue}>
                    {timeAgo(held.lastModifiedAt)} by <span className={styles.metadataWho}>{held.lastModifiedBy}</span>
                  </span>
                </div>
              )}

              {/*
                What names this shape, above the button that would take it
                away: another object holding it as a property, and any webhook
                that answers to it.
              */}
              {held !== null && (
                <div className={styles.panelSection}>
                  <UsedBy kind="OBJECT" componentId={objectId} />
                </div>
              )}

              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => void handleDelete()}
                disabled={removing || held === null}
              >
                {removing ? t('Deleting…') : t('Delete Object')}
              </button>
            </aside>
          </div>
        </>
      )}

      {/*
        Outside the branch above, so it is the same dialog whichever state the
        page is in - and so closing it never depends on what the page happens to
        be showing behind it.
      */}
      <UnsavedWorkDialog
        subject={guard.asking ? (held?.name ?? t('This object')) : null}
        creating={false}
        onStay={guard.stay}
        onLeave={guard.leave}
        onSaveAndLeave={guard.saveAndLeave}
      />
    </AppShell>
  );
}
