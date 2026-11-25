<p align="center"><img src="proof/bee.png" width="72" alt="Korture bee"></p>

<h1 align="center">Korture AI</h1>

<p align="center"><b>Tools for the human, not the AI.</b><br>
Know your part in the work you do with AI. See how you work with it. Get better at it, if you want to.</p>

<p align="center"><a href="https://www.korture.ai">korture.ai</a></p>

---

## Why this exists

A script writer does not direct the film or act in it. Directors and actors change lines on set. Still, everyone knows whose story it is, and the writer is proud of it.

Work with AI is the same. You gave the idea, the facts, the taste and the calls. The AI did the typing. Somewhere along the way, people started to argue about "human or AI" and "do you really own it". Detectors guess whether a person wrote something. Forums say that if you did not type the code, it is not yours.

We think that argument misses the point. Before AI, people worked with templates, books, teams and assistants, and nobody asked them to prove each word was theirs. What matters is that the work is good, that it helps someone, and that you know what you put into it.

So these tools are for you, not for the world. They show you your own part, in your own words, so you can be clear about it and proud of it. Every other AI product measures the AI. Korture measures the human.

## What is here

| | Part | What it does | Status |
|---|---|---|---|
| Open | [`proof/`](proof/) | **Korture Proof.** After a piece of work with AI, it shows your part: the calls you made, your best moments in your own words, and the share of the calls that were yours. | Works today in ChatGPT, Claude, Claude Code and Codex |
| Open | [`skills/mode/`](skills/mode/) | **/mode.** Before a task, say how you want to work with AI: autopilot, copilot or practice. Your AI keeps to it. | Works in Claude Code |
| Open, read only | [`sense-doors/`](sense-doors/) | **How Korture Sense gets in.** The plugins and the collector Sense uses in each AI app. Read them to see exactly what Sense reads on your computer. | Needs the Sense app to run |
| Open, the idea | [`ideas/`](ideas/) | **How Sense measures.** The nine moves, the two parts of the number, and why the yardstick is outside you. | Read |
| Experiment | [`experiments/habit-map/`](experiments/habit-map/) | **Habit map.** Your AI points out one of your habits, in one line, the moment it shows up. | Being tried, invite only |
| Private | Korture Sense | The reader, the scoring, the Understand and Improve parts, and the expert lessons. | [Get Sense](https://www.korture.ai/get) |

## Start in one minute: Korture Proof

**In ChatGPT or Claude:** add a custom connector with this address, with no sign-in:

```
https://www.korture.ai/mcp
```

Then, at the end of any finished piece of work, say **"show my proof"**.

**As a skill** (Claude, or any AI that loads skill folders): add the [`proof/`](proof/) folder as a skill. Say "show my proof".

**From the command line** (Claude Code, Codex):

```bash
claude mcp add --transport http korture-proof https://www.korture.ai/mcp
```

What Proof keeps: counts only (the kind of work, how many calls, how many were yours). Your AI reads the chat. The short quotes it picks pass through the Korture server to draw your page and are not stored. Details in [`proof/README.md`](proof/README.md).

## What we keep private, and why

Korture Sense is the product we sell. It reads every message you send to your AI, on your own computer, with your own AI, and scores how you worked against a standard from outside you. The questions it asks, the rules that turn answers into a number, and the lessons it teaches are what make it work. We keep those private.

What you can always read here is how Sense gets into your AI apps and what it reads. That part should never be a secret.

## License

MIT, for everything in this repository. See [LICENSE](LICENSE).
