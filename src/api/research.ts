import { graphql } from './client';
import type { PageOf } from './client';
import { t } from '../i18n';

/**
 * Explore > Research: a question researched by one of the workspace's own
 * workflows, and the modes that say which. Issue #659.
 */

export type ResearchModeKind = 'SHALLOW' | 'MEDIUM' | 'DEEP' | 'CUSTOM';
export type ResearchLanguage = 'ACADEMIC' | 'COLLOQUIAL' | 'FORMAL';
export type ResearchOutputFormat = 'PDF' | 'DOCUMENT';
export type ResearchStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
/** The steps of a mode's workflow, left to right. */
export type ResearchStage = 'PLAN' | 'GATHER' | 'FOLLOW_UP' | 'WRITE' | 'REVIEW' | 'SAVE';

/** How deep a research goes, said as the workflow that does it. */
export interface ResearchMode {
  id: string;
  kind: ResearchModeKind;
  name: string;
  /** Null where the workflow it named is no longer in the workspace. */
  workflowId: string | null;
  workflowName: string | null;
  /** Whether its workflow has a Review step; a research in a mode without one cannot be reviewed. */
  reviewable: boolean;
}

/** A file on the Artifacts page a research can read. */
export interface ResearchDocument {
  id: string;
  name: string;
  description: string;
  contentType: string;
  sizeBytes: number;
  savedAt: string;
}

export interface Research {
  id: string;
  question: string;
  modeId: string | null;
  modeName: string;
  workflowId: string;
  workflowName: string;
  modelId: string | null;
  modelName: string | null;
  language: ResearchLanguage;
  outputFormat: ResearchOutputFormat;
  websitesInclude: string[];
  websitesExclude: string[];
  documentsInclude: string[];
  documentsExclude: string[];
  /** Off, it read only the documents and the websites to keep to. */
  useWebSearch: boolean;
  /** Whether it looks for images to place in the report and keep beside it. */
  includeImages: boolean;
  /** The images it kept, numbered as the report places them. */
  images: ResearchImage[];
  status: ResearchStatus;
  executionId: string | null;
  /** The report in markdown, once it is finished. Only the one opened asks for it. */
  result?: string | null;
  /** Where it has got to; null before it has begun. */
  progress: ResearchProgress | null;
  /** What it read, numbered as the report cites them. */
  sources: ResearchSource[];
  fileName: string | null;
  fileUrl: string | null;
  /** The artifact the report was saved as; null where it could not be saved. */
  artifactId: string | null;
  /** The artifact as the Artifacts page addresses it, SAVED-70; what a link to it opens. */
  artifactKey: string | null;
  previewUrl: string | null;
  error: string | null;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  /** The runs it was on before executionId, oldest first: a restart moves it onto a new run. */
  earlierExecutionIds: string[];
  /** While its writer is writing, the report so far, in markdown. Only the one opened asks for it. */
  draft?: string | null;
  /** About how many seconds it has left, measured from the ones before it. Only the one opened asks for it. */
  estimatedSecondsLeft?: number | null;
  /** Whether a second model reviews the report before it is saved. */
  review: boolean;
  reviewerModelId: string | null;
  reviewerModelName: string | null;
  /** What each round of review said, in order. Only the one opened asks for it. */
  reviewRounds?: ResearchReviewRound[];
  /** The questions it suggests asking next, once finished. Only the one opened asks for them. */
  followUps?: string[];
  followUpCount?: number | null;
  /** The research it was started from as a follow-up. */
  parentId: string | null;
  parentQuestion?: string | null;
  /** The research started from it as follow-ups. Only the one opened asks for them. */
  children?: ResearchChild[];
}

/** A research started from another as a follow-up, as the parent lists it. */
export interface ResearchChild {
  id: string;
  question: string;
  status: ResearchStatus;
}

/** One round of review: the verdict, what was found, and whether the writer revised the report for it. */
export interface ResearchReviewRound {
  round: number;
  verdict: 'ACCEPT' | 'REVISE';
  summary: string;
  issues: ResearchReviewIssue[];
  revised: boolean;
  charactersBefore: number;
  charactersAfter: number | null;
}

