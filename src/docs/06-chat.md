# Chat

Chat is a conversation with one of the workspace's models, or with one of its
agents. Each conversation has its own address, so a chat can be linked to and
reloaded.

Whether an installation has a chat at all is an administrator's decision; see
Administration.

![A conversation: the chats held on the left, the model answering above, and the
composer beneath](/screens/chat.png)

## Choosing what answers

The dropdown above the composer picks which agent answers, and an agent is the
only thing that can. A bare model used to sit beside them as though it were a
peer, and it never was: it is an agent with the instructions, skills, tools,
grants and memory taken off. A workspace with no agent in it says so and offers
the way to add one, rather than quietly filling the gap with a model. Chats
started on a model before this still open, still render and still answer, and
can be handed to an agent whenever you want.

Beside the name is the arrow that leaves a box, the same one every field naming
a definition carries: it opens the agent in a tab of its own, so a question about
what it is set to does not cost you the conversation.

**Ask for a diagram and you get one.** Where the workspace has chosen a
text-to-image model, the agent is offered a tool that draws from a description
— so a picture is something you ask for in the conversation rather than a mode
you switch the composer into and retype the description in. What it draws is
filed as an attachment on the chat and appears in the thread as it is drawn, so
it is still there when you come back to it. A workspace with no image model
chosen offers no such tool, and the agent is never told it could have drawn.

![A picture asked for in the conversation, drawn into the
thread](/screens/chat-picture.png)

**How hard it thinks is yours to choose, per chat.** Where the model answering
takes a reasoning effort, a small button beside the microphone opens a menu of
Model default and the levels that model takes. What you pick is sent with this
chat's next turns and nothing else: the model's own setting, and every other
chat, agent and workflow using it, stay as they were. A model that takes no
effort shows no button.

Switching workspace from the corner leaves you in the chat rather than taking
you to the new workspace's workflows: the conversations listed on the left are
the ones held in whichever workspace the corner names.

## Asking again

Under the last answer is a circling arrow: it asks the same question again.
Whatever the dropdown says answers this chat is what answers, so a different
model or agent means picking one first — moving the dropdown and pressing this
is "answer that again, as somebody else".

Nothing is lost by pressing it. The answer it replaces is kept, and the row
underneath says which take you are reading — **1 of 2**, with a chevron either
side — so the one you had is one press away, and stays there.

Only the answer the conversation ends on can be asked again. Anything earlier
has been answered on top of, and a different answer there would rewrite what the
turns after it were replying to.

A chat that ends on your own message with nothing under it - the turn died, was
stopped, or the page lost it - offers **Answer this** under the message, rather
than making you type it again.

## While it works

You do not have to wait for the answer to say something else. **A message
written while the agent is working goes to the turn that is running**, and the
agent reads it at its next step - between two tool calls, not at the end. Until
then it says *Queued - the agent reads it at its next step*, and afterwards
*Read by the agent*, and it is drawn where the agent read it, after the calls it
made before reading it. That is the difference between correcting a piece of
work half way through and stopping it to start again with a better prompt.

What the agent writes beside its tool calls - how it reports progress - appears
as it is written, and every agent is told to say what it is about to do and to
post a line every few calls, so a long turn reads as work going on rather than a
spinner. While a model writes a long tool call or its answer, the chat says
*Writing the answer…* or which tool it is writing, and how much has arrived.
Its thinking is drawn in red, apart from the answer, with how long it took.

A question an agent asks you - whether to expose a port of a box, for one - sits
at the bottom of the chat until you answer it, then moves to where it was asked,
between the calls around it.

**Every chat is answered in a session**, and the mark in its header opens it in
a tab of its own from the moment the first turn starts: the whole transcript,
every tool call, the thinking, the box sessions, the to-do list and the notes
the agent keeps, and what the chat has cost. See *Sessions* under AI. A chat's
agent has the same session tools as a workflow step or a task - notes to self,
the to-do list, the clock, scratchpads, reminders and watchers.

