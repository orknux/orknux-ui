import { graphql } from './client';
import type { PageOf } from './client';

/** What a variable holds. Scalars only: a shape belongs in the object catalogue. */
export type VariableType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'LIST';

/**
 * Whether a variable is something to keep out of sight.
 *
 * Both are encrypted at rest and both reach a function the same way; what
 * differs is the screen. A value is read with the list — a channel name or a
 * threshold is only awkward hidden. A secret is shown when somebody asks, and
 * the asking is recorded.
 */
export type VariableKind = 'VALUE' | 'SECRET';

export const VARIABLE_KIND_LABEL: Record<VariableKind, string> = {
  VALUE: 'Value',
  SECRET: 'Secret',
};

/** A folder of variables, the way a skill catalog is a folder of skills. */
export interface VariableCatalog {
  id: string;
  workspaceId: string;
  name: string;
  /** What the count badge shows, so an empty catalog reads as empty. */
  variableCount: number;
  createdAt: string;
  createdBy: string;
}

/**
 * A named value the workspace keeps.
 *
 * No `value` here: it is stored encrypted, and a list of variables is not a
 * place to put secrets. What a screen knows from a list is that one has been
 * set; seeing it takes asking, which `revealVariable` records.
 */
export interface Variable {
  id: string;
  workspaceId: string;
  catalogId: string;
  catalogName: string;
  name: string;
  /** What it is for, since the name has to be an identifier. */
  description: string | null;
  type: VariableType;
  kind: VariableKind;
  /** What a LIST holds; null on anything else. Issue #377. */
  elementType: VariableType | null;
  /**
   * A type a plugin defines over the base type — `slack:SlackUser` — or null
   * for a plain one. What it buys is the picker and the check at the moment a
   * value is typed.
   */
  customType: string | null;
  /** What that type was told, as a JSON object: the connection to look in, for a Slack user. */
  typeArguments: string | null;
  /** What it holds, on a value. Null on a secret, whatever is stored. */
  value: string | null;
  /** Whether anything is stored, which is all a secret says about itself. */
  valueSet: boolean;
  createdAt: string;
  /** Who put it there; the person who knows what it is for. */
  createdBy: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
}

export const VARIABLE_TYPES: VariableType[] = ['STRING', 'NUMBER', 'BOOLEAN', 'LIST'];

export const VARIABLE_TYPE_LABEL: Record<VariableType, string> = {
  STRING: 'String',
  NUMBER: 'Number',
  BOOLEAN: 'Boolean',
  LIST: 'List',
};

/** The three a list may hold, and a plugin's type may be over. */
export type ScalarType = 'STRING' | 'NUMBER' | 'BOOLEAN';

/** A type a variable may be beyond the built-in ones: one a plugin defines. Issue #377. */
export interface VariableTypeOffer {
  /** `<plugin>:<name>`, which is what a variable stores as its customType. */
  key: string;
  plugin: string;
  pluginName: string;
  name: string;
  description: string | null;
  /** What a value of it is underneath. */
  base: ScalarType;
  parameters: VariableTypeParameter[];
  suggests: boolean;
  validates: boolean;
}

/** One thing a plugin's type needs to be told — a connection, usually. */
export interface VariableTypeParameter {
  name: string;
  description: string | null;
  /** `connection`, or one of string, number, boolean as the plugin spells it. */
  type: string;
  required: boolean;
  connectionType: string | null;
  options: string[];
}

/** One thing a plugin offers for what was typed into a variable of its type. */
export interface VariableSuggestion {
  value: string;
  label: string;
  detail: string | null;
}

const CATALOG_FIELDS = 'id workspaceId name variableCount createdAt createdBy';
const VARIABLE_FIELDS = `id workspaceId catalogId catalogName name description type kind
   elementType customType typeArguments value valueSet
   createdAt createdBy lastModifiedAt lastModifiedBy`;

export async function fetchVariableTypes(workspaceId: string): Promise<VariableTypeOffer[]> {
  const data = await graphql<{ variableTypes: VariableTypeOffer[] }>(
    `query VariableTypes($workspaceId: ID!) {
       variableTypes(workspaceId: $workspaceId) {
         key plugin pluginName name description base suggests validates
         parameters { name description type required connectionType options }
       }
     }`,
    { workspaceId },
  );
  return data.variableTypes;
}

/**
 * What the plugin defining `type` offers for what was typed so far.
 *
 * @param args what the variable is told — the connection to look in — sent as JSON.
 */
export async function fetchVariableSuggestions(
  workspaceId: string,
  type: string,
  args: Record<string, string>,
  typed: string,
): Promise<VariableSuggestion[]> {
  const data = await graphql<{ variableSuggestions: VariableSuggestion[] }>(
    `query VariableSuggestions($workspaceId: ID!, $type: String!, $arguments: String, $typed: String!) {
       variableSuggestions(workspaceId: $workspaceId, type: $type, arguments: $arguments, typed: $typed) {
         value label detail
       }
     }`,
    { workspaceId, type, arguments: JSON.stringify(args), typed },
  );
  return data.variableSuggestions;
}

