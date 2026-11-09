import { useEffect, useState } from "react";
import { formatDisplayDate } from "./dates.js";
import { draftBadge, previewText, taskBadge } from "./presentation.js";
import { ownerLabel } from "./taskModel.js";

// Message and task text is untrusted. It is only ever rendered as React text children, never as HTML.

const ICON_PATHS = {
  extract: <path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.2 5.8L21 11l-5.8 2.2L13 19l-2.2-5.8L5 11l5.8-2.2L13 3z" />,
  tasks: <path d="M9 6h11M9 12h11M9 18h11M3.5 6l1.5 1.5L7 5M3.5 12l1.5 1.5L7 11M3.5 18l1.5 1.5L7 17" />,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  settings: <><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
};

export function Icon({ name }) {
  return (
    <svg className="mt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name]}
    </svg>
  );
}

export function Badge({ tone, label }) {
  return <span className={`mt-badge mt-badge--${tone}`}>{label}</span>;
}

// Collapsible source evidence. The summary shows a one-line preview so the evidence is glanceable;
// it opens by default when something needs checking.
export function SourceEvidence({ snippet, verified = true, defaultOpen = false }) {
  return (
    <details className="mt-evidence" open={defaultOpen}>
      <summary>
        <span className="mt-evidence-label">Source text</span>
        <span className="mt-evidence-preview">{snippet ? `“${previewText(snippet)}”` : "(none)"}</span>
      </summary>
      <blockquote>{snippet || "(none)"}</blockquote>
      {!verified && <p className="mt-alert-text" role="alert">This text could not be matched to your message. Check it carefully.</p>}
    </details>
  );
}

function DateField({ id, value, onChange }) {
  // Local text keeps a half-typed date from snapping back while the person edits it.
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);
  return <input id={id} type="date" value={local} onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }} />;
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
        <button type="button" className="mt-btn mt-btn--secondary" onClick={assign} disabled={draft.owner.kind === "me"}
          aria-label={`Assign to me: ${draft.title.trim() || "this task"}`}>Assign to me</button>
      </div>
      <p className="mt-hint">{hint}</p>
    </div>
  );
}

export function DraftCard({ draft, index, dispatch }) {
  const base = `draft-${index}`;
  const edit = (patch) => dispatch({ type: "draft/edit", id: draft.id, patch });
  const ambiguous = draft.dateStatus === "ambiguous";
  const badge = draftBadge(draft);
  const otherNotes = draft.uncertainty.reasons.filter((r) => r !== draft.dateNote);
  return (
    <li>
      <article className={`mt-draft ${ambiguous ? "mt-draft--attention" : ""}`} aria-labelledby={`${base}-h`}>
        <div className="mt-draft-head">
          <h3 id={`${base}-h`}><span className="mt-step-dot" aria-hidden="true">{index + 1}</span>Task {index + 1}</h3>
          <Badge {...badge} />
          <button type="button" className="mt-btn mt-btn--quiet" onClick={() => dispatch({ type: "draft/remove", id: draft.id })}
            aria-label={`Remove task ${index + 1}: ${draft.title.trim() || "untitled"}`}>Remove</button>
        </div>
        <div className="mt-field mt-field--title">
          <label htmlFor={`${base}-title`}>Task title</label>
          <input id={`${base}-title`} type="text" value={draft.title} maxLength={200} onChange={(e) => edit({ title: e.target.value })} aria-invalid={draft.title.trim() === ""} />
        </div>
        <div className="mt-field-row">
          <OwnerField id={`${base}-owner`} draft={draft} dispatch={dispatch} />
          <div className="mt-field">
            <label htmlFor={`${base}-date`}>Deadline</label>
            <DateField id={`${base}-date`} value={draft.dueDate} onChange={(value) => edit({ dueDate: value })} />
            <p className="mt-hint">{draft.dateStatus === "resolved" ? "Worked out from the message date." : draft.dateStatus === "confirmed" ? "You chose this date." : "Optional."}</p>
          </div>
        </div>
        {ambiguous && (
          <div className="mt-callout" role="group" aria-label={`Ambiguous deadline for task ${index + 1}`}>
            <p><strong>Check this deadline.</strong> {draft.dateNote}</p>
            <div className="mt-actions">
              {draft.dateCandidates.map((date) => (
                <button key={date} type="button" className="mt-btn mt-btn--secondary" onClick={() => edit({ dueDate: date })}>Use {formatDisplayDate(date)}</button>
              ))}
              <button type="button" className="mt-btn mt-btn--secondary" onClick={() => edit({ dueDate: null })}>No deadline</button>
            </div>
          </div>
        )}
        <SourceEvidence snippet={draft.sourceSnippet} verified={draft.snippetVerified} defaultOpen={ambiguous || !draft.snippetVerified} />
        {otherNotes.length > 0 && <ul className="mt-notes">{otherNotes.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      </article>
    </li>
  );
}

export function TaskCard({ task, today, onToggle, onDelete }) {
  const done = task.status === "done";
  const badge = taskBadge(task, today);
  const owner = ownerLabel(task.owner);
  return (
    <li className={`mt-task mt-task--${badge.tone}`}>
      <button type="button" className="mt-check" aria-pressed={done} onClick={() => onToggle(task.id, done ? "open" : "done")}
        aria-label={`${done ? "Mark not done" : "Mark done"}: ${task.title}`}><span aria-hidden="true">{done ? "✓" : ""}</span></button>
      <div className="mt-task-body">
        <p className="mt-task-title">{task.title}</p>
        <p className="mt-task-meta">
          <Badge {...badge} />
          {owner && <span className="mt-chip">Owner: {owner}</span>}
        </p>
        {task.sourceSnippet && <SourceEvidence snippet={task.sourceSnippet} />}
      </div>
      <button type="button" className="mt-btn mt-btn--quiet" onClick={() => onDelete(task.id)} aria-label={`Delete task: ${task.title}`}>Delete</button>
    </li>
  );
}