**Progress messages for one message.** How much an agent says while it works
is its own setting, **Progress messages**, on its page. A message can ask for
another level for its own turn only: `!progress-none`, `!progress-low`,
`!progress-medium` or `!progress-high` anywhere in it - with the workspace's own
command marker, `!` unless the workspace chose another. The chat's command menu,
opened by typing the marker, offers the four first, and Tab completes one. The
next message goes back to the agent's own level. **None** is held to by the
server, not only asked for: what the agent writes beside its calls is kept in the
session and not drawn in the chat. The same words work in a Slack message to a
workflow's agent node. They are never looked up as skills.

## Default, Plan and Auto

![A chat in plan mode: the agent has looked and put its plan to you, with
Approve, Keep planning and Reject under it](/screens/chat-plan.png)

The switch beside the reasoning-effort button, before the microphone, sets how
this chat's agent works. It is per chat, and each row says what it means when
you point at it:

| Mode | What the agent may do |
| --- | --- |
| **Default** | Asks you where a tool needs your leave - exposing a port of a box, for one - and otherwise works as it always has. |
| **Plan** | Only looks, then asks you to approve a plan. It is offered only the tools that change nothing - as each tool's own declaration says, an MCP server's read-only hint included - and anything else it calls is refused with a sentence saying nothing ran. When it knows what it would do, it puts the plan in the chat: what it found, then the steps, each saying what it will change. |
| **Auto** | Goes ahead without waiting for you to allow a step: a call that would ask for your leave runs. It is given nothing it was not granted - Auto lifts the asking, not the limits. |

A plan arrives with three answers under it, and **Or answer in your own words**
beneath them. **Approve** returns the chat to Default and hands the plan back to
the agent to carry out, step by step. **Keep planning** leaves it in plan mode
and tells it to look further and present the plan again. **Reject** leaves it in
plan mode too, and tells it not to carry out any of it but to ask what you want
instead. What you type in the box goes with your answer.

## Times, dates, cost and you

**Each message carries when it was sent**, the date included even for today's,
so a chat read the next morning says which day each line belongs to. That is
the workspace's **Show when each message was sent**, under Chat in its settings,
on unless a workspace turned it off. Each tool call in a turn carries the time
it was made, to the second, whatever the setting.

**What each answer cost** is shown under it - the turn's tokens and, where the
model's page has its prices, their price - and the chat keeps a running total
in the corner of the composer. It is the whole turn, not the last call in it: an
agent that looked something up before answering paid for two rounds. It says
how much of what was read the provider served from its cache where the provider
reports that, because every round sends the whole conversation again, and
without that number a long chat on a local server reads as millions of tokens it
mostly never read twice. Nothing is shown where the provider reported no counts.
It is on for everybody until they turn it off under **Preferences → Answer
Cost**.

**Your avatar** - your initials - is drawn at the top of each of your messages,
on its left, as the agent's is beside its answers. **Preferences → Avatar in
Chat** turns it off.

## While you type

![The composer suggesting how the sentence goes on, in grey after what was
typed](/screens/chat-completion.png)

A workspace that chooses a **Completion Model** in its settings gets two things
in the chat. With none chosen, the composer is as it always was.

**How the sentence goes on.** A short pause after you stop typing, the composer
suggests the rest of the sentence in grey after the caret. **Tab** takes it;
typing on, or **Escape**, puts it away. The model is shown the chat's latest
messages as well as what you are typing, so a suggestion reads as a reply to
what is on screen. How many messages it is shown, how long a suggestion may
be, its time limit and the pause before asking are under Admin → Settings.

**Suggested replies.** Under the latest answer, once it is finished and nothing
is typed, a few short replies you might send next are offered as chips - three
by default. A click sends one as your message, and they go as soon as anything
is sent. They are written once per answer and kept, so reopening the chat does
not ask again. How many (0 for none), how long and how long they may take are
under Admin → Settings → **Suggested Replies**.

