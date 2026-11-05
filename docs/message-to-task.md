# Message to Task (browser-only prototype)

Status: prototype for testing with **synthetic messages only**. It is not production-ready and has not been security-reviewed, accessibility-audited or tested with real users. It uses a **demo extractor made of fixed rules, not AI**, and says so on screen.

## The workflow

Paste → Extract → Review → Save → Copy, on one page, with no account.

1. **Paste** a message (up to 2,500 characters) and set the date it was received (defaults to the viewer's local date).
2. **Extract** runs the replaceable extraction service. The demo extractor finds action sentences, named owners and date wording.
3. **Review** shows each task with an editable title, owner and deadline, the exact supporting sentence, an *Assign to me* button, a remove button and a flag for ambiguous deadlines. Saving needs an explicit confirmation tick and is blocked while any deadline is still ambiguous.
4. **Save** stores only the confirmed tasks in this browser. The pasted text and the unconfirmed drafts are discarded.
5. **Copy** the list as Markdown or plain text. Tasks are grouped as Overdue, Upcoming, No deadline and Completed.

The earlier school-parent demo is unchanged and reachable at `/#/school-demo`.

## What is kept, and where

| Data | Where it lives | Lifetime |
| --- | --- | --- |
| Pasted message, drafts, review edits | React state in the open tab | Until you save, change the message/date, clear it, or close the tab |
| Confirmed tasks (title, owner, deadline, status, dates) | `localStorage`, key `message-task.v1`, this browser only | Until you delete them or clear site data |
| Short supporting excerpt (one sentence per task, ≤400 chars) | With each saved task, **on by default**, can be switched off before saving | Same as the task |
| Full original message | **Never stored** | – |

Nothing is sent anywhere: the assistant code makes no network requests, reads no inbox, contains no API keys and logs nothing (guarded by automated tests). Tasks are **not synchronised** across devices or browsers.

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

`npm test` runs everything (167 tests at the time of writing). The assistant's tests are in `src/assistant/*.test.js`:

- `dates`, `dateParser`: calendar arithmetic, relative and ambiguous dates, month/year/leap boundaries.
- `extractor`: tasks, owners, source evidence, hostile and pathological input, untrusted extractor output.
- `taskModel`, `reducer`: editing, confirmation gating, status, grouping, stale results.
- `storage`: persistence, tampering, quota/unavailable storage, clear-all, no message retention.
- `format`: Markdown/plain-text output and escaping.
- `assistant.ui`: the real React app in jsdom, driven through the whole first-time-user flow.
- `assistant.static`: no network, keys, logging, HTML sinks or stray storage use.

## Known limitations

- The demo extractor is English-only, rule-based and simple. It handles one task per sentence (two actions in one sentence become one task), can miss implied tasks, and can misread text: capitalised words may be taken for names, and fractions such as "1/2" are read as dates (flagged ambiguous). It does not understand times of day, recurring dates, ranges, weekends, holidays or other languages.
- `localStorage` is unencrypted plain text, readable by anyone with access to the browser profile and by any script on the same origin. There is no backup, sync or sharing; clearing site data (or some private-browsing modes) deletes tasks. The list is capped at 500 tasks and two tabs overwrite each other's last write.
- Supporting excerpts are kept by default and may contain personal details; untick the option before saving to discard them.
- Clipboard copying needs HTTPS or localhost; a manual-copy preview is offered if it is blocked. Escaped Markdown shows backslashes if pasted into a plain-text editor, so use "plain text" there.
- Verified only in jsdom and Node. The Playwright specs, real browsers, the mobile layout (written mobile-first, not visually checked), screen readers and keyboard-only use have **not** been tested. Requires browsers with `Object.hasOwn` and `<input type="date">` (Chrome 93+, Safari 15.4+, Firefox 92+).
- The product blueprint referred to in the request was not available when this was built; behaviour follows the written requirements only.
- The page and README still carry some ParentTask SG naming from the earlier prototype.

## Local setup

```bash
npm ci
npm test                 # all tests
npm run dev              # http://127.0.0.1:5173  (Message to Task)
                         # http://127.0.0.1:5173/#/school-demo  (earlier school demo)
npm run build && npm run preview
```

Try it: open the page, press **Try a sample message**, **Extract tasks**, check the supporting text, resolve the two ambiguous deadlines, tick the confirmation, **Save**, then **Copy as Markdown**. Use **Clear all data** to start again. No backend, account or API key is needed (`npm run api` is unrelated).
