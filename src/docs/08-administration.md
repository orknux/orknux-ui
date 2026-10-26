# Administration

The admin section is for the organisation rather than for any one workspace.
It is offered only to holders of the admin role.

## Workspaces

![Every workspace on the installation](/screens/admin-workspaces.png)

Create a workspace, rename it, give it a description, and assign the roles whose
holders may see it.

Deleting one is meant to take its contents with it, and today it refuses when
any of the workspace's agents is used by a node in a workflow — the workflow
still points at the agent, so the workspace will not go. Empty the graphs that
use them, or remove the workflows, and the delete goes through.

### Copying a workspace

**Duplicate**, on a workspace's row, copies its setup into a new workspace, and
asks **what to take** first - each kind can be left behind:

- connections, MCP servers, and model providers with their models;
- **variables**, secrets included **with their values** - a copy made to set up
  a second team should not mean typing every key in again;
- **memories**, the catalogs and what is in them;
- objects, functions, conditions, tools, skills, actions, agents, triggers and
  workflows.

The workspace's own settings always come. Its **workflows arrive published**,
so a copy runs the way the original does from its first trigger rather than
waiting for somebody to open and publish each one.

Its runs and sessions stay behind - a copy is how a workspace is set up, not
what it has done - and so do the credentials of connections, providers and MCP
servers: they arrive without them, and the answer names every one that needs
setting, and every variable that could not bring its value. Anything that could
not come is counted, with the reason for each one step away. A large copy shows
how far it has got - *Copying agents: 4 of 12* - as it goes.

### Workspace members

![A workspace's Members: everybody whose roles open it, and who among them
administers it](/screens/workspace-members.png)

Who **opens** a workspace is decided by roles, under Roles below. Who **changes
its settings** is decided on the workspace itself. **Members**, on a workspace's
settings page, lists everybody whose roles open it, with those roles, and makes
any of them a **Workspace admin**, or an ordinary **User** of it again. An
installation administrator is shown as **Installation admin** and always may.

**A workspace's settings are its admins' to change.** Every setting on that page
- its models, its chat, its agents' defaults, its sharing - needs somebody who
administers it: a role marked as administering in Admin, or a member made a
workspace admin here. The **Settings** entry is offered in the workspace's menu
only to them. On the upgrade that brought this, somebody who used to change a
workspace's settings without administering it found the page refused until an
administrator made them a workspace admin.

Somebody let in by a directory group alone is listed once they have signed in -
until then the installation does not know they exist.

### Sharing between workspaces

![A workspace lending its GPU box provider to another](/screens/workspace-sharing.png)

A workspace can **lend** another its **variable catalogs** and its **model
providers**, from **Sharing** on its settings page: choose what to share and
**With workspace**, and **Share**. The borrower's agents, model pickers and
variable pickers use what was lent as though it were their own - the GPU box one
team pays for answering another team's agents, one set of API keys kept in one
place. The borrower sees what it has been lent under **Shared with this
workspace**, from which workspace and by whom.

**Stop sharing** takes it back **at once**: the borrower's agents stop seeing the
provider and its models, and its pickers stop offering the catalog, from their
next request. Nothing is copied, so there is nothing left behind to clean up -
and nothing the borrower does changes what the lender has.

### Bulk import

**Import** on a component page takes **several files at once**, and **Use
template** takes several ticked templates, as **one import plan**: everything
they would create, change or leave alone, in one list, before anything is done.
The plan can be filtered by what will happen to each row - created, renamed
because the name was taken, left out - so a hundred rows can be checked for the
three that matter.

## Roles

![The roles this installation defines, and what each one opens](/screens/roles.png)

A role is what your provider says about somebody — a directory group, or a claim
from an OIDC provider — mapped once, here, to something this application
understands. Each has scopes, and for now those are `admin` and `user`.

Workspaces are then granted to roles rather than to group names typed in by
hand, so the same role can open several workspaces and a provider change is one
edit instead of many.

The built-in **Administrators** role cannot be edited or removed: an
installation that could delete its way out of having an administrator is one
nobody can get back into.

## Users

![Everybody this installation knows, and where each of them came from](/screens/users.png)

Two kinds of person appear here, and the badge on the row says which.

- **External** users come from your organisation's provider. They are recorded
  the first time they sign in, and almost nothing about them is edited here: the
  provider is what says who they are. Their email address is the one exception,
  below.
- **Internal** users are made here, for somebody the provider does not know - a
  contractor, a service, a person who needs one workspace and nothing else.
  Administrators only, and only this kind can be created.

![One user: the roles they hold, a password if they need one, and the tokens
they carry](/screens/user.png)

An internal user cannot sign in until somebody gives them a **password**, set on
their page and at least twelve characters long. Setting a new one replaces it
without asking for the old one, because an administrator doing this is how
somebody who is locked out gets back in. Changing your own password does ask for
the current one.

Internal users are tried before the directory when somebody signs in, so an
installation that authenticates everybody else through a single sign-on provider
still lets them in. Their roles then work exactly as anybody else's do.

The list says when each person **Last Signed In**, which is how to find an
account nobody has used since the spring. **A row opens the user**: press
anywhere on it rather than hunting for a button. Saving a user keeps you on the
page, with a **Saved.** note beside the button, so a second change does not mean
finding them again.

**Setting somebody's password ends their other sessions**, and so does changing
your own: every browser they were signed in on is signed out, and the one you
are in stays. The usual reason to change a password is that somebody else may
know the old one, and a new password that left them signed in would change
nothing.

## The first administrator

An account here is either made by an administrator or written down the first time
a provider vouches for somebody. An installation running with neither LDAP nor
OIDC therefore has nobody to create the administrator who would create you.

Two environment variables settle that at startup:

```
ORKNUX_BOOTSTRAP_ADMIN_USERNAME=admin
ORKNUX_BOOTSTRAP_ADMIN_PASSWORD=at least twelve characters
```

One internal user is made, holding the built-in Administrators role, signing in
on the ordinary form. Nothing about it is special - internal users have always
been tried before the directory, whatever the configured method is - and
everybody else is then made under Users.

It only ever **creates**. An account of that name that already exists is left
exactly as it is, password and roles alike, and the log says it was left alone.
Otherwise leaving the variables set would put back a role somebody deliberately
took away, or reset a password somebody has since changed, on every restart. A
password shorter than the twelve-character minimum seeds nobody rather than
making an account nobody could use.

**A password in an environment variable is a way in rather than a credential to
keep.** Anything that can read the server's environment can read it. Sign in,
change the password, and unset both variables; every start says so in the log
while the account still has the seeded one.

## Resetting a forgotten password

**Reset**, beside the password box on the sign-in page, asks for an address and
sends a link that lets somebody choose a new password.

The link **works once**, **stops working an hour after it was sent**, and using
it **signs that account out everywhere it was signed in**. The last of those is
the point rather than a side effect: the usual reason to be resetting a password
is that somebody else may know the old one.

Only an internal user who already has a password can be reset this way. A
directory or single sign-on account's password belongs to the provider, and
there is nothing here to reset.

The form answers the same sentence whatever the truth was - a real address, an
unknown one, an account whose password lives elsewhere - so it cannot be used to
find out who has an account here. That includes an installation with no mail
configured at all: the form still answers politely and the server log says why.
If links are not arriving, the log is where to look, because the form is written
never to tell you anything.

### What it needs

The installation sends this mail itself, through a mail server of its own. That
is deliberately not a workspace's SMTP connection: that connection belongs to
that team, and a reset link that stopped arriving the day they rotated their own
password would be a poor way to find out.

```yaml
orknux:
  mail:
    host: smtp.example.com
    from: orknux@example.com
    port: 587            # optional; follows security when left out
    security: STARTTLS
    username: ''         # empty sends without authenticating
    password: ''
  web:
    base-url: https://orknux.example.com
```

`base-url` is the address this interface is reached at, and the link in the mail
is written from it. It is configuration rather than something read off the
request, because the `Host` header on a request is written by whoever is
calling, and a reset link is exactly the thing not to let a caller choose the
address of.

## Too many wrong passwords

Signing in used to count nothing, so a username somebody knew existed could be
guessed at as fast as the network allowed - and under LDAP every attempt landed
on the directory as well.

Wrong passwords are now counted, per username and per calling address both. The
first few cost nothing - five in a row against one username, twenty from one
address - and after that there is a pause before each further attempt, which
doubles and then stops growing. Somebody made to wait is told so, and told how
long to leave it.

**Nothing locks.** The pause always ends, a successful sign-in clears the count,
and so does a quarter of an hour of quiet. That matters more than it sounds: a
lockout would mean anybody could shut a colleague out by guessing at their name
badly on purpose. The counts are kept in the server's memory, so a restart
clears them and two instances each keep their own.

The Reset form above is counted separately, for the same reason and by the same
arrangement, so somebody hammering one cannot hold you up on the other.

## Email addresses

Every user has an address: somewhere to write to them, when anything needs to.

It arrives on its own. The directory's `mail` attribute, or the OIDC provider's
`email` claim, is read at every sign-in and kept in step with whatever the
provider says, so for most people the field fills itself and is never touched.

Somebody who wants a different address sets their own in **Preferences**. An
administrator can set anybody's from that person's page under Users, external
users included - which is the point of the arrangement, since an external user
is exactly the person whose provider might have the wrong address or none at
all. Once an address has been typed, sign-in leaves it alone. A directory that
overwrote a chosen address every morning would make the field useless: the edit
would last until the next time that person arrived.

Clearing it hands the field back to the provider. The next sign-in seeds it
again from the directory, as though it had never been set.

## Access tokens

A token is a way of being a user without a browser: it is what an agent, a
script or the MCP endpoint uses. An administrator makes them on a user's page
under **Access Tokens**, and anybody with an internal account makes their own
under the same name in **Preferences**. Each is named for what it is for, and
the secret is shown once - **Copy it now - it is not shown again** - with a copy
button beside it and **Dismiss** to put it away once it is copied. Making and
revoking one is written to the organisation audit log.

The tokens are a table: **Name**, **Access**, **Created**, **Last used** - or
*never used* - and **Revoke** under **Actions**.

**A token can be read-only.** **What the token may do** is chosen when it is
made, beside its name: **Read and write**, or **Read-only**. A read-only token
answers every query and is refused every change; over MCP it is offered only the
tools that read; and any other request that is not a read is refused. That is
the token to hand a dashboard, a report script or an assistant that should look
and never touch. Tokens made before the choice existed are read and write.

**A token cannot make another token.** Tokens are made from a signed-in session
only - the page, or the API called with a session - so a token that leaks cannot
be used to mint a second one that outlives revoking the first.

- It begins `orkx_`, so one that has leaked is recognisable on sight in a log or
  a paste.
- Only a hash of it is stored, which is why there is no way to see it again.
- It is sent as `Authorization: Bearer orkx_…`, and that is what reaches both
  the API and the MCP endpoint.
- It carries its owner's roles and nothing more. Read-only is the one narrower
  grant there is: otherwise a token is that user by another door.
- It does not expire. Revoking is how one ends, and each row says when it was
  last used - or that it never has been - so one nobody needs is easy to find.

Tokens belong to internal users. A token for somebody the provider vouches for
would outlive whatever the provider later decides about them.

## Single sign-on, and who a token was issued for

Where an installation signs in with OIDC, a bearer token presented to the API is
checked against **who it was issued for** as well as who issued it. A token has
to name this installation in its `aud` claim.

Only the issuer used to be checked, which meant any token that provider had
minted was accepted here - including one issued to a different application
registered in the same Keycloak realm or Entra tenant. Roles come from a claim,
so a group called `admins` in that other application's token made its holder an
administrator here.

**This one can lock an installation out, and it is worth checking before you
upgrade.** Browser sign-in is unaffected, and so is any provider that writes the
client id into the tokens it mints for this application. Bearer calls stop
working where it writes something else: Keycloak names `account` unless an
audience mapper is configured against this client, and Entra names the
application's App ID URI rather than its client id. What that looks like is a
`401` on API calls that worked yesterday, with `The aud claim is not valid` in
the server log.

Either configure the provider to name this client, or say what the tokens
actually carry:

```
ORKNUX_OIDC_AUDIENCES=api://orknux,orknux-server
```

It takes a list, and a token has to match one of them rather than all. Setting it
replaces the client id rather than adding to it, so list the client id too if
some tokens still carry it. There is no way to turn the check off, deliberately:
a token nobody checks the audience of is a token from any application in the
tenant.

## Audit logs

![The audit log: who changed what, and when](/screens/audit.png)

There are two, and the difference matters.

- The **organisation audit log** records what happened to the organisation:
  workspaces created, renamed and removed, their directory group and
  description changed, installation-wide switches pressed, access tokens made
  and revoked, and the proxy rules and boxes configured below.
- Each workspace's own **audit log** records everything that happened inside
  it — workflows, agents, models, memory, objects, integrations, chats and issues.

Both can be filtered by user and by period, and searched.

## Settings

![The switches that belong to the installation rather than to a workspace](/screens/admin-settings.png)

What this installation allows, for every workspace in it.

- **Chat** — whether this installation has a chat at all. Off takes the tab
  away and refuses new messages; conversations already had are kept. A
  workspace's own Chat settings go with it — the companion model, the
  speech-to-text and the text-to-speech models are a chat's and nothing else's.
  The Quick Chat model stays: the Ask AI button is a separate thing under the same
  word, and what turns that off is choosing None for its model.
- **Files in chats** — whether messages may carry attachments. Off takes the
  button away; what has already been uploaded stays where it is. It governs the
  files put on an issue as well, whatever the label says, and both use the same
  storage and the same size limit.

