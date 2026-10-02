import type { NodeKind } from '../api/graph';
import { NODE_ICONS } from './IconPicker';

/**
 * The picture a node is drawn with when nobody chose one.
 *
 * A node takes the icon of whatever it points at, once, and keeps any it is
 * given - but an image node, an agent, a decision, an object or a trigger whose
 * definition has none was a card with a gap where every other card had a
 * picture, which reads as a node that failed to load. So every kind has one,
 * and it is the same picture the editor's Add menu offers the kind with: a
 * trigger is a bell there, and a card that called it something else would be
 * one more thing to learn.
 *
 * Names from `NODE_ICONS`, as a node's own icon is, so the two are drawn by the
 * same `Icon` and a chosen one simply replaces this. One table for the editor's
 * cards, its Add menu, the node panel's Icon field and the run page's cards.
 */
export const DEFAULT_NODE_ICON: Record<NodeKind, string> = {
  TRIGGER: 'bell',
  AGENT: 'bot',
  ACTION: 'activity',
  CONDITION: 'filter',
  OBJECT: 'box',
  SESSION: 'message-square',
  IMAGE: 'image',
  DECISION: 'split',
};

/**
 * An action node that speaks is a speaker, not a pulse.
 *
 * Text to speech is an Action whose subtype is Speak (issue #264) rather than a
 * kind of its own, and the Add menu offers it with this picture beside the
 * eight kinds - so a node made from that entry should look like the entry.
 */
export const SPEECH_NODE_ICON = 'volume-2';

/** What a node is drawn with when it has no icon of its own. */
export function defaultNodeIcon(kind: NodeKind, speaks = false): string {
  return kind === 'ACTION' && speaks ? SPEECH_NODE_ICON : DEFAULT_NODE_ICON[kind];
}

/** The icon a node is drawn with: its own where it has one, which always wins. */
export function nodeIconOf(chosen: string | null | undefined, kind: NodeKind, speaks = false): string {
  return chosen !== null && chosen !== undefined && chosen !== '' ? chosen : defaultNodeIcon(kind, speaks);
}

/** The same picture as a URL, for the places that draw it as an `<img>`. */
export function nodeIconUrl(name: string): string {
  return NODE_ICONS[name] ?? '';
}
