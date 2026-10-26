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
on. Usage over time is charted on the model's own page. The providers table says
each row's type, and both lists - and the connections on Integrations - have a
**Type** filter, **All types** until you pick one, beside their search.

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

**An API key is needed only where the server asks for one.** An OpenAI-compatible
endpoint, Ollama and llama.cpp may be added with the key left empty - a server on
your own machine usually checks none - and one that does check answers *401*,
which the provider's card says in words. Anthropic and Azure OpenAI always need
one.

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

**Test Connection** asks with what is in the form, saved or not, and stores
nothing - so an endpoint or a key can be tried before it replaces the one that
works. Duplicating a provider copies the provider alone; its models stay where
they are, rather than appearing twice under two providers.

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
Picking a model a **llama.cpp** server offers fills its Context Window in for
you - the window the server actually runs it with - and puts 0 in both its
prices, since a model on your own machine costs nothing per token.

**Reasoning effort**, on a chat model's page, is how long a reasoning model
thinks before it answers: **None**, **Minimal**, **Low**, **Medium**, **High**,
**Extra high** or **Max**, offered for OpenAI, OpenAI-compatible, llama.cpp,
Ollama and Azure models. Left at the default nothing is sent and the model does
what it always did. A llama.cpp server hands the word to the model's own chat
template, where **None** turns thinking off; Ollama maps it onto its own thinking
levels. Anthropic models take none. A chat can choose another for its own turns
(see Chat), and so can an agent node (see Workflows).

### What a provider is sent

Four settings on a provider's page decide the shape of what goes to it.

**All tools up front** hands an agent every tool it holds from its first
request, past its own **Tools carried at once** and its Offer marks, up to the
provider's limit, so nothing has to be loaded. It is off by default for every
type, and the price of switching it on is a first prompt as large as the
agent's whole toolset.

**Extend the tool list with loaded tools** decides what happens to a tool an
agent loads with `tool_load`. On, it joins the tool list at the agent's next
turn and is called by its own name from then on. Off, the list stays as it was
for the conversation and the tool is called through `tool_run` - until the
conversation is compacted or a new one starts, when it is in the list from the
beginning. It is **off by default for llama.cpp** and on for every other type:
llama.cpp writes the tools at the top of the prompt, so each turn after a load
reads the whole conversation again, a minute and more on a long one. With it
off, an agent on llama.cpp is told plainly that `tool_run` is the only way to
call a tool it loaded. **All tools up front** avoids the question altogether.

**Most tools per request** is how many tools one request may carry, on top of
an agent's own **Tools carried at once**; the lower of the two wins.
Left empty it is what the type takes: **200** for an OpenAI provider - an
OpenAI-compatible server - but 128 where its endpoint is OpenAI's own API, which
refuses more; **128** for Azure OpenAI, which refuses more too; **300** for
Ollama and llama.cpp, which refuse no number and read the list at the head of
the prompt, so it may as well hold a large agent's every tool from the start;
and **256** for Anthropic. Past it the rest are still found as needed. Set it
lower for a server that refuses fewer, or to keep a small model's list short.

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

**The tool list and the instructions are frozen for a conversation.** What a
conversation's first request carried - the tools and the system turn - is sent
unchanged to its last, so nothing that changes along the way makes a local
server read the whole prompt again. A tool granted in the chat, a new tool an
MCP server or a plugin brings, plan mode switched on: each is said in a message
added to the conversation instead, and a tool the list still names but the agent
may not use now is refused in words when it is called. The list is made afresh
when the agent, its model or the session changes, or when the conversation is
compacted.

**An agent holding more tools than its provider takes carries as many as fit**
from its first message, rather than its Always tools alone with everything else
loaded one at a time; only the overflow is loaded, and its briefing marks only
those as *load it first*. A tool the list does not carry is called through
`tool_run`, or by its own name, and runs as itself - checked, approved and
logged under that name - and `tool_load` answers with the tool's description and
parameters rather than adding it to a frozen list.

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

A model can have **a time limit of its own**, on its page beside **Requests per
Minute**, for the one model that is slower or faster than the rest. Left empty,
it takes the installation's **Model Answer Time Limit**. Anthropic models follow
these limits too; they used to be held to `ORKNUX_MODEL_TIMEOUT`'s two minutes,
which is no longer read - an installation that set it sets the limit in Admin
Settings, or on the model, instead.

