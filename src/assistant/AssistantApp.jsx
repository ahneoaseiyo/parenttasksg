import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./assistant.css";
import { MAX_MESSAGE_CHARS, SAMPLE_MESSAGE, createDemoExtractor, normalizeExtraction } from "./extractor.js";
import { addDays, formatDisplayDate, todayLocalISO } from "./dates.js";
import { assistantReducer, canExtract, canSave, countChars, initialState } from "./reducer.js";
import { STORAGE_KEY, createTaskStorage } from "./storage.js";
import { classifyTasks, confirmDrafts, dueInDays, draftProblems, mergeTasks, ownerLabel, removeTask, setTaskStatus, confirmationProblems } from "./taskModel.js";
import { toMarkdown, toPlainText } from "./format.js";

const demoExtractor = createDemoExtractor();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Source text and task text come from pasted messages. They are only ever rendered as React text
// children (never as HTML), so markup inside a message is shown literally and cannot run.

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok === true;
  } catch {
    return false;
  }
}

function DateField({ id, value, onChange }) {
  // Local text keeps a half-typed date from snapping back while the person edits it.
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);
  return (
    <input id={id} type="date" value={local} onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }} />
  );
}

function OwnerField({ id, draft, dispatch }) {
  // Show exactly what the person types ("Ian" must not be rewritten); the model interprets it.
  const [local, setLocal] = useState(draft.owner.kind === "me" ? "Me" : draft.owner.name);
  const assign = () => { setLocal("Me"); dispatch({ type: "draft/assignToMe", id: draft.id }); };
  const hint = draft.owner.kind === "me" ? "Assigned to you."
    : draft.owner.kind === "other" ? "Named in the message, so it is not assigned to you."
    : "No owner is stated in the message.";
  return (
    <div className="mt-field">
      <label htmlFor={id}>Owner</label>
      <div className="mt-inline">
        <input id={id} type="text" value={local} maxLength={80} placeholder="Nobody named"
          onChange={(e) => { setLocal(e.target.value); dispatch({ type: "draft/edit", id: draft.id, patch: { ownerText: e.target.value } }); }} />
        <button type="button" className="mt-btn mt-btn-secondary" onClick={assign} disabled={draft.owner.kind === "me"}
          aria-label={`Assign to me: ${draft.title.trim() || "this task"}`}>Assign to me</button>
      </div>
      <p className="mt-hint">{hint}</p>
    </div>
  );
}

