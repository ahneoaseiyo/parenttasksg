# Message to Task (browser-only prototype)

Status: prototype for testing with **synthetic messages only**. It is not production-ready and has not been security-reviewed, accessibility-audited or tested with real users. It uses a **demo extractor made of fixed rules, not AI**, and says so on screen.

## The workflow

Paste → Extract → Review → Save → Copy, with no account. The app has four sections: a 240px sidebar on desktop, and a plain **Menu** button on phones (a disclosure that opens a list of links, with no animation or bottom sheet).

| Section | Address | What it shows |
| --- | --- | --- |
| Extract & Review | `#/` | Paste panel (45% of the width on desktop) beside the review panel (55%); stacked on mobile |
| My Tasks | `#/tasks` | Counts, then Overdue, Upcoming, No deadline and Completed cards with deadline badges, plus Copy |
| Local History | `#/history` | Saved tasks grouped by the day they were saved (built only from saved tasks) |
| Settings | `#/settings` | Default preferences, your data on this device, **Clear all data**, and an about note |

1. **Paste** a message (up to 2,500 characters) and set the date it was received (defaults to the viewer's local date).
2. **Extract** runs the replaceable extraction service. The demo extractor finds action sentences, named owners and date wording.
3. **Review** shows each task with an editable title, owner and deadline, the exact supporting sentence, an *Assign to me* button, a remove button and a flag for ambiguous deadlines. Saving needs an explicit confirmation tick and is blocked while any deadline is still ambiguous.
4. **Save** stores only the confirmed tasks in this browser and takes you to My Tasks. The pasted text and the unconfirmed drafts are cleared. Each task's source sentence is collapsible; it opens by itself when a deadline is ambiguous or the text could not be matched.
5. **Copy** the list as Markdown or plain text from My Tasks.

The earlier school-parent demo is unchanged and reachable at `/#/school-demo`.

## What is kept, and where

| Data | Where it lives | Lifetime |
| --- | --- | --- |
| Pasted message, drafts, review edits | React state in the open tab | Until you save, change the message/date, clear it, or close the tab |
| Confirmed tasks (title, owner, deadline, status, dates) | `localStorage`, key `message-task.v1`, this browser only | Until you delete them or clear site data |
| Short supporting excerpt (one sentence per task, ≤400 chars) | With each saved task, **on by default**, can be switched off before saving | Same as the task |
| Full original message | Not saved by this app. A task keeps at most one short supporting sentence from it (on by default) | – |
| Three on/off preferences (keep supporting sentence, include completed, include source when copying) | `localStorage`, key `message-task.prefs.v1` | Until you clear all data |

Nothing is sent anywhere: the assistant code makes no network requests, reads no inbox, contains no API keys and logs nothing (guarded by automated tests). Tasks are **not synchronised** across devices or browsers.

## Visual design and accessibility

- All colours, the font stack, radii, shadows and spacing are CSS variables in one token block at the top of `src/assistant/assistant.css`. **The Gemini UI/UX specification was not available when this was written, so these values are my own Material-3-inspired choices, not taken from it.** To apply the specification, edit that block (the contrast test will tell you if the new colours are unreadable).
- Layout is mobile-first. From 1024px wide: fixed 240px sidebar and a 45% / 55% split. Below that: one column and the Menu button.
- Every control is at least 44×44 CSS pixels (checkboxes count their whole label row). Focus rings are 3px and visible on every control, including date inputs; a skip link and landmarks are provided; moving between sections moves focus to the page heading and updates the tab title; the mobile header is deliberately not sticky, so it can never cover a focused control.
- Deadline badges always include words ("Overdue by 2 days", "Check deadline"), never colour alone. Text contrast is at least 4.5:1 and control borders and focus rings at least 3:1, computed from the tokens by `contrast.test.js`.

## Extraction service interface

```js
// src/assistant/extractor.js
{ id: "demo-rules-v1", label: "Demo extractor (simple rules, not AI)", isDemo: true,
  async extract({ text, receivedDate }) { return { tasks: [...], warnings: [...] }; } }
```

Pass a different object as the `extractor` prop of `AssistantApp` to replace it. Whatever it returns is treated as **untrusted** and passed through `normalizeExtraction()`, which: bounds counts and lengths, strips control characters, drops invalid dates, never lets a provider assign a task to the user, takes the "demo" flag and label from the extractor object rather than its output, and flags any supporting excerpt that does not appear verbatim in the user's message. A real provider would need a backend with its own authentication, audit logging and privacy review; **no keys may be placed in browser code**.

Task fields: `title`, `owner {kind: unassigned|other, name}`, `sourceSnippet` (+ offsets), `dateExpression` (the raw wording), `dateStatus` (`none|resolved|ambiguous`), `dueDate`, `dateCandidates`, `dateNote`, `uncertainty {level, reasons}`.

## How dates and owners are decided

Relative dates are measured from the **message date you enter**, never from today's date. All arithmetic is on calendar dates in UTC, so time zones and daylight saving cannot shift a day. Weeks run Monday to Sunday. Nothing is guessed: if more than one reading is plausible the deadline is flagged ambiguous and left empty.

| Wording | Result |
| --- | --- |
| today, tomorrow, day after tomorrow, *in N days/weeks/months*, EOD, end of month | Resolved |
| *Friday*, *this Friday*, *coming Friday* | Next such day (same weekday as the message date: *this* = today; bare *Friday* = ambiguous) |
| *next Friday* | Resolved when it falls in a later week, otherwise ambiguous (this week's or next week's) |
| *next week*, *this month*, *end of week* | Ambiguous (no day given / Friday vs Sunday) |
| *20 Nov*, *Nov 20*, *2026-11-20* | Resolved. No year: this year if not past; if it passed within ~6 months, ambiguous (this vs next year); if longer ago, next year with a "year assumed" note |
| *12/11* | Ambiguous (day/month vs month/day) unless one reading is impossible |
| *Thursday 20 Nov* when 20 Nov is not a Thursday, *31 Feb* | Ambiguous (flagged) |
| *last Friday*, *soon*, *ASAP* | Not a deadline |

Owners: a named person ("Sarah to send…", "Mei Ling will book…", "Alex, can you…") is shown as that person and is **not** assigned to you. "I'll…" is attributed to "Message sender". Group or "you" requests ("Parents, please…") stay unassigned with an explanation. The extractor never assigns a task to you; only the *Assign to me* button (or typing "me") does.

## Copy formats

Pasted text is untrusted, so Markdown output escapes brackets, angle brackets, backticks, emphasis characters, leading `#`/`-`/`>`, URL schemes (`https\:`), bare `www.` addresses and HTML entities, and flattens line breaks, so a message cannot add links, images, HTML, headings or extra list items to the copied list. Plain text flattens line breaks and strips control characters. Completed tasks and supporting text are opt-in.

## Tests

`npm test` runs the Node tests (189 tests at the time of writing). The assistant's tests are in `src/assistant/*.test.js`:

- `dates`, `dateParser`: calendar arithmetic, relative and ambiguous dates, month/year/leap boundaries.
- `extractor`: tasks, owners, source evidence, hostile and pathological input, untrusted extractor output.
- `taskModel`, `reducer`: editing, confirmation gating, status, grouping, stale results.
- `storage`: persistence, tampering, quota/unavailable storage, clear-all, no message retention.
- `format`: Markdown/plain-text output and escaping.
- `assistant.ui`: the real React app in jsdom, driven through the whole first-time-user flow.
- `presentation`, `contrast`: badge wording, history grouping, view routing, and computed WCAG contrast from the design tokens.
- `assistant.static`: no network, keys, logging, HTML sinks or stray storage use.

`tests/assistant.spec.js` runs the app in a real browser with Playwright (the CI workflow now runs the whole `tests/` directory): sidebar width, the 45/55 ratio, mobile menu with the keyboard, no horizontal overflow on every section at 320, 375, 414, 768, 1024 and 1280px, 44px touch targets, focus rings on every Tab stop (forwards and backwards), the whole workflow including the clipboard, and that no request leaves the machine or contains message text.

## Known limitations

- The demo extractor is English-only, rule-based and simple. It handles one task per sentence (two actions in one sentence become one task), can miss implied tasks, and can misread text: capitalised words may be taken for names, and fractions such as "1/2" are read as dates (flagged ambiguous). It does not understand times of day, recurring dates, ranges, weekends, holidays or other languages.
- `localStorage` is unencrypted plain text, readable by anyone with access to the browser profile and by any script on the same origin. There is no backup, sync or sharing; clearing site data (or some private-browsing modes) deletes tasks. The list is capped at 500 tasks and two tabs overwrite each other's last write.
- Supporting excerpts are kept by default and may contain personal details; untick the option before saving to discard them.
- Clipboard copying needs HTTPS or localhost; a manual-copy preview is offered if it is blocked. Escaped Markdown shows backslashes if pasted into a plain-text editor, so use "plain text" there.
- Browser testing so far is headless Chromium on Linux only. Safari, Firefox, real phones and tablets, and screen readers (NVDA, VoiceOver, TalkBack) have **not** been tested, and no formal accessibility audit has been done. Requires browsers with `Object.hasOwn` and `<input type="date">` (Chrome 93+, Safari 15.4+, Firefox 92+).
- If browser storage is unavailable, full or blocked, **saving is refused** rather than keeping tasks in memory: the review stays on screen with an error so you can retry, and completing or deleting a task is not applied. There is no "keep for this session only" mode. Likewise, Clear all data reports success only when every deletion is confirmed, and says exactly what remained otherwise.
- Changing a setting does not yet check that the preference was actually written; if storage is blocked, it applies for the current page view only.
- Local History is derived from saved tasks, so deleting a task removes it from history, and it cannot show anything about messages that were not saved.
- The Gemini visual specification was not available (see Visual design above), so the look is similar in spirit at best and has not been compared against it.
- The page and README still carry some ParentTask SG naming from the earlier prototype.

## Local setup

```bash
npm ci
npm test                 # all tests
npm run dev              # http://127.0.0.1:5173  (Message to Task)
                         # http://127.0.0.1:5173/#/school-demo  (earlier school demo)
npm run build && npm run preview

# Real-browser tests (not installed by default):
npm install --no-save --no-package-lock --ignore-scripts @playwright/test@1.56.1
npx playwright install chromium
npx playwright test
```

Try it: open the page, press **Try a sample message**, **Extract tasks**, check the supporting text, resolve the two ambiguous deadlines, tick the confirmation, **Save**, then **Copy as Markdown**. Open **My Tasks**, **Local History** and **Settings** from the sidebar (or the Menu button on a phone). Use **Clear all data** in Settings to start again. No backend, account or API key is needed (`npm run api` is unrelated).
