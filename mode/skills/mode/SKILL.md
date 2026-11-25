---
name: mode
description: Declare how you want to use AI for the next task. Use when the user types /mode, or /mode autopilot, /mode copilot, or /mode practice, or says they want to set their AI mode for a task.
---

# /mode: say how you want to use AI for this task

The user is declaring, before a task starts, what relationship they want with AI for it. Your job: record the choice in a local log, confirm it in one short line, then honor it for the rest of the session. The log stays on the person's computer, so they can look back at what they chose. You record and honor. You never judge.

The three modes, in the user's words:
- autopilot: do it for me.
- copilot: draft it and I decide.
- practice: coach me while I do it.

## Step 1: read the choice

The words after /mode should start with one of the three mode words, optionally followed by a few words naming the task, for example: /mode copilot pricing page copy.

If the mode word is missing, or is not one of the three, log nothing and reply with exactly this, then stop:

Pick one word for this task:
- /mode autopilot: I do it for you.
- /mode copilot: I draft, you decide.
- /mode practice: you do it, I coach.

## Step 2: log it, before anything else

Run exactly this one command. Replace MODE with the chosen word and TASK with the task words. Strip any double quotes and backslashes from TASK. Use an empty TASK if no task words were given.

```bash
mkdir -p ~/.korture && printf '{"ts":"%s","mode":"MODE","session":"%s","project":"%s","task":"TASK"}\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$CLAUDE_CODE_SESSION_ID" "$PWD" >> ~/.korture/modes.jsonl
```

One line per declaration, appended to ~/.korture/modes.jsonl. It never leaves this machine. Never read, edit, or delete earlier lines. If you cannot run commands on the person's own computer (for example in a web app), skip this step and say nothing about it. If the command fails, say so plainly and still honor the mode.

## Step 3: confirm in one short line

Reply with exactly one line, nothing more:
- autopilot: Autopilot on. I do this, you get the result.
- copilot: Copilot on. I draft, you decide.
- practice: Practice on. You do it, I coach.

If task words were given, start the task right after the line. If not, wait for the task.

## Step 4: honor the mode until it changes

The declared mode holds for this session until the user declares a new one with /mode.

- autopilot: take the task end to end. Ask only when truly blocked.
- copilot: propose before you apply. Show drafts, plans, and diffs, and let the user make the calls that matter. Small mechanical steps do not need approval.
- practice: the user does the work. Explain, point, review, and suggest the next small step. Do not produce the finished work yourself.

If the user then asks for something that conflicts with the declared mode, for example practice was declared but they say "just do it", do what they ask. Do not argue, do not warn, do not log again. What they chose and what happened is theirs to see, not yours to police.
