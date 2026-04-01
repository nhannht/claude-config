---
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
description: Write content that sounds like a real human wrote it. Systematic 3-phase workflow — context gathering, guided writing, opus review.
---

# Write Like Human - Anti-AI-Slop Writing Skill

## Trigger
`/write-like-human <task description or file path>`

## Overview

Three-phase systematic workflow:
1. **Context & Persona** — understand the project, pick a voice, gather constraints
2. **Write** — draft with enforced human-writing rules
3. **Review** — opus agent tears apart anything that still smells like AI

---

## Phase 1: Context & Persona Gathering

### Step 1.1: Read Project Context
- Read CLAUDE.md, any relevant files mentioned in the task
- If a file path is given, read the file to understand existing content and tone
- Scan nearby files in the same directory for style reference

### Step 1.2: Ask User — Persona Selection
Use AskUserQuestion to present persona options. Tailor options to the project context.

**Prompt:**
```
Who is the writer? Pick a persona or describe your own:

1. Vietnamese university student (casual "em", simple observations, no heavy critique)
2. Vietnamese university student (assertive "toi", sharp analysis, challenges assumptions)
3. Academic researcher (formal but not robotic, cites sources, measured tone)
4. Conversational explainer (like talking to a friend, uses "you" and rhetorical questions)
5. Professional/business (clean, direct, no fluff)
6. Custom — describe your own voice

Also tell me:
- Age/experience level of the writer?
- Who is the audience? (professor, classmates, general public)
- What language? (Vietnamese, English, mixed)
```

Store the response as `{persona}`.

### Step 1.3: Ask User — Ban List & Constraints
Use AskUserQuestion:

**Prompt:**
```
Any specific constraints? (skip if none, I'll use smart defaults)

- Words/phrases to NEVER use? (e.g., "delve", "moreover", "it is important to note")
- Structural rules? (e.g., "no bullet points", "prose paragraphs only", "max 3 headings")
- Tone to avoid? (e.g., "don't sound like a textbook", "no corporate speak")
- Anything else? (word count, special formatting, references to include)
```

Store as `{constraints}`. If user skips, apply the Default Ban List below.

---

## Phase 2: Writing (with Enforced Rules)

### The Writing System Prompt

When writing content, ALWAYS apply these rules internally. Do NOT mention them to the user — just follow them silently.

#### A. Default Ban List (always active unless user overrides)

**Banned words/phrases — NEVER use these:**
- delve, delve into, delving
- moreover, furthermore, additionally, consequently
- it is important to note, it is worth noting, it should be noted
- in today's world, in today's fast-paced world, in the modern era
- leverage, streamlined, optimize, synergies
- beacon, tapestry, multifaceted, paramount, realm
- resonate, navigate (metaphorical), commendable
- endeavor, commence, utilize (use "use" instead)
- pivotal, showcase, underscores, meticulous, intricate
- a testament to, serves as a reminder, bears noting
- cannot be overstated, plays a crucial role
- not only... but also (overused AI pattern)
- as we can see, as mentioned above/earlier

**Banned structural patterns:**
- Starting 3+ consecutive paragraphs with the same word
- Every paragraph being the same length (vary deliberately)
- Lists/bullet points when prose would be more natural
- Em dash overuse (max 2 per page)
- Starting with "In conclusion," "To summarize," "In summary,"
- Ending with a grand sweeping statement about the future of humanity

#### B. Enforced Human Patterns (always active)

**Sentence variation (burstiness):**
- Mix short sentences (5-10 words) with long ones (25-40 words)
- Target ratio: ~30% short, ~50% medium, ~20% long
- At least one very short sentence per 3 paragraphs (e.g., "That changed everything." or "It didn't work.")

