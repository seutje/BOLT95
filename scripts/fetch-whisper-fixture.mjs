import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const revision = "23ee03506a91ac3d3f0071b40e66a430eebdfa1d";
const expectedSha256 = "59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e";
const url = `https://raw.githubusercontent.com/ggml-org/whisper.cpp/${revision}/samples/jfk.wav`;
const response = await fetch(url);
if (!response.ok) throw new Error(`Fixture download failed with HTTP ${response.status}`);

const bytes = new Uint8Array(await response.arrayBuffer());
const digest = createHash("sha256").update(bytes).digest("hex");
if (digest !== expectedSha256) {
  throw new Error(`Fixture SHA-256 mismatch: ${digest}`);
}

const output = resolve(import.meta.dirname, "../public/fixtures/generated/jfk.wav");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, bytes);
console.log(`Verified public-domain fixture: ${bytes.length} bytes, ${digest}`);
