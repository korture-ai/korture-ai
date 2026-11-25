# Korture Proof

You finish something with AI: a post, some code, a story, a report. Then a small voice asks, "did I really make this?"

Korture Proof answers with your own words. It reads the chat, finds every call that shaped the finished work, and shows you which ones were yours.

<p align="center"><img src="../assets/proof-card.png" width="400" alt="A Korture Proof card: 82% of the calls in this were mine"></p>

## What you get

- **The share of the calls that were yours.** A call is a choice that shaped the work, where a reasonable person could have chosen differently. Saying yes to the AI's idea is a choice too, so it counts as yours.
- **The work as eight layers,** from what you gave the AI to the finished piece. Honey for your part, violet for the AI's.
- **Your three best moments,** in your own words, and what each one changed.
- **One layer to make yours next time,** where the AI decided for you.
- **A card** to keep, or to share if you want to.

## Why it works this way

- **It counts decisions, not words typed.** People feel a thing is theirs when they controlled it, knew it closely and put themselves into it ([Pierce, Kostova and Dirks, 2001](https://conservancy.umn.edu/server/api/core/bitstreams/338282fe-f840-443c-85bf-a4ad03125a2b/content)). People do not feel they own AI-written text, and more control raised that feeling ([Draxler and others, 2024](https://arxiv.org/abs/2303.03283)).
- **It shows what you did, never how talented you are.** Effort is seen as worth something only when effort is the frame, not talent ([Cho and Schwarz, 2008](https://pure.ewha.ac.kr/en/publications/of-great-art-and-untalented-artists-effort-information-and-the-fl/)).
- **It only reads finished work.** The pride people feel in what they made disappears when the work is left unfinished ([Norton, Mochon and Ariely, 2011](https://www.hbs.edu/ris/Publication%20Files/11-091.pdf)).
- **Every call needs a quote.** If your AI cannot find your words that show a call was yours, it counts as the AI's.

## Add it

| Way | Best for | How |
|---|---|---|
| Connector | ChatGPT and Claude. The page is drawn inside your chat. | Add a custom connector (in ChatGPT, a custom MCP server): `https://www.korture.ai/mcp`, no sign-in. Claude Code: `claude mcp add --transport http korture-proof https://www.korture.ai/mcp`. Codex: `codex mcp add korture-proof --url https://www.korture.ai/mcp` |
| Skill | Nothing leaves your chat. Works in any AI that reads skills. | Download `korture-proof.zip` from [Releases](../../../releases) and upload it to Claude, or copy [`skills/korture-proof`](skills/korture-proof) into your AI's skills folder |
| Plugin | Claude Code: skill and connector together, in one step | `/plugin install korture-proof --marketplace korture-ai/korture-ai` |

Then say **"show my proof"** when the work is done.

## What leaves your chat

- **Your AI reads the chat.** Korture never sees the whole chat.
- **With the connector,** your AI sends the calls it found, each with a short quote of 25 words or less, to draw the page. The quotes are not stored.
- **What Korture stores:** the kind of work, the number of calls, how many were yours, the share, and how many moments were picked. In ChatGPT, also the anonymous ids ChatGPT gives every app for the user and the chat, and the language setting.
- **With the skill,** nothing leaves your chat. The page needs an AI that can run Python to draw it. Without that, you get the result as text.

All of this is in [`server/index.ts`](server/index.ts).

## What is in this folder

| Path | What it is |
|---|---|
| `skills/korture-proof/SKILL.md` | The method: what a call is, who made it, the eight layers. Any AI can follow it. |
| `skills/korture-proof/page.html` | The page that draws the result. One file, no outside service. |
| `skills/korture-proof/build.py`, `build.mjs` | Put one result into the page: `python3 build.py example/brunch-post.json proof.html` |
| `skills/korture-proof/example/` | A made-up example: a bakery's LinkedIn post. |
| `server/` | The connector behind `korture.ai/mcp` (Deno). `node server/pack.mjs` packs the page and the method into it. |
| `.mcp.json`, `.claude-plugin/`, `.codex-plugin/` | What makes this folder a plugin. |

## Run your own connector

```bash
node server/pack.mjs
deno run --allow-net --allow-env server/index.ts
```

It stores nothing unless you set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
