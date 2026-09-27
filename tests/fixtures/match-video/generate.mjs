/**
 * Regenerates the committed media fixtures in this directory.
 *
 *   node tests/fixtures/match-video/generate.mjs
 *
 * The fixtures are OWNED: nothing here is downloaded, and no third-party video
 * is committed. Each clip is synthesised — a 64x64 gradient that shifts every
 * frame, so the encoder cannot collapse it to one keyframe and the resulting
 * sample table is realistic — then muxed by the same Mediabunny build the
 * inspector parses with. They stay a few hundred kilobytes precisely because
 * they live in git.
 *
 * Encoding needs WebCodecs, which exists in a browser and not in Node, so the
 * work runs inside Playwright's Chromium against a localhost page (WebCodecs
 * requires a secure context; `about:blank` does not qualify). Playwright is
 * already this repo's test runner, so this adds no dependency.
 *
 * The set is chosen to cover what the inspector must distinguish:
 *
 *   h264-faststart.mp4  ordinary MP4, metadata at the front
 *   h264-tail.mp4       same media, `moov` at the END — the layout that breaks
 *                       any parser that only reads the head of a file
 *   h264.mov            QuickTime, the container iPhones actually produce
 *   vp9.webm            WebM
 *   vp9.mkv             Matroska (not WebM: a different reader path)
 *   audio-only.webm     readable container, no video track
 *
 * H.264 is used where the container allows it because that is what a phone
 * exports; VP9 is used for the Matroska pair because that is what those
 * containers carry in practice.
 */

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const MEDIABUNNY = resolve(
  REPO,
  "node_modules/mediabunny/dist/bundles/mediabunny.mjs",
);

const PAGE = `<!doctype html><meta charset="utf-8"><title>fixture generator</title>`;

/** Runs in the browser. Returns `{ name: number[] }` of finished file bytes. */
async function build() {
  const {
    Output,
    BufferTarget,
    Mp4OutputFormat,
    MovOutputFormat,
    MkvOutputFormat,
    WebMOutputFormat,
    VideoSampleSource,
    AudioBufferSource,
    VideoSample,
  } = window.MB;

  const WIDTH = 64;
  const HEIGHT = 64;
  const FPS = 30;
  const FRAMES = 60; // exactly 2.000 s of media

  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  /** A frame whose content changes every time, so inter-frame coding is real. */
  function paint(index) {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, `hsl(${(index * 6) % 360} 80% 55%)`);
    gradient.addColorStop(1, `hsl(${(index * 6 + 140) % 360} 80% 25%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#fff";
    ctx.fillRect((index * 3) % WIDTH, 4, 8, 8);
  }

  async function video(format, codec) {
    const output = new Output({ format, target: new BufferTarget() });
    const source = new VideoSampleSource({ codec, bitrate: 200_000 });
    output.addVideoTrack(source, { frameRate: FPS });
    await output.start();
    for (let i = 0; i < FRAMES; i++) {
      paint(i);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i / FPS) * 1e6),
        duration: Math.round((1 / FPS) * 1e6),
      });
      await source.add(new VideoSample(frame));
      frame.close();
    }
    await output.finalize();
    return Array.from(new Uint8Array(output.target.buffer));
  }

  async function audioOnly() {
    const rate = 48_000;
    const context = new OfflineAudioContext(1, rate * 2, rate);
    const buffer = context.createBuffer(1, rate * 2, rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
      channel[i] = Math.sin((i / rate) * 440 * 2 * Math.PI) * 0.2;
    }
    const output = new Output({
      format: new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const source = new AudioBufferSource({ codec: "opus", bitrate: 32_000 });
    output.addAudioTrack(source);
    await output.start();
    await source.add(buffer);
    await output.finalize();
    return Array.from(new Uint8Array(output.target.buffer));
  }

  return {
    "h264-faststart.mp4": await video(
      new Mp4OutputFormat({ fastStart: "in-memory" }),
      "avc",
    ),
    "h264-tail.mp4": await video(
      new Mp4OutputFormat({ fastStart: false }),
      "avc",
    ),
    "h264.mov": await video(new MovOutputFormat({ fastStart: false }), "avc"),
    "vp9.webm": await video(new WebMOutputFormat(), "vp9"),
    "vp9.mkv": await video(new MkvOutputFormat(), "vp9"),
    "audio-only.webm": await audioOnly(),
  };
}

const bundle = await readFile(MEDIABUNNY, "utf8");

const server = createServer((req, res) => {
  if (req.url === "/mediabunny.mjs") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(bundle);
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(PAGE);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on("console", (message) => console.log(`[page] ${message.text()}`));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.addScriptTag({
    type: "module",
    content: `import * as MB from "/mediabunny.mjs"; window.MB = MB; window.__ready = true;`,
  });
  await page.waitForFunction(() => window.__ready === true);

  const files = await page.evaluate(build);
  for (const [name, bytes] of Object.entries(files)) {
    const data = Buffer.from(bytes);
    await writeFile(resolve(HERE, name), data);
    console.log(`${name}: ${data.byteLength} bytes`);
  }
} finally {
  await browser.close();
  server.close();
}
