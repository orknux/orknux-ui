import { graphql } from './client';
import type { PageOf } from './client';
import type { SourceValidation } from './tools';

/** A reusable instruction set that guides how an agent goes about something. */
/** A folder of skills, and the unit an agent is granted. */
export interface SkillCatalog {
  id: string;
  workspaceId: string;
  name: string;
  skillCount: number;
  createdAt: string;
  createdBy: string;
}

export interface Skill {
  id: string;
  workspaceId: string;
  /** The catalog it lives in; every skill is in one. */
  catalogId: string;
  name: string;
  /**
   * What a workflow graph or a command names it by: letters, underscores and
   * hyphens, unique in the workspace. Derived from the name unless typed.
   * Issue #381.
   */
  key: string;
  description: string | null;
  /** Markdown, opening with a frontmatter block naming and describing it. */
  content: string;
  enabled: boolean;
  lastModifiedAt: string;
  lastModifiedBy: string;
}

const SKILL_FIELDS =
  'id workspaceId catalogId name key description content enabled lastModifiedAt lastModifiedBy';

const CATALOG_FIELDS = 'id workspaceId name skillCount createdAt createdBy';

/** The whole workspace, or one catalog when `catalogId` names one. */
export async function fetchWorkspaceSkills(
  workspaceId: string,
  page = 0,
  size = 20,
  catalogId?: string,
): Promise<PageOf<Skill>> {
  const data = await graphql<{ workspaceSkills: PageOf<Skill> }>(
    `query WorkspaceSkills($workspaceId: ID!, $catalogId: ID, $page: Int!, $size: Int!) {
       workspaceSkills(workspaceId: $workspaceId, catalogId: $catalogId, page: $page, size: $size) {
         content { ${SKILL_FIELDS} }
         page size totalElements totalPages
       }
     }`,
    { workspaceId, catalogId: catalogId ?? null, page, size },
  );
  return data.workspaceSkills;
}

export async function fetchSkillCatalogs(workspaceId: string): Promise<SkillCatalog[]> {
  const data = await graphql<{ skillCatalogs: SkillCatalog[] }>(
    `query SkillCatalogs($workspaceId: ID!) { skillCatalogs(workspaceId: $workspaceId) { ${CATALOG_FIELDS} } }`,
    { workspaceId },
  );
  return data.skillCatalogs;
}

/**
 * A folder of skills a plugin brought, offered under the plugin's key.
 *
 * Not a `SkillCatalog`: there is no row behind it, so nothing here can be
 * renamed, deleted or added to. What it shares with the workspace's own is the
 * only part an agent needs — a name to grant.
 */
export interface PluginSkillCatalog {
  /** `jira_plugin` — the plugin's key, suffixed. What goes on a grant list. */
  name: string;
  /** The plugin's key on its own, for a screen saying where this came from. */
  key: string;
  /** What the plugin is called on screen. */
  plugin: string;
  skills: PluginSkill[];
}

/** One instruction set a plugin brings: markdown an agent reads, never code it runs. */
export interface PluginSkill {
  name: string;
  /** Derived from the name the way a workspace skill's is. */
  key: string;
  description: string | null;
  content: string;
}

/** Installation-wide, like the plugins themselves, so no workspace is asked for. */
export async function fetchPluginSkillCatalogs(): Promise<PluginSkillCatalog[]> {
  const data = await graphql<{ pluginSkillCatalogs: PluginSkillCatalog[] }>(
    `query PluginSkillCatalogs {
       pluginSkillCatalogs { name key plugin skills { name key description content } }
     }`,
  );
  return data.pluginSkillCatalogs;
}

export async function createSkillCatalog(workspaceId: string, name: string): Promise<SkillCatalog> {
  const data = await graphql<{ createSkillCatalog: SkillCatalog }>(
    `mutation CreateSkillCatalog($workspaceId: ID!, $name: String!) {
       createSkillCatalog(workspaceId: $workspaceId, name: $name) { ${CATALOG_FIELDS} }
     }`,
    { workspaceId, name },
  );
  return data.createSkillCatalog;
}

export async function renameSkillCatalog(id: string, name: string): Promise<SkillCatalog> {
  const data = await graphql<{ renameSkillCatalog: SkillCatalog }>(
    `mutation RenameSkillCatalog($id: ID!, $name: String!) {
       renameSkillCatalog(id: $id, name: $name) { ${CATALOG_FIELDS} }
     }`,
    { id, name },
  );
  return data.renameSkillCatalog;
}

/** Takes the skills in it, the way a memory catalog does. */
export async function deleteSkillCatalog(id: string): Promise<boolean> {
  const data = await graphql<{ deleteSkillCatalog: boolean }>(
    `mutation DeleteSkillCatalog($id: ID!) { deleteSkillCatalog(id: $id) }`,
    { id },
  );
  return data.deleteSkillCatalog;
}

export async function fetchSkill(id: string): Promise<Skill | null> {
  const data = await graphql<{ skill: Skill | null }>(
    `query Skill($id: ID!) { skill(id: $id) { ${SKILL_FIELDS} } }`,
    { id },
  );
  return data.skill;
}

