// Korture Sense in Claude Code, beside the work (session 89, presence). A
// Claude Code mod: one line under the prompt with the number and what sits
// below solid, everyday work, and a short message once for each piece of
// news (a stretch finished, a pattern found, a new lesson, a choice that
// worked). It only reads ~/.korture/sense/presence.json, which the reading
// writes, and asks Korture for the next news item, so Korture alone marks
// an item said and two open sessions do not both show it.
const EVERY_MS = 60_000;

async function home($) {
  return (await $.env.get("KORTURE_HOME")) || `${await $.env.get("HOME")}/.korture`;
}

async function readJson($, path) {
  try {
    return JSON.parse(await $.fs.read(path));
  } catch {
    return null;
  }
}

/** "Sense 70 · Steer and Plan are below solid, everyday work." */
export function statusOf(p) {
  if (!p || typeof p.number !== "number") return undefined;
  return `Sense ${p.number}${p.gap ? ` · ${p.gap}` : ""}`;
}

async function tick($) {
  const root = await home($);
  const p = await readJson($, `${root}/sense/presence.json`);
  const line = statusOf(p);
  if (line) $.ui.status(line);
  // News: Korture hands out the next item for this channel and marks it said.
  const config = await readJson($, `${root}/config.json`);
  if (!config?.repo || !config?.nodePath || !(p?.news || []).length) return;
  try {
    const r = await $.process.run([config.nodePath, `${config.repo}/bin/korture.mjs`, "news", "take", "claude-code-mod"], { timeoutMs: 15_000 });
    const item = r.exitCode === 0 && r.stdout.trim() ? JSON.parse(r.stdout.trim()) : null;
    if (item?.text) $.ui.toast(`Korture Sense: ${item.text}`, { timeoutMs: 8000 });
  } catch {
    /* the next tick tries again */
  }
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    await tick($);
    $.clock.every(EVERY_MS, () => tick($));
    return next(e);
  });
}
