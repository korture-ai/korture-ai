// Local transcript adapters, in Node. Reads visible conversation text, never
// tool arguments, reasoning, credentials or attachments. Sources are never
// modified. Unknown records are counted rather than guessed.
//
// 19 September 2026. This is sense/collect.py, line for line, so a person's
// computer needs no Python. The two must give the same output to the byte:
// each chat is stored under a hash of its content, so a collector that spelt
// one message differently would send that person's messages to be read again.
// `debug/sense-collect/same-as-python.mjs` runs both over the real chats on
// this computer and compares them. The comments that explain each rule live in
// collect.py and are not repeated here; change both together, or retire the
// Python one.
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync, statSync, lstatSync, existsSync, readdirSync, mkdtempSync, copyFileSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";
import { tmpdir } from "node:os";
import { system, claudeAppFolders } from "./platform.mjs";

const digest = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// Python's \w and \b see every alphabet; JavaScript's see only ASCII.
const W = "[\\p{L}\\p{N}_]";
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
const rx = (src, flags = "u") => new RegExp(src.replaceAll("\\b", B).replaceAll("\\w", W), flags.includes("u") ? flags : flags + "u");

const SCRUB = [
  [rx("\\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}|\\bgh[pousr]_[A-Za-z0-9]{16,}|\\bxox[abposr]-[A-Za-z0-9-]{10,}", "g"), "[KEY]"],
  [rx("\\beyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+", "g"), "[TOKEN]"],
  [rx("\\b(password|passwd|secret|token|api[_-]?key)\\s*[:=]\\s*[\\p{L}\\p{N}_/+._-]{8,}", "gi"), "$1=[REDACTED]"],
];
const scrub = (s) => SCRUB.reduce((t, [re, to]) => t.replace(re, to), s);

function text(c) {
  if (typeof c === "string") return c;
  if (Array.isArray(c))
    return c
      .filter((b) => b && typeof b === "object" && !Array.isArray(b) && ["text", "input_text", "output_text"].includes(b.type))
      .map((b) => (b.text === undefined ? "" : b.text))
      .join("\n");
  return "";
}

// Collector v18, 21 October 2026: a picture the person pasted into their
// message (Claude Code and the Claude app: a content block of type "image";
// Codex: "input_image"). The words are read; the picture is not, so the reader
// was asked "does it contain a screenshot?" and could answer only from words
// like "see the screenshot". The record knows: `image` on the turn's acts.
// Same as collect.py pictures.
const PICTURE = new Set(["image", "input_image"]);
const pictures = (c) => (Array.isArray(c) ? c.filter((b) => b && typeof b === "object" && PICTURE.has(b.type)).length : 0);

