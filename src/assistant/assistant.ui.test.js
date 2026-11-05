import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { SAMPLE_MESSAGE } from "./extractor.js";
import { STORAGE_KEY, createTaskStorage } from "./storage.js";
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
async function mount(props = {}) {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const backing = props.backing ?? new FakeStorage();
  const storage = props.storage ?? createTaskStorage(backing);
  await React.act(async () => {
    root.render(React.createElement(AssistantApp, { getToday: () => TODAY, getNow: () => new Date("2026-11-04T01:00:00Z"), storage, ...props.app }));
  });
  return { container, root, backing, storage, unmount: async () => { await React.act(async () => root.unmount()); container.remove(); } };
}
const text = (el) => el.textContent.replace(/\s+/g, " ").trim();
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

async function pasteSampleAndExtract(app) {
  await click(button(app.container, "Try a sample message"));
  await click(button(app.container, "Extract tasks"));
}

test("first-time user: paste → extract → inspect → edit → confirm → save → copy, with no account", async () => {
  const app = await mount();
  const c = app.container;
  // Landing: no sign-in, privacy and storage explanations are visible, limit counter and local date default are present.
  assert.equal(text(c.querySelector("h1")), "Message to Task");
  assert.doesNotMatch(text(c), /sign in|log in|register|password/i);
  assert.match(text(c), /sensitive details/);
  assert.match(text(c), /not sent anywhere/);
  assert.match(text(c), /not synchronised with other devices/);
  assert.match(text(c), /0 \/ 2,500 characters/);
  assert.equal(byLabel(c, "Date this message was received").value, TODAY);
  assert.equal(button(c, "Extract tasks").disabled, true, "nothing to extract yet");

  await click(button(c, "Try a sample message"));
  assert.equal(byLabel(c, "Message").value, SAMPLE_MESSAGE);
  assert.match(text(c), new RegExp(`${SAMPLE_MESSAGE.length} / 2,500 characters`));

  await click(button(c, "Extract tasks"));
  // Review: demo label, six tasks, each with its exact supporting text.
  assert.match(text(c.querySelector("section[aria-labelledby=review-h]")), /Results from: Demo extractor \(simple rules, not AI\)/);
  assert.match(text(c), /fixed rules, not an AI model/);
  assert.equal(c.querySelectorAll("article").length, 6);
  assert.equal(c.ownerDocument.activeElement.id, "review-h", "focus moves to the review heading");
  const fee = [...c.querySelectorAll("article")].find((a) => byLabel(a, "Task title").value === "Pay the $18 workshop fee");
  assert.equal(text(fee.querySelector("blockquote")), "Don't forget to pay the $18 workshop fee next Friday.");
  for (const q of c.querySelectorAll("article blockquote")) assert.ok(SAMPLE_MESSAGE.includes(q.textContent), "every excerpt is verbatim from the message");
  assert.match(text(fee), /Ambiguous deadline — your choice needed/);
  assert.match(text(fee), /“Next” could mean the coming one/);
  assert.equal(c.querySelectorAll('[role="group"][aria-label^="Ambiguous deadline"]').length, 2, "both ambiguous deadlines are flagged");

  // Owners: Sarah's task is not the user's; a task with no named owner is unassigned.
  assert.equal(byLabel(card(c, 2), "Owner").value, "Sarah");
  assert.match(text(card(c, 2)), /Named in the message, so it is not assigned to you/);
  assert.equal(byLabel(card(c, 1), "Owner").value, "");
  assert.match(text(card(c, 1)), /No owner is stated in the message/);

  // Saving is blocked until ambiguity is resolved and the person confirms.
  assert.equal(button(c, "Save 6 tasks").disabled, true);
  assert.match(text(c), /Task 4: Choose a deadline or select “No deadline”/);
  assert.equal(byLabel(c, "I have checked these tasks and want to save them on this device.").disabled, true);

  // Edit title, assign to me, resolve both ambiguous deadlines, remove one task.
  await typeInto(byLabel(card(c, 1), "Task title"), "Bring water bottle and spare clothes");
  await click(button(card(c, 1), /^Assign to me/));
  assert.equal(byLabel(card(c, 1), "Owner").value, "Me");
  assert.match(text(card(c, 1)), /Assigned to you/);
  await click(button(card(c, 4), "Use Fri 13 Nov 2026"));
  assert.equal(byLabel(card(c, 4), "Deadline").value, "2026-11-13");
  assert.match(text(card(c, 4)), /Deadline set by you/);
  await click(button(card(c, 5), "No deadline"));
  assert.equal(byLabel(card(c, 5), "Deadline").value, "");
  await typeInto(byLabel(card(c, 3), "Deadline"), "2026-12-21");
  assert.equal(byLabel(card(c, 3), "Deadline").value, "2026-12-21");
  await click(button(c, /^Remove task 6/));
  assert.equal(c.querySelectorAll("article").length, 5);
  assert.equal(button(c, "Save 5 tasks").disabled, true, "explicit confirmation still required");
  assert.deepEqual(app.backing.map.size, 0, "nothing is stored before confirmation");

  await click(byLabel(c, "I have checked these tasks and want to save them on this device."));
  assert.equal(button(c, "Save 5 tasks").disabled, false);
  await typeInto(byLabel(card(c, 1), "Task title"), "Bring water bottle and clothes");
  assert.equal(button(c, "Save 5 tasks").disabled, true, "editing withdraws the confirmation");
  await click(byLabel(c, "I have checked these tasks and want to save them on this device."));
  await click(button(c, "Save 5 tasks"));

  // Saved: message and drafts gone, tasks grouped, persisted locally without the full message.
  assert.equal(byLabel(c, "Message").value, "");
  assert.equal(c.querySelectorAll("article").length, 0);
  assert.match(status(c), /Saved 5 tasks on this device\./);
  const stored = app.backing.getItem(STORAGE_KEY);
  assert.equal(JSON.parse(stored).tasks.length, 5);
  assert.ok(!stored.includes("Hi everyone, a quick update"), "the full message is not stored");
  assert.ok(!stored.includes("Do not bring toys"), "unrelated sentences are not stored");
  const upcoming = [...c.querySelectorAll("h3")].find((h) => text(h).startsWith("Upcoming")).nextElementSibling;
  assert.match(text(upcoming), /Bring water bottle and clothes/);
  assert.match(text(upcoming), /Owner: Me/);
  assert.match(text(upcoming), /Owner: Sarah · Thu 5 Nov 2026/);
  assert.match(text(c), /No deadline 1/);

  // Status: complete and re-open a task; it moves between groups and persists.
  await click(button(c, "Mark done: Send the final slides"));
  assert.match(text([...c.querySelectorAll("h3")].find((h) => text(h).startsWith("Completed")).nextElementSibling), /Send the final slides/);
  assert.equal(JSON.parse(app.backing.getItem(STORAGE_KEY)).tasks.find((t) => t.title === "Send the final slides").status, "done");
  await click(button(c, "Mark not done: Send the final slides"));
  assert.match(text([...c.querySelectorAll("h3")].find((h) => text(h).startsWith("Upcoming")).nextElementSibling), /Send the final slides/);

  // Copy as Markdown and plain text.
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
  await click(byLabel(c, "I have checked these tasks and want to save them on this device."));
  await click(button(c, "Save 4 tasks"));
  await app.unmount();
  app = await mount({ backing });
  assert.equal(app.container.querySelectorAll(".mt-task").length, 4, "tasks are back after a reload");
  await click(button(app.container, "Delete task: Send the final slides"));
  assert.equal(app.container.querySelectorAll(".mt-task").length, 3);
  assert.equal(JSON.parse(backing.getItem(STORAGE_KEY)).tasks.length, 3);
  await app.unmount();
});

