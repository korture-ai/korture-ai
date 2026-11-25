// Sense's own one-year Claude sign-in (session 138, 30 October 2026).
//
// Our founder's Claude Code kept signing out. Every Claude Code window on a computer
// shares one sign-in, which each renews every few hours with a key that works
// once; two renewing at the same moment cancel it for all of them
// (anthropics/claude-code issues 24317, 48786, 61923, 80585). Sense's own
// reading ran more of those windows, so it signed the person out more often.
//
// Claude Code's own `claude setup-token` makes a sign-in for programs that run
// by themselves: one page in the browser, valid for a year, allowed only to
// send messages (scope user:inference), never renewed. Sense keeps it in the
// Mac's Keychain as "Korture Sense: Claude Code" and gives it only to the
// Claude calls Sense makes (CLAUDE_CODE_OAUTH_TOKEN). The person's own Claude
// Code sign-in is never read, renewed or changed.
import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";

export const KEY_NAME = "Korture Sense: Claude Code";
const SECURITY = "/usr/bin/security";

/**
 * The key from what `claude setup-token` shows once the person has signed in.
 * Claude Code draws it inside a box, so the box's edges and the line breaks
 * are taken out first, and the words that follow it ("Store this token...")
 * are not part of it.
 */
export function keyFromScreen(text = "") {
  const flat = String(text)
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[=>()][0-9A-Za-z]?/g, "")
    .replace(/[─-▟|]/g, "")
    .replace(/\s+/g, "");
  const m = flat.match(/sk-ant-oat\d{2}-[A-Za-z0-9_-]+/);
  if (!m) return null;
  const key = m[0].split("Store")[0];
  return key.length >= 80 ? key : null;
}

// Tests keep the key in a file of their own, never in the person's Keychain.
const testFile = () => process.env.KORTURE_CLAUDE_KEY_FILE || null;

let cached;
/** The key Sense keeps, or null: only on a Mac, where the Keychain holds it. */
export function claudeKey({ sys = process.platform === "darwin" ? "mac" : process.platform, run = spawnSync, fresh = false } = {}) {
  if (sys !== "mac") return null;
  if (cached !== undefined && !fresh) return cached;
  let key = "";
  if (testFile()) {
    try { key = readFileSync(testFile(), "utf8").trim(); } catch { key = ""; }
  } else {
    const r = run(SECURITY, ["find-generic-password", "-s", KEY_NAME, "-w"], { encoding: "utf8", timeout: 10000 });
    key = r.status === 0 ? String(r.stdout || "").trim() : "";
  }
  cached = /^sk-ant-oat\d{2}-[A-Za-z0-9_-]{60,}$/.test(key) ? key : null;
  return cached;
}

/** Keeps the key in the Keychain. It goes in through the program's input, never its command line. */
export function keepClaudeKey(key, { run = spawnSync } = {}) {
  if (!/^sk-ant-oat\d{2}-[A-Za-z0-9_-]{60,}$/.test(String(key || ""))) return false;
  if (testFile()) {
    writeFileSync(testFile(), key, { mode: 0o600 });
    cached = undefined;
    return true;
  }
  const account = (() => { try { return userInfo().username; } catch { return "sense"; } })();
  const r = run(SECURITY, ["-i"], { input: `add-generic-password -U -a "${account}" -s "${KEY_NAME}" -l "${KEY_NAME}" -w "${key}"\n`, encoding: "utf8", timeout: 10000 });
  cached = undefined;
  return r.status === 0;
}

/** The environment for a Claude call Sense makes: with Sense's own key when there is one. */
export function withClaudeKey(env, opts = {}) {
  const key = claudeKey(opts);
  return key ? { ...env, CLAUDE_CODE_OAUTH_TOKEN: key } : env;
}
