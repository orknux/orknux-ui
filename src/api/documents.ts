import { graphql } from './client';

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

export type PageSize = 'A4' | 'LETTER';

export interface DesignDocument {
  id: string;
  workspaceId: string;
  catalogId: string;
  catalogName: string;
  name: string;
  /** `{"type":"doc","content":[...]}`; absent where a list did not ask for it. */
  content?: string;
  pageSize: PageSize;
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

export interface DocumentTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface DocumentAnswer {
  answer: string;
  /** Whether the model saved anything. */
  changed: boolean;
  document: DesignDocument;
}

/** What the list reads: everything but the content. */
const LISTED = 'id workspaceId catalogId catalogName name pageSize revision words excerpt images createdBy createdAt updatedBy updatedAt';
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

/** Writes the whole document; refused when it was saved since `revision`. */
export async function saveDocument(id: string, content: unknown, revision: number, pageSize: PageSize): Promise<DesignDocument> {
  const data = await graphql<{ saveDocument: DesignDocument }>(
    `mutation ($id: ID!, $content: String!, $revision: Int, $pageSize: String) {
       saveDocument(id: $id, content: $content, revision: $revision, pageSize: $pageSize) { ${FIELDS} }
     }`,
    { id, content: JSON.stringify(content), revision, pageSize },
  );
  return data.saveDocument;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const data = await graphql<{ deleteDocument: boolean }>(`mutation ($id: ID!) { deleteDocument(id: $id) }`, { id });
  return data.deleteDocument;
}

/** Asks a chat model to write in the document; what it writes is saved as it goes. */
export async function askDocument(id: string, modelId: string, messages: DocumentTurn[]): Promise<DocumentAnswer> {
  const data = await graphql<{ askDocument: DocumentAnswer }>(
    `mutation ($id: ID!, $modelId: ID!, $messages: [DocumentChatTurnInput!]!) {
       askDocument(id: $id, modelId: $modelId, messages: $messages) { answer changed document { ${FIELDS} } }
     }`,
    { id, modelId, messages },
  );
  return data.askDocument;
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
