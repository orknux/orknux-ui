# Models and agents

## Providers and models

![Providers with their endpoints and status, and the models reached through them](/screens/models.png)

A **provider** is somewhere models are reached: an OpenAI-compatible endpoint,
whether that is OpenAI itself, a local llama.cpp or vLLM server, or a proxy of
your own. A **model** is one model on one provider.

Add a model from **Models** in a workspace. The dialog asks for the type first,
because the rest of the form depends on it:

- **Chat** — the models a chat or an agent can talk to. Adding one usually
  discovers what the provider offers and lets you pick from the list.
- **Transcription** — speech to text. Provider is an OpenAI-compatible API,
  given as a server URL and an optional key. No model discovery is attempted:
  a transcription endpoint is not required to have a model list.

Transcription models never appear in the chat model dropdown. They are for
hearing, not for answering.

The model list shows each model's type, its provider, and whether it is switched
on. Usage over time is charted on the model's own page.

![A provider on its own page: where it is, how it authenticates, and what it
said when it was last asked](/screens/model-provider.png)

A provider has a **type** of its own: **OpenAI**, **Anthropic**, **Azure
OpenAI**, **Ollama**, **llama.cpp**, and the *Decision model (Jev format)*
described under Workflows. It decides how the address is
built and how the key is sent rather than which company answers, so anything
speaking the OpenAI shape at an address of its own is an **OpenAI** provider
with that address typed into its endpoint. That is how Google's models are
reached: the endpoint is
`https://generativelanguage.googleapis.com/v1beta/openai` with a Gemini key, and
the model list, chat, streaming and tool calls all behave. There is no Google
type, and there is no **Custom** one either. Custom said only that we had not
heard of the service, which sounded like a promise to speak whatever it speaks
and sent an OpenAI request every time; providers stored as it are OpenAI
providers on upgrade, endpoint and key untouched, and nothing about the calls
they make has changed.

**Ollama** takes the address the daemon listens on — `http://localhost:11434`,
which is where an operator naturally points it. Its OpenAI-compatible half lives
under `/v1` and the type adds that segment itself, so nobody has to know it, and
an endpoint already written `.../v1` is left as it is rather than doubled. That
segment used to be yours to remember: pointed at the bare port, a provider that
was perfectly correct reported *"No model list — check the endpoint"* about an
endpoint that was right.

**llama.cpp** is spoken to exactly as OpenAI is, at the address its server
listens on - `http://localhost:8080` unless it was started elsewhere - and any
key will do unless the server was started with `--api-key`. What the type adds
is one question OpenAI has no way to ask: how far the server has got reading a
prompt. A long session on a local model is read for minutes before the first
word comes back, and that used to be minutes of nothing on the screen. Now the
chat and the session page say **Reading the prompt…** with how many tokens of
how many have been read, how many of them came from the server's cache, and the
percentage. It is shown only once a read has gone on for five seconds, so the
short reads a warm cache makes do not flash a card at you; **Reading Progress
Shown After** in Admin Settings moves that, and 0 shows every read. A llama.cpp
server registered as an OpenAI provider before the type existed goes on working
as it did; move it to the new type to see the reading.

The key a provider calls with is one of two things, and they are exclusive. It
is either the provider's own value, which is what nearly every provider has and
what has always happened here; or it is read from one of the workspace's
**variables** — a secret, not a value — that somebody else maintains. Every
provider type offers both.

The choice belongs to the field, not to the form. It sits beside the name of the
box it decides — **Value** or **Reference**, next to *API Key*,
or next to *Client Secret* where the authentication method makes it one — and
only the control belonging to the half chosen is drawn: a box to type into, or a
list of the workspace's secrets to pick from. That is on purpose and it is not
only tidiness. A form holding a key and a reference at once is a form somebody
fills in twice, and the pair is refused; and where something asks for two
secrets, as a Slack connection does with its bot token and its app token, each
one answers for itself rather than both being decided by a switch above them.

Reading a secret is worth it wherever one key is behind more than one provider.
Three providers on one OpenAI key meant typing it into each of them, and
rotating it meant remembering which ones; pointed at a secret instead, the
rotation is one edit on the **Variables** page. The secret is read at the moment
the provider is called, so a new value is in use immediately, with nothing to
save here.

The reference is held by identity rather than by name. Renaming the variable, or
moving it to another catalog, does not disturb the provider — and deleting it is
refused while any provider reads it, naming the ones that do. Only a secret will
do: a value is returned with the variable listing, and a key on a listing is a
key on a screen.

A provider reading a secret has no key of its own to reveal; reveal it from the
**Variables** page, where the reading is recorded against the secret.

A provider's page is also where it is tested. The status is the answer to the
last check, not a guess: a provider with no credential fails the check rather
than waiting to fail at the first question. Where the credential is a reference
that has come apart — a restore, or a database edited by hand — the provider
says so in words about the variable, on its row and on its page. That is
deliberate. A provider that cannot read its key fails a check exactly the way an
unreachable one does, and "check the endpoint" is the wrong afternoon.

Every configured provider is asked the same question every few minutes, so that
"Connected" means today rather than the day somebody last pressed the button.
That is right for a provider you pay for and wrong for an endpoint that is only
sometimes running — a model server on a laptop, a box started for an afternoon —
where being off is the normal state and the sweep leaves a failed row and a
connection refused in the log every five minutes. **Automatic checks** on the
provider's page turns that off for that provider alone. It stops the timer and
nothing else: **Test Connection** still runs, and so does every chat and task
that uses the provider.

A model's own page carries the two numbers that decide how much can be put in
front of it: its **Context Window**, which is how much it reads at once, and its
**Max Output**, which is the most it will write in one answer. Both are in
tokens, both are as the provider states them — nothing here asks the model — and
either can be left empty, which means not recorded rather than zero. They belong
to the model and not to the provider: one provider serves models whose windows
differ by an order of magnitude, so a single number kept beside the key would be
wrong for all but one of them. The window is what a session's memory is a share
of, so a model with none recorded leaves every agent on it with the built-in
allowance, and setting a share against it is refused until the number is there.

### What a provider is sent

Three settings on a provider's page decide the shape of what goes to it, and
all three are about a local server keeping its **prompt cache**: a server that
has already read the beginning of a conversation reads only what is new, which
on a long session is the difference between a second and several minutes.

