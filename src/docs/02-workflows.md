# Workflows

A workflow is a graph: a trigger at the top, nodes underneath it, and edges
saying what runs after what. It runs when its trigger fires, and only while it
is enabled. What it runs then is the copy that was published, which is not
always the graph you are looking at; see Draft and published, below.

## The list

**Workflows**, under **Flow** in the menu down the left, is every workflow
the workspace has, with when each of them last ran and when it is next due.

**Press a column's heading to order the list by it** - **Workflow**,
**Description** or **Last Run** - and press it again to turn the order round;
an arrow beside the heading says which way it runs. A name starts at A to Z,
because a column of names is read that way round, and **Last Run** starts at the
newest. The ordering is the server's, over the whole list rather than over the
rows on screen: sorting ten of a hundred looks like it worked until the row
somebody wanted turns out to be on page three. **Next Run** is a column and
deliberately not something to sort on — it is the soonest of however many cron
expressions the workflow's triggers carry, worked out one workflow at a time,
and nothing has ever written it down to order by.

**Search workflows...** narrows the list as you type. **Show built-in** adds the
workflows the product made for itself - the research modes (see Research) - which
the list leaves out until asked; they open and run as any other.

**+ Create Workflow** asks for a name and opens the new workflow's editor
straight away, as duplicating one does.

The line at the bottom says how many there are and how many are shown, and how
many at a time sits in it: 10, 25, 50 or 100. The order is in the address, so
"the ones nobody has run" is a link rather than a paragraph of instructions;
how many at a time is remembered in your browser instead, because it says how
much of a screen you have rather than what you are looking at.

## The editor

