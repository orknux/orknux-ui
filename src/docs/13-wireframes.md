# Wireframes

A wireframe is a sketch of a screen before anybody builds it: where the fields
go, what the button says, what happens on the next screen. It is drawn on
purpose in grey pencil - low fidelity - so a conversation about it stays on
what goes where rather than on colours and fonts. You draw one by hand, ask a
model to draw it, or both, and hand it on as a page, a picture or a vector file.

Wireframes live under **Design → Wireframes**.

## The wireframes list

![The wireframes list: each wireframe drawn small on its card](/screens/wireframes.png)

The list shows every wireframe in the workspace, each **drawn small on its
card**, so the one you want is found by how it looks. **Search wireframes**
narrows it by name. **+ New wireframe** makes an empty one and opens it; a
card's buttons open it in the editor, rename it, and remove it after asking.

A workspace copy does not carry wireframes, as it does not carry pictures.

## The wireframe editor

![The Customer portal wireframe: two phone screens side by side, a note about the design, and the Sign in button selected](/screens/wireframe-editor.png)

The editor is a grid that pans and zooms, with the tools down the left:

- **Select** picks things up: click one, Shift+click to add another, or drag
  across empty grid to take everything the box touches.
- **Pan** moves the view. Holding the space bar pans from any tool, the wheel
  pans too, and the wheel with Ctrl held zooms about the pointer.
- **Frame** is a screen - a phone, a page, a dialog - drawn as a titled outline
  the rest sit inside. Two frames side by side read as two screens of one flow,
  and the HTML export makes each frame a screen of its own.
- **Rectangle** is a card, an area, a block of anything.
- **Text** is words with no outline - a heading, a label, a line of copy.
- **Button**, **Input** (its words are the placeholder), **Checkbox**, **Radio
  button** and **Toggle switch** are the controls a form is made of. A checkbox,
  radio button or switch is ticked or on with a click on it while it is
  selected, or with **Checked** in the style panel.
- **Image placeholder** is a box with a cross, standing in for a picture; with a
  picture behind it, it draws the picture (see Pictures, below).
- **Line** and **Arrow** join things or point at them.
- **Sticky note** is a remark *about* the design rather than part of it - why a
  switch is on by default, what is still undecided.

Pick a tool and drag on the grid to draw. Double-click an element to type its
words where they are drawn. Drag an element to move it and its handles to resize
it; the arrow keys nudge the selection by a pixel, and Shift with an arrow by a
step of the grid. **Duplicate** (Ctrl+D) copies the selection beside itself,
**Delete** or the Delete key removes it, and **Undo** and **Redo** (Ctrl+Z,
Ctrl+Shift+Z) go back and forward over every change - a model's included.
**Zoom in**, **Zoom out** (Ctrl+= and Ctrl+-) and the percentage between them,
which **fits the drawing to the canvas** when clicked, are at the foot. Every one
of these keys can be changed under Preferences.

### Styling what is drawn

With elements selected, the style panel changes how they look. What it shows is
the first selected element's; a change is made to every one selected.

- **Fill** - a colour, **Gradient** (with its **Angle** and as many colour stops
  as you like: **Add stop**, **Remove stop**), or **None**.
- **Text colour**.
- **Border** - **Solid**, **Dashed**, **Dotted** or **None**, and its **Width**.
- **Radius** - how round the corners are.
- **Shadow** - **None**, **Small**, **Medium** or **Large**.
- **Checked**, for a checkbox, radio button or switch.

**Reset** takes every style off the selection, back to the pencil drawing.

### Pictures

**Import**, in the bar, puts a picture on the wireframe: **From a file…** or
**From Orknux…** - the workspace's Design pictures. It is placed as an image
element that draws the picture, fitted into the frame. An SVG that this editor
exported comes back in as a picture too. The SVG, PNG and HTML exports carry
the pictures with them.

How many elements one wireframe may hold is a limit under **Admin → Settings →
Limits**, 2000 unless it is changed.

## Drawing with an agent

![The wireframe's chat after asking for a ticket's own screen: the model's answer, and the new third screen drawn beside the list](/screens/wireframe-chat.png)

Down the right of the editor is a chat with a model of your choosing - **Model**
above the box lists the workspace's chat models. Describe a screen and it draws
**into the wireframe**: whole screens, a change to one element, a tidy-up. What
it draws is ordinary elements, edited by hand afterwards like anything else, and
each change it makes is one step **Undo** goes back over. An empty chat offers
starting points - a **Sign-in screen**, a **Landing page**, a **Dashboard**,
**Settings**, and **Polish this screen**, which aligns what is there to the
grid, evens out the spacing and labels every element.

Files go into the chat as in every editor: drop one, paste a picture, or pick
one with the paperclip; a picture goes to the model as a picture, and a text
file, a PDF, a CSV or a workbook as its text.

Agents elsewhere draw wireframes too, with the tools `orknux_wireframes`,
`orknux_wireframe`, `orknux_create_wireframe`, `orknux_change_wireframe` and
`orknux_draw_wireframe`. Asked for a **mockup** of a screen, a page or a form,
an agent draws a wireframe rather than a picture. When it draws one in a chat,
a grey picture of the wireframe is put in the chat above its answer, beside the
link that opens it in the editor - one picture per wireframe per turn, as it was
last drawn.

## Export

![The Export menu open in the wireframe editor: HTML, SVG and PNG](/screens/wireframe-export.png)

**Export** saves what is on the screen and downloads it, named after the
wireframe. Each format says on hover what it holds:

- **HTML** - one page, each frame a screen. The styles are inline and there is
  no script; buttons, fields, checkboxes and pictures are real HTML elements,
  so the page can be opened in any browser and clicked through as a first look.
- **SVG** - the drawing as drawn, as a vector picture, for a slide or a design
  tool.
- **PNG** - the drawing as drawn, as a picture.

An agent gets the HTML page with `orknux_wireframe_html`, with a link to
download it.

## Hosting it as a page

**Host page** beside Export gives the wireframe an address of its own: the HTML
page above, kept on the **Artifacts** page as a `SAVED-n`. Unlike an export,
it is not a copy taken once. **Every save writes the page again** - from the
editor, from the wireframe's chat, or from an agent drawing through the
`orknux_*` tools - so the address always shows the wireframe as it is saved,
and a rename renames the page too.

Once hosted the button reads **Hosted**, and its menu shows the address with
**Copy link**, **Open page** and **Stop hosting**. The address opens for anybody
who can see the workspace, the same as any artifact, and nothing on the page
runs. Stopping takes the page off the Artifacts page and leaves the wireframe;
deleting the wireframe takes its page with it. The page cannot be replaced with
another file from the Artifacts page, since the next save would write over it -
change the wireframe instead.

## Working on one together

Several people can have one wireframe open at once, as with documents and
diagrams. The editor shows **who else is there** beside its name, and each of
them has a **pointer** on the grid with their name on it.

**There is no Save button**: a change is saved a moment after you stop - the
pause is **Workflow Autosave** under **Admin → Settings** - and everybody else's
editor takes it in as it lands. **Unsaved** beside the name shows while a change
is waiting to go; Ctrl+S saves at once, and leaving with a change not yet saved
asks first.

When two people change the wireframe in the same moment, the changes are
**merged element by element**: each of you keeps the elements you changed, and
nothing either drew is lost. Only when you both changed the *same* element does
the later save decide how it looks.
