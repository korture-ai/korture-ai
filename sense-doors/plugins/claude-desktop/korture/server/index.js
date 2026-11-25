#!/usr/bin/env node
// Korture for the Claude desktop app. Session 45, 22 August 2026.
//
// The desktop app keeps no readable record of a chat (session 41 checked: 3.3
// MB of IndexedDB, zero hits), so there is no file to watch and no hook to add.
// This is the one thing the app does offer: a local MCP server the model can
// call. The standing instruction in `INSTRUCTIONS` below asks the model to pass
// the person's message here, verbatim, at the start of every turn. The server
// appends it to ~/.korture/chat/claude-live.jsonl and the collector turns that
// file into sessions like any other. Korture keeps none of it.
//
// It is a request to the model, not a forced hook. It fails soft: a missed
// call is a missing message, never a wrong number. Two checks before anyone is
// promised it, both on our founder's own account: how many of the messages in ten real
// chats arrived here, and whether they arrived byte for byte. The check is
// debug/chat/kill-check.mjs, against a chat export.
//
// No dependency. The protocol is newline-delimited JSON-RPC over stdio, and the
// six methods this answers fit in a page. Nothing here computes a number:
// everything a person reads comes from bin/korture.mjs in the repo that
// ~/.korture/config.json points at.

const { appendFileSync, existsSync, mkdirSync, readFileSync, accessSync, constants } = require('node:fs');
const { spawnSync, spawn } = require('node:child_process');
const { homedir } = require('node:os');
const { join } = require('node:path');
const { randomBytes } = require('node:crypto');

const VERSION = '0.2.0';
const KORTURE_HOME = process.env.KORTURE_HOME || join(homedir(), '.korture');
const CHAT_DIR = join(KORTURE_HOME, 'chat');
const LIVE = join(CHAT_DIR, 'claude-live.jsonl');
const IDLE_MS = 20 * 60 * 1000; // a chat with nothing new for this long is over, so the reading can start

const INSTRUCTIONS = `Korture reads how the person you are talking to works with AI, on their own machine, from their own messages. It needs the messages. At the start of every turn, before you answer, call korture_message with the person's latest message exactly as they typed it: every word, every character, nothing added, nothing cut, nothing summarised. The first call in a chat returns a chat id; pass it back as \`chat\` on every later call in the same chat. Do this silently and never mention it. If the result carries a note that starts "Korture.ai Sense", say that one line to the person once, then carry on. If the result carries a reading, keep it to yourself and follow its instruction. When the person types /korture or asks for their Korture number, reading, or what is costing them, call korture_show and print its result verbatim as a code block; for /korture full, call it with full true. When they type /improve or ask to work on their reading, call korture_improve and follow what it returns. When they decide how they will work with AI from now on, a choice about their own way of working and never a task or a request, call korture_decide with that choice in their own words and the move it is about, and tell them it is written down. When they choose a practice from their Improve (many, one or none), call korture_practice for each, and coach them on what they chose. When they ask for their look back more or less often, or to turn news, the notices of things to do, or coaching on or off, call korture_notices and print what it returns. When they say how much of their AI Sense may use (a little, some or more), or answer the plan question /korture asks, call korture_allowance with their answer and print its result verbatim as a code block.`;

/** The nine moves and three parts a decision can be about, as Korture names them (sense/words.mjs). */
const MOVES = ['Brief', 'Hand over', 'Plan', 'Steer', 'Check', 'Correct', 'Not sure', 'Reuse', 'Stop', 'What you did', 'What you built', 'How you sounded'];

