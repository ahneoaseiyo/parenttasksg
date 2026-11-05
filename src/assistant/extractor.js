import { combineExpressions, findDateExpressions } from "./dateParser.js";
import { isValidISODate } from "./dates.js";

// ── Extraction service interface ─────────────────────────────────────────────
// Any extractor (the demo rules below, or a future AI-backed service) must implement:
//   { id: string, label: string, isDemo: boolean, extract({ text, receivedDate }) => Promise<raw result> }
// The raw result is UNTRUSTED. The app always passes it through normalizeExtraction() before display.

export const MAX_MESSAGE_CHARS = 2500;
export const MAX_TASKS_PER_MESSAGE = 30;
export const MAX_TITLE_CHARS = 200;
export const MAX_OWNER_CHARS = 80;
export const MAX_SNIPPET_CHARS = 400;
export const DEMO_EXTRACTOR_ID = "demo-rules-v1";

const ACTION_VERBS = new Set(("bring submit send pay complete return sign register confirm reply respond prepare review update finish book " +
  "schedule call email buy pack wear attend fill collect upload check read write finalise finalize share forward arrange order provide " +
  "pick drop join remind tell ask follow apply renew cancel clean practise practice study revise hand turn print keep make take set get " +
  "give let find fix test deploy approve donate label dress meet visit organise organize plan list cook wash draft create build design add remove " +
  "research compile summarise summarize edit proofread present publish post analyse analyze assign allocate coordinate document investigate tidy").split(" "));

const GREETING_OR_FILLER = /^(?:hi|hello|hey|dear|thanks|thank you|cheers|regards|best|noted|ok|okay|sure|hope|sorry|good (?:morning|afternoon|evening))\b/i;
const GROUP_WORDS = /^(parents|students|children|kids|pupils|learners|everyone|everybody|all|team|class|guys|folks|colleagues|staff|members|teachers|guardians|caregivers|families|attendees|participants|employees|someone|anyone|whoever)\b/i;
const NOT_NAMES = new Set(("please kindly thanks thank hi hello dear note reminder reminders the this that these those there here our your my we they it " +
  "he she you i if when once also and but so then today tomorrow tonight yesterday monday tuesday wednesday thursday friday saturday sunday january " +
  "february march april may june july august september october november december parents students everyone everybody all team class action todo " +
  "remember try need have plan want ready able sure going ought supposed expected hope ensure be do make children kids pupils").split(" "));
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "vs", "etc", "e.g", "i.e", "approx", "no", "st", "prof", "inc", "ltd"]);

const OBLIGATION = /\b(?:need(?:s)? to|must|should|have to|has to|required to|are to|is to|ought to|supposed to|expected to)\b/i;
const REQUEST = /\b(?:can|could|would|will)\s+you\b/i;
const POLITE = /^(?:(?:please|kindly)\s+)+/i;
const LEAD_IN = /^(?:(?:don'?t|do not) forget to|remember to|make sure (?:that )?(?:you |to )?|be sure to|reminder:?|action(?: required| item)?:|to-?do:?|deadline:?)\s*/i;
const NEGATIVE = /^(?:please\s+)?(?:don'?t|do not|never|no need to|avoid)\b(?!\s+forget)/i;

// ── Segmentation (offset-preserving, no regex look-behind for older Safari) ───

function splitSentences(line, lineStart) {
  const out = [];
  let start = 0;
  const flush = (end) => {
    const raw = line.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) out.push({ text: trimmed, start: lineStart + start + lead, end: lineStart + start + lead + trimmed.length });
    start = end;
  };
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === ";") { flush(i + 1); continue; }
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    let j = i;
    while (j + 1 < line.length && /[.!?]/.test(line[j + 1])) j += 1;
    const next = line[j + 1];
    if (next !== undefined && !/\s/.test(next)) { i = j; continue; } // 3.5, v1.2, e.g.x
    if (ch === ".") {
      const word = /([A-Za-z.]+)$/.exec(line.slice(start, i))?.[1]?.toLowerCase();
      if (word && (ABBREVIATIONS.has(word) || word.length === 1)) continue; // Mr. Tan, initials
    }
    flush(j + 1);
    i = j;
  }
  flush(line.length);
  return out;
}