export interface ResearchReviewIssue {
  kind: 'UNSUPPORTED' | 'MISSING' | 'CITATION' | 'CONTRADICTION' | 'FORMATTING' | 'OTHER';
  issue: string;
  fix: string;
}

/** Where a research has got to, as the pipeline last said. */
export interface ResearchProgress {
  step: string;
  subQuestions: string[];
  searched: string[];
  /** How many levels down; 1 is the plan's own questions. */
  level: number;
  sourcesRead: number;
  /** The step doing it; null where the workflow did it in one. */
  stage: ResearchStage | null;
  /** The page or document being read this moment, before it is a source. */
  reading: ResearchReading | null;
}

/** A page or document on its way to being a source: one the model notes nothing in never becomes one. */
export interface ResearchReading {
  title: string;
  url: string;
  kind: 'WEB' | 'DOCUMENT';
}

/** A picture a research kept, saved on the Artifacts page as a file of its own. */
export interface ResearchImage {
  number: number;
  caption: string;
  /** Where it was fetched from. */
  url: string;
  /** The page it was found on or for, where that is known. */
  page: string | null;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  artifactId: string;
  fileUrl: string;
  previewUrl: string;
}

/** One source a research read. */
export interface ResearchSource {
  number: number;
  title: string;
  url: string;
  kind: 'WEB' | 'DOCUMENT';
  /** What was learnt from it. Only the one opened asks for it. */
  notes?: string;
}

export interface StartResearchInput {
  workspaceId: string;
  question: string;
  modeId: string;
  modelId: string;
  language: ResearchLanguage;
  outputFormat: ResearchOutputFormat;
  websitesInclude: string[];
  websitesExclude: string[];
  documentsInclude: string[];
  documentsExclude: string[];
  useWebSearch: boolean;
  includeImages: boolean;
  review: boolean;
  /** Required where review is on. */
  reviewerModelId: string | null;
  /** How many follow-up questions to suggest once finished; absent is the workspace's number. */
  followUps?: number | null;
}

const MODE_FIELDS = 'id kind name workflowId workflowName reviewable';

const RESEARCH_FIELDS =
  'id question modeId modeName workflowId workflowName modelId modelName language outputFormat ' +
  'websitesInclude websitesExclude documentsInclude documentsExclude useWebSearch includeImages status executionId ' +
  'fileName fileUrl artifactId artifactKey previewUrl error startedBy startedAt finishedAt earlierExecutionIds review reviewerModelId reviewerModelName parentId ' +
  'progress { step subQuestions searched level sourcesRead stage reading { title url kind } } sources { number title url kind } ' +
  'images { number caption url page contentType sizeBytes width height artifactId fileUrl previewUrl }';

export async function fetchResearchModes(workspaceId: string): Promise<ResearchMode[]> {
  const data = await graphql<{ researchModes: ResearchMode[] }>(
    `query ResearchModes($workspaceId: ID!) { researchModes(workspaceId: $workspaceId) { ${MODE_FIELDS} } }`,
    { workspaceId },
  );
  return data.researchModes;
}

/** `page` is 0-based, matching the server. Newest first. */
export async function fetchResearches(workspaceId: string, page: number, size: number): Promise<PageOf<Research>> {
  const data = await graphql<{ researches: PageOf<Research> }>(
    `query Researches($workspaceId: ID!, $page: Int!, $size: Int!) {
       researches(workspaceId: $workspaceId, page: $page, size: $size) {
         content { ${RESEARCH_FIELDS} } page size totalElements totalPages
       }
     }`,
    { workspaceId, page, size },
  );
  return data.researches;
}

/** One research, with its report. */
export async function fetchResearch(id: string): Promise<Research | null> {
  const data = await graphql<{ research: Research | null }>(
    `query Research($id: ID!) { research(id: $id) { ${RESEARCH_FIELDS} result draft estimatedSecondsLeft sources { number notes } reviewRounds { round verdict summary revised charactersBefore charactersAfter issues { kind issue fix } } followUps followUpCount parentQuestion children { id question status } } }`,
    { id },
  );
  return data.research;
}