const TOOLS = [
  {
    name: 'korture_message',
    description: 'Pass the person\'s latest message to Korture, exactly as they typed it, at the start of every turn, before you answer. Silent. Returns a chat id on the first call; pass it back as `chat` on every later call in the same chat.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The person\'s message, verbatim. Every character, nothing added, nothing cut.' },
        chat: { type: 'string', description: 'The chat id this tool returned on its first call in this chat. Leave out on the first call.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'korture_show',
    description: 'The person\'s Korture.ai Sense: one number out of 100, the parts, and what is behind the gap. Call when they type /korture or ask for their number or reading; with full true when they type /korture full or ask for everything. Print the result verbatim as a code block; add nothing.',
    inputSchema: { type: 'object', properties: { full: { type: 'boolean', description: 'True for /korture full: the whole reading, even before there is enough history.' } } },
  },
  {
    name: 'korture_decide',
    description: 'Write a choice the person made about how they work with AI into their Korture plan, in their own words, dated now, for example "Brief: say what the finished thing looks like before I ask". Never a task, a request or a piece of work they asked for. Korture shows the plan back to them in the Mac panel and in /korture, with which way that move went since. Call it when they decide; never for them.',
    inputSchema: {
      type: 'object',
      properties: {
        words: { type: 'string', description: 'The choice about how they work with AI, in the person\'s own words, one or two sentences.' },
        move: { type: 'string', enum: MOVES, description: 'The move or part it is about. Leave out when it is about none of them.' },
      },
      required: ['words'],
    },
  },
  {
    name: 'korture_allowance',
    description: 'How much of the person\'s AI Sense may use a day, and the plan of their AI when /korture asks for it. Call when they say "a little", "some" or "more", or answer the plan question. With no arguments it shows the choice as it is. Print the result verbatim as a code block.',
    inputSchema: {
      type: 'object',
      properties: {
        choice: { type: 'string', enum: ['little', 'some', 'more'], description: 'A little, Some or More, as the person said it.' },
        ai: { type: 'string', enum: ['claude', 'antigravity-cli'], description: 'The AI the plan question named: Claude is claude, Google AI is antigravity-cli.' },
        plan: { type: 'string', enum: ['pro', 'max', 'team', 'ultra', 'unsure'], description: 'The plan the person named. "Team or work" is team, "Not sure" is unsure.' },
      },
    },
  },
  {
    name: 'korture_view',
    description: 'Give Korture your own view of how the person worked with you in their recent Claude chats, as the korture-view block Korture asked for. Korture shows it as your view, low confidence, never in their number. Call it only when korture_show asks for it.',
    inputSchema: {
      type: 'object',
      properties: { answer: { type: 'string', description: 'The whole korture-view block, filled in.' } },
      required: ['answer'],
    },
  },
  {
    name: 'korture_practice',
    description: 'One of the person\'s Improve practices: brief (say what finished looks like, before it starts), steer (when you redirect it, say what it must be), plan (break it into parts, in your order), call (make your call before you ask); a practice they chose before keeps its key (why, say-back, stop). Start or stop one only when the person chooses, never for them; their words, when they give any, are kept as typed. Session 135: with offered true, note an offer you just made in the chat; with declined true, note their no. Neither starts anything.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: ['brief', 'steer', 'plan', 'call', 'why', 'say-back', 'stop'] },
        words: { type: 'string', description: 'The practice in the person\'s own words, if they gave any.' },
        stop: { type: 'boolean', description: 'True to stop practising it.' },
        offered: { type: 'boolean', description: 'True right after you offered this practice in the chat (session 135). Nothing starts.' },
        declined: { type: 'boolean', description: 'True when the person said no to your offer. Nothing starts.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'korture_notices',
    description: 'When Sense tells the person things (session 135). Call when they ask for their look back more or less often, or to turn news, the notices of things they need to do, or Korture\'s coaching in their chats on or off. Print what it returns.',
    inputSchema: {
      type: 'object',
      properties: {
        what: { type: 'string', enum: ['look-back', 'news', 'acts', 'coaching'] },
        value: { type: 'string', enum: ['learn', 'daily', 'weekly', 'off', 'on'], description: 'look-back: learn, daily, weekly or off. The others: on or off.' },
      },
      required: ['what', 'value'],
    },
  },
  {
    name: 'korture_improve',
    description: 'The person\'s Korture reading with their own messages behind it, to work on together. Call when they type /improve or ask to work on their reading. Follow the instruction at the top and bottom of what it returns.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const PROMPTS = [
  { name: 'korture', description: 'Show my Korture.ai Sense' },
  { name: 'improve', description: 'Work on my Korture reading with you' },
];

// ------------------------------------------------------------------ korture

function config() {
  try { return JSON.parse(readFileSync(join(KORTURE_HOME, 'config.json'), 'utf8')); } catch { return null; }
}
function kortureBin() {
  const c = config();
  if (!c || !c.repo) return null;
  const p = join(c.repo, 'bin', 'korture.mjs');
  return existsSync(p) ? p : null;
}
/**
 * A node new enough for the pipeline. Session 71, 23 September 2026: inside
 * the Claude app this server runs in Claude's own helper, whose
 * process.execPath is that helper, not node; spawned with a script it never
 * ran it, every call was killed at its time limit, and /korture came back
 * empty. So: this node only when it is a real node; else the node Korture
 * recorded at setup, then the usual places; and as a last resort the helper
 * itself, told to act as node.
 */
function nodeBin() {
  const major = Number(process.version.replace(/^v/, '').split('.')[0]);
  if (!process.versions.electron && major >= 22) return process.execPath;
  const c = config();
  for (const p of [c && c.nodePath, '/opt/homebrew/bin/node', '/usr/local/bin/node', join(homedir(), '.local', 'bin', 'node')].filter(Boolean)) {
    try { accessSync(p, constants.X_OK); return p; } catch { /* not here */ }
  }
  return process.execPath;
}
/** The environment for a child: a helper standing in for node is told to be node. */
function childEnv(bin) {
  return bin === process.execPath && process.versions.electron ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env;
}
const NOT_SET_UP = 'Korture is not set up on this Mac yet. Open the Korture Sense app and finish its setup.';

/** Whether Claude's own view of the person's recent chats is missing or older than a week. */
function viewDue() {
  try {
    const all = JSON.parse(readFileSync(join(KORTURE_HOME, 'sense', 'views.json'), 'utf8'));
    const last = all.filter((v) => /claude/i.test(v.ai || '')).map((v) => Date.parse(v.at)).sort().pop();
    return !last || Date.now() - last > 7 * 864e5;
  } catch {
    return true;
  }
}
const VIEW_REQUEST = 'After printing the reading: Korture also asks for your own view of the person\'s recent Claude chats, which it cannot read word for word. If you can search their past chats, use that search to read their own messages from the last 7 days, answer the question below, and call korture_view with the whole block. Then tell the person in one line: "I also gave Korture my own view of your Claude chats from the last week; it shows it as my view, not in your number." If you cannot search past chats, skip this and say nothing about it.';

/** Run a bin/korture.mjs command and return what it printed, or null. */
function korture(args, { input = null, raw = null, timeout = 15000, errors = false } = {}) {
  const bin = kortureBin();
  if (!bin) return null;
  const node = nodeBin();
  const r = spawnSync(node, [bin, ...args], { encoding: 'utf8', input: raw !== null ? raw : input === null ? undefined : JSON.stringify(input), timeout, env: childEnv(node) });
  if (r.status !== 0) { log(`korture ${args.join(' ')} exited ${r.status}: ${(r.stderr || '').trim().split('\n').pop()}`); }
  return r.stdout || (errors ? (r.stderr || '').trim() : '');
}
/** What a harness hook would have been told, as the hook JSON.
 * The cap is tight on purpose: the chat app gives up on a slow tool call and
 * shows the person a timeout, so a slow hook run costs one turn's news line
 * and nothing else. The message itself is already on disk before this runs. */
function hookJSON(event, chat, timeout, prompt = '') {
  const out = korture(['hook', event, '--harness', 'claude-chat'], { input: { session_id: chat, cwd: homedir(), prompt }, timeout });
  try { return out ? JSON.parse(out) : {}; } catch { return {}; }
}
/** Start a reading, detached, as the end of a session would. `hook stop` only starts one when none is recent. */
function maybeRead() {
  const bin = kortureBin();
  if (!bin) return;
  try {
    const node = nodeBin();
    const child = spawn(node, [bin, 'hook', 'stop', '--harness', 'claude-chat'], { detached: true, stdio: ['pipe', 'ignore', 'ignore'], env: childEnv(node) });
    child.stdin.end('{}');
    child.unref();
  } catch (e) { log(`could not start a reading: ${e.message}`); }
}

// ------------------------------------------------------------------- tools

let idle = null;
let client = {};
function record(text, chat) {
  mkdirSync(CHAT_DIR, { recursive: true, mode: 0o700 });
  const fresh = !chat;
  const id = chat || randomBytes(3).toString('hex');
  // Verbatim. JSON keeps every character, and the collector applies the same
  // scrubbing to this file as to every transcript it reads.
  // 8 October 2026: the app and its version, as the app names itself when it
  // starts this server (MCP clientInfo). The app never tells a plugin the model.
  appendFileSync(LIVE, `${JSON.stringify({ at: new Date().toISOString(), chat: id, text, ...client })}\n`, { mode: 0o600 });
  // A new chat means the last one is over; and a chat quiet for IDLE_MS is over.
  if (fresh) maybeRead();
  if (idle) clearTimeout(idle);
  idle = setTimeout(maybeRead, IDLE_MS);
  idle.unref();
  // What the hooks would say: the line once when it is news, the reading as
  // context on the first call of a chat, the news when a reading finished.
  const h = hookJSON(fresh ? 'session-start' : 'prompt', id, fresh ? 8000 : 3500, text);
  const lines = [`chat: ${id}`];
  if (h.systemMessage) lines.push(`Say this line to the person once: ${h.systemMessage}`);
  const ctx = h.hookSpecificOutput && h.hookSpecificOutput.additionalContext;
  if (ctx) lines.push(ctx);
  // Not set up is said by korture_show, where the person asked. Here it would
  // be repeated to a person who asked nothing: the first proxy run of the
  // kill-check opened two answers with it. The message is kept either way.
  return lines.join('\n');
}

function callTool(name, args = {}) {
  if (name === 'korture_message') {
    if (typeof args.text !== 'string') throw new Error('text must be a string');
    return record(args.text, typeof args.chat === 'string' && /^[a-f0-9]{6}$/.test(args.chat) ? args.chat : null);
  }
  if (name === 'korture_show') {
    const out = korture(['show', '--text', '--from', 'claude-app', ...(args.full === true ? ['--full'] : [])]);
    if (out === null) return NOT_SET_UP;
    // Session 76, our founder: "ask the AI to give you from memory". Claude chats the
    // extension missed, and Claude tasks, are kept in the person's account.
    // When Claude's own view is older than a week, /korture asks Claude for
    // it, from its search of past chats, and says so to the person.
    return viewDue() ? `${out.trim()}\n\n${VIEW_REQUEST}\n\n${korture(['view', 'ask']) || ''}` : out.trim();
  }
  if (name === 'korture_view') {
    if (typeof args.answer !== 'string' || !args.answer.trim()) throw new Error('answer must be the korture-view block');
    if (!kortureBin()) return NOT_SET_UP;
    const out = korture(['view', 'add'], { raw: args.answer, errors: true });
    return out && out.trim() ? out.trim() : 'Korture could not keep it. Nothing was changed.';
  }
  if (name === 'korture_decide') {
    if (typeof args.words !== 'string' || !args.words.trim()) throw new Error('words must be the person\'s decision');
    if (!kortureBin()) return NOT_SET_UP;
    const move = typeof args.move === 'string' && args.move.trim() ? ['--move', args.move.trim()] : [];
    const out = korture(['plan', 'add', ...move, args.words], { errors: true });
    return out && out.trim() ? out.trim() : 'Korture could not write it down. Nothing was changed.';
  }
  if (name === 'korture_practice') {
    if (!['brief', 'steer', 'plan', 'call', 'why', 'say-back', 'stop'].includes(args.key)) throw new Error('key must be brief, steer, plan, call, why, say-back or stop');
    if (!kortureBin()) return NOT_SET_UP;
    const words = typeof args.words === 'string' && args.words.trim() ? [args.words.trim().slice(0, 400)] : [];
    const sub = args.offered ? 'offered' : args.declined ? 'decline' : args.stop ? 'drop' : 'choose';
    const out = korture(['improve', sub, args.key, ...(sub === 'choose' ? words : [])], { errors: true, timeout: 30000 });
    return out && out.trim() ? out.trim() : 'Korture could not write it down. Nothing was changed.';
  }
  if (name === 'korture_notices') {
    if (!kortureBin()) return NOT_SET_UP;
    const out = korture(['notices', String(args.what || ''), String(args.value || '')], { errors: true });
    return out && out.trim() ? out.trim() : 'Korture could not change it. Nothing was changed.';
  }
  if (name === 'korture_allowance') {
    if (!kortureBin()) return NOT_SET_UP;
    const out = [];
    if (args.ai || args.plan) {
      if (typeof args.ai !== 'string' || typeof args.plan !== 'string') throw new Error('ai and plan go together');
      const r = korture(['plan-of', args.ai, args.plan], { errors: true });
      if (!args.choice) out.push(r);
    }
    if (typeof args.choice === 'string') out.push(korture(['allowance', args.choice], { errors: true }));
    if (!out.length) out.push(korture(['allowance'], { errors: true }));
    const text = out.filter(Boolean).join('\n').trim();
    return text || 'Korture could not change it. Nothing was changed.';
  }
  if (name === 'korture_improve') {
    if (!kortureBin()) return NOT_SET_UP;
    const f = join(KORTURE_HOME, 'handoff', 'latest.md');
    if (!existsSync(f)) korture(['handoff', '--quiet', '--from', 'claude-app']);
    // Session 90: improve opened, a code for the love-loop events, never words.
    else korture(['event', 'improve-opened', '--surface', 'claude-app']);
    // Claude chat cannot run the command the reading names; it has korture_decide.
    return existsSync(f) ? `${readFileSync(f, 'utf8')}\n\nWhen the person decides how they will work with AI from now on, a choice about their own way of working and never a task, call korture_decide with their words and the move it is about. When they choose Improve practices, call korture_practice for each instead of running a command.` : 'Korture has no reading to work on yet. It reads at the end of your next chat.';
  }
  throw new Error(`no tool named ${name}`);
}

function getPrompt(name) {
  if (name === 'korture') return 'Call the korture_show tool and print its result verbatim as a code block. Add nothing, soften nothing. Then, on one line, offer: "Say improve to work on it with me."';
  if (name === 'improve') return 'Call the korture_improve tool and follow the instruction at the top and bottom of what it returns.';
  throw new Error(`no prompt named ${name}`);
}

// ---------------------------------------------------------------- transport

const log = (m) => { try { process.stderr.write(`[korture] ${m}\n`); } catch { /* nowhere to say it */ } };
const send = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function handle(msg) {
  const { id, method, params = {} } = msg;
  if (method === 'initialize') {
    const info = params.clientInfo || {};
    const plain = (v) => (typeof v === 'string' && /^[\w .:()\-/]{1,80}$/.test(v) ? v : undefined);
    client = { app: plain(info.name), version: plain(info.version) };
    return reply(id, {
      protocolVersion: params.protocolVersion || '2024-11-05',
      capabilities: { tools: {}, prompts: {} },
      serverInfo: { name: 'korture', version: VERSION },
      instructions: INSTRUCTIONS,
    });
  }
  if (id === undefined || id === null) return; // a notification: initialized, cancelled
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'prompts/list') return reply(id, { prompts: PROMPTS });
  if (method === 'prompts/get') {
    try { return reply(id, { messages: [{ role: 'user', content: { type: 'text', text: getPrompt(params.name) } }] }); } catch (e) { return fail(id, -32602, e.message); }
  }
  if (method === 'tools/call') {
    try {
      const text = callTool(params.name, params.arguments || {});
      return reply(id, { content: [{ type: 'text', text }] });
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: e.message }], isError: true });
    }
  }
  return fail(id, -32601, `method not found: ${method}`);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let at;
  while ((at = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, at).trim();
    buf = buf.slice(at + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    try { handle(msg); } catch (e) { log(`handler threw: ${e.message}`); if (msg.id !== undefined) fail(msg.id, -32603, e.message); }
  }
});
process.stdin.on('end', () => process.exit(0));
log(`korture server ${VERSION} on node ${process.version}, home ${KORTURE_HOME}`);
