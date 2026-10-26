import { graphql } from './client';
import { editorTurnsInput } from './attachments';
import type { EditorTurn } from './attachments';

/**
 * What a node can be drawn as. The server checks a drawing against the same
 * list (`DiagramNodeKind`), and a model drawing in it is told it from there.
 */
export type DiagramNodeKind = (typeof DIAGRAM_NODE_KINDS)[number];

/** The flowchart shapes past the first six, in the order the menu offers them. */
export const FLOWCHART_KINDS = ['database', 'document', 'hexagon', 'parallelogram', 'trapezoid', 'triangle', 'cloud'] as const;

/** The UML shapes, in the order the menu offers them. */
export const UML_KINDS = ['actor', 'class', 'component', 'package', 'interface', 'device', 'boundary', 'control', 'entity'] as const;

export const DIAGRAM_NODE_KINDS = ['box', 'rounded', 'ellipse', 'diamond', 'note', 'group', ...FLOWCHART_KINDS, ...UML_KINDS] as const;

/** What a connection is drawn as (`DiagramEdgeKind`). */
export type DiagramEdgeKind = 'arrow' | 'line' | 'dashed' | 'both';

export const DIAGRAM_EDGE_KINDS: DiagramEdgeKind[] = ['arrow', 'line', 'dashed', 'both'];

/** What an agent may do with a diagram through the orknux_* tools. */
export type DiagramAgentAccess = 'READ' | 'CHANGE';

/** One box, in whole pixels from the top left - absolute, a group's children too. */
export interface DiagramNodeData {
  id: string;
  kind: DiagramNodeKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  notes?: string;
  /** The group it sits in, by id. */
  parent?: string;
}

export interface DiagramEdgeData {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind: DiagramEdgeKind;
}

export interface DiagramDrawing {
  nodes: DiagramNodeData[];
  edges: DiagramEdgeData[];
}

export interface DiagramCatalog {
  id: string;
  workspaceId: string;
  name: string;
  diagramCount: number;
}