### How fast a model is

![A model on a llama.cpp server: its speed over its newest calls, and the chart of
its speed over time](/screens/model-speed.png)

Some providers say how long a call took to read and to write - **llama.cpp**
does, with every answer; OpenAI, Azure, vLLM, Ollama and Anthropic do not, and
for their models nothing is shown. Where the timings arrive, Orknux keeps them
with the call and shows them in three places:

- **On a session's page**, beside its cost: the **Prompt speed** - how many
  tokens a second the model read - and the **Generation speed** - how many it
  wrote - averaged over those of the session's calls whose provider reported
  them, and saying how many that was.
- **On the model's own page**, the same two numbers over its newest calls -
  fifty unless **How many recent calls a model's speed is averaged over** in
  Admin Settings says otherwise. That is how to tell whether a model is slower
  today than it was, without opening a session.
- **Under them, a chart of its speed over time**, over the same dates as the
  usage card: averaged per minute, hour, day, month or year - Day unless you
  choose, or Hour where the dates are a single day. A period with no timed calls
  is a gap in the line, never a zero, because a model that was not asked was
  not slow. Past a thousand periods only the newest are drawn, and the chart says
  so; **How many periods a model's speed chart draws** in Admin Settings moves
  that.

The averages are **weighted by tokens**: a call that read twenty thousand tokens
says more about how fast the model reads than one that read twenty, and an
average of calls would let the short ones drown it out.

### Prices, and what a conversation costs

![A hosted model's prices: input, cached input, cache writes and output, per
million tokens](/screens/model-prices.png)

A chat model's prices are set **on its own page**, under **Prices**, and in the
**Add Model** dialog when it is made. Each is in dollars **per million tokens**:

- **Input** - what the model reads.
- **Cached input** - input the provider served from its prompt cache, which
  hosted providers bill for less. Empty, cached input is charged at the input
  price.
- **Cache write** - input the provider wrote into its cache, which Anthropic
  bills for more. Empty, it is charged at the input price.
- **Output** - what the model writes.

Every cost Orknux shows - under an answer in a chat, a chat's running total, a
session's page, the reports - is worked out **call by call at the prices the
model had when the call was made**, so changing a price changes what is charged
from then on and leaves what was already spent as it was. How much of the input
was cached is read from the provider's own usage report - OpenAI's and Azure's,
the Responses API included, and Anthropic's cache reads and writes - and shown
on the model's page and in **Tokens by person**. A cost of a dollar or more is
shown to the cent.

A model with no prices costs nothing on the page - which is right for a model
on your own hardware, and why a report that mixes priced and unpriced models
says that some have no price rather than pretending the total is complete.

### Moving models to another workspace

Models are set up once and used in many workspaces, so they travel:

- **Export** on the Models page writes the workspace's models and the providers
  they are reached through into one file. **A provider's own row** has **Export**
  too, for that provider and every model on it.
- **Import** on another workspace's Models page reads the file back in.

**API keys are left out** of every export, deliberately - a file is easily
forwarded - so after an import each provider has to be given its key again on
its own page, or pointed at a workspace secret. Until then it fails its check
saying it has no credential, rather than failing at somebody's first question.

## Workspace models

Two model choices belong to the workspace rather than to a conversation:

- the **companion model**, used for the small jobs nobody should have to pick a
  model for — naming a chat, for instance. Clearing it switches those jobs off
  rather than falling back to something you did not ask for.
- the **speech-to-text model**, used by the microphone in chat. Only a
  transcription model will do.

Both are set in workspace settings, by its administrators - see *Workspace
members* under Administration.

## Templates

![Admin → Templates: an agent and a Slack connection published for every
workspace to start from](/screens/templates.png)

A **template** is something set up once - an agent, a model, a connection, an
MCP server, a workflow, any component - published for every workspace on the
installation to start from. It is a stored export: what a workspace gets by using
one is exactly what it would get by importing that file, so the same checks run
and the same import plan says what will happen before anything is made.