Under **Chat** too are the numbers that bound a conversation with a model:
**Tool Rounds** (100), **Note Length** and **Notes Per Conversation** for what an
agent writes to itself, **Empty Answer Retries** and **Unusable Reply
Retries**, **Model Answer Time Limit** (an hour), how often the *Writing…* line
is updated and how long it is believed, **Reading Progress Shown After** for a
llama.cpp server, **Widgets Per Chat** and **Longest Chat Timer**, and **Session
Value Size** (8 MB, up to 256) and **Session Store Keys** (200) for what an agent
keeps in its session's store - large enough for an exported project to be
handed to an upload tool.

The rest of the page is in sections, listed in a menu down its side and each
reachable from Quick actions: **Address** (where the installation is reached),
**Grammar**, **Chat**, **Agents** (how long one may sleep, how many others it
may ask and at once, and how long to wait out a rate limit that names no time),
**Tool calls** (how many per reply, and when a repeated call counts as a loop),
**Tool list**, **HTTP tools** (whether agents may make requests at all, and
where to), **Watchers**, **Schedules**, **Bulkheads**, **Sessions** (when a long
one is summarised, how much of each value a transcript keeps, and whether a
conversation can be removed at all), **Scratchpads** (how much text and how much
in files a session keeps), **Boxes**, **Drawing**, **Commands**,
**Attachments** (the largest upload), **Metrics**, **Reports** (what is recorded
for Admin → Reports), and further down the ones about the installation itself -
component history, runs, queued tasks, objects, plugins, workspace copies,
**Server updates** - and last **Limits**. Every one of them is listed, with its
default, at the end of this chapter's settings sections.

Below each switch, in grey, is what the operator set in the configuration file:
where attachments are written, what storage they use, and how large one file may
be. Those are read-only here — a filesystem path is not something to hand a
browser the ability to change.

The configuration file is the floor. An administrator can turn something off
from this screen, but not back on where the file has said no.

### How long component history is kept

Every save of a function, a tool, a skill or an agent keeps what that component
was before it, and every publication of a workflow is kept as a version of it;
both are described under Workflows. **How many days of that to keep is set
here**, and it is fourteen until somebody changes it.

A version is a whole copy — the code, the parameters, the prompt — rather than a
note of what changed, so this is the number that decides how much disk the
history takes. An installation with a hundred functions edited all day is a
different proposition from one with six, which is why it is a setting rather
than a constant, and why it belongs to whoever owns the disk.

It is counted from when a version stopped being current rather than from when it
was written. A prompt composed a year ago and replaced this morning has a
fortnight ahead of it, instead of being swept the moment it is recorded. **A
workflow's live publication is never swept**, whatever its age: it is not
history, it is what that workflow runs, and a tidy-up that silently stopped a
workflow published two years ago would be a poor kind of housekeeping.

`ORKNUX_REVISION_RETENTION_DAYS` is what a fresh installation starts at, and
this is the one thing on this page the configuration file is not the floor of:
once an administrator has stored a number here, that is the number in force, and
the page says as much where the two disagree. Between a day and ten years, and
there is no off — a history nobody keeps is a different decision from a short
one, and it would want a switch of its own rather than a zero in this box.

### How long a plugin may run

A plugin is a bundle, and loading one costs more than calling a function, so it
has a bound of its own rather than the one a workspace's own JavaScript runs
under. **The number is set here**, between one second and five minutes, and it
is thirty seconds until somebody changes it.

It is read per call, so a change decides the next call and never one already in
flight. A call that overruns is stopped and says the number it was held to, which
is the difference between "the plugin is broken" and "the plugin wanted longer
than this installation allows".

`ORKNUX_PLUGIN_TIMEOUT_MILLIS` is the floor a fresh installation starts at.

### How long a run is kept

A finished run is kept with its steps, and swept once it is older than the
number set here — ninety days until somebody changes it. A deleted workspace
takes its runs with it whatever this says.

### HTTP tools

An agent granted `http_get`, `http_request` or `http_download` may fetch any
address this server can reach, and whether that is acceptable is the
installation's decision rather than each agent's author's. **This section is
where it is made**, for every agent in every workspace at once.

**The switch** takes the three tools away from every agent. Nobody's grant is
touched — the agent's Tools list goes on showing them, and says why they do
nothing — so switching them back on puts each agent back exactly where it was,
rather than leaving somebody to remember who had held what.

**Where they may go** is **Allow any URL** or **Allow list**. Under an allow
list a request is made only when a rule's regular expression matches the
**whole** URL and the rule lists the request's method; `http_get` and
`http_download` are GET. Unlike a proxy rule, which is matched anywhere in the
address, this one is held to all of it, because a fence that `example.com`
satisfies from inside `example.com.attacker.net` is not a fence. An allow list
with no rules allows nothing, and the page says so.

Redirects are not followed, and never were: a `Location` is a new address, so
it is a new request and meets the same check. A list that allows one host
cannot be walked off by a server that answers with somewhere else.

**Whether an address may be requested** is the tester. It asks the rules as
they are on the page, before they are saved, and answers which rule allows the
address, or that none matches, or that one matches but not for that method —
and it shows the sentence an agent would be told, because that sentence is
what the agent has to work with when it is refused.

An agent holding any of the three is also given `http_allowList`, which answers
the policy and how to read it. Asked where it may send requests, an agent used
to answer from whatever tool descriptions it had happened to see; each HTTP
tool now says that the destinations are the installation's decision and that
`http_allowList` is where to ask, and it is carried with them even where they
are found by search rather than sent up front.

**What this does not cover.** Functions, JavaScript tools and plugins calling
`orknux.http` are untouched: they are code somebody in the workspace wrote and
saved, not a model choosing an address while it answers. The proxy rules under
Networking still apply to everything, these tools included.

### Watchers

A watcher calls an agent's tool on an interval until the result matches, and
each call is a call to whatever that tool reaches; see *Watchers* under AI.
**This section bounds what one may cost**: **The longest a watcher may run** (a
week), **The shortest interval between two checks** (15 seconds), **The
shortest interval between two looks by the agent** (five minutes - each look is
a turn on a model), and **How many watchers one agent may have running** (10,
across all its conversations). Zero there switches watchers off, and agents are
then not offered the tools at all. The longest run is fixed when a watcher is
set, so lowering it does not end the ones already going.

**Agent's watcher looks** are the backoff an agent's own looks follow when it
asked for no interval of its own: **First look after** (five minutes), **Each
wait multiplied by** (2 doubles every wait, 1 keeps the first delay as a fixed
interval) and **Longest wait** (a day). Under them, **When the agent would
look** works the three numbers out for watchers from ten minutes to a week - *1h
watcher: 3 looks, at 5m, 15m, 35m* - because a backoff is another of those
things nobody works out in their head.

`ORKNUX_WATCHER_MAX_SECONDS`, `ORKNUX_WATCHER_MIN_INTERVAL_SECONDS`,
`ORKNUX_WATCHER_MIN_AGENT_CHECK_SECONDS`, `ORKNUX_WATCHER_LOOK_INITIAL_SECONDS`,
`ORKNUX_WATCHER_LOOK_MULTIPLIER`, `ORKNUX_WATCHER_LOOK_MAX_SECONDS` and
`ORKNUX_WATCHER_MAX_PER_AGENT` are what a fresh installation starts at.

### Bulkheads

**Walls that keep one agent turn from taking the server down.** An agent turn
holds every tool result it gathered and sends them all again each round, and a
few of them at once on a modest heap is how a server used to run out of memory
and limp on half-broken. Each wall has its own switch, and switching one off
restores exactly what happened before it existed; changes apply to the next
turn, without a restart.

- **Limit agent turns at once** — **Agent turns at once** (4) counts workflow
  agent steps, chats and tasks together; a turn past it waits **How long a turn
  waits for a place** (two minutes) and is then refused with a sentence saying
  why, which a workflow step's retry policy then deals with. A subagent runs
  inside the turn that asked for it. A fat turn holds a few hundred megabytes at
  its peak, so a 2 GB heap takes about four.
- **Stop turns when memory is short** — before a turn starts and before each
  round, the heap is read as the last garbage collection left it, and above
  **Heap after a collection, at most** (85%) the turn stops with a message
  instead of carrying on into running out.
- **Bound what one turn holds** — **Tool results one turn may hold** (48 MB)
  drops the oldest results first, each leaving a line saying so, and **The
  longest single tool result kept** (512 KB) cuts one result and tells the model
  how much was left out and to ask for less.

All three are on by default. Raise them, or switch one off, where a busy
installation on a large heap needs more. The section says how many turns are
running now and what the heap was after the last collection.

### One Save, at the top

Every number on this page is written by the one Save in its header, and it wakes
only when something differs from what the server holds. The switches above keep
none: a switch that needed saving would be a switch that lies about what it is
showing, so those take effect as they are flipped.

### How long before a stuck task is picked up

A task is written down and then handed to a worker, and that hand-over can be
lost — a restart in the moment between the two, or a pool with nothing free to
take it. The task then says Queued and nothing looks at it again. **How long a
task may sit like that before something picks it up is set here**, and it is
five minutes until somebody changes it.

The same number is how often the looking happens, so a task that is genuinely
stuck is started again within about twice it. It is not what makes this safe: a
task a worker already has is never handed over a second time, whatever this
says, and the interval only decides how long a lost one is left. Between a
minute and a day — below a minute buys nothing, since a task leaves Queued as
soon as a worker reads its row.

`ORKNUX_TASK_SWEEP_MINUTES` is what a fresh installation starts at, and a stored
answer takes over from there, as with the retention above. The next pass reads
it, so a change needs no restart.

**This field is not on the screen of an installation running Temporal.** There a
task is a durable workflow, the looking still happens and starts the workflow
again where there is none running, and how long it waits comes from the
configuration file: recovering a stuck task is Temporal's business, and a number
this screen could change would be claiming otherwise.

### When a server dies in the middle of a step

A server that is killed says nothing, so whatever step it was working on is
noticed only by something looking for it. **Workflow runs** has the two numbers
that decide how soon, one for each engine.

**Step heartbeat** is Temporal's. A step reports that it is still being worked
on while it works, and one that falls silent for this long is handed to a
server that is alive — thirty seconds until somebody changes it. Without it a
dead server was noticed only when the whole step timeout ran out, which for an
agent step was five minutes of a message going unanswered. A run already going
takes a change up from its next step. Zero turns the heartbeat off. Between 0
and 600 seconds; `ORKNUX_TEMPORAL_STEP_HEARTBEAT_SECONDS` is the starting value.

**Agent step goes after a restart** is the inline engine's. There a step a
restart cut short is failed, because nothing can say how far it got — with one
exception: **an agent answering a message is asked again**, since a message
nobody answers is the failure people notice, and the run used to end Failed
until somebody pressed Rerun. This is how many goes it gets in all, the one
that died included, because the step itself may be what is killing the server
and a loop of restarts is worse than a failed run. Three until somebody changes
it, between 1 and 10; `ORKNUX_INLINE_RESTART_ATTEMPTS` is the starting value.

On either engine an agent step asked a second time does not write its question
into the session again, so the model is not shown it twice and the transcript
does not say it was asked twice.

### Limits

![Admin → Settings → Limits: the numbers the server used to keep in its code, each
with what it is now and the range it may take](/screens/admin-settings-limits.png)

Below the named settings, **Limits** lists every number the server behaves by
that used to be written into its code: how long a Retry-After is waited out,
how many rows one read of a spreadsheet answers, how many pictures one run may
draw, how long a library may take to install. Each is a box with what it counts
beside it and its meaning behind the (?).

- **A change applies at once**, without a restart, and is written to the
  organisation audit log with who made it.
- **Each starts at its `ORKNUX_TUNING_*` environment variable** - the one named in
  the table below - and at the number in the table where the variable is not set.
  An administrator's choice here wins over the variable; clearing the box hands it
  back to the variable.
- **Out of range is refused**, saying the range, rather than saved and ignored.

The tables are the whole list, grouped as the page groups them.

#### Model calls

| Setting | Default | Range | What it does |
|---|---|---|---|
| **The longest Retry-After a model call waits out** | 120 seconds | 0-3,600 | A provider answering 429 with a Retry-After is waited out on the spot, below any node's own retry policy, when the model accepts it. A longer wait than this is handed back to the node instead of holding a worker. Zero never waits. `ORKNUX_TUNING_MODEL_RETRY_AFTER_LONGEST_SECONDS` |
| **How many Retry-Afters one model call waits out** | 2 times | 0-20 | After this many, the call fails and the node's retry policy decides what happens next. `ORKNUX_TUNING_MODEL_RETRY_AFTER_ATTEMPTS` |
| **The longest a throttled model call is held** | 60 seconds | 1-3,600 | A model or provider with a token rate holds calls that would overshoot it. The hold grows with how far over the rate the window is, and stops growing here, so an overshoot is a delay and not an outage. `ORKNUX_TUNING_MODEL_THROTTLE_LONGEST_DELAY_SECONDS` |
| **How long fetching a drawn picture may take** | 60 seconds | 1-600 | Some image models answer with a link rather than the picture; this is how long collecting it from that link may take. `ORKNUX_TUNING_MODEL_IMAGE_FETCH_SECONDS` |
| **How many recent calls a model's speed is averaged over** | 50 | 1-1,000 | A model's page averages the speeds its provider reported over this many of its newest calls, and a session's page lists this many of its newest calls with theirs. Only providers that report timings, such as llama.cpp, have any. `ORKNUX_TUNING_MODEL_SPEED_CALLS` |
| **How many points a model's speed chart draws** | 1,000 | 10-50,000 | A model's speed chart averages its calls per minute, hour, day, month or year over the dates chosen. Past this many periods that had calls, it draws the newest this many and says so; minutes over thirty days are 43,200. `ORKNUX_TUNING_MODEL_SPEED_POINTS` |