![Replies offered under the latest answer](/screens/chat-suggested-replies.png)

## What an answer can hold

An answer is Markdown, drawn as such, and a good deal more than text:

![An answer with a formula, a shell block with Copy and Run, and a
table](/screens/chat-rich.png)

- **Maths.** `$x$`, `$$x$$`, `\(x\)` and `\[x\]` are set as formulas, in a chat
  and wherever else the product draws Markdown - task outcomes, issues. A price
  like "$5 and $10", and anything inside code, stays as written.
- **Code** in a fenced block has a bar with its language and **Copy**, which
  takes exactly the block's text.
- **Run on shell blocks.** Beside Copy, an administrator can run a block tagged
  as a shell on the machine the server is on, read what it printed and its exit
  code under the block, and **Stop** it. Only the shells that machine has are
  offered: `powershell` and `cmd` on Windows, `sh` and `bash` on Linux. An
  untagged block never has Run - as often as not it is what a command printed. **Run as
  administrator** asks the operating system - UAC on Windows, pkexec on Linux -
  never Orknux. Admin → Settings → **Run commands from the chat** switches it:
  off for a server, on in the desktop app, until somebody changes it. Every run
  is audited; its time limit and how much output is kept are under Limits.
- **Sound.** An mp3, flac, wav, ogg or m4a under a message plays in the
  browser's own player, with a download beside it. A MIDI file has **Play**,
  which renders it on the server the first time and plays it after. An agent
  that made a sound attaches it to its answer; in a voice conversation, and only
  there, it can play it to you before the answer is read.
- **Video.** A video under a message plays there.
- **Pictures, drawings, wireframes and diagrams** an agent draws for you appear
  above its answer as they are drawn, with a link to open a wireframe or a
  diagram in its editor. A picture an agent draws only to look at itself is not
  put in the chat.
- **Links to what a tool call named.** A tool call that started a run, filed an
  issue, or named a research, a task, a document or any other item with a page
  links to it from its own line, folded or not - *Issue #12: Nightly billing
  export failed three nights running*. The link is there while the turn is
  going and after a reload.
- **Thinking**, where the model thinks, is a folded red card where it happened:
  before the answer, or between two tool calls.

![An agent that filed an issue: the call's line links to the issue it
filed](/screens/chat-item-link.png)

## When the agent asks you

Some things an agent cannot do without you, and it asks in the chat rather than
guessing. The question sits at the bottom of the chat until you answer it, then
moves to where it was asked.

- **A question with options** - one row per answer with a line on what each
  means, several to tick where the agent allows it, and a box for your own
  words. Agents use it for any question whose answers they can list.
- **Tools it lacks.** Rather than saying it cannot do something, an agent can
  list the tools it could be given - built-ins switched off for it, the
  workspace's and plugins' tools, MCP servers, Orknux access - and ask for the
  ones it needs, each named with what it does, with **Accept** and **Refuse**.
  Accepted tools are the agent's for good, recorded as a change to the agent.
- **A box, or a connection** of the workspace's to use, accepted or declined
  the same way.
- **Leave for a step**, such as exposing a box port - unless the chat is in
  **Auto**.

## Reviews

A conversation can be reviewed: a score from 1 to 5 and a few words. **Send a
review** in the chat's **+** menu writes one; telling the agent what you thought
works too - it sends the review itself. A review is drawn in the chat where it
was sent, and Admin → Reports → Ratings lists every one. A review taken back
stays in the chat marked *taken back*, with a line where it was taken back, and
no longer counts in the reports.

## Timers above the message box

An agent can put **widgets** above the message box: timers and stopwatches that
tick as you watch, appearing mid-turn without a reload. "Give me five minutes
for the tea" is then a timer you can see rather than a promise. You can
**Pause**, **Resume**, **Reset**, **Lap** and **Remove** them yourself, and the
agent is told to look at how they stand before it acts on one. A timer the agent asked to
be woken by tells it when it ends.

