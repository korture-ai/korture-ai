# /mode

Before a task, say how you want to work with AI on it:

- `/mode autopilot`: the AI does it for you.
- `/mode copilot`: the AI drafts, you decide.
- `/mode practice`: you do it, the AI coaches.

Your AI keeps to it for the rest of the session. If you then ask for something else, it does what you ask, with no lecture. Each choice is saved, one line, to `~/.claude/korture/modes.jsonl` on your computer, so you can look back at what you chose. It never leaves your computer.

## Add it

Copy this folder to `~/.claude/skills/mode/` (Claude Code), or upload it as a skill in Claude.