export interface CreateSkillInput {
  name: string;
  /** Its id; left out, the name's letters, underscores and hyphens. */
  key?: string;
  description?: string;
  /** Left out for a new skill, which starts from the shape with its parts named. */
  content?: string;
  /** Which folder it goes in; the workspace's first when nobody says. */
  catalogId?: string;
}

export async function createSkill(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
  const data = await graphql<{ createSkill: Skill }>(
    `mutation CreateSkill($input: CreateSkillInput!) { createSkill(input: $input) { ${SKILL_FIELDS} } }`,
    { input: { workspaceId, ...input } },
  );
  return data.createSkill;
}

export interface UpdateSkillInput {
  name?: string;
  /** A new id; left out it stays. Refused if another skill here holds it. */
  key?: string;
  description?: string;
  content?: string;
  /** Moves it to another folder; left out it stays where it is. */
  catalogId?: string;
}

export async function updateSkill(id: string, input: UpdateSkillInput): Promise<Skill> {
  const data = await graphql<{ updateSkill: Skill }>(
    `mutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {
       updateSkill(id: $id, input: $input) { ${SKILL_FIELDS} }
     }`,
    { id, input },
  );
  return data.updateSkill;
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<Skill> {
  const data = await graphql<{ setSkillEnabled: Skill }>(
    `mutation SetSkillEnabled($id: ID!, $enabled: Boolean!) {
       setSkillEnabled(id: $id, enabled: $enabled) { ${SKILL_FIELDS} }
     }`,
    { id, enabled },
  );
  return data.setSkillEnabled;
}

export async function validateSkillContent(workspaceId: string, content: string): Promise<SourceValidation> {
  const data = await graphql<{ validateSkillContent: SourceValidation }>(
    `mutation ValidateSkillContent($workspaceId: ID!, $content: String!) {
       validateSkillContent(workspaceId: $workspaceId, content: $content) { valid message line column }
     }`,
    { workspaceId, content },
  );
  return data.validateSkillContent;
}

export async function deleteSkill(id: string): Promise<boolean> {
  const data = await graphql<{ deleteSkill: boolean }>(
    'mutation DeleteSkill($id: ID!) { deleteSkill(id: $id) }',
    { id },
  );
  return data.deleteSkill;
}

/** The catalog the server brings its own skills in; every agent holds it. Issue #468. */
export const BUILT_IN_SKILLS = 'orknux_skills';

/**
 * One skill somebody in this workspace could name, from wherever it came.
 *
 * The agent form lists these to say what happens to each, and the chat
 * composer offers them after the command marker - one fetch and one rule for
 * both, so the two cannot disagree about what an agent can reach.
 */
export interface SkillOffer {
  /** What a command writes and an agent's lists hold. */
  key: string;
  name: string;
  /** The catalog's name, which is what an agent's grant holds. */
  catalog: string;
  /** The plugin's on-screen name, or null for the workspace's own. */
  plugin: string | null;
  description: string | null;
  /** The workspace skill's row id, or null for one a plugin brought. */
  skillId: string | null;
}

/** Enabled workspace skills first, then every skill the plugins and the server bring. */
export async function fetchSkillOffers(workspaceId: string, size = 200): Promise<SkillOffer[]> {
  const [held, brought, catalogs] = await Promise.all([
    fetchWorkspaceSkills(workspaceId, 0, size),
    fetchPluginSkillCatalogs(),
    fetchSkillCatalogs(workspaceId),
  ]);
  const named = new Map<string, string>(catalogs.map((catalog) => [catalog.id, catalog.name]));
  const offers: SkillOffer[] = held.content
    .filter((skill) => skill.enabled)
    .map((skill) => ({
      key: skill.key,
      name: skill.name,
      catalog: named.get(skill.catalogId) ?? '',
      plugin: null,
      description: skill.description,
      skillId: skill.id,
    }));
  for (const offer of brought) {
    for (const skill of offer.skills) {
      offers.push({
        key: skill.key,
        name: skill.name,
        catalog: offer.name,
        plugin: offer.plugin,
        description: skill.description,
        skillId: null,
      });
    }
  }
  return offers;
}

/** In scope for an agent granted these catalogs: theirs, and the server's own, which every agent holds. */
export function inSkillScope(offer: { catalog: string }, skillCatalogs: readonly string[]): boolean {
  return offer.catalog === BUILT_IN_SKILLS || skillCatalogs.includes(offer.catalog);
}

/**
 * The skills a chat can name, once each by key.
 *
 * With an agent: what its catalogs hold, less what it hides. Without one: the
 * workspace's own and the server's, since no plugin catalog has been granted.
 */
export function reachableSkills(
  offers: readonly SkillOffer[],
  agent: { skillCatalogs: readonly string[]; hiddenSkills: readonly string[] } | null,
): SkillOffer[] {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const reached =
      agent === null
        ? offer.plugin === null || offer.catalog === BUILT_IN_SKILLS
        : inSkillScope(offer, agent.skillCatalogs) && !agent.hiddenSkills.includes(offer.key);
    if (!reached || seen.has(offer.key.toLowerCase())) return false;
    seen.add(offer.key.toLowerCase());
    return true;
  });
}