**All tools up front** hands an agent every tool it holds from its first round,
with nothing to find or load, so the tool list never changes during a turn and
the prompt a server has already read stays the prompt it is sent. It is on by
default for **Ollama**, **OpenAI** and **llama.cpp** - which covers every
OpenAI-compatible server - and off for the others. It goes past an agent's own
**Tools carried at once**, up to the provider's limit; switch it off on the
provider to have such an agent find its tools as it did before.

**Most tools per request** is that limit: how many tools one request may carry.
Left empty it is what the type takes - 128 for OpenAI, Azure, Ollama and
llama.cpp, 256 for Anthropic - and past it the rest are still found as needed.
Set it lower for a server that refuses fewer, or to keep a small model's list
short.

**Send thinking back** decides whether a model is shown its own earlier thinking
in later requests. **It is off by default, for every provider, including the
ones that existed before the switch did.** A model whose chat template drops
old thinking anyway - Gemma on llama.cpp, for one - was being sent pages it
threw away, and changing what is sent changes the prompt a cache holds. Turn it
on for a provider that needs it: a reasoning model that loses its plan without
it, or Azure's Responses API. The thinking is captured and shown either way.

The same reasoning runs through how a conversation is sent at all. **A turn
sends the model exactly what the last turn sent** - every tool call, its
reasoning and its result - and adds the new message to the end, so a provider
with a cache reads only that message, and a hosted one that bills cached input
for less bills less. What was sent is kept with the session, encrypted; once it
outgrows half the model's window it is started again from what was said, in one
step. Notes, the to-do list and the counts that used to sit in the system prompt
are no longer there, because they changed it every turn and threw the cache away
with them. A chat's running total says how much of what it sent the provider
reused from its cache, where the provider reports it: every round sends the
whole conversation, so without that number a long chat on a local server read as
millions of tokens it had mostly never read again.

### When a model is slow, or says nothing

A call to a model may take **up to an hour** by default - **Model Answer Time
Limit** in Admin Settings. It used to be cut at ten minutes, and a slow local
model thinking at length was stopped mid-thought and reported as unreachable.

While a model writes a long tool call or a long answer, the chat and the session
page say what it is writing and how much has arrived, so a model putting a whole
file into one call does not look stalled.

An **empty answer** is asked again, up to five times by default, and a reply
that cannot be used goes back to the model, twice by default; **Empty Answer
Retries** and **Unusable Reply Retries** in Admin Settings set how often. Each retry says which attempt it is and how the
provider stopped, which is usually what tells you whether the model or the
server is at fault.

## Workspace models

Two model choices belong to the workspace rather than to a conversation:

- the **companion model**, used for the small jobs nobody should have to pick a
  model for — naming a chat, for instance. Clearing it switches those jobs off
  rather than falling back to something you did not ask for.
- the **speech-to-text model**, used by the microphone in chat. Only a
  transcription model will do.

Both are set in workspace settings, by anyone who can see the workspace.

## Agents

