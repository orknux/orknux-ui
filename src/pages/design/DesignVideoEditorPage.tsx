import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { fetchWorkspaceArtifact, fetchWorkspaceArtifacts } from '../../api/artifacts';
import type { Artifact } from '../../api/artifacts';
import { fetchModels } from '../../api/models';
import type { Model } from '../../api/models';
import type { SessionUser } from '../../api/session';
import {
  fetchDesignVideo,
  fetchVideoSettings,
  onTheWay,
  playable,
  queueDesignVideo,
  removeDesignVideo,
  stopDesignVideo,
} from '../../api/videos';
import type { DesignVideo, VideoSetting, VideoSettingName } from '../../api/videos';
import { AppShell } from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { Select } from '../../components/Select';
import { shellUser } from '../../session/user';
import form from '../../components/Dialog.module.css';
import editor from './DesignImageEditorPage.module.css';
import styles from './DesignVideos.module.css';
import { playingTime } from './DesignVideosPage';
import { t, tf } from '../../i18n';

export interface DesignVideoEditorPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** A fresh page for each video and for New: everything on it is read again from the server. */
export function DesignVideoEditorRoute(props: DesignVideoEditorPageProps) {
  const { videoId } = useParams();
  return <DesignVideoEditorPage key={videoId ?? 'new'} {...props} />;
}

/** How often a video on its way is asked about. */
const ASK_EVERY_MS = 2000;

/** How many of the workspace's pictures are offered to start from. */
const PICTURES = 48;

/** What each setting is called beside its box. */
function labelOf(name: VideoSettingName): string {
  switch (name) {
    case 'seconds':
      return t('Length (seconds)');
    case 'size':
      return t('Size');
    case 'frames':
      return t('Frames');
    case 'fps':
      return t('Frames per second');
    case 'width':
      return t('Width');
    case 'height':
      return t('Height');
    case 'seed':
      return t('Seed');
    case 'startImage':
      return t('Start from a picture');
  }
}

/**
 * Where a video is made: what it shows, and beside it what the video is made
 * from - the prompt, the model, and the settings that model takes.
 *
 * Laid out as the image editor is, at the workflow editor's level, because this
 * is where the work is. Only the settings the chosen model's server says it
 * takes are drawn, and only those are sent: a box for a setting the model
 * ignores would be a promise it does not keep.
 *
 * Generate queues and answers at once, and the address moves to the video, so
 * a reload - or coming back an hour later - finds it where it was: on its way
 * with how far it has got, or made and playing. `?from=` on New is a picture to
 * start from, which is what Convert to video on Images opens.
 */
