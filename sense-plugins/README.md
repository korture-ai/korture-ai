# Sense plugins

**How Korture Sense reads your work, open for you to check.**

Many people are already measured by their employer: "my leadership showed person level token usage at department meetings" ([r/ProductManagement](https://www.reddit.com/r/ProductManagement/comments/1u1b9ik/struggling_with_whether_to_stay_in_product_in_the/oqtrbli/)). Korture Sense is the opposite. It is yours. It reads on your computer, with your own AI, and it is never sold to your manager.

A tool that reads your chats must show what it reads. So this part is open.

These plugins do nothing on their own. Each one hands its work to the Korture Sense app, which is not in this repository. If Sense is not installed, they stop at once. Get Sense at [korture.ai](https://www.korture.ai).

## The plugins

| App | Folder | What it does |
|---|---|---|
| Claude Code and Cowork | [`plugins/claude-code/`](plugins/claude-code/) | When a session ends, tells Sense to read it. When one starts, shows one line. Adds `/korture` and `/improve`. |
| Codex | [`plugins/codex/`](plugins/codex/) | The same, through Codex hooks. Codex asks you to trust them once. |
| Antigravity | [`plugins/agy/`](plugins/agy/) | The same, through the Antigravity plugin. |
| Claude desktop chat | [`plugins/claude-desktop/`](plugins/claude-desktop/) | The Claude chat app keeps no record Sense can read, so your AI passes each of your messages to Sense, word for word. Saved on your computer in `~/.korture/chat/claude-live.jsonl`. |
| ChatGPT and Claude in Chrome | [`plugins/browser/`](plugins/browser/) | Saves each message you send, when you send it. Never reads the page back. Saved on your computer in `~/.korture/chat/browser-live.jsonl`. |

## What Sense reads

[`collector/collect.mjs`](collector/collect.mjs) reads the chats your AI apps already keep on your computer:

| App | Where |
|---|---|
| Claude Code and Cowork | `~/.claude/projects` |
| Codex and the ChatGPT desktop app | `~/.codex/sessions` |
| Antigravity | `~/.gemini/.../conversations` |
| Claude desktop chat, and the browser | the two files above |

It reads the words of the conversation. It does not read tool arguments, the AI's private reasoning, passwords, keys or attachments. It never changes a file it reads.

## What leaves your computer

Your own AI does the reading, on your computer, on your own plan.

Sense is in research preview. In this preview it sends:

- **Health data,** so we can see that it runs: the app version, which step ran, errors, and the reading's numbers.
- **Your messages, only if you say yes** on the screen that asks. For anyone who installs Sense from korture.ai, it is off unless they turn it on. Before a message leaves, Sense takes out emails, keys, passwords, links, file paths and phone numbers. It never sends the AI's replies or your files.

The beta and the final version will send less. We will say so here when they ship.
