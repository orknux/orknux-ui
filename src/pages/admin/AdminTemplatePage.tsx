import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { SessionUser } from '../../api/session';
import type { ComponentTemplate } from '../../api/templates';
import {
  contentsSummary,
  createComponentTemplate,
  deleteComponentTemplate,
  fetchComponentTemplate,
  fetchTemplateEnvelope,
  updateComponentTemplate,
} from '../../api/templates';
import { KIND_LABEL, saveJson } from '../../api/transfer';
import { AdminSidebar } from '../../components/AdminSidebar';
import { AppShell } from '../../components/AppShell';
import { DiscardButton, SaveBar } from '../../components/SaveBar';
import { useDirty } from '../../components/useDirty';
import { BackLink } from '../../components/BackLink';
import { FieldHint } from '../../components/FieldHint';
import { Loader } from '../../components/Loader';
import { shellUser } from '../../session/user';
import styles from './AdminTemplatePage.module.css';
import { t } from '../../i18n';
import { zoned } from '../../session/timeZone';

export interface AdminTemplatePageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * One template: published here for the first time, or edited here afterwards.
 *
 * The same shape as the other admin forms — one form for adding and editing, and a
 * danger zone for removing the thing — because it is the same kind of screen.
 * What is particular to a template is that its *contents* are read-only. A
 * template holds an exported file and nothing else, so the edits it has are its
 * name, its description, and replacing that file wholesale; a screen that let
 * somebody take one component out of an envelope would be a second exporter,
 * and the moment there were two the file would stop being the thing that
 * decided what a template holds.
 *
 * Replacing is also the only way a template moves on, which the page says out
 * loud. Everybody who sees a named thing beside the thing it was made from
 * assumes the two follow each other. These do not.
 */
