# Diagrams

A diagram is how the workspace draws what it knows: the systems and who calls
whom, a process with its decisions, the teams and what each owns. It is kept
beside the work rather than in a slide somebody exported once, and agents read
it - and keep it right - as well as people.

Diagrams live under **Explore → Diagrams**, beside Research.

## The diagrams list

![The diagrams list: the Architecture and Processes catalogs, each diagram with its description and what agents may do with it](/screens/diagrams.png)

Diagrams are filed in **catalogs**, down the left - Architecture, Processes,
whatever the workspace needs. **New catalog** makes one; its name can be changed
and an empty one deleted. **+ New diagram** makes an empty diagram in the
catalog you are in and opens it.

Each row is a diagram: its name, its **description** - what it is for, on one
line - its size, when it changed, and **Read only** where agents may not change
it (see A diagram's details, below). A click on its name opens the editor; the
pencil opens its settings page, where it is renamed; and its other buttons move
it to another catalog and remove it after asking.

**Search diagrams** looks inside the drawings, not only at their names: a word
in any shape's label or notes, on a connection, or in a description. Each hit
names the diagram and the shape it is on, and opens the editor **on that
shape**, selected.

**Quick actions** (Ctrl+Q) finds a diagram by its name and a shape by its label,
and opens the editor on it the same way.

## The diagram editor

![The Northwind support platform diagram: a group holding components and databases, a customer and an agent drawn as actors, and the ticket service selected with its notes in the panel](/screens/diagram-editor.png)

The editor is a canvas that pans and zooms, with the shapes in the bar above it
and a panel down the right.

### Shapes

The bar holds the shapes most drawings are made of - **Box**, **Rounded box**,
**Ellipse**, **Diamond**, **Note** and **Group** - and, where the window is wide
enough, the drawn shapes reached for most: **Database**, **Document**,
**Parallelogram**, **Hexagon**, **Cloud**, **Actor**, **Class** and
**Component**. A click puts one in the middle of the view.

![More shapes open: the flowchart shapes and the UML shapes, each drawn beside its name](/screens/diagram-more-shapes.png)

**More shapes**, the arrow at the end of the bar, holds all of them in two
groups, each drawn beside its name:

- **Flowchart** - Database (a store), Document, Hexagon (a preparation step),
  Parallelogram (input or output), Trapezoid (a manual step), Triangle and
  Cloud (something outside, a third party).
- **UML** - Actor (a person or an outside system), Class, Component, Package,
  Interface, Device (a machine or a node it runs on), and the Boundary,
  Control and Entity of a robustness diagram.

A **Class** is drawn with compartments: its first line is the class's name, and
a line holding only `--` starts the next compartment - attributes, then
operations. Actor, Interface, Boundary, Control and Entity are drawn as their
symbol with the label underneath.

A **Group** is a box other shapes sit in - a system, a team, a network. Drag a
shape into a group and it belongs to it, moving with it; drag it out and it no
longer does.

### Connecting

Hover a shape and its **handles** appear on its edges; drag from one to another
shape to connect them. A line ends on the shape's outline - a diamond's point,
an ellipse's curve - rather than at the box around it.

![A connection selected: the panel's Line style, At the start and At the end, each drawn beside its name](/screens/diagram-line.png)

Select a line and the panel's **Connection** section sets how it reads:

- **Label** - what the connection is: "writes", "REST", "pages".
- **Line style** - **Solid**, **Dashed** (optional, asynchronous, a UML
  dependency) or **Dotted** (weaker still).
- **At the start** and **At the end** - what each end is drawn with: **None**,
  **Arrow** (flows to, calls), **Open arrow** (depends on), **Triangle**
  (inherits from, implements), **Diamond** (aggregation: holds), **Filled
  diamond** (composition: owns) or **Circle** (an interface end, an optional
  link). Between them they draw every UML relation.

Each choice is drawn beside its name, so the right one is picked by eye. A line
drawn before these existed looks exactly as it did.

### Labels and notes

**Double-click** a shape's words or a connection - or press **Enter** or **F2**
with one selected - to type its label **where it is drawn**. Enter puts it
down, Escape puts the old one back, and it is one step undo goes back over.

The panel's **Node** section holds the selected shape's **Label**, **Shape** -
change a box to a database without drawing it again - **Colour**, and
**Notes**: what the box cannot say. Notes are where a diagram keeps what an
agent or a newcomer needs - limits, owners, why it is built this way - and they
are searched with everything else. A shape's notes hold up to 5000 characters,
counted as you type; the cap is a limit under **Admin → Settings → Limits**.

**Colour** is a row of pale swatches beside **No colour**, which takes it off,
and **Another colour** for any colour from the browser's picker; the ring at the
end of the row, **More colours**, adds a stronger row and a deep one under it,
and the editor remembers which way you left it.
The words on a shape are drawn light or dark to suit its colour, in the editor
and in every export.

### Arranging

- **Arrange** lays the whole drawing out, **Left to right** or **Top to
  bottom** - Ctrl+Shift+L for left to right, which Preferences can change.
- **Align** lines up the shapes selected: **Left edges**, **Centres**, **Right
  edges**, **Top edges**, **Middles** or **Bottom edges**.
- **Duplicate**, the **Delete** key, copy, cut and paste (Ctrl+C, Ctrl+X,
  Ctrl+V), and **Undo** and **Redo** work on the selection, as they do anywhere.
- **Delete** in the bar deletes the **whole diagram**: it asks first, naming it,
  and goes back to the list. Selected shapes and lines are taken off with the
  Delete key, never with the button.
- **Zoom in**, **Zoom out**, and the percentage between them, which **fits the
  drawing to the canvas** when clicked.

The panel is as wide as you drag its left edge, and the line between its
settings and the chat below them drags up or down; double-click either to put
it back. Both are remembered for you.

## A diagram's details

![A diagram's settings page: its name, description, catalog and what agents may do with it](/screens/diagram-settings.png)

At the top of the panel, the **Diagram** section holds its **Description** -
what this diagram is for, in a sentence or two - and **What agents may do with
it**. The same two are on the diagram's settings page, with its **Name** and
**Catalog** - the pencil on its row of the list - where **Save Changes** keeps
them and **Open Editor** goes to the drawing.

The description is shown on the list, and it is how an agent picks the right
diagram among many: agents read it, search it, and set it when they make one.
How long it may be is a limit under Admin → Settings → Limits.

**What agents may do with it** is one of two:

- **Read and change** - agents may search and read it, and change it when they
  learn something it lacks or has wrong. A new diagram starts here, so it is
  kept right as the agents learn.
- **Read only** - agents may search and read it, and not change it. Use it for
  a diagram that is a decision rather than a description: an agreed design, a
  signed-off process.

The editor's own chat changes the diagram open in it either way, because a
person is there asking.

## Drawing with an agent

![The diagram's chat after asking for the status page: the model's answer, and the new status page drawn and connected](/screens/diagram-chat.png)

Down the right, under the settings, is a chat with a model of your choosing -
**Model** above the box lists the workspace's chat models. Ask for a change and
it makes it **in the diagram**: shapes and connections added, changed and
removed in one save, each change one step **Undo** goes back over. It is told
the diagram's description, so it knows what the drawing is for. An empty chat
offers starting points - **Tidy this diagram** (label, connect and annotate
what is there), a **System landscape**, a **Process flow**, a **Team map** and
a **Decision tree**. Files go into the chat as in the other editors.

**Agents everywhere are sent to the diagrams.** Where a workspace has one and an
agent holds the diagram tools, the agent is told to search the diagrams before
answering how the workspace's systems, processes or architecture fit together,
to read a shape that looks relevant, and - on a diagram open to it - to update
it when it learns what is missing or wrong, saying what it changed. The tools
are `orknux_diagrams`, `orknux_diagram`, `orknux_diagram_node` (one shape's
notes whole, its group, and every connection with the shape at the other end),
`orknux_diagram_search`, `orknux_diagram_export`, `orknux_create_diagram` and
`orknux_change_diagram`; every agent with Orknux access has them. A change made
in a chat puts a picture of the diagram in the chat. `orknux_delete_diagram`
exists too and starts hidden on every agent - an owner turns it on agent by
agent, because a deleted diagram is everything drawn on it, gone.

## Export

![The Export menu open: PNG with its 1×, 2× and 3× scale, SVG, PDF, Mermaid and JSON](/screens/diagram-export.png)

**Export** downloads the drawing:

- **PNG**, at **1×**, **2×** or **3×** - so many pixels for each one drawn, up
  to 4096 wide. 2× is the default: sharp on a slide and in a document.
- **SVG** - the drawing as a vector picture, sharp at any size.
- **PDF** - the drawing on a page.
- **Mermaid** - the diagram as Mermaid text, for a README or a wiki page that
  draws Mermaid. Groups become subgraphs and each shape the nearest Mermaid
  shape; Mermaid has no diamond, triangle or open arrow at a line's end, so
  those come out as a plain arrow.
- **JSON** - the drawing itself, shapes and connections, for a script.

An agent exports with `orknux_diagram_export`, in the same formats, and can hand
the file on in a chat or save it as an artifact.

## Working on one together

Several people can have one diagram open at once, as with documents and
wireframes. The editor shows **who else is there** beside its name, and each of
them has a **pointer** on the canvas with their name on it, following the
drawing as you pan and zoom.

**There is no Save button**: a change is saved a moment after you stop - the
pause is **Workflow Autosave** under **Admin → Settings** - and everybody else's
editor takes it in as it lands. **Unsaved** beside the name shows while a change
is waiting to go; Ctrl+S saves at once, and leaving with a change not yet saved
asks first.

When two people change the diagram in the same moment, the changes are **merged
shape by shape**: each of you keeps the shapes and connections you changed, and
nothing either drew is lost. Only when you both changed the *same* shape does
the later save decide how it looks.
