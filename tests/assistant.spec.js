import { expect, test } from "@playwright/test";

// Real-browser checks of the Message to Task layout, navigation and accessibility.
const PRIVACY = "Tasks are saved on this device. Avoid pasting confidential or sensitive information into this prototype.";
const VIEWS = ["Extract & Review", "My Tasks", "Local History", "Settings"];

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 4, 9, 0, 0) }); // a fixed Wednesday, so relative dates are stable
});

async function open(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}
async function extractSample(page) {
  await page.getByRole("button", { name: "Try a sample message" }).click();
  await page.getByRole("button", { name: "Extract tasks" }).click();
  await expect(page.getByRole("heading", { name: "Review tasks" })).toBeFocused();
}
async function resolveAndSave(page) {
  while (await page.getByRole("button", { name: "No deadline", exact: true }).count()) await page.getByRole("button", { name: "No deadline", exact: true }).first().click();
  await page.getByLabel("I have checked these tasks and want to save them on this device.").check();
  await page.getByRole("button", { name: /^Save \d+ tasks$/ }).click();
  await expect(page.getByRole("heading", { name: "My Tasks", level: 1 })).toBeVisible();
}
async function openMenuIfMobile(page) {
  const menu = page.getByRole("button", { name: /^(Menu|Close menu)$/ });
  if (await menu.isVisible() && (await menu.getAttribute("aria-expanded")) === "false") await menu.click();
}
async function go(page, label) {
  await openMenuIfMobile(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label }).click();
  await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
}
// Populates every screen: a review in progress is left behind while tasks are saved from an earlier message.
async function populate(page) {
  await extractSample(page);
  await resolveAndSave(page);
  await go(page, "Extract & Review");
  await extractSample(page);
}

test.describe("desktop layout", () => {
  test("240px sidebar with the four sections, and a 45% / 55% split", async ({ page }) => {
    await open(page, { width: 1280, height: 900 });
    const sidebar = page.locator("aside.mt-sidebar");
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox()).width).toBe(240);
    await expect(page.getByRole("button", { name: /^(Menu|Close menu)$/ })).toBeHidden();
    const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
    await expect(links).toHaveText(VIEWS);
    await expect(links.nth(0)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Extract & Review", level: 1 })).toBeVisible();
    const input = await page.locator('section[aria-labelledby="paste-h"]').boundingBox();
    const review = await page.locator('section[aria-labelledby="review-h"]').boundingBox();
    expect(Math.abs(input.y - review.y)).toBeLessThan(2); // side by side
    const ratio = input.width / (input.width + review.width);
    expect(ratio).toBeGreaterThan(0.445);
    expect(ratio).toBeLessThan(0.455);
  });

  test("navigating by keyboard moves focus to the page heading and the back button works", async ({ page }) => {
    await open(page, { width: 1280, height: 900 });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
    await page.getByRole("link", { name: "My Tasks" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "My Tasks", level: 1 })).toBeFocused();
    await expect(page.getByRole("link", { name: "My Tasks" })).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(/My Tasks · Message to Task/);
    await go(page, "Settings");
    await page.goBack();
    await expect(page.getByRole("heading", { name: "My Tasks", level: 1 })).toBeVisible();
  });
});