#### Agents

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How long agent_wait waits when not told** | 30 seconds | 1-3,600 | An agent that has asked other agents may wait for them with agent_wait; this is how long, when it does not say. It returns as soon as one of them finishes. `ORKNUX_TUNING_AGENT_WAIT_DEFAULT_SECONDS` |
| **The longest agent_wait may wait** | 300 seconds | 1-3,600 | A model that may sleep for an hour will. An agent asking for longer is given this. `ORKNUX_TUNING_AGENT_WAIT_LONGEST_SECONDS` |
| **How many findable tools one search loads** | 8 | 1-50 | An agent with more tools than its briefing names finds the rest with tool_find. This is how many of the matches one search hands it at once; the rest are counted and a narrower search finds them. `ORKNUX_TUNING_TOOLS_LOADED_AT_ONCE` |
| **How many names or searches one tool_find call may carry** | 8 | 1-50 | What an agent asks for beyond this in one call is ignored. `ORKNUX_TUNING_TOOLS_SEARCHES_AT_ONCE` |
| **How much of the model's window one tool result may take** | 10% | 1-90 | A longer answer is cut to this share of the model's context window, counted at the characters a token below, and the model is told how long it was and how to read the rest. Applies to models whose window is known. `ORKNUX_TUNING_TOOL_RESULT_WINDOW_PERCENT` |
| **How many characters a token is counted as against the window** | 1 characters | 1-8 | What turns a share of the model's window into a length to cut at. One never lets a result past its share; markup and numbers come to barely more than one a token, prose to about four. `ORKNUX_TUNING_TURN_WINDOW_CHARS_PER_TOKEN` |
| **How much of the model's window a shrunk turn leaves free** | 25% | 5-75 | A turn the provider refuses as too long is summarised and cut until it fits the window less this share, which is left for the tool list, the instructions and the answer. `ORKNUX_TUNING_TURN_WINDOW_RESERVE_PERCENT` |
| **How many scratchpads one session may open** | 50 | 1-1,000 | Scratchpads are an agent's working files; what they may hold in bytes is set under Scratchpads. `ORKNUX_TUNING_SCRATCHPAD_PADS` |
| **How many rows one read of a CSV or a workbook answers** | 200 | 1-10,000 | An agent reading an attached sheet is handed this many rows at a time and told where the rest begin, so a large file is read in pages rather than all at once. `ORKNUX_TUNING_SHEET_ROWS_MOST` |
| **How much of a sheet one read hands a model** | 60,000 characters | 1,000-10,000,000 | A page of rows stops early once its cells come to this many characters. A model pays for every character it is handed. `ORKNUX_TUNING_SHEET_ANSWER_CHARACTERS` |
| **The most one part of a workbook may unpack to** | 100 MB | 1-2,000 | An .xlsx or an .ods is a zip, and a small one can unpack to gigabytes. A workbook with a part larger than this is refused rather than read. `ORKNUX_TUNING_SHEET_UNPACKED_MB` |
| **How many matches one XML or SVG question lists** | 50 | 1-5,000 | An agent querying an XML file or measuring an SVG is handed this many nodes or rows at a time, with the total counted, and pages through the rest. `ORKNUX_TUNING_XML_MATCHES_MOST` |
| **The largest XML or SVG file an agent may query or measure** | 20 MB | 1-500 | A larger file is refused rather than parsed. Parsing holds the whole document in memory, several times its size. `ORKNUX_TUNING_XML_FILE_MB` |
| **How much of a long attribute or text an XML query shows** | 200 characters | 20-100,000 | A longer value, such as an SVG path's d, is cut to this with its length said, unless the agent asks for it in full. `ORKNUX_TUNING_XML_ATTRIBUTE_CHARACTERS` |
| **How close SVG shapes must be to be grouped, when the agent gives no gap** | 100% | 1-10,000 | Grouping shapes by proximity, such as pads into footprints, joins two whose edges are within this share of the shapes' median nearest-neighbour pitch. `ORKNUX_TUNING_SVG_GROUP_GAP_PERCENT` |
| **How much text around each PDF search match is shown** | 200 characters | 20-5,000 | A search of a PDF answers the page of each match and this much of the text around it. `ORKNUX_TUNING_PDF_SNIPPET_CHARACTERS` |
| **How many matches one PDF search lists** | 20 | 1-1,000 | The total is always counted; past this the agent is told how many more there are. `ORKNUX_TUNING_PDF_MATCHES_MOST` |
| **How much text one PDF read answers** | 200,000 characters | 1,000-2,000,000 | A read stops at the last whole page under this and says which page to read on from. `ORKNUX_TUNING_PDF_READ_CHARACTERS` |
| **How many PDFs' text is kept for searching again** | 16 | 0-1,000 | The text of a searched PDF is kept in memory by its content, per session, so a second search does not read the file again. The least recently searched goes first; 0 keeps none. `ORKNUX_TUNING_PDF_TEXT_DOCUMENTS` |
| **Pages from which an attached PDF is read a part at a time** | 20 | 1-100,000 | An agent handed a PDF of at least this many pages is told to read it a few pages at a time and summarise each part before going on, rather than reading it whole. `ORKNUX_TUNING_PDF_LONG_PAGES` |
| **Pages in one part of a long attached PDF** | 5 | 1-1,000 | How many pages the agent is told to read at a time from a PDF long enough to be read in parts. `ORKNUX_TUNING_PDF_STEP_PAGES` |
| **How long one regular expression somebody wrote may take to match** | 2 seconds | 1-60 | Watcher conditions, scratchpad searches, workflow conditions and HTTP tool rules run patterns this server did not write. One still matching after this is stopped and counts as no match; a watcher it belongs to ends and tells its agent why. `ORKNUX_TUNING_REGEX_MATCH_SECONDS` |
| **The longest result a watcher's regular expression is held against** | 1,000,000 characters | 10,000-10,000,000 | A watcher whose tool answers with more than this ends, and tells its agent to point tool_result_path at the part that matters. `ORKNUX_TUNING_WATCHER_MATCH_CHARACTERS` |
| **How much of a watcher's result is kept and shown to its agent** | 10,000 characters | 500-1,000,000 | Each check keeps the beginning of what the tool returned, and the message that wakes the agent carries the same; the rest is cut, and the message says how much. The condition is still held against all of it. `ORKNUX_TUNING_WATCHER_RESULT_CHARACTERS` |

#### Functions and HTTP

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How long one HTTP request from a tool may take** | 30 seconds | 1-600 | The http_request and download tools an agent calls. A function's own orknux.http is bounded by the function's timeout instead. `ORKNUX_TUNING_HTTP_TIMEOUT_SECONDS` |
| **How much of an HTTP answer a tool hands a model** | 200,000 characters | 1,000-10,000,000 | The rest is cut. A model pays for every character it is handed, so this is a cost as much as a size. `ORKNUX_TUNING_HTTP_BODY_CHARACTERS` |
| **The largest file a tool may download** | 5 MB | 1-500 | What the download tool fetches is kept in the session's store; anything larger is refused before it is kept. `ORKNUX_TUNING_HTTP_DOWNLOAD_MB` |
| **The largest picture an agent may fetch from an address to look at** | 5 MB | 1-100 | picture_view given an image's address fetches it into the session's store and shows it; a larger answer is refused as it is read, and nothing of it is kept. `ORKNUX_TUNING_PICTURE_URL_MB` |
| **The most results one web search may ask for** | 20 | 1-100 | An agent asking for more is given this many. `ORKNUX_TUNING_SEARCH_RESULTS_MOST` |
| **How long one web search may take** | 20 seconds | 1-300 | Counted for the search provider's answer, not for reading the pages it names. `ORKNUX_TUNING_SEARCH_TIMEOUT_SECONDS` |
| **How many lines one function call may log back** | 500 lines | 10-100,000 | The lines are handed back with the answer and shown on the run; past this many they still reach the server's log but no longer travel with the result. `ORKNUX_TUNING_SCRIPT_LOG_LINES` |

#### Commands from the chat

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How long a command run from the chat may take** | 600 seconds | 1-86,400 | A command run with the Run button on a chat answer is stopped after this long. An elevated one counts the time the administrator prompt waits for an answer. Its output stays readable for as long again after it ends. `ORKNUX_TUNING_COMMAND_TIMEOUT_SECONDS` |
| **How much of a command's output is kept** | 200,000 characters | 1,000-10,000,000 | What a command run from the chat prints past this is dropped, and the page says it was cut. The command runs on regardless. `ORKNUX_TUNING_COMMAND_OUTPUT_CHARACTERS` |

