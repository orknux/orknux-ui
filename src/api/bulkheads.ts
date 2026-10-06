import { graphql } from './client';

/**
 * Admin -> Settings -> Bulkheads. Issue #616.
 *
 * The walls between one agent turn and the rest of the server: how many turns
 * may run at once, how full the heap may be after a collection before a turn
 * stops, and how much a single turn may hold in tool results. Each has a
 * switch, and off is how the server behaved before the wall existed.
 */
export interface Bulkheads {
  turnsEnabled: boolean;
  turnsAtOnce: number;
  turnWaitSeconds: number;
  heapEnabled: boolean;
  heapPercent: number;
  memoryEnabled: boolean;
  turnMemoryMb: number;
  toolResultKb: number;
  /** Turns holding a place right now. */
  runningTurns: number;
  /** The old generation as full as its last collection left it, or null where the JVM does not say. */
  heapAfterGcPercent: number | null;
}

export type BulkheadsInput = Omit<Bulkheads, 'runningTurns' | 'heapAfterGcPercent'>;

const FIELDS =
  'turnsEnabled turnsAtOnce turnWaitSeconds heapEnabled heapPercent memoryEnabled turnMemoryMb toolResultKb runningTurns heapAfterGcPercent';

export async function fetchBulkheads(): Promise<Bulkheads> {
  const data = await graphql<{ bulkheads: Bulkheads }>(`query Bulkheads { bulkheads { ${FIELDS} } }`);
  return data.bulkheads;
}

export async function setBulkheads(input: BulkheadsInput): Promise<Bulkheads> {
  const data = await graphql<{ setBulkheads: Bulkheads }>(
    `mutation SetBulkheads($input: BulkheadsInput!) { setBulkheads(input: $input) { ${FIELDS} } }`,
    { input },
  );
  return data.setBulkheads;
}

/** The values to send, from what the server holds. */
export function inputOf(held: Bulkheads): BulkheadsInput {
  return {
    turnsEnabled: held.turnsEnabled,
    turnsAtOnce: held.turnsAtOnce,
    turnWaitSeconds: held.turnWaitSeconds,
    heapEnabled: held.heapEnabled,
    heapPercent: held.heapPercent,
    memoryEnabled: held.memoryEnabled,
    turnMemoryMb: held.turnMemoryMb,
    toolResultKb: held.toolResultKb,
  };
}