export function DesignVideoEditorPage({ session, onSignOut }: DesignVideoEditorPageProps) {
  const { workspaceId = '', videoId } = useParams();
  const navigate = useNavigate();
  const [searching] = useSearchParams();
  const from = searching.get('from');

  const [video, setVideo] = useState<DesignVideo | null>(null);
  const [models, setModels] = useState<Model[] | null>(null);
  const [modelId, setModelId] = useState('');
  const [settings, setSettings] = useState<VideoSetting[] | null>(null);
  const [settingsReason, setSettingsReason] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [asked, setAsked] = useState<Partial<Record<VideoSettingName, string>>>({});
  const [start, setStart] = useState<Artifact | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [pictures, setPictures] = useState<Artifact[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The workspace's video models.
  useEffect(() => {
    if (workspaceId === '') return;
    fetchModels(workspaceId)
      .then((all) => setModels(all.filter((one) => one.kind === 'VIDEO' && one.enabled)))
      .catch(() => setModels([]));
  }, [workspaceId]);

  // The video opened, and what it was asked with.
  useEffect(() => {
    if (videoId === undefined || workspaceId === '') return;
    let left = false;
    fetchDesignVideo(workspaceId, videoId)
      .then((found) => {
        if (left || found === null) return;
        setVideo(found);
        setPrompt(found.prompt);
        if (found.modelId !== null) setModelId(found.modelId);
        setAsked({
          seconds: found.seconds?.toString(),
          size: found.size ?? undefined,
          frames: found.frames?.toString(),
          fps: found.fps?.toString(),
          width: found.width?.toString(),
          height: found.height?.toString(),
          seed: found.seed ?? undefined,
        });
        if (found.startImageId !== null) {
          void fetchWorkspaceArtifact(workspaceId, found.startImageId).then((picture) => {
            if (!left) setStart(picture);
          });
        }
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not load the video.')));
    return () => {
      left = true;
    };
  }, [videoId, workspaceId]);

  // A picture to start from, named in the address: Convert to video.
  useEffect(() => {
    if (from === null || videoId !== undefined || workspaceId === '') return;
    let left = false;
    fetchWorkspaceArtifact(workspaceId, from)
      .then((picture) => {
        if (left || picture === null) return;
        setStart(picture);
        if (prompt === '') setPrompt(picture.prompt);
      })
      .catch(() => undefined);
    return () => {
      left = true;
    };
  }, [from, videoId, workspaceId]);

  // The model asked with when it is still here; otherwise the first - one that starts from a picture, where one is held.
  useEffect(() => {
    if (models === null) return;
    setModelId((held) => (models.some((one) => one.id === held) ? held : (models[0]?.id ?? '')));
  }, [models]);

  // What the model takes, asked of its server; what it does not take is let go.
  useEffect(() => {
    if (modelId === '' || workspaceId === '') {
      setSettings(null);
      return;
    }
    let left = false;
    setSettings(null);
    setSettingsReason(null);
    fetchVideoSettings(workspaceId, modelId)
      .then((answer) => {
        if (left) return;
        setSettings(answer.settings);
        setSettingsReason(answer.reason);
        const taken = new Set(answer.settings.map((one) => one.name));
        setAsked((held) =>
          Object.fromEntries(Object.entries(held).filter(([name, value]) => taken.has(name as VideoSettingName) && value !== undefined)),
        );
      })
      .catch((cause: unknown) => {
        if (left) return;
        setSettings([]);
        setSettingsReason(cause instanceof Error ? cause.message : null);
      });
    return () => {
      left = true;
    };
  }, [modelId, workspaceId]);

  // Convert to video: a model that starts from a picture is chosen over one that does not, once each is known.
  const [triedForStart, setTriedForStart] = useState<string[]>([]);
  useEffect(() => {
    if (from === null || videoId !== undefined || models === null || settings === null) return;
    if (settings.some((one) => one.name === 'startImage')) return;
    const next = models.find((one) => one.id !== modelId && !triedForStart.includes(one.id));
    if (next === undefined) return;
    setTriedForStart((held) => [...held, modelId]);
    setModelId(next.id);
  }, [from, videoId, models, settings, modelId, triedForStart]);

  const takesStart = settings?.some((one) => one.name === 'startImage') ?? false;
  const numbers = useMemo(() => (settings ?? []).filter((one) => one.kind === 'NUMBER'), [settings]);
  const choices = useMemo(() => (settings ?? []).filter((one) => one.kind === 'CHOICE'), [settings]);
  const sized = numbers.some((one) => one.name === 'width') && numbers.some((one) => one.name === 'height');

  // A video on its way is asked about until it is made, has failed or was stopped.
  const waiting = video !== null && onTheWay(video);
  useEffect(() => {
    if (!waiting || video === null) return;
    const ask = window.setInterval(() => {
      fetchDesignVideo(workspaceId, video.id)
        .then((now) => {
          if (now !== null) setVideo(now);
        })
        .catch(() => undefined);
    }, ASK_EVERY_MS);
    return () => window.clearInterval(ask);
  }, [waiting, video?.id, workspaceId]);

  // The workspace's pictures, once somebody asks to choose one.
  useEffect(() => {
    if (!choosing || pictures !== null || workspaceId === '') return;
    fetchWorkspaceArtifacts(workspaceId, 0, PICTURES, '', false)
      .then((page) => setPictures(page.content.filter((one) => one.contentType.startsWith('image/'))))
      .catch(() => setPictures([]));
  }, [choosing, pictures, workspaceId]);

  const numberOf = (name: VideoSettingName): number | null => {
    const typed = asked[name]?.trim() ?? '';
    return typed === '' ? null : Number(typed);
  };

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (prompt.trim() === '' || modelId === '' || busy || settings === null) return;
    const taken = new Set(settings.map((one) => one.name));
    setBusy(true);
    setError(null);
    try {
      const queued = await queueDesignVideo({
        workspaceId,
        modelId,
        prompt: prompt.trim(),
        // Only what the model takes; a box not drawn sends nothing.
        seconds: taken.has('seconds') ? numberOf('seconds') : null,
        size: taken.has('size') ? asked.size || null : null,
        frames: taken.has('frames') ? numberOf('frames') : null,
        fps: taken.has('fps') ? numberOf('fps') : null,
        width: taken.has('width') ? numberOf('width') : null,
        height: taken.has('height') ? numberOf('height') : null,
        seed: taken.has('seed') ? asked.seed?.trim() || null : null,
        startImageId: taken.has('startImage') ? (start?.id ?? null) : null,
      });
      // At its own address from now on, so a reload finds it.
      navigate(`/workspace/${workspaceId}/design/videos/${queued.id}`, { replace: videoId === undefined });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not queue the video.'));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (video === null || busy) return;
    setBusy(true);
    try {
      setVideo(await stopDesignVideo(workspaceId, video.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not stop it.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (video === null || busy) return;
    setBusy(true);
    try {
      await removeDesignVideo(workspaceId, video.id);
      navigate(`/workspace/${workspaceId}/design/videos`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not remove the video.'));
      setBusy(false);
    }
  }

  const numberField = (one: VideoSetting) => (
    <input
      id={`video-${one.name}`}
      className={`${form.input} ${form.inputMono}`}
      type="number"
      min={one.least ?? undefined}
      max={one.most ?? undefined}
      step={1}
      placeholder={one.preset ?? t('Model default')}
      aria-label={labelOf(one.name)}
      value={asked[one.name] ?? ''}
      onChange={(event) => setAsked({ ...asked, [one.name]: event.target.value })}
      data-testid={`video-${one.name}`}
    />
  );

  return (
    <AppShell
      title={t('Video editor')}
      user={shellUser(session)}
      workspacePath={`/workspace/${workspaceId}`}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={null}
      hideSidebar
      fills
    >
      <div className={editor.toolbar} data-testid="video-toolbar">
        <button type="button" className={editor.back} onClick={() => navigate(`/workspace/${workspaceId}/design/videos`)} data-testid="video-back">
          ← {t('Videos')}
        </button>
        <span className={editor.toolbarTitle} title={video?.prompt} data-testid="video-name">
          {video?.name ?? t('New video')}
        </span>
        <div className={editor.toolbarRight}>
          {video?.status === 'DONE' && video.url !== null && (
            <a className={`${form.ghost} ${styles.download}`} href={video.url} download={video.name} data-testid="video-download">
              {t('Download')}
            </a>
          )}
          {video !== null && video.status !== 'GENERATING' && (
            <button type="button" className={form.ghost} onClick={() => void remove()} disabled={busy} data-testid="video-remove">
              {t('Remove')}
            </button>
          )}
          <Link className={form.ghost} style={{ textDecoration: 'none' }} to={`/workspace/${workspaceId}/design/videos/new`} data-testid="video-new">
            {t('New')}
          </Link>
        </div>
      </div>

      <div className={editor.editor}>
        <div className={editor.canvas} data-testid="video-canvas">
          <div className={editor.stage}>
            {video === null ? (
              start !== null ? (
                <img src={start.url} alt={start.prompt} className={editor.picture} data-testid="video-start-shown" />
              ) : (
                <p className={editor.empty}>{t('Describe a video on the right and generate it.')}</p>
              )
            ) : onTheWay(video) ? (
              <div className={styles.making} data-testid="video-making">
                {video.startImageUrl !== null && <img src={video.startImageUrl} alt="" className={styles.startShown} />}
                <Loader
                  label={
                    video.status === 'QUEUED'
                      ? (video.ahead ?? 0) > 0
                        ? tf('Queued, {ahead} ahead…', { ahead: video.ahead ?? 0 })
                        : t('Queued')
                      : video.progress !== null && video.progress > 0
                        ? tf('Making… {progress}%', { progress: video.progress })
                        : t('Making…')
                  }
                  delay={0}
                  size={72}
                />
                <div
                  className={styles.bar}
                  role="progressbar"
                  aria-label={t('How far it has got')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={video.progress ?? 0}
                  data-testid="video-progress"
                >
                  <div className={styles.barFill} style={{ width: `${video.progress ?? 0}%` }} />
                </div>
                <button type="button" className={`${form.ghost} ${editor.stop}`} onClick={() => void stop()} disabled={busy} data-testid="video-stop">
                  {t('Stop')}
                </button>
              </div>
            ) : video.status === 'FAILED' ? (
              <p className={editor.failed} role="alert" data-testid="video-failed">
                {tf('Not made: {reason}', { reason: video.reason ?? t('the model gave no reason') })}
              </p>
            ) : video.status === 'STOPPED' ? (
              <p className={editor.stopped} role="status" data-testid="video-stopped">
                {t('Stopped')}
              </p>
            ) : video.url !== null && playable(video) ? (
              <video
                src={video.url}
                poster={video.posterUrl ?? undefined}
                className={styles.player}
                controls
                playsInline
                data-testid="video-player"
              />
            ) : video.url !== null ? (
              <img src={video.url} alt={video.prompt} className={styles.player} data-testid="video-player" />
            ) : null}
          </div>
        </div>

        <form className={editor.panel} onSubmit={generate} data-testid="video-panel">
          <div className={form.field}>
            <label className={form.label} htmlFor="video-prompt">{t('Prompt')}</label>
            <div className={`${form.inputWrapper} ${form.inputWrapperTall}`}>
              <textarea
                id="video-prompt"
                className={`${form.input} ${form.textarea} ${editor.prompt}`}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t('What the video should show')}
                autoFocus={videoId === undefined}
                data-testid="video-prompt"
              />
            </div>
          </div>

          <div className={form.field}>
            <label className={form.label} htmlFor="video-model">{t('Model')}</label>
            <div className={form.inputWrapper}>
              <Select
                id="video-model"
                className={`${form.input} ${form.select}`}
                value={modelId}
                onChange={setModelId}
                disabled={models === null || models.length === 0}
                data-testid="video-model"
              >
                {models !== null && models.length === 0 && <option value="">{t('This workspace has no video model')}</option>}
                {(models ?? []).map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name} · {one.providerName}
                  </option>
                ))}
              </Select>
            </div>
            {models !== null && models.length === 0 && (
              <Link className={editor.configureLink} to={`/workspace/${workspaceId}/models`} data-testid="video-models-link">
                {t('Add a video model in Models')}
              </Link>
            )}
            {settingsReason !== null && (
              <p className={form.error} role="alert" data-testid="video-settings-reason">
                {settingsReason}
              </p>
            )}
          </div>

          {choices.map((one) => (
            <div key={one.name} className={form.field} data-testid={`video-field-${one.name}`}>
              <label className={form.label} htmlFor={`video-${one.name}`}>{labelOf(one.name)}</label>
              <div className={form.inputWrapper}>
                <Select
                  id={`video-${one.name}`}
                  className={`${form.input} ${form.select}`}
                  value={asked[one.name] ?? ''}
                  onChange={(picked) => setAsked({ ...asked, [one.name]: picked })}
                  data-testid={`video-${one.name}`}
                >
                  <option value="">{t('Model default')}</option>
                  {one.choices.map((choice) => (
                    <option key={choice} value={choice}>{choice}</option>
                  ))}
                </Select>
              </div>
            </div>
          ))}

          {sized && (
            <div className={form.field} data-testid="video-field-size">
              <label className={form.label} htmlFor="video-width">{t('Size')}</label>
              <div className={editor.sides}>
                <div className={form.inputWrapper}>{numberField(numbers.find((one) => one.name === 'width') as VideoSetting)}</div>
                <span aria-hidden="true">×</span>
                <div className={form.inputWrapper}>{numberField(numbers.find((one) => one.name === 'height') as VideoSetting)}</div>
              </div>
            </div>
          )}

          {numbers
            .filter((one) => !(sized && (one.name === 'width' || one.name === 'height')))
            .map((one) => (
              <div key={one.name} className={form.field} data-testid={`video-field-${one.name}`}>
                <label className={form.label} htmlFor={`video-${one.name}`}>{labelOf(one.name)}</label>
                <div className={form.inputWrapper}>{numberField(one)}</div>
              </div>
            ))}

          {takesStart && (
            <div className={form.field} data-testid="video-field-startImage">
              <span className={form.label}>{labelOf('startImage')}</span>
              <div className={styles.start}>
                {start !== null && <img src={start.url} alt={start.prompt} className={styles.startThumb} data-testid="video-start" />}
                <div className={styles.startActions}>
                  <button type="button" className={form.ghost} onClick={() => setChoosing((held) => !held)} data-testid="video-start-choose">
                    {start === null ? t('Choose a picture') : t('Change')}
                  </button>
                  {start !== null && (
                    <button type="button" className={form.ghost} onClick={() => setStart(null)} data-testid="video-start-clear">
                      {t('None')}
                    </button>
                  )}
                </div>
              </div>
              {choosing && (
                <div className={styles.pictures} data-testid="video-start-pictures">
                  {pictures === null && <Loader />}
                  {pictures?.length === 0 && <span className={editor.empty}>{t('This workspace has no pictures yet.')}</span>}
                  {(pictures ?? []).map((picture) => (
                    <button
                      key={picture.id}
                      type="button"
                      className={styles.pictureChoice}
                      aria-pressed={start?.id === picture.id}
                      title={picture.name ?? picture.prompt}
                      onClick={() => {
                        setStart(picture);
                        setChoosing(false);
                      }}
                    >
                      <img src={picture.url} alt={picture.name ?? picture.prompt} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {video?.durationSeconds != null && (
            <p className={editor.empty} data-testid="video-length">
              {tf('Plays for {time}', { time: playingTime(video.durationSeconds) })}
            </p>
          )}

          {error !== null && (
            <p className={form.error} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className={`${form.filled} ${editor.generate}`}
            disabled={prompt.trim() === '' || modelId === '' || busy || settings === null || settingsReason !== null}
            data-testid="video-generate"
          >
            {t('Generate')}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
