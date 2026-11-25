// What differs between a Mac, Windows and Linux, in one place, so no other
// file names a Mac folder or a Mac command again. Plan:
// .docs/plans/2026-10-19-windows-and-linux.md. Session 133, 22 October 2026.
// Plain JavaScript, not TypeScript: bin/korture.mjs and sense/cli.mjs load it
// through debug/b-run/layout.mjs before they can turn TypeScript on, and the
// Node on a person's PATH (22.15 on our founder's Mac) cannot read a .ts file then.
import { withClaudeKey } from "./claude-key.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, delimiter } from "node:path";
import { homedir, platform, tmpdir } from "node:os";
import { createRequire, syncBuiltinESMExports } from "node:module";
const { env, execPath } = process;

// A tester, 29 October 2026: on Windows "it quickly opens and closes windows".
// The app starts Node with no console window, so every console program Node
// then starts (where, cmd, powershell, claude, codex) gets a window of its own
// that flashes up and shuts, unless the call asks Windows to hide it. Forty
// calls did not ask. Here every call made from Node in this process hides its
// window on Windows, whatever file makes it. Nothing changes on a Mac.
/** Make every call on `cp` (node:child_process, or a stand-in in a test) hide its window unless it says otherwise. */
export function hideWindows(cp) {
  const on = { windowsHide: true };
  const hide = (o) => (o && typeof o === "object" && !Array.isArray(o) ? { ...on, ...o } : o ?? on);
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync"]) {
    const real = cp[name];
    cp[name] = (file, args, options, ...rest) => {
      if (typeof args === "function") return real(file, on, args, options, ...rest);
      if (!Array.isArray(args)) return real(file, hide(args), options, ...rest);
      if (typeof options === "function") return real(file, args, on, options, ...rest);
      return real(file, args, hide(options), ...rest);
    };
  }
  for (const name of ["exec", "execSync"]) {
    const real = cp[name];
    cp[name] = (command, options, ...rest) => (typeof options === "function" ? real(command, on, options, ...rest) : real(command, hide(options), ...rest));
  }
  return cp;
}
if (platform() === "win32") {
  hideWindows(createRequire(import.meta.url)("node:child_process"));
  syncBuiltinESMExports();
}

/** This computer's system. KORTURE_SYSTEM pretends another, for tests only. */
/** @returns {"mac"|"windows"|"linux"} */
export function system() {
  const forced = env.KORTURE_SYSTEM;
  if (forced === "mac" || forced === "windows" || forced === "linux") return forced;
  const p = platform();
  return p === "win32" ? "windows" : p === "darwin" ? "mac" : "linux";
}

/** The character that joins folders in PATH: ";" on Windows, ":" elsewhere. */
export const pathJoiner = (s = system()) => (s === "windows" ? ";" : ":");

/** The folders a program on PATH may sit in, from PATH itself. */
export function pathFolders(s = system()) {
  const raw = env.PATH ?? env.Path ?? "";
  return raw.split(s === "windows" ? ";" : delimiter).filter(Boolean);
}

/**
 * The full path of a program, from PATH, or null. On Windows a program can be
 * a real .exe or npm's .cmd stand-in; the .exe wins when there are both.
 */
export function onPath(bin, s = system()) {
  if (s === "windows") {
    const r = spawnSync("where", [bin], { encoding: "utf8", timeout: 10000 });
    if (r.status !== 0) return null;
    // 29 October 2026: the Claude app puts a Claude.exe shortcut in
    // %LOCALAPPDATA%\Microsoft\WindowsApps, and Windows matches names without
    // case, so "where claude" could give the Claude app itself, not Claude
    // Code: Sense then opened the app on every check. Those shortcuts open
    // Store apps, never a command tool, so they are left out.
    const found = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((f) => !/[\\/]Microsoft[\\/]WindowsApps[\\/]/i.test(f));
    return found.find((f) => /\.exe$/i.test(f)) ?? found.find((f) => /\.(cmd|bat)$/i.test(f)) ?? null;
  }
  const r = spawnSync("which", [bin], { encoding: "utf8", timeout: 10000 });
  return r.status === 0 ? (r.stdout.trim().split("\n")[0] ?? null) || null : null;
}

/**
 * How to start a program found on disk. Node refuses to start a Windows .cmd
 * file without a shell, and a shell would cut a long line and read the
 * person's words as commands. npm's .cmd stand-ins only start Node on a
 * script, so Sense starts that script with its own Node instead.
 */
export function launcher(bin) {
  if (!/\.(cmd|bat)$/i.test(bin)) return { command: bin, prefix: [] };
  let text = "";
  try { text = readFileSync(bin, "utf8"); } catch { return { command: bin, prefix: [] }; }
  // npm writes: "%_prog%"  "%dp0%\node_modules\@openai\codex\bin\codex.js" %*
  const m = text.match(/"%~?dp0%?\\([^"]+?\.(?:c|m)?js)"/i);
  if (!m || !m[1]) return { command: bin, prefix: [] };
  const script = join(dirname(bin), ...m[1].split("\\"));
  return existsSync(script) ? { command: execPath, prefix: [script] } : { command: bin, prefix: [] };
}