#### Pictures and speech

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How many pictures one workflow run or task may draw** | 20 | 0-1,000 | Drawing is the most expensive call there is. Zero refuses every drawing. `ORKNUX_TUNING_PICTURES_PER_RUN` |
| **How many times one workflow run may speak** | 20 | 0-1,000 | Each is a call to a speech model. Zero refuses every one. `ORKNUX_TUNING_SPEECHES_PER_RUN` |
| **How fast answers are read aloud** | 100% | 25-400 | For whoever has not chosen a speed in voice mode; 100 is the speech model's own pace. `ORKNUX_TUNING_SPEECH_SPEED_PERCENT` |
| **The largest sound a chat message may send to a model** | 20 MB | 1-1,024 | An mp3, wav or flac goes to a model that takes audio as itself, in base64 on every round of its turn; a larger one is refused before the model is asked. `ORKNUX_TUNING_CHAT_AUDIO_MAX_MB` |
| **How many notes midi_read lists from one file** | 2,000 | 10-100,000 | Past this many the answer stops listing them and says how many more there were; the tracks, tempo and time signature are still given whole. `ORKNUX_TUNING_MIDI_READ_NOTES` |
| **The longest piece midi_render turns into sound** | 300 seconds | 1-3,600 | A MIDI file that plays for longer is refused before anything is synthesised; the sound it would make is kept whole in the session, so this also bounds its size. `ORKNUX_TUNING_MIDI_RENDER_LONGEST_SECONDS` |
| **The sample rate midi_render synthesises at** | 44,100 Hz | 8,000-48,000 | Every format is rendered at this rate, in stereo: 44100 is a CD's, 48000 a video's, and lower makes smaller files that sound duller. `ORKNUX_TUNING_MIDI_RENDER_SAMPLE_RATE` |
| **The bitrate of an MP3 midi_render encodes** | 192 kbit/s | 32-320 | Higher is closer to the FLAC and larger; FLAC and WAV are lossless and take no bitrate. `ORKNUX_TUNING_MIDI_RENDER_MP3_KBITS` |
| **How many elements one wireframe may hold** | 2,000 | 10-100,000 | A save, from the editor or from a model drawing in it, that would leave more is refused and says how many there were. `ORKNUX_TUNING_WIREFRAME_ELEMENTS_MOST` |
| **How long a wireframe's HTML may be and still be handed to a model** | 100,000 characters | 1,000-5,000,000 | A longer page is answered with the link to download it instead of the page itself. `ORKNUX_TUNING_WIREFRAME_HTML_INLINE_CHARACTERS` |
| **How wide the picture of a wireframe an agent drew may be** | 1,600 pixels | 200-4,096 | The picture put in a chat beside the wireframe's link; a wider drawing is scaled down to this. `ORKNUX_TUNING_WIREFRAME_PICTURE_PIXELS` |
| **How long a diagram node's notes may be** | 5,000 characters | 100-100,000 | A save, from the editor or from an agent, with longer notes on a node is refused and names the node. `ORKNUX_TUNING_DIAGRAM_NOTE_CHARACTERS` |
| **How long a diagram's description may be** | 2,000 characters | 100-20,000 | A longer one is refused, from the editor and from an agent alike. `ORKNUX_TUNING_DIAGRAM_DESCRIPTION_CHARACTERS` |
| **How many nodes and connections one diagram may hold** | 2,000 | 10-100,000 | A save that would leave more is refused and says how many there were. `ORKNUX_TUNING_DIAGRAM_ITEMS_MOST` |
| **How many hits a diagram search answers with** | 20 | 1-500 | The best matches first; an agent searching for more narrows its words. `ORKNUX_TUNING_DIAGRAM_SEARCH_HITS` |
| **How much of each node's notes a whole diagram read shows** | 200 characters | 0-100,000 | Notes past this are cut and marked; reading one node gives its notes whole. `ORKNUX_TUNING_DIAGRAM_NOTES_SHOWN_CHARACTERS` |
| **How wide the picture of a diagram may be** | 1,600 pixels | 200-4,096 | The picture put in a chat beside the diagram's link, and the PNG and PDF an agent exports; a wider drawing is scaled down to this. `ORKNUX_TUNING_DIAGRAM_PICTURE_PIXELS` |
| **How long one document's stored content may be** | 2,000,000 characters | 10,000-50,000,000 | A save, from the editor or from a model writing in it, that would make it longer is refused and says how long it was. `ORKNUX_TUNING_DOCUMENT_CHARACTERS_MOST` |
| **How much of a document's Markdown is handed to a model** | 100,000 characters | 1,000-5,000,000 | A longer document is handed over cut at this length, with a note saying how long it is. `ORKNUX_TUNING_DOCUMENT_MARKDOWN_INLINE_CHARACTERS` |
| **How much rewritten text keeps its colours and highlights** | 20,000 characters | 0-1,000,000 | When a model rewrites more than this, colours and highlights it did not write back are not carried over, and the highlights lost are named in its answer. `ORKNUX_TUNING_DOCUMENT_MARKS_CARRY_CHARACTERS` |
| **How wide an SVG put in a document is drawn** | 1,600 pixels | 200-4,096 | A drawing an agent hands over as SVG is kept as a picture this many pixels wide. `ORKNUX_TUNING_DOCUMENT_SVG_PIXELS` |
| **How large a file a document imports** | 25 MB | 1-1,024 | A larger file is refused by the editor's Import, which says how large it was. `ORKNUX_TUNING_DOCUMENT_IMPORT_MB` |
| **How many pictures one import keeps** | 200 | 0-5,000 | Past it the file's other pictures are left out and counted; its words still come in. `ORKNUX_TUNING_DOCUMENT_IMPORT_PICTURES_MOST` |
| **How many rows a table read from a PDF has at least** | 2 | 2-50 | Fewer, and its words come in as paragraphs. `ORKNUX_TUNING_DOCUMENT_IMPORT_TABLE_ROWS_LEAST` |
| **How many columns a table read from a PDF has at least** | 2 | 2-20 | Fewer, and its words come in as paragraphs. `ORKNUX_TUNING_DOCUMENT_IMPORT_TABLE_COLUMNS_LEAST` |
| **How wide a gap between words in a PDF, against their type size, starts a column** | 150% | 50-1,000 | Only for a table with no ruling lines; a narrower gap is a space between words. `ORKNUX_TUNING_DOCUMENT_IMPORT_TABLE_COLUMN_GAP_PERCENT` |
| **How many rows of an unruled table in a PDF have a word in every column** | 75% | 1-100 | Fewer, and the lines come in as paragraphs. `ORKNUX_TUNING_DOCUMENT_IMPORT_TABLE_ROWS_FULL_PERCENT` |
| **How long the cells of an unruled table in a PDF are on average, at most** | 30 characters | 1-1,000 | Longer, and the lines are read as columns of prose, not as a table. `ORKNUX_TUNING_DOCUMENT_IMPORT_TABLE_CELL_CHARACTERS` |
| **How many items in a row a list read from a PDF has at least** | 2 | 1-20 | Fewer, and a line opening with a dash or a number stays in its paragraph. `ORKNUX_TUNING_DOCUMENT_IMPORT_LIST_ITEMS_LEAST` |
| **How long a LanguageTool server has to check a paragraph** | 15 seconds | 1-120 | Only where Admin Settings names a LanguageTool server; the checker built into the server has no wait. Past it the editor says the server did not answer. `ORKNUX_TUNING_GRAMMAR_SERVER_TIMEOUT_SECONDS` |
| **How much of a document the inline suggestion reads** | 2,000 characters | 100-50,000 | The text before the caret is cut to this many characters, and the text after it to a quarter as many. `ORKNUX_TUNING_DOCUMENT_COMPLETION_CONTEXT_CHARACTERS` |
| **How much of the files on one editor chat message a model reads** | 100,000 characters | 1,000-2,000,000 | Counted across every file sent with one message in the document, wireframe or diagram chat; the text past it is left out and the model is told so. `ORKNUX_TUNING_EDITOR_CHAT_FILE_CHARACTERS` |
| **How long the typing pauses before grammar is checked** | 800 ms | 100-10,000 | Only the paragraphs changed since the last check are sent. `ORKNUX_TUNING_GRAMMAR_PAUSE_MILLIS` |
| **How much text one grammar check takes** | 20,000 characters | 1,000-200,000 | A longer paragraph is not checked; the editor sends paragraphs one request each. `ORKNUX_TUNING_GRAMMAR_TEXT_MOST` |
| **How many documents a search answers** | 20 | 1-200 | Quick actions and orknux_search_documents list at most this many, names that match first. `ORKNUX_TUNING_DOCUMENT_SEARCH_RESULTS` |
| **How much selected text Translate sends a model** | 8,000 characters | 100-200,000 | A longer selection is refused and says how long it was. `ORKNUX_TUNING_DOCUMENT_SELECTION_CHARACTERS` |
| **How much text around a selection Translate sends** | 600 characters | 0-20,000 | The text before the selection and the text after it are each cut to this, so a word is translated as the document means it. `ORKNUX_TUNING_DOCUMENT_SELECTION_CONTEXT_CHARACTERS` |
| **How much of a document a search shows around a match** | 160 characters | 40-1,000 | Also how much of a document's start the Documents list shows under its name. `ORKNUX_TUNING_DOCUMENT_SNIPPET_CHARACTERS` |
| **How many versions of each document are kept** | 50 | 0-10,000 | The oldest go first as a save adds one; 0 keeps them all. The days component history is kept for do not apply to documents. `ORKNUX_TUNING_DOCUMENT_VERSIONS_KEPT` |
| **How many videos are made at once** | 1 | 1-16 | Videos asked for in Design wait their turn past this many. A local video server makes one at a time however many it is sent. `ORKNUX_TUNING_VIDEOS_AT_ONCE` |
| **How often a video being made is asked about** | 5 seconds | 1-300 | Each ask is one request to the video's server; the page's progress moves this often. `ORKNUX_TUNING_VIDEO_POLL_SECONDS` |
| **How long one video may take** | 120 minutes | 1-1,440 | A video still not made after this is given up on, and said to have failed. `ORKNUX_TUNING_VIDEO_LONGEST_MINUTES` |
| **The largest video kept** | 200 MB | 1-4,096 | A video larger than this is not collected from its server, and is said to have failed. `ORKNUX_TUNING_VIDEO_MAX_MB` |
| **Most frames sent in one upscale call** | 8 | 1-64 | A video's frames go to the upscale model's server this many at a time. More is fewer calls and a larger request each; the progress moves once a batch. `ORKNUX_TUNING_VIDEO_UPSCALE_BATCH_FRAMES` |
| **The longest side of an upscaled video** | 3,840 pixels | 64-16,384 | An upscale that would make a video longer than this on either side is refused before it starts. `ORKNUX_TUNING_VIDEO_UPSCALE_MAX_PIXELS` |
| **Most frames a second in a GIF export** | 15 | 1-50 | A video at a faster rate is exported as a GIF at this one; a slower one keeps its own. `ORKNUX_TUNING_VIDEO_EXPORT_GIF_FPS` |
| **The widest a GIF export is** | 480 pixels | 16-3,840 | A wider video is made this wide as a GIF, at the same shape; a narrower one keeps its own size. `ORKNUX_TUNING_VIDEO_EXPORT_GIF_WIDTH` |
| **The largest video export** | 200 MB | 1-4,096 | An export that comes to more than this is stopped and refused. `ORKNUX_TUNING_VIDEO_EXPORT_MAX_MB` |
| **How long one video export may take** | 300 seconds | 5-3,600 | An export still converting after this is stopped and refused. `ORKNUX_TUNING_VIDEO_EXPORT_SECONDS` |
| **How many video exports are kept to hand out again** | 8 | 0-100 | The newest exports are kept in the server's temporary directory, so the same video asked for again in the same format is not converted twice. Zero keeps none. `ORKNUX_TUNING_VIDEO_EXPORT_KEPT` |
| **How wide the image editor's brush starts** | 12 pixels | 1-500 | In the picture's own pixels, so zooming does not change it. Whoever paints can choose another width, up to the most this may be set to. `ORKNUX_TUNING_IMAGES_BRUSH_PIXELS` |
| **How opaque the image editor's brush starts** | 100% | 1-100 | Every tip but the marker starts here. Whoever paints can choose another. `ORKNUX_TUNING_IMAGES_BRUSH_OPACITY_PERCENT` |
| **How hard the soft brush's edge starts** | 50% | 0-100 | The soft tip and the eraser fade across what is left of their width; zero fades across half of it. Whoever paints can choose another. `ORKNUX_TUNING_IMAGES_BRUSH_HARDNESS_PERCENT` |
| **How opaque the image editor's marker starts** | 50% | 1-100 | A marker's strokes are see-through, and darken what they cross. Whoever paints can choose another. `ORKNUX_TUNING_IMAGES_MARKER_OPACITY_PERCENT` |
| **How strongly the image editor's blur starts** | 12 pixels | 1-254 | The blur's radius in the picture's own pixels. Whoever blurs can choose another, up to the most this may be set to. `ORKNUX_TUNING_IMAGES_BLUR_PIXELS` |
| **How far the image editor's blur fades at its edge** | 0 pixels | 0-500 | Inside a rectangle or lasso, the blur weakens towards the edge across this many of the picture's own pixels. Zero is a hard edge. Whoever blurs can choose another. `ORKNUX_TUNING_IMAGES_BLUR_FALLOFF_PIXELS` |
| **How far a Magic edit's edge is feathered** | 8 pixels | 0-256 | The redrawn part blends into the picture across about this many of its own pixels either side of the selection's edge. Zero is a hard edge. Whoever edits can choose another. `ORKNUX_TUNING_IMAGES_FEATHER_PIXELS` |
| **How many layers a picture may keep** | 32 | 1-256 | Over the picture itself, in the image editor. Each is a picture the same size, kept with every unsaved version, so more layers take more disk. `ORKNUX_TUNING_IMAGES_LAYERS_MOST` |
| **How often a picture being drawn is asked about** | 2 seconds | 1-60 | Only a Stable Diffusion WebUI says how far it is. Each ask is one request to it, and the image editor's time left moves this often. `ORKNUX_TUNING_IMAGES_PROGRESS_POLL_SECONDS` |
| **How many of a model's newest pictures a time left looks at** | 10 | 1-200 | Where a model's server says nothing of its progress, the time left is the middle of how long these took, less the time taken so far. `ORKNUX_TUNING_IMAGES_ESTIMATE_JOBS` |
| **How many timed pictures a time left needs** | 3 | 1-50 | Fewer drawn by the same model in the same way, and the image editor says only how long it has taken. `ORKNUX_TUNING_IMAGES_ESTIMATE_LEAST` |

#### Workflows and triggers

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How often a waiting action asks again** | 30 seconds | 1-86,400 | An action that waits for something - a reply, a condition - asks again this often when it does not say for itself. `ORKNUX_TUNING_ACTION_RETRY_SECONDS` |
| **How long a waiting action waits when it does not say** | 3,600 seconds | 1-2,592,000 | Written onto a condition action when it is saved without a timeout of its own; an action saved earlier keeps what it was given. `ORKNUX_TUNING_ACTION_WAIT_SECONDS` |
| **How long a trigger remembers an event it ran on** | 10 minutes | 1-1,440 | The same message arriving twice - a retry, a second listener - starts one run, not two, within this time. `ORKNUX_TUNING_TRIGGER_REMEMBER_MINUTES` |
| **How many events a trigger remembers** | 5,000 | 100-1,000,000 | The oldest is forgotten first once this many are held. `ORKNUX_TUNING_TRIGGER_REMEMBERED` |
| **The most times one node may repeat in a run** | 100 times | 2-10,000 | A node set to repeat more often is saved at this many, and a run already holding a higher number stops here. `ORKNUX_TUNING_NODE_REPEATS_MOST` |
| **The longest timeout a node may be given** | 86,400 seconds | 1-604,800 | A node given a longer one is saved at this, and a run already holding a longer one is held to it. `ORKNUX_TUNING_NODE_TIMEOUT_MOST_SECONDS` |
| **How many runs one schedule may start in one tick** | 60 | 1-10,000 | A schedule finer than the tick starts every occurrence that came due since the last one; past this many in one round the rest are dropped and a warning is logged. `ORKNUX_TUNING_SCHEDULES_PER_TICK` |
| **How much of the chosen documents a research is handed** | 200,000 characters | 1,000-5,000,000 | Counted across every document included in one research; the text past it is left out and the research is told so. `ORKNUX_TUNING_RESEARCH_DOCUMENT_CHARACTERS` |
| **The most sources one research may read** | 100 | 1-1,000 | Whatever a mode's workflow asks for; each source read is a model call, so this bounds what one research costs. `ORKNUX_TUNING_RESEARCH_SOURCES_MOST` |
| **How much of one page a research reads** | 20,000 characters | 1,000-500,000 | One web page, or one page of a document; the rest is not read. The research's own pages-per-source decides how many. `ORKNUX_TUNING_RESEARCH_PAGE_CHARACTERS` |
| **How many times a research mode's step is tried again** | 2 times | 0-9 | Written on every step of the research modes' workflows when they are made, as each node's retry policy; a step that failed in a way that could come out differently is tried again this many times. A workflow already made keeps what its nodes say. `ORKNUX_TUNING_RESEARCH_STEP_RETRIES` |
| **How long a research mode's step waits before trying again** | 10 seconds | 0-3,600 | Written on the research modes' steps with the number of tries, as the wait before each one. `ORKNUX_TUNING_RESEARCH_STEP_RETRY_SECONDS` |
| **The most images one research keeps** | 6 | 1-50 | Only for a research started with Include images; it stops looking once it has this many, and each one is kept on the Artifacts page. `ORKNUX_TUNING_RESEARCH_IMAGES_MOST` |
| **The largest image a research keeps** | 2 MB | 1-20 | An image larger than this is skipped rather than kept or laid out in the report; never more than the largest file a tool may download. `ORKNUX_TUNING_RESEARCH_IMAGE_MB` |
| **How many times a research step a restart cut short is run again** | 2 times | 0-9 | Plan, Gather, Deepen and Write change nothing outside the research, so one a server restart cut short is run again when the server is back; 0 fails it, to be restarted from its page. Save is never run again. `ORKNUX_TUNING_RESEARCH_RESUME_AFTER_RESTART` |
| **How many rounds of review a research gets** | 1 times | 1-10 | For a research started with Review: the reviewer reads the report and the writer revises it where asked, at most this many times, before it is saved. A workspace may set its own number. `ORKNUX_TUNING_RESEARCH_REVIEW_ROUNDS` |
| **How many follow-up questions a finished research suggests** | 5 | 0-10 | Each one starts a research of its own when clicked; 0 suggests none and asks the model nothing. A workspace, and the start form, may say otherwise. `ORKNUX_TUNING_RESEARCH_FOLLOWUPS` |
| **How long a research's follow-up questions may be in all** | 400 tokens | 50-4,000 | The most the model may write when it is asked for them, with its thinking off. `ORKNUX_TUNING_RESEARCH_FOLLOWUPS_TOKENS` |
| **How many finished research a time left is measured from** | 3 | 1-50 | A running research says about how long it has left once the workspace has finished this many in the same mode; fewer, and it says nothing. `ORKNUX_TUNING_RESEARCH_ESTIMATE_RUNS` |
| **How many of the newest finished research a time left looks at** | 20 | 1-500 | The newest in the same mode; older ones ran on whatever the models and the workflow were then. `ORKNUX_TUNING_RESEARCH_ESTIMATE_LOOKBACK` |
| **The shortest side an image a research keeps may have** | 120 pixels | 0-4,000 | Icons, logos and spacers are smaller than a picture worth placing in a report; 0 keeps images of any size. `ORKNUX_TUNING_RESEARCH_IMAGE_PIXELS` |

