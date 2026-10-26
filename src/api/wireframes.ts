import { graphql } from './client';
import { editorTurnsInput } from './attachments';
import type { EditorTurn } from './attachments';

/**
 * What a wireframe can be drawn with. The server checks a drawing against the
 * same list (`WireframeElementType`), and the model drawing in the editor is
 * told it from there.
 */
export type WireframeElementType =
  | 'frame'
  | 'rect'
  | 'text'
  | 'button'
  | 'input'
  | 'image'
  | 'line'
  | 'arrow'
  | 'note'
  | 'checkbox'
  | 'radio'
  | 'toggle';

/** Whether a kind is placed by its corner and size, rather than running from one point to another. */
export function isBox(type: WireframeElementType): boolean {
  return type !== 'line' && type !== 'arrow';
}

/** Whether a kind is a control drawn with its label beside it, which `props.checked` turns on. */
export function isCheckable(type: WireframeElementType): boolean {
  return type === 'checkbox' || type === 'radio' || type === 'toggle';
}

/**
 * One thing on a wireframe, in whole pixels from the top left. A line or an
 * arrow runs from (x, y) to (x + w, y + h). How it looks past that - its
 * background, border, shadow and the colour of its words - is in `props`, read
 * by `wireframeStyle.ts`.
 */
export interface WireframeElement {
  id: string;
  type: WireframeElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  props?: Record<string, string | number | boolean>;
}

/** A wireframe; `document` is `{"elements": [...]}`. Issue #655. */
export interface Wireframe {
  id: string;
  workspaceId: string;
  name: string;
  document: string;
  elementCount: number;
  /** Counts the saves; a save sent with an older one is refused. */
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** One turn of the editor's chat, with the files sent on it. */
export type WireframeTurn = EditorTurn;

export interface WireframeAnswer {
  answer: string;
  /** Whether the model saved anything. */
  changed: boolean;
  wireframe: Wireframe;
}

const FIELDS = 'id workspaceId name document elementCount revision createdBy createdAt updatedBy updatedAt';

/** The elements of a stored document; a document that cannot be read is an empty drawing. */
export function elementsOf(wireframe: Pick<Wireframe, 'document'>): WireframeElement[] {
  try {
    const read = JSON.parse(wireframe.document) as { elements?: WireframeElement[] };
    return Array.isArray(read.elements) ? read.elements : [];
  } catch {
    return [];
  }
}

export function documentOf(elements: WireframeElement[]): string {
  return JSON.stringify({ elements });
}

/** A workspace's wireframes, the one worked on last first. */
export async function fetchWireframes(workspaceId: string): Promise<Wireframe[]> {
  const data = await graphql<{ wireframes: Wireframe[] }>(
    `query ($workspaceId: ID!) { wireframes(workspaceId: $workspaceId) { ${FIELDS} } }`,
    { workspaceId },
  );
  return data.wireframes;
}

export async function fetchWireframe(id: string): Promise<Wireframe | null> {
  const data = await graphql<{ wireframe: Wireframe | null }>(`query ($id: ID!) { wireframe(id: $id) { ${FIELDS} } }`, { id });
  return data.wireframe;
}

export async function createWireframe(workspaceId: string, name: string, document?: string): Promise<Wireframe> {
  const data = await graphql<{ createWireframe: Wireframe }>(
    `mutation ($workspaceId: ID!, $name: String!, $document: String) {
       createWireframe(workspaceId: $workspaceId, name: $name, document: $document) { ${FIELDS} }
     }`,
    { workspaceId, name, document: document ?? null },
  );
  return data.createWireframe;
}

export async function renameWireframe(id: string, name: string): Promise<Wireframe> {
  const data = await graphql<{ renameWireframe: Wireframe }>(
    `mutation ($id: ID!, $name: String!) { renameWireframe(id: $id, name: $name) { ${FIELDS} } }`,
    { id, name },
  );
  return data.renameWireframe;
}

/** Writes the whole drawing; refused when the wireframe was saved since `revision`. */
/** [viewer] is the open editor saving it, as it named itself in the live room; its saves are announced as its own. */
export async function saveWireframe(id: string, elements: WireframeElement[], revision: number, viewer?: string): Promise<Wireframe> {
  const data = await graphql<{ saveWireframe: Wireframe }>(
    `mutation ($id: ID!, $document: String!, $revision: Int, $viewer: String) {
       saveWireframe(id: $id, document: $document, revision: $revision, viewer: $viewer) { ${FIELDS} }
     }`,
    { id, document: documentOf(elements), revision, viewer: viewer ?? null },
  );
  return data.saveWireframe;
}

export async function deleteWireframe(id: string): Promise<boolean> {
  const data = await graphql<{ deleteWireframe: boolean }>(`mutation ($id: ID!) { deleteWireframe(id: $id) }`, { id });
  return data.deleteWireframe;
}

/** A picture ready to be placed on a wireframe: what an image element names in `props.artifact`, and where it is drawn from. */
export interface WireframePicture {
  artifact: string;
  name: string;
  src: string;
}

/** Brings a picture onto a wireframe: one already in Orknux by its id, or a file (a data URL) kept as a new one. */
export async function importWireframePicture(
  id: string,
  picture: { artifact?: string; image?: string; name?: string },
): Promise<WireframePicture> {
  const data = await graphql<{ importWireframePicture: WireframePicture }>(
    `mutation ImportWireframePicture($id: ID!, $artifact: String, $image: String, $name: String) {
       importWireframePicture(id: $id, artifact: $artifact, image: $image, name: $name) { artifact name src }
     }`,
    { id, artifact: picture.artifact ?? null, image: picture.image ?? null, name: picture.name ?? null },
  );
  return data.importWireframePicture;
}

/**
 * The drawing as one HTML page, written by the server so the editor's export and
 * `orknux_wireframe_html` are the same page. The elements sent are what is on
 * the screen, saved or not; nothing is stored.
 */
export async function exportWireframeHtml(id: string, elements: WireframeElement[]): Promise<string> {
  const data = await graphql<{ exportWireframeHtml: string }>(
    `mutation ($id: ID!, $document: String) { exportWireframeHtml(id: $id, document: $document) }`,
    { id, document: documentOf(elements) },
  );
  return data.exportWireframeHtml;
}

/** Asks a chat model to draw in the wireframe; what it draws is saved as it goes. */
export async function askWireframe(id: string, modelId: string, messages: WireframeTurn[]): Promise<WireframeAnswer> {
  const data = await graphql<{ askWireframe: WireframeAnswer }>(
    `mutation ($id: ID!, $modelId: ID!, $messages: [WireframeChatTurnInput!]!) {
       askWireframe(id: $id, modelId: $modelId, messages: $messages) { answer changed wireframe { ${FIELDS} } }
     }`,
    { id, modelId, messages: editorTurnsInput(messages) },
  );
  return data.askWireframe;
}