**Making one.** On a component's own row, **Save as template** publishes it -
asked for a name and a description, and administrators only, because a template
offers one workspace's work to all the others. Models are published from their
row on the Models page, and connections and MCP servers from theirs on
**Integrations**. **Admin → Templates** lists everything published, opens one to
rename it, reword it or replace its file, and publishes an exported file someone
sent you as a template of its own.

**What a template does not carry is a credential.** A connection or an MCP server
is published with its settings and without its token, key or password; a model
template carries its provider without the API key. Using one makes the component
in your workspace and then **links to each one that needs its credential given
again**, so nothing is left half-configured without anybody being told.

![Use a template on the Agents page: the templates of that kind, with the choice to
leave the agent's model out](/screens/use-template.png)

**Using one.** **Use template** on a page offers **only the templates of that
page's kind** - the Agents page offers agents, the Workflows page workflows, the
Models page models - and **Use a template** beside a card's **Add** on
Integrations does the same for connections and MCP servers. Tick one or several
and the import plan shows what each becomes before you confirm; it can be
filtered by what happens to each row, and the dialog and the plan are resized
from their corner.

![The import plan for the Account desk template: what will be made, and the
model it names with Leave out beside it](/screens/use-template-plan.png)

An agent's template names the model it was made on, which is often one your
workspace does not have. In the plan, **Leave out** on the model's row makes the
agent with no model chosen, for you to pick one on its page, rather than
refusing the whole template over a model you were going to replace anyway.
**Keep** puts it back.

A template holds a copy of the components **as they were when it was
published**, and follows nothing: editing the agent one was made from does not
change the template, and deleting a template does not touch what it already made
in a workspace. Replacing its file, on its page under Admin → Templates, is how
one is brought up to date.

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

### An agent's settings page

![An agent's settings with the menu down its side, scrolled to its Tool Rounds and
Progress messages](/screens/agent-settings-menu.png)

An agent's settings are a long page, so **a menu runs down its side**, as on the
other settings pages: **General**, **System Prompt**, **Model**, **Session
Memory**, **Tool Rounds**, **Progress messages**, the catalogs it is granted -
**Memory**, **Secret**, **Variable** and **Skill Catalogs** - then **Skills**,
**Tools**, **Tools carried at once**, **Connections**, the **Agents** it may ask,
**Orknux**, **Boxes**, **MCP Servers**, its **History**, what it is **Used by**,
and the **Danger Zone**. Pressing an entry scrolls to that part of the page, and
**Search settings** above the menu narrows it to the entries that match.

**Model.** The model the agent answers on. Under the picker, **Add a model**
opens the Models page with the **Add Model** dialog already open, for an agent
being set up in a workspace that has no model yet. **Only a model that chats
will do**: saving an agent with a newly chosen embedding, transcription or
speech model is refused, because none of them can answer. An agent already
holding one from before the rule is left as it is.

**Tool Rounds.** How many rounds one turn of the agent may take - a round being
one call to the model, which answers or asks for tools. Three places set it, and
the nearest wins:

1. the agent's own number, on this page;
2. the workspace's, under **Workspace Settings → Agents**, for every agent of
   that workspace that has no number of its own;
3. the installation's, **Tool Rounds** in Admin Settings - 100 unless changed.

**Progress messages.** How much the agent writes while it is still working - the
short messages that reach whoever asked before its answer does. In a Slack
thread they are the replies that arrive while the work is going on; in a chat
they are the lines above its answer.

| Level | What the agent writes before its answer |
|---|---|
| **None** | Nothing: it works in silence and says it all in its answer. The server holds it to that - anything it writes beside a tool call is kept in the session's log and goes nowhere else. |
| **Low** | One line on what it is about to do, then nothing until its answer. |
| **Medium** | That, and every few calls what it has found. Every agent that existed before this setting is on Medium, which is what agents had always been told. |
| **High** | A line at every step. |

A workflow node running the agent can set a level of its own, which wins for
that node (see *An agent node's own settings* under Workflows). A person can set
it for **one message**, too: a command word in the message - `!progress-none`,
`!progress-low`, `!progress-medium` or `!progress-high`, with the workspace's own
command marker in place of `!` - sets the level for that turn only and is never
mistaken for a skill. The chat's command menu offers the four, and the next
message goes back to the agent's own level.

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

**Grant to new agents**, on a connection's own page, ticks it on every agent
made from then on - the support Slack every agent ends up needing, say. Agents
already made are left as they are; tick it on them where they should have it.

### Asking for what it lacks

An agent that needs something it was not granted does not have to stop at "I
can't". Two built-ins, on for every agent unless **May ask for more tools** is
switched off on its page:

- `tools_ungranted` lists what the agent could be granted and is not: built-in
  tools it has hidden or that are off until asked for, the workspace's own
  tools, the loaded plugins', its MCP servers, Orknux access, **the workspace's
  connections**, and **box labels**.
- `tools_request` puts the ones it wants to the person, as a question in the
  conversation naming each one, its kind and what it does, with **Accept** and
  **Refuse**.

Accepted, the grant is **written to the agent itself** - the same lists its
settings page edits, with a version and an audit line - so it is permanent, and
the agent hears the outcome and is offered what it asked for from its next round.
Refused, it is told so and carries on without. Asking grants nothing by itself;
a person decides every time. That is how an agent holding a Jira tool and no
Jira connection asks for the connection, and how an agent with no box asks for
one by its label rather than only saying it has nowhere to run the code.

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

**One search box sits above the catalogs**, on the Skills page (**Search
skills...**) and on Memory, and
it searches every catalog at once - a plugin's included - and what a skill says
as well as its name and description. The matches are grouped under each
catalog's name, the column of catalogs counts them, and choosing a catalog
narrows the search to it. A plugin's catalog is searched the same way as the
workspace's own.

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

How an MCP server - or a connection - signs in is its **Auth** setting:

| Auth | Type into the secret | What is sent |
|---|---|---|
| Bearer Token | the token, `abc123` | `Authorization: Bearer abc123` |
| API Key | the header's whole value, `Token abc123` | `Authorization: Token abc123` |
| Basic | `username:password`, plainly: `alice:s3cret` | `Authorization: Basic YWxpY2U6czNjcmV0` |

For *Basic* do not encode anything yourself: Orknux turns `alice:s3cret` into
its base64, `YWxpY2U6czNjcmV0`, on every request. A secret that was encoded by
hand anyway - base64 that decodes to something with a colon in it - is
recognised and sent as it is rather than encoded a second time, so either works;
the plain form is the one to type, because it is the one you can read back.

**An MCP server can be tested before it is saved.** The Add dialog has **Test**,
which connects with what is typed - address, Auth, secret - and says what came
back, storing nothing. A saved server's page has **Check** on the status line
under the form. A connection's Add dialog has **Test Connection**, which does the
same.

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

**Asking the same agent again continues the conversation it had**, with what it
answered before in front of it, so a follow-up is a follow-up rather than a
stranger's first question. `ask_agent` with `fresh: true` starts a new one for
an unrelated question. A follow-up does not count against **Subagents Per
Conversation**, the cap on how many agents one conversation may ask - **25** by
default, set in Admin Settings or a workspace's own settings. What an asked
agent spends is booked in the usage report to whoever prompted the conversation
that asked it (see Reports).

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

### Schedules

![AI → Schedules: a reminder every weekday at nine and a check every two hours,
with when each runs next and Stop](/screens/schedules.png)

A reminder comes up once. **A schedule comes back on its own**: "remind me every
weekday at nine to look at the export queue", "check the escalations channel
every two hours". The agent sets one with `schedule_set`, and each time it runs
the note is left in the conversation's inbox the way a reminder rings - waking a
chat, a task or the workflow step's agent - so the agent takes it up there and
then.

A schedule is either an interval or a calendar:

- `every_seconds` - every so many seconds, starting from when it was set;
- `cron`, with a `timezone` - a five-field cron expression, `0 9 * * 1-5` for
  nine on weekdays, read in that time zone rather than the server's.

It can end by itself: `until` a time, or after a number of runs, `times`.
`schedule_list` lists the agent's own and `schedule_cancel` stops one by its id.
**Runs missed while the server was down are not made up**: a server restarted at
ten does not run nine o'clock's reminder late, which on a schedule meant for a
morning would be the wrong reminder at the wrong time.

Every agent has the tools unless they are hidden on its page. The workspace's
**Schedules** page, under AI, lists them - the conversation and its agent, the
note, when it runs, how many times it has, when it was set, its last run and its
next - with **Stop** on each and an **Ended** tab for the ones that finished.
A session's page lists its own. Two numbers bound them, under **Admin → Settings
→ Schedules**:

- **The shortest interval between two runs of a schedule** - five minutes unless
  changed (`ORKNUX_SCHEDULE_MIN_INTERVAL_SECONDS`), so an agent cannot ring itself
  every second.
- **Schedules one agent may have** at once - ten unless changed
  (`ORKNUX_SCHEDULE_MAX_PER_AGENT`). **Zero switches schedules off**: no agent is
  offered the tools, and one set before still runs until it ends or is stopped.

### Questions with options

![An agent asking which plan a renewal reminder should quote, with a line on what
each choice means](/screens/chat-options.png)

An agent that needs a decision only a person can make - which plan to quote,
which of two customers to answer first - asks with `ask_person` rather than
writing a question into its answer and hoping. The question is put in the chat
with **an option per row** and a line under each on what it means, so the person
answers in one click rather than in words the agent then has to interpret.
Where the agent allows it, several can be ticked; and there is always a box for
an answer of your own words when none of the rows is right.

The answer goes back to the agent as the next thing it reads, and it carries on
from there. Agents use it for any question whose answers they can list,
a quiz included.

### Reviews of a conversation

A person can **review a conversation** - a score from 1 to 5 and, if they want,
what they thought of it - and an administrator reads them all under **Admin →
Reports → Ratings**.

![A review sent by the agent when it was told "five stars": drawn in the chat it
was about](/screens/session-rating.png)

There are two ways to send one. From a chat's **+** menu, **Send a review**,
which asks for the **Score** - 1 is poor, 5 is excellent - and what went well or
wrong, if anything. Or by **telling the agent** - "five stars, I sent it
without changing a word" - which sends it with `rate_session`, saying the score
and the words as the person put them. Either way the review is drawn in the chat
it was sent from, so it is plain what was sent and by whom. Asked to, the agent
takes one back with `remove_session_rating`.

Both are on by default, and both are switched under **Admin → Settings →
Reports**: **Session ratings** for the reviews agents send, **Chat reviews** for
the menu. **Reviews Per Conversation** in the same place bounds how many reviews
one conversation may send - two unless changed - so "rate this again" does not
fill the report with copies of one opinion. See *Ratings* under Reports.

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
a workspace's or a plugin's tool. The built-ins that come with a wider grant —
the skill tools with the skill catalogs, the memories with the memory catalogs,
the `orknux_` tools with Orknux access, the `orkbox_` tools with the box labels —
are rows too, so the list is complete; they read that grant and are given and
taken away where it is.

### The tools an agent starts with

**A new agent starts the everyday built-ins at Always and the specialised ones
at Offer.** Always means the tool is in every request the agent makes; Offer
means the agent holds it and finds it with `tool_find` when a job needs it (see
*Finding a tool*, below). The difference only shows once the agent holds more
tools than one request carries - its own **Tools carried at once**, or its
provider's limit. Under that, every tool it holds is carried anyway.

- **At Always:** the notes, the to-do list, the clock, timers and schedules, the
  scratchpads, `pdf_read` and `sheet_read`, finishing a turn, and the rest an
  agent uses in most conversations.
- **At Offer:** what most conversations never need - `rate_session` and
  `remove_session_rating`; every `orknux_*` tool (workflows, agents, functions,
  runs, sessions, the manual, documents, diagrams, wireframes, research, the
  tracker); every `orkbox_*` box tool; the picture tools `picture_view`,
  `draw_picture`, `picture_link`, `svg_draw`, `svg_toPng`, `pdf_toPng`,
  `pdf_preview`, `charts_render` and `diagram_render`; the music tools
  `midi_read`, `midi_write` and `midi_render`; and the readers `svg_read`,
  `svg_measure`, `xml_query`, `pdf_search` and `validate_format`.

The same holds when Orknux access or a box label is given to an agent later:
the tools it brings arrive at Offer. **Agents that existed before this rule kept
the marks they had**, so an upgrade changed nothing anybody had set.

The `orknux_` tools cycle **Hide**, **Offer** and **Always** like any other row
while Orknux access is on. The box tools cycle **Offer** and **Always** only -
never Hide, because the box label grants them as one, and taking one away would
leave an agent in a box without, say, a way to read a file. In a workspace that
keeps its built-ins fixed, the server's own tools can still be set to Offer or
Always; only hiding one needs **Allow unsafe built-in tool visibility**, and
`finish_answer` stays Always.

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
  for a page. A PlantUML diagram is drawn in a house style unless it sets its
  own: rounded boxes without shadows, quieter lines, a colour per kind of thing
  - services, stores, queues, groups - and decisions as ovals in a colour of
  their own. One that sets its own `skinparam`, `!theme` or `<style>` keeps it.
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

### Reading what is too big to read whole

A model reads everything it is handed, and pays for it on every turn after. A
spreadsheet of ten thousand rows, a PCB layer's SVG or a three-hundred-page
contract handed over whole would fill the conversation and leave no room for the
question. So the server brings readers that **answer about a file instead of
pasting it**, and the note on an attachment, the answer of a read that was cut,
and `svg_read` and `pdf_read` all point at them.

- **`sheet_read`** reads a spreadsheet **a page of rows at a time**: a CSV, an
  Excel `.xlsx` or `.xls`, or an OpenDocument `.ods` from LibreOffice. A
  workbook's sheets are read by name, dates come back as ISO 8601, formulas as
  the values they last calculated, and a CSV's delimiter - comma, semicolon or
  tab - is found by itself, with its quoting and a byte-order mark handled. An
  `.ods` is recognised by what is inside it, not by its name, and a zip that
  turns out to be no spreadsheet is refused saying so. Two hundred rows a read
  unless **How many rows one read of a CSV or a workbook answers** says otherwise,
  and no more than **How much of a sheet one read hands a model** - 60,000
  characters.
- **`svg_read`** answers the markup of an SVG kept under a key - a drawing the
  agent made, or an attached `.svg` - so it can read it and change it.
- **`xml_query`** answers an **XPath** question about an XML or SVG file: how many
  elements match, which ones with their attributes, or one value. Fifty matches
  at most an answer, from a file of up to 20 MB.
- **`svg_measure`** measures an SVG's shapes with every group's transform
  applied: their boxes, the drawing's extent and its scale in millimetres, and,
  asked for, the distinct sizes, the nearest-neighbour pitch, the closest gaps
  and the shapes grouped by how close they are - the pads of a footprint, say.
- **`pdf_search`** finds words, a phrase or a regular expression in a PDF and
  answers the pages and the text around each match, saying when a scan has no
  text layer to search. `pdf_read` reads a range of pages; a read that would be
  too long stops at the end of a page and says which page to carry on from.

Only the answers enter the conversation. The files are parsed with external
entities and document type definitions refused, so an XML file cannot make the
server fetch something on its behalf. Each number above is under **Admin →
Settings → Limits**.

**Looking at a picture at an address.** `picture_view` takes a `url` as well as
a key: it fetches the picture into the session's store, shows it to the model,
and answers the key it is kept under, for attaching or uploading. Any address a
picture search answered in the same conversation may be fetched by any agent;
any other address only by an agent holding an HTTP tool, under the rules in
**Admin → Settings → HTTP tools**. Either way it goes through the installation's
proxy rules and its guard against internal addresses, is typed by its bytes
rather than its name - a page or anything that is not a picture is refused - and
is at most 5 MB (**The largest picture an agent may fetch from an address to look
at**).

A tool that reads a key and is handed an address instead says how an address
becomes a key - fetch it with `picture_view` or `http_download` first - rather
than that nothing is kept under it, which an agent once took to mean it could
not see pictures at all. What `http_download` keeps is typed by what the bytes
are where they say so, not by the header the server sent.

**Drawing for its own eyes.** `svg_toPng`, `svg_draw`, `diagram_render`,
`charts_render` and the wireframe and diagram drawing tools take `show`. Left out
it is true, and the picture goes into the chat as it always did. False keeps it
from the person: the agent still sees it, with its key, and is told the person
has not - for an agent checking its own work, such as a render of a PCB layer it
is about to change, which used to land in the person's chat as though it were
the answer.

**Looking is the agent's alone.** A page `pdf_preview` draws and a picture
`picture_view` shows are how an agent looks at something, and they go to the
agent only - a person asking about their own sheet music is not shown a
full-size render of the PDF they sent - and the agent is told the person has not
seen it. `pdf_toPng` puts its picture in the chat only when called with
`show: true`, which its description tells an agent to do when the person asked
to see it.

**Reading the manual.** `orknux_manual`, `orknux_manual_section` and
`orknux_manual_search` read this manual and search it, so an agent asked how
Orknux does something answers from the manual rather than from what it guesses.
They come with Orknux access, and are offered over MCP too.

### Music

An agent can **compose**. `midi_write` writes a MIDI file from notes it
describes - the tempo, the time signature, tracks each with a General MIDI
instrument by number or by name, drums on channel 10, chords - and a long piece
can be written a section at a time, added to the same file. `midi_read` reads a
MIDI file back as its notes, so an agent can check what it wrote or work from a
file somebody attached. `midi_render` plays a file into an **MP3, FLAC or WAV**
through the server's own synthesizer, which a chat plays where it is shown. All
three answer a key, which `save_artifact` or an upload takes.

The built-in skill **Composing music (MIDI)** says how to go about it: plan the
piece, write it, read it back to check it, render it and hand it over.

The synthesizer's own instrument bank is small and sounds like it. Set
`ORKNUX_MUSIC_SOUNDFONT` to a General MIDI `.sf2` file for real instruments.
**Admin → Settings → Limits** holds the longest piece rendered (300 seconds), the
sample rate (44,100 Hz) and the MP3 bitrate (192 kbit/s). A server started other
than with `java -jar` needs `--add-exports java.desktop/com.sun.media.sound=ALL-UNNAMED`
to render, and `midi_render` says so where it is missing.

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
exact names it wants for its next message. How a loaded tool is called after
that, and whether the agent's own ceiling applies at all, are the provider's
settings; see *What a provider is sent*, above.

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

**Upload** puts a file of your own on the page, held to the installation's
**Largest file**, and **Search artifacts** narrows the page by name. Each card
can be opened in a tab of its own, downloaded, deleted after a question - the
file goes from the disk as well as from the list - and, for a picture, opened in
Design's image editor.

![An uploaded report open in the viewer: its name, and in the bar Open in a tab,
Replace and Download beside Close](/screens/artifact-saved.png)

**Replace**, in the viewer's bar over a saved file - one uploaded here or saved
by an agent - puts a new file
behind the artifact at the same key and the same address, after a question that
names the new file. A link somebody was already sent opens the new file; the old
one is removed, the name follows the new file and the description stays. It is
held to the same upload limit and recorded in the audit log. A picture a run
drew has no Replace: it is changed in the image editor instead.

**An artifact on its own**, with nothing of Orknux around it, is at its own
address with `/content` on the end -
`/workspace/<number>/artifacts/SAVED-12/content`. It opens the file itself, as
**Open in a tab** does, but the address stays the same as the artifact is
replaced, which makes it the one to put in a bookmark or send to somebody who
reads the same report each week. It is the file under the same lock the viewer
uses: a page there runs no script and keeps no cookie.

## Letting an agent drive orknux

An agent's settings carry one switch that is not an MCP server: **Orknux**. It
lets the agent ask this installation about itself — its workspace's workflows,
runs and agents — and, unlike the Ask AI button as it is set by default, to start a workflow, which really
runs it.

It is deliberately not listed among the workspace's MCP servers. Those are
addresses somebody registered, with a credential; this is the application the
agent is already inside, so there is nothing to register and nothing to point
at. **A new agent starts with it on**, so it can answer questions about Orknux
itself - which workflow posts to Slack, why last night's run failed - and its
`orknux_` tools at Offer, found when a question needs them. Agents made before
that kept what they had. Turning it on or off is recorded in the audit log.

An agent that starts a workflow which asks an agent is a loop nothing here
breaks, so grant it where that is not a risk.

### Managing agents

With Orknux access an agent can look after the workspace's **agents** too.
`orknux_agent` reads one in full - its brief, model, grants and settings - and
`orknux_models` lists the workspace's models to choose from. Where the
conversation may change things, `orknux_create_agent` makes one and
`orknux_update_agent` changes one. Both go **through the agent page's own save**,
so what it does is refused for the same reasons a person's edit would be,
recorded in the audit log under its name, and kept as a version on the agent's
**History** - an agent that sets a colleague's brief wrong can be put back the
way any edit is. Hide the two writing tools on an agent's page to let it read
agents but not change them.

`orknux_models` also shows each model's provider and its prices, and, where the
conversation may change things, `orknux_update_model` changes a model - its
name, the name its provider knows it by, its context window and largest answer,
and its prices - giving only what changes; the rest is kept.
`orknux_start_task` sets one of the workspace's agents a task (see Tasks) - a
brief in full, since the agent sees nothing else of the conversation, a title,
and the number of an issue it is about if any - and answers the task's id and
link. The task really works: whatever its tools do, they do.
The MCP endpoint offers all three to a client outside, under the scope its token
carries.

### Keeping the diagrams true

Where a workspace has **diagrams** - its systems, its processes, who owns what;
see the Diagrams chapter - an agent holding `orknux_diagram_search` is told to
search them **before** answering how the workspace's systems, processes or
architecture fit together, and to read a node that looks relevant rather than
answering from memory. With `orknux_change_diagram` it is told, too, to **update
a diagram when it learns what one lacks or has wrong** - on a diagram open to
agents to change - and to say what it changed. The built-in **Memory** skill says
the same. A diagram that agents keep current is one a person can still trust
next quarter.

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

The built-in **Building workflows** skill says how to go about it: wire a graph
so that it runs, join every step with an edge, pass data between steps by
reference so the editor can show where it comes from, and **leave positions
out** - the server lays a new graph out left to right, a column a step, where a
model's own guesses put boxes on top of one another and hid the lines underneath.
Changing a graph a person has arranged is the exception: the skill says to read
it first and send back every node and edge being kept, positions included.

Nothing it makes skips a check. Everything goes through the checks the editor
uses, and every change is in the workspace's audit log under the agent's
name. **Saving over a draft somebody has not published is refused** unless the
agent says `overwrite_draft`, and the refusal tells it to read the workflow
first: a draft is somebody's unfinished work, and an agent that saved over it
without looking would lose it with no way back.

It can **draw wireframes** the same way. `orknux_wireframes` lists the ones in
Design and `orknux_wireframe` reads one; `orknux_create_wireframe` makes one,
with its elements in the same call if it is given them,
`orknux_change_wireframe` adds, changes and removes elements, and
`orknux_draw_wireframe` replaces the whole drawing. They are the tools the chat
down the right of the wireframe editor gives the model chosen there, and what
they draw is saved and audited as a save from the editor is.
`orknux_wireframe_html` writes one out as a single HTML page - each frame a
screen, buttons, fields and pictures as real HTML elements - and answers the
page with a link to download it, the same page **Export** in the editor saves.

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

**An agent can ask for a box.** One holding no label for the box it needs finds
it with `tools_ungranted`, which lists the box labels it does not hold, and asks
for it with `tools_request`, as for any other grant (see *Asking for what it
lacks*, above): the person accepts or refuses in the chat, and an accepted label
is added to the agent exactly as it would be on its page.

The built-in **Box Code Reading** skill teaches an agent to answer questions
about code from a checkout in a box - finding what calls what with ripgrep,
ctags and ast-grep, which the box toolchain image carries, rather than reading
files one by one into the conversation.

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

A connection has a kind — **Slack**, **Email (SMTP)** or **HTTP endpoint**, or
one a loaded plugin brings — and the kind decides what it asks for.

**The Add Connection dialog has Test Connection**, which checks what is typed
and stores nothing, so a token or an address is known to work before anything is
saved; a saved connection has it on the status line under its form. A plugin's
kind can bring three things of its own: a **setup guide**, shown beside the
form, for where on the service the token or the address is found; a **check**,
so Test asks the plugin whether the address really is its service rather than
only whether something answers there; and a **default address**, so a service
that always listens in one place can be added with the URL left empty. The Anki
plugin's AnkiConnect uses all three.

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
