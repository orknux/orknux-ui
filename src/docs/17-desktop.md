# Orknux on the desktop

Orknux also comes as an application for one computer, on **Windows** and
**Linux**. It is the whole product - the same server as the `orknux-one` image,
with its SQLite database - started by the application and shown in a window of
its own. Nothing else is installed beside it: the package carries its own Java.

It suits one person, or a small team on one office network, who want Orknux
without running a server: agents, chats, workflows, tasks and Design all work
as they do on a server, and so do scheduled workflows and a Slack connection,
for as long as the application is running.

## Installing it

The packages are attached to every release on GitHub, built after the server's
images are published:

| System | Package |
|---|---|
| Windows | `Orknux-Setup-<version>.exe`, an installer; or `Orknux-<version>.msi` for a machine that is managed with MSI packages |
| Linux | `Orknux-<version>.deb` for Debian and Ubuntu; or `Orknux-<version>.AppImage`, which runs without installing - make it executable and start it |

Install it as any application, and start **Orknux**. The first start takes a
little longer than the ones after it: the application makes its data directory
and an encryption key, and the server sets up an empty database. A splash says
it is starting; the window then shows the interface.

**Starting is quick.** The server inside runs from a prepared copy of itself, so
on a typical Windows machine the first page is there in about eight seconds. A
newer release the server has installed for itself (Admin ›
Updates, in the Administration chapter) starts the ordinary way, which is somewhat
slower, until the next package replaces it.

## A fresh installation

A new installation is ready to use as it opens:

- **Nobody signs in.** The server listens on this computer only, and the person
  at the machine is its administrator, under an account named after their
  user on the computer. Nothing on the network can reach it until you say so
  (see Letting others in, below).
- **It starts with a workspace**, called **Default**, set up as Admin ›
  Workspaces sets one up - so once a model is added under **Models**, a chat
  works straight away. Removing it later does not bring it back; a database that
  already had workspaces is never given one.
- **It updates itself** through the same signed releases a server takes, from
  Admin › Updates.

### Where its data lives

| System | Directory |
|---|---|
| Windows | `%APPDATA%\Orknux\data` |
| Linux | `~/.config/Orknux/data` |

The directory holds the database `orknux.db`, the encryption key `secret.key`,
the files people uploaded (`attachments/`), releases the server installed
(`releases/`), its log (`logs/orknux.log`, rotated at 10 MB with five kept) and
`desktop.json`, which says who may reach it. **Back up `orknux.db` and
`secret.key` together**: a database without its key opens with every stored
credential unreadable - every model key, every connection's secret. The
directory is laid out exactly as an `orknux-one` container's volume is, so it
moves between the two unchanged.

## Windows and tabs

The window works much as a browser does, so what is in a link's way can be
opened beside what you are doing.

- **A new tab**: a link the interface opens in a new tab, a **Ctrl**+click and
  the middle mouse button all open a tab in the same window. **Ctrl+T** opens a
  new one, **Ctrl+W** closes the one in front; closing the last tab closes the
  window.
- **Moving between tabs**: **Ctrl+Tab** and **Ctrl+Shift+Tab**, and
  **Ctrl+PageDown** and **Ctrl+PageUp**, which go round from the last tab to the
  first. The last two are yours to change: **Next Tab Shortcut** and **Previous
  Tab Shortcut** on Preferences.
- **Splitting a window**: drag a tab to the edge of a pane to give it a pane of
  its own on that side, as often and in whichever directions you like; the part
  of the pane it would take lights up. Dropped on another pane's tabs or the
  middle of its page, it joins that pane. Drag the line between two panes to
  resize them, double-click it to even them out. A pane closes with its last tab.
  A pane narrower than 900 pixels draws its page smaller rather than squeezing it.
- **Splitting from a tab**: right-click a tab and choose **Split horizontally**, one above the other, or **Split vertically**, side by side. A tab alone in its pane opens its page again in the new pane. Right-click the line between two panes and choose **Merge** to put their tabs back in one.
- **Moving between windows**: **Alt+Right** and **Alt+Left** go to the next and
  previous pane, and on through any other windows of the app. They are yours to
  change: **Next Window Shortcut** and **Previous Window Shortcut** on Preferences.
  With only one pane and one window open, the keys stay back and forward.
- **A new window**: right-click a link into Orknux and choose **Open link in new
  window**, or **Shift**+click it. **Copy link address** is there too. A window opened from a page with unsaved work
  asks before that work is left behind.
- **Links elsewhere**: a link to another site opens in your browser, a mail or
  phone link in the mail program. A link of any other kind is refused and the
  window says so - a chat can hold a link an agent wrote, and the operating
  system would otherwise run whatever is registered for it.

The window remembers its size and place.

### Closing it

Closing the window **does not stop Orknux**: it keeps running in the system tray,
because a scheduled workflow or a Slack mention does not wait for a window to be
open. Open it again from the tray icon, and choose **Quit Orknux** there to stop it -
the server is stopped first and waited for, so the database is closed cleanly.
On a Linux desktop without a tray, closing the window quits.

## Letting others in

**Admin › Settings › Network access** decides who can reach the application.
It is shown only on the desktop application's own server.

![Admin Settings' Network access, with Anyone on the network chosen: the
password to sign in with, twice, and Apply and restart](/screens/admin-settings-network.png)

- **This computer only, and nobody signs in** - the way it starts.
- **Anyone on the network, and everybody signs in** - for a team on one office
  network. Choosing it asks for the **password** you will sign in with from
  then on, twice and at least twelve characters, on your own account; nobody
  else can reach it until they have an account of their own (Admin › Users).
  The page lists the addresses others open it at.

**Apply and restart** applies the choice: the application starts its server
again, and the page waits and opens again. Going back to this computer only
works the same way, and from then on nobody signs in again.

## Files and uploads

The application takes uploads of up to **500 MB** a file - a chat attachment, a
file on an issue, on Artifacts or for a research, a picture or a document
imported - where a server or an image keeps 25 MB unless told otherwise. It is
the **Largest file** limit in Admin › Settings, which can be changed there.

## When it will not start

If the server stops on its own, a window shows the last lines of its log and
offers to start it again. The whole log is `logs/orknux.log` in the data
directory.

- **A release the server installed will not start**: the application falls back
  to the one it shipped with, as a server does, and Admin › Updates says why the
  chosen release was not started - for example a release built for a newer Java
  than the application carries.
- **Port 8080 is taken**: nothing to do. The server takes another free port by
  itself.
- **Every stored credential has stopped working**: the database was copied
  without its `secret.key`, or the key was replaced. Put back the key that was
  beside the database; making a new one cannot recover them.
