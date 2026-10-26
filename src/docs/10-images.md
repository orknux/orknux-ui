# Images

**Design**, in the top bar, is where the workspace's own pictures, documents,
wireframes and videos are made and kept:

- **Images** - every picture a model drew in the workspace, and an image editor
  to draw new ones and change them. This chapter.
- **Documents** - pages written and laid out here, with an agent beside them.
- **Wireframes** - the screens of something being designed, drawn in pencil.
- **Videos** - short videos made by a video model; see Videos.

A picture reaches Images however it was drawn: in a chat, by an agent's drawing
tool, by an image node in a workflow, by a task, or here. So the Images page is
also the one place to find the banner a task drew last Tuesday.

## The Images page

![Design › Images: the workspace's pictures as a gallery, one still being drawn
with Stop beside it](/screens/images.png)

**Design › Images** shows every picture as a gallery that keeps loading as it is
scrolled, newest first. **Search images...** finds pictures by the words of
their prompt or their name.

A picture asked for and not yet drawn is in the gallery too, marked: **Queued**,
with how many are ahead of it, or **Drawing…**. **Stop** beside it stops it -
one waiting is taken out of the queue, one being drawn is abandoned, and a
Stable Diffusion WebUI is asked to interrupt it. A picture that could not be
drawn says **Not drawn** with the server's reason.

A picture clicked opens beside the gallery, which goes on scrolling down its
left: the picture, its **Prompt**, **From** - the chat, run or task that drew it
- and what drew it: **Model**, **Size**, **Quality** and **Style** where the
model has them, **Drawn by** and **When**. Beside it:

- **Open in editor** opens it in the image editor.
- **Convert to video** starts a video from it, with the picture as the first
  frame; see Videos.
- **Remove this picture** deletes it, from the list and from the disk.

A picture with changes not yet saved is marked **Draft** in the gallery, and
shows the draft; see Changes are a draft, below.

**Open in Design** is also on any picture on the workspace's **Artifacts** page:
it opens the picture in the image editor, wherever it came from.

## Drawing a picture

![A new picture: the prompt and a negative prompt typed, the image model chosen
and its size set, before Generate](/screens/image-new.png)

**+ New image** opens the image editor with nothing on its canvas, and the
drawing panel on the right:

1. **Prompt** - what the picture should be of. The longest prompt the
   installation takes is **Longest image prompt** in Admin › Settings (2000
   characters); a longer one is refused in words before the model is asked.
2. **Negative prompt** - what the picture must not contain: "text, watermark,
   people". It is offered only where the model's server takes one -
   stable-diffusion.cpp's server, and a Stable Diffusion WebUI for Harmonize -
   and not for a model on OpenAI's API, which takes none and refuses one sent
   anyway. Left empty, the model's own default is used, shown greyed in the
   box; that default is set on the model's page.
3. **Model** - one of the workspace's image models, named with its provider.
   The link beside the label opens the model in a new tab. A workspace with
   none says **This workspace has no image model**, with **Add an image model in
   Models**.
4. What that model takes, and only that: **Size** as width and height - with a
   **Preset…** list where the model offers named sizes - and **Quality** and
   **Style** for a model that has them. **Model default** leaves a choice to the
   model.
5. **Generate**.

**Generate does not wait.** The picture is queued and drawn behind the editor,
so several can be asked for in a row and the editor can be left: each waits in
the gallery, marked, and opens in the editor from there. How many are drawn at
the same time is **Images drawn at once** in Admin › Settings - one, unless it
is changed, which suits a local image server that draws one at a time anyway.

**Naming it.** A picture is named after the first words of its prompt unless
it is given a name. Click the name in the editor's bar - or the pencil beside
it - to name it, before it is drawn or after.

### While it is drawn

The canvas says **Drawing…**, and how long it has taken and how long is left
where anything knows it: "0:42 elapsed · about 20 s left". A Stable Diffusion
WebUI says how far it is itself, and that is "about". A server that says
nothing - stable-diffusion.cpp, OpenAI - is estimated from how long the same
model's newest pictures of the same kind took ("estimated"); with too few of
those to go on, only the time taken is said. **Stop** beside it stops it, as
it does in the gallery.

### The pictures asked for here

Under the canvas, a strip holds every picture asked for in this editor, newest
on the left, each numbered in the order it was asked for - 1 the first. Click
one to show it. Pictures still being drawn show a spinner in the strip, and the
strip survives a reload.

