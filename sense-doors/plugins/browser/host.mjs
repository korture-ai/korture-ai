// Korture's helper for the browser plugin (session 74, 24 September 2026;
// session 75, 1 October 2026). The browser starts it and speaks its native
// messaging protocol: a 4-byte length, then JSON, on stdin; the same back on
// stdout. The plugin sends a batch of the person's own messages fetched from
// their Claude and ChatGPT accounts. Each new one is appended to
// ~/.korture/chat/browser-live.jsonl, where the collector reads it
// (sense/collect.mjs browserChats); one already kept, by its id, is not kept
// again. Korture keeps none of it anywhere else. When anything new was kept,
// a reading is started the way the end of a session starts one.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, openSync, readSync, closeSync, writeFileSync, renameSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = process.env.KORTURE_HOME || join(homedir(), ".korture");
export const LIVE = join(HOME, "chat", "browser-live.jsonl");
/** What the plugin did at its last fetch, per site, for the self-check. Never a message. */
export const STATUS = join(HOME, "browser", "status.json");
const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "korture.mjs");
// claude-task: a Claude task (Cowork) the person started.
const SITES = new Set(["chatgpt.com", "claude.ai", "claude-task"]);
const MAX = 64 << 20;

/** A message the plugin sent, checked, or null. */
export function valid(m) {
  if (!m || typeof m !== "object") return null;
  if (!SITES.has(m.site) || typeof m.chat !== "string" || !/^[\w-]{1,100}$/.test(m.chat)) return null;
  if (typeof m.text !== "string" || !m.text.trim() || m.text.length > 200000) return null;
  if (m.id !== undefined && (typeof m.id !== "string" || !/^[\w-]{1,200}$/.test(m.id))) return null;
  const at = typeof m.at === "string" && !Number.isNaN(Date.parse(m.at)) ? new Date(m.at).toISOString() : new Date().toISOString();
  const kept = m.id ? { at, chat: m.chat, id: m.id, site: m.site, text: m.text } : { at, chat: m.chat, site: m.site, text: m.text };
  // 8 October 2026: the model the site names for this message or chat
  // (chatgpt.com model_slug, claude.ai the chat's model), short strings only.
  const plain = (v) => (typeof v === "string" && /^[\w .:()\-/]{1,80}$/.test(v) ? v : undefined);
  if (plain(m.model)) kept.model = m.model;
  if (m.modelFrom === "chat" || m.modelFrom === "answer") kept.modelFrom = m.modelFrom;
  return kept;
}

/** The messages already kept, by site, chat and id. */
export function keptIds(file = LIVE) {
  const ids = new Set();
  if (!existsSync(file)) return ids;
  for (const l of readFileSync(file, "utf8").split("\n")) {
    try {
      const o = JSON.parse(l);
      if (o.id) ids.add(`${o.site}:${o.chat}:${o.id}`);
    } catch {
      // a broken line is skipped, as the collector skips it
    }
  }
  return ids;
}

/** Keep a batch from the plugin. Returns how many were new. */
export function keepBatch(list, file = LIVE) {
  const have = keptIds(file);
  const fresh = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const m = valid(raw);
    if (!m || !m.id) continue;
    const k = `${m.site}:${m.chat}:${m.id}`;
    if (have.has(k)) continue;
    have.add(k);
    fresh.push(m);
  }
  if (fresh.length) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    appendFileSync(file, fresh.map((m) => `${JSON.stringify(m)}\n`).join(""), { mode: 0o600 });
  }
  return fresh.length;
}

/** The chat of the last line kept, read from the file's end. */
function lastChat(file = LIVE) {
  if (!existsSync(file)) return null;
  const size = statSync(file).size;
  const n = Math.min(size, 250000);
  const buf = Buffer.alloc(n);
  const fd = openSync(file, "r");
  readSync(fd, buf, 0, n, size - n);
  closeSync(fd);
  const line = buf.toString("utf8").trimEnd().split("\n").pop();
  try {
    const o = JSON.parse(line);
    return `${o.site}:${o.chat}`;
  } catch {
    return null;
  }
}

/** Keep one message. Returns whether it opened a new chat. */
export function keep(m, file = LIVE) {
  const before = lastChat(file);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  appendFileSync(file, `${JSON.stringify(m)}\n`, { mode: 0o600 });
  return before !== null && before !== `${m.site}:${m.chat}`;
}

/** Keep the plugin's last fetch status: when, and per site whether it worked and was signed in. */
export function keepStatus(st, file = STATUS) {
  if (!st || typeof st !== "object" || Number.isNaN(Date.parse(st.at))) return false;
  const sites = {};
  for (const k of ["claude", "chatgpt"]) {
    const x = st.sites && st.sites[k];
    if (x && typeof x === "object") sites[k] = { ok: x.ok === true, signedIn: x.signedIn === true ? true : x.signedIn === false ? false : null, messages: Number.isInteger(x.messages) ? x.messages : null };
  }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ at: new Date(st.at).toISOString(), version: String(st.version || "").slice(0, 20), sites }), { mode: 0o600 });
  renameSync(tmp, file);
  return true;
}

function reply(o) {
  const body = Buffer.from(JSON.stringify(o), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([head, body]));
}

function startReading() {
  if (!existsSync(BIN)) return;
  try {
    const child = spawn(process.execPath, [BIN, "hook", "stop", "--harness", "browser"], { detached: true, stdio: ["pipe", "ignore", "ignore"] });
    child.stdin.end("{}");
    child.unref();
  } catch {
    // The message is kept; the next reading picks it up.
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let buf = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const n = buf.readUInt32LE(0);
      if (n > MAX) process.exit(1);
      if (buf.length < 4 + n) break;
      let o = null;
      try {
        o = JSON.parse(buf.subarray(4, 4 + n).toString("utf8"));
      } catch {
        o = null;
      }
      buf = buf.subarray(4 + n);
      if (o && o.status) {
        reply({ ok: keepStatus(o.status) });
        continue;
      }
      if (o && Array.isArray(o.batch)) {
        const kept = keepBatch(o.batch);
        reply({ ok: true, kept });
        if (kept) startReading();
        continue;
      }
      const m = valid(o);
      if (!m) {
        reply({ ok: false });
        continue;
      }
      const fresh = keep(m);
      reply({ ok: true });
      if (fresh) startReading();
    }
  });
  process.stdin.on("end", () => process.exit(0));
}
