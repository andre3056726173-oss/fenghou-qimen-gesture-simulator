import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSource = resolve(projectRoot, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmTarget = resolve(projectRoot, 'public/mediapipe/wasm');
const modelTarget = resolve(projectRoot, 'public/mediapipe/models/hand_landmarker.task');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

await mkdir(wasmTarget, { recursive: true });
await cp(wasmSource, wasmTarget, { recursive: true, force: true });

let modelExists = false;
try {
  const info = await stat(modelTarget);
  modelExists = info.size > 1_000_000;
} catch {
  modelExists = false;
}

if (!modelExists) {
  await mkdir(dirname(modelTarget), { recursive: true });
  process.stdout.write('Downloading MediaPipe hand landmarker model…\n');
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Model download failed: ${response.status} ${response.statusText}`);
  await writeFile(modelTarget, Buffer.from(await response.arrayBuffer()));
}

process.stdout.write('MediaPipe runtime assets are ready in public/mediapipe.\n');
