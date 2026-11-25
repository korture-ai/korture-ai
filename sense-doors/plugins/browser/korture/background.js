// Korture Sense in the browser. 1 October 2026, session 75.
//
// The person's Claude chats, Claude tasks and ChatGPT chats are kept in their
// accounts, not on the Mac: the Claude app and the ChatGPT app show the same
// chats as claude.ai and chatgpt.com. So every ten minutes this plugin asks
// the sites the person is signed into for their own messages since the last
// time, the way the sites' own pages ask, and hands them to Korture's helper
// on this Mac (`korture-host`, set up by `korture.mjs browser install`). Only
// the person's own words are kept: no replies, no tool output, nothing the
// app adds. Signed out of a site, that site is skipped until next time.
const HOST = "ai.korture.sense";
const EVERY = 10;
// The first time, the last week, so the stretch of work going on now is whole.
const FIRST = 7 * 864e5;
const CHUNK = 200;

const json = async (url, headers = {}) => {
  const r = await fetch(url, { credentials: "include", headers });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
const time = (t) => (typeof t === "number" ? t * 1000 : Date.parse(t));
const iso = (t) => new Date(time(t)).toISOString();

/** The words of a message's text blocks, or null when it carries anything else (a tool result). */
function words(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content) || !content.length || content.some((b) => b && b.type !== "text")) return null;
  return content.map((b) => b.text || "").join("\n");
}

/** Claude chats: the same list and the same messages the Claude app shows. */
async function claudeChats(org, from, floor) {
  const out = [];
  for (let offset = 0; offset < 2000; offset += 50) {
    const page = await json(`https://claude.ai/api/organizations/${org}/chat_conversations_v2?limit=50&offset=${offset}&archived=false&consistency=eventual`);
    const list = page.data || [];
    for (const c of list) {
      if (time(c.updated_at) < from) return out;
      const conv = await json(`https://claude.ai/api/organizations/${org}/chat_conversations/${c.uuid}?tree=True&rendering_mode=messages&render_all_tools=true`);
      for (const m of conv.chat_messages || []) {
        if (m.sender !== "human" || time(m.created_at) < floor) continue;
        const text = typeof m.text === "string" && m.text ? m.text : words(m.content);
        // The model the chat is set to; claude.ai keeps one per chat.
        if (text) out.push({ site: "claude.ai", chat: c.uuid, id: m.uuid, text, at: iso(m.created_at), model: conv.model || c.model || undefined, modelFrom: "chat" });
      }
    }
    if (!page.has_more || !list.length) break;
  }
  return out;
}

/** Claude tasks (Cowork): only the ones the person started, not scheduled ones. */
async function claudeTasks(org, from, floor) {
  const h = { "anthropic-version": "2023-06-01", "x-organization-uuid": org };
  const out = [];
  let cursor = null;
  for (let n = 0; n < 20; n++) {
    const page = await json(`https://claude.ai/v1/code/sessions?tags=cowork-remote&limit=100&include_trigger_sessions=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, h);
    const list = page.data || [];
    for (const s of list) {
      if (time(s.updated_at) < from) return out;
      let ec = null;
      for (let k = 0; k < 100; k++) {
        const ev = await json(`https://claude.ai/v1/code/sessions/${s.id}/events?limit=100${ec ? `&cursor=${encodeURIComponent(ec)}` : ""}`, h);
        const events = ev.data || [];
        // Newest first: the model of the nearest answer after each message.
        let answerModel;
        for (const e of events) {
          const p = e.payload || {};
          if (e.event_type === "assistant" && p.message && typeof p.message.model === "string") { answerModel = p.message.model; continue; }
          if (e.event_type !== "user" || p.parent_tool_use_id || p.shouldQuery === false || p.isMeta || p.isSynthetic) continue;
          if (time(e.created_at) < floor) continue;
          const text = words(p.message && p.message.content);
          if (text) out.push({ site: "claude-task", chat: s.id, id: p.uuid || e.event_id, text, at: iso(e.created_at), model: answerModel, modelFrom: "answer" });
        }
        // Newest first: stop once a page reaches back past what is needed.
        const oldest = events.length ? time(events[events.length - 1].created_at) : 0;
        if (!ev.next_cursor || !events.length || oldest < Math.max(from, floor)) break;
        ec = ev.next_cursor;
      }
    }
    if (!page.next_cursor || !list.length) break;
    cursor = page.next_cursor;
  }
  return out;
}