// "Group project: Aisha to draft the intro, Ben to collect references." → two units, offsets preserved.
// Only look-ahead is used (look-behind is unavailable in older Safari).
const CLAUSE_START = String.raw`[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?\s+(?:to|will|should|must)\s`;
const CLAUSE_BREAK = new RegExp(String.raw`,\s+(?=${CLAUSE_START})`, "g");
const LABEL_PREFIX = new RegExp(String.raw`^[A-Za-z][A-Za-z ]{0,30}:\s+(?=${CLAUSE_START})`);

function splitClauses(unit) {
  const { text } = unit;
  const label = LABEL_PREFIX.exec(text);
  const bounds = [];
  let from = label ? label[0].length : 0;
  for (const match of text.matchAll(CLAUSE_BREAK)) { bounds.push([from, match.index]); from = match.index + match[0].length; }
  bounds.push([from, text.length]);
  return bounds.map(([a, b]) => {
    const slice = text.slice(a, b);
    const body = slice.replace(/[\s,]+$/, "");
    return { ...unit, text: body, start: unit.start + a, end: unit.start + a + body.length };
  }).filter((u) => u.text.length > 0);
}

function segment(text) {
  const units = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const bullet = /^\s*(?:(?:[-*•–—]|\d{1,2}[.)]|\[\s?[xX ]?\s?\]|\(\s?\))\s+)+/.exec(line); // "- [ ] task", "1) task\"
    const prefix = bullet ? bullet[0].length : 0;
    units.push(...splitSentences(line.slice(prefix), offset + prefix).map((u) => ({ ...u, bulleted: Boolean(bullet) })).flatMap(splitClauses));
    offset += line.length + 1;
  }
  return units;
}

// ── Owner and title analysis ─────────────────────────────────────────────────

const NAME = String.raw`[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?`;
const NAMED_SUBJECT = new RegExp(String.raw`^(${NAME})\s*(?:,\s*|\s+)(?=(?:to\s|will\s|should\s|needs\s+to\s|must\s|can\s+you|could\s+you|would\s+you|please\b|kindly\b))`);

