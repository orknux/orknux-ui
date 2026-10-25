import { graphql } from './client';
import { editorTurnsInput } from './attachments';
import type { EditorTurn } from './attachments';

/**
 * Documents in Design: rich text in pages, filed in catalogs, written by hand
 * in the editor and by a chat model through the orknux_* document tools.
 *
 * `content` is ProseMirror JSON as the editor's TipTap extensions write it; the
 * server checks it against the same vocabulary (`DocumentContent`) and is the
 * one that says where a picture is drawn from.
 */
export interface DocumentCatalog {
  id: string;
  workspaceId: string;
  name: string;
  documentCount: number;
  createdBy: string;
  createdAt: string;
}

export type PageSize = 'A3' | 'A4' | 'A5' | 'LETTER' | 'LEGAL';
export type Orientation = 'PORTRAIT' | 'LANDSCAPE';
export type Margins = 'NORMAL' | 'NARROW' | 'WIDE';

/** What a page is set up as, in the order the editor's menu offers them. */
export const PAGE_SIZES: { value: PageSize; label: string }[] = [
  { value: 'A4', label: 'A4' },
  { value: 'LETTER', label: 'Letter' },
  { value: 'A5', label: 'A5' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'A3', label: 'A3' },
];

/** A document's page as laid out, in millimetres: its size turned the way it is, and its margin. */
export interface DocumentPage {
  widthMm: number;
  heightMm: number;
  marginMm: number;
}