## The image editor

![The image editor: the picture on the canvas, the tools down its left, the
drawing panel and the layers on the right, and the brush's options along the
top of the canvas](/screens/image-editor.png)

**Open in editor**, or **Edit**, opens a picture in the image editor. Its parts:

- **The bar along the top**: the picture's name; the **Magic** selection tools;
  **AI ▾**, what a model does with the whole picture (Upscale, Clean up,
  Harmonize); **Convert to video**; **Import ▾** and **Export ▾**; zoom
  (**−**, **Fit**, **+**, or Ctrl+= and Ctrl+-, or the mouse wheel); **Undo** and
  **Redo** (Ctrl+Z, Ctrl+Shift+Z); then **New**, **Discard**, **Save as copy**
  and **Save**.
- **The rail down the canvas's left**: the tools that change the picture in the
  browser, without a model - Rotate left and right, Flip horizontally and
  vertically, Brush, Crop, Blur - and Layers.
- **The canvas**, with a tool's options along its top while the tool is in use.
- **The panel on the right**: the prompt, model and settings a picture is
  drawn with, and under them the picture's **Layers**.

Every change is a step **Undo** takes back. Each tool's tooltip names its key.

## Changes are a draft until saved

Whatever is done to a picture - a Magic edit, a crop, a brush stroke, an
upscale - is kept as a **draft** and does not touch the picture until it is
saved. The bar shows **Draft** while there is one.

- **Save** (Ctrl+S) writes the changes over the picture, whatever drew it.
- **Save as copy** keeps them as a new picture and leaves this one as it was.
- **Discard** throws them away.
- **New** starts a blank picture; a picture with changes asks first.

A draft is kept when the editor is left, and through a restart of the server:
the picture is marked **Draft** in the gallery and opens with its changes. The
picture everybody else sees - in chats, on Artifacts, to an agent - is the one
last saved.

## Bringing a picture in, and taking it out

**Import ▾** offers **From a file…** - a PNG, JPEG, WebP or GIF, or an `.orkx`
archive - and **From Orknux…**, which searches the workspace's pictures by a
word: the ones on the Artifacts page, Design's own, and those runs, tasks and
agents drew or kept. The one chosen opens in the editor. A picture can also be
dropped on the canvas from the desktop, or pasted with Ctrl+V.

**Export ▾** downloads the picture as **PNG**, as **JPEG**, or as **Orknux
(.orkx)** - an archive of the picture with its name, prompt and parameters, which
imports back into Orknux as it was, layers included.

## Changing part of a picture: Magic edit

![A Magic edit: a rectangle selected over part of the picture, what to change
there typed, and a feather of 16 pixels, before Change](/screens/image-magic-edit.png)

A Magic edit redraws only the part of the picture that is selected, from what
you say should change there, and leaves every pixel outside it exactly as it
was.

1. Choose how to select, in the bar's **Magic** group: **Magic rectangle
   select** (M), **Magic lasso select** (L) for a shape drawn by hand, or **Magic
   select all** (Ctrl+A).
2. Drag over the picture. A box opens beside the selection.
3. Say **What to change here**: "add a small red sailing boat on the water".
4. **Edit model** is the image model asked; any of the workspace's.
5. **Feather** softens the selection's edge across that many of the picture's
   own pixels, so the redrawn part blends into the picture instead of leaving a
   seam. **0** is a hard edge; it starts at 8, set in Admin › Settings › Limits.
6. **Change** (or Enter). **Cancel** drops the selection.

The picture stays on the canvas while the change is drawn, the part being
redrawn highlighted. What comes back is a new version in the draft, so it can
be undone, saved or discarded like any other change. A model's change to a
picture with layers comes back as a layer of its own over them, holding only
the part that changed.

The change is asked of the model through the standard image-edit API, with a
**mask** that marks the area to change. Servers read a mask two ways - the
standard marks the area transparent, stable-diffusion.cpp reads white on black
- and a provider's **Edit mask** setting says which (see Image models and
providers, below). With the wrong one the server changes nothing, or
everything.

## Layers

![The Layers panel: three layers over the picture, one hidden, one chosen for
the brush](/screens/image-layers.png)