A timer **chimes** when it reaches nought in the chat that is open. That is the
workspace's **Chat timers sound when they end**, under Chat in its settings, on
by default; an agent makes one timer sound or stay silent only when you tell it
to. **Widgets Per Chat** (8) and **Longest Chat Timer** (a day) are Admin
settings. Widgets belong to a chat - a workflow step has no message box to draw
one over.

## Attachments

The **+** to the left of the composer attaches files — several at once — a
picture pasted into the composer is attached the same way, and files dropped
anywhere on the chat are attached as the button attaches them. A message may carry
only an attachment, with nothing typed. Files are stored on the server, in a
directory of their own per workspace, and are shown **under the message they
came with**: yours, or the answer of the turn that drew or filed them. A chat's files are as private as
the chat: they are readable by whoever the conversation belongs to rather than
by everybody who can see the workspace, and one still sitting in a composer
belongs to whoever uploaded it until the message carrying it is sent. An issue's
files are different, and deliberately so - those belong to the people working
the issue, which is the whole workspace. Images are previewed in the chat
and are sent to the model as images, so a model that can see will describe what
is in the picture.

**Every file reaches the agent.** A PDF, a log, a spreadsheet or any other file
attached to a message is kept where the agent's tools can read it - at any size
the upload limit takes - and the agent is told how. An SVG is shown to the model
drawn, since no provider reads one as a picture. A sound or a video is sent to
the model itself only where the model's page has **Takes audio** or **Takes
video** on, and only with the turn it came with; a model without it, or a file
over Admin → Settings' limit for sound or video (20 MB each), is refused in a
sentence before the model is asked. A MIDI file is read rather than heard - its
tracks, tempo and every note - since no model hears MIDI. How large any file may
be is Admin → Settings → **Largest file**.

Attachments can be switched off for the whole installation. When they are off,
the button is not offered.

## Speaking instead of typing

The microphone to the left of Send records, and sends what it recorded to the
workspace's speech-to-text model. While it records, a meter shows what it is
hearing across five registers — a muted microphone and a working one look
identical otherwise.

Recording is converted to 16 kHz mono WAV in the browser before it is sent,
because that is what transcription servers actually decode.

The microphone appears only once the workspace has a transcription model.

## Talking to it

**Voice** — the filled circle with a waveform in it, beside the microphone at
the end of the message box — holds the conversation out loud: it listens, sends
what it heard, reads the answer back, and listens again — no key pressed
between turns.

The panel is one large circle, and the circle is the state:

| It looks like | It is |
| --- | --- |
| Moving with your voice | **Listening** — speak, and it answers when you stop |
| Breathing on its own | **Thinking** — the model has your turn |
| Ringing outward | **Speaking** — reading the answer back |

A turn ends when you stop talking: two and a half seconds of quiet, once it has
heard speech, is taken as your turn ending — nothing is sent while a room is
merely quiet. What counts as speech is measured against the room rather than
against a fixed loudness, so a quiet voice in a quiet room is still a voice. A
microphone nothing else has closed gives up after ten minutes, which is a fuse
for one left open in an empty room and not a limit on how much you may say.

A workspace can move all of these, under **Workspace Settings → Voice**, because
none of them is a fact about audio that one answer settles — it is a room, a
microphone and a person, and those differ:

![Workspace settings: the models a chat may speak and listen with, and the three
boxes voice mode is governed by](/screens/workspace-settings.png)