export interface DesignDocument {
  id: string;
  workspaceId: string;
  catalogId: string;
  catalogName: string;
  name: string;
  /** `{"type":"doc","content":[...]}`; absent where a list did not ask for it. */
  content?: string;
  pageSize: PageSize;
  orientation: Orientation;
  margins: Margins;
  /** en or pl, what its grammar is checked in; null is the reader's own. */
  language: string | null;
  page: DocumentPage;
  /** Counts the saves; a save sent with an older one is refused. */
  revision: number;
  words: number;
  /** The first words, on one line. */
  excerpt: string;
  /** The artifact ids of the pictures it shows. */
  images: string[];
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface DocumentHit {
  document: DesignDocument;
  /** The words around where it was found, on one line. */
  snippet: string;
}

/** One turn of the editor's chat, with the files sent on it. */
export type DocumentTurn = EditorTurn;

export interface DocumentAnswer {
  answer: string;
  /** Whether the model saved anything. */
  changed: boolean;
  document: DesignDocument;
}

/** What the list reads: everything but the content. */
const LISTED =
  'id workspaceId catalogId catalogName name pageSize orientation margins language page { widthMm heightMm marginMm } revision words excerpt images createdBy createdAt updatedBy updatedAt';
/** What the editor and the view read. */
const FIELDS = `${LISTED} content`;
const CATALOG = 'id workspaceId name documentCount createdBy createdAt';

export async function fetchDocumentCatalogs(workspaceId: string): Promise<DocumentCatalog[]> {
  const data = await graphql<{ documentCatalogs: DocumentCatalog[] }>(
    `query ($workspaceId: ID!) { documentCatalogs(workspaceId: $workspaceId) { ${CATALOG} } }`,
    { workspaceId },
  );
  return data.documentCatalogs;
}

export async function createDocumentCatalog(workspaceId: string, name: string): Promise<DocumentCatalog> {
  const data = await graphql<{ createDocumentCatalog: DocumentCatalog }>(
    `mutation ($workspaceId: ID!, $name: String!) { createDocumentCatalog(workspaceId: $workspaceId, name: $name) { ${CATALOG} } }`,
    { workspaceId, name },
  );
  return data.createDocumentCatalog;
}

export async function renameDocumentCatalog(id: string, name: string): Promise<DocumentCatalog> {
  const data = await graphql<{ renameDocumentCatalog: DocumentCatalog }>(
    `mutation ($id: ID!, $name: String!) { renameDocumentCatalog(id: $id, name: $name) { ${CATALOG} } }`,
    { id, name },
  );
  return data.renameDocumentCatalog;
}

/** Refused while the catalog holds documents. */
export async function deleteDocumentCatalog(id: string): Promise<boolean> {
  const data = await graphql<{ deleteDocumentCatalog: boolean }>(`mutation ($id: ID!) { deleteDocumentCatalog(id: $id) }`, { id });
  return data.deleteDocumentCatalog;
}

/** A workspace's documents, the one worked on last first; in one catalog, or holding some words. */
export async function fetchDocuments(workspaceId: string, catalogId?: string | null, search?: string): Promise<DesignDocument[]> {
  const data = await graphql<{ documents: DesignDocument[] }>(
    `query ($workspaceId: ID!, $catalogId: ID, $search: String) {
       documents(workspaceId: $workspaceId, catalogId: $catalogId, search: $search) { ${LISTED} }
     }`,
    { workspaceId, catalogId: catalogId ?? null, search: search?.trim() ? search.trim() : null },
  );
  return data.documents;
}

export async function fetchDocument(id: string): Promise<DesignDocument | null> {
  const data = await graphql<{ document: DesignDocument | null }>(`query ($id: ID!) { document(id: $id) { ${FIELDS} } }`, { id });
  return data.document;
}

/** Documents holding some words, with the words around where; names that match first. */
export async function searchDocuments(workspaceId: string, text: string, limit?: number): Promise<DocumentHit[]> {
  const data = await graphql<{ searchDocuments: DocumentHit[] }>(
    `query ($workspaceId: ID!, $text: String!, $limit: Int) {
       searchDocuments(workspaceId: $workspaceId, text: $text, limit: $limit) { snippet document { id name catalogName } }
     }`,
    { workspaceId, text, limit: limit ?? null },
  );
  return data.searchDocuments;
}

export async function createDocument(workspaceId: string, name: string, catalogId?: string | null): Promise<DesignDocument> {
  const data = await graphql<{ createDocument: DesignDocument }>(
    `mutation ($workspaceId: ID!, $catalogId: ID, $name: String!) {
       createDocument(workspaceId: $workspaceId, catalogId: $catalogId, name: $name) { ${FIELDS} }
     }`,
    { workspaceId, catalogId: catalogId ?? null, name },
  );
  return data.createDocument;
}

export async function renameDocument(id: string, name: string): Promise<DesignDocument> {
  const data = await graphql<{ renameDocument: DesignDocument }>(
    `mutation ($id: ID!, $name: String!) { renameDocument(id: $id, name: $name) { ${LISTED} } }`,
    { id, name },
  );
  return data.renameDocument;
}

export async function moveDocument(id: string, catalogId: string): Promise<DesignDocument> {
  const data = await graphql<{ moveDocument: DesignDocument }>(
    `mutation ($id: ID!, $catalogId: ID!) { moveDocument(id: $id, catalogId: $catalogId) { ${LISTED} } }`,
    { id, catalogId },
  );
  return data.moveDocument;
}

/** How a document's pages are set up, and what it is written in: saved with it. */
export interface DocumentSettings {
  pageSize: PageSize;
  orientation: Orientation;
  margins: Margins;
  /** Empty for the reader's own. */
  language: string;
}

/** Writes the whole document; refused when it was saved since `revision`. */
export async function saveDocument(id: string, content: unknown, revision: number, settings: DocumentSettings): Promise<DesignDocument> {
  const data = await graphql<{ saveDocument: DesignDocument }>(
    `mutation ($id: ID!, $content: String!, $revision: Int, $pageSize: String, $orientation: String, $margins: String, $language: String) {
       saveDocument(id: $id, content: $content, revision: $revision, pageSize: $pageSize, orientation: $orientation, margins: $margins, language: $language) { ${FIELDS} }
     }`,
    { id, content: JSON.stringify(content), revision, ...settings },
  );
  return data.saveDocument;
}

/** The page a new document in the workspace starts on. */
export async function fetchDocumentPageSizeDefault(workspaceId: string): Promise<PageSize> {
  const data = await graphql<{ documentPageSizeDefault: PageSize }>(
    `query ($workspaceId: ID!) { documentPageSizeDefault(workspaceId: $workspaceId) }`,
    { workspaceId },
  );
  return data.documentPageSizeDefault;
}

export async function setDocumentPageSizeDefault(workspaceId: string, pageSize: PageSize): Promise<PageSize> {
  const data = await graphql<{ setDocumentPageSizeDefault: PageSize }>(
    `mutation ($workspaceId: ID!, $pageSize: String!) { setDocumentPageSizeDefault(workspaceId: $workspaceId, pageSize: $pageSize) }`,
    { workspaceId, pageSize },
  );
  return data.setDocumentPageSizeDefault;
}

/** How the sentence at the caret might go on, from the workspace's completion model; null for nothing. */
export async function fetchDocumentCompletion(
  id: string,
  around: { before: string; after: string; page: number },
  signal?: AbortSignal,
): Promise<string | null> {
  const data = await graphql<{ documentCompletion: string | null }>(
    `query DocumentCompletion($id: ID!, $before: String!, $after: String, $page: Int) {
       documentCompletion(id: $id, before: $before, after: $after, page: $page)
     }`,
    { id, ...around },
    signal,
  );
  return data.documentCompletion;
}

/** One mistake in a text, at characters into it. */
export interface GrammarMatch {
  offset: number;
  length: number;
  message: string;
  shortMessage: string | null;
  replacements: string[];
  rule: string;
  spelling: boolean;
}

export interface GrammarSettings {
  pauseMillis: number;
  textMost: number;
  languages: string[];
  server: string | null;
  serverConfigured: string | null;
}

export async function fetchGrammarSettings(): Promise<GrammarSettings> {
  const data = await graphql<{ grammarSettings: GrammarSettings }>(
    '{ grammarSettings { pauseMillis textMost languages server serverConfigured } }',
  );
  return data.grammarSettings;
}

/** Points grammar checking at a LanguageTool server; empty goes back to the built-in one. */
export async function setGrammarServer(url: string): Promise<GrammarSettings> {
  const data = await graphql<{ setGrammarServer: GrammarSettings }>(
    'mutation ($url: String) { setGrammarServer(url: $url) { pauseMillis textMost languages server serverConfigured } }',
    { url },
  );
  return data.setGrammarServer;
}

/** Where the mistakes in a paragraph are. */
export async function checkGrammar(language: string, text: string, signal?: AbortSignal): Promise<GrammarMatch[]> {
  const data = await graphql<{ grammarCheck: GrammarMatch[] }>(
    `query GrammarCheck($language: String!, $text: String!) {
       grammarCheck(language: $language, text: $text) { offset length message shortMessage replacements rule spelling }
     }`,
    { language, text },
    signal,
  );
  return data.grammarCheck;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const data = await graphql<{ deleteDocument: boolean }>(`mutation ($id: ID!) { deleteDocument(id: $id) }`, { id });
  return data.deleteDocument;
}

/**
 * Asks a chat model to write in the document; what it writes is saved as it goes. With [readOnly]
 * it is asked about the document instead - Explain, Summarise - offered only the tools that read it.
 */
export async function askDocument(id: string, modelId: string, messages: DocumentTurn[], readOnly = false): Promise<DocumentAnswer> {
  const data = await graphql<{ askDocument: DocumentAnswer }>(
    `mutation ($id: ID!, $modelId: ID!, $messages: [DocumentChatTurnInput!]!, $readOnly: Boolean) {
       askDocument(id: $id, modelId: $modelId, messages: $messages, readOnly: $readOnly) { answer changed document { ${FIELDS} } }
     }`,
    { id, modelId, messages: editorTurnsInput(messages), readOnly },
  );
  return data.askDocument;
}

/** The languages Translate offers, by the codes the server takes. */
export const TRANSLATION_LANGUAGES = ['en', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'cs', 'uk'] as const;
export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number];

