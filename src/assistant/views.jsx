import { MAX_MESSAGE_CHARS, SAMPLE_MESSAGE } from "./extractor.js";
import { formatDisplayDate } from "./dates.js";
import { Badge, DraftCard, Icon, TaskCard } from "./components.jsx";
import { canExtract, canSave, countChars } from "./reducer.js";
import { confirmationProblems, ownerLabel } from "./taskModel.js";
import { groupHistory, localDateOf } from "./presentation.js";

export const PRIVACY_NOTICE = "Tasks are saved on this device. Avoid pasting confidential or sensitive information into this prototype.";
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function EmptyState({ title, children, action }) {
  return (
    <div className="mt-empty">
      <p className="mt-empty-title">{title}</p>
      <p>{children}</p>
      {action}
    </div>
  );
}

// ── Extract & Review ─────────────────────────────────────────────────────────

export function ExtractView({ state, dispatch, todayLabel, onExtract, onSave, reviewHeading }) {
  const length = countChars(state.text);
  const problems = confirmationProblems(state.drafts);
  const extracting = state.status === "extracting";
  return (
    <div className="mt-split">
      <section aria-labelledby="paste-h" className="mt-card">
        <h2 id="paste-h" className="mt-card-title">Paste a message</h2>
        <p className="mt-notice" role="note">
          <strong>{PRIVACY_NOTICE}</strong>{" "}
          Pasted text stays in this browser tab and is cleared when you save or clear it. This prototype does not send it anywhere.
        </p>
        <div className="mt-field">
          <label htmlFor="message">Message</label>
          <textarea id="message" rows={8} value={state.text} aria-describedby="message-count message-limit" placeholder="Paste an email, chat message, class notice or note here…"
            onChange={(e) => dispatch({ type: "text/set", text: e.target.value })} autoComplete="off" spellCheck="false" />
          <p className={`mt-count ${length >= MAX_MESSAGE_CHARS ? "mt-count--max" : ""}`} id="message-count">{length.toLocaleString("en-US")} / {MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters</p>
          {state.truncated && <p id="message-limit" className="mt-alert-text" role="alert">Your text was longer than {MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters, so the end was cut off. Extract the rest in a separate message.</p>}
        </div>
        <div className="mt-field">
          <label htmlFor="received">Date this message was received</label>
          <input id="received" type="date" value={state.receivedDate} onChange={(e) => dispatch({ type: "date/set", date: e.target.value })} />
          <p className="mt-hint">Words like “tomorrow” or “Friday” are worked out from this date, not from today ({todayLabel}).</p>
        </div>
        <div className="mt-actions">
          <button type="button" className="mt-btn mt-btn--primary" onClick={onExtract} disabled={!canExtract(state)}>{extracting ? "Extracting…" : "Extract tasks"}</button>
          <button type="button" className="mt-btn mt-btn--secondary" onClick={() => dispatch({ type: "text/set", text: SAMPLE_MESSAGE })}>Try a sample message</button>
          {state.text && <button type="button" className="mt-btn mt-btn--quiet" onClick={() => dispatch({ type: "text/set", text: "" })}>Clear message</button>}
        </div>
      </section>

      <section aria-labelledby="review-h" className="mt-card" aria-busy={extracting}>
        <div className="mt-card-head">
          <h2 id="review-h" className="mt-card-title" tabIndex={-1} ref={reviewHeading}>Review tasks</h2>
          {state.status === "review" && state.drafts.length > 0 && <span className="mt-count-pill">{plural(state.drafts.length, "task")}</span>}
        </div>
        {state.status === "error" && <p className="mt-error" role="alert">{state.error}</p>}
        {(state.status === "idle" || state.status === "error") && (
          <EmptyState title="Your review appears here">
            Paste a message and choose <strong>Extract tasks</strong>. You will check each task against the sentence it came from before anything is saved.
          </EmptyState>
        )}
        {extracting && <p className="mt-hint">Extracting…</p>}
        {state.status === "review" && (
          <>
            <p className="mt-notice mt-notice--info" role="note">
              <strong>Results from: {state.extraction.extractorLabel}.</strong>{" "}
              {state.extraction.isDemo ? "These come from fixed rules, not an AI model. They can miss tasks or misread them, so check each one against its supporting text." : "Check each task against its supporting text."}
            </p>
            {state.extraction.warnings.map((w) => <p key={w} className="mt-alert-text">{w}</p>)}
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
                  {problems.length > 0 && <ul className="mt-notes" aria-label="Fix these before saving">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
                  <button type="button" className="mt-btn mt-btn--primary" onClick={onSave} disabled={!canSave(state)}>Save {plural(state.drafts.length, "task")}</button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ── My Tasks ─────────────────────────────────────────────────────────────────

const GROUPS = [
  ["overdue", "Overdue", "danger", "Nothing overdue."], ["upcoming", "Upcoming", "info", "No upcoming deadlines."],
  ["undated", "No deadline", "neutral", "No tasks without a deadline."], ["completed", "Completed", "ok", "Nothing completed yet."],
];

export function TasksView({ tasks, groups, today, prefs, onPref, onToggle, onDelete, onCopy, copied, copyText, goTo }) {
  const included = groups.overdue.length + groups.upcoming.length + groups.undated.length + (prefs.includeCompleted ? groups.completed.length : 0);
  const preview = copied?.format === "text" ? copyText.text : copyText.markdown;
  return (
    <>
      <p className="mt-notice mt-notice--info">{PRIVACY_NOTICE} They are not synchronised with other devices or accounts, and clearing your browser data deletes them.</p>
      {tasks.length === 0 ? (
        <section className="mt-card" aria-labelledby="tasks-empty-h">
          <h2 id="tasks-empty-h" className="mt-card-title">No saved tasks yet</h2>
          <EmptyState title="Nothing here yet" action={<button type="button" className="mt-btn mt-btn--primary" onClick={() => goTo("extract")}>Go to Extract &amp; Review</button>}>
            Extract and confirm some tasks and they will appear here, grouped by deadline.
          </EmptyState>
        </section>
      ) : (
        <>
          <ul className="mt-stats" aria-label="Task counts">
            {GROUPS.map(([key, heading, tone]) => (
              <li key={key} className={`mt-stat mt-stat--${tone}`}><span className="mt-stat-num">{groups[key].length}</span><span className="mt-stat-label">{heading}</span></li>
            ))}
          </ul>
          {GROUPS.map(([key, heading, tone, empty]) => (
            <section key={key} className={`mt-card mt-card--${tone}`} aria-labelledby={`group-${key}`}>
              <h2 id={`group-${key}`} className="mt-card-title">{heading} <span className="mt-count-pill">{groups[key].length}</span></h2>
              {groups[key].length === 0 ? <p className="mt-hint">{empty}</p> : (
                <ul className="mt-list">{groups[key].map((task) => <TaskCard key={task.id} task={task} today={today} onToggle={onToggle} onDelete={onDelete} />)}</ul>
              )}
            </section>
          ))}
          <section className="mt-card mt-copy" aria-labelledby="copy-h">
            <h2 id="copy-h" className="mt-card-title">Copy your list</h2>
            <div className="mt-options">
              <label className="mt-check-label"><input type="checkbox" checked={prefs.includeCompleted} onChange={(e) => onPref("includeCompleted", e.target.checked)} /><span>Include completed tasks</span></label>
              <label className="mt-check-label"><input type="checkbox" checked={prefs.includeSource} onChange={(e) => onPref("includeSource", e.target.checked)} /><span>Include supporting text</span></label>
            </div>
            <div className="mt-actions">
              <button type="button" className="mt-btn mt-btn--primary" onClick={() => onCopy("markdown")}>Copy as Markdown</button>
              <button type="button" className="mt-btn mt-btn--secondary" onClick={() => onCopy("text")}>Copy as plain text</button>
            </div>
            <p className="mt-hint" role="status" aria-live="polite">
              {copied && (copied.ok ? `Copied ${plural(copied.count || included, "task")} as ${copied.format === "markdown" ? "Markdown" : "plain text"}.`
                : "Automatic copying is blocked in this browser. Select the text below and copy it yourself.")}
            </p>
            <details open={copied?.ok === false} className="mt-evidence">
              <summary><span className="mt-evidence-label">Preview</span><span className="mt-evidence-preview">What will be copied</span></summary>
              <textarea readOnly rows={8} aria-label="Preview of the copied list" value={preview} />
            </details>
          </section>
        </>
      )}
    </>
  );
}

// ── Local History ────────────────────────────────────────────────────────────

export function HistoryView({ tasks, goTo }) {
  const groups = groupHistory(tasks);
  return (
    <>
      <p className="mt-notice mt-notice--info">A record of what you have saved on this device, built from your saved tasks. The full message you pasted is not kept here, though a task can keep a short supporting sentence from it (you can change that in Settings).</p>
      {groups.length === 0 ? (
        <section className="mt-card" aria-labelledby="history-empty-h">
          <h2 id="history-empty-h" className="mt-card-title">No history yet</h2>
          <EmptyState title="Nothing saved yet" action={<button type="button" className="mt-btn mt-btn--primary" onClick={() => goTo("extract")}>Go to Extract &amp; Review</button>}>
            Tasks you save will be listed here by the day you saved them.
          </EmptyState>
        </section>
      ) : groups.map((group, index) => (
        <section key={group.date} className="mt-card" aria-labelledby={`history-${index}`}>
          <h2 id={`history-${index}`} className="mt-card-title">
            {group.date === "unknown" ? "Saved on an unknown date" : `Saved ${formatDisplayDate(group.date)}`} <span className="mt-count-pill">{plural(group.tasks.length, "task")}</span>
          </h2>
          <ul className="mt-history-list">
            {group.tasks.map((task) => (
              <li key={task.id} className="mt-history-row">
                <p className="mt-task-title">{task.title}</p>
                <p className="mt-task-meta">
                  <Badge tone={task.status === "done" ? "ok" : "neutral"} label={task.status === "done" ? "Done" : "Open"} />
                  {ownerLabel(task.owner) && <span className="mt-chip">Owner: {ownerLabel(task.owner)}</span>}
                  {task.messageDate && <span className="mt-hint">From a message dated {formatDisplayDate(task.messageDate)}</span>}
                  {task.status === "done" && task.completedAt && <span className="mt-hint">Completed {formatDisplayDate(localDateOf(task.completedAt))}</span>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function SettingsView({ prefs, onPref, taskCount, storageAvailable, confirmClear, setConfirmClear, onClearAll }) {
  return (
    <>
      <section className="mt-card" aria-labelledby="set-save-h">
        <h2 id="set-save-h" className="mt-card-title">Saving</h2>
        <label className="mt-check-label">
          <input type="checkbox" checked={prefs.keepSnippets} onChange={(e) => onPref("keepSnippets", e.target.checked)} />
          <span>Keep the supporting sentence with each saved task by default</span>
        </label>
        <p className="mt-hint">The supporting sentence helps you check a task later but may contain personal details. You can still change this for each message before saving.</p>
      </section>
      <section className="mt-card" aria-labelledby="set-copy-h">
        <h2 id="set-copy-h" className="mt-card-title">Copying</h2>
        <label className="mt-check-label"><input type="checkbox" checked={prefs.includeCompleted} onChange={(e) => onPref("includeCompleted", e.target.checked)} /><span>Include completed tasks when copying</span></label>
        <label className="mt-check-label"><input type="checkbox" checked={prefs.includeSource} onChange={(e) => onPref("includeSource", e.target.checked)} /><span>Include supporting text when copying</span></label>
      </section>
      <section className="mt-card" aria-labelledby="set-data-h">
        <h2 id="set-data-h" className="mt-card-title">Your data</h2>
        <p>{PRIVACY_NOTICE}</p>
        <p className="mt-hint">
          {storageAvailable ? `${plural(taskCount, "task")} saved in this browser.` : "Browser storage is unavailable, so tasks cannot be saved in this browser."}{" "}
          They are not synchronised with other devices or accounts. Clearing your browser data also deletes them.
        </p>
        {!confirmClear ? (
          <button type="button" className="mt-btn mt-btn--danger" onClick={() => setConfirmClear(true)}>Clear all data</button>
        ) : (
          <div role="group" aria-label="Confirm deleting all data" className="mt-callout mt-callout--danger">
            <p>This permanently deletes {plural(taskCount, "saved task")}, your settings and the message you are working on from this browser. It cannot be undone.</p>
            <div className="mt-actions">
              <button type="button" className="mt-btn mt-btn--danger" onClick={onClearAll}>Yes, delete everything</button>
              <button type="button" className="mt-btn mt-btn--secondary" onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
      <section className="mt-card" aria-labelledby="set-about-h">
        <h2 id="set-about-h" className="mt-card-title">About this prototype</h2>
        <ul className="mt-plain-list">
          <li>The extractor is a set of simple fixed rules, <strong>not AI</strong>, and it can be wrong.</li>
          <li>No account or sign-in. Nothing you paste is sent anywhere, and your inbox is never read.</li>
          <li>For testing with made-up messages. It is not production software.</li>
        </ul>
      </section>
    </>
  );
}

export { Icon };