![The workspace's agents](/screens/agents.png)

An agent is a model with a brief: instructions, and access to the workspace's
skills, tools and memory. Agents can be used from chat and as a node in a
workflow, where their input comes from the parameters the node is given.

- **Skills** are written instructions the agent can draw on, grouped into
  catalogs.
- **Tools** are things the agent can call, including MCP servers connected to
  the workspace.
- **Memory** is what a workspace has written down for its agents to read.

Everything this card names is defined somewhere else in the workspace, and every
one of them carries the mark that opens it: the model beside its picker, and a
catalog, a tool or an MCP server at the end of its own row. They open in a tab
of their own, so going to read what something is does not throw away a form that
has not been saved — and pressing one grants nothing.

![One agent's settings: its brief, the model it answers on, and the share of
that model's window its sessions are given](/screens/agent-settings.png)

### The connections it holds

An agent is granted connections by name on its **Connections** setting, and a
grant is its permission to name one. **That is the whole list it may use**,
wherever a connection is named: in what its briefing tells it it holds, in what
`find_connections` answers, and in the connection argument it passes to a
plugin's tool. A plugin's Prometheus or Jenkins tool used to accept any
connection of that kind the workspace kept, granted to the agent or not; now a
connection it does not hold is refused as though it did not exist, and the
refusal and the tool's own description list only the ones of that kind it was
given. An agent holding none is pointed at its Connections setting rather than
told something failed.

`find_connections` is offered to every agent that has it on, however many
connections it holds. It used to appear only past six, so an agent's tools
changed with a count nobody sees, and an agent holding none could not ask
whether it held any — it now gets an empty answer and a note saying where
connections are granted. A short grant is still recited in the briefing.

A workflow node and the editor's **Run** have no agent, so they keep the rule
they always had: any connection of the right kind in the workspace.

A connection can carry a **description** - what it is for, such as *production
Jira, the support project* - and an agent is told it beside the connection's
name, and `find_connections` searches it. Two connections to the same system
are otherwise two names an agent has to guess between. A connection inherited
from an administrator's default takes that default's description.

### What it holds by default

A new agent is not empty. It holds **every memory catalog** its workspace has
and **every plugin's skill catalog**, and a memory catalog created later, or a
plugin that brings skills for the first time, is granted to the agents already
there. Each can be unticked on the agent, and re-uploading a plugin does not
hand back a catalog somebody took away. That way round because an agent that
does not know what the workspace has written down, or how a plugin it was
granted is meant to be used, answers worse, and the omission is invisible: it
was a grant somebody had to remember on every agent, and mostly did not.

It is told, too, to look at its skills before it starts a piece of work - to
list them once per conversation and load the ones that fit - where it used to
be told to look only when a request needed one, which agents almost never
decided it did. The **Watchers** skill is **Always** for every agent, so each
conversation begins with the agent loading it: one extra call, for an agent
that then knows to wait for something with a watcher rather than by guessing.

**Tool Rounds** - how many rounds of calling tools one turn may take - is 100 on
a fresh installation, in Admin Settings and on an agent, and goes up to 10000.
It was 8. An installation that saved its own number keeps it, and one relying
on the default gets 100 unless `ORKNUX_CHAT_MAX_ROUNDS` says otherwise.

### Secrets and values it may hand on

**Secret Catalogs** and **Variable Catalogs** grant an agent the workspace's
variables, by catalog, for one purpose: handing them to a command in a box,
below. `variable_list` names what it holds - values with what they say, secrets
by name only - and `variable_get` reads a value. **A secret is used, never
read.** The agent names it, the command is given it as an environment variable,
and the model never sees it: anything the box prints that holds one reads `***`
in the tool's answer, the session log, the chat and the Box panel, including the
same secret base64- or URL-encoded. A value split across two reads of the output
is the one thing that is not caught, which is a reason to grant a secret only
to an agent that needs it.

A secret is set under its own name and upper-cased too, so `github_token` is
also `$GITHUB_TOKEN`, and the answer says which names were set.

## Skills and tools

![The workspace's skills, in the catalogs they are grouped into](/screens/skills.png)

A **skill** is written instruction — how to answer in a thread, when to escalate
somebody — kept as markdown that opens with a frontmatter header naming it. That
header is what an agent reads to decide whether the skill applies before it
reads the rest.

![The skill editor](/screens/skill-editor.png)

Agents are granted whole **catalogs** rather than single skills, so adding a
skill to a catalog gives it to every agent already holding that catalog. It is
also why a catalog an agent holds cannot be deleted, and the refusal names the
agents: a grant is a name, so nothing would have broken loudly — the agent would
simply have stopped knowing what the catalog held. A single skill carries no
grant and deletes as it always did. See *Deleting something in use* under
Workflows.

![The workspace's tools](/screens/tools.png)

A **tool** is JavaScript an agent may call while it answers. Unlike a function,
which a workflow node calls with arguments it mapped, a tool is offered to the
model and called if the model decides to. A tool an agent has been granted
cannot be deleted while the grant is there, for the reason a skill catalog
cannot.

A tool may **import** the workspace's functions, so logic a workflow already has
need not be written a second time for an agent to reach it. Its editor has the
same **Imports** and **Libraries** sections a function's has, and the code calls
them the same way — `imports.name(…)`. Nothing imports a tool: the direction is
one way, which is also why a tool cannot be caught in an import loop. It is set
out under Workflows, in *One function calling another*.

![The tool editor](/screens/tool-editor.png)

Beside Validate is a **wand**, and it is the quickest way to get help with what
is on the screen. It opens the quick chat with this tool already in hand, so a
question about the code does not have to describe the code first. What comes
back, when the answer is a change, is drawn against what the tool says now, with
Accept and Reject underneath it.

Accepting compiles the change in the browser and saves it, exactly as Save
does - what runs is the JavaScript stored beside the TypeScript it came from.
Nothing is written before that, and whichever you press is said back into the
conversation, so a change that will not compile can be answered rather than
silently dropped. The function editor's wand works the same way.

### What an MCP server brings

Granting an agent an MCP server gives it the server's tools, and two more
things where the server offers them. **Resources** - the documents a server
publishes - are read with two tools under the server's name,
`<server>__list_resources` and `<server>__read_resource`, which appear only
where the server advertises any; a document that is not text comes back as a
key, like a drawn picture. **Prompts** are skills: they arrive in a catalog
called `<server>_mcp`, listed and loaded like any other skill, and `skill_load`
passes the arguments a prompt takes. Nothing has to be granted for either
beyond the server itself.

How an MCP server - or a connection - signs in is its **Auth** setting. *Bearer
Token* sends `Authorization: Bearer <secret>`, *API Key* sends the secret as the
`Authorization` header as it is, and *Basic* takes `username:password` typed
plainly: Orknux encodes it to base64 and sends `Authorization: Basic …`. One
already encoded by hand is recognised and sent as it is.

## Keeping what they were

An agent, a tool and a skill each keep the version they replaced every time they
are saved, and each has a **History** beside it: who saved it, when, what the
prompt or the code said then, and a button that puts it back. A tool's and a
skill's are in the panel beside the editor; an agent's is on its settings page,
under the form and above the way to delete it.

It is the same mechanism a function has, and it is set out under Workflows, in
*What a component was* — including how long a version is kept, which is an
administrator's to decide. It is worth most here: a prompt is written by trying
something, and without this the version that worked is only in somebody's memory
of what they typed.

## Memory

![What the workspace has written down, in the catalogs it keeps them in](/screens/memory.png)

A **memory** is a fact about this workspace that nobody should have to work out
twice — that the export runs at 02:00, that one customer asked never to be
phoned. It is the other half of a skill: a skill says how to work, a memory says
what is true here.

Memories live in **catalogs**, and agents are granted whole catalogs, exactly as
they are for skills. Adding a memory to a catalog gives it to every agent
already holding that catalog, and nothing has to be granted again.

An agent that holds at least one catalog is offered a tool called
`memory_search`, and only the catalogs it was granted are searched. So memory is
not pushed into every prompt: the agent asks when it thinks there is something
to know, the same way it reaches for any other tool.

It can write as well as read. `memory_save` files something new, or rewrites a
memory by its title; `memory_update` corrects one - new content, a new title, or
both - and `memory_delete` removes one that is wrong or out of date. All three
write only into catalogs the agent was granted, and the audit log names the
agent that did it.

A memory catalog an agent holds cannot be deleted either, and the refusal names
the agents holding it. Removing one memory from a catalog is not the same act
and is not refused: the catalog is what an agent is granted, so deleting one
takes the whole folder from everybody at once.

Each catalog has its own search, a filter by who wrote a memory and a sort, since
a catalog somebody has been adding to for a year is longer than a page.

## Sessions

![Every conversation this workspace's agents have kept, and how much was said in
each](/screens/sessions.png)

A **session** is one running conversation, kept apart from any single run. An
agent node answers and, ordinarily, forgets: the next run starts from nothing.
A session is what makes the second run remember the first.

Nothing on this page creates one, and there is no button that suggests
otherwise. A session appears the first time an agent node carrying a
**sessionKey** runs, and every later node that computes the same key writes into
the same conversation. Where that key is set is the **session node** in the
workflow editor, described under Workflows. The key is what a conversation is
called; the optional prefix is what it is filed under, and the two are shown
together as `prefix:key`. Keys belong to a workspace, so two workspaces both
keying on `standup` are keeping two separate conversations.

Because the key is usually computed rather than typed, one workflow keeps as
many conversations as it has things to talk about. The workflow these pictures
are taken from keys on the ticket a Slack mention names, so each ticket has a
thread of its own and a second question about the same ticket continues the
first.

![One session, narrowed to what was said: a question, the answer, and the same
ticket asked about again a run later](/screens/session.png)

Opening one shows the transcript, oldest first, a day at a time. Every line
names somebody and says what kind of line it is:

- **User** — what was put to the agent. On a workflow node that is the node's
  own name, since the node is who asked.
- **Agent** — what it answered.
- **Tool** — a call the model made, with the arguments it sent. Not what came
  back, which is why that line is often JSON and often long.
- **System** — a note from orknux itself, such as an agent that could not
  answer and why.

A long line is folded to a few lines with the full length on the button that
opens it, so a transcript with a thousand-line tool call in it is still
readable. The search, the four kind filters and the sort apply to the
transcript rather than to the list of sessions — and with none of the four
picked you are looking at every kind, not at nothing. The picture above has
User and Agent ticked, which is why the tool calls the agent made between the
two answers are not in it.

What the agent is handed on its next turn is the recent **User** and **Agent**
lines, not the whole transcript and not the tool calls: enough of the
conversation to carry on, without a fortnight of it arriving in one prompt.

How much of it is **Session Memory**, on the agent's own settings card. It is a
share of the context window of the model that agent uses — one number, from
which how many turns come back, how much of them, how much of what its tools
last returned and how much of any single result are all worked out. A share
rather than a count because the window is what the budget is spent out of, and
on the agent rather than on the installation because what a sensible budget is
depends on what that agent's tools give back: one reading whole files needs a
different allowance from one reading issue lists, and both may be pointed at the
same model.

Left at **Default** an agent has set no share of its own, and what it gets then
is decided one step further out. Moving the slider shows what the share works
out to against the model chosen just above it, in tokens — approximate ones:
they are counted in characters, the only unit every model agrees on, and
reported at four characters to the token. A share the model cannot give is
refused before it is saved, with a sentence naming that model and its numbers,
because the alternative is finding out on somebody's turn when the provider
refuses the request. Choose the model first: until there is one, there is no
window to take a share of and the slider says so by staying where it is. The
mark beside the picker opens that model's page in a tab of its own, which is
where its window is recorded and where a refusal about a window that is not
recorded is put right.

There are three steps, and they are consulted in this order: **the agent's own
share, then the workspace's default, then the built-in allowance.** An agent
that has answered for itself is never overruled by the two below it. One that
has not follows **Default Session Memory** on the workspace's settings page,
under Agents; and where the workspace has decided nothing either — which is what
every workspace does until somebody sets it — the fixed built-in allowance
applies, which is what every agent had before any of this could be set. So an
agent at Default says which of the two it landed on, under the slider: *the
workspace's 25%*, or *the built-in allowance*.

![Agents in workspace settings: the share every agent that has set none of its
own gets, and the model the figures under it are for](/screens/workspace-agents.png)

The workspace's default is set the same way, on the same track, and it is a
percentage for the same reason — except that here the argument is stronger,
because a workspace runs several models at once whose windows differ by an order
of magnitude, and a share is the only unit that can be stated once and mean
something against all of them. Which is also why it is judged on the bounds
alone: refusing a default because the smallest model in the workspace could not
give it would refuse a setting that is right for every other model in it, and
for agents that may never use that one. The refusals that name a model still
happen, against the model an agent actually uses, where its budget is worked
out. To see what the default would mean on any one of them, pick it under
**Worked Out Against** — the figures are that model's, and changing the picker
changes nothing that is saved.

**Continue in chat** is how a person joins a conversation the agents have been
having. The chat it opens is bound to this session and holds what was already
said, so what you tell it is written back here and the next run to read the key
finds it. It shows the tool calls too, drawn between the turns they were made
between and marked as calls rather than as anything anybody said — a chat is
opened to work out what an agent did, and an answer with no sign of the lookup
that produced it reads as the agent having simply known. The model is still not
given them, for the reason above: the calls are on the page, not in the prompt.
Calls made in the chat itself stay on this page, which is where the whole
conversation is. **Remove session** takes the conversation and every line in it, and
says so before it does; nothing makes a session again by hand, because a session
exists only because a run computed its key.

### Beside the transcript

A session's page has a column of panels beside the transcript, each one updating
as the agent works, and each shown even when it has nothing in it yet, so an
empty panel says *none in this session* rather than leaving you to wonder
whether the feature is on.

- **Sessions** — the agents this one asked, each a session of its own, or the
  session alone where it asked nobody.
- **Boxes** and **Ports** — the box sessions its agents opened and the ports
  they asked to expose; see *Letting an agent work in a box*, below.
- **To-do** — the plan the agent keeps with its to-do tools, done items ticked
  off.
- **Notes** — what it wrote down with `note_to_self`.
- **Watchers** — the watchers it set, running ones first, each with what it is
  for and where it stands; a row opens the Watchers page.
- **Timers** — one row per reminder, saying when it is next due and how often it
  rang, so a reminder the agent re-arms on every ring stays one row.

The column grows with its panels and the page scrolls to them; a long list
still scrolls inside its own panel. A long block in the transcript or in a tool
call folds from an icon at its top right, which says its size in characters and
tokens.

**What a session has cost** is under its heading: the tokens every model call
made into it was charged - in, cached and out - and the money, where the models
carry prices. It is shown even at nought, with the reason on hover, because a
meter that hid itself until something was counted read as switched off. A model with no price shows the tokens and nothing else,
because no price is not a price of nothing. It is a workspace setting, **Session
pages show what a session has cost** under Chat, on by default, and the same
switch adds **Tokens** and **Cost** columns to the Sessions list, which sorts by
either. Calls made before 1.0.7 were not recorded, so an older session counts
from then.

### When a session grows long

A session past a size - 40,000 tokens unless a workspace or Admin → Settings
says otherwise, and zero turns it off - has its older turns summarised into one
line of the log, which the model is given in their place. Nothing is deleted:
the turns it summarised stay on the page, marked, and the summary says what they
held. Before this, the oldest turns quietly fell out of what the agent could see.

### Asking another agent

An agent granted others may put a question to one with `ask_agent`, and the
question runs on its own while the asker carries on: `agent_wait` waits for
what it asked, `agent_asks` reads what came back, and `agent_list` says what
each agent it may ask can do - its model, tools, skills and connections - so it
asks the one that holds the tool the work needs. Each ask is a session of its
own, listed under the one that asked.

An agent that ends its turn before the answer comes is not left without it.
The answer is delivered to its session: read between two steps if it is still
working, and otherwise it wakes the agent - a workflow step waits rather than
finishing, a chat answers again on its own, a finished task carries on.

### Reminders

`timer_set` is a reminder an agent sets for itself: "tell me in 30 seconds to
check the build". It does not end anything - the agent carries on - and when
the time is up it is told, with the note it left, the same way an answer
arrives. Up to the installation's longest wait ahead.

`timer_set` answers the reminder's id, `timer_list` shows the ones not yet come
up, soonest first, and `timer_cancel` calls one off by its id. The last is what
lets an agent told to stop something it keeps re-arming actually stop. All
three are on for every agent.

A reminder or a watcher set by an agent another agent asked wakes **that**
agent when it goes off, after its answer, and what it then says reaches the
agent that asked - which a chat or a task is woken for.

### Watchers

A reminder is for "come back in ten minutes". Most waiting is for something
else: a build to finish, a deploy to go green, a ticket to change state. **A
watcher is that wait, done by the server**: it calls one of the agent's own
tools on an interval and wakes the agent, in the same conversation, when what
comes back matches a condition - with what matched and the whole result in the
message. Until then the agent spends nothing.

`watcher_set` names the tool and its arguments, the interval and the timeout,
and the condition: a **JSONPath** that finds something, or a **regular
expression** found in the result. `tool_result_path` says which part of the
result the condition is held against - `$` for all of it, `$.body` for the body
an `http_get` answered. A condition already true when it is set sets nothing
and shows the agent what matched, so it can tell that the thing it meant to
wait for has already happened. It may carry a
**description** of up to 100 characters, which is how the Watchers page tells
two of them apart. `watcher_update` changes the condition, the arguments, the
interval or the note afterwards; `watcher_list` lists the agent's own;
`watcher_finish` ends one early.

**A watcher fires once.** Its agent is told when it times out, is stopped, or
loses the tool it was calling. A timeout is not a quiet ending: the agent is
told the wait is not settled, and to set another with a longer timeout or a
better condition, or to tell whoever it was working for. Watchers live in the
database, so a restart leaves them running.

A condition can be guessed wrong - the field is called something else, the
status is spelled in capitals - and then a watcher would run silently to its
timeout. So **the agent looks at the result itself** now and then. Left to
itself, the first look comes five minutes after the watcher is set, each wait
after that is twice the last, and none is longer than a day; Admin Settings
holds those three numbers. An agent can ask for a fixed interval instead,
`agent_check_interval_seconds`, which has to be shorter than the watcher's
timeout. Each look is a turn of the agent's own, in which it can change the
watcher or end it.

**In a workflow, a step does not wait for its watcher.** An agent step that sets
one completes with its answer and the run carries on. When the watcher fires,
times out or is stopped, the agent is woken in the same session for a turn of
its own, and what it then answers is delivered the way the step's was: the run
carries on past the agent with the new answer, so the nodes after it run again
and a Slack reply reaches the thread. That holds even after somebody opened the
conversation with **Continue in chat**. An agent with nothing new to say ends
the turn with `finish_answer` and sends nothing, and it is told, when woken,
that its answer goes to a person - news in plain words, its own bookkeeping in a
note - so a thread does not get "still in progress" on every look. A woken turn
that meets a rate limit or an outage is asked again under the retry policy of
the node that set the watcher.

The workspace's **Watchers** page, under AI, lists them: the session, the
description, the tool call, the condition and the part of the result it
watches, the interval, the **Agent check**, the timeout, when it was set, the
last check - hover it for what the tool returned - and the next. **Stop** ends
one. The **Finished** tab holds the ones that ended, with how: **Fired**,
**Timed out**, **Finished by its agent**, **Stopped** or **Could not go on**.

## Drawing, and looking

An agent can look at a picture and can make one.

**Looking** needs nothing switched on. A picture already on the conversation —
pasted into a chat, shared in the Slack thread a run is answering — is handed to
the model as an image rather than described to it, so "what is wrong with this
screenshot" is a question with an answer. What is not a picture is named on the
payload instead and fetched by the agent if it wants it.

**Drawing** is a tool, and a grant. Where the workspace has chosen a
text-to-image model, an agent may be given the drawing tool in its editor, the
same way it is given anything else — it appears in the Tools list with
everything else it could be granted, and can be switched off there. A chat agent
draws into the conversation; an agent in a run files the picture against the
step that drew it, where the run log shows it under that node.

![A picture asked for in a chat, drawn into the thread by the agent's drawing
tool](/screens/chat-picture.png)

**Every tool Orknux brings itself is in that list**, under **Built in**: the
note an agent writes to itself, its to-do list, the clock, its scratchpads,
saving a file, finding a connection, asking another agent, finishing a turn,
drawing and the picture link. Each has the same Hide, Offer, Always control as
a workspace's or a plugin's tool, and an agent starts with all of them on and
Always. The built-ins that come with a wider grant — the skill tools with the
skill catalogs, the memories with the memory catalogs, the `orknux_` tools with
Orknux access, the `orkbox_` tools with the box labels — are rows too, so the
list is complete, but they read that grant and are switched where it is
switched.

What the tool hands back to the model is a **key**, not a link: the picture's
bytes go into the session's own store, and a key is what a tool that uploads a
file takes. That is the difference between a picture somebody is shown in Slack
and a picture filed where they are not looking — a link pasted into a chat is
punctuation, not a delivery.

**Putting one in the middle of the text.** A key is not an address, so an agent
that wants the picture at a particular point in what it writes asks for one:
**picture_link** in a run, **task_picture_link** in a task. Both take the key
and answer with markdown to place. The row is on in the agent's Tools list
until somebody hides it — the switch is for an agent whose answers are read
somewhere this installation is not, where an address here resolves to nothing
for the reader.

![An agent that drew in a run: a mountain lake at noon, placed in its answer and
shown in the panel of the step that drew it](/screens/agent-run-picture.png)

## What an agent makes, and where it goes

An agent does more than answer in words. The server brings the tools for the
things a support desk actually sends, and each of them answers with a **key** -
the bytes stay in the session's store, and the key is what every tool that
sends, uploads or packs a file takes.

- **Diagrams and charts.** `diagram_render` draws mermaid (flowcharts with
  subgraphs, sequence, class, state, gantt, mindmap) or PlantUML;
  `charts_render` draws bar, column, line, area, pie, donut and scatter charts
  from a label and a number each. Either answers a PNG, for a chat, or an SVG,
  for a page.
- **Documents.** `pdf_fromHtml` lays HTML out as a PDF, drawing
  `<pre class="mermaid">` and `<pre class="chart">` blocks as vectors, and reads
  a stylesheet the page links from the scratchpad of that name.
  `pdf_fromHtmlZip` does the same from a report already zipped with its
  stylesheet and pictures.
- **Pages.** An HTML report is built in scratchpads. A chart or diagram goes in
  as SVG markup - `scratchpad_append` or `scratchpad_replace` take a key as
  well as text - and a drawn picture travels beside the page in a zip.
- **Archives.** `zip_files` packs pads and keys into one archive; `zip_extract`
  unpacks one somebody sent into pads, so it can be read and changed.
- **Looking.** `picture_view` shows the model the picture behind a key: an
  attachment it read, a chart it drew.

![A task that drew a mountain lake and a city at night, laid them out as a PDF and
saved it: under its outcome the pictures, and the saved PDF drawn small by its
first page](/screens/task-pdf.png)

The server also brings **skills** that say how to use all of this -
*Diagrams and charts*, *Complex HTML*, *Making a PDF* and *Delegating* - and
`skill_search`, which looks inside skills' pages, so an agent holding a key and
unsure what to do with it can find the page that says. For fun there are voices:
*Angryman*, *Niceman*, *Jokeman*, *Crazyman* and *Rimeman*, each answering the same facts
in its own way.

## Finding a tool

An agent that holds more tools than fit in one request - its own ceiling, or
the provider's - is sent the ones marked **Always** and finds the rest. Its
briefing lists every tool it has, each marked *loaded* or *load it first*.
`tool_find` searches them by words and loads nothing, `tool_describe` shows one
in full - its whole description and every parameter - and `tool_load` takes the
exact names it wants for its next message. On a provider with **All tools up
front** the agent's own ceiling does not apply and only the provider's does;
see *What a provider is sent*, above.

Two settings on a model's page matter most for a local model. **Tool calls per
reply** set to one stops a confused model filling a reply with repeats; and
**sampling** - temperature, top-p, top-k, min-p, repeat penalty - is sent only
where it is set, so the server's own defaults hold until somebody chooses.

## Saying the work is done

An agent's turn ends when it writes an answer instead of asking for another
tool. That assumes the answer is the prose, and often it is not: an agent
answering a Slack mention posts its reply itself, because that is how a file or
a picture reaches somebody. Asked for an answer anyway, it either repeats the
message or says nothing at all — and nothing at all reads as a failure, which
is retried, which posts the whole thing twice.

**finish_answer** is that ending said out loud. The agent calls it, the turn
ends, and the step is finished rather than failed. Anything it passes becomes
what the step answers with, for a node that needs something to work with;
passing nothing is the ordinary case, because what was made went somewhere the
workflow is not.

It is on for every agent until somebody hides it, in the same Tools list as
the grants. Hide it for the agent whose next node needs a real answer.

## Artifacts

Everything a workspace has made, on one page: the pictures its runs drew, and
whatever an agent saved with the **save_artifact** tool.

![The Artifacts page: harbours, hills, lakes and a city at night that the
workspace's runs and tasks drew, and the PDF one of them saved](/screens/artifacts.png)

A picture opens in the viewer. A document an agent wrote — a page, a report, a
PDF — opens to be read rather than downloading, drawn inside a frame that is
allowed no script, no cookies and no network of its own. That last part is what
makes it safe to open something a model wrote. Anything else downloads.

![A picture a task drew, open in the viewer over the Artifacts
page](/screens/artifact-picture.png)

What is open is in the address bar, so an artifact can be linked to: send
somebody the address and they see the thing, not the list.

## Letting an agent drive orknux

An agent's settings carry one switch that is not an MCP server: **Orknux**. It
lets the agent ask this installation about itself — its workspace's workflows,
runs and agents — and, unlike the AI button, to start a workflow, which really
runs it.

It is deliberately not listed among the workspace's MCP servers. Those are
addresses somebody registered, with a credential; this is the application the
agent is already inside, so there is nothing to register and nothing to point
at. Off for every agent until somebody turns it on, and turning it on is
recorded in the audit log.

An agent that starts a workflow which asks an agent is a loop nothing here
breaks, so grant it where that is not a risk.

### Building a workflow

The same switch, and the same tools over MCP, let an agent **build** a workflow
rather than only run one. `orknux_workflow` reads one as the editor holds it,
with the problems the editor would show, `orknux_workflow_parts` lists what its
nodes can point at - the workspace's triggers, actions and conditions - and
`orknux_workflow_reference` says what every field of a graph, a trigger, an
action or a condition means. With those it can make the workflow
(`orknux_create_workflow`) and the triggers, actions and conditions it needs
(`orknux_create_trigger`, `orknux_create_action`, `orknux_create_condition`),
save its graph (`orknux_save_workflow_graph`) and publish it
(`orknux_publish_workflow`). The four that write are offered only where the
conversation may change things.

Nothing it makes skips a check. Everything goes through the checks the editor
uses, and every change is in the workspace's audit log under the agent's
name. **Saving over a draft somebody has not published is refused** unless the
agent says `overwrite_draft`, and the refusal tells it to read the workflow
first: a draft is somebody's unfinished work, and an agent that saved over it
without looking would lose it with no way back.

## Letting an agent work in a box

A **box** is a sandbox an agent can open a session in: a working directory of
its own and a way to run commands in it. In one it can clone a repository,
build it, run its tests, edit what failed, serve what it made, and hand back the
result. Which boxes there are is an administrator's decision - the local box
built into the server, and remote **orkbox** instances - and is set out under
Administration.

**An agent may use a box only by label**, on its **Boxes** setting, and holds
none by default - the local box included, whose label is `local`. A label
rather than a box's name because several boxes may share one, and an agent
holding it may be given any of them: a box an administrator adds later under a
label already granted is one the agent can use without anybody editing it. A
granted agent gets the box tools as rows in its Tools list, read from that
setting.

`orkbox_list` says which boxes the agent may use and how many free sessions each
has, so it can pick one with room. `orkbox_open` opens a session: an empty
workspace, or a clone of a git repository. In it the agent runs commands with
`orkbox_exec` - answered with the exit code and both output streams, and read
further with `orkbox_output` where the output is long - and works with files:
`orkbox_files`, `orkbox_read`, `orkbox_write`, `orkbox_edit`, `orkbox_search`,
`orkbox_stat`, `orkbox_move` and `orkbox_delete`. An edit replaces text, lines
by number, or a regular expression's matches, all of them or none.
`orkbox_undo` and `orkbox_redo` take back and put again what its edits and
writes did in a session, refusing a file something else has changed since;
they are held in memory, so a restart forgets them, and a delete or a move
cannot be taken back. `orkbox_log` reads the session's event log, and
`orkbox_close` ends it, destroying the workspace and everything in it.

**A box cannot reach this server**, so nothing in one can download what the
conversation holds. Things go in and come out through the agent:
`orkbox_write` takes a draft straight from a scratchpad, `orkbox_fetch_artifact`
puts a saved artifact in, unpacked if it is an archive, `orkbox_import` unpacks
a .zip, .tar or .tar.gz the conversation holds, and `orkbox_export` takes a file
or a directory out as a .tar.gz, as a key, for anything that sends or saves
one. A secret goes in by name and never as text; see *Secrets and values it may
hand on*, above.

A session an agent opens stays up through **two hours** with no command - a
person trying what it served is a person the agent is waiting for, and that
counts as idle - and an agent can ask for a different lifetime or idle timeout
with `orkbox_extend`. **Subagents share box sessions with the agent that asked
them**, both ways, the way they share scratchpads: either can run commands in a
session the other opened, on the grant of whoever opened it, and
`orkbox_sessions` lists them with who opened each. A conversation outside that
family cannot reach them.

### Exposing a port

An agent that serves something - a development server, a page - can ask for a
port of a running session to be made reachable with `orkbox_expose`. **Nothing
opens until a person allows it.** The chat and the session transcript ask, with
**Allow** and **Reject**, and the question waits at the bottom of the chat until
it is answered. The agent is told the outcome, with the address, in a message
that also wakes it.

The **Ports** panel, below Boxes, lists every port asked for: its box, whether
something answers on it, and **Allow** - or **Enable**, **Disable** and
**Delete** afterwards, at any time. An agent asking is a model deciding
something should be reachable from outside a sandbox, which is not a decision to
leave to it.

### Watching it work

A conversation's **Boxes** panel lists the box sessions its agents opened,
whether each is still running, and those it shares with the agent that asked it
or the agents it asked, marked **shared**. The **Box** tab above the transcript
shows a session's event log - what started and finished, files written,
commands run and how they ended - with any secret in it reading `***`.

### What contains this

The box, and nothing in this application. There is no list of forbidden
commands, deliberately: reading a command and saying what it will do is not a
problem that can be solved, and a list that is nearly right tells an
administrator they are protected while a command that downloads its own
instructions walks past it. What a box allows is what an agent in it can do, so
which runtime a box uses - a container per session, or processes on the host -
is the decision that matters; see *Boxes* under Administration.

## Tasks

![Every task this workspace has started](/screens/tasks.png)

A **task** is an agent given a problem and left to work at it until it says it is
done. A workflow is a graph somebody drew, and every step of it was decided in
advance; a task is the other bargain — you say what you want, the agent decides
what to do, and what you get is the working.

Start one from the **Tasks** section, or from an issue with **Start by AI**.

![A task being worked on: what it is thinking, what it called, what came back](/screens/task.png)

Its page fills in as the model works: what it is thinking, what it called, what came
back. You do not have to reload it — the log is followed as it is written, and
the block being written is the one that is open. Tool calls arrive folded, so a
long run reads as a list of what was done rather than as a wall.

You can also say something to a task while it is working. **Say something** on
its page takes a message, and the agent picks it up between the tools it is
running — so a report being written as prose becomes a table because you said so
half way through, rather than because you stopped the task and started another
with a better prompt. It reaches the agent within seconds rather than at the end
of the turn, and a task cannot finish while something you said is still unread:
an agent that tries to wrap up with a message above it gets another turn with
your words in front of it instead. Until it has been read the page says so, and
what was never read stays on the page afterwards saying that, rather than
disappearing.

**A task that has ended is not finished with you.** The same box stays on its
page reading **Carry on**, and what you type there sets that task working again
— the same task, on the same log, so the agent still has the poem it wrote, the
pictures it drew and the files it read. "Make the third stanza shorter" is this
piece of work continued, and starting a new task instead means explaining the
whole job to an agent that has just done it. The turn and time allowances start
again from your settings as they stand, so a task that stopped *because* it ran
out of turns can still be asked for more, and the summary it wrote is replaced by
the next one, with what it said still in the log.

The page follows the work as it happens and needs no refresh, but a connection
can stop without saying so — and from where you are sitting that looks exactly
like a model thinking for four minutes. **Auto** beside the live indicator sets
an interval to re-read the task at, Off by default, and it is the same setting
the Executions and Audit screens use.

A task can also **draw**. Where the workspace has chosen a text-to-image model —
the **Text-to-image** picker on its settings page, the same one a chat agent
draws with — an agent working a task is offered a tool that draws from a
description, and every picture it draws is shown under the task's outcome.
That holds whichever way the task ended: one that drew and then ran out of turns
still shows what it drew, because it was still paid for. Where no such model has
been chosen, the tool is not offered at all and the agent is never told it could
have drawn.

![A task that drew: what the agent said, and the pictures under its
outcome](/screens/task-picture.png)

A task ends in one of four ways. It says it is **done**, and its summary is the
last thing it writes. It **stops to ask** — a question, or permission for a
capability — and waits for you rather than guessing; answer it and it carries on
with exactly what you said. It runs out of **turns**. Or it runs out of **working
time**.

Those last two are the ceilings, and they bound different things. A turn is one
round of the agent's own tool loop: it is asked, it may call its tools, and it
answers. Working time is the sum of those turns — a task parked for two days
waiting for you has spent none of it. **Turns Per Task** is on the workspace's
settings page under Agents; left empty it means the installation's own number.
Both are copied onto a task when it starts, so raising one gives the next task
more and leaves the ones already running as they were.

Starting a task from an issue hands the agent the issue as a person would read
it: the number, the title and the kind, the labels, the description whole, and
the thread oldest-first with who said what. A long thread is cut from the front
and the prompt says how many were left out, because a decision is reached at the
end of an argument rather than at the start. The issue is picked up, and the
agent says so in the thread under its own name with a link to the task. Nothing
puts the issue back afterwards: the status is your statement about your own
tracker, not the machine's.

## Driving orknux from outside

The same tools are offered over **MCP**, for an agent that runs somewhere else —
on a laptop, in an editor, in another product. One server per workspace:

```
http://your-orknux/mcp/{workspaceId}
```

It speaks JSON-RPC over HTTP POST, and it authenticates the way everything else
here does: sign in first (`POST /api/session`) and send the session with the
request, or send an access token as `Authorization: Bearer orkx_…`, which is the
usual way in for something with no browser to keep a cookie in. Tokens are made
in Preferences, or by an administrator on a user's page; see Administration. What you may see through it is what you may
see in this interface — the same check, on the same workspace — and what you may
change is what you could already change by hand. Being reachable by an agent
grants nothing extra.

Everything with a page of its own comes back with its address, so an agent that
mentions a run can link you to it.

The workspace's **skills** are offered there too, as prompts and as resources,
so a client such as Claude Code can use one as a slash command or attach it as
a document. How a workspace goes about things is then the same whether the
agent asking is one of its own or one on somebody's laptop.

The workspace's own MCP servers, listed under Integrations, are a different
thing entirely: those are servers somebody registered for agents to call *out*
to. This is the way *in*.

### The tracker, over MCP

The workspace's issues are offered here too: list them, filtered by assignee, by
state, by labels or by a search; read one with its comments; comment on it; move
it between open and closed; and change its title, description or labels. An issue
is addressed by the number people say, so #4 to an assistant is #4 on the page.

It can also **file** one. An assistant that finds something and can only describe
it in a conversation is one whose findings depend on somebody else writing them
down, which is the failure a tracker exists to prevent. A filed issue is under
the name of whoever is asking, and assigned to nobody: deciding who should look
at something is a judgement for a person, and an assistant that assigned its own
findings would be handing out work.

Instead it names **observers**: the people or agents who should hear about it,
who then get everything the reporter and the assignee get without being given
the work. Naming nobody tells the installation's administrators, because an
issue assigned to no one and watched by no one is a report written into an empty
room. A name it cannot find is refused and nothing is filed, so a report that
reached nobody is never mistaken for one that landed. See Issues.

### Waiting to be told

One tool answers slowly on purpose. `orknux_news` gives whoever is asking what
has happened on the issues that concern them since they last read: assigned,
closed, reopened, commented on, or their name written somewhere. It also takes a
number of seconds to **wait** for. Given one, it holds the call open until
something happens or the time runs out, up to five minutes.

That is what lets an assistant be told rather than have to keep asking. Reading
marks it read and no place-marker comes back, so something that forgets
everything between one session and the next neither repeats a week of events nor
silently skips them.

An issue can be assigned to an agent as easily as to a person, and the same tool
takes the agent's name, so an agent can be asked to read what it has been sent
rather than what its owner has.

## Integrations

![The workspace's connections and the MCP servers its agents may
reach](/screens/integrations.png)

**Integrations** holds the workspace's connections — Slack, MCP servers, HTTP
endpoints. A connection made in the admin section can be marked as the default
for new workspaces; that setting lives on the connection's own page.

A connection has a kind — **Slack**, **Email (SMTP)** or **HTTP endpoint** — and
the kind decides what it asks for.

**GitHub** and **Jira** used to be kinds of their own. Neither was ever
implemented: nothing called a GitHub or a Jira API through a connection, so both
were plain HTTP endpoints wearing a service's name, and configuring one gave you
something that tested green and could not be used. They are gone, and the
connections that were stored as one are HTTP endpoints now, with the same
address, the same credential and the same headers.

The **HTTP endpoint** kind was called **Webhook**. The word named the wrong end
of the wire: a webhook is a path *this* installation exposes for somebody else
to call, which is what a webhook *trigger* is, while a connection is a URL this
installation sends a request to. Whether the far end calls what it is listening
on a webhook is the far end's business and was never visible from here.

**Slack** takes a bot token beginning `xoxb-`, and optionally an app-level token
beginning `xapp-`. The second decides what the connection does: given one,
orknux listens for mentions and starts the triggers waiting on them; left empty,
the connection only sends. There used to be two Slack kinds to choose between,
"outgoing only" and "Socket Mode", and they were one integration wearing two
names — whichever was picked, it listened the moment it held an app-level token.
Connections stored as Socket Mode became Slack connections on upgrade, both
tokens where they were, and go on listening exactly as they did.

**A Slack action has one Target field, and it takes a channel or a person.** You
are not asked which: type a name, a handle, an address or an id, with or without
its `#` or `@`, and the send resolves it when the message goes. There used to be
a **Channel**/**User** dropdown beside the field, and nothing read it to send
anything — its only real job was choosing which of Slack's two lookups answered a
question about what you had typed, and those lookups are one now. What was left
was a control that changed nothing when the workflow ran, narrowed the list of
suggestions to half of what it could offer, and got the check wrong whenever it
disagreed with the name beside it. Actions saved with the old setting keep their
target names and go on sending to them.

**What you type is checked as you type it.** Under the field, orknux says whether
that connection can see what is there — the name Slack gave it back when it
could, a mark saying whether it turned out to be a channel or a person, and a
note when it could not.

The same answer appears in the workflow editor, under a node's **target**
parameter, since that is where a step names who it is writing to. Only on the
**Value** tab: a **Reference** is read out of the run when the run reaches it, so
there is nothing to look up beforehand.

**The same field offers what that connection can see.** A list opens under it
with the channels *and* the people that match what has been typed so far — one
list, each row marked with which of the two it is — narrowing as you type, driven
by the arrow keys, taken with Enter or a click, and put away with Escape. Taking
one fills the field in, and nothing more happens to it: the check goes quiet
afterwards, because a name Slack has just offered is not a name worth asking
Slack about.

It suggests and it never fences. Anything can still be typed whether or not the
list holds it, and plenty of correct things never will: an id pasted out of
somebody else's message, a colleague who joined a minute ago, a private channel
this bot was never invited to, an archived channel. Where only the first few of
what matched came back the list says so, because one that quietly left the rest
out would read as the whole of what exists; and where nothing can be looked up at
all it says why, rather than opening empty and looking like a Slack with nothing
in it.

There are three answers rather than two, and the third is the one that catches
people out. A bot token set up only to post carries no permission to look
anything up: `users:read` for people, `channels:read` for channels, and sending a
message needs neither. So a perfectly working connection can be unable to answer
the question at all, and that reads as **not checked** rather than as **not
found** — one wants a scope added to the Slack app, the other wants the name
corrected, and confusing them sends you to the wrong place. The same answer comes
back for a Slack larger than one lookup reads, because ruling a name out from a
list that was cut short would be worse than saying nothing.

Nothing here refuses a save. The field stays free text and the action stores
exactly what you typed, whatever the note says, because a private channel this
bot was never invited to, a colleague who joined a minute ago and an id pasted
out of somebody else's message all look identical to a typo from outside.

A Slack connection is asked neither for an address nor for how it authenticates.
There is one Slack Web API and a bot token is a bearer token, so both are
already settled and a field offering to change them would be showing you a
decision it is not making. Either token can be revealed from its own field
afterwards, which is the only way to tell which one is stored, and the audit log
says which of the two was revealed rather than only that something was.