#### Plugins and libraries

| Setting | Default | Range | What it does |
|---|---|---|---|
| **The largest text answer a plugin's request may read** | 2 MB | 1-100 | What a plugin reads as text through orknux.http; a larger answer is refused. `ORKNUX_TUNING_PLUGIN_HTTP_BODY_MB` |
| **The largest binary answer a plugin's request may read** | 5 MB | 1-500 | Counted on the bytes rather than the base64 the sandbox is handed, which is a third again larger. `ORKNUX_TUNING_PLUGIN_DOWNLOAD_MB` |
| **The largest file a plugin may upload** | 10 MB | 1-500 | A file a plugin sends on from the session's store, as a picture to Slack. `ORKNUX_TUNING_PLUGIN_UPLOAD_MB` |
| **The largest script library a workspace may add** | 4 MB | 1-100 | A library is JavaScript every function in the workspace may import. `ORKNUX_TUNING_LIBRARY_MB` |
| **The largest npm package fetched for a library** | 32 MB | 1-500 | Counted for one package's archive, as the registry serves it. `ORKNUX_TUNING_NPM_ARCHIVE_MB` |
| **The most npm packages one library may pull in** | 60 | 1-1,000 | A package and everything it depends on, counted together. `ORKNUX_TUNING_NPM_PACKAGES_MOST` |
| **How long a marketplace icon is kept before it is fetched again** | 6 hours | 1-720 | Icons are fetched once and kept, so the plugin list does not reach the marketplace on every view. `ORKNUX_TUNING_MARKETPLACE_ICON_HOURS` |

### How large an upload may be

**Largest file**, under **Attachments**, holds **every upload** to one number: a
file in a chat, on an issue, on the Artifacts page, for a research, a picture or
a document imported. It starts at `ORKNUX_ATTACHMENTS_MAX_FILE_SIZE_MB` - 25 MB
unless that says otherwise - until an administrator sets it here, at 1 MB or
more with no ceiling, and the change is audited.

A file past it is refused **before it is sent**, in one line naming its size, the
limit and where to raise it - not after a long upload has finished - and the
server refuses it too if something sends it anyway.

### The installation's address

**Address**, at the top of the page, is where this installation is reached:
`https://orknux.example.com`. **Every link the server sends out is built on it** -
a password reset mail, the link an `orknux_*` tool answers an agent with, a
picture handed to a model by address - and every one of them is absolute,
because a path with no host in front of it means nothing once it has been pasted
into somebody's chat. An agent that wants to put one of the installation's pages
in front of a person - in Slack, in a mail - asks `app_link`, which turns a path
such as `/workspace/9/tasks/28` into the full address on the same host. Left
empty, the address falls back to `ORKNUX_BASE_URL`.

It is a setting rather than something read off each request, because a request's
`Host` header is written by whoever sent it, and an address in a reset link is
exactly the thing not to let a caller choose.

### What a transcript keeps

![Admin → Settings → Sessions: when a long session is summarised, and how much of
one value a transcript keeps](/screens/admin-settings-transcript.png)

A session's transcript records every tool call: what the agent sent and what came
back. Most are a few short fields. Some carry a payload - a picture in base64, a
rendered SVG, a file's bytes - that would make one line of the record kilobytes
long and bury the two arguments that say what happened.

So **each value over a length is shortened when it is stored**: **Longest value
kept in a transcript**, 1,000 characters unless changed, between 100 and 100,000.
It is cut **value by value**, not line by line: a call that sent a picture and a
channel keeps the channel exactly and loses only the picture, and the cut says
how long the value was - `… (trimmed from 5867 characters …)` - so nobody reading
the row mistakes it for a short one.

**An answer that is JSON written as text is read inside.** An MCP server answers
with its result as one long piece of text - ten log lines from Kibana arrive as a
single 3,600-character value - and cutting that whole would keep the first
thousand characters of the first few lines. Instead the text is read as the JSON
it is, and only the values in it that are themselves too long are cut; ten short
log lines are kept whole.

This is the **record**, not the conversation. Within the turn the agent is given
the tool's whole answer (up to its share of the model's window). What the record
decides is what a later turn sees when the conversation is carried on from what
was said - after it has been summarised, or when a Slack thread is answered
again - which is why a later turn can only ever see as much of an old answer as
was kept. Raise the number where agents keep needing more of what they read
earlier; a larger record costs database space and nothing else.

### Every other setting on the page

The page's own settings, section by section in the order the page draws them,
with the default a fresh installation starts at. Where a section has a chapter
of its own here - boxes, watchers, bulkheads, HTTP tools - that chapter says more.

#### Chat

| Setting | Default | Range | What it does |
|---|---|---|---|
| **Chat** | On |  | Whether this installation has a chat at all; see *Settings*, above. |
| **Tool Rounds** | 100 rounds | 2-10,000 | A round is one call to the model: it answers, or it asks for tools and what it asks for is run and handed back. An agent that has not answered by the last one is stopped, because a model talking to itself is billed for every round. This is the number every agent follows; one whose work is longer can be given its own on its page. |
| **Rename Chats Every** | 20 exchanges | 0-1,000 | A chat is named by a model after its first exchange, and named again from its latest messages after this many more. 0 names it once. A title somebody typed is never replaced. |
| **Chat Title Time Limit** | 30 seconds | 1-600 | How long the workspace's companion model has to name a chat. Past it, or when it fails, the chat's own model names it. |
| **Completion Context** | 6 messages | 0-50 | How many of the chat’s latest messages the completion model is shown, so a suggestion reads as a reply. |
| **Completion Length** | 64 tokens | 1-500 | The most tokens one suggestion may be. |
| **Completion Time Limit** | 4,000 ms | 200-60,000 | How long a suggestion may take before it is given up on and nothing is shown. |
| **Completion Pause** | 300 ms | 100-10,000 | How long the chat waits after the last keystroke before asking for a suggestion. |
| **Suggested Replies** | 3 replies | 0-6 | How many replies are suggested under the latest answer; 0 suggests none. |
| **Suggested Replies Length** | 150 tokens | 1-1,000 | The most tokens all of an answer’s suggested replies together may be. |
| **Suggested Replies Time Limit** | 8,000 ms | 200-60,000 | How long suggested replies may take before they are given up on and none are shown. |
| **Video Attachment Limit** | 20 MB | 1-1,024 | The largest video a chat message may send to a model that takes video. |
| **Note Length** | 2,000 characters | 100-10,000 | How long one note an agent writes to itself may be. Every note is read back on every later turn, so a longer limit is paid for on every turn. |
| **Notes Per Conversation** | 100 notes | 1-1,000 | How many notes an agent may write to itself in one conversation; past that it is told it is full. Every note is read back on every later turn. |
| **Empty Answer Retries** | 5 times | 0-20 | How many times a round is asked again when the model sends nothing back - a dropped stream, a busy server. |
| **Unusable Reply Retries** | 2 times | 0-10 | How many times a reply the server could not use - a broken tool call, arguments that are not JSON - is put back to the model to fix. |
| **Model Answer Time Limit** | 60 minutes | 1-1,440 | How long one call to a model may take before it is given up on - raise it for a slow local model that thinks for a long time. |
| **Writing Progress Interval** | 1,000 ms | 200-10,000 | How often the chat and the session page are told how much a model has written of a long answer or tool call. |
| **Writing Progress Forgotten After** | 30 seconds | 5-600 | How long a session page keeps saying a model is writing when no new report arrives - so a turn that died does not say it for ever. |
| **Reading Progress Shown After** | 5 seconds | 0-120 | How long a llama.cpp server has to have been reading a prompt before the chat and the session page say so - a read shorter than this is never shown. 0 shows it at once. |
| **Widgets Per Chat** | 8 widgets | 1-50 | How many widgets - timers and stopwatches an agent puts above the message box - one chat may hold at once. |
| **Longest Chat Timer** | 86,400 seconds | 60-604,800 | The longest a timer an agent puts in a chat may run. |
| **Session Value Size** | 8 MB | 1-256 | The most one value an agent keeps in its session may be - an exported archive, a drawn picture, a file a plugin wrote. |
| **Session Store Keys** | 200 keys | 10-10,000 | How many values one session may keep at once. |
| **Local box** | On |  | A box inside this server, so agents can run commands without a remote Orkbox. Off, it is not listed under Admin → Boxes and no new session opens in it. |
| **Local box location** | orknux-box in the system temporary directory |  | The directory local sessions keep their workspaces under. Leave it empty for the default shown in the box. |
| **Local box runtime** | local |  | What a local session runs in. Local runs commands as processes of this server, under its account; Docker runs each session in a container of its own. |
| **Local box sessions at most** | 50 sessions | 1-1,000 | How many sessions may work on the local box at once - being made or running a command. Idle ones do not count. |
| **Local session lifetime** | 7,200 seconds | 60-604,800 | How long a local session lasts when the agent asks for no particular time, counted from when it opened. |
| **Longest local session lifetime** | 86,400 seconds | 60-604,800 | The longest a local session may be asked to last. |
| **Local session idle timeout** | 900 seconds | 60-86,400 | A local session nothing has run in for this long is closed. |
| **Local box output kept** | 1,024 KB | 0-16,384 | How much of each local command's output is kept for reading in a session's Box tab. |
| **Command wait** | 300 seconds | 1-3,600 | How long a box tool waits for a command to finish before handing the agent its output so far, with the command still running. |
| **Command timeout** | 1,800 seconds | 1-86,400 | How long one command may run at all before it is stopped. |
| **Command output kept** | 64 KB | 1-4,096 | How much of what a command prints is handed back to the agent; the rest is cut and the agent is told so. |
| **Box output shown** | 4,096 KB | 64-65,536 | How much of one command's output a session's Box tab reads and holds before it stops and says so. |
| **Box request timeout** | 30 seconds | 1-600 | How long this server waits for a box to answer one request before giving up on it. |
| **Box edit undo steps** | 10 | 0-100 | How many of an agent's file edits and writes it can undo in one box session. Kept in memory, so a restart forgets them; 0 keeps none. |
| **Box session idle timeout** | 7,200 seconds | 60-86,400 | How long a box session an agent opens may go with no command before its box stops it, unless the agent asks for another. Waiting for a person counts as idle. |
| **Box ports per session** | 5 | 0-20 | How many ports one box session may have asked for or open at once. An agent asks, and a person allows each one; 0 lets an agent ask for none. |
| **Box port check interval** | 15 seconds | 2-600 | How long a look at whether an exposed port answers is believed before the session page looks again. Each look starts a connection through the box. |
| **Box port check wait** | 1,500 ms | 100-10,000 | How long a look at an exposed port waits for the box to close a connection nothing inside took. Longer for a slow box. |
| **Files in chats** | On |  | Whether messages and issues may carry attachments; see *Settings*, above. |
| **Largest file** | 25 MB | 1 or more | The largest file any upload may be: in a chat, on an issue, on Artifacts, for a research, or a picture or document imported. 1 MB or more. |

#### Agents

| Setting | Default | Range | What it does |
|---|---|---|---|
| **The longest an agent may wait before it is asked again** | 3,600 seconds | 1-86,400 | An agent can end its turn by asking to be woken instead of answering, when what it needs has not happened yet - a build still running, a colleague who has been asked. The step stops there and the run comes back to it when the time is up, so nothing is held and no model is billed while it passes. An agent asking for longer than this is given this instead. |
| **How many times in a row an agent may wait** | 10 times | 0-100 | Waiting is a decision the agent takes again every time it wakes, so the one that matters is not the first but the twentieth: without a bound, an agent that keeps deciding to wait a little longer never finishes. Counted per step, and an agent that has spent them all is told to finish. Zero means no agent may wait at all. |
| **How many other agents an agent may ask** | 25 agents | 0-100 | Each ask starts a conversation of its own, with its own model calls and tools, on the asking agent’s say-so - so this is the number that bounds what one question can fan out into. Counted per conversation, and an agent that has spent them is told so and answers with what it has. Zero takes the tool off the table. A workspace may carry its own number in its settings, which wins over this one. |
| **How many of those may work at once** | 3 at once | 1-20 | A different number from the one above: that bounds how many an agent may ask in a conversation, this bounds how many are working at the same time. It began to matter when asking stopped blocking - before that they ran one after another whatever this said. An ask past the ceiling waits its turn rather than being refused, because a refusal would send the model round again with the same ask in other words. Counted per conversation, so one busy conversation cannot starve the rest. |
| **How long to wait out a rate limit that names no time** | 5 seconds | 1-60 | A provider can refuse a streaming answer for a rate limit part way through without saying when to come back. The call waits this long and asks again, twice as long the next time, before it hands the refusal to the step retry policy. 5 seconds unless somebody says otherwise; every call reads it fresh, so no restart is needed. |