test.describe("mobile navigation", () => {
  test("a plain disclosure menu works with the keyboard and closes on Escape", async ({ page }) => {
    await open(page, { width: 375, height: 812 });
    const menu = page.getByRole("button", { name: "Menu" });
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(nav).toBeHidden();
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link")).toHaveText(VIEWS);
    await page.keyboard.press("Tab");
    await expect(nav.getByRole("link", { name: "Extract & Review" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
    await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
    await page.getByRole("button", { name: "Menu" }).click();
    await nav.getByRole("link", { name: "Local History" }).click();
    await expect(page.getByRole("heading", { name: "Local History", level: 1 })).toBeFocused();
    await expect(nav).toBeHidden();
  });

  test("the menu has no animation (nothing moves between states)", async ({ page }) => {
    await open(page, { width: 375, height: 812 });
    const measure = () => page.evaluate(() => [document.querySelector("#mt-sidebar"), ...document.querySelectorAll("#mt-sidebar a"), document.querySelector(".mt-menu-btn")].map((el) => {
      const s = getComputedStyle(el); return { transition: s.transitionDuration, animation: s.animationName, position: s.position };
    }));
    for (const state of ["closed", "open"]) {
      if (state === "open") await page.getByRole("button", { name: "Menu" }).click();
      for (const styles of await measure()) {
        expect(styles.transition, state).toMatch(/^0s(, 0s)*$/);
        expect(styles.animation, state).toBe("none");
        expect(styles.position, state).not.toBe("fixed");
      }
    }
  });
});

test.describe("responsive layout", () => {
  for (const width of [320, 375, 414, 768, 1024, 1280]) {
    test(`no horizontal overflow on any screen at ${width}px`, async ({ page }) => {
      await open(page, { width, height: 800 });
      await populate(page);
      for (const view of VIEWS) {
        await go(page, view);
        const result = await page.evaluate(() => {
          const iw = window.innerWidth;
          const wide = [...document.querySelectorAll(".mt-app *")].filter((el) => {
            const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
            return r.width > 0 && style.visibility !== "hidden" && !el.closest(".mt-skip") && (r.right > iw + 1 || r.left < -1);
          }).map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60));
          return { scrollWidth: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth, iw, wide: wide.slice(0, 5) };
        });
        expect(result.scrollWidth, `${view} @${width}`).toBeLessThanOrEqual(result.iw);
        expect(result.bodyScroll, `${view} @${width}`).toBeLessThanOrEqual(result.iw);
        expect(result.wide, `${view} @${width}`).toEqual([]);
      }
    });
  }

  test("a long unbroken word in a task title does not break the layout", async ({ page }) => {
    await open(page, { width: 320, height: 800 });
    await page.getByLabel("Message", { exact: true }).fill(`Please send ${"Supercalifragilistic".repeat(8)} by tomorrow.`);
    await page.getByRole("button", { name: "Extract tasks" }).click();
    await page.getByLabel("I have checked these tasks and want to save them on this device.").check();
    await page.getByRole("button", { name: /^Save 1 task$/ }).click();
    await expect(page.getByRole("heading", { name: "My Tasks", level: 1 })).toBeVisible();
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(sw[0]).toBeLessThanOrEqual(sw[1]);
  });
});

test.describe("accessibility", () => {
  for (const [name, viewport] of [["mobile", { width: 375, height: 812 }], ["desktop", { width: 1280, height: 900 }]]) {
    test(`every control is at least 44px in both directions (${name})`, async ({ page }) => {
      await open(page, viewport);
      await populate(page);
      for (const view of VIEWS) {
        await go(page, view);
        if (view === "Settings") await page.getByRole("button", { name: "Clear all data" }).click();
        await openMenuIfMobile(page);
        const small = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll("button, a[href], input, textarea, select, summary")) {
            if (el.closest(".mt-skip")) continue; // measured separately, when focused
            const style = getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || el.getClientRects().length === 0) continue;
            // A checkbox is operated through its whole label row, so measure that.
            const box = (el.type === "checkbox" && el.closest("label") ? el.closest("label") : el).getBoundingClientRect();
            if (box.height < 43.5 || box.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || el.id).trim().slice(0, 40)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
          }
          return out;
        });
        expect(small, `${view} (${name})`).toEqual([]);
      }
    });
  }

  test("the skip link is a full-size control when focused", async ({ page }) => {
    await open(page, { width: 375, height: 812 });
    await page.keyboard.press("Tab");
    const link = page.getByRole("link", { name: "Skip to main content" });
    await expect(link).toBeFocused();
    const box = await link.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
  });

  for (const [name, viewport] of [["mobile", { width: 375, height: 812 }], ["desktop", { width: 1280, height: 900 }]]) {
    test(`every keyboard stop has a visible focus ring and is not hidden behind the header (${name})`, async ({ page }) => {
      await open(page, viewport);
      await populate(page);
      await go(page, "Extract & Review");
      const problems = [];
      let stops = 0;
      await page.locator("body").click({ position: { x: 1, y: 1 } });
      await page.keyboard.press("Tab");
      for (let i = 0; i < 70; i += 1) {
        const info = await page.evaluate(() => {
          const el = document.activeElement; if (!el || el === document.body) return null;
          const s = getComputedStyle(el); const r = el.getBoundingClientRect();
          const topbar = document.querySelector(".mt-topbar"); const barBottom = topbar && getComputedStyle(topbar).display !== "none" ? topbar.getBoundingClientRect().bottom : 0;
          return { name: (el.getAttribute("aria-label") || el.textContent || el.id || el.tagName).trim().slice(0, 40), outlineWidth: parseFloat(s.outlineWidth), outlineStyle: s.outlineStyle, shadow: s.boxShadow, top: r.top, barBottom, inBar: Boolean(el.closest(".mt-topbar")) };
        });
        if (info) {
          stops += 1;
          const ring = info.outlineStyle !== "none" && info.outlineWidth >= 2;
          if (!ring) problems.push(`no focus ring: ${info.name}`);
          if (!info.inBar && info.top < info.barBottom - 1) problems.push(`hidden behind header: ${info.name}`);
        }
        await page.keyboard.press("Tab");
      }
      expect(stops).toBeGreaterThan(30);
      for (let i = 0; i < 70; i += 1) { // and backwards: that is when a sticky header can end up covering the focused element
        await page.keyboard.press("Shift+Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement; if (!el || el === document.body) return null;
          const topbar = document.querySelector(".mt-topbar"); const barBottom = topbar && getComputedStyle(topbar).display !== "none" ? topbar.getBoundingClientRect().bottom : 0;
          return { name: (el.getAttribute("aria-label") || el.textContent || el.id || el.tagName).trim().slice(0, 40), top: el.getBoundingClientRect().top, barBottom, inBar: Boolean(el.closest(".mt-topbar")) };
        });
        if (info && !info.inBar && info.top < info.barBottom - 1) problems.push(`hidden behind header (backwards): ${info.name}`);
      }
      expect(problems).toEqual([]);
    });
  }

  test("screens have landmarks, one h1, and named controls", async ({ page }) => {
    await open(page, { width: 1280, height: 900 });
    await populate(page);
    for (const view of VIEWS) {
      await go(page, view);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(1);
      const unnamed = await page.evaluate(() => [...document.querySelectorAll("button, a[href], input:not([type=hidden]), textarea")].filter((el) => {
        if (el.getClientRects().length === 0) return false;
        const labelled = el.getAttribute("aria-label") || el.textContent.trim() || (el.labels && el.labels.length) || el.getAttribute("aria-labelledby");
        return !labelled;
      }).map((el) => el.outerHTML.slice(0, 80)));
      expect(unnamed, view).toEqual([]);
    }
  });
});