export async function fetchVariableCatalogs(workspaceId: string): Promise<VariableCatalog[]> {
  const data = await graphql<{ variableCatalogs: VariableCatalog[] }>(
    `query VariableCatalogs($workspaceId: ID!) { variableCatalogs(workspaceId: $workspaceId) { ${CATALOG_FIELDS} } }`,
    { workspaceId },
  );
  return data.variableCatalogs;
}

export async function createVariableCatalog(workspaceId: string, name: string): Promise<VariableCatalog> {
  const data = await graphql<{ createVariableCatalog: VariableCatalog }>(
    `mutation CreateVariableCatalog($workspaceId: ID!, $name: String!) {
       createVariableCatalog(workspaceId: $workspaceId, name: $name) { ${CATALOG_FIELDS} }
     }`,
    { workspaceId, name },
  );
  return data.createVariableCatalog;
}

export async function renameVariableCatalog(id: string, name: string): Promise<VariableCatalog> {
  const data = await graphql<{ renameVariableCatalog: VariableCatalog }>(
    `mutation RenameVariableCatalog($id: ID!, $name: String!) {
       renameVariableCatalog(id: $id, name: $name) { ${CATALOG_FIELDS} }
     }`,
    { id, name },
  );
  return data.renameVariableCatalog;
}

export async function deleteVariableCatalog(id: string): Promise<boolean> {
  const data = await graphql<{ deleteVariableCatalog: boolean }>(
    'mutation DeleteVariableCatalog($id: ID!) { deleteVariableCatalog(id: $id) }',
    { id },
  );
  return data.deleteVariableCatalog;
}

/**
 * One page of variables: a catalog's, or every one the workspace holds.
 *
 * A blank search is no filter rather than a search for nothing, so the screen
 * can send what is in its box without deciding anything.
 */
/** What the list can be put in the order of; see `VARIABLE_ORDERS` on the server. */
export type VariableOrder = 'NAME' | 'DESCRIPTION' | 'TYPE';

export async function fetchVariables(
  workspaceId: string,
  options: {
    catalogId?: string | null;
    search?: string;
    page?: number;
    size?: number;
    order?: VariableOrder;
    ascending?: boolean;
  } = {},
): Promise<PageOf<Variable>> {
  const data = await graphql<{ workspaceVariables: PageOf<Variable> }>(
    `query WorkspaceVariables(
       $workspaceId: ID!, $catalogId: ID, $search: String, $page: Int!, $size: Int!,
       $order: String, $ascending: Boolean
     ) {
       workspaceVariables(
         workspaceId: $workspaceId, catalogId: $catalogId, search: $search, page: $page, size: $size,
         order: $order, ascending: $ascending
       ) {
         content { ${VARIABLE_FIELDS} }
         page size totalElements totalPages
       }
     }`,
    {
      workspaceId,
      catalogId: options.catalogId ?? null,
      search: options.search ?? null,
      page: options.page ?? 0,
      size: options.size ?? 20,
      order: options.order ?? 'NAME',
      ascending: options.ascending ?? true,
    },
  );
  return data.workspaceVariables;
}

export async function createVariable(input: {
  workspaceId: string;
  catalogId: string;
  name: string;
  description?: string;
  type: VariableType;
  kind: VariableKind;
  elementType?: VariableType | null;
  customType?: string | null;
  typeArguments?: string | null;
  value?: string;
}): Promise<Variable> {
  const data = await graphql<{ createVariable: Variable }>(
    `mutation CreateVariable($input: CreateVariableInput!) {
       createVariable(input: $input) { ${VARIABLE_FIELDS} }
     }`,
    { input },
  );
  return data.createVariable;
}

export async function updateVariable(
  id: string,
  input: {
    catalogId?: string;
    name?: string;
    description?: string;
    type?: VariableType;
    kind?: VariableKind;
    elementType?: VariableType | null;
    /** Empty takes the plugin type off; absent leaves it alone. */
    customType?: string | null;
    typeArguments?: string | null;
    /** Left out to keep the stored value; the form cannot show it to send it back. */
    value?: string;
  },
): Promise<Variable> {
  const data = await graphql<{ updateVariable: Variable }>(
    `mutation UpdateVariable($id: ID!, $input: UpdateVariableInput!) {
       updateVariable(id: $id, input: $input) { ${VARIABLE_FIELDS} }
     }`,
    { id, input },
  );
  return data.updateVariable;
}

/**
 * What a variable holds, asked for deliberately.
 *
 * The one way a value leaves the server, and it is recorded in the audit log:
 * nothing returns it as part of a list, because a value on a screen is a value
 * in a screenshot.
 */
export async function revealVariable(id: string): Promise<string | null> {
  const data = await graphql<{ revealVariable: string | null }>(
    'mutation RevealVariable($id: ID!) { revealVariable(id: $id) }',
    { id },
  );
  return data.revealVariable;
}

export async function deleteVariable(id: string): Promise<boolean> {
  const data = await graphql<{ deleteVariable: boolean }>(
    'mutation DeleteVariable($id: ID!) { deleteVariable(id: $id) }',
    { id },
  );
  return data.deleteVariable;
}
