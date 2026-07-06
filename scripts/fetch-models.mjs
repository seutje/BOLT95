import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "config/models.json"), "utf8"));
const requestedId = process.argv[2];
const models = requestedId
  ? manifest.models.filter((model) => model.id === requestedId)
  : manifest.models;

if (models.length === 0) {
  throw new Error(`Unknown model id: ${requestedId}`);
}

const outputDirectory = resolve(root, "public/models");
await mkdir(outputDirectory, { recursive: true });

for (const model of models) {
  const target = resolve(outputDirectory, model.fileName);
  const temporary = `${target}.partial`;
  const hash = createHash("sha256");
  let bytes = 0;

  try {
    const response = await fetch(model.url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed with HTTP ${response.status}`);
    }

    const source = Readable.fromWeb(response.body);
    source.on("data", (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    await pipeline(source, createWriteStream(temporary, { flags: "w" }));

    const digest = hash.digest("hex");
    if (bytes !== model.sizeBytes) {
      throw new Error(`Size mismatch for ${model.id}: ${bytes} != ${model.sizeBytes}`);
    }
    if (digest !== model.sha256) {
      throw new Error(`SHA-256 mismatch for ${model.id}: ${digest}`);
    }

    await rename(temporary, target);
    console.log(`Verified ${model.id}: ${bytes} bytes, ${digest}`);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
