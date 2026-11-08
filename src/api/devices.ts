import { useEffect, useState } from 'react';

import { graphql } from './client';

/** One of the person's own Orknux clients: connected now or not, and where to get it. */
export interface DeviceStatus {
  connected: boolean;
  client: string | null;
  version: string | null;
  installUrl: string;
  /** The computer's own name, such as Linux on studio; only in `desktops`. */
  name?: string | null;
}

export interface MyDevices {
  browser: DeviceStatus;
  desktop: DeviceStatus;
  /** The person's Claude Code session, through the Orknux channel plugin. */
  claude: DeviceStatus;
  /** Every desktop connected now, each by its system in `client`: Windows and Linux at once are two. */
  desktops: DeviceStatus[];
  /** Whether My Claude Code is offered to the person. */
  claudeAvailable: boolean;
  /** Whether an MCP client of the person's is connected to Orknux MCP now, in any workspace. */
  mcp: boolean;
}

/** The signed-in person's Chrome extension and Orknux for Windows; see `devices.graphqls` on the server. */
export async function fetchMyDevices(): Promise<MyDevices> {
  const data = await graphql<{ myDevices: MyDevices }>(
    'query MyDevices { myDevices { browser { connected client version installUrl } desktop { connected client version installUrl } claude { connected client version installUrl } desktops { connected client version installUrl name } claudeAvailable mcp } }',
  );
  return data.myDevices;
}

/** How often the corner asks again, so connecting a client shows up without a reload. */
const EVERY_MS = 30_000;

let latest: MyDevices | null = null;
const listeners = new Set<(devices: MyDevices) => void>();
let timer: number | null = null;

function read() {
  fetchMyDevices().then(
    (devices) => {
      latest = devices;
      listeners.forEach((listener) => listener(devices));
    },
    () => {},
  );
}

/**
 * The person's clients, asked once for everything on the screen that shows
 * them - the client pills and Orknux MCP - and again every half minute while
 * anything does. One poll, so two pills can never disagree about the same answer.
 */
export function useMyDevices(): MyDevices | null {
  const [devices, setDevices] = useState<MyDevices | null>(latest);
  useEffect(() => {
    listeners.add(setDevices);
    if (timer === null) {
      read();
      timer = window.setInterval(read, EVERY_MS);
    }
    return () => {
      listeners.delete(setDevices);
      if (listeners.size === 0 && timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return devices;
}