![The workflow editor: the graph on the canvas, what can be added along the top, and the selected node's settings on the right](/screens/editor.png)

The canvas is the workflow. Drag nodes to arrange them, drag from a node's
handle to another node to join them, and select a node to open its panel on the
right. An edge is dragged by either of its ends: take hold of the arrow and drop
it on another node's input to send it somewhere else, or take hold of the other
end to change where it leaves from. A line dropped on nothing goes back where it
was, and one dropped on wiring the graph already has is left alone.

Lines are routed for you, and where two nodes sit awkwardly a line can run
through whatever is between them. A line is pulled through **points**: a small
handle at its middle, or its label where it has one. Drag a point and the line
bends to follow it.

A line takes as many points as it needs, because a line that has to get round
two things cannot be bent through one. **Double-click the line** to put a point
where you clicked — it goes into the gap you aimed at, so a line already bent
twice can be bent again between those two — and **double-click a point** to take
it off. Taking the last one off leaves the line running where it was routed.

A point that has focus can be worked from the keyboard: the arrow keys nudge it,
Delete or Escape takes it off, and `+` puts another one after it. Delete there
means this point rather than this line, which is what the canvas would otherwise
have done with it.

Where a line has been pulled to is remembered by your browser and nowhere else.
It is an arrangement of your own view: a colleague opening the same workflow
sees the lines routed as they were drawn for them, and it does not travel with
an export. A line deleted from the graph forgets its points, so drawing it
again starts it straight.

- **Things to fix** lists what is not yet valid, and refreshes as you edit.
  A workflow with entries here can be saved but should not be trusted to run.
- **Parameter connections** are drawn as labelled edges: where a node reads a
  value from an earlier one, the edge says which fields travel along it.
- **Input and output dots** are told apart by shape: an input is hollow and an
  output is filled, a socket and a plug. A turned node moves where each dot
  sits, so where it sits cannot be what tells you which it is. Shape rather than
  colour, because colour is already carrying which of a condition's two ways out
  is which.
- **Icons** can be given to any node. A node made from a definition inherits
  the definition's icon.
- Nodes **resize**, and long text wraps rather than spilling.

### Working in it

- **Undo** and **redo** step back and forward through what you have drawn:
  `Ctrl`+`Z` and `Ctrl`+`Shift`+`Z`, with `Ctrl`+`Y` heard for redo as well.
  They are ignored while a caret is in a text box, where the browser's own undo
  is the right one.
- **There is no Save button.** The editor saves what you draw as you draw it;
  see *Working on a workflow together*, below. `Ctrl`+`S` still saves at once,
  for somebody whose hands already went there.
- **Refresh** reads the graph and the lists its nodes pick from again, so a
  trigger or an agent made in another tab - or a workflow an agent changed
  meanwhile - appears without leaving the editor.
- **Run** stands before Publish and starts the workflow as it is on screen,
  saving first if anything is still on its way, and then opening the new
  run's page. That page is where the steps, their inputs and the log are, which
  is what pressing Run was for; going back to the list to hunt for the newest
  row is a detour past it. A start that is refused - a graph with no nodes has
  nothing to run - is said beside the workflow's name and leaves you in the
  editor, because there is no run at the other end to go and look at.
- A node can be **turned**, three ways that are one act: the **Turn** button, a
  rotate arrow standing just off the selected node's top-right corner,
  **Facing** in its panel, or `R` on the canvas. The button is there because
  turning is something somebody does four times in a row, and a panel on the
  far side of the screen is a long way to go for that. It moves where the lines
  join the node - left to right, top to bottom, right to left, bottom to top -
  and changes nothing about what runs. A long chain simply reads better down a
  screen than off the side of one. Each node is turned on its own, so a graph
  can bend where it needs to.
- A node can be **copied**: **Duplicate** in the toolbar, or `Ctrl`+`D` on the
  canvas. The copy points at the same action, trigger, condition, agent or
  object - two nodes running one action is the ordinary case - and carries its
  description, its icon, which way it faces and what it passes on. It is not
  wired to anything: a copy joined to everything the original was joined to is
  rarely the graph anybody wanted, and for a condition it is not even clear
  which of the two answers the copy's lines should leave by. It is named after
  what it was copied from - `Fetch the order copy`, then `copy 2` - so no two
  nodes read identically, and it lands a little below and to the right rather
  than under the original.
- Pickers are **typed into** rather than scrolled. Agents, triggers, actions,
  objects, conditions, functions and connections all narrow as you type, with
  the arrows to move and Enter to take.
- Beside each picker is **New**, which opens the builder in a panel down the
  left rather than over the canvas: what you are making and the graph you are
  making it for stay on screen together. A trigger, an action, a condition, an
  object and an agent can each be made this way, and what you make is chosen
  into the node as soon as it exists.
- **+ New function**, at the top of an action's or a condition's function
  picker, asks for a name and a description in a panel beside the form - beside
  the node panel here, and as a dialog on the action, condition and trigger
  pages - and makes the function with a stub that names it, chosen into the
  picker; the picker keeps what it had until the new one exists.
- A node's long text fields - a description, a prompt - are **dragged taller**
  by their corner rather than opened in a bigger box, and a run step's input and
  output are too.
- **The way out**, the mark beside the picker on a node that already points at
  something, opens it in that same panel — a trigger, an action, a condition
  and an agent alike. Reading a node is a question about the graph, and
  answering it by taking the graph off the screen is a poor answer. An object
  is the exception and opens its own page, because its fields are given there
  and a panel has nowhere to put them. It is still a link, so `Ctrl`, `Cmd`,
  `Shift` or the middle button opens the definition's own page in a tab of its
  own.
- Anything that navigates is a **link**. Clicking one saves the graph and goes;
  `Ctrl`, `Cmd`, `Shift` or the middle button opens it in a new tab and leaves
  what you were doing where it was.

![The builder, open down the left: what is being made, and the graph it is being
made for, on screen together](/screens/node-builder.png)

Every one of those keystrokes is yours to change, in Preferences.

### Selecting several nodes

![Rectangle select on, and a rectangle drawn over the lookup and the agent: two
nodes selected, and the panel says so above the first one's
settings](/screens/workflow-select.png)

Most of what is done to one node can be done to several: moving them, cutting or
copying them, deleting them. There are three ways to select more than one.

- **Shift and click** adds a node to the selection, or takes one out of it.
- **Shift and drag** over empty canvas draws a rectangle, and every node it
  touches is selected.
- **Rectangle select**, the first button on the right of the toolbar or `S` on
  the canvas, turns the second into the ordinary drag. While it is lit a drag on
  empty canvas selects instead of moving the view, and the middle button is how
  you move the view instead. It is a mode rather than an act, so it stays on
  until you press it again.

Selected nodes move together when one of them is dragged. The panel on the right
says how many are selected - *"2 nodes selected - drag one to move them
together, Delete removes them all"* - above the settings of the first of them,
which are still that one node's. **Delete** or **Backspace** removes them
all, and **Escape** lets the selection go.

### Cut, copy and paste

**Cut**, **Copy** and **Paste** are in the toolbar and on `Ctrl`+`X`, `Ctrl`+`C`
and `Ctrl`+`V`. They take the selected nodes and the joints on the lines between
them, and paste them into the same workflow or another one - open the other
workflow's editor and paste there. What is pasted points at the same actions,
agents, conditions and triggers the originals did, and the lines between pasted
nodes come with them; a line to a node that was not copied does not.

Nodes copied in one workspace cannot be pasted into another: the copy names its
actions and agents by their ids in the workspace it came from, and those mean
nothing anywhere else. The editor says so rather than pasting nodes pointed at
nothing.

### Adding a node

![The Add menu, opened where the pointer was by pressing A, with the Workflow
entry under the pointer and what it does beside it](/screens/workflow-add-menu.png)

The **+** button in the toolbar opens the Add menu, and so does `A` with the
pointer over the canvas. Opened by the key, the menu is drawn **where the pointer
is**, and the node is put there too, so a node is added where it is wanted rather
than in the middle of the screen to be dragged across.

The menu is worked from the keyboard as well: **Down** steps onto the first
entry, the arrows move through them and wrap at the ends, and **Enter** adds the
one under focus. Each entry says what it does beside the list as it is pointed
at or focused. **Text to speech**, at the end, is not a kind of node but an
Action node already pointed at the Speak action, spelled out because nobody
hunting for speech would look for it under Action.

An Action node's and a Condition node's pickers list more than the workspace's
own definitions: **every loaded plugin's actions and functions** are there too,
each marked with the plugin it comes from - and in a condition, the plugin
functions that answer yes or no. Picking one makes the node's own definition
around it, which used to take **Custom**, a subtype and the plugin's entry. The
**quick filters** above the list - **All**, **Workspace**, and one per plugin,
several at once - narrow it to where things come from.

### Joints

A **joint** is one of the points a line is pulled through (see above). Besides
double-clicking a line, there is a tool for it: turn on **Joint** in the toolbar,
or press `J`, and a single click on a line puts a joint there, with a preview
following the pointer along the line of where it will go. It is a mode, lit
while it is on, for the afternoon spent tidying a large graph. Click a joint and
press **Delete** to take it off. Joints are kept as the points are, in your
browser; copying nodes copies the joints on the lines between them too.

### A node's shape

![One graph in several shapes: the trigger as a pill, the lookup rounded, the
check a hexagon, the agent notched, the call to another workflow a star](/screens/workflow-node-shapes.png)

**Shape**, in a node's panel, is the outline its card is drawn with:
**Rectangle**, **Rounded**, **Pill**, **Notched**, **Hexagon**, **Circle**,
**Triangle** or **Star**. It changes nothing about what runs. What it is for is a
graph read at a glance: give every node that talks to a customer the same shape,
or every check, and a graph of thirty nodes says what it does before anybody
reads a label.

### Switching a node off

**Enabled**, near the bottom of every node's panel but a trigger's, takes a node
out of the run without taking it off the graph. A disabled node keeps its lines
and its settings and is drawn faded; a run skips it and hands what reached it
straight on to whatever comes next. A disabled condition takes its upper way
out. It is the way to try a workflow without the step that sends the email, and
to put the step back afterwards without redrawing it. A trigger has no such
switch: a run has to start somewhere, and a trigger is silenced by its own
**Enabled**.

## Working on a workflow together

![The editor as somebody else has it open too: their initials beside the
workflow's name, and their pointer, labelled with their login, over the
agent](/screens/workflow-together.png)

Several people can have one workflow's editor open at once, and each of them
sees the others at work.

- **Who is there.** Beside the workflow's name, a round mark with the initials of
  everybody else who has the editor open, each in a colour of their own. Hover one
  for the whole login.
- **Where they are.** Each of them has a pointer on your canvas, in their colour
  and labelled with their login, that moves as they do. It is drawn where they
  point *on the graph*, so it stays on the node they are looking at whichever way
  you have scrolled or zoomed.
- **What they change.** A node moved, added, renamed or rewired by somebody else
  appears on your canvas as they do it, without a refresh.

**The editor saves as it goes.** There is no Save and no Discard: a change is
saved, and seen by everybody else in the editor, a moment after it is made -
also while a node is still being dragged or a name still typed. How long that
moment is, is **Workflow Autosave** under Admin Settings → Workflow runs (300 ms
unless an administrator changed it). `Ctrl`+`S` saves at once. Nothing is said
while saving goes well; **Not saved** appears beside the toolbar only when a save
has failed, and goes once one succeeds.

**Two changes made at once are merged**, not one written over the other. Every
save is made against the version of the graph it was drawn on; when somebody
else saved in between, the save is refused, the newer graph is read, your change
is put on top of it and sent again. So two people dragging different nodes both
keep their move, and the one rule worth knowing is that two people changing *the
same* field of the same node end with whichever of them saved last.

A pointer is sent only while somebody else is there, and taken away when it
leaves the canvas, so an editor nobody shares sends nothing at all.

Publishing is still one person's act: **Publish** publishes the graph as it
stands, for everybody.


## Kinds of node

| Node | What it does |
| --- | --- |
| Action | Calls something outside: an HTTP request, a message on a connection. |
| Condition | Chooses which edge to follow, on an expression over what it was given. |
| Agent | Asks a model, with the workspace's skills and tools available to it. |
| Function | Runs JavaScript on the values handed to it. |
| Object | Assembles a named shape, field by field, for later nodes to read. |
| Session | Names the conversation the agent it leads to keeps, so what is said outlives the run. |
| Image | Draws a picture from a description, with the workspace's text-to-image model. |
| Decision | Asks a decision model or a chat model typed questions about what reached it, and can branch on the answer. |
| Workflow | Runs another workflow of the workspace, waits for it, and hands on what it produced. |

Each kind can be **inline** — defined in this workflow only — or made from a
**definition** in the workspace catalogue, which several workflows can share.
Editing the definition changes every workflow using it.

A session node is the one kind nothing may lead *into*, and it leads only to an
agent. It carries two parameters: **sessionKey**, which is what the conversation
is called, and **sessionKeyPrefix**, which is optional and is what it is filed
under. Both are values or references like any other parameter, so a key read
from the event — the ticket a mention names, the customer an order belongs to —
gives each of them a conversation of its own, and a run a week later that
computes the same key carries on where the last one left off. An agent with no
session node beside it answers and forgets. What is kept is on the workspace's
Sessions page, described under AI.

**An agent node hands on what its agent writes**, not only its last message:
what it says beside its tool calls, and then its answer. Its thinking, its tool
calls and its notes are left out. *When* each of those goes on, and how much of
it the agent writes, are the node's own settings - **Output streaming** and
**Progress messages**, under *An agent node's own settings* below. A workflow
that posts an agent's output to Slack posts its progress remarks too, unless the
node's Progress messages are **None**.

An agent step that sets a **watcher** does not wait for it. The step completes
with the agent's answer and the run goes on; when the watcher fires, the agent
is woken in the same session and its new answer runs the nodes after it again,
so a reply reaches the same Slack thread. See *Watchers* under AI.

An image node keeps its prompt where you typed it, and passes the picture on
**beside** what reached the node rather than in place of it — so a node after it
still has the payload it would have had, with the drawing added. What it drew is
shown under that node in the run log, and is on the workspace's Artifacts page
afterwards. A workspace with no text-to-image model chosen cannot run one, and
the node says so rather than failing somewhere further in.

![An image node selected in the editor: the model it draws with, the size, and
the prompt](/screens/image-node.png)

![The run where it drew: the picture in the panel of the node that drew it](/screens/image-run.png)

A decision node runs on either kind of model. A decision model is any server
that speaks the Jev format (`POST /v1/systemone`), hosted or on your own
hardware; it is faster and its confidence is calibrated. Add one under
**Models** as a provider of the type *Decision model (Jev format)*, with its
address and a key if the server asks for one, and give it a model of the kind
*Decision* named as the server names it. A chat model works with any provider,
but the probabilities it gives are its own estimate rather than calibrated ones.
The answers come back in the same shape whichever answered, so the branches
behave the same - though a decision model's calibrated confidence runs lower, so
it clears the same threshold less often.

The node sends a **state** — what reached it, or a value or reference you map
instead — and asks one or more questions about it, each under a key of your
choosing:

| Question | What comes back |
| --- | --- |
| Choice | One of the options you name, with a probability for each. |
| Score | A level on the scale you give, lowest first. |
| Yes or no | The probability that the statement holds. |

Each answer is passed on under its key with its **confidence**, and whether it
was **sure** — whether it cleared the node's threshold. A node that branches on
a choice question draws one line per option and one more, **Unsure**, which is
the way out when the answer is under the threshold. A node can branch on a yes
or no question instead, and then draws **Yes**, **No** and **Unsure**: Yes or No
when the answer clears the threshold, Unsure when it does not. Draw a line for
every way out; one left without a line is warned about when you save, because a
run that takes it stops there.

## The Workflow node

![A Workflow node selected: the workflow it runs, the way to open it, and what it
passes](/screens/workflow-node.png)

A **Workflow** node runs another workflow of the same workspace as one step of
this one. It is how a piece of work several workflows share - answering in a
Slack thread, filing a ticket the house way - is drawn once and called from
each, rather than copied into all of them and kept in step by hand.

1. Add a **Workflow** node from the Add menu and choose the workflow it runs in
   its panel. Only the workspace's other workflows are offered; one cannot run
   itself.
2. Give it **parameters**, if the workflow it runs needs particular fields. Each
   is written or referenced like any other node's, and they are what the called
   workflow's trigger is handed. With no parameters, the called workflow is
   handed whatever reached this node.
3. Wire it like any other node. The run waits at it until the called workflow has
   finished, and what that workflow produced is handed on to the nodes after it.

The way out beside the picker opens the called workflow's editor. A failure in
the called workflow fails this node's step, and the run stops there as it does
at any failed step; retries and a failure line belong to the nodes inside the
called workflow, where the work that failed is.

On the run's page, the Workflow node's step has a **Called run** line linking to
the run it started, and that run's summary has a **Called by** row linking back -
so following a run that went through three workflows is three clicks, not a
search through Executions.

## An agent node's own settings

![An agent node selected, its panel scrolled to the settings that are the
node's own: Output streaming, Progress messages, Times it runs and Timeout](/screens/agent-node.png)

An agent node runs one of the workspace's agents, and most of what it does is the
agent's - its instructions, its model, its tools. A few things can be set for
this node alone, without changing the agent everywhere else it is used.

**Model** is a parameter: the id of a chat model the workspace may use, written
in or read off the run, and the agent thinks with that model on this node instead
of its own. Empty is the agent's own model. A model the workspace cannot use
fails the step, rather than quietly falling back to another. It is how one agent
can be asked cheaply on one node and carefully on another.

**Reasoning effort** is how hard that model thinks on this node, in place of the
model's own setting. It is offered only where the node's model takes one, and
offers the words that model takes; **Default** uses the model's own. When the
model is read off the run, the node cannot know in advance which words it will
take: a word the model the run reaches does not take is said in the run's log,
and the model's own setting is used instead of failing the step.

**Progress messages** is how much the agent writes while it works, before its
answer:

| Setting | What the agent writes |
| --- | --- |
| Default | What the agent's own setting says. |
| None | Only the answer. Anything it writes beside its tool calls anyway goes into the run's log and nowhere else. |
| Low | One line on what it is about to do. |
| Medium | That, and every few calls what it has found. Every agent that predates the setting is on Medium. |
| High | A line at every step. |

**Output streaming**, on unless you turn it off, decides *when* those messages
go on. On, each message the agent writes beside its tool calls is handed to the
nodes after this one as it is written - a run of its own, carried on from this
one, so a Slack reply that says *"Looking into it"* goes out while the agent is
still working - and the step's own output is its last answer. That includes the
message an agent writes as it ends a turn to wait for an agent it asked: it goes
out then, not with the answer minutes later. Off, the node finishes first and
hands everything it said on together, each part separated by a blank line.

A message that cannot go on as it is written - nothing follows the node, or the
node answers in a fixed shape - stays with the step's answer, and the agent's
session says why. A run's page says, under the agent step's **Parameters**,
whether **Output streaming** was on, so a message that reached Slack late can be
told from one the step held on purpose.

**Times it runs** and **Timeout (seconds)** are on an agent node as on an
action; see below.

## The catalogue

A definition made once and used by several workflows lives in the workspace's
catalogue, listed under **Flow** in the menu down the left.

![The action catalogue: what each action calls, and what it hands
back](/screens/actions.png)

**Actions** are the calls out — an HTTP request, a message on a connection, a
function, a wait. Each declares its inputs and outputs, and those are what a
node pointing at it is offered to map.

An action is a **page** too, at `/actions/<id>`, with a new one written at
`/actions/new` — for the reasons a condition is one, and for one more: this form
names a connection, a mail server, a function or a condition, and **Open
definition** beside each of those opens it in a tab of its own. The page also
says which workflows run this action, above the Danger Zone that removes it.

![Conditions: the question each one asks, and what it asks it
of](/screens/conditions.png)

**Conditions** are the questions: a property, a check, and the values to check
against. A condition node follows one edge or the other on the answer.

![A condition on its own page: what it asks, and what it asks it
of](/screens/condition.png)

A condition is a **page**, at `/conditions/<id>`, and a new one is written at
`/conditions/new`. That matters because an address can be kept: a half-written
condition survives a reload, can be sent to somebody, and opens in a tab of its
own from the list.

A condition can ask a **function** instead of a property, and then **Open
definition** sits beside the picker and opens that function in a new tab rather
than in this one. The form you are in is holding edits nobody has saved, and in
the workflow editor the same form is a panel beside the graph - a jump in the
same tab would take both off screen.

It is the same form wherever it is: this page, the editor's node panel, the
trigger dialog and the action form all draw it, so there is one thing to learn
rather than two that drift apart.

![The workspace's functions](/screens/functions.png)

**Functions** are JavaScript called from an action node with the arguments that
node maps to them.

![The function editor: the source, the parameters it takes, and what it
returns](/screens/function-editor.png)

A function is written in TypeScript and stored together with the JavaScript
compiled from it, so what runs is always what was written. Its parameters are
declared rather than guessed at, and the workspace variables it may read are
granted one by one — naming a secret is not enough to reach it.

The function editor takes the whole window: the details - name, parameters,
the workspace variables it is handed, imports, libraries and what it returns -
down the left, the code in the middle, and a chat down the right. Ask the chat
about the function, or to change it: it reads the code as it stands in the
editor, saved or not, and a change it offers is drawn against the code with
**Accept** and **Reject** over it. Accepting saves it, as Save does; on a
function not created yet it puts the change in the editor and leaves Create to
you. The wand beside Validate asks the chat for help in one click.

**Auto-completion**, the switch beside the wand, suggests how the code at the
caret goes on, from the workspace's completion model - a line or a few, drawn
grey after the caret for **Tab** to take. It is on until you switch it off, and
stays the way you left it. It needs a completion model chosen in the
workspace's settings, or the workspace set to **Default** and one chosen under
Admin → Settings; without one nothing is suggested.

![The objects a workspace has declared](/screens/objects.png)

**Objects** are the shapes that travel between nodes: named fields with types,
which an object node fills in and later nodes read field by field.

## One function calling another

What was written once and pasted into three functions can be written once. A
function may **import** other functions of the same workspace, and so may a
tool. The rows are in the **Imports** section of the editor's side panel: pick
the function, and give it a name for this code to call it by. **Add Import**
makes another row.

The code reaches them through one frozen object called `imports`, keyed by the
names you chose:

```ts
export default function shout(word: string) {
  return { said: imports.upper(word) };
}
```

Nothing about the imported function's own signature moves, because an import is
not an argument. A script that imports nothing has no `imports` object at all.

**The row holds an id and the name is your own word for it**, and holding those
two apart is the point of the whole thing. Rename the imported function and the
calling code is untouched: the row still points at the same function, and the
call still says what it always said. The reverse follows as well — changing the
name in the panel does not rewrite your code, so the calls have to be changed
to match.

A function reached through two others is evaluated once, because its state is
one state. The editor knows what an import takes and returns, so a call with
the wrong arguments is underlined before it is saved.

### What is refused, and when

An import that cannot work is refused where somebody is looking rather than
mid-run, so **the save is what fails**.

- A **loop** is refused, and the refusal names it however many functions it goes
  round — *That import would make a loop: slug imports title imports slug*. Only
  functions can be in one; nothing imports a tool.
- **A plugin's function cannot be imported** — *Weather is provided by a plugin,
  so it cannot be imported. Point an action at it instead.* It does not run in
  this sandbox. The picker does not offer one either.
- **Two imports cannot share a name** — *This already imports something called
  "upper"* — and a name has to be one JavaScript can be called by.
- Another workspace's function is answered *There is no function 41 to import*,
  which is what a function that never existed is answered. A catalogue is the
  workspace's, and an id from elsewhere is not a thing to be told about.
- **A function something imports cannot be deleted.** See *Deleting something in
  use*, below.

Libraries — JavaScript an administrator loads for the whole installation — are
imported the same way, in a **Libraries** section beside Imports, and arrive in
the same `imports` object. They are described under Administration.

## Sending mail

A workflow can send email, and it takes two things: a connection that knows the
mail server, and a **Send Email** action that says what to send.

The connection is made under the workspace's Integrations, as **Email (SMTP)**.
It holds the host, the **Security** it speaks (STARTTLS, TLS, or none at all),
the port, and the **From Address** every mail sent through it comes from. A
login is optional: leave the username empty and it sends without authenticating.
The password is encrypted where it is stored, like every other credential here.
**Test Connection** opens a session and authenticates without sending anything,
so a wrong password is found before a workflow finds it.

The action takes **To**, **Subject**, **Body**, **Cc** and **Reply To**. To and
Cc each take several addresses, separated by commas or semicolons. The body is
plain text. What is written on the definition is where each node starts, and a
node may say something different, which is how one Send Email serves several
workflows.

The from-address is the connection's and is not a parameter: a provider that has
not authorised an address will refuse the message however good the password is.

Mail does not go through the installation's proxy rules. Those match an address
and cover outbound HTTP, and a mail server is named by host here rather than by
URL; see Administration.

A node with nothing to send - no recipients, or neither a subject nor a body -
is skipped rather than failed. A server that refuses the message fails the step,
and the failure says whether trying again is worth anything.

## Making an HTTP request

An HTTP action takes a method, a URL, a body and its **headers**, and the
headers are rows rather than a blob of JSON. Each row is a name, a switch
reading **Value** or **Reference**, and the thing itself.

**Value** is used exactly as written. **Reference** points the row at one of
this workspace's variables, which is read when the action runs and is shown
nowhere else - not back in this form, not in a run's record, not in the text of
an error. That is the reason the switch exists: a bearer token in a header used
to be pasted in as literal text, into a field that was never a credential field,
stored unencrypted, and readable by anyone who could open the action.

A variable a header names counts as in use, so deleting it is refused with the
action named - the same refusal a function's granted variable has always had.

Headers saved before this were a JSON blob and are left exactly as they are
until somebody saves the form. One that no longer reads as JSON is not silently
dropped: the form says so and keeps the text, because a request that quietly
sends no headers at all is worse than one that says it cannot.

## Finding a connection from code

A function, a JavaScript tool or a plugin can ask which connections its
workspace has with `orknux.connections.query({ type, name })`, both filters
optional. It answers `{ connections: [...] }`, each with its id, name, kind,
plugin type, address, how it authenticates, its status and the *names* of its
headers — and for SMTP its port, username, from-address and security.

**It never answers a credential.** What crosses is built from a list of fields
that may, rather than from a connection with the secrets taken out, so a field
added to a connection later stays on this side until somebody decides
otherwise. The address loses any `user:password@`, its query string and its
fragment, because a token in a query parameter is exactly the shape an
incoming-webhook URL takes, and nothing here can tell that parameter from a
harmless one.

The answer is the run's own workspace and no other: the script cannot name one,
and a call made outside any workspace is refused. A workspace's own functions
and tools may call it as they are; a plugin needs `CONNECTIONS_QUERY` granted by
an administrator. A new function's stub names it.

### Talking to Slack through a connection

A Slack connection's tokens never cross into the script either, yet a function
or a plugin can still use them - by naming the connection and letting the
server make the call:

- `orknux.slack.api(connection, method, args, { as })` makes one of Slack's
  reading calls - `auth.test`, `conversations.list`, `users.conversations`,
  `conversations.history`, `conversations.replies`, `users.list`,
  `users.lookupByEmail` or `files.info` - with the connection's bot token, or its
  user token with `as: 'user'`, and answers Slack's own JSON.
- `orknux.slack.download(connection, fileId)` fetches a Slack file with the bot
  token, as text or as base64, up to 5 MB.
- `orknux.slack.upload` puts a file on Slack, and `orknux.slack.remoteFile`
  adds one kept at an address outside Slack as a Slack remote file - both with
  the connection's bot token.

The first two are the `SLACK_WEB_API_READ` capability and the last two
`SLACK_UPLOAD_FILE`. A plugin that uses them asks an administrator for the grant
(see Plugins in Administration); it no longer needs a copy of the bot token in a
parameter of its own, which is a second place a secret was kept and a second
place it could leak from.

## Values and references

Every parameter is either **written** or **referenced**. A referenced value
is chosen from the dropdown of what is actually in scope; a written one is used
as typed, except for the placeholders in it (below).

References are paths — `trigger.threadTs`, `classify.output.label` — and the
picker only offers paths that exist at that point in the graph. This is why the
graph knows which fields travel along which edge, and why it can tell you before
you run it that a node is reading something nothing produces.

The picker also has a **Workspace variables** group: a parameter can read one
of the workspace's values, and it is read when the step runs, so changing the
variable changes the next run without touching the workflow. **Secrets are not
offered, and never resolve there.** A parameter is handed on as text - into a
message, into a prompt - and a secret referenced into one would be published.
A secret belongs in a function's external parameters or a credential field,
where it is used rather than shown; see Variables.

A field that reads a variable - a plugin's parameter, an action's header, a
secret field - has an **open** button beside the reference, which lands on the
variable in its catalog. And a reference to a variable can be **cleared**, from
the same place, which switches the field back to a written value; switching a
field to **Value** is saved like any other change.

### Placeholders

A written value can name a field of the run inside double braces:
`Refund requested on {{trigger.ticket}}: {{trigger.text}}`. When the step runs,
each placeholder is replaced by what that field holds, and the rest is used as
written. It is how a message is put together from several fields without a
function to do the joining.

- **Typing `{{`** in a written value suggests the fields in scope at that point
  of the graph, the same list the reference picker offers. Placeholders are
  highlighted in the value, and each draws the same green dependency line to the
  node it reads from that a reference does.
- **A placeholder is checked on save.** One that names a field nothing in the
  graph produces is refused, saying which, rather than saved and left to come out
  empty in production.
- **Workspace variables** go in the same way: `{{variables.<id>}}`, offered by
  name after `{{`. They are read when the step runs, so changing the variable
  changes the next run. **A secret is never offered and never filled**, for the
  reason above.
- **A condition node's written value may name a field** too: `{{trigger.review}}`
  on a condition is that field's value, as on any other node.
- A field the run does not carry comes out **empty**, not as the braces written
  out, because a message to a customer reading `{{trigger.name}}` is worse than
  one missing a name.

## Objects

An object node declares a shape and fills it in. Pick a shape from the
workspace's objects, or define the fields inline, and write or reference each
field. What comes out is one value under the node's output name, which the next
node can read field by field.

### An object inside an object

A property can be an object of its own. In the object editor, **object** is one
of the types a field can have; choose it and the field gets fields of its own,
drawn as rows inside its row, as deep as the installation allows. An Object node
that defines its own fields can do the same.

An object can also be made from a pasted **JSON Schema**, from the Objects page
and from the workflow editor's **Create Object** panel. The schema is read as it
is typed - **Valid** or **Invalid** beside it, the details on hover - and each
of its properties becomes a field. A key a reference could not follow, such as
`issue-related-events` or `2fa`, is written with underscores instead, and the
key it came from is kept in the field's description.

In the editor, an Object node's fields are drawn as a **tree**, an object's own
fields folded under it until you unfold them, and a later node can point at one
inside by its dotted name - `order.customer.email`. The field picker also offers
the **whole object** as one row, for a node that wants all of it.

**Object Depth**, in Admin Settings, is how deep an object may nest and how deep
a value is checked against one. A fresh installation starts at 30
(`ORKNUX_OBJECT_MAX_DEPTH`); an object deeper than that is refused when it is
saved rather than accepted and then not checked.

## When a node fails

A step that fails stops the run where it happened, which is the right thing when
nothing else was going to work either and the wrong thing when the failure was a
provider having a bad minute. So an action and an agent each carry two settings
of their own, in the node's panel. Nothing else does: a condition that does not
hold has answered, and an object node assembles what it was already handed.

**Retries** is how many goes in all rather than how many extra ones — one is the
single attempt every step has always had. Beside it, **initial wait** is what the
node leaves before its second attempt, and **multiplier** is what that wait is
multiplied by after each one: 1 repeats it, 2 doubles it, and 1.5 grows it
without doubling. A provider asking to be left alone is then left alone for
longer each time instead of being knocked on at the same interval.

Under the three is a line saying what they come to — *"up to 5 attempts over
about 2m"* — because the numbers compose in a way nobody works out in their head,
and that sentence is the one worth reading before saving.

Three more sit behind **Ceiling, jitter and budget**, and most nodes never need
any of them:

- **Maximum wait** stops the curve growing past a number you choose. It is only
  offered where the wait grows, since a wait that repeats cannot reach a ceiling.
  No single wait ever passes an hour whatever is set here.
- **Jitter** is how much of a wait may be taken off it at random — 0 is none,
  0.25 takes off up to a quarter, 1 draws each wait from anywhere up to what the
  curve asked for. It only ever shortens, so every other number stays the most
  that can happen. It is what stops a hundred runs that failed on one outage all
  coming back at the same instant, which is how a service that is struggling gets
  held down.
- **Budget** is a wall clock: *give up after this long whatever you are doing.*
  It is the only setting that can stop a node with attempts still in hand, and
  the only one that counts the work as well as the waiting — five attempts at a
  request that times out after a minute is five minutes of run that none of the
  waits above account for. A node that reaches it stops there, and says so in the
  run's log.

A node saved before any of this had a fixed wait, or that wait doubling, and
means exactly what it meant: doubling is a multiplier of 2, and a fixed wait is a
multiplier of 1.

A failure that is already settled never spends an attempt. A request refused for
what it said will be refused the same way in ten seconds; only the failures that
might come out differently — a timeout, a rate limit, a connection that dropped —
are asked again. Worth knowing before you turn retries on for an agent: **every
attempt is another call you are billed for**, and nothing here caps that.

A rate limit is waited out before any of that, and spends no attempt: the call
is made again after the time the provider asked for, or after a short doubling
wait where it names none. That includes the one Azure sends *inside* an answer
it has already begun streaming with a 200, which used to be read as a settled
refusal — so an agent step failed on the first rate limit of a busy hour.

**When it fails** is the other one. Off, a failure ends the run. On, the node
grows a second handle and the run carries on down whatever is wired to it, drawn
as a red **If fails** line beside the green **If works** one — so the graph says
what to do about a failure rather than the run simply stopping. Both ways out
can be renamed, the same as a condition's two, because the words beside the
handles are most of what makes a graph legible. The step records its failure
either way; what changes is whether anything happens next. Switching it back off
takes the failure line with it, since a line leaving by a door that is no longer
there could not be saved.

## Doing a node's work more than once

**Times it runs**, on an action or an agent node beside its retries, is how many
times the node does its work in one run. Each time is handed what the time
before produced, and the node after it gets the last. It is for work that is
better done in passes - a draft and then a better draft, a page of results and
then the next - without drawing the node three times in a row.

One is once, and is what every node does unless told otherwise. A failure in any
pass is the node's failure; its **Retries** count afresh for each pass, so a
retry policy of three attempts means three attempts at the second pass even if
the first used two. Admin Settings caps how many times any node may run
(`node.repeats.most`, 100), and a number above it is saved as the cap.

## How long a node may take

**Timeout (seconds)**, on every node but a trigger and an object - an action,
an agent, a condition, a decision, an image node and a Workflow node among them -
is how long one attempt of it may take. Empty is no limit, as before.

The clock starts when an attempt does and counts everything in it, waits
included. An attempt past its timeout is stopped - a model call is hung up on, a
script is cancelled, a called workflow is asked to stop - and the step fails
with the reason: *"Fetch the order took longer than its timeout of 30s"*. From
there it is a failure like any other: **Retries** try again, each attempt with a
full timeout of its own, and **When it fails** sends the run down the failure
line. With **Times it runs**, each pass has its own timeout too. A step that was
waiting past its timeout is woken at the deadline and fails then, rather than
when it would have woken.

Admin Settings caps how long a timeout may be (`node.timeout.most.seconds`, a
day). Work that ignores being told to stop - a call that neither hangs up nor
notices it was interrupted - cannot be killed from outside; the step is still
recorded as failed when it returns.

## What a component was

Every save of a function keeps the version it replaced, and so does every save
of a tool, a skill and an agent. **History** is that list: who saved it, when,
what it was called then if the name has changed since, and — when a row is
opened — the code or the prose it held. It sits in the panel beside what you are
editing for a function, a tool and a skill, and on the agent's own settings page.
**Restore this version** makes an older one current again.

Each row also says **what that save changed**, before it is opened - *Model:
Fast → Careful*, *Prompt edited*, *No change* - and an opened row draws the
version as JSON against the one before it, with what was taken out and what was
put in marked, so
finding the save that broke something is reading down a list rather than opening
every row. An agent's history keeps which agents it may ask, with the rest of
its grants.

The list is fetched when the panel is opened rather than with the component. A
tool edited fifty times in an afternoon is fifty copies of its source, and none
of that is wanted by somebody who came to change a description.

Restoring asks nothing first, deliberately. It keeps what it displaces exactly
as a save does, so the button that made the mistake is the button that takes it
back, and a dialog guarding an undoable act is a dialog people learn to dismiss.
What the editor was holding is read again afterwards, because a form left with
the version from before the restore would put that version straight back on its
next save.

A component's history begins with the first save after this arrived. Nothing
from before it was kept, there having been nothing keeping it.

How long these are kept is an administrator's setting, fourteen days unless it
has been changed; see Administration. A version is a whole copy of what the
component was rather than a note of what changed, which is why there is a number
on it at all.

A workflow has a history too, and it is versioned by publishing rather than by
saving; see **Draft and published**, below. **Variables are deliberately not
versioned.** Their values are encrypted, and keeping old ones would mean keeping
old secrets.

## Trying a function before a workflow uses it

A function's editor has a **run** mark in its corner. It opens a window with a
field per parameter, each offered as the type that parameter has — a number
field for a number, and a JSON box only for the shapes that have no spelling as
a plain word.

What runs is **what is stored**, not what is in the column: the same sandbox an
action node would use, the same imports and libraries, and the workspace's
variables it is granted resolved the same way. So save first to try a change, and
the window says so when the column has moved on.

The variables it is granted are fields too, each left blank meaning the
workspace's own value. Fill one in and the run is given that instead — which is
how you test a signature check against a secret nobody may read back, or on a
workspace where the variable has not been set yet. Nothing that runs on its own
can pass one, and the workspace's audit names the ones that were given by hand,
so a run that behaved differently from the real one is never mistaken for it.

## Leaving with something unsaved

The function, tool, object and skill editors hold work the server has not been
told about - the workflow editor no longer does, since it saves as it goes - and all four used to lose it without a word: a link followed, a Back
press, and twenty minutes were gone.

They ask now. The question is only asked where something has actually changed —
what is on screen compared against what was loaded, rather than a flag set by
the first keystroke, so somebody who types a character and deletes it is not
stopped by it. It offers to save and go as well as to go anyway, because the
alternative is three gestures for the answer almost everybody wants. A save the
server refuses leaves you where you are with the reason on the page, since
leaving on a save that did not happen is exactly the loss the question exists to
prevent.

Closing the tab or reloading is the browser's own warning rather than this one.
Asking is the whole of what a page may do about it there.

## Deleting something in use

Deleting a definition that something still points at used to go through, and
what it left behind was a workflow that stopped working with nobody having
touched it. An action calling a function that is gone, an agent granted a tool
that no longer exists, a webhook checked against a shape nobody kept: each of
those fails later, somewhere else, and says nothing about the delete that caused
it.

The delete is refused instead, and the refusal names what is in the way — *Act
is used by the published workflow Answer, so it cannot be deleted*. It covers
actions, agents, conditions, functions and triggers, which are pointed at by an
id, and tools, skill catalogs and memory catalogs, which are granted to an agent
by name. A variable is refused for the same reason where an action's header
references it, which is new: a header pointing at a variable that is gone would
send an empty one. The way through is to change what is in the way first: take the node
off the graph, take the grant off the agent, and the delete goes through. It is
the rule a variable has always had.

**A function another script imports is refused as well**, and that is a second
sentence rather than the same one — *slug is imported by title, the tool
Summarise*. A caller is a node you repoint; an importer is code somebody has to
open and change. Naming both kinds says which job it is.

**A published copy counts as well as the graph on the canvas.** A workflow
published months ago goes on calling the definitions its nodes name, so an
action whose node was taken off the canvas and never republished is exactly the
case that asking the drawing alone would have let through.

**And the same answer is on the thing's own page, before anybody tries.** A
function, a tool, an agent, a condition, a trigger and an object each carry a
**Used by** panel, under the History one, listing what points at them — and every
row opens that thing, so being told an action is in the way is also being taken
to it. A published copy is marked as one, because redrawing the canvas will not
move it. Nothing pointing at it says so in words rather than leaving an empty
box: *Nothing uses this yet*. A long list comes a page at a time. An agent is
used by the workflows that run it and also by the agents that may ask it, so
taking it away from a team of agents is not a surprise to any of them. A
**model** has the panel too, on its page: the agents that think with it, the
workspace settings that name it, the actions that speak with it and the
workflows whose image or decision nodes use it; a provider's page lists its
models. Removing a model still in use is refused with that list, and so is
removing a provider while any of its models is.

It is deliberately the same list the refusal is worded from. A panel saying a
function is used by nothing, followed by a delete refused for two reasons, would
be worse than no panel at all — so there is one question asked in one place, and
the sentence and the list cannot drift apart.

A grant is a name rather than an id, which is why a tool or a catalog is refused
even though nothing would have been left dangling by it. Nothing dangles, and
that is the problem: the agent's screen goes on listing a grant that now means
nothing, and a name can be bound again — make a tool called `weather` tomorrow
and every agent still holding that grant is handed whatever it now does, which
nobody chose.

Objects are the deliberate exception, and only half an exception. A function's
parameters, a tool's parameters and a node on a canvas name an object as an
annotation: losing it degrades what the editor draws above the code, on the
screen where somebody would fix it, and no run resolves it. A webhook's input
object is not an annotation but the contract every arriving request is checked
against, and a request that matches nothing is answered `404` — so an object a
webhook names is refused, and so is one another object's field points at.

## What depends on what

![The Dependency graph of the support responder: the workflows that use it on
the left, the models and tools it uses on the right](/screens/dependency-graph.png)

**Dependency graph**, a button on the **Used by** panel of any component's page,
draws the whole chain at once: what uses it branching out to the left, and what
it uses to the right, each followed to the end. An agent's graph shows the
workflows that run it on one side and its model, its provider and its tools on
the other, so the question *what breaks if I change this* has a picture as its
answer.

Choose a box and it opens that part's own page - or makes it the middle of a
graph of its own, to follow the chain from there. A part that turns up twice is
drawn once and marked **shown elsewhere** the second time, so a graph with a
shared model in it does not repeat the model's whole tree. The window can be
dragged bigger.

A **workflow** has a Used by panel too, on its settings page, listing the
workflows that run it with a Workflow node.

## Draft and published

Saving and publishing are two different acts, and the difference decides what an
event actually runs.

- **Saving** writes the draft, and the editor does it as you draw. The draft is
  the graph on your screen, and editing a published workflow puts it back into
  draft.
- **Publish** takes a copy of the draft and stores it. That copy is what runs
  from then on, and it does not change again until it is published again.

What runs which:

| Started by | Runs |
| --- | --- |
| A trigger, a schedule, a webhook | the published copy |
| The API, and an assistant over MCP | the published copy |
| **Run**, pressed by a person | the draft |

Run uses the draft because that is what pressing it means: the graph on my
screen, now. Everything else uses the published copy, because a half-finished
edit saved at five o'clock should not be what answers a webhook at six.

A workflow that has **never been published has nothing to run**. Its trigger
fires, finds no published copy, and the firing is recorded as a failure in the
trigger's history. The badge beside the workflow's name in the editor says
**Draft** or **Published**, and **Publish** stays lit while there is anything
left to publish - a graph that was never published, or one edited since it was.

Publishing saves first, so what is published is always what is on screen. A
graph with no nodes in it is refused: *Add at least one node before publishing*.

**Every publication is kept.** The workflow's settings page lists them — when,
and by whom — marks the one that runs as **Live**, and **Restore** puts an older
one back into service. Restoring publishes that graph again rather than reviving
its row, so the list only ever grows and a rollback is something that happened
rather than a gap where something used to be; the row it adds says which
publication it copied.

Restoring does not touch the draft on the canvas. The draft is what somebody is
in the middle of, it is not versioned, and overwriting it would destroy
unpublished work with nothing to get it back from. What changes is what triggers
and schedules run — and the badge reads **Draft** while the two differ, rather
than pretending the canvas is what is running.

So a workflow's versions are its publications and not its saves: a draft is a
draft. The way back from a change you regret is **Undo**, while the editor is
open; there is no Discard any more, since the editor saves as it goes and there
is nothing unsaved to throw away.

How long publications are kept is the same administrator's setting that governs
the rest of the component history, and the live one is never swept whatever its
age — it is not history, it is what the workflow runs. See Administration.

**What is published is the graph, not the components it calls.** The copy holds
the nodes, what each one passes and the arrows between them - and, for the
function, agent or condition a node names, only which one. Editing that function
changes what the published workflow does the next time it runs. Nothing is
republished and the badge does not change, because the graph did not. If you need
a published workflow to keep behaving exactly as it does, take a copy of the
function rather than editing the one it calls.

## Running

![The executions list: every run, how it ended, how long it took and what started it](/screens/executions.png)

Enable the workflow to let its trigger start it. Each run appears in
**Executions** with:

- the **Run** column, which opens that run — its graph, its steps, timings, and
  what each step passed on;
- the **Workflow** column, which opens the definition it ran from;
- the execution id, for matching against logs.

Removing a workflow leaves every run of it here, and those runs say so. The name
stays on the row and on the run's own page, because it is the only record of
what ran, with **removed** beside it and nowhere to click: the editor would
answer *No workflow assignment with id 373*, which reads as a broken page rather
than as a workflow somebody deleted. The **Workflow** filter is built from the
workflows the runs actually name rather than from the ones the workspace still
lists, so those runs can be singled out instead of only scrolled past, and the
removed ones are marked **(removed)** in it — the filter gains the reach without
passing them off as live ones.

![One run: its summary, and the graph as it ran with each node marked by how it
went](/screens/execution-detail.png)

Opening a run shows the graph as it ran, each node carrying its own outcome and
timing, with the log underneath. The lines the run travelled are drawn in green,
and the line into a step still running moves; a step it did not reach because nothing led
there - the other side of a condition, a node no trigger leads to - is grey, so
the path it took reads off the canvas at a glance.

**Re-run** puts the same event through the workflow again. The input is carried
over, because a re-run starting from nothing is a run with nobody left to
answer, and the point of it is the thing that happened put through a graph you
have changed since. It is recorded as manual however the first run started,
since a person pressed it, and it runs the same kind of graph the first run did:
the draft for a run somebody started by hand, the published copy for one a
trigger started. Re-running what a webhook did against a half-finished edit
would not be re-running what the webhook did.

### Re-running from a step

A run that failed at the last node of six should not have to redo the five that
worked. For a node that sends a message, files a ticket or takes a payment,
doing it again is not a repeat but a second occurrence, so the safe thing to do
with a fixed node further down was often to do nothing at all.

Select a node on a finished run's page and its details offer
**Re-run from here**. The workflow starts again at that node, carrying what the
earlier run had produced by the time it reached it. The steps ahead of it are
not performed again: they appear in the new run as what they were, marked
**Carried over**, showing the earlier run's status and times. Leaving them blank
would have read as a run that never started, and a step saying it completed at
09:14 when the run began at 11:02 is a lie unless something on it says where it
came from.

It refuses, and says which, wherever starting there would mean guessing: a step
that never ran, a node the graph no longer has, a branch the earlier run did not
take, a condition whose answer was not recorded, a run that has not finished,
and a node edited since to read something the earlier run never produced. A run
that quietly reads blank where the earlier one read a channel is worse than
being told it cannot be started.

A run made by either kind of re-run says where it came from: a **Started from →
Run #N** row under the Run ID, linking back to the run it was started from.

### Reading a step

![A run of the Slack workflow, its agent step selected: Parameters with the
prompt it was handed, and Output streaming](/screens/execution-parameters.png)

Select a node on a run's page and its panel says what that step did. Above its
**Input**, which is only what the run was carrying, **Parameters** lists what
the node was told to pass and what each came to - an agent's prompt, an action's
arguments - worked out from what the step received. A reference shows the field
it read beside its value. Workspace variables are left as written, so a
parameter that reads one does not put its value on the run's page.

An agent step's Parameters end with **Output streaming**, On or Off as the node
had it when the run started (see *An agent node's own settings*).

What a function or a plugin action wrote with `orknux.log` is under its step in
the run's log, whether the step returned or threw: an error as an error, and a
warning marked **Warning**. How many lines are kept is an installation setting
(`ORKNUX_TUNING_SCRIPT_LOG_LINES`, 500).

### A run of an older version

A run that started while the workflow's draft had changes its publication did
not is marked **Older version** above its graph, with the date of the publication
it ran - and the graph drawn is the one it ran, not the workflow as edited since.
A node is not then debugged against wording it never had. Whether a run is older
is decided when it starts: a run of what was newest at the time is not made old
by edits made afterwards.

Runs are carried out by Temporal, so a run that fails part-way is retried
according to the workflow's settings rather than silently lost. Administrators
can open the underlying Temporal workflow from the run page and from Monitoring.
