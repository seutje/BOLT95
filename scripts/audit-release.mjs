import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const serviceWorker = read("public/sw.js");
assert(serviceWorker.includes("isModelUrl"), "service worker must explicitly exclude model URLs");
assert(/\/models\\\/\.\+\\\.bin/.test(serviceWorker), "model URL exclusion pattern is missing");
assert(!serviceWorker.includes("indexedDB"), "service worker must not touch IndexedDB");
assert(!serviceWorker.includes("opfs"), "service worker must not touch OPFS");
assert(!serviceWorker.includes("eval("), "service worker must not use eval");

const index = read("index.html");
assert(index.includes("manifest.webmanifest"), "index.html must link the PWA manifest");
assert(
  index.includes("connect-src 'self'"),
  "CSP must restrict network connections to same origin",
);

const packageJson = JSON.parse(read("package.json"));
assert(packageJson.scripts["release:audit"], "release:audit script must be present");

const builtManifest = resolve(root, "dist/config/models.json");
if (existsSync(builtManifest)) {
  const manifest = JSON.parse(read("dist/config/models.json"));
  for (const model of manifest.models) {
    if (!model.bundled) continue;
    const deployedModel = resolve(root, "dist/models", model.fileName);
    assert(existsSync(deployedModel), `${model.fileName} is missing from the built site`);
    assert(
      statSync(deployedModel).size === model.sizeBytes,
      `${model.fileName} does not match the registry byte size`,
    );
  }
}

console.log("release audit passed");