/** A selection put into another language by a chat model; nothing is written - the editor puts it in place. */
export async function translateDocumentText(
  id: string,
  modelId: string,
  asked: { text: string; language: TranslationLanguage; before: string; after: string },
): Promise<string> {
  const data = await graphql<{ translateDocumentText: string }>(
    `mutation ($id: ID!, $modelId: ID!, $text: String!, $language: String!, $before: String, $after: String) {
       translateDocumentText(id: $id, modelId: $modelId, text: $text, language: $language, before: $before, after: $after)
     }`,
    { id, modelId, ...asked },
  );
  return data.translateDocumentText;
}

/** The formats a document is exported in, as the server's download addresses name them. */
export type DocumentFormat = 'pdf' | 'md' | 'odt' | 'ods';

/** Where the server writes a document out; the stored document, so whatever is on screen is saved first. */
export function documentExportUrl(id: string, format: DocumentFormat): string {
  return `/api/documents/${id}/export/${format}`;
}

/** The parsed content of a document, or an empty one where it cannot be read. */
export function contentOf(document: Pick<DesignDocument, 'content'>): Record<string, unknown> {
  try {
    const read = JSON.parse(document.content ?? '') as Record<string, unknown>;
    if (read !== null && typeof read === 'object' && read.type === 'doc') return read;
  } catch {
    // An empty document below.
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Where a document opens: the editor, or the view of it as clean pages. */
export function documentPath(workspaceId: string, id: string, view = false): string {
  return `/workspace/${workspaceId}/design/documents/${id}${view ? '/view' : ''}`;
}

/** A file read into a document's vocabulary on the server, not yet on its page. */
export interface DocumentImport {
  /** `{"type":"doc","content":[...]}`, checked as a save is. */
  content: string;
  /** What it was read as: PDF, Markdown, ODT, DOCX, HTML or Text. */
  format: string;
  /** How many pictures it brought, now Design pictures of the workspace. */
  pictures: number;
  /** How many it carried that were not kept. */
  picturesLeftOut: number;
}

/** Reads a file into the document's vocabulary; nothing is saved, the editor puts it on the page. */
export async function importDocumentFile(id: string, filename: string, file: string): Promise<DocumentImport> {
  const data = await graphql<{ importDocumentFile: DocumentImport }>(
    `mutation ImportDocumentFile($id: ID!, $filename: String!, $file: String!) {
       importDocumentFile(id: $id, filename: $filename, file: $file) { content format pictures picturesLeftOut }
     }`,
    { id, filename, file },
  );
  return data.importDocumentFile;
}
