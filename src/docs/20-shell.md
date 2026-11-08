# Orknux Shell

Orknux Shell is Orknux in a terminal: a conversation with an agent, drawn as
it happens, on the computer you are sitting at. It is also a door for the
agent into that computer — with your say-so, it runs commands there, in the
directory you started the Shell in — so the agent you talk to can read the
repository in front of you, run its tests and fix what it finds.

![A turn in Orknux Shell: the thoughts folded to a line each, the command the
agent ran and what came back, and the answer](/screens/shell-chat.png)

It is a client of the server, like the browser: everything it may see and do
is decided there, and a message typed here lands in the same chat the browser
shows. `orknux-chrome`, `orknux-windows` and `orknux-linux` are its siblings;
[Your browser and your computer](/docs/21-your-computer) describes them.

## Installing

One line on each system:

```bash
curl -fsSL https://orknux.ai/install/shell.sh | sh        # Linux
```

```powershell
irm https://orknux.ai/install/shell.ps1 | iex              # Windows, in PowerShell
```

Each installs the newest release from orknux.ai, signed, into your own
profile. The Shell keeps itself current: it looks for a newer version when it
starts and once an hour after that, says so in the welcome and the status bar
— **update to 1.0.36 · /update** — and `/update` installs it, checking the
signature against Orknux's release key before anything is put in place. Start
it again to use the new one.

## Connecting

Start it with `orknux`. The first time it asks for your server's address and
how to sign in; paste the pairing link from **Preferences › Connected clients
› Connect a client**, which works for every account, a directory one too. What
it connected to is kept in your profile, so the next start signs in by itself.
Then it asks which workspace and which agent, and remembers both.

## The screen

The welcome at the top says where you are: the server, the workspace, the
agent and the mode. The status bar at the bottom says what is going on: the
agent, the mode, the tokens spent and their cost, how fast the model reads
and writes, how many subagents the chat has, and — when one is out — that a
newer Shell can be installed. Above it, while a turn runs, one live line says
what the agent is at this moment: **Reading the prompt 40%**, **Thinking**,
**Preparing a tool call: terminal_run**, **Running terminal_run: git status**,
**Writing the answer**, each with its clock. Where the Shell knows nothing yet
— a call queued at a busy model server — it says **Waiting for the model**
rather than guessing.

Thoughts are folded to one line each, **Thought for 12s**, and a tool call to
one line with what it was given and what came back. **Ctrl+O** unfolds every
one of them on the screen — the thinking in full, each call's arguments and
answer — and folds them again; it works at the prompt and while a turn runs,
and the scrollback keeps whichever view you chose.

Type `/` and the commands are listed under the prompt, narrowed as you type;
the arrows move, Tab completes, Enter runs, Esc closes.

![The commands listed under a slash](/screens/shell-commands.png)

## While the agent works

You can keep typing. Enter queues what you wrote for when the turn ends — it
is sent then, as the next message — and the queue is shown under the live
line. **Ctrl+S** sends it into the turn now instead: the agent reads it at its
next step, as you speaking, and can change course without being stopped. The
live line counts what is waiting — **1 waiting to be read at its next step** —
and the transcript marks **✓ read: …** when the agent has taken it. An agent
reads its inbox only between steps, so a message waits as long as the current
model call does.

Commands that neither start a turn nor change the conversation run at once
while the agent works — `/usage`, `/sessions`, `/mode`, `/help`, `/update` and
their like; the list under the slash says which Enter will run now and which it
will queue.

**Ctrl+C** or **Esc** interrupts the turn; pressed again, the Shell stops
waiting for the answer.

## Sessions, and following a subagent

A chat has a session of its own and one for every agent it asked. `/sessions`,
or **Ctrl+T**, lists them — the chat's own first, marked **(main)**, then the
asked agents and the side chats, active ones in green — with what each spent
and what it is about.

![Ctrl+T: the sessions of this chat](/screens/shell-sessions.png)

Choose one and it is followed on its own screen: its transcript so far, drawn
as the main one is, and then what it does as it does it — its thoughts, its
tool calls, its own live line, its own count in the status bar. Ctrl+O there
streams its thinking live. The chat's own turn goes on unseen meanwhile, and
**Ctrl+T, Enter** goes back to it with everything that came in between.

![Following a subagent as it fetches pages](/screens/shell-follow.png)

On a subagent's screen, what you write goes to that subagent and nowhere else:
Enter and Ctrl+S both send it into its turn, where it reads it at its next
step. Once it has finished, the Shell says so and sends nothing rather than
redirecting your words to another agent.

![A message sent into the followed subagent's turn](/screens/shell-follow-sent.png)

`/orkx-web-session` opens the session on the screen in the browser;
`/orkx-web-chat` and `/orkx-web-agent-settings` open the chat and the agent's
settings page.

## Commands on your computer

The agent runs commands on the computer the Shell runs on, through the
`terminal_run` tool, in the directory the Shell was started in. Before each
one the Shell asks you — **Approve**, **Approve for pattern**, **Deny** —
unless a rule already answers: `/rules` shows them, and **Approve for
pattern** writes one for the program and its first word, so `git status` is
asked about once. `/mode` cycles the three modes: **auto** runs what the
rules allow and asks about the rest, **ask** asks about everything, **plan**
lets the agent write nothing. Shift+Tab does the same.

Every command is in the workspace's audit log. The door is open only while the
Shell runs, and only to the agent of the chat written in this Shell: with the
Shell open on two computers under one account, a chat's commands run on the
computer that chat is being written on, never the other.

## Other agents

`@agent message` asks another agent in a side conversation without switching;
`/agent` switches, and lists **My Claude Code** where the server offers it —
your own Claude Code answering, as the browser offers it. `/subagents` reads
what an asked agent said. `/goal <what> until <condition>` sets a goal, judged
each iteration.

## Shortcuts and looks

`/config` lists the Shell's shortcuts — expand (Ctrl+O), sessions (Ctrl+T),
send now (Ctrl+S) — and changes one: choose it and press the new key, or
`/config send-now ctrl+g`. Ctrl and a letter only, never one the terminal or
the line already uses. `/theme` picks a colour and changes it; what you send is
drawn on a background a shade lighter than the terminal's, the theme's
`message` colour. Both are kept in the configuration file `/config` names.
