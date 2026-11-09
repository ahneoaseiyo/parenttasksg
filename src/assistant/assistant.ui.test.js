import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { SAMPLE_MESSAGE } from "./extractor.js";
import { PREFS_KEY, STORAGE_KEY, createPrefsStorage, createTaskStorage } from "./storage.js";
import { resolveRoute } from "../route.js";

// A real React render of the app in jsdom, driven the way a first-time user would use it.
const TODAY = "2026-11-04"; // Wednesday
let dom, server, React, createRoot, AssistantApp, Root;
const clipboard = [];

before(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define("window", dom.window); define("document", dom.window.document); define("navigator", dom.window.navigator);
  define("requestAnimationFrame", (fn) => setTimeout(fn, 0)); define("IS_REACT_ACT_ENVIRONMENT", true);
  // The earlier school demo uses framer-motion, whose animation callbacks run on timers and read these browser globals.
  for (const name of ["HTMLElement", "SVGElement", "Element", "Node", "Event", "MouseEvent", "getComputedStyle", "matchMedia"]) {
    if (dom.window[name] !== undefined) define(name, typeof dom.window[name] === "function" && !/^[A-Z]/.test(name) ? dom.window[name].bind(dom.window) : dom.window[name]);
  }
  if (!globalThis.matchMedia) define("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  Object.defineProperty(dom.window.navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { clipboard.push(text); } } });
  React = await import("react");
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({ root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true } });
  AssistantApp = (await server.ssrLoadModule("/src/assistant/AssistantApp.jsx")).default;
  Root = (await server.ssrLoadModule("/src/Root.jsx")).default;
});
after(async () => { await server?.close(); dom?.window.close(); });

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

// ── tiny DOM helpers ──────────────────────────────────────────────────────────
const mounted = new Set();
afterEach(async () => { // a failed assertion must not leak a mounted app into the next test
  for (const app of [...mounted]) await app.unmount().catch(() => {});
  mounted.clear();
});
async function mount(props = {}) {
  dom.window.history.replaceState(null, "", "/"); // every test starts on Extract & Review
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const backing = props.backing ?? new FakeStorage();
  const storage = props.storage ?? createTaskStorage(backing);
  const prefsStorage = props.prefsStorage ?? createPrefsStorage(backing);
  const element = React.createElement(AssistantApp, { getToday: () => TODAY, getNow: () => new Date("2026-11-04T01:00:00Z"), storage, prefsStorage, ...props.app });
  await React.act(async () => { root.render(props.strict ? React.createElement(React.StrictMode, null, element) : element); });
  const app = { container, root, backing, storage, unmount: async () => { mounted.delete(app); await React.act(async () => root.unmount()); container.remove(); } };
  mounted.add(app);
  return app;
}
const text = (el) => el.textContent.replace(/\s+/g, " ").trim();
const spaced = (el) => { const out = []; const walk = (n) => { if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); } else n.childNodes.forEach(walk); }; walk(el); return out.join(" "); };
const buttons = (c) => [...c.querySelectorAll("button")];
function button(c, name) {
  const match = buttons(c).filter((b) => (b.getAttribute("aria-label") ?? text(b)) === name || (name instanceof RegExp && name.test(b.getAttribute("aria-label") ?? text(b))));
  assert.ok(match.length >= 1, `button not found: ${name}. Have: ${buttons(c).map((b) => b.getAttribute("aria-label") ?? text(b)).slice(0, 30).join(" | ")}`);
  return match[0];
}
const click = (el) => React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
async function typeInto(el, value) {
  const proto = el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const byLabel = (c, label) => {
  const l = [...c.querySelectorAll("label")].find((x) => text(x) === label);
  assert.ok(l, `label not found: ${label}`);
  const target = l.getAttribute("for") ? c.querySelector(`#${l.getAttribute("for")}`) : l.querySelector("input, textarea");
  assert.ok(target, `no control for label: ${label}`);
  return target;
};
const card = (c, n) => [...c.querySelectorAll("article")][n - 1];
const status = (c) => text(c.querySelector('[role="status"]'));
const h1 = (c) => text(c.querySelector("h1"));
const navLink = (c, label) => {
  const link = [...c.querySelectorAll('nav[aria-label="Main"] a')].find((a) => text(a).startsWith(label));
  assert.ok(link, `nav link not found: ${label}`);
  return link;
};
const goTo = async (c, label) => { await click(navLink(c, label)); assert.equal(h1(c), label); };
const section = (c, id) => c.querySelector(`section[aria-labelledby="${id}"]`);
const confirmLabel = "I have checked these tasks and want to save them on this device.";

async function pasteSampleAndExtract(app) {
  await click(button(app.container, "Try a sample message"));
  await click(button(app.container, "Extract tasks"));
}
async function resolveAmbiguous(c) {
  for (const n of [4, 5]) await click(button(card(c, n), "No deadline"));
}
async function saveSample(app) {
  await pasteSampleAndExtract(app);
  await resolveAmbiguous(app.container);
  await click(byLabel(app.container, confirmLabel));
  await click(button(app.container, "Save 6 tasks"));
}
const task = (id, over = {}) => ({
  id, title: `Task ${id}`, owner: { kind: "unassigned", name: "" }, dueDate: null, status: "open", completedAt: null,
  createdAt: "2026-11-04T01:00:00.000Z", messageDate: "2026-11-03", sourceSnippet: "", dateExpression: null, extractorId: "demo-rules-v1", ...over,
});
const seed = (backing, tasks) => backing.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks }));
const PRIVACY = "Tasks are saved on this device. Avoid pasting confidential or sensitive information into this prototype.";