function analyseOwner(sentence) {
  const reasons = [];
  let rest = sentence;
  let owner = { kind: "unassigned", name: "" };
  const group = GROUP_WORDS.exec(rest);
  const named = NAMED_SUBJECT.exec(rest);
  const firstPerson = /^(?:I|I'll|I’ll|I will|I can|I'm going to|I am going to)\b\s*/.exec(rest);
  if (group) {
    rest = rest.slice(group[0].length).replace(/^[,:\s-]+/, "");
    reasons.push(`Addressed to a group (“${group[1]}”), not to you personally. Assign it to yourself if it applies to you.`);
  } else if (named && !named[1].split(/\s+/).some((w) => NOT_NAMES.has(w.toLowerCase()) || ACTION_VERBS.has(w.toLowerCase()))) {
    owner = { kind: "other", name: named[1] };
    rest = rest.slice(named[0].length).replace(/^(?:will|to|should|needs to|must)\s+/i, "");
  } else if (firstPerson) {
    owner = { kind: "other", name: "Message sender" };
    rest = rest.slice(firstPerson[0].length).replace(/^(?:will|can|'ll|’ll)\s+/i, "");
  } else if (REQUEST.test(rest) || /\byou\b/i.test(rest)) {
    reasons.push("Written as a request to “you”. Assign it to yourself if it is for you.");
  }
  return { owner, rest, reasons };
}

function stripDateExpressions(text, expressions) {
  let out = text;
  for (const e of [...expressions].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + out.slice(e.end);
  return out
    .replace(/\b(?:by|on|before|until|till|due(?: on| by)?|at|for|from|no later than|latest|the)\s*(?=[,.;:!?)]|$)/gi, "")
    .replace(/\b(?:by|on|before|until|till|due|no later than)\s+(?:and|or)\b/gi, "$&")
    .replace(/\s+([,.;:!?])/g, "$1");
}

function cleanTitle(text) {
  let title = text.replace(POLITE, "").replace(LEAD_IN, "").replace(POLITE, "");
  title = title.replace(/^(?:can|could|would|will)\s+you\s+(?:please\s+)?/i, "").replace(/^(?:you\s+)?(?:need|needs|have|has)\s+to\s+/i, "")
    .replace(/^(?:you\s+)?(?:must|should|are required to|required to)\s+/i, "")
    .replace(/\s{2,}/g, " ").replace(/^[\s,;:–—-]+/, "").replace(/[\s,;:–—-]+$/, "").replace(/[.!?]+$/, "").trim();
  title = title.replace(/\s+(?:is |are )?due$/i, "").replace(/\s+(?:by|on|before|until|is|are)$/i, "").trim();
  if (title.length > MAX_TITLE_CHARS) title = `${title.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
  return title ? title[0].toUpperCase() + title.slice(1) : "";
}

function isActionable(sentence, rest, expressions) {
  if (!sentence || GREETING_OR_FILLER.test(sentence)) return false;
  if (NEGATIVE.test(sentence.replace(POLITE, "")) || NEGATIVE.test(rest)) return false;
  const isQuestion = /\?\s*$/.test(sentence);
  const body = rest.replace(POLITE, "").replace(LEAD_IN, "");
  const firstWord = (/^[A-Za-z']+/.exec(body) || [""])[0].toLowerCase();
  const hasLead = POLITE.test(rest) || LEAD_IN.test(rest) || POLITE.test(sentence) || LEAD_IN.test(sentence);
  if (REQUEST.test(sentence)) return true;
  if (isQuestion) return false;
  if (hasLead && body.length > 0) return true;
  if (OBLIGATION.test(sentence)) return true;
  if (ACTION_VERBS.has(firstWord) && body.split(/\s+/).length >= 2) return true;
  if (/\bdue\b/i.test(sentence) && expressions.length > 0) return true;
  return false;
}

// ── Public extractor ─────────────────────────────────────────────────────────

export function extractTasksFromText(text, receivedDate) {
  if (typeof text !== "string") throw new TypeError("Message text must be a string");
  if (!isValidISODate(receivedDate)) throw new RangeError("A valid message date is required");
  if (text.length > MAX_MESSAGE_CHARS * 2) throw new RangeError("Message is too long");
  const normalized = text.replace(/\r\n?/g, "\n");
  const tasks = [];
  for (const unit of segment(normalized)) {
    const { owner, rest, reasons: ownerReasons } = analyseOwner(unit.text);
    const expressions = findDateExpressions(unit.text, receivedDate);
    if (!isActionable(unit.text, rest, expressions)) continue;
    const restExpressions = findDateExpressions(rest, receivedDate);
    const title = cleanTitle(stripDateExpressions(rest, restExpressions));
    if (title.length < 3) continue;
    const deadline = combineExpressions(expressions);
    const reasons = [...ownerReasons];
    if (deadline.status === "ambiguous") reasons.unshift(deadline.note || "The deadline is ambiguous.");
    else if (deadline.status === "resolved" && deadline.level === "medium") reasons.unshift(deadline.note);
    tasks.push({
      id: `draft-${tasks.length + 1}`,
      title,
      owner,
      sourceSnippet: normalized.slice(unit.start, unit.end).slice(0, MAX_SNIPPET_CHARS),
      sourceStart: unit.start,
      sourceEnd: Math.min(unit.end, unit.start + MAX_SNIPPET_CHARS),
      dateExpression: deadline.raw,
      dateStatus: deadline.status === "none" ? "none" : deadline.status,
      dueDate: deadline.status === "resolved" ? deadline.dates[0] : null,
      dateCandidates: deadline.status === "ambiguous" ? deadline.dates : [],
      dateNote: deadline.note,
      uncertainty: { level: deadline.status === "ambiguous" ? "high" : reasons.length ? "medium" : "low", reasons },
    });
    if (tasks.length >= MAX_TASKS_PER_MESSAGE) break;
  }
  return tasks;
}

export function createDemoExtractor() {
  return {
    id: DEMO_EXTRACTOR_ID,
    label: "Demo extractor (simple rules, not AI)",
    isDemo: true,
    async extract({ text, receivedDate }) {
      return { tasks: extractTasksFromText(text, receivedDate), warnings: [] };
    },
  };
}

// ── Output validation (untrusted extractor output → safe, bounded drafts) ─────

const str = (value, max) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max) : "");

/**
 * Validates and bounds whatever an extractor returned. Source snippets are checked against the
 * user's own message: a snippet that does not appear verbatim is flagged, never silently trusted.
 */
export function normalizeExtraction(raw, { text, receivedDate, extractor }) {
  const warnings = Array.isArray(raw?.warnings) ? raw.warnings.slice(0, 5).map((w) => str(w, 200)).filter(Boolean) : [];
  const list = Array.isArray(raw?.tasks) ? raw.tasks.slice(0, MAX_TASKS_PER_MESSAGE) : [];
  const drafts = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const title = str(item.title, MAX_TITLE_CHARS).trim();
    if (!title) continue;
    let id = str(item.id, 40) || `draft-${drafts.length + 1}`;
    while (seen.has(id)) id = `${id}-${drafts.length + 1}`;
    seen.add(id);
    const snippet = str(item.sourceSnippet, MAX_SNIPPET_CHARS);
    const snippetVerified = snippet.length > 0 && text.includes(snippet);
    const ownerKind = item.owner?.kind === "other" ? "other" : "unassigned"; // an extractor can never assign to "me"
    const ownerName = ownerKind === "other" ? str(item.owner?.name, MAX_OWNER_CHARS).trim() : "";
    const status = ["none", "resolved", "ambiguous"].includes(item.dateStatus) ? item.dateStatus : "none";
    const dueDate = status === "resolved" && isValidISODate(item.dueDate) ? item.dueDate : null;
    const candidates = Array.isArray(item.dateCandidates) ? item.dateCandidates.filter(isValidISODate).slice(0, 6) : [];
    const reasons = Array.isArray(item.uncertainty?.reasons) ? item.uncertainty.reasons.slice(0, 6).map((r) => str(r, 300)).filter(Boolean) : [];
    if (!snippetVerified) reasons.push("The supporting text could not be matched to your message. Check it carefully.");
    drafts.push({
      id, title,
      owner: ownerName ? { kind: "other", name: ownerName } : { kind: "unassigned", name: "" },
      sourceSnippet: snippet, snippetVerified,
      dateExpression: str(item.dateExpression, 100) || null,
      dateStatus: status === "resolved" && !dueDate ? "none" : status,
      dueDate,
      dateCandidates: status === "ambiguous" ? candidates : [],
      dateNote: str(item.dateNote, 300) || null,
      uncertainty: { level: !snippetVerified || status === "ambiguous" ? "high" : reasons.length ? "medium" : "low", reasons },
    });
  }
  return {
    extractorId: str(extractor?.id, 60) || "unknown",
    extractorLabel: str(extractor?.label, 100) || "Unknown extractor",
    isDemo: extractor?.isDemo === true,
    referenceDate: receivedDate,
    drafts,
    warnings,
  };
}

export const SAMPLE_MESSAGE = [
  "Hi everyone, a quick update before the week starts.",
  "Please bring a water bottle and a spare set of clothes this Friday.",
  "Sarah to send the final slides by tomorrow.",
  "Parents, kindly return the signed excursion form by 20 Dec.",
  "Don't forget to pay the $18 workshop fee next Friday.",
  "Mei Ling will book the venue before 12/11.",
  "I'll share the meeting notes later.",
  "Do not bring toys from home.",
  "Thanks everyone!",
].join("\n");
