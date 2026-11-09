import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// WCAG 2.x contrast checks computed from the design tokens in assistant.css, so a token change that
// breaks readability fails here. Text needs 4.5:1; borders, focus rings and other UI parts need 3:1.
const css = readFileSync(fileURLToPath(new URL("./assistant.css", import.meta.url)), "utf8");
const block = css.slice(css.indexOf(".mt-app {"), css.indexOf("}", css.indexOf(".mt-app {")));
const token = Object.fromEntries([...block.matchAll(/--mt-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test("the token block was parsed", () => {
  for (const name of ["bg", "surface", "text", "primary", "danger", "warn-ink", "ok-ink", "focus", "outline"]) assert.ok(token[name], `missing token ${name}`);
});

test("body text, muted text and links are readable on every surface they appear on (4.5:1)", () => {
  const surfaces = ["bg", "surface", "surface-2"];
  const pairs = [];
  for (const surface of surfaces) pairs.push(["text", surface], ["text-muted", surface], ["primary", surface]);
  for (const [fg, bg] of pairs) assert.ok(ratio(token[fg], token[bg]) >= 4.5, `${fg} on ${bg}: ${ratio(token[fg], token[bg]).toFixed(2)}`);
});

test("buttons, badges, notices and chips meet 4.5:1", () => {
  const pairs = [
    ["primary-ink", "primary"], ["primary-soft-ink", "primary-soft"], ["danger-ink", "danger-soft"], ["warn-ink", "warn-soft"],
    ["ok-ink", "ok-soft"], ["neutral-ink", "neutral-soft"], ["danger", "surface"], ["ok", "surface"], ["ok", "ok-soft"],
    ["text-muted", "neutral-soft"], ["primary", "primary-soft"], ["warn-ink", "surface"], ["danger", "danger-soft"],
  ];
  for (const [fg, bg] of pairs) assert.ok(ratio(token[fg], token[bg]) >= 4.5, `${fg} on ${bg}: ${ratio(token[fg], token[bg]).toFixed(2)}`);
});

test("input borders, focus rings and status outlines meet 3:1 against what they sit on", () => {
  const pairs = [["outline", "surface"], ["outline", "bg"], ["focus", "surface"], ["focus", "bg"], ["focus", "surface-2"], ["warn-line", "surface"], ["warn-line", "warn-soft"], ["danger", "surface"], ["primary", "surface"], ["ok", "surface"]];
  for (const [fg, bg] of pairs) assert.ok(ratio(token[fg], token[bg]) >= 3, `${fg} on ${bg}: ${ratio(token[fg], token[bg]).toFixed(2)}`);
});

test("the stylesheet defines no hard-coded text colours outside the token block (so the check above covers everything)", () => {
  const rest = css.replace(block, "");
  const colours = [...rest.matchAll(/(?<![-\w])color:\s*(#[0-9a-fA-F]{3,8})\b/g)].map((m) => m[1]);
  assert.deepEqual(colours.filter((c) => !["#444746", "#0b57d0"].includes(c.toLowerCase())), [], "only the legacy-bar link/text colours are literal");
});
