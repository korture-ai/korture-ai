# /mode

**Say how you want to work with AI, before you start.**

Many people keep their own rules with AI: "I always tell it to never write code for me" ([r/learnprogramming](https://www.reddit.com/r/learnprogramming/comments/1xsi0im/am_i_really_rigid_or_too_backwards_for_refusing/19sg0gznos4ao/)). Others want it all done for them. Both are fine. The point is that you choose, not the AI.

| Type | What happens |
|---|---|
| `/mode autopilot` | The AI does it for you. |
| `/mode copilot` | The AI drafts, you decide. |
| `/mode practice` | You do it, the AI coaches. |

Add a few words to name the task, for example `/mode practice pricing page copy`.

Your AI keeps to it until you change it. If you then ask for something else, it does what you ask, with no lecture.

## Where it works

In any AI app that reads skills: Claude, Claude Code, Codex, Cursor, Antigravity and others.

Where the AI runs on your computer (Claude Code, Codex, Cursor, Antigravity), each choice is also saved as one line in `~/.korture/modes.jsonl`, so you can look back at what you chose. It never leaves your computer. In web apps, the AI keeps to your choice for the chat, and nothing is saved.

## Add it

- **Claude Code:** `/plugin install korture-mode --marketplace korture-ai/korture-ai`
- **Claude:** download `korture-mode.zip` from [Releases](../../../releases) and upload it as a skill.
- **Any other AI:** copy [`skills/mode`](skills/mode) into its skills folder.
