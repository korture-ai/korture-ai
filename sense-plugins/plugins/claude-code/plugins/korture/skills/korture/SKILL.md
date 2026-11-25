---
name: korture
description: Show the person's private KORTURE.ai Sense reading when they ask for /korture, their number, their reading, what is costing them, or their episodes. It shows what already exists; it does not start a reading.
disable-model-invocation: true
---

# Your Sense reading

Read `repo` and `nodePath` from ~/.korture/config.json. If the file is absent, say: "Korture is not set up on this Mac yet. Open the Korture Sense app and finish its setup." Otherwise run the Node at `nodePath` (plain `node` only when there is no `nodePath`; the app ships its own and the person may have none) on `<repo>/bin/korture.mjs`, both paths in quotes because they can hold spaces, with `show --text --from claude-code`, and print what it returns as it is, dates, counts and all. This is the existing reading; do not start a reading to answer.

The reading opens with the number and a "Next step" line. Leave both as they are. When the person types `/korture full` or asks for everything, add `--full`: before there is enough history the reading is short, and `--full` shows all of it. When the person asks for the evidence, use `show --text --evidence`; for earlier episodes add `--history`. These carry the person's own messages; show them only in their private chat.

When the person says how much of their AI Sense may use ("a little", "some" or "more"), run the same command with `allowance <little|some|more>`. When they answer the plan question at the end of the reading, run it with `plan-of <claude|antigravity-cli> <pro|max|team|ultra|unsure>` ("Team or work" is `team`, "Not sure" is `unsure`). Print what it returns as it is.

If the reading holds messages out and asks for "mine" or "not mine", the person answers with that one word in any chat. If they answer here, say "noted" and nothing else; Sense records it.

The person may change many things, one, or none. Never ask them to pick one thing and never pick for them. If they ask which way something is going, the reading says it for every move and every part: the last ten finished episodes against the ten before.