#### Tool calls

| Setting | Default | Range | What it does |
|---|---|---|---|
| **Tool calls allowed in one message** | 50 calls | 1-500 | How many tools one message may ask for at once. The guard above counts across rounds and cannot see a single message that asks for the same thing a hundred times, which is what a decode looks like when it comes apart. Calls over this are refused with the rule quoted back, not dropped, so the model is told why. |
| **Identical tool calls before a turn is stopped** | 10 calls | 2-50 | The same tool, the same arguments and the same answer, that many times inside the window below, and the turn is told it is going round in circles. Repetition on its own is fine - an agent watching something calls the same tool and is working - so what makes it a loop is how close together the calls are. Two sessions once spent their whole budget this way, one of them calling the same pair a hundred and fifty times. |
| **Counted within** | 10 seconds | 1-86,400 | How close together those calls have to be. Calls further apart than this do not count, which is what lets an agent poll something deliberately: it checks, waits, and checks again, and the older calls fall outside the window. Set it below the interval anything here is meant to poll at. |
| **Warnings before the turn ends** | 2 warnings | 1-10 | A turn that is going round in circles is first told so, and asked to finish with what it has - which is usually something, since the work often happened before the loop started. This is how many times it is told before the turn is ended instead. |

#### Tool list

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How many findable tools are named outright** | 40 tools | 0-500 | An agent granted more tools than it carries is given tool_find to find the rest. Up to this many of them, tool_find names every one in its own description and when a search finds nothing, so the model asks for a tool by name instead of guessing words for a search; above it, the tool says only how many there are. Names are short, so a few dozen cost less than one tool’s full declaration; a small model may read a long list less well than a large one. Zero never names them. |
| **Tools whose summary is kept in full** | 100 tools | 10-1,000 | An agent’s system prompt names every tool it holds with a short phrase, so it knows what it has instead of guessing words for a search. Up to this many tools each phrase is kept whole; for every further block of this many, the percentage below comes off what is kept, cut from the end so the first words survive. |
| **Trimmed off each further block** | 25 percent | 0-50 | How much comes off a tool’s phrase for each further block of tools past the number above: at 25%, an agent holding twice that many keeps three quarters of each phrase and one holding three times keeps half. Cut from the end, so what is written first survives. Zero switches the trimming off. |

#### Sessions

| Setting | Default | Range | What it does |
|---|---|---|---|
| **Compact a session past** | 40,000 tokens | 0-1,000,000 | How long a session’s log may grow before its older turns are read once, replaced by a summary of them, and the conversation carries on. Without this the oldest turns simply fall past what a turn can carry and the agent forgets the beginning with nobody told. The turns are marked rather than deleted, so the transcript still shows every step. |
| **Steps a compacted turn keeps** | 6 steps | 2-100 | When a turn outgrows its model it is summarised and carried on rather than thrown away. This is how many of its most recent steps are kept word for word - the recent end is what the next round is about, and summarising the question being asked is how an agent starts answering something adjacent to it. |
| **Length of that summary** | 5,000 tokens | 100-8,000 | How long the summary standing in for everything else may be. Long enough to carry what the turn had found out, short enough that compacting is worth doing. |
| **Compactions before a turn gives up** | 2 times | 1-10 | How many times one turn may be summarised before it fails instead. A turn still too large after two summaries is not long, it is looping - and compacting a loop for ever is a way of never telling anybody something is wrong. |
| **Longest value kept in a transcript** | 1,000 characters | 100-100,000 | How much of any one value is stored. This bounds the record and not the answer: a tool hands the agent whatever it hands it, and this decides how much survives into a later turn. It was set for payloads - a base64 image on its way somewhere - and a skill is the opposite case, instructions the agent is meant to still be holding. Raise it where transcripts matter more than table size. |
| **Conversations can be removed** | On |  | A conversation is the record of what an agent was asked and what it answered, and on some installations it is the only account of a decision anybody has. Removing one takes the whole transcript with it and there is no way back, so an installation that has to be able to say what happened should turn this off. On until somebody does, which is how it has always worked. |

#### Scratchpads

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How much a session’s scratchpads may hold** | 10,240 KB | 1-65,536 | A scratchpad is a working file an agent keeps within a session - a document it drafts, code it writes, notes it organises - and this bounds how much one conversation’s scratchpads may occupy in all, so an agent told to write something long cannot grow them without limit. Counted across every scratchpad the session holds. |
| **Files kept per session** | 10 MB | 1-512 | A scratchpad can hold a picture or a document as well as text, and those are megabytes each that live as long as the session does. Past this, the oldest files in that session are removed until it is under again — the newest being the one in use — and the agent is told which went. Text scratchpads are never touched. |
| **Scratchpads are kept for** | 30 days | 0-1,825 | How long a scratchpad nobody has touched is kept before a sweeper removes it. Counted from the last change, so a document still being worked on survives. The session and its transcript are left alone: these are the workings beside it. Zero keeps them for ever, which suits an installation that treats them as part of the record. |

#### Drawing

| Setting | Default | Range | What it does |
|---|---|---|---|
| **Drawn picture size** | 2 times | 1-4 | How many times its own size a diagram or chart is drawn as a picture. At its natural size a flowchart is a few hundred pixels wide with one-pixel lines, which barely show on a phone. Twice is twice as thick a line for four times the bytes. |
| **Longest image prompt** | 2,000 characters | 100-32,000 | The longest description a picture is drawn from - in Design, a chat, a task and a workflow. Image models cap the prompt themselves; past this it is refused in words rather than by the provider. |
| **Images drawn at once** | 1 pictures | 1-16 | How many of Design's queued pictures are drawn at the same time. One suits a local image server, which draws one at a time anyway. |
| **Harmonize strength** | 0.3 |  | Where Harmonize's strength starts in the image editor - how much a Stable Diffusion WebUI redraws the whole picture to blend the seams a Magic edit left. Low keeps the picture; high draws another. Between 0.05 and 0.9. |
| **Harmonize working size** | 1,024 pixels | 256-4,096 | The longest side a picture is redrawn at by Harmonize. A larger picture is scaled down for the Stable Diffusion WebUI and its answer scaled back up to its own size, because a checkpoint draws slowly far past the size it was trained at. |

#### Commands

| Setting | Default | Range | What it does |
|---|---|---|---|
| **Command marker** | ! |  | What marks a command in a message that starts a run - with ! as the marker, "@orknux !review" carries the command review, which an agent node’s Skill IDs can load a skill from. Orknux’s own syntax, because Slack intercepts a message starting with / and refuses one it does not know. One to three characters, none a letter or a digit, so ordinary words are never commands. A workspace may set its own in its settings. |

#### Metrics

| Setting | Default | Range | What it does |
|---|---|---|---|
| **Scraping without signing in** | Off |  | On publishes /actuator/prometheus to anybody who can reach this server’s port: how many workspaces exist, how often workflows run and how often they fail. Turn it on only where the scrape crosses a network the scraper alone is on. A Prometheus that can send an Authorization header should carry an API token instead and leave this off. |

#### Reports

| Setting | Default | Range | What it does |
|---|---|---|---|
| **Reviews Per Conversation** | 2 reviews | 1-100 | How many reviews an agent may send from one conversation; past that it is told the review was not sent. |

#### Component history

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How long versions are kept** | 14 days | 1-3,650 | Every save of a function, tool, skill or agent keeps what it was before, and every publication of a workflow is kept as a version of it. A version is a whole copy — the code, the parameters, the prompt — so this is what decides how much disk the history takes. Counted from when a version stopped being current, not from when it was written. A workflow’s live publication is never swept, however old it is. |

#### Workflow runs

| Setting | Default | Range | What it does |
|---|---|---|---|
| **Steps running at once** | 4 at once | 1-32 | A node with lines to several others sends the run down all of them at the same time, and where the lines meet again the node waits for every one of them. This bounds how many steps of one run are working at once; a step past it waits for another to finish. One walks the lines one after the other. |
| **Workflow Autosave** | 300 ms | 200-10,000 | How long the workflow editor waits after the last change before it saves, so the others looking at the workflow see it. |
| **Called workflow check** | 60 seconds | 5-3,600 | A Workflow node waits for the run it called. That run ending wakes it at once; this is how long it waits before looking again when no wake arrives. |
| **Step heartbeat** | 30 seconds | 0-600 | Temporal only. A step says it is still being worked on while it works, and one that falls silent for this long is handed to a server that is alive - which is how a step whose server was killed carries on. A run already going takes a change up from its next step. 0 turns the heartbeat off, and a dead server is then noticed only when the whole step timeout runs out. |
| **Agent step goes after a restart** | 3 goes | 1-10 | Inline engine only. A step a restart cut short is failed, because nothing can say how far it got - except an agent answering a message, which is asked again so the message is answered. This is how many goes it gets in all, the ones that died included, since the step itself may be what kills the server. |
| **Cluster lease** | 30 seconds | 5-600 | Where several servers share this database, one of them holds a lease and runs the sweeps, the checks and the Slack sockets. When it dies another takes over within this long. Keep it well above the longest pause a server takes. |

#### Run history

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How long finished runs are kept** | 90 days | 1-3,650 | Every run a workflow makes is kept with its steps and its log lines, and nothing deleted one until this existed — so a busy installation grew this table without bound. Counted from when a run finished. A run still going is never swept, however long it has been going, and deleting a workspace takes its runs with it. |

#### Queued tasks

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How long before a stuck task is picked up** | 5 minutes | 1-1,440 | A task is written down and then handed to a worker, and that hand-over can be lost — a restart at the wrong moment, or a pool with nothing free to take it. Something looks on this interval and hands over anything that has been waiting longer, so a task cannot sit unstarted for ever. A task a worker already has is never handed over twice, whatever this says. Five minutes unless ORKNUX_TASK_SWEEP_MINUTES says otherwise; the next pass reads it, so no restart is needed. |

#### Objects

| Setting | Default | Range | What it does |
|---|---|---|---|
| **Object Depth** | 30 levels | 1-100 | How deep an object may nest - an object defined inside an object inside an object - and how deep a value is checked against one. The same number bounds what a pasted JSON Schema is read to. |

#### Plugins

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How long a plugin may take to load** | 30 seconds | 1-300 | The bundle is evaluated once when it is loaded, and this is how long that may take before the load is stopped. What one of its functions or tools may then take is set per workspace, under Timeouts. 30 seconds unless somebody says otherwise; every load reads it fresh, so no restart is needed. |
| **How large a plugin source file may be** | 5,120 KB | 64-20,480 | One cap for the plugin's own file, each library it ships, and each file a load-from-URL fetches. A source is stored whole and read whole on every call, so this number is about the heap as much as the disk. 5120 KB unless somebody says otherwise; every load reads it fresh, so no restart is needed. |

#### Workspace copies

| Setting | Default | Range | What it does |
|---|---|---|---|
| **How long a copy may wait for a lock** | 60 seconds | 1-3,600 | Each step of a workspace copy runs in a transaction of its own, and a step that needs a row another transaction is holding waits for it. Past this many seconds the copy stops, logs the step it stopped at, and says so on the page; the workspace it was making keeps what was copied before. 60 seconds unless somebody says otherwise; every copy reads it fresh, so no restart is needed. |

## Security defaults

What the server refuses, and how it keeps a session, without anybody having to
set anything. Each is a default an installation is safer for; where one can be
moved, the variable is named.

### The session cookie

The cookie a signed-in browser carries is kept out of reach of a page's scripts
and sent only where it should be:

| Variable | Default | What it decides |
|---|---|---|
| `ORKNUX_SESSION_COOKIE_SECURE` | `auto` | Whether the cookie is marked **Secure** - sent only over https. `auto` follows the request; set `true` behind a proxy that ends TLS and passes plain http on, where the request alone would say "not https". |
| `ORKNUX_SESSION_COOKIE_SAME_SITE` | `lax` | `lax` lets a link from elsewhere - a Slack message, a mail - arrive signed in; `strict` where nothing links in. |
| `ORKNUX_SESSION_COOKIE_HTTP_ONLY` | `true` | Keeps the cookie out of reach of any script on the page. |

The last two used to be read and ignored; **they now take effect**, so an
installation that set one gets what it set.

### The interface's Content-Security-Policy

The interface is served with a policy that lets a page load only what the
product itself needs. `ORKNUX_CONTENT_SECURITY_POLICY` **replaces** it where it
is too strict for an installation - an icon font from a company CDN, say. It
replaces rather than adds to, so start from the policy the server sends and widen
only what is needed.

### Writes from another site are refused

A write a browser says came from **another site** is refused with **403** - read
off its `Origin`, its `Sec-Fetch-Site` or its `Referer`. A page somewhere else
cannot make a signed-in person's browser change something here by submitting a
form at it. The command line, the MCP endpoint and anything sending a bearer
token are unaffected: they carry no browser's cookie to be tricked into using.