async function claude(from, floor) {
  const orgs = await json("https://claude.ai/api/organizations");
  const out = [];
  for (const o of orgs) {
    try { out.push(...(await claudeChats(o.uuid, from, floor))); } catch { /* no chats in this one */ }
    try { out.push(...(await claudeTasks(o.uuid, from, floor))); } catch { /* no tasks in this one */ }
  }
  return out;
}

/** ChatGPT chats, as chatgpt.com and the ChatGPT app keep them. */
async function chatgpt(from, floor) {
  const s = await json("https://chatgpt.com/api/auth/session");
  if (!s.accessToken) throw Object.assign(new Error("signed out"), { signedOut: true });
  const h = { Authorization: `Bearer ${s.accessToken}` };
  const out = [];
  for (let offset = 0; offset < 2000; offset += 28) {
    const page = await json(`https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=28&order=updated`, h);
    const list = page.items || [];
    for (const c of list) {
      if (time(c.update_time) < from) return out;
      const conv = await json(`https://chatgpt.com/backend-api/conversation/${c.id}`, h);
      for (const node of Object.values(conv.mapping || {})) {
        const m = node && node.message;
        if (!m || !m.author || m.author.role !== "user" || !m.create_time || time(m.create_time) < floor) continue;
        if (m.metadata && (m.metadata.is_visually_hidden_from_conversation || m.metadata.is_user_system_message)) continue;
        const parts = m.content && m.content.content_type === "text" ? (m.content.parts || []).filter((x) => typeof x === "string") : [];
        const text = parts.join("\n");
        // The model of the first answer to it, else the chat's own.
        const answer = (node.children || []).map((k) => conv.mapping[k] && conv.mapping[k].message).find((x) => x && x.author && x.author.role === "assistant" && x.metadata && x.metadata.model_slug);
        const model = answer ? answer.metadata.model_slug : conv.default_model_slug;
        if (text.trim()) out.push({ site: "chatgpt.com", chat: c.id, id: m.id, text, at: iso(m.create_time), model: model || undefined, modelFrom: answer ? "answer" : "chat" });
      }
    }
    if (list.length < 28) break;
  }
  return out;
}

const send = (batch) => new Promise((done) => chrome.runtime.sendNativeMessage(HOST, { batch }, (r) => { void chrome.runtime.lastError; done(r); }));

async function pull() {
  const st = await chrome.storage.local.get(["since", "floor"]);
  const floor = st.floor || Date.now() - FIRST;
  const since = st.since || {};
  const next = { ...since };
  const out = [];
  // What each site did this time, for Korture's self-check (sense/selfcheck.mjs):
  // fetched, signed out, or failed. Never a message, only whether it worked.
  const sites = {};
  for (const [name, read] of [["claude", claude], ["chatgpt", chatgpt]]) {
    const started = Date.now();
    try {
      const got = await read(since[name] || floor, floor);
      out.push(...got);
      sites[name] = { ok: true, signedIn: true, messages: got.length };
      // Five minutes of overlap: a chat still being written is asked for again; the helper keeps each message once.
      next[name] = started - 5 * 60e3;
    } catch (e) {
      // Signed out, or the site changed: nothing kept, asked again next time.
      const out401 = e && (e.signedOut || /^(401|403) /.test(String(e.message)));
      sites[name] = { ok: false, signedIn: out401 ? false : null };
    }
  }
  for (let i = 0; i < out.length; i += CHUNK) await send(out.slice(i, i + CHUNK));
  await new Promise((done) => chrome.runtime.sendNativeMessage(HOST, { status: { at: new Date().toISOString(), version: chrome.runtime.getManifest().version, sites } }, () => { void chrome.runtime.lastError; done(); }));
  await chrome.storage.local.set({ since: next, floor, last: { at: new Date().toISOString(), messages: out.length } });
}

const schedule = () => chrome.alarms.create("pull", { delayInMinutes: 0.1, periodInMinutes: EVERY });
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "pull") pull(); });