test.describe("workflow in a real browser", () => {
  test("paste → extract → review → save → copy, with history, settings and clear-all", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const external = []; const bodies = [];
    page.on("request", (r) => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") external.push(r.url()); if (r.postData()) bodies.push(r.postData()); if (r.url().includes("water")) bodies.push(r.url()); });
    await open(page, { width: 1280, height: 900 });

    await expect(page.getByText(PRIVACY).first()).toBeVisible();
    await extractSample(page);
    const first = page.locator("article").first();
    const evidence = first.locator("details.mt-evidence");
    await expect(evidence).not.toHaveAttribute("open", "");
    await evidence.locator("summary").click();
    await expect(evidence.locator("blockquote")).toBeVisible();
    await expect(evidence.locator("blockquote")).toHaveText("Please bring a water bottle and a spare set of clothes this Friday.");
    await first.getByLabel("Task title").fill("Bring water bottle and clothes");
    await first.getByRole("button", { name: /^Assign to me/ }).click();
    await expect(first.getByLabel("Owner")).toHaveValue("Me");
    await expect(page.getByRole("button", { name: /^Save 6 tasks$/ })).toBeDisabled();
    await resolveAndSave(page);
    await expect(page.getByRole("status").first()).toHaveText("Saved 6 tasks on this device.");

    for (const heading of ["Overdue", "Upcoming", "No deadline", "Completed"]) await expect(page.getByRole("heading", { name: new RegExp(`^${heading}`), level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Mark done: Send the final slides" }).click();
    await expect(page.locator("section[aria-labelledby=group-completed] .mt-task-title", { hasText: "Send the final slides" })).toBeVisible();
    await expect(page.locator("section[aria-labelledby=group-completed]").getByText(/Completed Wed 4 Nov 2026/)).toBeVisible();

    await page.getByRole("button", { name: "Copy as Markdown" }).click();
    await expect(page.getByText("Copied 5 tasks as Markdown.")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^# Tasks\n\n## Upcoming\n- \[ \] Bring water bottle and clothes \(Owner: Me; Due: Fri 6 Nov 2026\)/);
    await page.getByRole("button", { name: "Copy as plain text" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^TASKS\n\nUPCOMING\n/);

    await go(page, "Local History");
    await expect(page.getByRole("heading", { name: /^Saved Wed 4 Nov 2026/, level: 2 })).toBeVisible();
    await expect(page.getByText("Send the final slides")).toBeVisible();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();

    await go(page, "Settings");
    await page.getByLabel("Keep the supporting sentence with each saved task by default").uncheck();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Keep the supporting sentence with each saved task by default")).not.toBeChecked();
    await go(page, "Extract & Review");
    await extractSample(page);
    await expect(page.getByLabel("Keep the supporting text with each saved task (otherwise it is discarded).")).not.toBeChecked();
    await go(page, "My Tasks");
    await expect(page.getByText("Send the final slides").first()).toBeVisible();

    await go(page, "Settings");
    await page.getByRole("button", { name: "Clear all data" }).click();
    await page.getByRole("button", { name: "Yes, delete everything" }).click();
    await expect(page.getByRole("status").first()).toContainText("deleted from this browser");
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    await go(page, "My Tasks");
    await expect(page.getByRole("heading", { name: "No saved tasks yet" })).toBeVisible();

    expect(external, "no request leaves this machine").toEqual([]);
    expect(bodies.filter((b) => /water|slides|excursion/i.test(b)), "message text is never sent in a request").toEqual([]);
  });

  test("privacy wording is shown and no zero-retention claim is made on any screen", async ({ page }) => {
    await open(page, { width: 1280, height: 900 });
    await populate(page);
    for (const view of VIEWS) {
      await go(page, view);
      const text = await page.locator("body").innerText();
      if (view !== "Local History") expect(text, view).toContain(PRIVACY);
      expect(text, view).not.toMatch(/zero[- ](data|retention)|no data (is )?(retained|stored|kept)|nothing is (stored|saved|kept)|never (stored|saved|retained|kept)|not stored|anonymous|private by design|100% private/i);
    }
  });

  test("the earlier school demo is still reachable", async ({ page }) => {
    await page.goto("/#/school-demo");
    await expect(page.getByText("Back to Message to Task")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in with email/ })).toBeVisible();
  });
});
