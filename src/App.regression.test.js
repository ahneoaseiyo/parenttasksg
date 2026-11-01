import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

test("parent checklist has child filters and task groups", () => {
  assert.match(source, /aria-label="Filter by child"/);
  assert.match(source, /selectedChild==="all"\|\|t\.child===selectedChild/);
  assert.match(source, /\["Tomorrow",\[\]\],\["Other upcoming",\[\]\],\["Completed",\[\]\]/);
});

test("task completion is accessible and consent cannot be marked done directly", () => {
  assert.match(source, /aria-pressed=\{done\}/);
  assert.match(source, /disabled=\{task\.category==="Consent form"\}/);
  assert.match(source, /t\.category!=="Consent form"/);
});

test("consent preview cannot claim server submission or auto-complete a task", () => {
  const consent = source.split("function ConsentFormScreen(")[1].split("// ──")[0];
  assert.match(consent, /Demo consent preview only/);
  assert.match(consent, /No consent was sent or recorded/);
  assert.doesNotMatch(consent, /onSign\(task\.id\)/);
  assert.doesNotMatch(consent, /setTimeout\(/);
  assert.doesNotMatch(consent, /Consent form submitted!/);
});

test("consent date is computed rather than hardcoded", () => {
  assert.match(source, /const today = new Date\(\)\.toLocaleDateString/);
});
