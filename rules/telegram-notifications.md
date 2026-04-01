Run `tg-notify "<message>"` via Bash to ping the user on Telegram. Messages MUST be dynamic and contextual — never generic.

**When to notify:**
- After completing a multi-step task or significant piece of work
- When blocked and waiting for user input
- After a long-running build/test/deploy finishes
- When you stop and are waiting for the user's next instruction

**Message format — always include what happened:**
- `tg-notify "Done: implemented email OTP auth — server + frontend, all tests pass"`
- `tg-notify "Need input: should OTP expiry be 5 or 10 minutes?"`
- `tg-notify "Tests finished: 1183 passed, 19 failed (pre-existing)"`
- `tg-notify "Waiting: OTP auth done, ready for next task"`

**Never send:**
- Generic messages like "Waiting for your input" or "Notification from Claude Code"
- Notifications for quick one-liner answers or trivial responses
