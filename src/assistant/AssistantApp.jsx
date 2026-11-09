import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./assistant.css";
import { createDemoExtractor, normalizeExtraction } from "./extractor.js";
import { formatDisplayDate, todayLocalISO } from "./dates.js";
import { assistantReducer, canExtract, canSave, initialState } from "./reducer.js";
import { DEFAULT_PREFS, STORAGE_KEY, createPrefsStorage, createTaskStorage } from "./storage.js";
import { classifyTasks, confirmDrafts, mergeTasks, removeTask, setTaskStatus } from "./taskModel.js";
import { toMarkdown, toPlainText } from "./format.js";
import { Icon } from "./components.jsx";
import { ExtractView, HistoryView, PRIVACY_NOTICE, SettingsView, TasksView } from "./views.jsx";
import { VIEWS, hashForView, resolveView } from "../route.js";

const demoExtractor = createDemoExtractor();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const SUBTITLES = {
  extract: "Paste a message, check the tasks it contains, then save them on this device.",
  tasks: "Your saved tasks, grouped by deadline.",
  history: "What you have saved on this device, by day.",
  settings: "Preferences and your data on this device.",
};

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

export default function AssistantApp({ extractor = demoExtractor, storage, prefsStorage, getToday = () => todayLocalISO(), getNow = () => new Date() }) {
  const taskStorage = useMemo(() => storage ?? createTaskStorage(), [storage]);
  const prefsStore = useMemo(() => prefsStorage ?? createPrefsStorage(), [prefsStorage]);
  const initial = useRef(null);
  if (initial.current === null) initial.current = { loaded: taskStorage.load(), prefs: prefsStore.load() };
  const [tasks, setTasks] = useState(initial.current.loaded.tasks);
  const [storageProblem, setStorageProblem] = useState(initial.current.loaded.problem);
  const [prefs, setPrefs] = useState(initial.current.prefs);
  const [saveError, setSaveError] = useState(null);
  const [today, setToday] = useState(getToday);
  const [state, dispatch] = useReducer(assistantReducer, undefined, () => ({ ...initialState(getToday()), keepSnippets: initial.current.prefs.keepSnippets }));
  const [announce, setAnnounce] = useState("");
  const [copied, setCopied] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [view, setView] = useState(() => resolveView(window.location.hash));
  const [menuOpen, setMenuOpen] = useState(false);
  const reviewHeading = useRef(null);
  const pageHeading = useRef(null);
  const mainRef = useRef(null);
  const menuButton = useRef(null);
  const shownView = useRef(view);

  useEffect(() => {
    const refresh = () => setToday(getToday());
    const onStorage = (event) => { if (event.key === STORAGE_KEY || event.key === null) setTasks(taskStorage.load().tasks); };
    const onHash = () => setView(resolveView(window.location.hash));
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", onStorage); window.removeEventListener("hashchange", onHash);
    };
  }, [getToday, taskStorage]);

  // Moving between sections moves focus to the page heading (not on first load), and updates the tab title.
  const label = VIEWS.find((v) => v.id === view).label;
  useEffect(() => {
    document.title = `${label} · Message to Task`;
    if (shownView.current === view) return; // first load, or an effect re-run: leave focus where it is
    shownView.current = view;
    pageHeading.current?.focus();
  }, [view, label]);
  useEffect(() => { if (view === "extract" && state.status === "review") reviewHeading.current?.focus(); }, [state.status, view]);

  const groups = useMemo(() => classifyTasks(tasks, today), [tasks, today]);
  const copyText = useMemo(() => {
    const options = { today, includeCompleted: prefs.includeCompleted, includeSource: prefs.includeSource };
    return { markdown: toMarkdown(tasks, options), text: toPlainText(tasks, options) };
  }, [tasks, today, prefs]);

  function goTo(id) {
    setView(id);
    setMenuOpen(false);
    const hash = hashForView(id);
    if (window.location.hash !== hash) window.location.hash = hash;
  }

  // Writes to browser storage first and only then updates what is on screen, so the list shown is always
  // the list that was stored. Returns the storage result so callers never report a success that did not happen.
  function persist(next) {
    const result = taskStorage.save(next);
    if (result.ok) {
      setTasks(next);
      setSaveError(null);
    } else {
      setSaveError(result.error);
    }
    return result;
  }

  function onPref(name, value) {
    const next = { ...prefs, [name]: value };
    setPrefs(next);
    prefsStore.save(next);
    if (name === "keepSnippets") dispatch({ type: "keepSnippets/set", value });
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
    const result = persist(merged.tasks);
    if (!result.ok) {
      // Keep the review, the confirmation and the edits exactly as they are so the person can try again.
      setAnnounce("");
      setSaveError(result.reason === "unavailable"
        ? "Your tasks were not saved because browser storage is unavailable. Your reviewed tasks are still here."
        : "Your tasks were not saved because browser storage is full or blocked. Your reviewed tasks are still here, so you can try again.");
      return;
    }
    const parts = [`Saved ${plural(merged.added, "task")} on this device.`];
    if (merged.skippedDuplicates) parts.push(`${plural(merged.skippedDuplicates, "duplicate")} skipped.`);
    if (merged.rejectedForLimit) parts.push(`${plural(merged.rejectedForLimit, "task")} not saved because the list is full.`);
    setAnnounce(parts.join(" "));
    dispatch({ type: "saved", notice: null });
    goTo("tasks");
  }

  async function onCopy(format) {
    const count = groups.overdue.length + groups.upcoming.length + groups.undated.length + (prefs.includeCompleted ? groups.completed.length : 0);
    const ok = await copyToClipboard(copyText[format]);
    setCopied({ format, ok, count });
  }

  function onClearAll() {
    const tasksResult = taskStorage.clear();
    const prefsResult = prefsStore.clear();
    // Change only what was really deleted, so the screen never shows less than is still stored.
    if (tasksResult.ok) { setTasks([]); setCopied(null); setStorageProblem(null); }
    if (prefsResult.ok) { setPrefs({ ...DEFAULT_PREFS }); dispatch({ type: "keepSnippets/set", value: DEFAULT_PREFS.keepSnippets }); }
    if (tasksResult.ok && prefsResult.ok) {
      setSaveError(null);
      setConfirmClear(false);
      dispatch({ type: "reset", today });
      setAnnounce("All saved tasks, settings and the current message were deleted from this browser.");
      return;
    }
    // Incomplete: say exactly what happened, keep the confirmation open so it can be retried, and keep the message being worked on.
    setAnnounce("");
    setSaveError(!tasksResult.ok && !prefsResult.ok ? "Nothing was deleted: this browser blocked removing your saved tasks and settings. Try again."
      : !tasksResult.ok ? "Your saved tasks could not be deleted from this browser and are still saved here. Your settings were deleted. Try again."
      : "Your saved tasks were deleted, but your settings could not be deleted from this browser. Try again.");
  }

  const message = announce || state.notice;
  const todayLabel = formatDisplayDate(today);
  const storageAvailable = taskStorage.available && storageProblem !== "unavailable";

  return (
    <div className="mt-app">
      <a className="mt-skip" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to main content</a>

      <header className="mt-topbar">
        <p className="mt-brand"><span className="mt-brand-mark" aria-hidden="true">✓</span>Message to Task</p>
        <button type="button" className="mt-btn mt-btn--secondary mt-menu-btn" ref={menuButton} aria-expanded={menuOpen} aria-controls="mt-sidebar" onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? "Close menu" : "Menu"}
        </button>
      </header>

      <aside id="mt-sidebar" className={`mt-sidebar ${menuOpen ? "mt-sidebar--open" : ""}`}
        onKeyDown={(e) => { if (e.key === "Escape" && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}>
        <p className="mt-brand mt-brand--side"><span className="mt-brand-mark" aria-hidden="true">✓</span>Message to Task</p>
        <nav aria-label="Main">
          <ul className="mt-nav">
            {VIEWS.map((v) => (
              <li key={v.id}>
                <a href={v.hash} aria-current={view === v.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); goTo(v.id); }}>
                  <Icon name={v.id} /><span>{v.label}</span>
                  {v.id === "tasks" && tasks.length > 0 && <span className="mt-nav-count" aria-label={`${plural(tasks.length, "task")}`}>{tasks.length}</span>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-sidebar-foot">
          <p className="mt-proto-badge">Prototype · demo extractor, not AI</p>
          <p>{PRIVACY_NOTICE}</p>
          <p><a href="#/school-demo">School parent demo (earlier prototype)</a></p>
        </div>
      </aside>

      <main id="main" className="mt-main" tabIndex={-1} ref={mainRef}>
        <div className="mt-content">
          <div className="mt-page-head">
            <h1 tabIndex={-1} ref={pageHeading}>{label}</h1>
            <p>{SUBTITLES[view]}</p>
          </div>
          <p className="mt-banner" role="status" aria-live="polite">{message}</p>
          {storageProblem === "unreadable" && <p className="mt-error" role="alert">Saved data on this device could not be read and was ignored.</p>}
          {storageProblem === "partial" && <p className="mt-error" role="alert">Some saved items were damaged and were skipped.</p>}
          {!storageAvailable && <p className="mt-error" role="alert">Browser storage is unavailable, so tasks cannot be saved in this browser.</p>}
          {saveError && <p className="mt-error" role="alert">{saveError}</p>}

          {view === "extract" && <ExtractView state={state} dispatch={dispatch} todayLabel={todayLabel} onExtract={onExtract} onSave={onSave} reviewHeading={reviewHeading} />}
          {view === "tasks" && (
            <TasksView tasks={tasks} groups={groups} today={today} prefs={prefs} onPref={onPref} copied={copied} copyText={copyText} goTo={goTo}
              onToggle={(id, status) => persist(setTaskStatus(tasks, id, status, getNow()))} onDelete={(id) => persist(removeTask(tasks, id))} onCopy={onCopy} />
          )}
          {view === "history" && <HistoryView tasks={tasks} goTo={goTo} />}
          {view === "settings" && <SettingsView prefs={prefs} onPref={onPref} taskCount={tasks.length} storageAvailable={storageAvailable} confirmClear={confirmClear} setConfirmClear={setConfirmClear} onClearAll={onClearAll} />}
        </div>
      </main>
    </div>
  );
}