test("first-time user: paste → extract → inspect → edit → confirm → save → copy, with no account", async () => {
  const app = await mount();
  const c = app.container;
  // Landing: Extract & Review, no sign-in, the privacy wording and limit counter are visible.
  assert.equal(h1(c), "Extract & Review");
  assert.doesNotMatch(text(c), /sign in|log in|register|password/i);
  assert.ok(text(c).includes(PRIVACY));
  assert.match(text(c), /does not send it anywhere/);
  assert.match(text(c), /0 \/ 2,500 characters/);
  assert.equal(byLabel(c, "Date this message was received").value, TODAY);
  assert.equal(button(c, "Extract tasks").disabled, true, "nothing to extract yet");
  assert.match(text(section(c, "review-h")), /Your review appears here/);

  await click(button(c, "Try a sample message"));
  assert.equal(byLabel(c, "Message").value, SAMPLE_MESSAGE);
  assert.match(text(c), new RegExp(`${SAMPLE_MESSAGE.length} / 2,500 characters`));

  await click(button(c, "Extract tasks"));
  assert.match(text(section(c, "review-h")), /Results from: Demo extractor \(simple rules, not AI\)/);
  assert.match(text(c), /fixed rules, not an AI model/);
  assert.equal(c.querySelectorAll("article").length, 6);
  assert.equal(c.ownerDocument.activeElement.id, "review-h", "focus moves to the review heading");
  const fee = [...c.querySelectorAll("article")].find((a) => byLabel(a, "Task title").value === "Pay the $18 workshop fee");
  assert.equal(text(fee.querySelector("blockquote")), "Don't forget to pay the $18 workshop fee next Friday.");
  for (const q of c.querySelectorAll("article blockquote")) assert.ok(SAMPLE_MESSAGE.includes(q.textContent), "every excerpt is verbatim from the message");
  assert.match(text(fee), /Check deadline/);
  assert.match(text(fee), /“Next” could mean the coming one/);
  assert.equal(c.querySelectorAll('[role="group"][aria-label^="Ambiguous deadline"]').length, 2, "both ambiguous deadlines are flagged");

  assert.equal(byLabel(card(c, 2), "Owner").value, "Sarah");
  assert.match(text(card(c, 2)), /Named in the message, so it is not assigned to you/);
  assert.equal(byLabel(card(c, 1), "Owner").value, "");
  assert.match(text(card(c, 1)), /No owner is stated in the message/);

  assert.equal(button(c, "Save 6 tasks").disabled, true);
  assert.match(text(c), /Task 4: Choose a deadline or select “No deadline”/);
  assert.equal(byLabel(c, confirmLabel).disabled, true);

  await typeInto(byLabel(card(c, 1), "Task title"), "Bring water bottle and spare clothes");
  await click(button(card(c, 1), /^Assign to me/));
  assert.equal(byLabel(card(c, 1), "Owner").value, "Me");
  assert.match(text(card(c, 1)), /Assigned to you/);
  await click(button(card(c, 4), "Use Fri 13 Nov 2026"));
  assert.equal(byLabel(card(c, 4), "Deadline").value, "2026-11-13");
  assert.match(text(card(c, 4)), /Set by you/);
  await click(button(card(c, 5), "No deadline"));
  assert.equal(byLabel(card(c, 5), "Deadline").value, "");
  await typeInto(byLabel(card(c, 3), "Deadline"), "2026-12-21");
  assert.equal(byLabel(card(c, 3), "Deadline").value, "2026-12-21");
  await click(button(c, /^Remove task 6/));
  assert.equal(c.querySelectorAll("article").length, 5);
  assert.equal(button(c, "Save 5 tasks").disabled, true, "explicit confirmation still required");
  assert.equal(app.backing.map.size, 0, "nothing is stored before confirmation");

  await click(byLabel(c, confirmLabel));
  assert.equal(button(c, "Save 5 tasks").disabled, false);
  await typeInto(byLabel(card(c, 1), "Task title"), "Bring water bottle and clothes");
  assert.equal(button(c, "Save 5 tasks").disabled, true, "editing withdraws the confirmation");
  await click(byLabel(c, confirmLabel));
  await click(button(c, "Save 5 tasks"));

  // Saving lands on My Tasks with a confirmation; the message and drafts are gone.
  assert.equal(h1(c), "My Tasks");
  assert.equal(c.ownerDocument.activeElement.tagName, "H1");
  assert.match(status(c), /Saved 5 tasks on this device\./);
  const stored = app.backing.getItem(STORAGE_KEY);
  assert.equal(JSON.parse(stored).tasks.length, 5);
  assert.ok(!stored.includes("Hi everyone, a quick update"), "the full message is not saved");
  assert.ok(!stored.includes("Do not bring toys"), "unrelated sentences are not saved");
  await goTo(c, "Extract & Review");
  assert.equal(byLabel(c, "Message").value, "");
  assert.equal(c.querySelectorAll("article").length, 0);
  await goTo(c, "My Tasks");
  const upcoming = text(section(c, "group-upcoming"));
  assert.match(upcoming, /Bring water bottle and clothes/);
  assert.match(upcoming, /Owner: Me/);
  assert.match(upcoming, /Owner: Sarah/);
  assert.match(upcoming, /Due tomorrow/);
  assert.equal(section(c, "group-undated").querySelectorAll(".mt-task").length, 1);
  assert.ok(text(c).includes(PRIVACY));
  assert.match(text(c), /not synchronised with other devices or accounts/);

  await click(button(c, "Mark done: Send the final slides"));
  assert.match(text(section(c, "group-completed")), /Send the final slides/);
  assert.match(text(section(c, "group-completed")), /Completed Wed 4 Nov 2026/);
  assert.equal(JSON.parse(app.backing.getItem(STORAGE_KEY)).tasks.find((t) => t.title === "Send the final slides").status, "done");
  await click(button(c, "Mark not done: Send the final slides"));
  assert.match(text(section(c, "group-upcoming")), /Send the final slides/);

  await click(button(c, "Copy as Markdown"));
  assert.match(status(c.querySelector(".mt-copy")), /Copied 5 tasks as Markdown/);
  assert.match(clipboard.at(-1), /^# Tasks\n\n## Upcoming\n- \[ \] Send the final slides \(Owner: Sarah; Due: Thu 5 Nov 2026\)/);
  await click(button(c, "Copy as plain text"));
  assert.match(clipboard.at(-1), /^TASKS\n\nUPCOMING\n- \[ \] Send the final slides/);
  assert.doesNotMatch(clipboard.at(-1), /[#*]/);
  await app.unmount();
});

test("saved tasks survive a reload and can be deleted individually", async () => {
  const backing = new FakeStorage();
  let app = await mount({ backing });
  await pasteSampleAndExtract(app);
  const c = app.container;
  await click(button(c, /^Remove task 4/));
  await click(button(c, /^Remove task 4/));
  await click(byLabel(c, confirmLabel));
  await click(button(c, "Save 4 tasks"));
  await app.unmount();
  app = await mount({ backing, app: {} });
  await goTo(app.container, "My Tasks");
  assert.equal(app.container.querySelectorAll(".mt-task").length, 4, "tasks are back after a reload");
  await click(button(app.container, "Delete task: Send the final slides"));
  assert.equal(app.container.querySelectorAll(".mt-task").length, 3);
  assert.equal(JSON.parse(backing.getItem(STORAGE_KEY)).tasks.length, 3);
  await app.unmount();
});

test("saving the same message twice does not duplicate tasks", async () => {
  const backing = new FakeStorage();
  const app = await mount({ backing });
  await saveSample(app);
  await goTo(app.container, "Extract & Review");
  await saveSample(app);
  assert.match(status(app.container), /Saved 0 tasks on this device\. 6 duplicates skipped\./);
  assert.equal(JSON.parse(backing.getItem(STORAGE_KEY)).tasks.length, 6);
  await app.unmount();
});

test("clear-all data (in Settings) deletes tasks, settings, storage and the current message after confirmation", async () => {
  const backing = new FakeStorage();
  backing.setItem("unrelated", "keep");
  const app = await mount({ backing });
  const c = app.container;
  await saveSample(app);
  await goTo(c, "Settings");
  await click(byLabel(c, "Include supporting text when copying"));
  assert.ok(backing.getItem(PREFS_KEY), "a preference was saved");
  await goTo(c, "Extract & Review");
  await typeInto(byLabel(c, "Message"), "Please bring a pen.");
  await goTo(c, "Settings");
  await click(button(c, "Clear all data"));
  assert.match(text(c), /permanently deletes 6 saved tasks, your settings and the message/);
  await click(button(c, "Cancel"));
  assert.ok(backing.getItem(STORAGE_KEY), "cancel keeps everything");
  await click(button(c, "Clear all data"));
  await click(button(c, "Yes, delete everything"));
  assert.equal(backing.getItem(STORAGE_KEY), null);
  assert.equal(backing.getItem(PREFS_KEY), null, "preferences are cleared too");
  assert.equal(backing.getItem("unrelated"), "keep");
  assert.match(status(c), /deleted from this browser/);
  assert.equal(byLabel(c, "Include supporting text when copying").checked, false, "settings are back to defaults");
  await goTo(c, "My Tasks");
  assert.equal(c.querySelectorAll(".mt-task").length, 0);
  assert.match(text(c), /No saved tasks yet/);
  await goTo(c, "Extract & Review");
  assert.equal(byLabel(c, "Message").value, "");
  await app.unmount();
});

test("source content is untrusted: markup in a message is shown as text and never executed", async () => {
  const app = await mount();
  const c = app.container;
  window.__pwned = false;
  const hostile = 'Please send <img src=x onerror="window.__pwned=true"> and <script>window.__pwned=true</script> [x](javascript:window.__pwned=true) by Friday.';
  await typeInto(byLabel(c, "Message"), hostile);
  await click(button(c, "Extract tasks"));
  assert.equal(c.querySelectorAll("img, script, iframe, a[href^='javascript']").length, 0, "no elements were created from the message");
  assert.match(text(card(c, 1)), /<img src=x onerror="window\.__pwned=true">/, "shown literally");
  assert.equal(window.__pwned, false);
  await app.unmount();
});

test("the 2,500 character limit is shown, enforced and explained", async () => {
  const app = await mount();
  const c = app.container;
  await typeInto(byLabel(c, "Message"), "a".repeat(3000));
  assert.equal(byLabel(c, "Message").value.length, 2500);
  assert.match(text(c), /2,500 \/ 2,500 characters/);
  assert.match(text(c.querySelector("#message-limit")), /longer than 2,500 characters, so the end was cut off/);
  await typeInto(byLabel(c, "Message"), "Please bring a hat");
  assert.equal(c.querySelector("#message-limit"), null, "the warning clears once the text fits");
  await app.unmount();
});

test("changing the message date or text discards a stale review", async () => {
  const app = await mount();
  const c = app.container;
  await pasteSampleAndExtract(app);
  assert.equal(c.querySelectorAll("article").length, 6);
  await typeInto(byLabel(c, "Date this message was received"), "2026-11-09");
  assert.equal(c.querySelectorAll("article").length, 0);
  assert.match(status(c), /message date changed, so the previous review was cleared/);
  await click(button(c, "Extract tasks"));
  const water = [...c.querySelectorAll("article")].find((a) => byLabel(a, "Task title").value.startsWith("Bring a water"));
  assert.equal(byLabel(water, "Deadline").value, "2026-11-13", "“this Friday” is measured from the new message date (Mon 9 Nov)");
  await app.unmount();
});

test("the extractor is replaceable, and its output is validated and honestly labelled", async () => {
  const calls = [];
  const provider = {
    id: "stub-provider", label: "Stub provider", isDemo: false,
    async extract(input) {
      calls.push(input);
      return { tasks: [
        { title: "Real task", owner: { kind: "me", name: "Me" }, sourceSnippet: "Please bring a hat.", dateStatus: "none" },
        { title: "Invented task", sourceSnippet: "The CEO demanded this immediately.", dateStatus: "none" },
      ] };
    },
  };
  const app = await mount({ app: { extractor: provider } });
  const c = app.container;
  await typeInto(byLabel(c, "Message"), "Please bring a hat.");
  await click(button(c, "Extract tasks"));
  assert.deepEqual(calls, [{ text: "Please bring a hat.", receivedDate: TODAY }]);
  assert.match(text(section(c, "review-h")), /Results from: Stub provider/);
  assert.doesNotMatch(text(section(c, "review-h")), /not AI/);
  assert.equal(byLabel(card(c, 1), "Owner").value, "", "a provider cannot assign tasks to the user");
  assert.match(text(card(c, 2)), /This text could not be matched to your message/);
  assert.equal(card(c, 2).querySelector("details").open, true, "evidence that needs checking opens by itself");
  await app.unmount();
});

test("an extractor failure shows a generic error and never echoes the message", async () => {
  const failing = { id: "x", label: "X", isDemo: false, async extract({ text }) { throw new Error(`boom: ${text}`); } };
  const app = await mount({ app: { extractor: failing } });
  const c = app.container;
  await typeInto(byLabel(c, "Message"), "Secret: Please bring account 12345");
  await click(button(c, "Extract tasks"));
  const alert = text(c.querySelector(".mt-error"));
  assert.match(alert, /could not be extracted/);
  assert.doesNotMatch(alert, /Secret|12345|boom/);
  assert.equal(byLabel(c, "Message").value, "Secret: Please bring account 12345", "the message is kept so the person can retry");
  await app.unmount();
});

test("unavailable or full browser storage is reported, and a save that fails is not reported as saved", async () => {
  const none = await mount({ storage: createTaskStorage(null) });
  assert.match(text(none.container.querySelector('[role="alert"]')), /Browser storage is unavailable/);
  await none.unmount();
  const backing = new FakeStorage();
  backing.setItem(STORAGE_KEY, "{broken");
  const broken = await mount({ backing });
  assert.match(text(broken.container), /could not be read and was ignored/);
  await broken.unmount();
  const full = new FakeStorage();
  const app = await mount({ backing: full });
  const c = app.container;
  await pasteSampleAndExtract(app);
  await resolveAmbiguous(c);
  await click(byLabel(c, confirmLabel));
  full.setItem = () => { throw new Error("quota"); };
  await click(button(c, "Save 6 tasks"));
  assert.match(text(c.querySelector(".mt-error")), /not saved because browser storage is full or blocked/);
  assert.equal(h1(c), "Extract & Review", "a failed save does not navigate away");
  assert.equal(c.querySelectorAll("article").length, 6, "the reviewed tasks are kept so the person can retry");
  assert.equal(c.querySelectorAll(".mt-task").length, 0, "nothing is shown as saved when it was not");
  assert.equal(full.getItem(STORAGE_KEY), null);
  await app.unmount();
});

test("typing spaces and names in review fields is not mangled", async () => {
  const app = await mount();
  const c = app.container;
  await typeInto(byLabel(c, "Message"), "Please bring a hat.");
  await click(button(c, "Extract tasks"));
  const title = byLabel(card(c, 1), "Task title");
  await typeInto(title, "Bring a ");
  assert.equal(title.value, "Bring a ", "a trailing space is kept while typing");
  const owner = byLabel(card(c, 1), "Owner");
  for (const partial of ["I", "Ia", "Ian", "Ian "]) { await typeInto(owner, partial); assert.equal(owner.value, partial); }
  await typeInto(owner, "Me");
  assert.match(text(card(c, 1)), /Assigned to you/);
  await typeInto(owner, "Mei Ling");
  assert.equal(owner.value, "Mei Ling");
  assert.match(text(card(c, 1)), /not assigned to you/);
  await app.unmount();
});

// ── Navigation and shell ──────────────────────────────────────────────────────

test("the four sections are in a labelled nav, mark the current page, and keep your work while you move around", async () => {
  const app = await mount();
  const c = app.container;
  const links = [...c.querySelectorAll('nav[aria-label="Main"] a')];
  assert.deepEqual(links.map((a) => text(a).replace(/\s*\d+$/, "")), ["Extract & Review", "My Tasks", "Local History", "Settings"]);
  assert.deepEqual(links.map((a) => a.getAttribute("href")), ["#/", "#/tasks", "#/history", "#/settings"]);
  assert.deepEqual(links.map((a) => a.getAttribute("aria-current")), ["page", null, null, null]);
  assert.equal(c.querySelectorAll("main").length, 1);
  assert.equal(c.querySelectorAll("h1").length, 1);
  await typeInto(byLabel(c, "Message"), "Please bring a hat.");
  await click(button(c, "Extract tasks"));
  for (const label of ["My Tasks", "Local History", "Settings"]) {
    await goTo(c, label);
    assert.equal(c.querySelectorAll("h1").length, 1);
    assert.deepEqual([...c.querySelectorAll('nav[aria-label="Main"] a')].filter((a) => a.getAttribute("aria-current") === "page").map((a) => text(a).replace(/\s*\d+$/, "")), [label]);
    assert.equal(c.ownerDocument.activeElement.tagName, "H1", "focus moves to the new page heading");
    assert.equal(window.location.hash, label === "My Tasks" ? "#/tasks" : label === "Settings" ? "#/settings" : "#/history");
    assert.match(document.title, new RegExp(`^${label} · Message to Task`));
  }
  await goTo(c, "Extract & Review");
  assert.equal(byLabel(c, "Message").value, "Please bring a hat.", "the message survives moving between sections");
  assert.equal(c.querySelectorAll("article").length, 1, "and so does the review");
  await app.unmount();
});

test("the browser back button and unknown addresses are handled", async () => {
  const app = await mount();
  const c = app.container;
  await React.act(async () => { window.history.replaceState(null, "", "/#/history"); window.dispatchEvent(new dom.window.HashChangeEvent("hashchange")); });
  assert.equal(h1(c), "Local History");
  await React.act(async () => { window.history.replaceState(null, "", "/#/does-not-exist"); window.dispatchEvent(new dom.window.HashChangeEvent("hashchange")); });
  assert.equal(h1(c), "Extract & Review");
  await app.unmount();
  window.history.replaceState(null, "", "/#/settings");
  const direct = await mount({ app: {} }); // mount() resets the address, so open the section directly instead
  await goTo(direct.container, "Settings");
  await direct.unmount();
});

test("the page does not steal focus on load, even when effects run twice (React StrictMode)", async () => {
  const app = await mount({ strict: true });
  assert.equal(document.activeElement, document.body, "nothing is focused until the person acts");
  const first = [...app.container.querySelectorAll("a, button, input, textarea")].find((el) => el.getClientRects !== undefined);
  assert.equal(first.className, "mt-skip", "the skip link is the first tab stop");
  await app.unmount();
});

test("the skip link moves focus to the main region without changing the section", async () => {
  const app = await mount();
  const c = app.container;
  await goTo(c, "My Tasks");
  await click(c.querySelector(".mt-skip"));
  assert.equal(document.activeElement, c.querySelector("main#main"));
  assert.equal(h1(c), "My Tasks");
  assert.equal(window.location.hash, "#/tasks");
  await app.unmount();
});

test("the mobile menu is a plain disclosure: expanded state, Escape to close, closes after choosing", async () => {
  const app = await mount();
  const c = app.container;
  const menu = c.querySelector(".mt-menu-btn");
  const sidebar = c.querySelector("#mt-sidebar");
  assert.deepEqual([menu.getAttribute("aria-expanded"), menu.getAttribute("aria-controls"), text(menu)], ["false", "mt-sidebar", "Menu"]);
  assert.equal(sidebar.classList.contains("mt-sidebar--open"), false);
  await click(menu);
  assert.deepEqual([menu.getAttribute("aria-expanded"), text(menu)], ["true", "Close menu"]);
  assert.equal(sidebar.classList.contains("mt-sidebar--open"), true);
  menu.blur(); navLink(c, "My Tasks").focus();
  await React.act(async () => { navLink(c, "My Tasks").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  assert.equal(menu.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, menu, "focus returns to the Menu button");
  await click(menu);
  await click(navLink(c, "Settings"));
  assert.equal(menu.getAttribute("aria-expanded"), "false", "choosing a section closes the menu");
  assert.equal(h1(c), "Settings");
  await app.unmount();
});

// ── Cards, badges, history, settings ──────────────────────────────────────────

test("source evidence is collapsible: closed by default with a preview, open when something needs checking", async () => {
  const app = await mount();
  const c = app.container;
  await pasteSampleAndExtract(app);
  const [ordinary, , , ambiguous] = [1, 2, 3, 4].map((n) => card(c, n).querySelector("details"));
  assert.equal(ordinary.open, false);
  assert.equal(spaced(ordinary.querySelector("summary")), "Source text “Please bring a water bottle and a spare set of clothes this Friday.”");
  assert.equal(ambiguous.open, true, "an ambiguous deadline opens its evidence");
  assert.equal(text(ordinary.querySelector("blockquote")), "Please bring a water bottle and a spare set of clothes this Friday.", "the full sentence is always in the page");
  await app.unmount();
});

test("saved tasks show deadline badges that say what they mean, in the right sections", async () => {
  const backing = new FakeStorage();
  seed(backing, [
    task("late", { title: "Pay the fee", dueDate: "2026-11-02" }), task("today", { title: "Call the bank", dueDate: TODAY }),
    task("soon", { title: "Send slides", dueDate: "2026-11-05", owner: { kind: "other", name: "Sarah" } }), task("later", { title: "Book venue", dueDate: "2026-11-20" }),
    task("none", { title: "Tidy desk" }), task("long", { title: "Long source", dueDate: "2026-12-30", sourceSnippet: "x".repeat(150) }), task("done", { title: "Return form", status: "done", completedAt: "2026-11-03T05:00:00.000Z", dueDate: "2026-11-01" }),
  ]);
  const app = await mount({ backing });
  const c = app.container;
  await goTo(c, "My Tasks");
  assert.deepEqual([...c.querySelectorAll(".mt-stat")].map((st) => [st.querySelector(".mt-stat-num").textContent, st.querySelector(".mt-stat-label").textContent]),
    [["1", "Overdue"], ["4", "Upcoming"], ["1", "No deadline"], ["1", "Completed"]]);
  assert.match(spaced(section(c, "group-overdue")), /Pay the fee Overdue by 2 days/);
  assert.match(spaced(section(c, "group-upcoming")), /Call the bank Due today/);
  assert.match(spaced(section(c, "group-upcoming")), /Send slides Due tomorrow Owner: Sarah/);
  assert.match(spaced(section(c, "group-upcoming")), /Book venue Due Fri 20 Nov 2026/);
  assert.match(spaced(section(c, "group-undated")), /Tidy desk No deadline/);
  assert.match(spaced(section(c, "group-completed")), /Return form Completed (Tue 3|Wed 4) Nov 2026/);
  const longOne = [...c.querySelectorAll(".mt-task")].find((t) => t.textContent.includes("Long source"));
  assert.match(spaced(longOne.querySelector("summary")), /^Source text “x{69}…”$/, "a long source sentence is shortened in the summary only");
  assert.equal(longOne.querySelector("blockquote").textContent, "x".repeat(150), "and shown in full when opened");
  assert.equal(c.querySelector(".mt-task--danger .mt-task-title").textContent, "Pay the fee");
  assert.match(text(navLink(c, "My Tasks")), /7$/, "the sidebar shows how many tasks are saved");
  await app.unmount();
});

test("Local History lists saved tasks by day, newest first, without showing any source text", async () => {
  const backing = new FakeStorage();
  seed(backing, [
    task("a", { title: "Older task", createdAt: "2026-11-01T06:00:00.000Z", sourceSnippet: "PRIVATE SOURCE SENTENCE" }),
    task("b", { title: "Newest task", createdAt: "2026-11-04T06:00:00.000Z", messageDate: "2026-11-04" }),
    task("c", { title: "Finished task", createdAt: "2026-11-04T05:00:00.000Z", status: "done", completedAt: "2026-11-04T08:00:00.000Z", owner: { kind: "me", name: "" } }),
  ]);
  const app = await mount({ backing });
  const c = app.container;
  await goTo(c, "Local History");
  const headings = [...c.querySelectorAll("main h2")].map((h) => spaced(h));
  assert.equal(headings[0], "Saved Wed 4 Nov 2026 2 tasks");
  assert.equal(headings[1], "Saved Sun 1 Nov 2026 1 task");
  assert.match(spaced(c.querySelector("main")), /Newest task Open From a message dated Wed 4 Nov 2026/);
  assert.match(spaced(c.querySelector("main")), /Finished task Done Owner: Me From a message dated Tue 3 Nov 2026 Completed Wed 4 Nov 2026/);
  assert.ok(!text(c).includes("PRIVATE SOURCE SENTENCE"));
  assert.match(text(c), /The full message you pasted is not kept here/);
  await app.unmount();
  const empty = await mount();
  await goTo(empty.container, "Local History");
  assert.match(text(empty.container), /No history yet/);
  await click(button(empty.container, "Go to Extract & Review"));
  assert.equal(h1(empty.container), "Extract & Review");
  await empty.unmount();
});

test("Settings: preferences persist and take effect, and the privacy wording is shown", async () => {
  const backing = new FakeStorage();
  let app = await mount({ backing });
  let c = app.container;
  await goTo(c, "Settings");
  assert.ok(text(c).includes(PRIVACY));
  assert.match(text(c), /not AI/);
  assert.equal(byLabel(c, "Keep the supporting sentence with each saved task by default").checked, true);
  await click(byLabel(c, "Keep the supporting sentence with each saved task by default"));
  await click(byLabel(c, "Include completed tasks when copying"));
  assert.deepEqual(JSON.parse(backing.getItem(PREFS_KEY)), { version: 1, keepSnippets: false, includeCompleted: true, includeSource: false });
  await app.unmount();
  app = await mount({ backing });
  c = app.container;
  await goTo(c, "Settings");
  assert.equal(byLabel(c, "Keep the supporting sentence with each saved task by default").checked, false, "restored after a reload");
  await goTo(c, "Extract & Review");
  await pasteSampleAndExtract(app);
  assert.equal(byLabel(c, "Keep the supporting text with each saved task (otherwise it is discarded).").checked, false, "the default reaches the review step");
  await resolveAmbiguous(c);
  await click(byLabel(c, confirmLabel));
  await click(button(c, "Save 6 tasks"));
  assert.ok(JSON.parse(backing.getItem(STORAGE_KEY)).tasks.every((t) => t.sourceSnippet === ""), "no supporting sentences were saved");
  assert.equal(c.querySelectorAll(".mt-task details").length, 0);
  await goTo(c, "My Tasks");
  assert.equal(byLabel(c, "Include completed tasks").checked, true, "the copy option is shared with Settings");
  await app.unmount();
});

test("no screen claims zero data retention", async () => {
  const backing = new FakeStorage();
  seed(backing, [task("a", { title: "Pay the fee", sourceSnippet: "Please pay the fee." })]);
  const app = await mount({ backing });
  const c = app.container;
  await pasteSampleAndExtract(app);
  for (const label of ["Extract & Review", "My Tasks", "Local History", "Settings"]) {
    await goTo(c, label);
    assert.doesNotMatch(text(c), /zero[- ](data|retention)|no data (is )?(retained|stored|kept)|nothing is (stored|saved|kept)|never (stored|saved|retained|kept)|not stored|anonymous|100% private/i, label);
  }
  await app.unmount();
});

test("routing: the assistant is the default screen and the school demo is reachable by hash", async () => {
  assert.equal(resolveRoute(""), "assistant");
  assert.equal(resolveRoute("#/"), "assistant");
  assert.equal(resolveRoute("#/unknown"), "assistant");
  assert.equal(resolveRoute("#/tasks"), "assistant");
  assert.equal(resolveRoute("#/school-demo"), "school-demo");
  assert.equal(resolveRoute("#school-demo"), "school-demo");
  assert.equal(resolveRoute("#/School-Demo?x=1"), "school-demo");
  window.history.replaceState(null, "", "/");
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  await React.act(async () => { root.render(React.createElement(Root)); });
  assert.equal(text(container.querySelector("h1")), "Extract & Review");
  assert.ok([...container.querySelectorAll("a")].some((a) => a.getAttribute("href") === "#/school-demo"));
  await React.act(async () => { window.history.replaceState(null, "", "/#/school-demo"); window.dispatchEvent(new dom.window.HashChangeEvent("hashchange")); });
  for (let i = 0; i < 40 && !/Sign in with email/.test(container.textContent); i += 1) await React.act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  assert.match(container.textContent, /Sign in with email/, "the earlier school demo still renders");
  assert.ok([...container.querySelectorAll("a")].some((a) => a.getAttribute("href") === "#/"), "and offers a way back");
  await React.act(async () => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

// ── Persistence failures must never be reported as success ────────────────────

class FlakyStorage extends FakeStorage {
  constructor() { super(); this.writeErrors = new Map(); this.removeErrors = new Set(); this.silentRemove = new Set(); }
  setItem(key, value) { if (this.writeErrors.has(key)) throw this.writeErrors.get(key); super.setItem(key, value); }
  removeItem(key) {
    if (this.removeErrors.has(key)) throw new dom.window.DOMException("Blocked", "SecurityError");
    if (!this.silentRemove.has(key)) super.removeItem(key); // a silent failure leaves the key behind without throwing
  }
}
const quotaError = () => new dom.window.DOMException("The quota has been exceeded.", "QuotaExceededError");
const alertText = (c) => [...c.querySelectorAll('[role="alert"]')].map((a) => text(a)).join(" | ");
const storedTitles = (backing) => JSON.parse(backing.getItem(STORAGE_KEY) ?? '{"tasks":[]}').tasks.map((t) => t.title);

async function readyToSave(app) {
  const c = app.container;
  await pasteSampleAndExtract(app);
  await typeInto(byLabel(card(c, 1), "Task title"), "Bring water bottle and clothes");
  await click(button(card(c, 1), /^Assign to me/));
  await resolveAmbiguous(c);
  await typeInto(byLabel(card(c, 3), "Deadline"), "2026-12-21");
  await click(byLabel(c, confirmLabel));
}
function assertReviewKept(c) {
  assert.equal(h1(c), "Extract & Review", "a failed save does not navigate away");
  assert.equal(c.querySelectorAll("article").length, 6, "all reviewed drafts are kept");
  assert.equal(byLabel(card(c, 1), "Task title").value, "Bring water bottle and clothes", "title edit kept");
  assert.equal(byLabel(card(c, 1), "Owner").value, "Me", "assign-to-me kept");
  assert.equal(byLabel(card(c, 3), "Deadline").value, "2026-12-21", "deadline edit kept");
  assert.equal(byLabel(card(c, 4), "Deadline").value, "", "the 'no deadline' decisions are kept");
  assert.equal(byLabel(c, confirmLabel).checked, true, "the confirmation is kept");
  assert.equal(button(c, "Save 6 tasks").disabled, false, "Save is available for a retry");
  assert.equal(c.querySelectorAll(".mt-task").length, 0, "nothing is shown as saved");
  assert.doesNotMatch(status(c), /Saved/, "no success message");
}

test("a successful save is stored, announced once, and moves to My Tasks", async () => {
  const backing = new FlakyStorage();
  const app = await mount({ backing });
  const c = app.container;
  await readyToSave(app);
  await click(button(c, "Save 6 tasks"));
  assert.equal(h1(c), "My Tasks");
  assert.match(status(c), /^Saved 6 tasks on this device\.$/);
  assert.equal(alertText(c), "", "no error is shown");
  assert.equal(storedTitles(backing).length, 6);
  assert.ok(storedTitles(backing).includes("Bring water bottle and clothes"));
  assert.equal(c.querySelectorAll(".mt-task").length, 6, "what is shown is what was stored");
});

for (const [label, makeError, expected] of [
  ["a failed localStorage write", () => new dom.window.DOMException("Blocked", "SecurityError"), /not saved because browser storage is full or blocked/],
  ["storage quota exceeded", quotaError, /not saved because browser storage is full or blocked/],
]) {
  test(`${label} is reported, keeps the reviewed drafts, and can be retried`, async () => {
    const backing = new FlakyStorage();
    const app = await mount({ backing });
    const c = app.container;
    await readyToSave(app);
    backing.writeErrors.set(STORAGE_KEY, makeError());
    await click(button(c, "Save 6 tasks"));
    assert.match(alertText(c), expected);
    assert.equal(backing.getItem(STORAGE_KEY), null, "nothing was stored");
    assertReviewKept(c);
    // Retrying while it still fails behaves the same way, with no duplicate or stale state.
    await click(button(c, "Save 6 tasks"));
    assert.match(alertText(c), expected);
    assertReviewKept(c);
    // Once storage works again, the same review saves with all of its edits.
    backing.writeErrors.delete(STORAGE_KEY);
    await click(button(c, "Save 6 tasks"));
    assert.equal(h1(c), "My Tasks");
    assert.match(status(c), /^Saved 6 tasks on this device\.$/);
    assert.equal(alertText(c), "", "the error clears after a successful retry");
    assert.equal(storedTitles(backing).length, 6, "exactly one copy of each task");
    assert.ok(storedTitles(backing).includes("Bring water bottle and clothes"), "the edits made before the failure were saved");
  });
}

test("unavailable storage blocks the save, says so, and keeps the review", async () => {
  const app = await mount({ storage: createTaskStorage(null) });
  const c = app.container;
  assert.match(alertText(c), /Browser storage is unavailable, so tasks cannot be saved in this browser/);
  await readyToSave(app);
  await click(button(c, "Save 6 tasks"));
  assert.match(alertText(c), /not saved because browser storage is unavailable/);
  assertReviewKept(c);
});

test("a failed write never leaves the screen out of step with storage when completing or deleting a task", async () => {
  const backing = new FlakyStorage();
  seed(backing, [task("a", { title: "First task" }), task("b", { title: "Second task" })]);
  const app = await mount({ backing });
  const c = app.container;
  await goTo(c, "My Tasks");
  backing.writeErrors.set(STORAGE_KEY, quotaError());
  const stored = backing.getItem(STORAGE_KEY);

  await click(button(c, "Mark done: First task"));
  assert.match(alertText(c), /Your latest change was not saved/);
  assert.equal(button(c, "Mark done: First task").getAttribute("aria-pressed"), "false", "the task still shows as open");
  assert.equal(section(c, "group-completed").querySelectorAll(".mt-task").length, 0);
  await click(button(c, "Delete task: Second task"));
  assert.match(alertText(c), /Your latest change was not saved/);
  assert.equal(c.querySelectorAll(".mt-task").length, 2, "the task is still listed");
  assert.equal(backing.getItem(STORAGE_KEY), stored, "storage is untouched");
  assert.doesNotMatch(status(c), /Saved|deleted/);

  // A reload shows exactly what the screen showed.
  await app.unmount();
  const again = await mount({ backing });
  await goTo(again.container, "My Tasks");
  assert.equal(again.container.querySelectorAll(".mt-task").length, 2);
  assert.equal(section(again.container, "group-completed").querySelectorAll(".mt-task").length, 0);
  await again.unmount();

  // When storage recovers, the same actions work and the error goes away.
  const recovered = await mount({ backing });
  await goTo(recovered.container, "My Tasks");
  backing.writeErrors.delete(STORAGE_KEY);
  await click(button(recovered.container, "Mark done: First task"));
  assert.equal(alertText(recovered.container), "");
  assert.equal(JSON.parse(backing.getItem(STORAGE_KEY)).tasks.find((t) => t.id === "a").status, "done");
  await click(button(recovered.container, "Delete task: Second task"));
  assert.deepEqual(storedTitles(backing), ["First task"]);
});

// ── Clear all data ────────────────────────────────────────────────────────────

async function clearSetup({ messageText = "Please bring a pen." } = {}) {
  const backing = new FlakyStorage();
  seed(backing, [task("a", { title: "Pay the fee" }), task("b", { title: "Send slides" })]);
  backing.setItem(PREFS_KEY, JSON.stringify({ version: 1, keepSnippets: false, includeCompleted: true, includeSource: false }));
  const app = await mount({ backing });
  const c = app.container;
  await typeInto(byLabel(c, "Message"), messageText);
  await goTo(c, "Settings");
  await click(button(c, "Clear all data"));
  return { backing, app, c };
}
const confirmDelete = (c) => click(button(c, "Yes, delete everything"));
const COMPLETE_CLAIM = /All saved tasks, settings and the current message were deleted/;

test("a successful Clear all data removes everything and says so", async () => {
  const { backing, c } = await clearSetup();
  await confirmDelete(c);
  assert.equal(backing.getItem(STORAGE_KEY), null);
  assert.equal(backing.getItem(PREFS_KEY), null);
  assert.equal(alertText(c), "");
  assert.match(status(c), COMPLETE_CLAIM);
  assert.equal(byLabel(c, "Include completed tasks when copying").checked, false, "settings are back to defaults");
  assert.equal(c.querySelector('[role="group"][aria-label="Confirm deleting all data"]'), null, "the confirmation closes");
  await goTo(c, "My Tasks");
  assert.equal(c.querySelectorAll(".mt-task").length, 0);
  await goTo(c, "Extract & Review");
  assert.equal(byLabel(c, "Message").value, "", "the message being worked on is cleared on a complete deletion");
});

test("if saved tasks cannot be deleted, it does not claim deletion and the tasks stay visible and stored", async () => {
  const { backing, app, c } = await clearSetup();
  backing.removeErrors.add(STORAGE_KEY);
  await confirmDelete(c);
  assert.match(alertText(c), /saved tasks could not be deleted from this browser and are still saved here\. Your settings were deleted\./);
  assert.doesNotMatch(text(c), COMPLETE_CLAIM);
  assert.doesNotMatch(status(c), /deleted/);
  assert.ok(backing.getItem(STORAGE_KEY), "the tasks really are still stored");
  assert.equal(backing.getItem(PREFS_KEY), null, "the settings really were removed");
  assert.match(text(c), /2 tasks saved in this browser/, "the screen matches what is stored");
  assert.equal(byLabel(c, "Include completed tasks when copying").checked, false, "settings show the defaults they now have");
  assert.ok(button(c, "Yes, delete everything"), "the confirmation stays open so it can be retried");
  await goTo(c, "My Tasks");
  assert.equal(c.querySelectorAll(".mt-task").length, 2);
  await goTo(c, "Extract & Review");
  assert.equal(byLabel(c, "Message").value, "Please bring a pen.", "the message being worked on is not discarded by a failed deletion");
  // Retry once the browser allows it.
  await goTo(c, "Settings");
  backing.removeErrors.clear();
  await confirmDelete(c);
  assert.equal(backing.getItem(STORAGE_KEY), null);
  assert.equal(alertText(c), "");
  assert.match(status(c), COMPLETE_CLAIM);
  await app.unmount();
});

test("if settings cannot be deleted, the tasks are removed, the settings stay, and the message is accurate", async () => {
  const { backing, c } = await clearSetup();
  backing.removeErrors.add(PREFS_KEY);
  await confirmDelete(c);
  assert.match(alertText(c), /saved tasks were deleted, but your settings could not be deleted from this browser/);
  assert.doesNotMatch(text(c), COMPLETE_CLAIM);
  assert.equal(backing.getItem(STORAGE_KEY), null, "the tasks really were removed");
  assert.ok(backing.getItem(PREFS_KEY), "the settings really are still stored");
  assert.match(text(c), /0 tasks saved in this browser/);
  assert.equal(byLabel(c, "Include completed tasks when copying").checked, true, "settings show what is still stored");
  assert.ok(button(c, "Yes, delete everything"), "retry is possible");
  await goTo(c, "My Tasks");
  assert.equal(c.querySelectorAll(".mt-task").length, 0);
  await goTo(c, "Settings");
  backing.removeErrors.clear();
  await confirmDelete(c);
  assert.equal(backing.getItem(PREFS_KEY), null);
  assert.equal(alertText(c), "");
  assert.match(status(c), COMPLETE_CLAIM);
});

test("if nothing can be deleted, nothing changes and the message says so", async () => {
  const { backing, c } = await clearSetup();
  backing.removeErrors.add(STORAGE_KEY); backing.removeErrors.add(PREFS_KEY);
  await confirmDelete(c);
  assert.match(alertText(c), /Nothing was deleted/);
  assert.doesNotMatch(text(c), COMPLETE_CLAIM);
  assert.ok(backing.getItem(STORAGE_KEY) && backing.getItem(PREFS_KEY));
  assert.match(text(c), /2 tasks saved in this browser/);
  assert.equal(byLabel(c, "Include completed tasks when copying").checked, true);
  assert.ok(button(c, "Yes, delete everything"));
});

test("a removal that silently leaves the data behind is treated as a failure", async () => {
  const { backing, c } = await clearSetup();
  backing.silentRemove.add(STORAGE_KEY);
  await confirmDelete(c);
  assert.match(alertText(c), /saved tasks could not be deleted/);
  assert.doesNotMatch(text(c), COMPLETE_CLAIM);
  assert.match(text(c), /2 tasks saved in this browser/);
});