function AdminTemplateView({ session, onSignOut, onDiscard }: AdminTemplatePageProps & { onDiscard: () => void }) {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const adding = templateId === undefined;
  const fileRef = useRef<HTMLInputElement>(null);

  const [template, setTemplate] = useState<ComponentTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  /** The uploaded file: required when publishing, "replace it" when editing. */
  const [envelope, setEnvelope] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (templateId === undefined) return;
    let current = true;
    fetchComponentTemplate(templateId)
      .then((found) => {
        if (!current) return;
        if (found === null) {
          setLoadError(t('That template no longer exists.'));
          return;
        }
        setTemplate(found);
        setName(found.name);
        setDescription(found.description ?? '');
      })
      .catch((cause: unknown) => {
        if (current) setLoadError(cause instanceof Error ? cause.message : t('Could not load the template.'));
      });
    return () => {
      current = false;
    };
  }, [templateId]);

  const complete = name.trim() !== '' && (!adding || envelope !== null);

  async function chosen(file: File | undefined) {
    if (file === undefined) return;
    setFileName(file.name);
    setEnvelope(await file.text());
    setError(null);
    // A name worth suggesting, once, and only where there is nothing to lose.
    if (name.trim() === '') setName(file.name.replace(/\.orkx\.json$|\.json$/, ''));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || saving) return;
    setSaving(true);
    setError(null);

    const input = {
      name: name.trim(),
      description: description.trim() === '' ? null : description.trim(),
      // Absent means "leave the stored file alone", which is what somebody
      // fixing a typo in a description expects. Only a chosen file replaces one.
      ...(envelope === null ? {} : { envelope }),
    };

    try {
      if (adding) {
        const made = await createComponentTemplate(input);
        navigate(`/admin/templates/${made.id}`);
      } else {
        const updated = await updateComponentTemplate(templateId, input);
        setTemplate(updated);
        setEnvelope(null);
        setFileName('');
        if (fileRef.current !== null) fileRef.current.value = '';
        setSaving(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the template.'));
      setSaving(false);
    }
  }

  async function handleDownload() {
    if (templateId === undefined || template === null) return;
    setError(null);
    try {
      saveJson(`${template.name.replace(/[^\w-]/g, '-')}.orkx.json`, await fetchTemplateEnvelope(templateId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not download it.'));
    }
  }

  async function handleDelete() {
    if (templateId === undefined || saving) return;
    setSaving(true);
    setError(null);
    try {
      await deleteComponentTemplate(templateId);
      navigate('/admin/templates');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not delete the template.'));
      setSaving(false);
    }
  }

  const called = adding ? t('New Template') : (template?.name ?? '…');

  /*
   * Whether there is anything to save: what the fields would send, against
   * what the page last agreed with the server. Save and Discard are off while
   * there is not.
   */
  const changed = useDirty({ name, description, envelope: envelope === null ? null : fileName }, [template]);

  return (
    <AppShell
      scrollContent
      title={adding ? t('New template') : template?.name}
      user={shellUser(session)}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={<AdminSidebar active="templates" />}
    >
      <header className={styles.headerBlock}>
        <p className={styles.breadcrumbs}>
          <BackLink to="/admin/templates" label={t('Templates')} />
          <Link className={styles.crumbLink} to="/admin/templates">{t('Templates')}</Link>
          <span className={styles.crumbSeparator}>/</span>
          <span className={styles.crumbCurrent}>{called}</span>
        </p>
        <h1 className={styles.pageTitle}>{called}</h1>
        <p className={styles.subtitle}>
          {t('An exported component, published for every workspace on this installation. It holds a copy taken when the file was uploaded and follows nothing: editing what it was made from does not change it, and replacing the file here is what brings it up to date.')}
        </p>
      </header>

      {loadError !== null ? (
        <section className={styles.card}>
          <p className={styles.loadError} role="alert">
            {loadError}
          </p>
          <Link className={styles.crumbLink} to="/admin/templates">{t('Back to Templates')}</Link>
        </section>
      ) : !adding && template === null ? (
        <section className={styles.card}>
          <Loader />
        </section>
      ) : (
        <form id="template-form" className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t('Template')}</h2>
            <div className={styles.divider} />

            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="template-name">
                  Name <span className={styles.required}>*</span>
                </label>
                <FieldHint label={t('Name')}>
                  {t('What it is called everywhere it is offered, and unique across this installation.')}
                </FieldHint>
              </span>
              <input
                id="template-name"
                className={styles.input}
                type="text"
                placeholder={t('e.g. Order handling')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                autoFocus
                required
              />
            </div>

            <div className={styles.field}>
              <span className={styles.labelWithHint}>
                <label className={styles.label} htmlFor="template-description">
                  {t('Description')}
                </label>
                <FieldHint label={t('Description')}>
                  {t('A template with a name and nothing else is a row people scroll past. Say what it does and what somebody has to have already.')}
                </FieldHint>
              </span>
              <textarea
                id="template-description"
                className={`${styles.input} ${styles.textarea}`}
                placeholder={t('What it is for, and when somebody would reach for it')}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              <span className={styles.labelWithHint}>
                {adding ? 'File' : t('What is inside')}
                <FieldHint label={t('File')}>
                  The JSON an Export control downloads. It is read before anything is saved, so a
                  file this installation cannot read is refused here rather than at the button
                  somebody presses later.
                  {!adding && (
                    <>
                      {' '}
                      Uploading one replaces what this template holds. Workspaces that already used
                      it keep what they took: a template is a copy, and this changes what the next
                      one gets.
                    </>
                  )}
                </FieldHint>
              </span>
            </h2>
            <div className={styles.divider} />

            {!adding && template !== null && (
              <>
                {template.usable ? (
                  <>
                    <ul className={styles.contents}>
                      {template.contents.map((held) => (
                        <li className={styles.content} key={`${held.kind}:${held.name}`}>
                          <span className={styles.contentKind}>{KIND_LABEL[held.kind]}</span>
                          <span className={styles.contentName}>{held.name}</span>
                        </li>
                      ))}
                      {/* A template of models holds no components; what it holds is its models, each with its provider. */}
                      {template.ofModels && template.models.map((model) => (
                        <li className={styles.content} key={`model:${model}`} data-template-model="">
                          <span className={styles.contentKind}>{t('Model')}</span>
                          <span className={styles.contentName}>{model}</span>
                        </li>
                      ))}
                      {/* And a template of integrations holds connections and MCP servers, without their credentials. */}
                      {template.ofIntegrations && template.connections.map((name) => (
                        <li className={styles.content} key={`connection:${name}`} data-template-connection="">
                          <span className={styles.contentKind}>{t('Connection')}</span>
                          <span className={styles.contentName}>{name}</span>
                        </li>
                      ))}
                      {template.ofIntegrations && template.mcpServers.map((name) => (
                        <li className={styles.content} key={`server:${name}`} data-template-mcp-server="">
                          <span className={styles.contentKind}>{t('MCP server')}</span>
                          <span className={styles.contentName}>{name}</span>
                        </li>
                      ))}
                    </ul>
                    <p className={styles.meta}>
                      <span>{contentsSummary(template)}</span>
                      <span>Format version {template.formatVersion}</span>
                      {template.producedBy !== null && <span>From {template.producedBy}</span>}
                      <span>
                        Published by {template.createdBy} on {new Date(template.createdAt).toLocaleDateString(undefined, zoned())}
                      </span>
                    </p>
                  </>
                ) : (
                  /*
                    A file this installation cannot read - which is what a
                    rollback past the format version it was written under looks
                    like from here. The refusal is the format's own sentence,
                    naming both versions, rather than a stack trace.
                  */
                  <p className={styles.problem} role="alert">
                    {template.problem}
                  </p>
                )}
              </>
            )}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="template-file">
                {adding ? (
                  <>
                    Exported file <span className={styles.required}>*</span>
                  </>
                ) : (
                  t('Replace the file')
                )}
              </label>
              <input
                ref={fileRef}
                id="template-file"
                className={styles.hiddenInput}
                type="file"
                accept="application/json,.json"
                onChange={(event) => void chosen(event.target.files?.[0])}
              />
              <div className={styles.buttons}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => fileRef.current?.click()}
                  disabled={saving}
                >{t('Choose a file')}</button>
                {!adding && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void handleDownload()}
                    disabled={saving}
                  >{t('Download')}</button>
                )}
              </div>
              {fileName !== '' && <p className={styles.fileName}>{fileName}</p>}
            </div>
          </section>

          {/* Floating at the foot of the window, above the AI button. Drawn into the body, so the button names its form. */}
          <SaveBar>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/admin/templates')}
              disabled={saving}
            >{t('Cancel')}</button>
            <DiscardButton onDiscard={onDiscard} disabled={saving || !changed} />
            <button type="submit" form="template-form" className={styles.primaryButton} disabled={!complete || saving || !changed}>
              {saving ? t('Saving…') : adding ? t('Publish Template') : t('Save Changes')}
            </button>
          </SaveBar>

          {error !== null && (
            <p className={styles.loadError} role="alert">
              {error}
            </p>
          )}
        </form>
      )}

      {!adding && loadError === null && template !== null && (
        <section className={styles.dangerCard}>
          <h2 className={styles.dangerHeading}>{t('Danger Zone')}</h2>
          <div className={styles.divider} />
          <div className={styles.dangerRow}>
            <div className={styles.dangerText}>
              <span className={styles.dangerTitle}>{t('Delete Template')}</span>
              <span className={styles.dangerNote}>
                {confirmingDelete
                  ? `Delete ${template.name}? Nothing any workspace took from it is touched — those are copies of their own.`
                  : t('Take it off the list. What it has already created stays where it is')}
              </span>
            </div>
            {confirmingDelete ? (
              <div className={styles.buttons}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setConfirmingDelete(false)}
                  disabled={saving}
                >{t('Keep')}</button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => void handleDelete()}
                  disabled={saving}
                >
                  {saving ? t('Deleting…') : t('Delete Template')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >{t('Delete Template')}</button>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}

/**
 * The page, started over by Discard.
 *
 * Discard puts every field back to what the server holds. This page keeps
 * its drafts across many fields and sections, so rather than a second copy
 * of the code that fills them, the page is drawn again from the start and
 * fills them the one way it always does - a round trip, which is the price
 * of there being one way.
 */
export function AdminTemplatePage(props: AdminTemplatePageProps) {
  const [discards, setDiscards] = useState(0);
  return <AdminTemplateView key={discards} {...props} onDiscard={() => setDiscards((held) => held + 1)} />;
}