**Layers** in the rail (Shift+L) opens the picture's layers, under the drawing
panel. The picture itself is always at the foot; layers sit over it, the top of
the stack listed first.

- **New layer** adds an empty one over the others. A picture keeps at most 32,
  set in Admin › Settings › Limits.
- The layer chosen - click its row - is the one the **brush** and the **blur**
  work on.
- On each row, the pencil renames the layer (or double-click its name), the
  bin removes it, the dot shows or hides it - an empty circle is a layer
  hidden - and the arrows move it up and down the stack. A row can also be
  dragged.
- **Flatten** merges every layer into the picture. Nothing else does.

Every change to the layers is a step **Undo** takes back. A picture keeps its
layers - each one's pixels, name, place and whether it is shown - with every
version, through **Save** and in its `.orkx` archive, and opens with them again.
Its file, the one chats, agents, workflows and Artifacts see, is always the
layers flattened. An upscale makes every layer larger with the picture.

## Turning, mirroring and cropping

The top of the rail turns the picture a quarter **left** (Shift+R) or **right**
(R), and flips it **horizontally** (H) or **vertically** (V). Each is done in
the browser, without a model, and kept as a version of the draft, as a Magic
edit is.

![Crop: the part to keep selected, the rest dimmed, and its size said along the
top](/screens/image-crop.png)

**Crop** (C) selects the part to keep with a rectangle: drag it, and the rest of
the picture is dimmed and the bar says the size it will be. **Crop** - or Enter
- keeps it as a version; **Cancel** leaves the picture as it was.

## Painting with the brush

![The brush: its size, tips, colour, opacity and hardness along the top of the
canvas, and a stroke painted in yellow](/screens/image-brush.png)

**Brush** (B) paints over the picture by hand, or on the layer chosen. Along the
top of the canvas:

- **Size** - the width, in the picture's own pixels, so zooming does not change
  it. [ and ] make it narrower and wider. It starts at 12, set in Admin ›
  Settings › Limits.
- **Tip**:
  - **Hard** - a solid round stroke.
  - **Soft** - its edge fading out, by **Hardness**: 100% is as hard as **Hard**,
    lower fades across more of the width. It starts at 50%.
  - **Square** - a square stroke, for straight edges.
  - **Marker** - see-through, its own overlaps flat, darkening what it crosses,
    as a highlighter does. It starts at 50% opacity.
  - **Eraser** - paints transparency into a layer. It is off on the picture
    itself, which has nothing under it to show.
- **Colour** - any colour, from the browser's picker.
- **Opacity** - how solid each stroke is; 100% unless set, the marker's 50%.

A pen's pressure makes a stroke thinner where it is pressed lightly. Each stroke
is a step **Undo** takes back; **Apply** - or putting the brush down, or **Save**
- keeps the strokes as one version. **Cancel** throws them away.

## Blurring part of a picture

![The blur: Gradual chosen, a line drawn from sharp to blurred across the
picture, and its radius along the top](/screens/image-blur.png)

**Blur** (U) blurs part of the picture, without a model. Choose how along the
top of the canvas:

- **Rectangle** (1) or **Lasso** (2) - select the part to blur, and only the
  inside is blurred. **Falloff** fades the blur out towards the selection's
  edge across that many pixels; 0 is a hard edge.
- **Gradual** (3) - draw a line: the picture is sharp at its start and blurred
  at the full radius at its end, as a tilt-shift lens blurs. Both ends can be
  dragged afterwards. **Mirrored** blurs both ways from the start of the line,
  leaving a sharp band in the middle.

**Radius** is how strongly, in the picture's own pixels; it starts at 12. **Blur**
keeps it as a version; each part blurred is one.

## Upscale, Clean up and Harmonize

![The AI menu open on the editor's bar: Upscale, Clean up and
Harmonize](/screens/image-ai-menu.png)

**AI ▾** in the bar is what a model does with the whole picture. All three go
to a **Stable Diffusion WebUI** - AUTOMATIC1111, Forge or SD.Next, started with
its API on - through a provider of the type **Stable Diffusion WebUI** with an
**Upscale** model under it (see below). Without one, each is off and its hover
says so, with **Go to Models**.

![Upscale: the upscale model, the WebUI's algorithm, and how many times larger,
with the size it will come to](/screens/image-upscale.png)

