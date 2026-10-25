import type { ResearchLanguage, ResearchStage, ResearchStatus } from '../../api/research';
import { t } from '../../i18n';

/** What a status is called on the page. */
export function statusLabel(status: ResearchStatus): string {
  switch (status) {
    case 'RUNNING':
      return t('Running');
    case 'COMPLETED':
      return t('Completed');
    case 'FAILED':
      return t('Failed');
    case 'STOPPED':
      return t('Stopped');
  }
}

/** What a register is called on the page. */
export function languageLabel(language: ResearchLanguage): string {
  switch (language) {
    case 'ACADEMIC':
      return t('Academic');
    case 'COLLOQUIAL':
      return t('Colloquial');
    case 'FORMAL':
      return t('Formal');
  }
}

/**
 * The seeded modes are called by the word for their depth, in the reader's
 * language; one somebody added is called what they called it.
 */
export function modeLabel(kind: string | null, name: string): string {
  switch (kind) {
    case 'SHALLOW':
      return t('Shallow');
    case 'MEDIUM':
      return t('Medium');
    case 'DEEP':
      return t('Deep');
    default:
      return name;
  }
}

/** The names the three seeded modes are stored under, and so a research started in one is kept under. */
const SEEDED: Record<string, string> = { Shallow: 'SHALLOW', Medium: 'MEDIUM', Deep: 'DEEP' };

/** A mode's name as a research keeps it, in the reader's language where it is one of the three. */
export function seededLabel(name: string): string {
  return modeLabel(SEEDED[name] ?? null, name);
}

/** A step of a mode's workflow by the name its node has, as the steps are drawn in order. */
export function stepLabel(stage: ResearchStage): string {
  switch (stage) {
    case 'PLAN':
      return t('Plan research');
    case 'GATHER':
      return t('Gather sources');
    case 'FOLLOW_UP':
      return t('Deepen findings');
    case 'WRITE':
      return t('Write report');
    case 'REVIEW':
      return t('Review report');
    case 'SAVE':
      return t('Save report');
  }
}

/** What a reviewer found wrong, by its kind. */
export function issueLabel(kind: string): string {
  switch (kind) {
    case 'UNSUPPORTED':
      return t('Unsupported claim');
    case 'MISSING':
      return t('Missing part');
    case 'CITATION':
      return t('Wrong citation');
    case 'CONTRADICTION':
      return t('Contradicts a source');
    case 'FORMATTING':
      return t('Formatting');
    default:
      return t('Other');
  }
}

/** What a research is doing while it is in a step of its workflow. */
export function stageLabel(stage: ResearchStage): string {
  switch (stage) {
    case 'PLAN':
      return t('Planning the research');
    case 'GATHER':
      return t('Gathering sources');
    case 'FOLLOW_UP':
      return t('Deepening findings');
    case 'WRITE':
      return t('Writing the report');
    case 'REVIEW':
      return t('Reviewing the report');
    case 'SAVE':
      return t('Saving the report');
  }
}