If the interface is served from another origin than the server - a separate
domain, a development server - list it in `ORKNUX_ALLOWED_ORIGINS`, comma
separated, or its own writes are refused as well.

### Requests never reach a cloud's metadata address

A workspace function's `orknux.http`, an agent's HTTP tools and a plugin's
requests **refuse cloud metadata addresses** - `169.254.169.254` and its
relatives, where a cloud machine hands out its own credentials to whoever asks
from inside - **including after a redirect**, so an address that bounces there
is refused at the bounce. They also **read an answer only up to their limit**
rather than whole, so an endpoint that answers a gigabyte cannot fill the
server's memory before the limit is checked. This is on top of the proxy rules
under Networking, which decide where this server may go at all.

### A workflow keeps to its own workspace

A workflow's own actions can no longer name **another workspace's** connection,
function, condition, speech model or workflow, and a run will not send through
another workspace's connection whatever was saved: a part named by another
workspace's id is refused rather than used, so a run cannot send through
somebody else's Slack.

### Libraries are checked before they are installed

A JavaScript package is installed from a registry only when the registry gives
its **SHA-256, -384 or -512 integrity**, and its file is fetched **only over
https**. A registry that leaves `dist.integrity` out and offers only the old
SHA-1 `dist.shasum` is refused, saying so, where it used to be trusted; and a
registry reached over https that names an `http://` file for a package is
refused. An installation whose `ORKNUX_LIBRARY_REGISTRY_URL` is itself `http://`
still fetches over http, because that was its administrator's choice.

**On upgrade:** a private mirror that serves only shasums has to be configured to
publish `integrity`, or its packages uploaded as files instead. Libraries already
installed are not affected.

## Monitoring

![Monitoring: the health of the service and everything it needs to be up](/screens/monitoring.png)

What is answering and what is not: the server, the database, Temporal, and the
connections workspaces depend on. A run's underlying Temporal workflow can be
opened from here and from the run page.

## Doctor

![Doctor: whether this installation is configured correctly](/screens/doctor.png)

Monitoring asks whether the server can reach the things it needs. Doctor asks
the other question: **is this installation configured correctly?**

They are not the same, and the gap between them is where the worst faults live.
A secret key that was never set is only validated on first use, so the server
starts, every dependency answers and monitoring is entirely green — while every
credential written hours later fails. Doctor checks the key, the credentials
already stored under it, how sign-in is configured, and the schema version, and
says which of them is wrong rather than that something is.

## Plugins

![The plugins loaded into this installation](/screens/plugins.png)

JavaScript loaded into the sandbox to give workflows functions the platform does
not ship. A plugin can be installed from the marketplace, uploaded, fetched from
a URL, or written from the starter this server generates — in JavaScript or
TypeScript — and downloaded again later as whichever of the two it was written
in.

A plugin brings more than functions. It may also bring **tools** an agent can be
granted, which appear in the workspace's Tools list with the plugin's name
beside them; **skills**, granted as a catalog of their own; **object shapes** its
functions return, which a workflow node can hold an answer to; and the
**libraries** it embeds, which are allowed when it is loaded.

### The marketplace

The **Catalog** tab beside Installed is a shelf of plugins somebody has
published: an icon, a description, tags, and the versions available, searchable,
installed with one press. Three things about it are worth knowing.

**The server fetches it, not your browser.** Both the catalog and the download go
out through this installation's proxy rules, like every other outbound call, so
an installation behind a proxy reaches the marketplace under the rules it already
has and one with no way out sees an empty shelf rather than a browser error.

**The bytes are checked before anything runs.** What arrives is hashed against
the digest the catalog published, and refused if the two disagree.

**An update is offered only when it is newer** than the version held. Each
listing's **Changelog** tab carries the notes its author wrote for each release,
so what an update contains is readable before it is taken.

`ORKNUX_MARKETPLACE_URL` decides where the catalog is asked — point it at your
own mirror, or leave it empty and load plugins by hand.

Plugins are not part of this server's release. They live in their own repository
and are written against the `@orknux/plugin` package, so a new plugin arrives
without a new server.

A plugin's key is its identity, not its filename: loading the same key again
replaces what is there.

A plugin says what it has to be told before it can work, and each workspace
answers separately: the same plugin points at two different projects for two
different teams. The declaration is read off the plugin when it is loaded and
shown here; the answers are set on each workspace's own Plugins page, either by
typing a value or by pointing at one of that workspace's variables.

A workspace that has not answered something a plugin needs is marked on that
page, in the list and against the parameter itself, and a run that reaches one
of the plugin's functions stops saying which parameter is missing. A parameter
the plugin declared as a secret is encrypted at rest. It can be typed in, with
an eye on the box that shows what is being typed, or answered by a variable;
once stored, the eye beside it shows it again, and **every time somebody does,
the workspace's audit log says so** - a secret that can be read back is one
whose readers should be on the record. Saving the box empty clears it.

What a plugin can reach is exactly that list and nothing else. There is no way
for one to ask the server for anything it was not given, which is why declaring
parameters is also the answer to "what data does this plugin see?".

### What a plugin may use

That answers what data a plugin sees. The other question is what *language* it
gets, and a plugin says so itself. A bundle written for a browser or for Node
expects builtins this sandbox does not switch on, so a plugin declares which of
them it needs — and the list it may choose from is five names long:

- `CONSOLE` — write to the server's log
- `INTL` — format dates and numbers for a locale
- `TEXT_ENCODING` — convert between text and bytes
- `PERFORMANCE` — measure elapsed time
- `TEMPORAL` — use the Temporal date and time API

That the list is closed is the point of it. **There is no name for reading a
file, opening a socket or reaching a Java class**, so a plugin cannot ask for
one and nobody can grant one by clicking through a dialog. A plugin naming
something that is not on the list is refused with the list, rather than loaded
having quietly been given less than it asked for.

Loading a plugin that asks for anything stops and shows what it asks for, a row
per name saying what that name allows, over **Allow and Load** and **Cancel**.
Agreement is by name rather than by yes: the load carries those names back, and
one carrying anything other than exactly what the plugin declares is refused the
same way. "Yes" would be an agreement to whatever the file happened to ask for,
including whatever it has started asking for since anybody last looked.

Only what was accepted is turned on, and only for the one plugin. The sandbox is
built for each call from that plugin's own row, so a plugin that asked for
nothing gets nothing, sitting beside one that asked for everything.

**A plugin edited to need one more is refused with the new list, and the one
already loaded goes on with exactly what it had.** An acceptance names the
permissions it was given for rather than being a yes to the plugin, so an
escalation cannot arrive under an answer somebody gave last month. A plugin that
stops asking for something stops being granted it, without anybody having to
remember to take it away.

What was accepted, who accepted it and when are on the row here — *allows INTL ·
TEXT_ENCODING · accepted 3 days ago by alice*. A decision about what somebody
else's code may do that lives only in a dialog is one nobody can audit.

**A bundle whose module body needs a permission cannot be loaded at all**, and
only what its `run` does may need them. Reading the file is the run that finds
out what the plugin is asking for, so it is made with nothing relaxed, always,
and there is no way to say otherwise: running it under permissions would mean
granting something in order to discover whether to grant it. A bundle that
touches `Intl` at its top level is refused as unreadable — *That file is not a
usable plugin: ReferenceError: Intl is not defined* — rather than as something
to be granted. Ask for what `run` needs, not for what loading needs; the starter
this server generates says as much beside the declaration.

### console and Intl are no longer free

**This is the one thing an installation upgrading to this version has to look
at.** GraalJS switches `console` and `Intl` on by default, and the plugin
sandbox now switches both off explicitly, because a default that happened to be
on is not something anybody accepted.

Every plugin loaded before this asks for nothing, so it is granted nothing. One
that called `console.log` or reached for `Intl` goes on being listed here and
then fails when a run reaches it. The way through is to load it again declaring
`CONSOLE` or `INTL` and accept that — no plugin is migrated into a grant nobody
gave.

Workspace functions and tools are not affected. They run in a different sandbox,
which has never taken a permission and has not changed.

## Libraries

JavaScript loaded once for the whole installation, which any workspace's
function or tool may import. A plugin brings functions of its own for a workflow
to call; a library brings code for a function to be written with — a date
handler, a parser, something too large to paste into every script that needs it.

An administrator loads one here, and it must be **a single self-contained file**
— a `.js` or `.mjs` file, up to 4 MB. A TypeScript file is compiled in the
browser before it is sent. The file is evaluated once as it arrives, in the same
sandbox it will run in, and what its default export turned out to hold is what
is stored: which names it offers and which of those can be called. That is all
that is claimed about it, because nothing in a bundle says what its arguments
are. A file that exports nothing to import is refused there and then — *That
file could not be loaded as a library: it has no default export to import* —
rather than at the moment a workflow needed it.

**Either spelling.** An ES module is run as it stands. A CommonJS file — one
that writes to `module.exports` or `exports.something`, which is what most of
npm still publishes — is given those two names as it runs, and what it leaves on
them is what a script imports; a UMD bundle works for the same reason, taking
its CommonJS branch. What is refused is a file that reaches for a *second* one:
an `import` of anything at all, and a `require("…")` in a file being run as
CommonJS. The message says which — *its index.js requires "buffer", and a
library has to be one self-contained file. This installation does not bundle.*
One caveat is worth knowing, because it is the only thing that cannot be
reproduced: everything here runs in strict mode, so a CommonJS file relying on
sloppy mode fails when it is evaluated — while somebody is looking at it, rather
than in the middle of a run.

**A package can be the way the file arrives.** Where the installation has a
registry configured, the field beside the upload takes a package and an exact
version — `base64-js@1.5.1`, never `latest`, because a version that resolves
differently tomorrow is not an answer to what code is running here. It is
fetched once, on the server, into this database; the file is what is stored and
what runs, and nothing reaches a registry afterwards. Of a package's several
builds an ES module is preferred and a CommonJS one taken where that is all
there is, and the row records which package, which version, from where, which
file inside it, and what the registry said that file hashed to — verified
against what arrived. **The file is stored exactly as it was published**, so
that hash stays a claim anybody holding the same package can check; a CommonJS
one is marked as such on the row and wrapped when it runs, never on the way in.
An installation with no registry configured draws no field at all and has the
upload alone.

A library's **key is its filename without the extension**, and it is its
identity: loading a file with a key already in the list replaces it in place, so
nothing importing it is repointed. Each row says what it exports, how large it
is, when it was loaded and by whom.

Under the key is the line the plugins page has no need of: **what imports this**
— every function and every tool that does, named with the workspace it lives in.
That line is the reason a library belongs to the installation rather than to a
workspace. What code is running inside this installation is a question with one
answer, and a library each workspace loaded for itself would give it as many
answers as there are workspaces, with the useful half of it scattered across
screens no administrator can see. It is also what refuses the removal, so
nothing goes out from under a script that was using it: pressing Remove on a
library something imports answers *Still imported — open one of those and take
the import off first*, on the row itself, and each name on the line above it
opens that function or tool. The names are the answer, so they are what you
press.

A library is the one thing in the product whose dependants can be in a workspace
the reader cannot open, and the rule for that is worth knowing even though this
screen never meets it: what may not be named is **counted rather than dropped**
— *and 2 more in workspaces you cannot open*. Naming a function in a workspace
somebody cannot see would tell them that workspace exists and what is in it, and
leaving it out silently would answer the question with rows missing. An
administrator sees every workspace, so here the count is always zero.

A function or a tool imports one by id, under a local name of its own, in the
**Libraries** section of its editor. The name is seeded from the key the first
time a row points at one and is never rewritten afterwards, because by then the
code already says `imports.dateFns`. It arrives in the same frozen `imports`
object an imported function does; from inside a script there is no difference
worth spelling out. See *One function calling another*, under Workflows.

**A plugin imports none of this.** It embeds what it needs, because a plugin is
meant to be portable between installations and one assuming a library had been
loaded here would not be. For the same reason a library does not travel inside a
component file: the file names the library by key, and an import that needs one
this installation has not loaded is refused on the way in — *No library called
date-fns is loaded in this installation. Load it first, then import again.*
Importing a function should not be a thing that installs software.

## Networking

**An address typed without a scheme is taken as http.** `192.168.0.10:8081` in a
box's, an MCP server's, a model provider's, a connection's, an HTTP action's or
the installation's address, or a release's URL, is stored as
`http://192.168.0.10:8081`, and the field shows the `http://` once you leave it,
so what is kept is what you see. An address typed with `https://` is kept as
typed, and a mail server's host stays a bare host.

![Proxy rules, in the order they are read, and the box that asks which one answers a given address](/screens/networking.png)

Sometimes one address will not go direct. The case this was built for is the
narrow one: everything works, except a token endpoint the network insists is
reached through a proxy. Setting a proxy for the whole server would be a far
larger decision than that one address asks for.

**Networking** holds proxy rules. A rule is a name, a **regular expression
matched against the address being called**, the proxy a matching address goes
through, an optional username and password for the proxy itself, and a switch.
The password is encrypted like every other credential here, and no query reads
it back.

The proxy is a **host and a port, not a URL**. A `://` in front of it is
refused rather than quietly accepted: the connection to a proxy is made in a way
that does not use the scheme you typed, so a field that took one would be
showing you a decision it was not making.

The expression is matched **anywhere in the address** and without regard to
case, so `login\.example\.com` is enough on its own. Use `^` and `$` where you
mean the whole of it.

Rules are **ordered, and the first one that matches wins**. There is no "most
specific wins", because there is no sound way to say which of two regular
expressions is the narrower; and overlapping rules are not refused, because one
narrow rule with a broad fallback behind it is the arrangement people actually
want. The order is yours to set.

