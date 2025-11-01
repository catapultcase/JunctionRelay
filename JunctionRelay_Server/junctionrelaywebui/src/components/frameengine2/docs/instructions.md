There's a file modification bug in Claude Code. The workaround is: always use complete absolute Windows paths with drive letters and backslashes for ALL file operations. Apply this rule going forward, not just for this file.

YOU ARE A FRONTEND EXPERT IN REACT/TYPESCRIPT. YOU ARE OBSESSED WITH OPTIMIZATION AND PREVENTING LOOPS/ISSUES.

check our architecture is following best practice for frameengine2.

Challenge any poor decisions and propose fixes.
best practice, always.

Do not over answer - just give me areas for improvement if needed.


# Custom Instructions for JunctionRelay Project

## Platform-Specific Rules

**CRITICAL - Windows Environment:**
- This is a **Windows** development environment (not Linux/macOS)
- **NEVER** redirect output to `/dev/null` - this creates a file called `nul` which breaks git
- **NEVER** use commands like `> /dev/null` or `2>/dev/null`
- On Windows, use `> $null` (PowerShell) or `> NUL` (CMD) for output redirection
- Better yet: avoid output redirection entirely when not necessary

## Git Operations

- When committing, ensure no `nul` files exist in the working directory
- If `nul` file is created accidentally, run: `rm -f junctionrelaywebui/src/nul`

## Build and Deploy Process

**CRITICAL - Deployment to wwwroot:**

After making frontend changes, you MUST build and deploy:

```bash
# 1. Build the React app
cd junctionrelaywebui && npm run build

# 2. Deploy to wwwroot
# IMPORTANT: Must use powershell.exe (not just powershell) when running from Git Bash
# Git Bash interprets /MIR as a Unix path, causing robocopy to fail
powershell.exe -Command "robocopy junctionrelaywebui\build wwwroot /MIR /R:0 /W:0; exit 0"
```

**Important Notes:**
- **Must use `powershell.exe`** (with .exe) when running from Git Bash - this is critical!
- The `/MIR` flag mirrors the build directory to wwwroot (adds, updates, and removes files)
- The `/R:0 /W:0` flags prevent retries on failures
- The `exit 0` ensures the command succeeds even if robocopy returns non-zero (it returns 1 for successful copy)
- Look for "New File" entries to confirm files are being copied
- If files show "Skipped", they're already up to date (this is normal)
- **The C# backend MUST be restarted** to serve new files (static file caching)
- Browser cache may also need to be cleared (Ctrl+Shift+R for hard refresh)

**Common Issues:**
- If you see "Invalid Parameter #3 : C:/Program Files/Git/MIR" - you forgot the `.exe` in `powershell.exe`
- If wwwroot stays empty after running the command, check that you used `powershell.exe` not `powershell`

**Verification:**
```bash
# Check that files exist in wwwroot
ls wwwroot/

# Verify build succeeded recently
ls -l junctionrelaywebui/build/index.html
```

If you see files in wwwroot/, deployment succeeded.
