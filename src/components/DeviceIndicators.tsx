import { useState } from 'react';

import { useMyDevices } from '../api/devices';
import chromeLogo from '../assets/chrome-logo.svg';
import claudeLogo from '../assets/claude-logo.svg';
import windowsLogo from '../assets/windows-logo.svg';
import linuxLogo from '../assets/linux-logo.svg';
import type { DeviceStatus } from '../api/devices';
import { inDesktopApp } from '../session/desktop';
import { ClaudeCodeGuide } from './ClaudeCodeGuide';
import { useHoverHint } from './HoverHint';
import type { HintHandlers } from './HoverHint';
import styles from './DeviceIndicators.module.css';
import { t } from '../i18n';


interface NavigatorWithHints extends Navigator {
  userAgentData?: { platform?: string; brands?: { brand: string }[] };
}

/** Which of the Orknux clients would run where this page is being read. */
export function clientsHere(nav: NavigatorWithHints = navigator, desktopApp = inDesktopApp()) {
  const agent = nav.userAgent ?? '';
  const brands = nav.userAgentData?.brands?.map((one) => one.brand) ?? [];
  const windows = nav.userAgentData?.platform === 'Windows' || /Windows/.test(agent);
  // A Linux desktop, not Android - whose browser says Linux too, and has no desktop for Orknux for Linux to drive.
  const linux = !windows && (nav.userAgentData?.platform === 'Linux' || (/Linux|X11/.test(agent) && !/Android/.test(agent)));
  // Chrome itself, not every Chromium: Edge and Opera say Chrome too, and the desktop app is Chromium inside.
  const chrome = !desktopApp && (brands.includes('Google Chrome') || (/Chrome\//.test(agent) && !/Edg\/|OPR\/|Electron\//.test(agent)));
  return { chrome, windows, linux };
}

/**
 * Beside Orknux MCP in the corner: the Chrome extension where the page is read in
 * Chrome, the Claude Code plugin everywhere, and the desktop client - the one
 * connected, by its system, or else the one for the system this page is read
 * on - each a link to get it until it is connected, and then a quiet word that it is.
 *
 * Connected rather than installed, because that is all the server can know.
 */
/** Where Orknux for Linux is got. */
const LINUX_INSTALL_URL = 'https://github.com/orknux/orknux-linux';

export function DeviceIndicators({ admin = false, compact = false }: { admin?: boolean; compact?: boolean }) {
  const devices = useMyDevices();
  const [guiding, setGuiding] = useState(false);
  // The application's own hint rather than a title: the browser's grey box is drawn late, in its own font.
  const { hintFor, hint } = useHoverHint();
  const here = clientsHere();
  const pill = compact ? `${styles.indicator} ${styles.compact}` : styles.indicator;

  if (devices === null) return null;
  // A pill for each system with a computer connected, lit by its own connection - Windows and Linux at once are two
  // pills - and, for this system, the pill to get its client even while none is connected.
  const desktopOf = (system: string) => (devices.desktops ?? []).find((d) => d.client === system);
  const windowsDesktop = desktopOf('Windows');
  const linuxDesktop = desktopOf('Linux');
  const showWindows = !!windowsDesktop || here.windows;
  const showLinux = !!linuxDesktop || here.linux;
  const statusOf = (found: DeviceStatus | undefined, installUrl: string): DeviceStatus =>
    found ? { ...found, installUrl } : { connected: false, client: null, version: null, installUrl };
  return (
    <>
      {here.chrome && (
        <Indicator pill={pill} hintFor={hintFor} status={devices.browser} name="chrome" logo={chromeLogo} label="Chrome"
          connectedHint={t('Your agents can use this browser while the Orknux side panel is open.')}
          getHint={t('Get the Orknux extension for Chrome, so your agents can use this browser.')} />
      )}
      {devices.claudeAvailable && (
        <>
          {/* A guide rather than a link: connecting it is five steps, filled in for this server. */}
          <button
            type="button"
            className={pill}
            onClick={() => setGuiding(true)}
            {...hintFor(devices.claude.connected
              ? t('Your Claude Code session is connected. Pick My Claude Code in a chat to talk to it.')
              : t('How to connect your Claude Code to Orknux, step by step.'))}
            data-testid="device-claude"
            data-connected={devices.claude.connected ? 'true' : 'false'}
          >
            <img src={claudeLogo} alt="" className={styles.mark} aria-hidden="true" />
            {/* Products' own names, the same in every language. */}
            Claude Code
            <Light on={devices.claude.connected} />
          </button>
          <ClaudeCodeGuide open={guiding} onClose={() => setGuiding(false)} connected={devices.claude.connected} admin={admin} />
        </>
      )}
      {showWindows && (
        <Indicator pill={pill} hintFor={hintFor} status={statusOf(windowsDesktop, devices.desktop.installUrl)} name="windows" logo={windowsLogo} label="Windows"
          connectedHint={t('Your agents can use this computer while Orknux for Windows is connected. Ctrl+Alt+Q stops them.')}
          getHint={t('Get Orknux for Windows, so your agents can use this computer.')} />
      )}
      {/*
        The same door and the same desktop tools as Windows: Orknux for Linux is
        a second client of DeviceKind.DESKTOP, so the status is the desktop's.
        Its address is said here, not by the server, until the server knows a
        desktop client by the system it runs on.
      */}
      {showLinux && (
        <Indicator pill={pill} hintFor={hintFor} status={statusOf(linuxDesktop, LINUX_INSTALL_URL)} name="linux" logo={linuxLogo} label="Linux"
          connectedHint={t('Your agents can use this computer while Orknux for Linux is connected. Ctrl+Alt+Q stops them.')}
          getHint={t('Get Orknux for Linux, so your agents can use this computer.')} />
      )}
      {hint}
    </>
  );
}

/**
 * Whether the client is connected: green when it is, grey when not. The pill
 * is the product's logo, its name and this light; the tooltip says it in words.
 */
export function Light({ on }: { on: boolean }) {
  return <span className={on ? styles.lightOn : styles.lightOff} data-state={on ? 'on' : 'off'} aria-hidden="true" />;
}

function Indicator({ pill, hintFor, status, name, logo, label, connectedHint, getHint }: {
  pill: string;
  hintFor: (text: string) => HintHandlers;
  status: DeviceStatus;
  name: string;
  logo: string;
  /** The product's name and nothing else; whether it is connected is the light. */
  label: string;
  connectedHint: string;
  getHint: string;
}) {
  // A link either way, to the client's own page: connected, it is where its releases and its instructions are, and
  // a pill that did nothing when pressed read as broken.
  return (
    <a className={pill} href={status.installUrl} target="_blank" rel="noopener noreferrer"
      {...hintFor(status.connected ? connectedHint : getHint)}
      data-testid={`device-${name}`} data-connected={status.connected ? 'true' : 'false'}>
      <img src={logo} alt="" className={styles.mark} aria-hidden="true" />
      {label}
      <Light on={status.connected} />
    </a>
  );
}