test("saving the same message twice does not duplicate tasks", async () => {
  const backing = new FakeStorage();
  const app = await mount({ backing });
  for (let round = 0; round < 2; round += 1) {
    await pasteSampleAndExtract(app);
    const c = app.container;
    for (const n of [4, 5]) await click(button(card(c, n), "No deadline"));
    await click(byLabel(c, "I have checked these tasks and want to save them on this device."));
    await click(button(c, "Save 6 tasks"));
  }
  assert.match(status(app.container), /Saved 0 tasks on this device\. 6 duplicates skipped\./);
  assert.equal(JSON.parse(backing.getItem(STORAGE_KEY)).tasks.length, 6);
  await app.unmount();
});

test("clear-all data deletes tasks, storage and the current message after confirmation", async () => {
  const backing = new FakeStorage();
  backing.setItem("unrelated", "keep");
  const app = await mount({ backing });
  const c = app.container;
  await pasteSampleAndExtract(app);
  for (const n of [4, 5]) await click(button(card(c, n), "No deadline"));
  await click(byLabel(c, "I have checked these tasks and want to save them on this device."));
  await click(button(c, "Save 6 tasks"));
  await typeInto(byLabel(c, "Message"), "Please bring a pen.");
  await click(button(c, "Clear all data"));
  assert.match(text(c), /permanently deletes 6 saved tasks/);
  await click(button(c, "Cancel"));
  assert.equal(c.querySelectorAll(".mt-task").length, 6, "cancel keeps everything");
  await click(button(c, "Clear all data"));
  await click(button(c, "Yes, delete everything"));
  assert.equal(c.querySelectorAll(".mt-task").length, 0);
  assert.equal(byLabel(c, "Message").value, "");
  assert.equal(backing.getItem(STORAGE_KEY), null);
  assert.equal(backing.getItem("unrelated"), "keep");
  assert.match(status(c), /deleted from this browser/);
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
  assert.match(text(c.querySelector('[role="alert"]')), /longer than 2,500 characters, so the end was cut off/);
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
  const pay = [...c.querySelectorAll("article")].find((a) => byLabel(a, "Task title").value.startsWith("Bring water") || byLabel(a, "Task title").value.startsWith("Bring a water"));
  assert.equal(byLabel(pay, "Deadline").value, "2026-11-13", "“this Friday” is measured from the new message date (Mon 9 Nov)");
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
  assert.match(text(c.querySelector("section[aria-labelledby=review-h]")), /Results from: Stub provider/);
  assert.doesNotMatch(text(c.querySelector("section[aria-labelledby=review-h]")), /not AI/);
  assert.equal(byLabel(card(c, 1), "Owner").value, "", "a provider cannot assign tasks to the user");
  assert.match(text(card(c, 2)), /This text could not be matched to your message/);
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

test("unavailable or full browser storage is reported and tasks still work in memory", async () => {
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
  for (const n of [4, 5]) await click(button(card(c, n), "No deadline"));
  await click(byLabel(c, "I have checked these tasks and want to save them on this device."));
  full.setItem = () => { throw new Error("quota"); };
  await click(button(c, "Save 6 tasks"));
  assert.match(text(c.querySelector(".mt-error")), /full or blocked/);
  assert.equal(c.querySelectorAll(".mt-task").length, 6, "tasks stay visible for this session");
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

test("routing: the assistant is the default screen and the school demo is reachable by hash", async () => {
  assert.equal(resolveRoute(""), "assistant");
  assert.equal(resolveRoute("#/"), "assistant");
  assert.equal(resolveRoute("#/unknown"), "assistant");
  assert.equal(resolveRoute("#/school-demo"), "school-demo");
  assert.equal(resolveRoute("#school-demo"), "school-demo");
  assert.equal(resolveRoute("#/School-Demo?x=1"), "school-demo");
  window.location.hash = "";
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  await React.act(async () => { root.render(React.createElement(Root)); });
  assert.equal(text(container.querySelector("h1")), "Message to Task");
  assert.ok([...container.querySelectorAll("a")].some((a) => a.getAttribute("href") === "#/school-demo"));
  await React.act(async () => { window.location.hash = "#/school-demo"; window.dispatchEvent(new dom.window.HashChangeEvent("hashchange")); });
  for (let i = 0; i < 40 && !/Sign in with email/.test(container.textContent); i += 1) await React.act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  assert.match(container.textContent, /Sign in with email/, "the earlier school demo still renders");
  assert.ok([...container.querySelectorAll("a")].some((a) => a.getAttribute("href") === "#/"), "and offers a way back");
  await React.act(async () => root.unmount());
  container.remove();
  window.location.hash = "";
});
