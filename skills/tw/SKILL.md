# Taskwarrior Skill

Manage tasks via Taskwarrior CLI. Use when user asks to create, update, list, or manage tasks/bugs/features.

## Structure

| Field | Type | Usage |
|-------|------|-------|
| `project:` | Built-in | Hierarchical grouping: `admin.infra.dns`, `viecz.backend` |
| `priority:` | Built-in | `H` (high), `M` (medium), `L` (low) |
| `depends:` | Built-in | Subtasks + task references: `depends:1,3,5` |
| `due:` | Built-in | Deadlines: `due:2026-03-20`, `due:eow`, `due:eom` |
| `+tags` | Built-in | Type: `+bug`, `+feature`, `+task`, `+chore`, `+research` |
| `epic:` | UDA | Cross-project grouping: `epic:search-indexing` |
| `milestone:` | UDA | Delivery target: `milestone:v1` |

## Commands

### Create
```bash
task add "title" project:<proj> priority:<H/M/L> +<type> epic:<name> milestone:<name>
# Example:
task add "Set up Recoll indexing" project:admin.search priority:M +feature epic:search-indexing milestone:v1
```

### Workflow
```bash
task <id> start          # mark in-progress
task <id> stop           # pause
task <id> done           # complete
task <id> delete         # remove
task <id> modify key:val # update any field
```

### Dependencies (subtasks / references)
```bash
task add "Parent task"                          # → ID 1
task add "Child task" depends:1                 # blocked by 1
task add "Another child" depends:1              # also blocked by 1
task add "Final step" depends:2,3               # blocked by both
task blocked                                    # show blocked tasks
task unblocked                                  # show ready tasks
```

### Query / Filter
```bash
task list                          # all open tasks
task project:admin list            # by project
task project:admin.infra list      # by sub-project
task epic:search-indexing list     # by epic
task milestone:v1 list             # by milestone
task +bug list                     # by type tag
task +bug priority:H list          # combine filters
task blocked list                  # tasks waiting on dependencies
task overdue list                  # past due date
task due:today list                # due today
task due.before:eow list           # due before end of week
```

### Info & Reports
```bash
task <id> info                     # full detail on a task
task summary                       # project summary
task burndown.daily                # burndown chart
task history.monthly               # completion history
task projects                      # list all projects
task tags                          # list all tags
```

### Time Tracking
```bash
task <id> start                    # start timer
task <id> stop                     # stop timer
# Time is recorded automatically between start/stop
```

### Annotations (notes/comments)
```bash
task <id> annotate "Found root cause: timeout config"
task <id> denotate "old note to remove"
```

## Rules
- Every task MUST have: `project:`, `priority:`, at least one type tag (`+bug`/`+feature`/`+task`/`+chore`/`+research`)
- `epic:` and `milestone:` are optional but recommended for non-trivial work
- Use `depends:` to model subtasks — no separate parent/child system needed
- Use `task <id> annotate` for progress notes, not new tasks
- **Descriptions must be explicit and technical** — state the specific file/component, what changes, and why. Bad: "No loading indicator while NLP processes large notes". Good: "Add spinner in TimelineBlock.tsx during NLP parsing — currently blank while ChronoParser processes large files". A reader should know *where* to look and *what* to do without asking follow-up questions.
