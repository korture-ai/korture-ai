// Korture Proof: shows a person proof of their own part in a finished piece of AI work.
// Remote MCP server (plain JSON-RPC over HTTP POST) for ChatGPT and other AI apps.
// The person's own AI reads the chat. This server only draws the result and keeps
// counts (how many calls, the share, the kind of work). It never stores words from the chat.
import { PAGE } from "./page.ts";
import { GUIDE } from "./guide.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WIDGET = "ui://widget/korture-proof-v2.html"; // ChatGPT (Apps SDK)
const APP = "ui://widget/korture-proof-app-v2.html"; // MCP Apps standard (Claude and others)

async function logRun(row: Record<string, unknown>) {
  try {
    await fetch(`${URL_}/rest/v1/proof_runs`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
  } catch (e) { console.error(String(e)); }
}

const CALL = {
  type: "object",
  properties: {
    what: { type: "string", description: "The choice, max 12 words." },
    who: { type: "string", enum: ["you", "yes", "ai"] },
    layer: { type: "integer", minimum: 1, maximum: 8 },
    quote: { type: "string", description: "Exact words from the chat, max 25 words." },
    speaker: { type: "string", enum: ["you", "ai"] },
  },
  required: ["what", "who", "layer", "quote", "speaker"],
  additionalProperties: false,
};

const TOOLS = [
  {
    name: "proof_guide",
    title: "Korture Proof: how to count",
    description: "Use when the person asks for proof of their part in a finished piece of work, for example \"show my proof\" or \"how much of this was mine\". Returns how Korture counts the calls in a finished piece of work.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Korture Proof: how to count", readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "show_proof",
    title: "Korture Proof: show it",
    description: "Shows the person proof of their part in the finished work: the layers, the share of calls that were theirs, their best moments and a card to share.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short name of the work, max 8 words." },
        kind: { type: "string", enum: ["post", "code", "video", "story", "research", "ad", "doc"] },
        finished: { type: "string", description: "What was made, max 20 words." },
        calls: { type: "array", items: CALL },
        moments: {
          type: "array", maxItems: 3,
          items: { type: "object", properties: { quote: { type: "string" }, changed: { type: "string" } }, required: ["quote", "changed"], additionalProperties: false },
        },
        next_time: {
          type: "object",
          properties: { layer: { type: "integer", minimum: 1, maximum: 8 }, ai_decided: { type: "string" }, try: { type: "string" } },
          required: ["layer", "ai_decided", "try"], additionalProperties: false,
        },
      },
      required: ["title", "kind", "finished", "calls", "moments", "next_time"],
      additionalProperties: false,
    },
    annotations: { title: "Korture Proof: show it", readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: {
      ui: { resourceUri: APP },
      "ui/resourceUri": APP,
      "openai/outputTemplate": WIDGET,
      "openai/toolInvocation/invoking": "Drawing your proof",
      "openai/toolInvocation/invoked": "Your proof is ready",
      "openai/widgetAccessible": false,
    },
  },
];

const text = (s: string) => ({ content: [{ type: "text", text: s }] });

async function call(name: string, a: Record<string, any>, meta: Record<string, unknown>) {
  if (name === "proof_guide") return text(GUIDE + "\n\nWhen you have the calls, call show_proof with them instead of writing the JSON block in the chat. After it shows, add the short plain version in one or two lines.");
  if (name === "show_proof") {
    const calls = Array.isArray(a.calls) ? a.calls : [];
    const yours = calls.filter((c: any) => c && (c.who === "you" || c.who === "yes")).length;
    const pct = calls.length ? Math.round((100 * yours) / calls.length) : 0;
    const part = { v: 1, title: a.title, kind: a.kind, finished: a.finished, calls, moments: a.moments || [], next_time: a.next_time };
    await logRun({
      subject: meta["openai/subject"] ?? null, session: meta["openai/session"] ?? null, locale: meta["openai/locale"] ?? null,
      kind: String(a.kind || ""), calls: calls.length, yours, pct, moments: (a.moments || []).length,
    });
    return {
      content: [{ type: "text", text: `KORTURE.ai Proof: ${pct}% of the calls in this were yours (${yours} of ${calls.length}).` }],
      structuredContent: part,
      _meta: { "openai/outputTemplate": WIDGET, ui: { resourceUri: APP } },
    };
  }
  throw Error(`Unknown tool ${name}`);
}

const RESOURCE = {
  uri: WIDGET,
  name: "Korture Proof",
  mimeType: "text/html+skybridge",
  _meta: {
    "openai/widgetDescription": "The person's part in one finished piece of AI work, as layers, a share and a card.",
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": { connect_domains: [], resource_domains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"] },
  },
};

const RESOURCE_APP = {
  uri: APP,
  name: "Korture Proof",
  mimeType: "text/html;profile=mcp-app",
  _meta: { ui: { csp: { connectDomains: [], resourceDomains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"] }, prefersBorder: true } },
};

async function handle(msg: any) {
  const { id, method, params = {} } = msg;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  if (method === "initialize")
    return ok({
      protocolVersion: params.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
      serverInfo: { name: "korture-proof", title: "Korture", version: "0.1.0" },
      instructions: "Korture shows a person their own part in a finished piece of AI work. When they ask for proof of their part, call proof_guide, read the whole chat (or chats) as it says, then call show_proof.",
    });
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: TOOLS });
  if (method === "resources/list") return ok({ resources: [RESOURCE, RESOURCE_APP] });
  if (method === "resources/templates/list") return ok({ resourceTemplates: [] });
  if (method === "resources/read") {
    // Older page names stay readable, so apps that saved them keep working.
    const u = String(params.uri || "");
    const r = u === WIDGET || u === "ui://widget/korture-proof-v1.html" ? RESOURCE
      : u === APP || u === "ui://widget/korture-proof-app-v1.html" ? RESOURCE_APP : null;
    if (!r) return { jsonrpc: "2.0", id, error: { code: -32002, message: "Resource not found" } };
    return ok({ contents: [{ ...r, uri: u, text: PAGE }] });
  }
  if (method === "tools/call") {
    try {
      return ok(await call(params.name, params.arguments || {}, params._meta || {}));
    } catch (e) {
      await logRun({ error: String(e).slice(0, 300), kind: String(params.name || "") });
      return ok({ ...text("Korture could not draw this. Please try again."), isError: true });
    }
  }
  if (id === undefined) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

Deno.serve(async (req) => {
  if (req.method === "GET") return new Response("Korture Proof. Add this address to your AI app as a connector.", { headers: { "Content-Type": "text/plain" } });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  let body: any;
  try { body = await req.json(); } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const list = Array.isArray(body) ? body : [body];
  const out = (await Promise.all(list.map(handle))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? out : out[0]);
});
