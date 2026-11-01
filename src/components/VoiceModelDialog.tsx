import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { Model } from '../api/models';
import { setWorkspaceSpeechModel, setWorkspaceTranscriptionModel } from '../api/workspaces';
import type { Workspace } from '../api/workspaces';
import { t } from '../i18n';
import { ModelPicker } from './ModelPicker';
import shared from './CompletionSwitch.module.css';

export interface VoiceModelDialogProps {
  workspaceId: string;
  /** Models to choose a transcription model from; empty where it is set already or none exists. */
  hearing: Model[];
  /** Models to choose a speech model from, likewise. */
  reading: Model[];
  className: string;
  onSaved: (workspace: Workspace) => void;
  onClose: () => void;
}

/**
 * Chooses voice mode's missing models from the chat's bar, as the editors'
 * Auto-completion switch chooses a completion model and for its reason: this is
 * the workspace's setting and not this chat's, so it is said in full and
 * confirmed. Each choice is saved as it goes through, so a refusal of the second
 * leaves the first kept and on screen as kept.
 */
export function VoiceModelDialog({ workspaceId, hearing, reading, className, onSaved, onClose }: VoiceModelDialogProps) {
  const [transcription, setTranscription] = useState('');
  const [speech, setSpeech] = useState('');
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function confirm() {
    if ((transcription === '' && speech === '') || saving) return;
    setSaving(true);
    setRefusal(null);
    try {
      if (transcription !== '') onSaved(await setWorkspaceTranscriptionModel(workspaceId, transcription));
      if (speech !== '') onSaved(await setWorkspaceSpeechModel(workspaceId, speech));
      onClose();
    } catch (failure) {
      setRefusal(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  }

  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      className={`${shared.dialog} ${className}`}
      role="dialog"
      aria-label={t('Set voice models')}
      onKeyDown={keys}
      data-testid="voice-models-dialog"
    >
      <p className={shared.explain}>
        {t('This sets the models of the whole workspace: everybody in it uses them for voice mode, in every chat.')}
      </p>
      {hearing.length > 0 && (
        <label className={shared.explain}>
          {t('Speech-to-text Model')}
          <ModelPicker
            id="voice-transcription-model"
            className={shared.picker}
            value={transcription}
            models={hearing}
            required
            workspaceId={workspaceId}
            none={t('Choose a model')}
            onChange={setTranscription}
          />
        </label>
      )}
      {reading.length > 0 && (
        <label className={shared.explain}>
          {t('Text-to-speech Model')}
          <ModelPicker
            id="voice-speech-model"
            className={shared.picker}
            value={speech}
            models={reading}
            required
            workspaceId={workspaceId}
            none={t('Choose a model')}
            onChange={setSpeech}
          />
        </label>
      )}
      {refusal !== null && <p className={shared.refusal} role="alert">{refusal}</p>}
      <div className={shared.actions}>
        <button type="button" className={shared.cancel} onClick={onClose} data-testid="voice-models-cancel">
          {t('Cancel')}
        </button>
        <button
          type="button"
          className={shared.confirm}
          disabled={(transcription === '' && speech === '') || saving}
          onClick={() => void confirm()}
          data-testid="voice-models-confirm"
        >
          {t('Set for the workspace')}
        </button>
      </div>
    </div>
  );
}
