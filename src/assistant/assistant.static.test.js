import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Static guards for the "no keys, no network, no logging, untrusted content" requirements.
const dir = fileURLToPath(new URL("./", import.meta.url));
const srcDir = fileURLToPath(new URL("../", import.meta.url));
const files = [
  ...readdirSync(dir).filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\.js$/.test(f)).map((f) => join(dir, f)),
  join(srcDir, "route.js"), join(srcDir, "Root.jsx"), join(srcDir, "main.jsx"),
];
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const sources = new Map(files.map((f) => [f.slice(srcDir.length), stripComments(readFileSync(f, "utf8"))]));

function forbid(pattern, description, allowIn = []) {
  for (const [name, code] of sources) {
    if (allowIn.some((a) => name.endsWith(a))) continue;
    assert.doesNotMatch(code, pattern, `${description}: found in ${name}`);
  }
}

test("the assistant has files to check", () => {
  assert.ok(sources.size >= 10);
  for (const name of ["assistant/AssistantApp.jsx", "assistant/extractor.js", "assistant/storage.js", "assistant/format.js"]) assert.ok(sources.has(name), name);
});

test("no network access of any kind: the pasted text cannot leave the browser", () => {
  forbid(/\bfetch\s*\(/, "fetch");
  forbid(/XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.share|\bimport\s*\(\s*["'`]https?:/, "network API");
  forbid(/https?:\/\//, "hard-coded URL");
  forbid(/\bimport\b[^;\n]*(taskApi|taskSync|entraBrowserAuth)/, "backend/auth client import");
  forbid(/\bimport\b[^;\n]*server\//, "server module import");
});

test("no API keys, secrets, tokens or environment-based configuration in browser code", () => {
  forbid(/api[_-]?key|secret|bearer|authorization|password|credential|import\.meta\.env|process\.env|VITE_/i, "secret-like identifier");
});

test("no logging of messages or tasks", () => {
  forbid(/\bconsole\s*\./, "console output");
  forbid(/\bdebugger\b|alert\s*\(|prompt\s*\(|confirm\s*\(/, "debug or blocking dialogs");
});

test("untrusted text is never turned into HTML or code", () => {
  forbid(/dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser/, "HTML sink");
  forbid(/\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*["'`]|setInterval\s*\(\s*["'`]/, "code evaluation");
  forbid(/\bhref\s*=\s*\{/, "dynamic link target");
  forbid(/window\.open|location\.(href|assign|replace)\s*=/, "navigation from content");
});

test("browser storage is only touched by the storage module, and only for confirmed tasks", () => {
  forbid(/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./, "storage access", ["assistant/storage.js"]);
  const storage = sources.get("assistant/storage.js");
  assert.doesNotMatch(storage, /sessionStorage|indexedDB|document\.cookie/);
  assert.equal((storage.match(/\.setItem\(/g) || []).length, 2, "one write plus the availability probe");
  const app = sources.get("assistant/AssistantApp.jsx");
  assert.match(app, /taskStorage\.save\(/);
  assert.doesNotMatch(app, /taskStorage\.save\([^)]*state\.text/, "the pasted text is never passed to storage");
});

test("the extraction limits and demo labelling are the specified ones", async () => {
  const { MAX_MESSAGE_CHARS, createDemoExtractor } = await import("./extractor.js");
  assert.equal(MAX_MESSAGE_CHARS, 2500);
  const demo = createDemoExtractor();
  assert.equal(demo.isDemo, true);
  assert.match(demo.label, /not AI/);
  const app = sources.get("assistant/AssistantApp.jsx");
  assert.match(app, /state\.extraction\.extractorLabel/, "results are labelled with the extractor that produced them");
  assert.match(app, /not an AI model/);
});

test("the backend and the existing school demo are untouched by the assistant", () => {
  for (const [name, code] of sources) {
    if (!name.startsWith("assistant/")) continue;
    assert.doesNotMatch(code, /from\s+["']\.\.\/App\.jsx["']|\/api\/|\/auth\//, `${name} must not use the legacy app or backend routes`);
  }
});
