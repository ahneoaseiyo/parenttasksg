import { isValidISODate } from "./dates.js";
import { MAX_MESSAGE_CHARS } from "./extractor.js";
import { assignToMe, confirmationProblems, editDraft } from "./taskModel.js";

export function countChars(text) {
  return Array.from(text).length;
}

// Clamp by code points so an emoji is never cut in half.
export function clampText(text, max = MAX_MESSAGE_CHARS) {
  const chars = Array.from(text);
  return chars.length > max ? { text: chars.slice(0, max).join(""), truncated: true } : { text, truncated: false };
}

export function initialState(today) {
  return {
    text: "", truncated: false, receivedDate: today,
    status: "idle", // idle | extracting | review | error
    requestId: 0, extraction: null, drafts: [], confirmed: false, keepSnippets: true,
    error: null, notice: null,
  };
}

// Dropping the review also bumps requestId so an extraction still in flight is ignored when it returns.
const discardReview = (state, notice) => ({
  ...state, status: "idle", extraction: null, drafts: [], confirmed: false, error: null, requestId: state.requestId + 1,
  notice: state.drafts.length > 0 ? notice : null,
});

export function canExtract(state) {
  const length = countChars(state.text);
  return state.status !== "extracting" && state.text.trim().length > 0 && length <= MAX_MESSAGE_CHARS && isValidISODate(state.receivedDate);
}

export function canSave(state) {
  return state.status === "review" && state.confirmed && confirmationProblems(state.drafts).length === 0;
}

export function assistantReducer(state, action) {
  switch (action.type) {
    case "text/set": {
      const { text, truncated } = clampText(String(action.text ?? ""));
      if (text === state.text && truncated === state.truncated) return state;
      const base = state.status === "idle" ? state : discardReview(state, "The message changed, so the previous review was cleared. Extract again.");
      return { ...base, text, truncated };
    }
    case "date/set": {
      if (!isValidISODate(action.date) || action.date === state.receivedDate) return state;
      const base = state.status === "idle" ? state : discardReview(state, "The message date changed, so the previous review was cleared. Extract again.");
      return { ...base, receivedDate: action.date };
    }
    case "extract/start":
      return canExtract(state) ? { ...state, status: "extracting", requestId: state.requestId + 1, error: null, notice: null, drafts: [], extraction: null, confirmed: false } : state;
    case "extract/success": {
      if (action.requestId !== state.requestId || state.status !== "extracting") return state; // stale result
      const { drafts, ...extraction } = action.extraction;
      return { ...state, status: "review", extraction, drafts, confirmed: false, error: null };
    }
    case "extract/failure":
      if (action.requestId !== state.requestId || state.status !== "extracting") return state;
      return { ...state, status: "error", error: String(action.message || "Extraction failed."), drafts: [], extraction: null };
    case "draft/edit":
      return { ...state, confirmed: false, drafts: state.drafts.map((d) => (d.id === action.id ? editDraft(d, action.patch) : d)) };
    case "draft/assignToMe":
      return { ...state, confirmed: false, drafts: state.drafts.map((d) => (d.id === action.id ? assignToMe(d) : d)) };
    case "draft/remove":
      return { ...state, confirmed: false, drafts: state.drafts.filter((d) => d.id !== action.id) };
    case "confirm/set":
      return { ...state, confirmed: Boolean(action.value) && confirmationProblems(state.drafts).length === 0 };
    case "keepSnippets/set":
      return { ...state, keepSnippets: Boolean(action.value) };
    case "saved": // the pasted message and drafts are dropped as soon as tasks are saved
      return { ...initialState(state.receivedDate), keepSnippets: state.keepSnippets, requestId: state.requestId + 1, notice: action.notice ?? null };
    case "notice/clear":
      return { ...state, notice: null };
    case "reset":
      return { ...initialState(action.today ?? state.receivedDate), requestId: state.requestId + 1 };
    default:
      return state;
  }
}