function DraftCard({ draft, index, dispatch }) {
  const base = `draft-${index}`;
  const edit = (patch) => dispatch({ type: "draft/edit", id: draft.id, patch });
  const ambiguous = draft.dateStatus === "ambiguous";
  const statusText = ambiguous ? "Ambiguous deadline — your choice needed"
    : draft.dateStatus === "resolved" ? `Worked out from “${draft.dateExpression}”`
    : draft.dateStatus === "confirmed" ? "Deadline set by you"
    : draft.dateExpression ? "No deadline (you removed it)" : "No deadline found in the message";
  return (
    <li>
      <article className="mt-card" aria-labelledby={`${base}-h`}>
        <div className="mt-card-head">
          <h3 id={`${base}-h`}>Task {index + 1}</h3>
          <button type="button" className="mt-btn mt-btn-quiet" onClick={() => dispatch({ type: "draft/remove", id: draft.id })}
            aria-label={`Remove task ${index + 1}: ${draft.title.trim() || "untitled"}`}>Remove</button>
        </div>
        <div className="mt-field">
          <label htmlFor={`${base}-title`}>Task title</label>
          <input id={`${base}-title`} type="text" value={draft.title} maxLength={200} onChange={(e) => edit({ title: e.target.value })}
            aria-invalid={draft.title.trim() === ""} />
        </div>
        <div className="mt-grid">
          <OwnerField id={`${base}-owner`} draft={draft} dispatch={dispatch} />
          <div className="mt-field">
            <label htmlFor={`${base}-date`}>Deadline</label>
            <DateField id={`${base}-date`} value={draft.dueDate} onChange={(value) => edit({ dueDate: value })} />
            <p className={`mt-chip ${ambiguous ? "mt-chip-warn" : ""}`}>{statusText}</p>
          </div>
        </div>
        {ambiguous && (
          <div className="mt-warn" role="group" aria-label={`Ambiguous deadline for task ${index + 1}`}>
            <p><strong>Check this deadline.</strong> {draft.dateNote}</p>
            <div className="mt-actions">
              {draft.dateCandidates.map((date) => (
                <button key={date} type="button" className="mt-btn mt-btn-secondary" onClick={() => edit({ dueDate: date })}>Use {formatDisplayDate(date)}</button>
              ))}
              <button type="button" className="mt-btn mt-btn-secondary" onClick={() => edit({ dueDate: null })}>No deadline</button>
            </div>
          </div>
        )}
        <div className="mt-source">
          <p className="mt-label" id={`${base}-src`}>Supporting text from your message</p>
          <blockquote aria-labelledby={`${base}-src`}>{draft.sourceSnippet || "(none)"}</blockquote>
          {!draft.snippetVerified && <p className="mt-warn-text" role="alert">This text could not be matched to your message. Check it carefully.</p>}
        </div>
        {draft.uncertainty.reasons.filter((r) => r !== draft.dateNote).length > 0 && (
          <ul className="mt-notes">
            {draft.uncertainty.reasons.filter((r) => r !== draft.dateNote).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        )}
      </article>
    </li>
  );
}

function TaskRow({ task, today, onToggle, onDelete }) {
  const done = task.status === "done";
  const days = dueInDays(task, today);
  const owner = ownerLabel(task.owner);
  const when = task.dueDate ? `${formatDisplayDate(task.dueDate)}${!done && days < 0 ? ` · overdue by ${plural(-days, "day")}` : !done && days === 0 ? " · due today" : ""}` : "No deadline";
  return (
    <li className={`mt-task ${done ? "mt-task-done" : ""}`}>
      <button type="button" className="mt-check" aria-pressed={done} onClick={() => onToggle(task.id, done ? "open" : "done")}
        aria-label={`${done ? "Mark not done" : "Mark done"}: ${task.title}`}><span aria-hidden="true">{done ? "✓" : ""}</span></button>
      <div className="mt-task-body">
        <p className="mt-task-title">{task.title}</p>
        <p className="mt-task-meta">{[owner && `Owner: ${owner}`, when].filter(Boolean).join(" · ")}</p>
        {task.sourceSnippet && <details><summary>Source text</summary><blockquote>{task.sourceSnippet}</blockquote></details>}
      </div>
      <button type="button" className="mt-btn mt-btn-quiet" onClick={() => onDelete(task.id)} aria-label={`Delete task: ${task.title}`}>Delete</button>
    </li>
  );
}

const GROUPS = [
  ["overdue", "Overdue", "Nothing overdue."], ["upcoming", "Upcoming", "No upcoming deadlines."],
  ["undated", "No deadline", "No undated tasks."], ["completed", "Completed", "Nothing completed yet."],
];

export default function AssistantApp({ extractor = demoExtractor, storage, getToday = () => todayLocalISO(), getNow = () => new Date() }) {
  const taskStorage = useMemo(() => storage ?? createTaskStorage(), [storage]);
  const initial = useRef(null);
  if (initial.current === null) initial.current = taskStorage.load();
  const [tasks, setTasks] = useState(initial.current.tasks);
  const [storageProblem, setStorageProblem] = useState(initial.current.problem);
  const [saveError, setSaveError] = useState(null);
  const [today, setToday] = useState(getToday);
  const [state, dispatch] = useReducer(assistantReducer, undefined, () => initialState(getToday()));
  const [announce, setAnnounce] = useState("");
  const [copyOptions, setCopyOptions] = useState({ includeCompleted: false, includeSource: false });
  const [copied, setCopied] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const reviewHeading = useRef(null);
  const tasksHeading = useRef(null);

  useEffect(() => {
    const refresh = () => setToday(getToday());
    const onStorage = (event) => { if (event.key === STORAGE_KEY || event.key === null) setTasks(taskStorage.load().tasks); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("storage", onStorage); };
  }, [getToday, taskStorage]);

  useEffect(() => { if (state.status === "review") reviewHeading.current?.focus(); }, [state.status]);

  const length = countChars(state.text);
  const groups = useMemo(() => classifyTasks(tasks, today), [tasks, today]);
  const problems = confirmationProblems(state.drafts);
  const copyText = useMemo(() => ({
    markdown: toMarkdown(tasks, { today, ...copyOptions }), text: toPlainText(tasks, { today, ...copyOptions }),
  }), [tasks, today, copyOptions]);

  function persist(next) {
    setTasks(next);
    const result = taskStorage.save(next);
    setSaveError(result.ok ? null : result.error);
  }

  async function onExtract() {
    if (!canExtract(state)) return;
    setAnnounce("");
    dispatch({ type: "extract/start" });
    const requestId = state.requestId + 1;
    try {
      const raw = await extractor.extract({ text: state.text, receivedDate: state.receivedDate });
      dispatch({ type: "extract/success", requestId, extraction: normalizeExtraction(raw, { text: state.text, receivedDate: state.receivedDate, extractor }) });
    } catch {
      // The message is deliberately not included in any error text.
      dispatch({ type: "extract/failure", requestId, message: "Tasks could not be extracted from this message. Try shortening it or removing unusual characters." });
    }
  }

  function onSave() {
    if (!canSave(state)) return;
    const created = confirmDrafts(state.drafts, { now: getNow(), messageDate: state.receivedDate, extractorId: state.extraction.extractorId, keepSnippets: state.keepSnippets });
    const merged = mergeTasks(tasks, created);
    persist(merged.tasks);
    const parts = [`Saved ${plural(merged.added, "task")} on this device.`];
    if (merged.skippedDuplicates) parts.push(`${plural(merged.skippedDuplicates, "duplicate")} skipped.`);
    if (merged.rejectedForLimit) parts.push(`${plural(merged.rejectedForLimit, "task")} not saved because the list is full.`);
    setAnnounce(parts.join(" "));
    dispatch({ type: "saved", notice: null });
    requestAnimationFrame(() => tasksHeading.current?.focus());
  }

  async function onCopy(format) {
    const text = copyText[format];
    const count = groups.overdue.length + groups.upcoming.length + groups.undated.length + (copyOptions.includeCompleted ? groups.completed.length : 0);
    const ok = await copyToClipboard(text);
    setCopied({ format, ok, count });
  }

  function onClearAll() {
    taskStorage.clear();
    setTasks([]);
    setSaveError(null);
    setStorageProblem(null);
    setConfirmClear(false);
    setCopied(null);
    dispatch({ type: "reset", today });
    setAnnounce("All saved tasks and the current message were deleted from this browser.");
  }

  const message = announce || state.notice;
  const todayLabel = formatDisplayDate(today);

  return (
    <div className="mt-page">
      <header className="mt-header">
        <p className="mt-badge">Prototype · demo extractor, not AI</p>
        <h1>Message to Task</h1>
        <p>Paste a message, check the tasks it contains, and keep a simple checklist on this device. No account needed.</p>
      </header>

      <main className="mt-main">
        <section aria-labelledby="paste-h" className="mt-panel">
          <h2 id="paste-h">1. Paste a message</h2>
          <p className="mt-privacy" role="note">
            <strong>Privacy:</strong> messages can contain sensitive details such as names, contact information, health, school or payment information.
            Your text stays in this browser tab — it is not sent anywhere and is cleared when you save. Only the tasks you confirm, each with a
            short excerpt of the sentence it came from, are saved on this device. Avoid pasting more than you need.
          </p>
          <div className="mt-field">
            <label htmlFor="message">Message</label>
            <textarea id="message" rows={8} value={state.text} aria-describedby="message-count message-limit" placeholder="Paste an email, chat message, class notice or note here…"
              onChange={(e) => dispatch({ type: "text/set", text: e.target.value })} autoComplete="off" spellCheck="false" />
            <p className={`mt-count ${length >= MAX_MESSAGE_CHARS ? "mt-count-max" : ""}`} id="message-count">{length.toLocaleString("en-US")} / {MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters</p>
            {state.truncated && <p id="message-limit" className="mt-warn-text" role="alert">Your text was longer than {MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters, so the end was cut off. Extract the rest in a separate message.</p>}
          </div>
          <div className="mt-field">
            <label htmlFor="received">Date this message was received</label>
            <input id="received" type="date" value={state.receivedDate} onChange={(e) => dispatch({ type: "date/set", date: e.target.value })} />
            <p className="mt-hint">Words like “tomorrow” or “Friday” are worked out from this date, not from today ({todayLabel}).</p>
          </div>
          <div className="mt-actions">
            <button type="button" className="mt-btn mt-btn-primary" onClick={onExtract} disabled={!canExtract(state)}>{state.status === "extracting" ? "Extracting…" : "Extract tasks"}</button>
            <button type="button" className="mt-btn mt-btn-secondary" onClick={() => dispatch({ type: "text/set", text: SAMPLE_MESSAGE })}>Try a sample message</button>
            {state.text && <button type="button" className="mt-btn mt-btn-quiet" onClick={() => dispatch({ type: "text/set", text: "" })}>Clear message</button>}
          </div>
        </section>

        <p className="mt-status" role="status" aria-live="polite">{message}</p>
        {state.status === "error" && <p className="mt-error" role="alert">{state.error}</p>}

        {state.status === "review" && (
          <section aria-labelledby="review-h" className="mt-panel">
            <h2 id="review-h" tabIndex={-1} ref={reviewHeading}>2. Review tasks</h2>
            <p className="mt-demo" role="note">
              <strong>Results from: {state.extraction.extractorLabel}.</strong>{" "}
              {state.extraction.isDemo ? "These come from fixed rules, not an AI model. They can miss tasks or misread them, so check each one against its supporting text." : "Check each task against its supporting text."}
            </p>
            {state.extraction.warnings.map((w) => <p key={w} className="mt-warn-text">{w}</p>)}
            {state.drafts.length === 0 ? (
              <p>No tasks were found in this message. You can edit the message and extract again.</p>
            ) : (
              <>
                <ol className="mt-list">{state.drafts.map((draft, index) => <DraftCard key={draft.id} draft={draft} index={index} dispatch={dispatch} />)}</ol>
                <div className="mt-confirm">
                  <label className="mt-check-label">
                    <input type="checkbox" checked={state.confirmed} onChange={(e) => dispatch({ type: "confirm/set", value: e.target.checked })} disabled={problems.length > 0} />
                    <span>I have checked these tasks and want to save them on this device.</span>
                  </label>
                  <label className="mt-check-label">
                    <input type="checkbox" checked={state.keepSnippets} onChange={(e) => dispatch({ type: "keepSnippets/set", value: e.target.checked })} />
                    <span>Keep the supporting text with each saved task (otherwise it is discarded).</span>
                  </label>
                  {problems.length > 0 && (
                    <ul className="mt-notes" aria-label="Fix these before saving">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  )}
                  <button type="button" className="mt-btn mt-btn-primary" onClick={onSave} disabled={!canSave(state)}>Save {plural(state.drafts.length, "task")}</button>
                </div>
              </>
            )}
          </section>
        )}

        <section aria-labelledby="tasks-h" className="mt-panel">
          <h2 id="tasks-h" tabIndex={-1} ref={tasksHeading}>3. Your tasks</h2>
          <p className="mt-hint">Today is {todayLabel}. Tasks are saved only in this browser on this device. They are not synchronised with other devices or accounts, and clearing your browser data deletes them.</p>
          {(storageProblem === "unavailable" || !taskStorage.available) && <p className="mt-warn-text" role="alert">Browser storage is unavailable, so tasks will be lost when this tab closes.</p>}
          {storageProblem === "unreadable" && <p className="mt-warn-text" role="alert">Saved data on this device could not be read and was ignored.</p>}
          {storageProblem === "partial" && <p className="mt-warn-text" role="alert">Some saved items were damaged and were skipped.</p>}
          {saveError && <p className="mt-error" role="alert">{saveError}</p>}
          {tasks.length === 0 ? <p>No saved tasks yet. Extract and confirm some above.</p> : GROUPS.map(([key, heading, empty]) => (
            <div key={key} className="mt-group">
              <h3>{heading} <span className="mt-count-pill">{groups[key].length}</span></h3>
              {groups[key].length === 0 ? <p className="mt-hint">{empty}</p> : (
                <ul className="mt-list">{groups[key].map((task) => (
                  <TaskRow key={task.id} task={task} today={today}
                    onToggle={(id, status) => persist(setTaskStatus(tasks, id, status, getNow()))}
                    onDelete={(id) => persist(removeTask(tasks, id))} />
                ))}</ul>
              )}
            </div>
          ))}

          <div className="mt-copy">
            <h3>Copy your list</h3>
            <div className="mt-options">
              <label className="mt-check-label"><input type="checkbox" checked={copyOptions.includeCompleted} onChange={(e) => setCopyOptions((o) => ({ ...o, includeCompleted: e.target.checked }))} /><span>Include completed tasks</span></label>
              <label className="mt-check-label"><input type="checkbox" checked={copyOptions.includeSource} onChange={(e) => setCopyOptions((o) => ({ ...o, includeSource: e.target.checked }))} /><span>Include supporting text</span></label>
            </div>
            <div className="mt-actions">
              <button type="button" className="mt-btn mt-btn-secondary" onClick={() => onCopy("markdown")} disabled={tasks.length === 0}>Copy as Markdown</button>
              <button type="button" className="mt-btn mt-btn-secondary" onClick={() => onCopy("text")} disabled={tasks.length === 0}>Copy as plain text</button>
            </div>
            <p className="mt-status" role="status" aria-live="polite">
              {copied && (copied.ok ? `Copied ${plural(copied.count, "task")} as ${copied.format === "markdown" ? "Markdown" : "plain text"}.`
                : "Automatic copying is blocked in this browser. Select the text below and copy it yourself.")}
            </p>
            <details open={copied?.ok === false}>
              <summary>Preview what will be copied</summary>
              <textarea readOnly rows={8} aria-label="Preview of the copied list" value={copied?.format === "text" ? copyText.text : copyText.markdown} />
            </details>
          </div>

          <div className="mt-danger">
            <h3>Delete your data</h3>
            {!confirmClear ? (
              <button type="button" className="mt-btn mt-btn-danger" onClick={() => setConfirmClear(true)}>Clear all data</button>
            ) : (
              <div role="group" aria-label="Confirm deleting all data">
                <p>This permanently deletes {plural(tasks.length, "saved task")} and the message you are working on from this browser. It cannot be undone.</p>
                <div className="mt-actions">
                  <button type="button" className="mt-btn mt-btn-danger" onClick={onClearAll}>Yes, delete everything</button>
                  <button type="button" className="mt-btn mt-btn-secondary" onClick={() => setConfirmClear(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="mt-footer">
        <p>Prototype for testing, not production software. It never reads your inbox and makes no network requests with your text.</p>
        <p><a href="#/school-demo">School parent demo (earlier prototype)</a></p>
      </footer>
    </div>
  );
}