- **Upscale** makes the picture larger. Choose the **Model**, the WebUI's
  **Algorithm** - the list is the WebUI's own, which differs with the models it
  has - and a **Scale** of 1.5, 2, 3 or 4 times; each says the size it will come
  to. The larger picture is a version of the draft, its layers made larger with
  it.
- **Clean up** takes out the blocks and speckle repeated edits leave, at the
  picture's own size. It goes the same way as Upscale at 1×, through the WebUI's
  restoration models - SCUNet and SwinIR, built into AUTOMATIC1111 and Forge, or
  FBCNN and 1× models such as 1x_JPEGDestroyer added to its models folder.
- **Harmonize** redraws the whole picture lightly, so the patches Magic edits
  left blend into one picture. Use it after a few edits, when their edges show.
  Choose the **Model**, the WebUI's **Checkpoint**, a **Prompt** - the picture's
  own to begin with - and the **Strength**: how much the picture may change. Low
  keeps it as it is and only smooths the seams; high redraws more of it. Start
  low. Clean up is for blocks and speckle; colour that drifted between patches
  is Harmonize's.

Each waits in the same queue as a picture being drawn, says how far it is, and
can be stopped. Admin › Settings holds where Harmonize's strength starts and the
size it redraws at - **Harmonize strength** and **Harmonize working size**; a
larger picture is scaled down to that size for the WebUI and back up after.

## Shortcuts

![Preferences: the image editor's own keys, each one changeable](/screens/image-shortcuts.png)


| Key | Does |
|---|---|
| R / Shift+R | Rotate right / left |
| H / V | Flip horizontally / vertically |
| B | Brush, picked up or put down |
| C | Crop |
| U | Blur |
| 1 / 2 / 3 | Blur with a rectangle / a lasso / gradually |
| [ / ] | Narrower / wider brush |
| Shift+L | Layers |
| M / L / Ctrl+A | Magic rectangle / lasso / select all |
| Ctrl+= / Ctrl+- | Zoom in / out |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S | Save |

Every one is a setting on **Preferences**, kept in the browser, and each tool's
tooltip names the key it answers to now. The image editor's own keys are heard
only on its canvas and never while typing, so a single letter is enough.

## Image models and providers

![A stable-diffusion.cpp provider's page, with its Edit mask setting](/screens/model-provider-images.png)

Pictures are drawn by a workspace's models of the kind **Image**, added under
**Models** as any model is. What can serve one:

- **stable-diffusion.cpp's server**, as a provider of the type
  **stable-diffusion.cpp** - local, and the one that takes a negative prompt.
  An **OpenAI** provider whose server turns out to be stable-diffusion.cpp's is
  recognised when it is saved, and saved as that type; one saved before this
  changes the next time it is saved.
- **Anything that answers OpenAI's image API** - OpenAI itself, Azure OpenAI, a
  FLUX edit server - as an **OpenAI** provider.
- **A Stable Diffusion WebUI**, as a provider of the type **Stable Diffusion
  WebUI**, for **Upscale** models only: what Upscale, Clean up and Harmonize use.
  Its model's **Model ID** is the algorithm it upscales with by default; its
  page lists the algorithms the WebUI offers.

A provider's **Edit mask** says how its server reads the area of a picture to
change in a Magic edit: **Transparent marks the change** (the standard) or
**White marks the change** (stable-diffusion.cpp). **The type's default** picks
the right one for the provider's type, and is what to leave it on unless a
server says otherwise.

An image model's page holds its default **Negative prompt**, used where a
drawing leaves its own empty, and its cost per picture for the usage report.

### What the installation allows

Admin › Settings, for every workspace:

| Setting | Default | What it does |
|---|---|---|
| Longest image prompt | 2000 characters | The longest description a picture is drawn from, anywhere |
| Images drawn at once | 1 | How many of Design's queued pictures are drawn at the same time |
| Harmonize strength | 0.3 | Where Harmonize's strength starts, between 0.05 and 0.9 |
| Harmonize working size | 1024 pixels | The longest side a picture is redrawn at by Harmonize |

And under **Limits**, where each of the editor's tools starts - the brush's
width (12), opacity (100%) and hardness (50%), the marker's opacity (50%), the
blur's radius (12) and falloff (0), the Magic edit's feather (8) and the most
layers a picture keeps (32) - with how often a WebUI is asked how far it is, and
how many of a model's newest pictures a time left is estimated from.