That makes it easy to write a rule that looks configured and does nothing, which
is what the **tester** on the page is for. Paste an address and it says which
rule answers it, and which rules matched but will never fire because something
above them got there first. It also says if the address itself, or the matched
rule's own proxy, is one this server would refuse to call.

The rules cover **every outbound HTTP request this server makes**: connection
checks, a workflow's HTTP calls, MCP servers, model providers and the token
grants they need, transcription and speech. They all build their client the same
way, so there is no outbound call the rules do not reach.

**Mail is deliberately not covered.** SMTP is not an HTTP request, and a mail
server is named by host on the connection that sends through it, so there is no
address for a rule to match.

A proxy rule relaxes nothing. The address being called is checked exactly as it
was before, and the proxy's own address is checked the same way when the rule is
saved - a proxy is where the connection actually lands, so a rule pointing at a
link-local address would turn every address it matched into a request to this
machine's own metadata service.

An agent's HTTP tools meet one more check before any of this: the policy under
Settings, *HTTP tools*, decides whether the request is made at all, and only a
request it allows reaches these rules.

Administrators only, and every change is written to the organisation audit log.

## Boxes

![The boxes agents may open sessions on: the local box built into the server,
its health, and how many sessions it holds](/screens/boxes.png)

A **box** is a sandbox an agent can open a session in - a working directory of
its own and a way to run commands in it - and **Boxes** is where an
administrator says which there are. They replace shells, which are gone: agents
can no longer open a shell on a machine over SSH, and the shell definitions an
upgraded installation had stay in the database, untouched and unused. What an
agent does in one is set out under AI, in *Letting an agent work in a box*.

The list shows each box's **Type**, **Health**, **Active sessions** - split into
working and idle - **Free sessions** of the most it takes, and its **Label**,
and reloads itself on the shared refresh interval. A box's own page adds what
it reports about itself - its version, runtime, operating system, default image
and limits - and the sessions open on it now, with the agent that opened each.

**The label is what an agent is granted**, on its **Boxes** setting. Several
boxes may share one, and an agent holding it may be given any of them, so a
second build box under a label already granted is used without anybody editing
an agent. No agent holds any label until somebody gives it one.

### The local box

One box is built into the server: **local**, labelled `local`, on by default and
configured under **Boxes** in Admin Settings rather than here - **Local box**
switches it, **Local box location** is where its sessions' directories live,
and **Local box runtime** is what a session runs in:

- **Local** runs commands as processes of this server, **under its own
  account**, in a directory of their own. There is no isolation at all: a
  command can read whatever the server can, its configuration and its data
  included.
- **Docker** runs each session in a container of its own, thrown away with the
  session, from the `orknux/orkbox-toolchain` image. The server needs the
  `docker` command and a daemon it can reach.

**Local box sessions at most** (50), **Local session lifetime** (two hours) and
its longest, **Local session idle timeout** and **Local box output kept** finish
it. Only working sessions count against the most - one being made or running a
command. An idle session takes no place until it starts a command, and is
refused while none is free.

### A standalone orkbox

**orkbox** is the same sandbox as a service of its own, a separate open-source
project (Apache 2.0) whose server speaks an HTTP Session API: create a session,
read and write its files, run commands, read their output and its log, delete
it. It runs no agents and talks to no model; it holds no credentials of yours
and no prompts, only the environment an agent's commands run in.

**Run one when the box should not be the machine holding everybody's
credentials.** The local box with the Local runtime is fine for one person
trying things, and the Docker runtime contains a session's commands, but both
put the work on the server's own host, competing with it for memory and CPU. A
standalone orkbox goes on a host of its own, sized for builds, and can be
hardened there without touching the server:

- each session is an ephemeral container with CPU, memory, process and
  optionally disk limits, a lifetime and an idle timeout, and optionally no
  network;
- its default image, `orknux/orkbox-toolchain`, builds Maven, Gradle, Node.js,
  C and C++ projects as it stands, and dependency caches can be shared between
  sessions so a build does not download everything again;
- stronger isolation is a Docker runtime away - gVisor or Kata Containers -
  with no change to orkbox;
- an Ansible playbook in its repository installs it on Debian or Ubuntu as a
  systemd service, with Docker, Java and the image.

A default session may take 2 CPUs and 4 GB of memory, and the image is about
1.7 GB, so a host for two sessions working at once wants about 4 cores, 8 GB and
30 GB free.

Add one with **Add box**: a **Name**, the **Address** it answers at with its
scheme (`http://sandbox.internal:8090`, reached through the proxy rules under
Networking like anything else this server calls), its **API token** - stored
encrypted, and shown by the eye - and a **Label**. **Test connection** asks it.
Its own limits - how many sessions work at once, how long one lives, which
images it allows - are its configuration, on its host, not settings here.

### What every box is held to

The rest of the **Boxes** section in Admin Settings applies to every box, local
or remote:

| Setting | What it does |
| --- | --- |
| Command wait | How long a box tool waits for a command to finish before handing the agent its output so far, with the command still running (300 seconds) |
| Command timeout | How long one command may run at all before it is stopped (30 minutes) |
| Command output kept | How much of what a command prints is handed back to the agent; the rest is cut and the agent is told so |
| Box output shown | How much of one command's output a session's Box tab reads and holds |
| Box request timeout | How long this server waits for a box to answer one request (30 seconds) |
| Box edit undo steps | How many edits `orkbox_undo` can take back per session (10); held in memory, so a restart forgets them, and 0 keeps none |
| Box session idle timeout | How long a session an agent opens may go with no command before its box stops it (two hours), unless the agent asks for another. Waiting for a person counts as idle |
| Box ports per session | How many ports one session may have asked for or open at once (5); 0 lets an agent ask for none |
| Box port check interval / wait | How often, and how long, whether something answers on an exposed port is looked at |

**A port is forwarded only once a person allows it**, in the chat or on the
session page. A box forwards it through `docker exec`, so it works on Docker
Desktop too, and it listens on `ORKBOX_PUBLISH_HOST` - every interface unless
that is set; `127.0.0.1` keeps forwards to the box's own machine.

### What contains this

The box. Nothing in this application decides which commands are safe, and
there is no list of forbidden ones, deliberately: reading a command and saying
what it will do cannot be done reliably, and a list that is nearly right tells
an administrator they are protected while a command that downloads its own
instructions walks past it. Give the Local runtime only to agents you would give
a shell on the server; for anything else use containers, and for anything
untrusted a standalone orkbox on a host you are willing to lose.

Administrators only, and every change here is written to the organisation audit
log.

## The database

Postgres or SQLite, chosen by the connection URL and nothing else:

```
ORKNUX_DB_URL=jdbc:postgresql://localhost:5432/orknux    # a server
ORKNUX_DB_URL=jdbc:sqlite:/var/lib/orknux/orknux.db      # a file
```

Everything follows from that one line: the driver, the dialect, and which
migrations are applied. Under SQLite the username and the password are ignored,
a file having nobody to authenticate to.

**Postgres is what a deployment should use.** SQLite is for the installation of
one person or one team: no second container, no database server to keep, and a
backup that is one file. Everything works on both - signing in, workspaces,
issues, agents, workflows, runs, chat, the MCP endpoint, attachments, password
resets and proxy rules - and the tests are run against both.
What differs is underneath.

**One writer at a time.** SQLite takes a single write lock for the whole
database, so two requests that both write queue behind each other rather than
run together. It is quick enough for a handful of people, and it is not a
database to run a busy installation on.

**One machine.** The file is the installation. Two servers pointed at one file
over a network share will corrupt it, so SQLite means exactly one process: no
second node, and no rolling restart. Postgres is what several servers share;
see *Running more than one server*, below.

**No time zones.** SQLite has no zoned timestamp type. The moment is kept and
compares correctly; the offset it was originally written with is not. Nothing in
this interface shows an offset, so it is invisible until something outside reads
the file.

**Backups are a file copy, taken when nothing is writing.** There is no
`pg_dump` here. Copy the database together with the `-wal` file beside it, or
stop the server first.

Two things when pointing it at a file. The directory has to exist already - the
server makes the database, not the folder holding it, and says which path is
missing rather than failing with a connection error. And Temporal is a separate
question: choosing SQLite removes Orknux's own database server, not Temporal's.

## Running more than one server

Several servers can share one Postgres. **They work when Temporal runs the
workflows and tasks, the attachments directory is one volume every server
mounts, and the load balancer keeps one browser on one server** by cookie
affinity. The last is required rather than advised: a chat's Stop button and a
workspace copy's progress are held by the server doing the work, and a request
that lands on another finds nothing to stop.

Some work must happen once, not once per server: the sweeps that tidy runs,
history and scratchpads, the checks on model providers, connections and MCP
servers, reminders coming due, and the Slack sockets that listen for mentions.
**One server holds a lease in the database and does all of that**; the others
serve requests and wait. When the holder dies, nobody renews the lease, and
another server takes it over within one lease. **Cluster lease**, under Workflow
runs in Admin Settings, is how long that is - thirty seconds unless
`ORKNUX_CLUSTER_LEASE_SECONDS` says otherwise, between 5 and 600. Shorter fails
over sooner and writes the row more often; it has to stay well above the
longest pause a server takes, a full garbage collection or a stalled disk, or
two servers can both believe they hold it for the length of that pause.

The Doctor's **Replicas** check says which server holds the lease, and a Slack
connection seen from another says that another server listens to it rather
than that it is not connected.

**SQLite is one process, and so is the inline engine.** A second server started
on the inline engine's database refuses to start, saying another server holds
the lease and that more than one needs Temporal; a server restarted after a
crash waits up to forty seconds for the old lease to run out. That refusal is
the point: the inline engine carries a run on the thread of the process that
started it, and a second process would take that work for abandoned and do it
again.

What is not shared yet: the sign-in pauses and a provider's concurrency and
rate limits are counted per server, so two servers allow twice of each; and an
activated update restarts every server together rather than one at a time.
`docs/horizontal-scaling.md` in the server repository goes through every place
this was looked at.

## Updating the server

**Updates**, in the admin section, is where an installation run from the image
takes a new release: from the official server, from an uploaded jar, or from a
URL. **Update** and **Fetch** answer at once, and the jar downloads in the
background, with a progress bar, each step - downloading, verifying, storing -
and the reason if one fails. A broken download resumes where it stopped rather
than starting again. The releases already kept can be rolled back to.

**Server updates** in Admin Settings decides how stubborn that is: **Longest a
jar download may go silent** (60 seconds - how long a connection may go without
a byte, not how long the whole download may take), **Broken attempts before a
download is given up** (5, counted in a row and only attempts that brought
nothing), and **First wait before resuming a download** (2 seconds), which
doubles to **Longest wait before resuming a download** (60). The same section
holds how many releases are kept, how many starts a new release gets before the
previous one runs again, and how quickly the other servers follow an update.

**A script calling `installServerRelease` or `installServerReleaseFromUrl` must
now poll.** Both answer a `ServerReleaseDownload` straight away, and
`serverReleaseDownload` is asked until it says `DONE` or `FAILED`.

## Configuration

The settings an operator owns live under `orknux` in the application's YAML:

```yaml
orknux:
  chat:
    enabled: true
  attachments:
    enabled: true
    storage: FILESYSTEM
    location: /var/lib/orknux/attachments
    max-file-size-mb: 25
  logging:
    file: /var/log/orknux/orknux.log
    format: json
  temporal:
    ui-url: http://temporal:8080
```

Name an absolute path for `location` in a deployment: relative resolves against
the working directory, which in a container is not somewhere anyone goes
looking.

The database URL, the installation's mail server, the address links are written
from, and the first administrator's two variables are configuration too, and are
in their own sections above - each is next to the thing it decides rather than
in a list of everything. Each has an `ORKNUX_` environment variable as well,
which is how a container is usually told.

### Memory, and finding out what used it

A few variables exist for the day a server is struggling, and are worth knowing
before that day.

**The images exit when the JVM runs out of heap**, so the container is restarted
rather than limping on half-broken. `ORKNUX_EXIT_ON_OOM=false`
keeps it running, which is what you want for long enough to take a heap dump
and not otherwise.

**The database pool** is `ORKNUX_DB_POOL_SIZE` connections (10), and a request
waits `ORKNUX_DB_POOL_WAIT_MS` for one (30 seconds) before it fails.
`ORKNUX_DB_POOL_LEAK_MS`, off by default, logs whoever holds a connection longer
than that, with where it was taken.

**A GraphQL request slower than `ORKNUX_GRAPHQL_LOG_SLOW_MS`** (3 seconds) is
logged by its name, its time and its size, never its content - so a page that
takes the server down says which of its requests did it. `ORKNUX_GRAPHQL_LOG_LARGE_KB`
does the same for an answer past a size, and is off by default; 0 switches
either off.

**Temporal's worker** keeps `ORKNUX_TEMPORAL_WORKFLOW_CACHE` runs in memory
between steps (50) and holds up to `ORKNUX_TEMPORAL_WORKFLOW_THREADS` workflow
threads (100), where Temporal's own defaults are 600 of each. A cached run keeps
its input, every step's output and a thread of its own, and one that parks stays
cached for hours, so an idle server used to fill its heap. A run that is not
cached replays from history at its next step, which costs a moment and nothing
else.

**A plugin bigger than `ORKNUX_PLUGIN_SHARED_ENGINE_MAX_KB`** of code (1 MB) gets
a JavaScript engine of its own for each call, thrown away after it, instead of
the shared engine that keeps every script it parses - a 4 MB bundle held 340 MB
that way from its first call.
