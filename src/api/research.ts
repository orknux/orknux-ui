import { graphql } from './client';
import type { PageOf } from './client';

/**
 * Answer > Research: a question researched by one of the workspace's own
 * workflows, and the modes that say which. Issue #659.
 */

export type ResearchModeKind = 'SHALLOW' | 'MEDIUM' | 'DEEP' | 'CUSTOM';
export type ResearchLanguage = 'ACADEMIC' | 'COLLOQUIAL' | 'FORMAL';
export type ResearchOutputFormat = 'PDF' | 'DOCUMENT';
export type ResearchStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';

/** How deep a research goes, said as the workflow that does it. */
export interface ResearchMode {
  id: string;
  kind: ResearchModeKind;
  name: string;
  /** Null where the workflow it named is no longer in the workspace. */
  workflowId: string | null;
  workflowName: string | null;
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
  previewUrl: string | null;
  error: string | null;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
}

/** Where a research has got to, as the pipeline last said. */
export interface ResearchProgress {
  step: string;
  subQuestions: string[];
  searched: string[];
  /** How many levels down; 1 is the plan's own questions. */
  level: number;
  sourcesRead: number;
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
  modelId?: string | null;
  language: ResearchLanguage;
  outputFormat: ResearchOutputFormat;
  websitesInclude: string[];
  websitesExclude: string[];
  documentsInclude: string[];
  documentsExclude: string[];
}

const MODE_FIELDS = 'id kind name workflowId workflowName';

const RESEARCH_FIELDS =
  'id question modeId modeName workflowId workflowName modelId modelName language outputFormat ' +
  'websitesInclude websitesExclude documentsInclude documentsExclude status executionId ' +
  'fileName fileUrl previewUrl error startedBy startedAt finishedAt ' +
  'progress { step subQuestions searched level sourcesRead } sources { number title url kind }';

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
    `query Research($id: ID!) { research(id: $id) { ${RESEARCH_FIELDS} result sources { number notes } } }`,
    { id },
  );
  return data.research;
}

export async function fetchResearchDocuments(workspaceId: string): Promise<ResearchDocument[]> {
  const data = await graphql<{ researchDocuments: ResearchDocument[] }>(
    `query ResearchDocuments($workspaceId: ID!) {
       researchDocuments(workspaceId: $workspaceId) { id name description contentType sizeBytes savedAt }
     }`,
    { workspaceId },
  );
  return data.researchDocuments;
}

/** Writes the research down and starts its mode's workflow; it comes back running. */
export async function startResearch(input: StartResearchInput): Promise<Research> {
  const data = await graphql<{ startResearch: Research }>(
    `mutation StartResearch($input: StartResearchInput!) { startResearch(input: $input) { ${RESEARCH_FIELDS} } }`,
    { input },
  );
  return data.startResearch;
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