// Claude Code's own note for a pasted screenshot, not the person's words.
// Exported so the scored history leaves out the same turns (sense/history.mjs).
export const SCREENSHOT = /^\s*\[Image: original \d+x\d+, displayed at /u;
// 24 September 2026: the first message of a chat Korture Sense opens, typed or
// pasted by Korture's button (sense/workspace.mjs OPENER), is Korture's words,
// not the person's. It read as handing the whole thing over with nothing to
// work from. Only the whole message, or the message Korture writes for the
// person to paste (sense/workspace.mjs PASTE_HEAD): words the person adds to
// the opener are theirs.
export const OPENER_RX = /^\s*Let['\u2019]s work on my Korture reading\.?\s*(?:$|Korture Sense wrote this message)/u;
const SYNTHETIC = /^\s*(?:<task-notification>|<system-reminder>|<command-|<local-command-|<scheduled-task|# AGENTS.md instructions|<environment_context>|<recommended_plugins>|This is an output-only reading task|SENSE_READER_DATA_ONLY|SENSE_FEELINGS_DATA_ONLY|SENSE_LETTERS_DATA_ONLY|Base directory for this skill:|\[Request interrupted by user|The app was quit while you were working\. Please continue)/u;
const REUSE_PATH = /CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.docs\/sessions\/|\/memory\/|MEMORY\.md|\/skills\/|\/commands\/|\/\.claude\/[^\s"']*\.md|\/\.codex\/[^\s"']*\.md|\/\.gemini\/[^\s"']*\.md/u;
const CONFIG_PATH = /\/\.claude\/|\/\.codex\/|\/\.gemini\/|CLAUDE\.md|AGENTS\.md|GEMINI\.md|settings(?:\.local)?\.json|\.mcp\.json|launch\.json|\.cursorrules|\/skills\/|\/agents\/|\/commands\/|\/hooks\//u;
const TEST_CMD = rx("\\b(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?test|\\bvitest\\b|\\bjest\\b|\\bpytest\\b|\\bgo test\\b|\\bcargo test\\b|\\bnode\\s+--test\\b|\\bunittest\\b|\\btsc\\b|\\btypecheck\\b", "i");
const EDIT_VERB = rx("apply_patch|write_file|edit_file|create_file|\\*\\*\\* (?:Update|Add) File:|tools\\.(?:write|edit)|\\bcat\\s*>|\\btee\\b|\\b(?:Set-Content|Add-Content|Out-File)\\b");
const SCRATCH = /^\/(?:private\/)?(?:tmp|var\/folders\/[^/]+\/[^/]+\/T)(?:\/|$)/u;
const PROBE = rx("^\\s*(?:reply|respond|answer)\\s+(?:with\\s+)?(?:exactly|only|just|the (?:single|exact|one) word)\\b[^\\n]{0,80}\\n?$", "i");
const PROSE_PATH = rx("\\.(?:md|mdx|markdown|txt|rst|rtf|docx?|odt|tex|adoc)\\b", "i");
const CODE_PATH = rx("\\.(?:[cm]?[jt]sx?|py|rs|swift|go|java|kt|rb|php|c|h|cpp|cs|css|scss|html?|json|ya?ml|toml|sh|zsh|sql|astro|vue|svelte|plist|xml|lock)\\b", "i");
const ACTS = ["edits", "config", "tests", "background", "reuse", "interrupted", "admitted", "ran", "prose", "code", "kept"];
// Session 91, 9 October 2026: `kept`, the AI wrote to the person's saved
// notes, rules or ways of working on this turn. Our founder's rules tell every AI to
// write session notes and memory, so "used your saved notes and did not add
// to them" was false on most of his Reuse level 2 messages: the notes were
// written later in the same chat, and nothing recorded it. `reuse` is set by a
// read too, so it cannot say this. korture-now keeps its notes in
// docs/sessions/, with no dot, and a write often runs after `cd` into the
// memory folder, so both are read here.
export const NOTES_PATH = /CLAUDE\.md|AGENTS\.md|GEMINI\.md|(?:^|\/)\.?docs\/sessions\/|\/memory\/|MEMORY\.md|\/skills\/|\/commands\/|\/\.claude\/[^\s"']*\.md|\/\.codex\/[^\s"']*\.md|\/\.gemini\/[^\s"']*\.md/u;
const CD = /(?:^|[;&|(\n]\s*)cd\s+(["']?)([^\s;&|"']+)\1/g;
// Session 133: PowerShell's writes, which Codex runs on Windows.
const IN_PLACE = /\bsed\s+-i\b|\bopen\([^)]*,\s*['"][wa]\+?['"]|\.write_text\(|\b(?:writeFileSync|appendFileSync)\(|\b(?:Set-Content|Add-Content|Out-File)\b/;
// Collector v16, 11 October 2026 (ratings-15): `kept` cannot say which kind of
// place was written. Our founder's standing rules tell every AI to write a session note
// in every chat, so `kept` fired on a note that saves no lesson. `keptTo` is
// the sorted kinds of saved place written on the turn: "standing" is a file
// every chat loads or a reusable way of working (CLAUDE.md, AGENTS.md,
// GEMINI.md, MEMORY.md, anything under /memory/, /skills/, /commands/, and
// .claude, .codex or .gemini rule markdown that is not a plan); "notes" is a
// session note or a plan (docs/sessions/, .docs/sessions/, /plans/). `kept`
// stays true for either, so an older reader does not break.
const STANDING_NAME = /^(?:CLAUDE|AGENTS|GEMINI|MEMORY)\.md$/u;
const STANDING_DIR = /\/(?:memory|skills|commands)\//u;
const NOTES_DIR = /(?:^|\/)\.?docs\/sessions\/|\/plans\//u;
/**
 * Session 133: on Windows the AI's tools write C:\Users\...\CLAUDE.md, and
 * every path rule here reads "/". A blob that names a Windows drive has its
 * backslashes read as "/"; nothing else changes, so a Mac's or Linux's acts
 * are read as before.
 */
const WIN_DRIVE = /\b[A-Za-z]:\\/;
export const slashed = (s) => (typeof s === "string" && WIN_DRIVE.test(s) ? s.replace(/\\+/g, "/") : s);
/** The kind of saved place a path that matches NOTES_PATH names. */
export function savedKind(p) {
  const base = String(p).split("/").pop();
  if (STANDING_NAME.test(base) || STANDING_DIR.test(p)) return "standing";
  if (NOTES_DIR.test(p)) return "notes";
  return "standing";
}
/** The kinds of saved place a command or patch wrote to: a file it writes, after any `cd`, or an in-place write naming one. */
export function keptKinds(blob) {
  const s = String(blob || "").replaceAll("\\n", "\n");
  if (!s) return [];
  const dirs = [...s.matchAll(CD)].map((m) => m[2]);
  const full = (p) => (/^(?:[\/~]|[A-Za-z]:\/)/.test(p) || !dirs.length ? p : `${dirs.at(-1)}/${p}`);
  const kinds = new Set();
  for (const p of writtenTo(s)) if (NOTES_PATH.test(full(p))) kinds.add(savedKind(full(p)));
  if (!kinds.size && IN_PLACE.test(s) && NOTES_PATH.test(s)) {
    for (const t of s.split(/[\s"'`;|&()<>]+/)) if (t && NOTES_PATH.test(t)) kinds.add(savedKind(t));
    if (!kinds.size) kinds.add(savedKind(s));
  }
  return [...kinds].sort();
}
/** Whether a command or patch wrote to the person's saved notes: a file it writes, after any `cd`, or an in-place write naming one. */
export const keptNotes = (blob) => keptKinds(blob).length > 0;
/** Marks kept and keptTo on a turn's acts for the kinds written. */
function markKept(acts, kinds) {
  if (!kinds.length) return;
  acts.kept = true;
  acts.keptTo = [...new Set([...(acts.keptTo || []), ...kinds])].sort();
}
// Session 71, 23 September 2026: the AIs type a curly apostrophe ("You’re
// right") and say "my fault" and "I should not have"; the old list caught
// none of those, so frustration at an admitted AI fault was counted against
// the person. Checked on every stored chat: 16 more turns, all real admissions
// (debug/sounded-check/admit-scan.mjs).
const ADMIT = rx("\\b(?:you are right|you're right|you were right|i was wrong|i got (?:this|that|it) wrong|my mistake|that was (?:the )?wrong|i misread|i misunderstood|i assumed wrong|my fault|i should not have|i shouldn't have)", "i");
const APOS = /[\u2018\u2019\u02bc]/g;
// Session 71: Codex wraps the person's words in its own text: "# Files
// mentioned by the user", an in-app browser block, then "## My request:" and
// the words, then an image tag. Only the words after the heading are the
// person's. Same as collect.py own_words.
const REQUEST = /\n## My request(?: for Codex)?:[ \t]*\n?/;
const BROWSER = /<in-app-browser-context\b[\s\S]*?<\/in-app-browser-context>/g;
const IMAGE_TAG = /<image\b[^>]*>\s*<\/image>/g;
// Session 73, 24 September 2026: Codex keeps a long paste in a file and puts
// only "Referenced pasted text files: - pasted text file: <path>. Read this
// file before continuing." in the message. Our founder pasted a 10 KB brief and the
// reading saw that one line. The paste is the person's words, so it is put
// back, read from Codex's own attachments folder only. Same as collect.py.
const PASTED = /Referenced pasted text files:\n((?:- pasted text file: [^\n]*(?:\n|$))+)/g;
const PASTED_LINE = /^- pasted text file: (.+?)\. Read this file before continuing\.$/;
// Either slash: Codex on Windows names C:\Users\...\.codex\attachments\... (session 133).
const ATTACHMENT = /[\\/]\.codex[\\/]attachments[\\/][^\\/]+[\\/][^\\/]+$/;
function pasted(list) {
  return list.split("\n").filter(Boolean).map((l) => {
    const m = PASTED_LINE.exec(l);
    if (!m || !ATTACHMENT.test(m[1]) || m[1].includes("/../")) return l;
    try { return readFileSync(m[1], "utf8"); } catch { return l; }
  }).join("\n\n") + "\n";
}
export function ownWords(s) {
  const m = REQUEST.exec(s);
  const t = m ? s.slice(m.index + m[0].length) : s;
  return t.replace(BROWSER, "").replace(IMAGE_TAG, "").replace(PASTED, (_, list) => pasted(list));
}
const freshActs = () => ({ ...Object.fromEntries(ACTS.map((k) => [k, false])), keptTo: [] });
// Python's str.strip() and str.lstrip() set.
const LEAD = /^[\s\x1c-\x1f]+/u;
const lstrip = (s) => s.replace(LEAD, "");
const blank = (s) => lstrip(s) === "";
const isDict = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? "" : String(v));

// v12, 5 October 2026. Same as collect.py written_to.
const FILE_HEAD = /\*\*\* (?:Update|Add|Delete) File: ([^\n]+)/g;
const HEREDOC = /<<-?[ \t]*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/;
const REDIRECT = /(?:^|[^0-9&>])>>?[ \t]*([^\s;&|<>()'"`]+)/g;
const TEE = /(?:^|[\s;&|(])tee[ \t]+(?:-[A-Za-z]+[ \t]+)*([^\s;&|<>()'"`]+)/g;
const NOT_A_FILE = /^(?:&|\/dev\/)/;
export function writtenTo(blob) {
  const s = String(blob).replaceAll("\\n", "\n");
  const heads = [...s.matchAll(FILE_HEAD)].map((m) => m[1].replace(/^[ \t]+|[ \t]+$/g, ""));
  if (heads.length) return heads;
  const out = [];
  let end = null;
  for (const line of s.split("\n")) {
    if (end !== null) {
      if (line.replace(/^[ \t]+|[ \t]+$/g, "") === end) end = null;
      continue;
    }
    for (const m of line.matchAll(REDIRECT)) if (!NOT_A_FILE.test(m[1])) out.push(m[1]);
    for (const m of line.matchAll(TEE)) if (!NOT_A_FILE.test(m[1])) out.push(m[1]);
    const h = HEREDOC.exec(line);
    if (h) end = h[1];
  }
  return out;
}
function markText(acts, blob, edit = false) {
  if (!blob) return;
  blob = slashed(blob);
  if (edit || EDIT_VERB.test(blob)) {
    acts.edits = true;
    if (CONFIG_PATH.test(blob)) acts.config = true;
    const to = writtenTo(blob);
    if (to.length)
      for (const p of to) {
        if (PROSE_PATH.test(p)) acts.prose = true;
        else acts.code = true;
      }
    else {
      if (PROSE_PATH.test(blob)) acts.prose = true;
      if (CODE_PATH.test(blob)) acts.code = true;
    }
  }
  if (!edit) acts.ran = true;
  if (TEST_CMD.test(blob)) acts.tests = true;
  if (REUSE_PATH.test(blob)) acts.reuse = true;
  markKept(acts, keptKinds(blob));
}
function markClaude(acts, block) {
  const name = block.name || "";
  const i = isDict(block.input) ? block.input : {};
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(name)) {
    acts.edits = true;
    const p = slashed(str(i.file_path || i.notebook_path || ""));
    if (CONFIG_PATH.test(p)) acts.config = true;
    if (PROSE_PATH.test(p)) acts.prose = true;
    else acts.code = true;
    if (NOTES_PATH.test(p)) markKept(acts, [savedKind(p)]);
  }
  if (name === "Bash") {
    markText(acts, str(i.command || ""));
    if (i.run_in_background === true) acts.background = true;
  }
  if (["Agent", "Task"].includes(name) && i.run_in_background === true) acts.background = true;
  if (name === "Monitor") acts.background = true;
  if (name === "Skill") acts.reuse = true;
  if (name === "Read" && REUSE_PATH.test(slashed(str(i.file_path || "")))) acts.reuse = true;
}
function markCodex(acts, q) {
  const name = q.name || "";
  const blob = typeof q.input === "string" ? q.input : typeof q.arguments === "string" ? q.arguments : "";
  if (["apply_patch", "write_file", "edit_file"].includes(name)) markText(acts, blob, true);
  else if (["exec", "shell", "exec_command", "local_shell", "container.exec"].includes(name)) markText(acts, blob);
  else if (q.type === "local_shell_call") markText(acts, JSON.stringify(q.action || {}));
  if (["spawn_agent", "followup_task"].includes(name)) acts.background = true;
}

// Python's float seconds from a file time, and its ISO text: microseconds,
// rounded half to even, and no fraction at all when it is zero.
const secondsOf = (ns) => Number(ns / 1000000000n) + 1e-9 * Number(ns % 1000000000n);
function stamp(n) {
  let whole = Math.floor(n);
  const scaled = (n - whole) * 1e6;
  let us = Math.floor(scaled);
  const rest = scaled - us;
  if (rest > 0.5 || (rest === 0.5 && us % 2 === 1)) us += 1;
  if (us >= 1000000) { whole += 1; us -= 1000000; }
  const d = new Date(whole * 1000).toISOString().slice(0, 19);
  return us ? `${d}.${String(us).padStart(6, "0")}Z` : `${d}Z`;
}

// 9 October 2026: the shape of each transcript read, so a host that changes
// how it writes its chats is seen (sense/harness/formats.ts). Per file: its
// records, how many of them the adapter knew as a message from the person
// or the AI, and the same over its newest SHAPE_TAIL records, where a chat
// that went on after the host's update shows it. Counts only, never words.
export const SHAPE_TAIL = 50;
const SHAPED = new Set(["codex", "claude-code", "cowork", "antigravity"]);

// Python's str.splitlines().
const LINES = new RegExp("\\r\\n|[\\n\\r\\v\\f\\x1c\\x1d\\x1e\\x85\\u2028\\u2029]", "u");
function records(p) {
  const out = [];
  let bad = 0;
  const lines = readFileSync(p).toString("utf8").split(LINES);
  if (lines.at(-1) === "") lines.pop();
  for (const l of lines) {
    try {
      const record = JSON.parse(l);
      if (isDict(record)) out.push(record);
      else bad += 1;
    } catch {
      bad += 1;
    }
  }
  return [out, bad];
}

// 8 October 2026, session 84: which AI answered each of the person's
// messages, the first link of the graph (.docs/decisions/2026-10-08-
// typescript-and-a-real-store.md). Claude Code and Cowork write the model on
// every reply (message.model), the effort on the reply, and the tool's version
// and app on every record; Codex writes the model and effort in turn_context
// and its version and app in session_meta. Codex writes a turn's model line
// after "task_started" and before the person's message, so there a message
// takes the model line of its own turn. Claude Code writes the model on the
// reply, so there a message takes the model of the first reply after it.
// Either way that is "answer"; until it is written, the model in use just
// before ("before"). Claude Code's "<synthetic>" is its own error line, not a
// model. Returned beside the messages, never inside them, so a chat's stored
// hash, its read packets and the reader see nothing new.
const NOT_A_MODEL = new Set(["<synthetic>", ""]);
function modelLinks() {
  const links = {};
  let now = { model: null, effort: null }, version = null, app = null, open = [], turn = null;
  return {
    meta(v, a) { if (typeof v === "string" && v) version = v; if (typeof a === "string" && a) app = a; },
    turnStarted() { turn = { model: null }; },
    // A program's prompt: the reply after it answers the program, not the person.
    notTheirs() { open = []; },
    model(model, effort) {
      if (typeof model !== "string" || NOT_A_MODEL.has(model)) return;
      now = { model, effort: typeof effort === "string" && effort ? effort : null };
      if (turn && !turn.model) turn.model = now;
      for (const id of open) Object.assign(links[id], now, { from: "answer" });
      open = [];
    },
    person(id) {
      if (turn?.model) { links[id] = { ...turn.model, version, app, from: "answer" }; open = []; return; }
      links[id] = { model: now.model, effort: now.effort, version, app, from: now.model ? "before" : null };
      open = [id];
    },
    done() { return links; },
  };
}

// Collector v17, 20 October 2026: a message the person types while the AI is
// still working is queued, and Claude Code writes it as an attachment
// (queued_command, commandMode "prompt"), never as a user record. 180 of our founder's
// messages were never read from their own chat; some reached Sense through
// the chat tool and were counted as a separate chat, so a session note he
// asked for later in the same chat did not count. Only the person's own:
// origin "human", or no origin (older records). Task notifications, subagent
// hand-backs and other sessions' messages carry another origin or mode. A
// queued prompt that also became a user record is left to that record.
function queuedPrompt(r) {
  const a = r.type === "attachment" && isDict(r.attachment) ? r.attachment : null;
  if (!a || a.type !== "queued_command" || a.commandMode !== "prompt") return null;
  if (a.origin !== undefined && a.origin !== null && !(isDict(a.origin) && a.origin.kind === "human")) return null;
  return typeof a.prompt === "string" || Array.isArray(a.prompt) ? a.prompt : null;
}

// Exported 3 October 2026 so sense/history-reuse.mjs can give the older record
// the same reuse act the live reading gets, from the same rules, not a copy.
export function jsonl(p, provider, rulesOff) {
  const synthetic = (s) => (SCREENSHOT.test(s) ? !rulesOff : OPENER_RX.test(s) || SYNTHETIC.test(s));
  let [rows, bad] = records(p);
  const shape = { n: rows.length + bad, said: 0, tailN: Math.min(SHAPE_TAIL, rows.length), tailSaid: 0 };
  const messages = [];
  let cwd = "", sub = false, program = false;
  const seen = new Set();
  const modern = provider === "codex" && rows.some((r) => r.type === "response_item" && isDict(r.payload) && r.payload.role === "user");
  let turn = null, reusePending = false;
  const ai = modelLinks();
  const mtime = () => stamp(secondsOf(statSync(p, { bigint: true }).mtimeNs));
  const typed = provider === "codex" ? null : new Set(rows.filter((r) => r.type === "user" && isDict(r.message)).map((r) => text(r.message.content).trim()));
  rows.forEach((r, i) => {
    let role = null, s = "", key = null, meta = false, sdk = false, pics = 0;
    let at = r.timestamp;
    const q = r.payload || {};
    if (!isDict(q)) { bad += 1; return; }
    if (r.type === "session_meta") {
      cwd = q.cwd === undefined ? "" : q.cwd;
      sub = isDict(q.source) && "subagent" in q.source;
      program = program || q.source === "exec" || q.originator === "codex_exec";
      if (provider === "codex") ai.meta(q.cli_version, q.originator);
    }
    if (provider === "codex") {
      if (modern && r.type === "response_item" && q.type === "message") { role = q.role; s = text(q.content); key = q.id; pics = pictures(q.content); }
      else if (!modern && r.type === "event_msg" && ["user_message", "agent_message"].includes(q.type)) { role = q.type === "user_message" ? "user" : "assistant"; s = text(q.message); }
      else if (r.type === "response_item" && ["function_call", "custom_tool_call", "local_shell_call"].includes(q.type)) { if (turn !== null) markCodex(turn, q); }
      else if (r.type === "event_msg" && q.type === "turn_aborted") { if (turn !== null) turn.interrupted = true; }
      else if (r.type === "turn_context") ai.model(q.model, q.effort);
      else if (r.type === "event_msg" && q.type === "task_started") ai.turnStarted();
    } else {
      cwd = cwd || (r.cwd === undefined ? "" : r.cwd);
      sub = sub || (r.isSidechain === undefined ? false : r.isSidechain);
      if (r.type === "user" && str(r.entrypoint).startsWith("sdk")) program = true;
      // 24 September 2026: a message the harness marks as its own (isMeta) is
      // not the person's: "Continue from where you left off.", "Your response
      // above was cut off mid-stream...", hook feedback, a skill's text. 71 on
      // Our founder's Mac were read as his. Left out by its mark, never by its words.
      meta = r.type === "user" && r.isMeta === true;
      // 3 October 2026: Claude Code marks who sent each prompt, turnOrigin
      // "human" when the person typed it and "sdk" when a program sent it,
      // such as an AI session that started another one. Three such prompts on
      // Our founder's Mac ("Using only the meta-ads MCP tools...") were read as his and
      // rated. Left out by its mark; "human" and no mark stay his.
      // Session 143, 5 November 2026: T3 Code is an app a person types in, built on
      // Claude's kit, so every prompt it sends is marked "sdk". About half of our founder's
      // Claude work in T3 Code was left out of his reading for that mark.
      sdk = r.type === "user" && r.turnOrigin === "sdk" && str(r.entrypoint) !== "t3-code";
      ai.meta(r.version, r.entrypoint);
      if (r.type === "assistant" && isDict(r.message)) ai.model(r.message.model, r.effort);
      const typedWhileBusy = queuedPrompt(r);
      if (typedWhileBusy !== null && !typed.has(text(typedWhileBusy).trim())) {
        role = "user";
        s = text(typedWhileBusy);
        pics = pictures(typedWhileBusy);
        key = r.uuid;
        at = at || r.attachment.timestamp;
      }
      if (["user", "assistant"].includes(r.type)) {
        role = r.type;
        const content = (r.message || {}).content;
        s = text(content);
        pics = pictures(content);
        key = r.uuid;
        if (role === "assistant" && Array.isArray(content) && turn !== null)
          for (const b of content) if (isDict(b) && b.type === "tool_use") markClaude(turn, b);
      }
    }
    if (provider === "codex" && role === "user") s = ownWords(s);
    if (role === "user" || role === "assistant") {
      shape.said += 1;
      if (i >= rows.length - SHAPE_TAIL) shape.tailSaid += 1;
    }
    if (!["user", "assistant"].includes(role) || blank(s)) return;
    // A program's prompt starts its own turn: what the AI does after it is not
    // put on the person's last message.
    if (role === "user" && sdk) { turn = null; ai.notTheirs(); return; }
    if (role === "user" && rulesOff && SCREENSHOT.test(s)) {
      key = key || String(i);
      if (seen.has(key)) return;
      seen.add(key);
      messages.push({ id: String(key), role: "user", text: scrub(s), at: at || mtime(), acts: freshActs(), rule: "screenshot" });
      return;
    }
    if (role === "user" && synthetic(s)) {
      const head = lstrip(s);
      if (head.startsWith("<skill>") || head.startsWith("<command-")) reusePending = true;
      if (head.startsWith("[Request interrupted by user") && turn !== null) turn.interrupted = true;
      if (s.includes("# AGENTS.md instructions")) role = "context";
      else return;
    }
    if (role === "user" && meta) return;
    if (role === "assistant" && (s.includes("<korture>") || ["SENSE_READER_DATA_ONLY", "SENSE_FEELINGS_DATA_ONLY", "SENSE_LETTERS_DATA_ONLY"].some((t) => s.startsWith(t)))) return;
    key = key || String(i);
    if (seen.has(key)) return;
    seen.add(key);
    const m = { id: String(key), role, text: scrub(s), at: at || mtime() };
    if (role === "assistant" && turn !== null && !turn.admitted && ADMIT.test([...s].slice(0, 400).join("").replace(APOS, "'"))) turn.admitted = true;
    if (role === "user" && lstrip(s).startsWith("<skill>")) reusePending = true;
    else if (role === "user") { turn = freshActs(); turn.reuse = reusePending; turn.image = pics > 0; reusePending = false; m.acts = turn; ai.person(m.id); }
    messages.push(m);
  });
  if (reusePending && turn !== null) turn.reuse = true;
  const humans = messages.filter((m) => m.role === "user").map((m) => m.text);
  const probe = humans.length > 0 && humans.every((t) => PROBE.test(t));
  const scratch = SCRATCH.test(cwd);
  const rules = Boolean(sub) || cwd.includes("/.korture/") || cwd.includes("korture-reader");
  const byhand = probe || scratch || program;
  const excluded = rules || (byhand && !rulesOff);
  if (rulesOff && byhand) for (const m of messages) m.rule = "program";
  return [messages, cwd, excluded, bad, ai.done(), shape];
}

function varint(b, i) {
  let v = 0, s = 0;
  while (i < b.length && s < 70) {
    const z = b[i];
    i += 1;
    v += (z & 127) * 2 ** s;
    s += 7;
    if (z < 128) return [v, i];
  }
  throw new RangeError("Invalid protobuf varint");
}
function wire(b) {
  let i = 0;
  const out = new Map();
  while (i < b.length) {
    let k, v, length;
    [k, i] = varint(b, i);
    const w = k % 8, n = Math.floor(k / 8);
    if (n === 0) throw new RangeError("Invalid protobuf field");
    if (w === 0) [v, i] = varint(b, i);
    else if (w === 2) {
      [length, i] = varint(b, i);
      v = b.subarray(i, i + length);
      i += length;
      if (v.length !== length) throw new RangeError("Truncated protobuf");
    } else if (w === 1 || w === 5) { length = w === 1 ? 8 : 4; v = b.subarray(i, i + length); i += length; }
    else throw new RangeError("Unknown protobuf wire type");
    if (!out.has(n)) out.set(n, []);
    out.get(n).push(v);
  }
  return out;
}
const need = (map, n) => { if (!map.has(n)) throw new RangeError(`missing field ${n}`); return map.get(n); };

const TAGS = ["SENSE_READER_DATA_ONLY", "SENSE_FEELINGS_DATA_ONLY", "SENSE_LETTERS_DATA_ONLY", "This is an output-only reading task", "Read each packet independently", "## Part 1. Reading the messages"];
const sig = (path) => { try { const r = statSync(path, { bigint: true }); return `${r.size}:${r.mtimeNs}`; } catch { return null; } };

async function agy(p, rulesOff) {
  // A consistent private copy, WAL included. SQLite must never create its
  // shared-memory sidecar inside the AI app's own folder.
  const wal = p + "-wal";
  const before = [sig(p), sig(wal)];
  const tmp = mkdtempSync(join(tmpdir(), "sense-sqlite-"));
  try {
    const dst = join(tmp, "chat.db");
    copyFileSync(p, dst);
    if (before[1] !== null) copyFileSync(wal, dst + "-wal");
    if (before[0] !== sig(p) || before[1] !== sig(wal)) throw new Error("Activity changed during capture; retrying next scan");
    return await agyCopy(dst, rulesOff);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
const AGY_MODEL = /(?:gemini|claude|gpt)-[a-z0-9][a-z0-9.\-]{1,60}/;
async function agyCopy(p, rulesOff) {
  const synthetic = (s) => (SCREENSHOT.test(s) ? !rulesOff : OPENER_RX.test(s) || SYNTHETIC.test(s));
  const { DatabaseSync } = await import("node:sqlite");
  const messages = [];
  let bad = 0;
  const c = new DatabaseSync(p);
  try {
    const first = c.prepare("select step_payload from steps where step_type=14 order by idx limit 1").get();
    const payload0 = first ? Buffer.from(first.step_payload ?? []) : null;
    const excluded = Boolean(payload0 && TAGS.some((t) => payload0.includes(Buffer.from(t, "utf8"))));
    if (excluded) return [[], "", true, 0];
    let src = null;
    try { src = c.prepare("select source from trajectory_meta limit 1").get(); } catch { src = null; }
    const program = Boolean(src && Number(src.source) === 17);
    if (program && !rulesOff) return [[], "", true, 0];
    // 8 October 2026, session 84: Antigravity keeps the model of each run in
    // executor_metadata ("gemini-3.6-flash-high"), coded, and not one row per
    // message (19 of our founder's chats: the row count matches the message count in
    // 13). So the model is kept for the chat: every message takes it when the
    // chat used one model; with several, the message keeps the list and no
    // single model.
    let used = [];
    try {
      for (const r of c.prepare("select data from executor_metadata order by idx").all()) {
        const m = Buffer.from(r.data ?? []).toString("latin1").match(AGY_MODEL);
        if (m && !used.includes(m[0])) used.push(m[0]);
      }
    } catch { used = []; }
    const models = {};
    const steps = c.prepare("select idx,step_type,step_payload,metadata from steps order by idx").all();
    const shape = { n: steps.length, said: 0, tailN: Math.min(SHAPE_TAIL, steps.length), tailSaid: 0 };
    steps.forEach((row, i) => {
      const kind = Number(row.step_type);
      if (kind !== 14 && kind !== 15) return;
      try {
        const fields = wire(Buffer.from(row.step_payload));
        const inner = wire(need(fields, kind === 14 ? 19 : 20)[0]);
        const raw = (inner.get(kind === 14 ? 2 : 1) || [Buffer.alloc(0)])[0];
        const s = new TextDecoder("utf-8", { fatal: true }).decode(raw);
        const role = kind === 14 ? "user" : "assistant";
        shape.said += 1;
        if (i >= steps.length - SHAPE_TAIL) shape.tailSaid += 1;
        if (!s || (role === "user" && synthetic(s))) return;
        const meta = wire(Buffer.from(row.metadata));
        const ts = wire(need(meta, 1)[0]);
        const at = stamp(need(ts, 1)[0] + (ts.get(2) || [0])[0] / 1e9);
        const m = { id: String(row.idx), role, text: scrub(s), at };
        if (role === "user") m.acts = null;
        if (program) m.rule = "program";
        messages.push(m);
        if (role === "user" && used.length) models[m.id] = used.length === 1 ? { model: used[0], from: "chat" } : { model: null, models: used, from: "chat" };
      } catch (e) {
        if (e instanceof RangeError || e instanceof TypeError) bad += 1;
        else throw e;
      }
    });
    return [messages, "", false, bad, models, shape];
  } finally {
    c.close();
  }
}

// Python's json.dumps(rows, sort_keys=True): ", " and ": ", keys in order, and
// every character outside ASCII as \uXXXX. The stored hash depends on it.
function pyJson(v) {
  if (v === null || v === undefined) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return JSON.stringify(v).replace(new RegExp("[\\u007f-\\uffff]", "g"), (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
  if (Array.isArray(v)) return "[" + v.map(pyJson).join(", ") + "]";
  return "{" + Object.keys(v).sort().map((k) => `${pyJson(k)}: ${pyJson(v[k])}`).join(", ") + "}";
}

function walk(root, depth) {
  // depth 0: files in root; 1: files one folder down; -1: any depth.
  const out = [];
  const go = (dir, d) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      let isDir = e.isDirectory();
      // Python's "**" does not walk through a linked folder; a plain "*" does.
      if (e.isSymbolicLink()) { try { isDir = depth !== -1 && statSync(full).isDirectory(); } catch { isDir = false; } }
      if (isDir) { if (depth === -1 || d < depth) go(full, d + 1); if (depth === -1 || d === depth) out.push(full); }
      else if (depth === -1 || d === depth) out.push(full);
    }
  };
  go(root, 0);
  return out;
}

// Python's glob "*/*/local_*/.claude/projects/*/*.jsonl": a plain "*" walks
// through a linked folder, so this one does too.
function coworkFiles(root) {
  const dirs = (d) => { try { return readdirSync(d).map((n) => join(d, n)).filter((f) => { try { return statSync(f).isDirectory(); } catch { return false; } }); } catch { return []; } };
  const files = (d) => { try { return readdirSync(d).map((n) => join(d, n)).filter((f) => { try { return statSync(f).isFile(); } catch { return false; } }); } catch { return []; } };
  const out = [];
  for (const a of dirs(root)) for (const b of dirs(a)) for (const s of dirs(b)) {
    if (!basename(s).startsWith("local_")) continue;
    for (const p of dirs(join(s, ".claude", "projects"))) out.push(...files(p));
  }
  return out;
}
// The Cowork session's own file next to its folder names the task that started it.
function scheduled(p) {
  try { return Boolean(JSON.parse(readFileSync(`${dirname(dirname(dirname(dirname(p))))}.json`, "utf8")).scheduledTaskId); } catch { return false; }
}

// A chat carries only the person's words: no acts, no folder, no AI replies.
// A bare slash command ("/korture") is a command to a tool, as it is in a
// transcript, where it arrives as a command tag.
const COMMAND = /^\s*\/[\w:-]+\s*$/u;
const chatMessage = (id, text, at) => (typeof text !== "string" || blank(text) || COMMAND.test(text) || OPENER_RX.test(text) || SYNTHETIC.test(text) ? null : { id, role: "user", text: scrub(text), at, acts: null });
// What a plugin line says about the AI behind it (session 84): the model and
// effort the site names, the app and its version. Only short plain strings.
const short = (v) => (typeof v === "string" && /^[\w .:()\-/]{1,80}$/.test(v) ? v : null);
function linkOf(o) {
  const l = { model: short(o.model), effort: short(o.effort), version: short(o.version), app: short(o.app) };
  return { ...l, from: l.model ? (o.modelFrom === "chat" ? "chat" : "answer") : null };
}
/** Korture's extension file into chats: one per chat id; a line with no id joins the last chat within 30 minutes. */
function liveChats(p) {
  const groups = new Map();
  let last = null;
  readFileSync(p).toString("utf8").split("\n").forEach((l, i) => {
    let o;
    try { o = JSON.parse(l); } catch { return; }
    if (!isDict(o) || typeof o.text !== "string" || typeof o.at !== "string") return;
    let key = typeof o.chat === "string" && o.chat ? o.chat : null;
    if (!key) key = last && Date.parse(o.at) - Date.parse(last.ended) <= 1800000 ? last.key : `t${o.at}`;
    if (!groups.has(key)) groups.set(key, { key, ended: o.at, messages: [], models: {} });
    const g = groups.get(key);
    g.ended = o.at;
    last = g;
    const m = chatMessage(String(i), o.text, o.at);
    if (m) { g.messages.push(m); g.models[m.id] = linkOf(o); }
  });
  return [...groups.values()].filter((g) => g.messages.length).map((g) => ({ id: `claude-chat:${g.key}`, provider: "claude-chat", messages: g.messages, models: g.models }));
}
/**
 * Korture's browser plugin file (session 74): one chat per site and chat id,
 * chatgpt.com as ChatGPT and claude.ai as Claude chat. A line from another
 * site is not read.
 */
// 1 October 2026, session 75: the plugin fetches from the person's accounts,
// each message with the site's own id, and claude-task is a Claude task
// (Cowork) they started. A message with an id is read once.
const SITES = { "chatgpt.com": "chatgpt", "claude.ai": "claude-chat", "claude-task": "cowork" };
function browserChats(p) {
  const groups = new Map();
  const seen = new Set();
  readFileSync(p).toString("utf8").split("\n").forEach((l, i) => {
    let o;
    try { o = JSON.parse(l); } catch { return; }
    if (!isDict(o) || typeof o.text !== "string" || typeof o.at !== "string" || typeof o.chat !== "string" || !o.chat || !SITES[o.site]) return;
    const id = `${SITES[o.site]}:${o.chat}`;
    const mid = typeof o.id === "string" && o.id ? o.id : String(i);
    if (seen.has(`${id}:${mid}`)) return;
    seen.add(`${id}:${mid}`);
    if (!groups.has(id)) groups.set(id, { id, provider: SITES[o.site], messages: [], models: {} });
    const m = chatMessage(mid, o.text, o.at);
    if (m) { groups.get(id).messages.push(m); groups.get(id).models[m.id] = linkOf(o); }
  });
  return [...groups.values()].filter((g) => g.messages.length);
}
/** A chat export `korture.mjs import` kept: one chat per exported conversation. */
function importedChats(p) {
  let d;
  try { d = JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
  if (!isDict(d) || d.format !== "korture-sessions-v1" || !Array.isArray(d.sessions)) return [];
  return d.sessions.filter(isDict).map((c) => {
    const provider = c.tool === "chatgpt" ? "chatgpt" : "claude-chat-export";
    const messages = (Array.isArray(c.turns) ? c.turns : []).map((t, j) => (isDict(t) ? chatMessage(String(j), t.text, typeof t.at === "string" && t.at ? t.at : c.started) : null)).filter(Boolean);
    return { id: `${provider}:${c.id}`, provider, messages };
  }).filter((c) => c.messages.length);
}

// One link for every one of the person's messages (session 84): the tool, the
// date, and whatever the tool said about the AI that answered. A message the
// tool says nothing about still has its tool and date; its model is null.
function linksFor(chat, models = {}, extra = {}) {
  const out = {};
  for (const m of chat.messages) {
    if (m.role !== "user") continue;
    const l = models[m.id] || {};
    out[m.id] = { tool: chat.provider, at: m.at, model: l.model ?? null, effort: l.effort ?? null, version: l.version ?? null, app: l.app ?? extra.app ?? null, from: l.from ?? null, ...(l.models ? { models: l.models } : {}) };
  }
  return out;
}

/**
 * Session 131: the count the Reading screen shows while Sense looks, written
 * to the cycle's progress file (sense/progress.mjs) at most four times a
 * second. `progress` is { path, base }: the file, and the cycle's own fields
 * it keeps. Never throws.
 */
function counter(progress, total) {
  let at = 0;
  return (done, chats, messages, force = false) => {
    if (!progress?.path) return;
    const now = Date.now();
    if (!force && now - at < 250) return;
    at = now;
    try {
      const tmp = `${progress.path}.c${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ ...(progress.base || {}), v: 1, at: new Date(now).toISOString(), step: "finding", files: { done, total }, chats, messages }), { mode: 0o600 });
      renameSync(tmp, progress.path);
    } catch { /* the count is only for the screen */ }
  };
}

export async function collect(home, since, cache = {}, { rulesOff = false, progress = null } = {}) {
  const out = [], stats = {}, newcache = { ...cache }, excludedSources = [], shapes = {};
  const sources = [
    ["codex", process.env.CODEX_HOME ? join(process.env.CODEX_HOME, "sessions") : join(home, ".codex/sessions"), -1, ".jsonl"],
    ["claude-code", join(home, ".claude/projects"), 1, ".jsonl"],
    ...["antigravity-cli", "antigravity", "antigravity-ide"].map((part) => ["antigravity", join(home, ".gemini", part, "conversations"), 0, ".db"]),
    // 24 September 2026: Claude Cowork, the Claude app's agent mode, writes a
    // Claude Code transcript per session under Application Support. Our founder had 99
    // chats there, April to July, that the live reading never saw. A session a
    // scheduled task started is a program's, not the person's.
    // Session 133: on Windows and Linux the Claude app keeps it in its own
    // folder there (sense/platform.mjs claudeAppFolders). Since October
    // 2026 the Claude app writes new work to ~/.claude/projects, read above.
    ...claudeAppFolders(system(), home).map((dir) => ["cowork", join(dir, "local-agent-mode-sessions"), "cowork", ".jsonl"]),
    // 24 September 2026: Claude chat, as Korture's extension writes it, and chat
    // exports (Claude or ChatGPT) that `korture.mjs import` keeps. Until today
    // only the history script read these; our founder had 241 Claude chat messages in
    // September that the live reading never saw.
    ["claude-chat", join(process.env.KORTURE_HOME || join(home, ".korture"), "chat"), "live", ".jsonl"],
    ["chat-import", join(process.env.KORTURE_HOME || join(home, ".korture"), "chat", "imports"), 0, ".json"],
    // 24 September 2026, session 74: chatgpt.com and claude.ai in the browser,
    // as Korture's browser plugin writes them.
    ["browser", join(process.env.KORTURE_HOME || join(home, ".korture"), "chat"), "browser", ".jsonl"],
  ];
  // Every source's files first, so the count says how many there are to look at.
  const lists = sources.map(([provider, root, depth, ext]) => {
    const files = depth === "cowork" ? coworkFiles(root) : depth === "live" || depth === "browser" ? [join(root, depth === "live" ? "claude-live.jsonl" : "browser-live.jsonl")].filter((f) => existsSync(f)) : walk(root, depth);
    return files.filter((f) => f.endsWith(ext));
  });
  const tick = counter(progress, lists.reduce((t, l) => t + l.length, 0));
  let looked = 0, foundChats = 0, foundMessages = 0;
  tick(0, 0, 0, true);
  for (const [i, [provider, root]] of sources.entries()) {
    const st = (stats[provider] ||= { files: 0, recent: 0, chats: 0, messages: 0, errors: 0, unknownRecords: 0, issues: [], available: false });
    st.available = st.available || existsSync(root);
    for (const p of lists[i]) {
      tick(looked++, foundChats, foundMessages);
      st.files += 1;
      try { if (lstatSync(p).isSymbolicLink()) continue; } catch { continue; }
      try {
        const stat = statSync(p, { bigint: true });
        const walPath = p + "-wal";
        const w = existsSync(walPath) ? statSync(walPath, { bigint: true }) : null;
        const signature = `v19:${stat.size}:${stat.mtimeNs}:${w ? w.size : 0}:${w ? w.mtimeNs : 0}`;
        if (Math.max(secondsOf(stat.mtimeNs), w ? secondsOf(w.mtimeNs) : 0) < since) continue;
        st.recent += 1;
        if (cache[p] === signature) continue;
        if (provider === "claude-chat" || provider === "chat-import" || provider === "browser") {
          for (const { models, ...c } of provider === "claude-chat" ? liveChats(p) : provider === "browser" ? browserChats(p) : importedChats(p)) {
            const chat = { ...c, project: null, source: p, sourceHash: digest(pyJson(c.messages)) };
            chat.models = linksFor(chat, models);
            out.push(chat);
            st.chats += 1;
            st.messages += c.messages.length;
            foundChats += 1;
            foundMessages += c.messages.length;
          }
          newcache[p] = signature;
          continue;
        }
        const [rows, cwd, skip, bad, models = {}, shape = null] = provider === "antigravity" ? await agy(p, rulesOff) : jsonl(p, provider === "cowork" ? "claude-code" : provider, rulesOff);
        const excluded = skip || (provider === "cowork" && scheduled(p));
        st.unknownRecords += bad;
        if (shape && !excluded && SHAPED.has(provider)) shapes[p] = { provider, at: Math.floor(Math.max(secondsOf(stat.mtimeNs), w ? secondsOf(w.mtimeNs) : 0)), ...shape };
        if (excluded) { newcache[p] = signature; excludedSources.push(p); continue; }
        const humans = rows.filter((m) => m.role === "user");
        if (humans.length) {
          const stem = basename(p, extname(p));
          const chat = { id: `${provider}:${stem.replaceAll("rollout-", "")}`, provider, project: cwd ? digest(cwd).slice(0, 16) : null, source: p, messages: rows, sourceHash: digest(pyJson(rows)) };
          // Which AI answered each message (modelLinks), kept apart from the
          // chat: sense/runtime.mjs collect files it in model-links.json and
          // takes it off before the chat is stored.
          chat.models = linksFor(chat, models, provider === "antigravity" ? { app: basename(dirname(dirname(p))) } : {});
          out.push(chat);
          st.chats += 1;
          st.messages += humans.length;
          foundChats += 1;
          foundMessages += humans.length;
        }
        newcache[p] = signature;
      } catch (e) {
        st.errors += 1;
        st.issues.push({ file: basename(p), reason: String(e?.message || e) });
      }
    }
  }
  tick(looked, foundChats, foundMessages, true);
  return { chats: out, providers: stats, cache: newcache, excludedSources, shapes };
}

/** Whether this Node can open a chat database by itself (Node 22.5 and later). */
export async function canCollect() {
  try { await import("node:sqlite"); return true; } catch { return false; }
}

// Run as a program: the same stdin and stdout as collect.py.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const args = JSON.parse(input);
  process.stdout.write(JSON.stringify(await collect(args.home, args.since, args.cache || {}, { rulesOff: args.rulesOff === true, progress: args.progress || null })));
}