/** The workspace's documents a word appears in, newest first, a few at a time: a picker's list, not the whole of them. */
export async function fetchResearchDocuments(workspaceId: string, search = '', limit = 8): Promise<ResearchDocument[]> {
  const data = await graphql<{ researchDocuments: ResearchDocument[] }>(
    `query ResearchDocuments($workspaceId: ID!, $search: String, $limit: Int) {
       researchDocuments(workspaceId: $workspaceId, search: $search, limit: $limit) { id name description contentType sizeBytes savedAt }
     }`,
    { workspaceId, search: search.trim() === '' ? null : search.trim(), limit },
  );
  return data.researchDocuments;
}

/**
 * Files uploaded from the dialog, kept on the workspace's Artifacts page like
 * any other and answered as documents to pick. REST, because what crosses is
 * bytes.
 */
export async function uploadResearchDocuments(workspaceId: string, files: File[]): Promise<ResearchDocument[]> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));
  const answer = await fetch(`/api/workspaces/${workspaceId}/research-documents`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  const said = (await answer.json().catch(() => null)) as
    | { documents?: Array<ResearchDocument & { id: string | number }>; error?: string; message?: string }
    | null;
  if (!answer.ok) throw new Error(said?.error ?? said?.message ?? t('Those files could not be uploaded.'));
  return (said?.documents ?? []).map((one) => ({ ...one, id: String(one.id) }));
}

/** Writes the research down and starts its mode's workflow; it comes back running. */
export async function startResearch(input: StartResearchInput): Promise<Research> {
  const data = await graphql<{ startResearch: Research }>(
    `mutation StartResearch($input: StartResearchInput!) { startResearch(input: $input) { ${RESEARCH_FIELDS} } }`,
    { input },
  );
  return data.startResearch;
}

/**
 * Runs a research again from one of its steps, as the same research: from the
 * one it failed or stopped at where no stage is given. It comes back running.
 */
export async function restartResearch(id: string, fromStage: ResearchStage | null = null): Promise<Research> {
  const data = await graphql<{ restartResearch: Research }>(
    `mutation RestartResearch($id: ID!, $fromStage: ResearchStage) {
       restartResearch(id: $id, fromStage: $fromStage) { ${RESEARCH_FIELDS} result draft estimatedSecondsLeft sources { number notes } reviewRounds { round verdict summary revised charactersBefore charactersAfter issues { kind issue fix } } followUps followUpCount parentQuestion children { id question status } }
     }`,
    { id, fromStage },
  );
  return data.restartResearch;
}

/** A research on one of a finished research's follow-up questions, started with everything the parent was; it comes back running. */
export async function startFollowUpResearch(parentId: string, question: string): Promise<Research> {
  const data = await graphql<{ startFollowUpResearch: Research }>(
    `mutation StartFollowUpResearch($parentId: ID!, $question: String!) {
       startFollowUpResearch(parentId: $parentId, question: $question) { ${RESEARCH_FIELDS} }
     }`,
    { parentId, question },
  );
  return data.startFollowUpResearch;
}

export async function deleteResearch(id: string): Promise<boolean> {
  const data = await graphql<{ deleteResearch: boolean }>(
    `mutation DeleteResearch($id: ID!) { deleteResearch(id: $id) }`,
    { id },
  );
  return data.deleteResearch;
}

/** A mode of the workspace's own: a workflow it picked, or a copy of another mode's. */
export async function createResearchMode(input: {
  workspaceId: string;
  name: string;
  workflowId?: string | null;
  copyOfModeId?: string | null;
}): Promise<ResearchMode> {
  const data = await graphql<{ createResearchMode: ResearchMode }>(
    `mutation CreateResearchMode($input: CreateResearchModeInput!) { createResearchMode(input: $input) { ${MODE_FIELDS} } }`,
    { input },
  );
  return data.createResearchMode;
}

export async function deleteResearchMode(id: string): Promise<boolean> {
  const data = await graphql<{ deleteResearchMode: boolean }>(
    `mutation DeleteResearchMode($id: ID!) { deleteResearchMode(id: $id) }`,
    { id },
  );
  return data.deleteResearchMode;
}