/** A diagram; `document` is the drawing as JSON, and empty on the list. */
export interface Diagram {
  id: string;
  workspaceId: string;
  catalogId: string;
  catalogName: string;
  name: string;
  /** What it is for, in a sentence or two; null where nobody has said. */
  description: string | null;
  /** How long a description may be on this installation. */
  descriptionCharactersMost: number;
  agentAccess: DiagramAgentAccess;
  document: string;
  nodeCount: number;
  edgeCount: number;
  /** Counts the saves; a save sent with an older one is refused. */
  revision: number;
  /** How long a node's notes may be on this installation. */
  noteCharactersMost: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface DiagramHit {
  diagramId: string;
  diagramName: string;
  catalogName: string;
  field: 'label' | 'notes' | 'edge' | 'name' | 'description';
  nodeId: string | null;
  nodeLabel: string | null;
  edgeId: string | null;
  snippet: string;
}

/** One turn of the editor's chat, with the files sent on it. */
export type DiagramTurn = EditorTurn;

export interface DiagramAnswer {
  answer: string;
  changed: boolean;
  diagram: Diagram;
}

const FIELDS =
  'id workspaceId catalogId catalogName name description descriptionCharactersMost agentAccess document nodeCount edgeCount revision noteCharactersMost createdBy createdAt updatedBy updatedAt';
const CATALOG_FIELDS = 'id workspaceId name diagramCount';

/** The drawing of a stored diagram; one that cannot be read is an empty drawing. */
export function drawingOf(diagram: Pick<Diagram, 'document'>): DiagramDrawing {
  try {
    const read = JSON.parse(diagram.document) as Partial<DiagramDrawing>;
    return { nodes: Array.isArray(read.nodes) ? read.nodes : [], edges: Array.isArray(read.edges) ? read.edges : [] };
  } catch {
    return { nodes: [], edges: [] };
  }
}

export function documentOf(drawing: DiagramDrawing): string {
  return JSON.stringify(drawing);
}

export async function fetchDiagramCatalogs(workspaceId: string): Promise<DiagramCatalog[]> {
  const data = await graphql<{ diagramCatalogs: DiagramCatalog[] }>(
    `query ($workspaceId: ID!) { diagramCatalogs(workspaceId: $workspaceId) { ${CATALOG_FIELDS} } }`,
    { workspaceId },
  );
  return data.diagramCatalogs;
}

export async function createDiagramCatalog(workspaceId: string, name: string): Promise<DiagramCatalog> {
  const data = await graphql<{ createDiagramCatalog: DiagramCatalog }>(
    `mutation ($workspaceId: ID!, $name: String!) { createDiagramCatalog(workspaceId: $workspaceId, name: $name) { ${CATALOG_FIELDS} } }`,
    { workspaceId, name },
  );
  return data.createDiagramCatalog;
}

export async function renameDiagramCatalog(id: string, name: string): Promise<DiagramCatalog> {
  const data = await graphql<{ renameDiagramCatalog: DiagramCatalog }>(
    `mutation ($id: ID!, $name: String!) { renameDiagramCatalog(id: $id, name: $name) { ${CATALOG_FIELDS} } }`,
    { id, name },
  );
  return data.renameDiagramCatalog;
}

/** Refused while the catalog holds diagrams. */
export async function deleteDiagramCatalog(id: string): Promise<boolean> {
  const data = await graphql<{ deleteDiagramCatalog: boolean }>(`mutation ($id: ID!) { deleteDiagramCatalog(id: $id) }`, { id });
  return data.deleteDiagramCatalog;
}

/** A workspace's diagrams, the one worked on last first, without their drawings. */
export async function fetchDiagrams(workspaceId: string): Promise<Diagram[]> {
  const data = await graphql<{ diagrams: Diagram[] }>(
    `query ($workspaceId: ID!) { diagrams(workspaceId: $workspaceId) { ${FIELDS} } }`,
    { workspaceId },
  );
  return data.diagrams;
}

export async function fetchDiagram(id: string): Promise<Diagram | null> {
  const data = await graphql<{ diagram: Diagram | null }>(`query ($id: ID!) { diagram(id: $id) { ${FIELDS} } }`, { id });
  return data.diagram;
}

/** Node labels, notes, connection labels and diagram names that hold the words, best match first. */
export async function searchDiagrams(workspaceId: string, query: string, diagramId?: string): Promise<DiagramHit[]> {
  const data = await graphql<{ searchDiagrams: DiagramHit[] }>(
    `query ($workspaceId: ID!, $query: String!, $diagramId: ID) {
       searchDiagrams(workspaceId: $workspaceId, query: $query, diagramId: $diagramId) {
         diagramId diagramName catalogName field nodeId nodeLabel edgeId snippet
       }
     }`,
    { workspaceId, query, diagramId: diagramId ?? null },
  );
  return data.searchDiagrams;
}

export async function createDiagram(workspaceId: string, name: string, catalogId?: string): Promise<Diagram> {
  const data = await graphql<{ createDiagram: Diagram }>(
    `mutation ($workspaceId: ID!, $name: String!, $catalogId: ID) {
       createDiagram(workspaceId: $workspaceId, name: $name, catalogId: $catalogId) { ${FIELDS} }
     }`,
    { workspaceId, name, catalogId: catalogId ?? null },
  );
  return data.createDiagram;
}

export async function renameDiagram(id: string, name: string): Promise<Diagram> {
  const data = await graphql<{ renameDiagram: Diagram }>(
    `mutation ($id: ID!, $name: String!) { renameDiagram(id: $id, name: $name) { ${FIELDS} } }`,
    { id, name },
  );
  return data.renameDiagram;
}

/** What the diagram is for; blank takes it away. */
export async function describeDiagram(id: string, description: string): Promise<Diagram> {
  const data = await graphql<{ describeDiagram: Diagram }>(
    `mutation ($id: ID!, $description: String) { describeDiagram(id: $id, description: $description) { ${FIELDS} } }`,
    { id, description },
  );
  return data.describeDiagram;
}

export async function moveDiagram(id: string, catalogId: string): Promise<Diagram> {
  const data = await graphql<{ moveDiagram: Diagram }>(
    `mutation ($id: ID!, $catalogId: ID!) { moveDiagram(id: $id, catalogId: $catalogId) { ${FIELDS} } }`,
    { id, catalogId },
  );
  return data.moveDiagram;
}

export async function setDiagramAgentAccess(id: string, access: DiagramAgentAccess): Promise<Diagram> {
  const data = await graphql<{ setDiagramAgentAccess: Diagram }>(
    `mutation ($id: ID!, $access: DiagramAgentAccess!) { setDiagramAgentAccess(id: $id, access: $access) { ${FIELDS} } }`,
    { id, access },
  );
  return data.setDiagramAgentAccess;
}

/** Writes the whole drawing; refused when the diagram was saved since `revision`. */
/** [viewer] is the open editor saving it, as it named itself in the live room; its saves are announced as its own. */
export async function saveDiagram(id: string, drawing: DiagramDrawing, revision: number, viewer?: string): Promise<Diagram> {
  const data = await graphql<{ saveDiagram: Diagram }>(
    `mutation ($id: ID!, $document: String!, $revision: Int, $viewer: String) {
       saveDiagram(id: $id, document: $document, revision: $revision, viewer: $viewer) { ${FIELDS} }
     }`,
    { id, document: documentOf(drawing), revision, viewer: viewer ?? null },
  );
  return data.saveDiagram;
}

export async function deleteDiagram(id: string): Promise<boolean> {
  const data = await graphql<{ deleteDiagram: boolean }>(`mutation ($id: ID!) { deleteDiagram(id: $id) }`, { id });
  return data.deleteDiagram;
}

/** Asks a chat model to work on the diagram; what it changes is saved as it goes. */
export async function askDiagram(id: string, modelId: string, messages: DiagramTurn[]): Promise<DiagramAnswer> {
  const data = await graphql<{ askDiagram: DiagramAnswer }>(
    `mutation ($id: ID!, $modelId: ID!, $messages: [DiagramChatTurnInput!]!) {
       askDiagram(id: $id, modelId: $modelId, messages: $messages) { answer changed diagram { ${FIELDS} } }
     }`,
    { id, modelId, messages: editorTurnsInput(messages) },
  );
  return data.askDiagram;
}

/** Where the server writes a diagram out as a file. */
/** The scales a PNG is offered at: so many pixels for each one the diagram is drawn at. */
export const DIAGRAM_PNG_SCALES = [1, 2, 3] as const;

export type DiagramPngScale = (typeof DIAGRAM_PNG_SCALES)[number];

/** `scale` is for a PNG only; without it the server draws the chat picture's size. */
export function diagramExportUrl(id: string, format: 'png' | 'svg' | 'pdf' | 'mermaid' | 'json', scale?: DiagramPngScale): string {
  const base = `/api/diagrams/${id}/export/${format}`;
  return format === 'png' && scale !== undefined ? `${base}?scale=${scale}` : base;
}

/** Every labelled node of every diagram, for the Quick actions box. */
export async function fetchDiagramNodeIndex(
  workspaceId: string,
): Promise<{ diagramId: string; diagramName: string; nodeId: string; label: string }[]> {
  const data = await graphql<{ diagramNodeIndex: { diagramId: string; diagramName: string; nodeId: string; label: string }[] }>(
    `query ($workspaceId: ID!) { diagramNodeIndex(workspaceId: $workspaceId) { diagramId diagramName nodeId label } }`,
    { workspaceId },
  );
  return data.diagramNodeIndex;
}
