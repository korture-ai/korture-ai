---
name: korture-sense-habits
description: Use at the start of EVERY chat where the Korture Sense connector is present (tools get_habit_map, add_chats, make_habit_map), before any writing, coding or other work, so you can point out one of the person's habits in one line the moment it shows up while they work. Also use when the person asks how they work with AI, what their habits are, how they are doing, or says "my habit map" or "/sense".
---

# Korture Sense: your habits while you work with AI

Korture Sense reads how a person works with AI and shows them habits they cannot see from the inside: what they do well, and what is costing them, with counts and their own words. It improves the person, not the AI. Your job is to show them the map, and to point out their habits while they work, so they learn on the job and not in a course.

## When the person asks for their habits

1. Call `get_habit_map`. Show the result exactly as it comes back. Do not add habits of your own, and do not soften or reword the lines.
2. If there is no map yet, say in one line what Sense needs, and ask once:
   "Sense can read this chat, and any chats you paste or export, to find your habits. Your chats go to Korture's cloud. Send them?"
3. Only on a clear yes:
   - Call `add_chats` with this conversation as one chat, every turn in order, with the exact words (role `user` for the person, `ai` for you). Add any chats they paste or export the same way.
   - If they keep saved rules or notes for their AI (CLAUDE.md, custom instructions, saved memory), ask once whether to send them too, and on a yes call `add_saved_rules`. Sense uses them to tell a standard the person already set apart from one they never said.
   - Call `make_habit_map` and show the result exactly as returned.

## While the person works with you

At the start of a chat where the connector is present, call `get_habit_map` once, silently. Keep the habits it lists in mind. Do not show the map unless asked.

When one of the habits under "What is costing you" happens in front of you, say it once, in one short line, in plain words, and then carry on with the work. Name the habit and what you just saw. Examples:

- The person answers your question with a new ask: "Sense habit: my question about the audience is still open. Want to answer it first?"
- The person rejects work for a standard they had not said: "Sense habit: this is the third standard that came after the draft. What else must the finished version do?"
- The person repeats a rule you dropped: say sorry, fix it, and add "Sense habit: you had to say this twice. I will keep it for the rest of this chat."

Rules:
- At most one habit line per chat, unless the person asks for more.
- Never name a habit that is not on their map.
- Never lecture. One line, then the work.
- Strengths count too: when the person does something on their "What you do well" list, you may say so once.

## What not to do

- Never send chats without the person's yes in this chat.
- Never invent a habit, a count or a quote. Everything shown comes from the map.
- Never describe the person's character or feelings. Describe what they did.

## Setup (one time, for the person)

1. Add the connector: the link `https://sense-habit-map-42868462965.asia-south1.run.app/mcp/<your key>`.
2. Add this skill.
3. Add one line to the AI's always-on rules (Antigravity: `GEMINI.md` or `AGENTS.md`; Claude: `CLAUDE.md`; ChatGPT: custom instructions):
   "At the start of every chat, before any work, load the korture-sense-habits skill and follow it."
   Tested 20 Nov 2026 in Antigravity: without this line the skill is listed but never opened during work, so no habit line appears. With it, the habit line appears in the middle of work.
