/**
 * Group A of the manual (#684): what the Images, Videos and desktop chapters
 * photograph.
 *
 * - A stable-diffusion.cpp server - the stand-in, reached as `127.0.0.1` so it
 *   answers as one (see ../../../scripts/screens-draw/a-design-media.mjs) -
 *   with an image model, "Studio pictures", which takes a negative prompt, and
 *   a video model, "Harbour reels".
 * - A Stable Diffusion WebUI - the stand-in under `/webui` - with an Upscale
 *   model, so Upscale, Clean up and Harmonize are offered in the editor.
 * - Northwind's pictures: newsletter banners and product shots, drawn by that
 *   model through the queue the editor uses, so they are numbered and timed as
 *   a person's would be.
 * - A finished video, made the way the Videos page makes one.
 */

const ENDPOINT = process.env.ORKNUX_DEMO_IMAGE_ENDPOINT ?? '';

/** The same stand-in, under the name only this group's providers use. */
const asStableDiffusionCpp = (endpoint) => endpoint.replace('://localhost', '://127.0.0.1');

export const PICTURES = [
  {
    name: 'Spring sale banner',
    prompt: 'A wide banner of a quiet harbour town in spring, pastel houses along the water, morning light, room for a headline on the left',
    negative: 'text, letters, watermark, people',
    size: '1536x640',
  },
  {
    name: 'Headset on the desk',
    prompt: 'A product photograph of a black wireless headset on a light oak desk, soft window light, shallow depth of field',
    negative: 'cables, clutter, hands',
    size: '1024x1024',
  },
  {
    name: 'Help centre header',
    prompt: 'Rolling green hills under a calm blue sky, a single path winding towards a lake, for the top of the help centre',
    negative: 'buildings, text',
    size: '1536x640',
  },
  {
    name: 'Winter mailing hero',
    prompt: 'A frozen lake at dusk under a violet sky, pine forest on the far shore, a warm glow from a cabin window',
    negative: 'people, text',
    size: '1280x720',
  },
  {
    name: 'Autumn newsletter',
    prompt: 'An autumn valley at sunset, orange and red trees reflected in a still river, mist over the water',
    negative: 'text, watermark',
    size: '1280x720',
  },
  {
    name: 'Night support shift',
    prompt: 'A coastal town at night under a full moon, a calm sea, lights along the harbour wall, for the night-shift rota',
    negative: 'people',
    size: '1280x720',
  },
  {
    name: 'Summer webinar card',
    prompt: 'A bright summer coastline at noon, sailing boats on a deep blue sea, white clouds over green hills',
    negative: 'text',
    size: '1024x1024',
  },
  {
    name: 'Status page backdrop',
    prompt: 'A misty mountain range at dawn, layers of blue ridges fading into the distance, very calm and minimal',
    negative: 'text, people',
    size: '1536x640',
  },
];

/** The finished videos, oldest first; the Videos page shows them newest first. */
const VIDEOS = [
  {
    name: 'Release note loop',
    prompt: 'A calm loop of a lake at noon, sailing boats drifting slowly, for the top of the October release note',
  },
  {
    name: 'Status page background',
    prompt: 'Mist drifting over blue mountain ridges at dawn, very slow and calm, for the status page background',
  },
  {
    name: 'Harbour at golden hour',
    prompt: 'A slow pan along a fishing harbour at golden hour, boats rocking on calm water, warm light over the hills',
  },
];

export async function seed(ctx) {
  const { gql, ws, log } = ctx;
  if (ENDPOINT === '') throw new Error('a-design-media needs ORKNUX_DEMO_IMAGE_ENDPOINT, the stand-in it draws with');

  const { createModelProvider: studio } = await gql(
    'mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }',
    { input: { workspaceId: ws, name: 'Studio server', endpoint: asStableDiffusionCpp(ENDPOINT), type: 'STABLE_DIFFUSION_CPP' } },
  );
  const { createModel: pictures } = await gql(
    'mutation($input: CreateModelInput!) { createModel(input: $input) { id } }',
    { input: { providerId: studio.id, name: 'Studio pictures', modelId: 'sdxl-lightning', kind: 'IMAGE', imageCostPerImage: 0 } },
  );
  const { createModel: reels } = await gql(
    'mutation($input: CreateModelInput!) { createModel(input: $input) { id } }',
    { input: { providerId: studio.id, name: 'Harbour reels', modelId: 'wan2.2-ti2v-5b', kind: 'VIDEO' } },
  );
  log(`stable-diffusion.cpp provider ${studio.id}: pictures ${pictures.id}, video ${reels.id}`);

  const { createModelProvider: webui } = await gql(
    'mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }',
    { input: { workspaceId: ws, name: 'Retouch WebUI', endpoint: `${ENDPOINT}/webui`, type: 'STABLE_DIFFUSION_WEBUI' } },
  );
  const { createModel: upscaler } = await gql(
    'mutation($input: CreateModelInput!) { createModel(input: $input) { id } }',
    { input: { providerId: webui.id, name: 'Sharpen 4x', modelId: 'R-ESRGAN 4x+', kind: 'UPSCALE' } },
  );
  log(`Stable Diffusion WebUI ${webui.id}: upscale model ${upscaler.id}`);

  // Through the queue the editor uses, one after another as a person would ask, so each is numbered and timed.
  const asked = [];
  for (const picture of PICTURES) {
    const { queueDesignImage: job } = await gql(
      'mutation($input: DrawDesignImageInput!) { queueDesignImage(input: $input) { id } }',
      {
        input: {
          workspaceId: ws,
          modelId: pictures.id,
          prompt: picture.prompt,
          negativePrompt: picture.negative,
          size: picture.size,
          name: picture.name,
        },
      },
    );
    asked.push(job.id);
  }
  const deadline = Date.now() + 180_000;
  for (;;) {
    const { designImageQueue: queue } = await gql(`query { designImageQueue(workspaceId: ${ws}) { id status reason } }`);
    const mine = queue.filter((job) => asked.includes(job.id));
    const failed = mine.find((job) => job.status === 'FAILED');
    if (failed) throw new Error(`a seeded picture was not drawn: ${failed.reason}`);
    if (mine.every((job) => job.status === 'DRAWN' || job.status === 'STOPPED') || mine.length === 0) break;
    if (Date.now() > deadline) throw new Error(`seeded pictures still ${mine.map((job) => job.status).join(', ')} after three minutes`);
    await new Promise((done) => setTimeout(done, 1500));
  }
  log(`${PICTURES.length} pictures drawn`);

  // One after another, as the queue makes them, so each is waited for on its own.
  for (const asked of VIDEOS) {
    const { queueDesignVideo: video } = await gql(
      'mutation($input: QueueDesignVideoInput!) { queueDesignVideo(input: $input) { id } }',
      { input: { workspaceId: ws, modelId: reels.id, frames: 64, fps: 16, width: 832, height: 480, ...asked } },
    );
    const until = Date.now() + 180_000;
    for (;;) {
      const { designVideo: now } = await gql(`query { designVideo(workspaceId: ${ws}, id: ${video.id}) { status reason } }`);
      if (now.status === 'DONE') break;
      if (now.status === 'FAILED' || now.status === 'STOPPED') throw new Error(`the seeded video ${asked.name} was not made: ${now.reason}`);
      if (Date.now() > until) throw new Error(`the seeded video ${asked.name} still ${now.status} after three minutes`);
      await new Promise((done) => setTimeout(done, 2000));
    }
    log(`video ${video.id} made: ${asked.name}`);
  }
}
