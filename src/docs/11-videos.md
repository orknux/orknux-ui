# Videos

**Design › Videos** makes short videos from a description, with a video model
the workspace has. It is for the moving pictures a support team actually needs -
a few seconds of a product turning for a release note, a looping banner for the
help centre, a calm background for a status page - not for editing film. A
video is made by the model's server, followed here while it is made, kept with
the workspace's files, and played, upscaled or exported from its page.

## What makes a video

A video comes from a model of the kind **Video**, added under **Models** like
any other. Two kinds of server make one:

- **stable-diffusion.cpp's server** with a video model loaded - Wan 2.x and the
  other video families it runs. A provider of the type **stable-diffusion.cpp**,
  or an **OpenAI** provider pointed at such a server, which is recognised by
  asking it when the provider is saved.
- **A server that serves OpenAI's `/videos`**, through an **OpenAI** or **Azure
  OpenAI** provider. OpenAI's own video API was shut down in September 2026, so
  this is for a server that still answers that shape.

Any other provider type is refused in a sentence before anything is asked of it.
A workspace with no video model says so on the Videos page, with **Add a video
model in Models** beside it.

## The Videos page

![Design › Videos: each video with its first frame, its prompt and its length,
and one still being made, with how far it has got](/screens/videos.png)

The page lists every video made in the workspace, newest first, each with its
first frame, its prompt, the model that made it, how long it plays and where it
stands - **Made**, **Queued**, **Making…** with how far it has got, or **Not
made**. A video being made shows its progress in place of a frame.
**Search videos...** finds one by the words of its prompt or its name. A video
opens on its own page, where it plays; **+ New video** starts one.

## Making a video

![A new video: the prompt, the video model and the settings that model takes,
before Generate](/screens/video-new.png)

1. **+ New video** opens the video editor with nothing in it.
2. Write what the video should show under **Prompt**: what is in the frame,
   what moves, and how the camera moves, in a sentence or two.
3. Choose the **Model**. The settings below it are the ones that model takes,
   asked of its server, and nothing else - each empty field shows the model's
   own default, which is what is used if it is left alone:
   - From **stable-diffusion.cpp**: **Size** as width and height, **Frames**,
     **Frames per second** and **Seed**. The length is frames divided by
     frames a second - 64 frames at 16 a second is four seconds. **Seed** is the
     number the noise the video starts from is drawn with: the same seed,
     prompt and settings make the same video again, and another seed makes
     another take of it. An image-to-video model also offers **Start from a
     picture** (below); a text-to-video one does not, because it would ignore
     it.
   - From **OpenAI's `/videos`**: **Length (seconds)** and **Size**, from the
     choices that API takes.
4. **Generate** queues it. The page follows it from there: a bar with how far
   the server says it has got, and under it how long it has taken and roughly
   how long is left - "1:12 elapsed · about 2 min left". The time left is worked
   out from the progress the server reports and nothing else, so it says
   **Estimating…** until there is enough of it, and only the time taken where
   the server reports none. stable-diffusion.cpp counts only its sampling steps;
   the decoding after them is **Finishing…**.

The editor can be left while a video is made; it goes on, survives a reload of
the page and a restart of the server, and is on the Videos page when it is
done. **Stop** stops one that is waiting or being made, and keeps nothing of it.

### Starting from a picture

With an image-to-video model, **Start from a picture** takes a picture as the
first frame - **Choose a picture** offers the workspace's pictures - and the
video moves on from it. The quickest way there is from the picture itself: on
a picture in **Images**, or in the image editor's bar, **Convert to video**
opens the video editor with that picture already chosen. The image editor asks
first where the picture has changes not yet saved.

### What limits a video

Admin › Settings › Limits holds the numbers that decide how video making
behaves for the whole installation:

| Setting | Default | What it does |
|---|---|---|
| How often a video being made is asked about | 5 seconds | Each ask is one request to the video's server; the progress moves this often |
| How long one video may take | 120 minutes | A video not made after this is given up on, and said to have failed |
| The largest video kept | 200 MB | A larger one is not collected from its server, and fails |

## A finished video

![A finished video's page: the player, and Upscale, Download, Export and Remove
along the top, Export's formats open](/screens/video.png)

A finished video's page plays it, with its prompt, its model and its settings
beside it and how long it plays. Along the top:

- **Download** saves the video as the server made it.
- **Export** converts it on the server and downloads it, named after the video:
  - **GIF** - a moving picture, without its sound; at most 15 frames a second
    and 480 pixels wide, a larger video made smaller to fit, in a palette made
    from the video itself so a gradient does not band.
  - **MP4** - with its sound, for nearly any player.
  - **MKV** - with its sound, in a Matroska file.

  An export that takes longer than five minutes or comes to more than 200 MB is
  stopped and refused. The newest eight are kept for a while, so asking for the
  same video in the same format again does not convert it again. All of these
  are under Admin › Settings › Limits; each export is in the audit log.
- **Upscale** makes the video larger, as a new version beside the original; see
  below.
- **Remove** takes the video off the page, its file with it.
- **New** starts another.

### Upscaling a video

**Upscale** opens the same dialog the image editor uses: an **Upscale** model -
a Stable Diffusion WebUI's, see Images - its **Algorithm**, and a **Scale** of
1.5 to 4 times. Every frame goes through the WebUI a batch at a time and is put
back together at the same frame rate with the original's sound; the page counts
frames done of all while it works ("Upscaling… 120 of 240 frames"), and the
new version says which video it was upscaled from. It waits in the same queue as
pictures, under the same **Images drawn at once**.

Two limits apply: **Most frames sent in one upscale call** (8 - more is fewer
calls and a larger request each) and **The longest side of an upscaled video**
(3840 pixels - an upscale that would come to more is refused before it starts).

## Videos in a chat

A video attached to a chat message plays under it. Whether the model is shown
the video itself is up to the model's page: **Takes video** sends it with the
message, and is offered only where the server can take one - a llama.cpp server
or another OpenAI-compatible endpoint such as vLLM with a Qwen-VL model - never
for OpenAI, Azure OpenAI, Ollama or Anthropic. A video sent to a model without
it, or one over Admin › Settings' **Video Attachment Limit** (20 MB), is refused
in a sentence before the model is asked. The video goes with its own message
only, not again with every turn after it.
