# How Korture Sense gets into your AI apps

Korture Sense reads how you work with AI, on your own computer. These are the parts that touch your AI apps. They are here so you can read exactly what Sense reads and where it writes. They do nothing on their own: each one hands its work to the Sense app, which is not in this repository. If Sense is not installed, they stop at once and cost nothing.

[Get Sense](https://www.korture.ai/get)

## The doors

| App | Folder | What it does |
|---|---|---|
| Claude Code and Cowork | `plugins/claude-code/` | At the end of a session, tells Sense to read it. At the start, shows one line. Adds `/korture` and `/improve`. |
| Codex | `plugins/codex/` | The same, through Codex hooks. Codex asks you to trust the hooks once. |
| Antigravity | `plugins/agy/` | The same, through the Antigravity plugin. |
| Claude desktop chat | `plugins/claude-desktop/` | Claude's chat app keeps no readable record, so your AI passes each of your messages to Sense, word for word. Saved to `~/.korture/chat/claude-live.jsonl`. |
| ChatGPT and Claude in Chrome | `plugins/browser/` | Catches each message you send, at the moment you send it. Never reads the page back. Saved to `~/.korture/chat/browser-live.jsonl`. |

## What the collector reads

[`collector/collect.mjs`](collector/collect.mjs) reads the chats your AI apps already keep on your computer:

- Claude Code and Cowork: `~/.claude/projects`
- Codex and the ChatGPT desktop app: `~/.codex/sessions`
- Antigravity and Gemini: `~/.gemini/.../conversations`
- The two files above, from the desktop chat and the browser

It reads the words of the conversation. It does not read tool arguments, the AI's private reasoning, passwords, keys or attachments. It never changes a file it reads.

## What leaves your computer

Your own AI does the reading, on your computer, with your own plan.

Korture Sense is in research preview. In this preview, Sense sends:

- **Health data,** so we can see that it runs: the app version, which step ran, errors, and the reading's numbers.
- **Your messages, only if you say yes** on the screen that asks. For anyone who installs Sense from korture.ai, it is off unless they turn it on. Before a message leaves, Sense takes out emails, keys, passwords, links, file paths and phone numbers. It never sends the AI's replies or your files.

The beta and the final product will send less. We will say so here when they ship.