| Setting | What it does |
| --- | --- |
| Pause Before It Answers | How long you can go quiet before it answers. Raise it if it cuts in while you are still talking; lower it if it sits there after you have finished |
| Voice Above The Room | How far above the room's own noise a sound has to stand to count as a voice. Turn it down if it stops while you are still talking, or if you speak quietly; up where a fan or a conversation behind you is heard as you and the turn never ends |
| Unattended Microphone | How long an open microphone stays open where no pause ever comes |
| Talking Over The Answer | How long you keep talking over an answer before it stops and listens. A length rather than a loudness, because what has to be kept out is a short noise - a cough, a door, the application's own voice getting past echo cancellation. A second by default - half a second still let a word said to somebody else in the room stop the answer. 0 where the answer stops on nothing |

Each box is empty until somebody sets it, and empty is voice mode's own value —
what the empty box says. Emptying one again puts it back rather than leaving it
on whatever was set last. A value outside what is allowed is refused when it is
saved, in a sentence naming what is allowed.

Tapping the circle interrupts: while it is thinking or speaking, it drops that
turn and listens; while it is listening, it takes what you have said so far as
the whole turn. Dropping the turn stops the model as well as the listening —
the request is aborted and the server hangs up on the provider, so nothing goes
on being written and charged for after you have said you are not interested. An
answer that was stopped is not written to the history: the chat keeps your
question and no answer, rather than half a sentence attributed to the model.
**Stop** beside the send button does the same for a typed turn.

**The microphone does not close between turns.** Anything said while the model
is thinking or the answer is being read is held rather than lost, and is sent
when the turn comes round — the panel shows it under the circle, marked
**Waiting**, so you can see it was caught. A second thing said while one is
already waiting is added to it, since both were said to the same turn. Cutting
in with the circle throws the waiting message away: it means "listen to me now",
and answering what you had already moved on from is not that. **Cancel** beside
a waiting message throws it away without cutting in.

**Talking while it thinks waits, unless the workspace says otherwise.** By
default a model still working out its answer is left to finish, and what you
said while it thought waits for the turn after - a follow-up said into the gap
is added to the conversation rather than replacing the question. A workspace
that turns on **Talking while it thinks stops it too** gets the other way:
talking for as long as *Talking Over The Answer* asks stops the model and
listens, as talking over the answer does, and what you said is the next turn.

**Mute** on the panel - or your **Voice Mute Shortcut**, `Alt`+`M` unless you
chose another in Preferences - stops it hearing you. Muted, nothing you say is
heard, transcribed or sent, and the answer being read aloud goes on; the panel
says *Muted* and which keys speak again, so the conversation stays open while
you are not part of it.

You can type as well as speak. The message box stays live while the panel is
open, and what is sent from it is a turn like any other — held by the same rules
and read back aloud in the same way.

The transcript stays beside the panel, and a spoken conversation lands in it
exactly as a typed one does — same chat, same history, and the same *Waiting for…*
under the turn while the model works — so the conversation can be read back
afterwards rather than only remembered. What it made of your last turn is shown
under the circle, where a mishearing is obvious.

Voice is offered only where the workspace has both a transcription model and a
speech model. A turn that fails — nothing transcribed, a provider that will not
answer — says so and goes back to listening rather than ending the conversation.

**How fast it reads.** **Reading speed**, beside **Mute** on the panel, sets how
fast the answer is read, from 0.75× to 2×; **Default speed** is the
installation's own pace. The choice is kept in your browser, and it applies to
the speaker under an answer as well. A local speech server that ignores the
speed reads at its own pace.

Voice is always on the chat bar. Where the workspace has no speech or
transcription model it is drawn off rather than hidden, and pointing at it says
which model is missing and links to where it is chosen. A workspace that does
not want it at all ticks **Hide the voice mode button** in its settings' Voice
card.

## Listening instead of reading

The speaker under an answer reads it aloud, using the workspace's text-to-speech
model. Pressing it again stops; so does leaving the chat, since an answer read
aloud over a conversation nobody is looking at is a voice from nowhere.