**Contractions (match persona):**
- Casual/student personas: use contractions freely (don't, can't, it's, won't, that's)
- Academic personas: use contractions sparingly but don't eliminate them entirely
- Never write "do not" when "don't" sounds more natural for the persona

**Specificity over generality:**
- Replace vague claims with concrete examples (names, dates, numbers, places)
- "Many scholars argue..." -> "[Name] argued in [Year] that..."
- "This had a significant impact" -> "This led to [specific outcome]"

**Active voice default:**
- "Rousseau wrote Emile" not "Emile was written by Rousseau"
- Passive voice allowed only when the actor is genuinely unknown or unimportant

**Paragraph variation:**
- Vary paragraph length: some 2-3 sentences, some 5-6
- Occasional one-sentence paragraph for emphasis
- Never more than 2 paragraphs of the same length in a row

**Natural transitions (use these instead of banned ones):**
- Vietnamese: "Nhưng", "Thế nhưng", "Điều đáng nói là", "Nói cách khác", "Thực ra", "Vấn đề là", "Điểm hay là", "Có một điều thú vị:"
- English: "But here's the thing:", "The problem is", "What's interesting is", "Look,", "So basically,", "That said,", "Here's why:", "The catch?"

**Imperfection markers (use sparingly, 1-2 per page):**
- Rhetorical questions: "But does that actually work?"
- Self-correction: "Well, not exactly — it's more like..."
- Hedging that sounds human: "I think", "as far as I can tell", "from what I've read"
- Concession: "Okay, fair point, but..."

#### C. Persona-Specific Overrides

**Vietnamese student ("em" style):**
- Use "em" as first person, address teacher/reader implicitly
- Simpler vocabulary, shorter sentences on average
- Observations over analysis: "Em thấy rằng..." not "Phân tích cho thấy..."
- Gentle opinions: "Em nghĩ..." not "Rõ ràng là..."
- Allowed to be slightly repetitive (real students repeat themselves)
- Can express genuine confusion or surprise: "Điều này khiến em khá bất ngờ"

**Vietnamese student ("toi" style):**
- Use "toi" as first person, assertive and direct
- Longer analytical sentences, sharper word choice
- Challenges and counterarguments welcome
- References to comparative examples across cultures
- Occasional colloquial punch: metaphors, cultural references

**Academic researcher:**
- Hedging is okay but must be specific: "The evidence suggests X, though Y remains contested"
- Citations woven naturally into sentences, not dumped at the end
- First person ("I argue", "my reading of") is encouraged over passive
- Acknowledge complexity without hiding behind it

**Conversational:**
- Write like talking to a friend
- Start some sentences with "And" or "But"
- Use "you" to address the reader directly
- Humor and personality allowed

### Step 2.1: Write the Content

Apply persona + ban list + enforced patterns. Write the full content.

### Step 2.2: Self-Check Before Review

Before passing to the reviewer, scan your own output for:
1. Any banned words/phrases (search the entire output)
2. Consecutive paragraphs starting with the same word
3. Uniform sentence/paragraph lengths
4. Bullet points where prose was requested
5. Generic statements without specific examples

Fix any violations found.

---

## Phase 3: Opus Review

Launch a review agent with `model: opus` to evaluate the writing.

**Agent Prompt Template:**
```python
prompt = f"""## Task
You are a ruthless anti-AI-slop editor. Review the following text and flag EVERY instance that sounds like AI wrote it.

## Persona Context
{persona}

## Constraints
{constraints}

## Text to Review
{written_content}

## Review Checklist

Score each dimension 0-10 (10 = perfectly human):

1. **Vocabulary naturalness** — Any "delve", "moreover", "paramount", corporate buzzwords?
2. **Sentence variation** — Mix of short/medium/long? Or robotic uniformity?
3. **Paragraph variation** — Different lengths? Or every paragraph 4-5 sentences?
4. **Transition naturalness** — "Moreover" and "Furthermore" or actual human connectors?
5. **Specificity** — Concrete examples with names/dates/numbers? Or vague generalizations?
6. **Voice consistency** — Does it sound like the specified persona throughout?
7. **Structural naturalness** — Prose paragraphs? Or bullet-point-itis?
8. **Opening/closing** — Does it avoid "In today's world..." and "In conclusion..."?
9. **Emotional authenticity** — Does it feel like someone who cares, or a report generator?
10. **Overall "smell test"** — If you saw this on a student's paper, would you suspect AI?

## Output Format
For each dimension scoring below 8:
- Quote the problematic passage
- Explain why it sounds AI-generated
- Provide a concrete rewrite suggestion

Then provide an overall score (average of all 10) and a PASS/FAIL verdict:
- PASS: overall >= 7.5 and no dimension below 6
- FAIL: overall < 7.5 or any dimension below 6

If FAIL, list the top 3 fixes needed (in priority order) with before/after examples.
"""
```

### Step 3.1: Launch Review Agent
Launch the opus agent with the prompt above. Wait for results.

### Step 3.2: Apply Fixes if FAIL
If the review returns FAIL:
1. Apply all suggested fixes to the content
2. Do NOT re-run the review (avoid infinite loops) — trust the fixes
3. Show the user the final version with a note: "Opus review flagged X issues, all fixed."

If the review returns PASS:
1. Show the user the final version with the score

### Step 3.3: Output
- If writing to a file: use Write/Edit to save the content
- If inline: display the content directly
- Always show the opus review score at the end (e.g., "Opus human-likeness score: 8.2/10")

---

## Quick Reference: Common Persona Presets

| Preset | First Person | Tone | Sentence Length | Critique Level |
|---|---|---|---|---|
| VN student (em) | em | gentle, observational | short-medium | low |
| VN student (toi) | toi | assertive, analytical | medium-long | high |
| Academic | I/we | measured, evidence-based | medium-long | medium |
| Conversational | I/you | casual, direct | short-medium | varies |
| Professional | we/the team | clean, no fluff | medium | low |

## Notes
- This skill is about writing QUALITY, not about evading detection
- The goal: if a human read this, they wouldn't think "AI wrote this"
- Opus review is the final gate — it catches what rules alone cannot
