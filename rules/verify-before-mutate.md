Before any `cp`, `rm`, `mv`, or `rsync` command:
1. Echo or print the full expanded paths first — never trust variable expansion blindly
2. Verify source and destination exist and are correct
3. For destructive operations (`rm -rf`), list contents first
4. Never chain filesystem mutations in one command with unverified variables
5. Use absolute paths, not relative — relative paths shift with `cd`