Reading starts on the first sentences rather than on the whole answer, so a long
one begins about as quickly as a short one; the rest is made while what you are
hearing plays. The button says it is working until sound actually starts,
because a control that looks inert gets pressed twice. Only one answer is read
at a time, and while it is read a bar and a percentage beside the speaker - and
under voice mode's caption - say how much of it has been heard.

What is read is what the answer *renders to*, not the markdown it is written in:
no asterisks, no backticks, no hashes in front of a heading, and a link is read
as its text rather than as its address. A fenced code block is announced rather
than read out — a block of code said character by character is minutes nobody
can follow, and saying nothing at all leaves the answer referring to something
you were never told was there.

The audio is played and not kept: nothing is written to the server, and the
speaker appears only once the workspace has a speech model.

## Attachments, previewed

A picture the agent drew is a picture like any other: it is under the answer
that drew it as soon as it is drawn, without a reload, and clicking it opens it
over the conversation. There is no longer a strip of files above the composer.

![A chat that drew twice - a snowy pine forest, then a harbour town at dusk - with
each picture under the answer that drew it](/screens/chat-pictures.png)

Clicking a picture in a chat opens it over the conversation rather than in a new
tab, with the arrow keys stepping between the pictures in the same group.
Anything that is not a picture downloads instead — the server sends those as
attachments, so there is nothing a viewer could show.

![The snowy pine forest from that chat, opened over the
conversation](/screens/picture-viewer.png)

## The Ask AI button

![The quick chat, open over a page and answering about what is on it](/screens/quick-chat.png)

The **quick chat** — the button says **Ask AI**, workspace settings calls it the
Quick Chat Model, and it is the same thing. It is not the chat this chapter is
otherwise about: an installation with chat switched off still has it, and what
takes it away is choosing None for its model.

Bottom right of every page except this one, a small panel that answers about
**what you are looking at**. Not here, because a second conversation floating
over the one you already have open is two boxes to type a question into. It is told which page you have open, so "why did this fail" on a
run page means that run, and it can look up the workspace's workflows, runs and
agents to answer.

It reads and nothing else, unless the workspace says otherwise — **Let it make
changes** under Settings. Off, it says plainly that it cannot. On, it can act on
the workspace when asked: start a run, repeat a past one on the same input, and
turn a workflow or an agent on or off. Those are real — a run that messaged
somebody messages them again, and a workflow switched off stops answering its
trigger.

Nothing deletes, either way. There is no tool here that removes a workflow, a
run or a credential, whatever the switch says.

Off is the default, including for a workspace that has already chosen a model:
the panel opens over whatever somebody happens to be reading, and a model that
decides "run it" from a question is a worse mistake there than on a page with a
button on it.

Nothing it is told is written down: the conversation lives in the browser until
the panel is closed.

Which model answers is also set per workspace, and the button appears only once
one has been chosen.

## The conversation list

![The chats held, newest first, with how many answers are waiting in
each](/screens/chat-list.png)

The column on the left holds the workspace's chats. **Beside a chat's name is
how many answers arrived since you last had it open** - a pill and a bold name,
so news stands out in a long list - and opening the chat clears it. An answer
that finishes in a chat you left counts at once; one that lands in the chat you
have open while the window is in the background waits for you to come back.

A new chat is named once at its start, by the workspace's naming model, and
again every few exchanges as the conversation moves on - how many is an Admin
setting. While it is being named it says *Naming this chat…* in its title, with
a spinner beside it in the list. A model that does not answer within Admin
Settings' **Chat Title Time Limit** (30 seconds), or answers with nothing
usable, is passed over for the chat's own model, and a chat no model could name
is named from its first words. A chat nothing was said in sorts by when it was
made.

**Chat opens a new chat by itself** where the workspace has none yet, and the
list can be dragged wider by its edge - the width is remembered, and a
double-click puts it back.

## Finding a conversation

**Search content** looks inside the messages rather than only at chat names. It
is off by default: most searches are for a chat by its name, and reading
everything ever said is a different question.