/** The Claude desktop app's own folders on this system, where Cowork and its extensions live. */
export function claudeAppFolders(s = system(), home = homedir()) {
  if (s === "mac") return [join(home, "Library", "Application Support", "Claude")];
  if (s === "linux") return [join(env.XDG_CONFIG_HOME || join(home, ".config"), "Claude")];
  // Windows: by how the app was installed. The Store copy keeps it inside its package.
  const roaming = env.APPDATA || join(home, "AppData", "Roaming");
  const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
  const out = [join(roaming, "Claude"), join(local, "Claude")];
  const packages = join(local, "Packages");
  try {
    const store = spawnSync("cmd", ["/c", "dir", "/b", "/ad", join(packages, "Claude_*")], { encoding: "utf8", timeout: 10000 });
    for (const name of store.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
      out.push(join(packages, name, "LocalCache", "Roaming", "Claude"));
  } catch { /* no Store copy */ }
  return out;
}

/** The program that opens a page, a file or a folder the way the person's system does. */
export function opener(target, s = system()) {
  if (s === "mac") return { command: "/usr/bin/open", args: [target] };
  if (s === "windows") return /^https?:/i.test(target)
    ? { command: "rundll32", args: ["url.dll,FileProtocolHandler", target] }
    : { command: "explorer", args: [target] };
  return { command: "xdg-open", args: [target] };
}

/** Opens a page, file or folder. True when the system took it. */
export function openThing(target) {
  const o = opener(target);
  const r = spawnSync(o.command, o.args, { encoding: "utf8", timeout: 15000 });
  // explorer answers 1 even when it opened the folder.
  return r.status === 0 || (system() === "windows" && o.command === "explorer" && !r.error);
}

/** What the clipboard holds as text, or "" when there is no way to look. */
export function readClipboard(s = system()) {
  const tries = s === "mac" ? [["/usr/bin/pbpaste", []]]
    : s === "windows" ? [["powershell", ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"]]]
    : [["wl-paste", ["--no-newline"]], ["xclip", ["-selection", "clipboard", "-o"]], ["xsel", ["--clipboard", "--output"]]];
  for (const [c, a] of tries) {
    const r = spawnSync(c, a, { encoding: "utf8", timeout: 5000 });
    if (r.status === 0) return r.stdout;
  }
  return "";
}

/** Puts text on the clipboard. True when it got there. */
export function writeClipboard(text, s = system()) {
  const tries = s === "mac" ? [["/usr/bin/pbcopy", []]]
    : s === "windows" ? [["clip", []]]
    : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  for (const [c, a] of tries) {
    const r = spawnSync(c, a, { input: text, encoding: "utf8", timeout: 5000 });
    if (r.status === 0) return true;
  }
  return false;
}

/** A desktop notification from the command line, where the system has one. The app sends its own. */
export function notifyCommand(text, s = system()) {
  if (s === "mac") {
    const esc = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return { command: "osascript", args: ["-e", `display notification "${esc}" with title "Korture Sense"`] };
  }
  if (s === "linux") return { command: "notify-send", args: ["Korture Sense", text] };
  return null;
}

/** The person's full name from the system, or "". */
export function fullName(s = system()) {
  const tries = s === "mac" ? [["id", ["-F"]]]
    : s === "windows" ? [["powershell", ["-NoProfile", "-NonInteractive", "-Command", "([adsi]\"WinNT://$env:USERDOMAIN/$env:USERNAME,user\").FullName"]]]
    : [["getent", ["passwd", env.USER || ""]]];
  for (const [c, a] of tries) {
    const r = spawnSync(c, a, { encoding: "utf8", timeout: 5000 });
    if (r.status !== 0) continue;
    const out = s === "linux" ? (r.stdout.split(":")[4] ?? "").split(",")[0] ?? "" : r.stdout;
    if (out.trim()) return out.trim();
  }
  return "";
}

/** The folder Chrome reads its native helpers from, per user. Windows reads the registry instead. */
export function chromeHostsFolder(s = system(), home = homedir()) {
  if (s === "mac") return join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
  if (s === "linux") return join(env.XDG_CONFIG_HOME || join(home, ".config"), "google-chrome", "NativeMessagingHosts");
  return null;
}

/** What a person calls this computer in a sentence: "Mac", "PC" on Windows, "computer" on Linux. */
export const deviceWord = (s = system()) => (s === "mac" ? "Mac" : s === "windows" ? "PC" : "computer");

/**
 * Session 135, 23 October 2026: the environment for an AI that Sense runs in
 * the background. A signed-out agy opened Google's sign-in page in Safari on
 * every read, about fifty tabs in one morning, with nobody at the Mac. A
 * sign-in belongs to the person and starts only from their click
 * (sense/install/get-ready.mjs signInAgy). Here no AI can open a browser:
 * NO_BROWSER is the Gemini CLI's own switch, and the `open` and `xdg-open`
 * put in front of PATH do nothing.
 */
export function quietEnv(base = env, s = system(), dir = join(tmpdir(), "korture-no-browser")) {
  // Session 138: Sense's own one-year Claude sign-in, so its calls never renew
  // (and so never cancel) the person's own Claude Code sign-in (sense/claude-key.mjs).
  const out = withClaudeKey({ ...base, NO_BROWSER: "true", KORTURE_READER: "1" }, { sys: s });
  if (s === "windows") return { ...out, BROWSER: "none" };
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const name of ["open", "xdg-open"]) {
      const f = join(dir, name);
      if (!existsSync(f)) writeFileSync(f, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }
  } catch { /* NO_BROWSER still stands */ }
  return { ...out, BROWSER: join(dir, "open"), PATH: `${dir}${delimiter}${base.PATH ?? ""}` };
}
