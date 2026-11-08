# Your browser and your computer

An agent can do the steps on a website, or on your own desktop, that you
would otherwise do by hand — while you watch, signed in as you, on the
computer in front of you. Four clients lend it those: the Orknux extension
for Chrome, Orknux for Windows, Orknux for Linux, and My Claude Code. Each is
installed on your computer, connects to your Orknux with a pairing code, and
is yours alone: only your own conversations reach it — your chats, the tasks
you started and the agents those asked — and nobody else on the server sees
it.

## Where they show

The corner of every page — the footer of a chat — has a pill for each client
that would run where you are reading: **Chrome** when you are in Chrome,
**Windows** or **Linux** for the desktop you are on, **Claude Code**
everywhere, beside **Orknux MCP**. A grey light is not connected; the pill
opens the client's page, where it is got. A green light is connected now, and
your agents can use it. A computer connected from elsewhere shows by its own
system: Orknux for Linux connected while you read in Windows is a lit Linux
pill, with Windows still offered beside it.

![The Integrations page, with the clients in its corner](/screens/integrations.png)

## Connecting a client

**Preferences › Connected clients** lists what you have connected — its name,
which client it is, when it last spoke — and disconnects one. **Connect a
client** makes a pairing link, good for five minutes:
`https://orknux.example.com/pair/K7P-4QX`. Paste it into the client — its side
panel, its window, the Claude Code session, the Shell — and the client trades
the code for a credential of its own and appears in the list within seconds.
The code works once; a link opened in a browser explains where to paste it.
Any account may pair, one from a directory too.

![Preferences › Connected clients, with a pairing link made](/screens/preferences-clients.png)

## The Orknux extension for Chrome

The extension lends your agents your own Chrome. An agent given the
`browser_*` tools opens pages, reads them, clicks, types, presses keys,
scrolls and takes screenshots — signed in as you, since it is your browser —
in a window of its own, its tabs grouped as **Orknux**. Your own tabs are never
read or touched: a tab you opened is refused. Chrome shows its "is debugging
this browser" bar while an agent drives, and Cancel there stops it at once;
so does closing the side panel or pressing Disconnect.

![The extension's side panel, connected](/screens/chrome-panel-connected.png)

Install it from the Chrome Web Store, or load the unpacked extension from
[orknux-chrome](https://github.com/orknux/orknux-chrome). Its side panel is
where you paste the pairing link, see whether it is connected, and read what
your agents did.

## Orknux for Windows and Orknux for Linux

These lend an agent your desktop. An agent given the `desktop_*` tools lists
the windows, starts a program or opens a file, reads a window through the
system's accessibility interface — every control with a ref it can click or
type into — presses keys, scrolls, takes a screenshot, and closes windows. It
works on your real screen and files, as you, so it asks before anything that
deletes, installs, spends money or sends something in your name. **Ctrl+Alt+Q**
stops it at once on either system.

**Orknux for Windows** ([orknux-windows](https://github.com/orknux/orknux-windows))
is a tray app: start it, paste the pairing link, press Connect, and it
reconnects by itself after a restart. It reads windows through UI Automation,
starts programs by their Start menu name, and types Polish and every other
alphabet exactly.

**Orknux for Linux** ([orknux-linux](https://github.com/orknux/orknux-linux))
does the same on GNOME, on Wayland as on X11. On Wayland it works through the
desktop's portals, so the first time GNOME asks whether to share the screen:
tick **Remember This Selection** and press **Share**, and it does not ask
again. If nobody is at the screen to answer, the agent is told within a few
seconds to ask you to press Share, and the computer stays connected
meanwhile.

![Orknux for Linux on a GNOME desktop, connected](/screens/linux-screen.png)

**Several computers at once.** Connect both, and an agent sees each by its
name — `Windows on <PC>`, `Linux on <host>` — when it lists windows, and every
desktop tool takes `computer` to say which. Left out, it stays on the one the
conversation used last. A computer that has gone is said to be gone, with the
ones that remain, rather than waited for.

## My Claude Code

My Claude Code is your own Claude Code session answering from Orknux. Pick it
in a chat's agent picker and what you write arrives in that session, through
the Orknux channel plugin for Claude Code
([orknux-claude](https://github.com/orknux/orknux-claude)); Claude's answers
come back into the chat, and an approval Claude Code wants is asked where you
wrote and answered there — `yes abcde` or `no abcde`. In a document, diagram,
wireframe or sheet, its assistant can be answered by it too, and it changes
the item itself through the workspace's Orknux tools; in Ask AI it is under
**Answered by**.

![My Claude Code in a chat's agent picker](/screens/chat-answered-by.png)

Two rules hold it inside Anthropic's terms and are not relaxed. Orknux never
holds or uses a Claude credential: Claude Code makes every model call, signed
in however you signed it in, and Orknux carries text and nothing else. And it
is a person's conversation, never a model provider: no agent, workflow,
trigger or schedule runs on it.

Press the **Claude Code** pill for the guide: install Bun and the plugin, start
Claude Code with the Orknux channel, and paste the pairing link into the
session. Only a session started with the channel collects your messages — the
plugin checks that its session hears it before it takes anything — so with
several Claude Code windows open, messages go to the one that was.

![The Claude Code guide, from the pill in the corner](/screens/claude-code-guide.png)
