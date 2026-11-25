---
name: korture-proof
description: Korture Proof. Use when the person asks for proof of their own part in a finished piece of work done with AI, in this chat or several chats, for example "show my proof", "Korture proof", "how much of this was mine", "what did I decide here", "my calls", or "/proof". Shows the work as layers, the share of the calls that were theirs, their best moments in their own words, and one layer to make theirs next time.
---

# Korture Proof

People finish work with AI and cannot see their own part in it. Many feel it is not really theirs. Korture Proof shows them, with their own words as proof, so they can be proud of the work and show it to others. It is about the person, never about the AI. Be accurate and warm. Never flatter, never scold.

## What you read

The whole chat, from the first message to the finished work. If the work was done over several chats, read all of them that the person names, pastes or you can reach, as one piece of work. If the person names another chat or pastes one, read that instead.

## What a call is

A call is a choice that shaped the finished work, where a reasonable person could have chosen differently: who it is for, the format, the order, a headline, a plot point, which of several options, cutting something, adding a fact.

- Count a call only if it is in the finished work. A choice later undone does not count.
- Count each call once, where it first appears.
- Not calls: tool steps, file names, fixing the AI's own mistakes the person never raised, wording polish that changes no meaning.

Who made it:
- `you`: the person said it first in their own words, picked one of several options, or overrode the AI.
- `yes`: the AI suggested it and the person said yes ("ok", "go", "agree"). Saying yes is a choice, so it counts as theirs.
- `ai`: the AI chose it and the person said nothing about it.

- If the person picks the AI's suggestion and gives their own reason, it is `you`.
- A plain go-ahead ("start", "go", "release") is one `yes` call for the plan it approves, not one per step.
- Background notices, automatic summaries and commands like "/compact" are not the person.

Every call needs a quote: the exact words from the chat that show who made it, at most 25 words. Never invent a quote. If you cannot find words that show it, it is the AI's.

## The eight layers

Put each call in one layer:

1. What you gave it (files, facts, examples, context)
2. Your ask
3. What finished looks like (the AI always assumes a finish line; say whether the person said it)
4. The AI's first draft
5. Your questions
6. Your steers
7. The AI's rework
8. The finished work

## What you pick for the person

- `moments`: the three calls of theirs that changed the work most. Their own words, and in at most 15 plain words what each one changed. Pick moments where the work would be different without them.
- `next_time`: one layer where the AI decided for them. Say what the AI decided, and one short thing to try next time. Pick the layer that would have changed the work most.

## What kind of work

Pick the one `kind` closest to the finished work, so the picture on top of the stack looks like it: `post` (social posts), `code` (software), `video` (video, script for video), `story` (fiction, long writing), `research` (research, analysis, report with numbers), `ad` (ads, marketing images), `doc` (anything else written).

## What you show

First, one block of JSON exactly in this shape, inside a code block marked `korture-part`:

```korture-part
{
  "v": 1,
  "title": "short name of the work, max 8 words",
  "kind": "post|code|video|story|research|ad|doc",
  "finished": "what was made, max 20 words",
  "calls": [
    {"what": "the choice, max 12 words", "who": "you|yes|ai", "layer": 1, "quote": "exact words", "speaker": "you|ai"}
  ],
  "moments": [
    {"quote": "their exact words", "changed": "what it changed, max 15 words"}
  ],
  "next_time": {"layer": 3, "ai_decided": "what the AI decided, max 15 words", "try": "one thing to try, max 15 words"}
}
```

How to show it, best first:
1. If the Korture connector is here (tool `show_proof`), call it with the same object instead of writing the block. It draws the page in the chat.
2. Else, if you can run code and make files, save the object as `part.json` and run `python3 build.py part.json korture-proof.html` from this skill's folder, then show or attach `korture-proof.html`.
3. Else, write the block in the chat.

Then, below it, a short version in plain words for anyone without the Korture page:

- One line: "**N%** of the calls in this were yours." N = round(100 × (you + yes) ÷ all calls).
- Their three moments, each as their quote and what it changed.
- Next time: the one layer and what to try.

## How it looks

Korture's page draws the result from the JSON block. Some parts are the same for every person, so a Korture card is known at a glance and one job can be compared with the next. The rest is yours to shape for this person.

Always the same, never change them:
- The number, written as "N% of the calls in this were yours".
- The stack of eight layers, bottom to top in the order above, with the finished work on top.
- Honey for the person's part, violet for the AI's part, a dashed outline where nobody said what finished looks like.
- The share card: the stack with the work on top, the number, one of their own quotes, "Made with AI. Decided by me." and korture.ai.

Yours to shape, if the person asks for more (a page, a chart, a different view):
- Use what you know of this person: how they like things shown, how much detail, their words.
- Build it on the same colours: honey `#d99b3d` for them, violet `#6536c7` for the AI, paper `#f0ece5`, ink `#191815`.
- Do: one clear point per view, their own words as proof, plenty of space, readable on a phone.
- Do not: gradients on text, glowing cards, emoji, stock icons for decoration, made-up numbers, words that praise them, more than one number fighting for attention.

Rules:
- Plain words. No jargon. No lists of rules.
- Describe what they did, never their character or feelings.
- Never send the whole chat anywhere. Only the calls, each with its short quote, go to show_proof to draw the page.
