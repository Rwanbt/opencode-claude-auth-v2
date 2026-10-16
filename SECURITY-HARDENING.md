# Personal-use security hardening

This is an independently maintained, security-hardened fork of a **retired** OpenCode 2 OAuth plugin. It is not endorsed by Anthropic. Its main purpose is to prevent Claude subscription tokens from reaching a custom HTTP provider endpoint or following redirects. It is **not** a sandbox: any plugin loaded by OpenCode runs with access to local files and processes.

## Changes and threat model

- Subscription requests are restricted to exactly `https://api.anthropic.com/v1/messages` (with optional query parameters), without userinfo, alternate ports, or subdomains. HTTPS and exact pathname are required. Nonmatching endpoints fail before credential lookup or token injection.
- Both first requests and retried HTTP requests explicitly reject redirects. OAuth refresh calls reject redirects too, preventing 307/308 from forwarding the refresh token in a POST body.
- Debug logging recursively redacts common secret keys and sanitizes Bearer/JWT/API-key strings. Debug remains off by default. Avoid sharing raw logs: arbitrary values from external errors may still contain unknown secret formats or private identifiers.
- Runtime OpenCode dependencies are fixed to the version used by the checked-in lockfile. The Windows-compatible build does not invoke shell `rm`/`cp` commands.
- Fork release publishing is disabled. No fork release silently overwrites the upstream npm package.

## Safer local installation (Windows / OpenCode 2)

1. Clone **this fork** at a reviewed commit (not an unverified floating branch or npm `@latest` package).
2. Verify the checkout and run `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm run build`, and `pnpm test`. Dependency installation and builds still execute dependencies trusted by your package manager; audit those separately for high-assurance environments.
3. Remove `opencode-claude-auth-v2@latest` and other overlapping Anthropic authentication plugins from your OpenCode `plugins` configuration.
4. In your global OpenCode 2 `opencode.json`, add the absolute **local** entrypoint path, for example:

   ```json
   {
     "plugins": [
       "D:/App/security-audits/opencode-claude-auth-v2/opencode-claude-auth.js"
     ]
   }
   ```

   Adapt the drive and path to your clone. This ensures the executed JavaScript comes from the locally built checkout, not the original upstream npm package.

5. Keep `CLAUDE_AUTH_DEBUG` unset and check the filesystem permissions of Claude Code and OpenCode credential files, especially on Windows, where POSIX file `mode: 0o600` does not replace NTFS ACL review.
6. Use only trusted project configurations and OpenCode plugins. Do not relax the Anthropic host allowlist to make a reverse proxy work with Claude subscription OAuth credentials.

## Remaining limitations

- The plugin must handle Claude OAuth access and refresh tokens to function. OpenCode's connection store also persists credentials. These privileged code paths can be compromised by future plugin updates or a compromised workstation.
- A verified Git commit is not proof that a published npm tarball contains the same code. The original npm package is **not** the binary/artifact of this fork.
- This review did not include a production traffic interception test, third-party dependency source audits, or validation against an actual paid Claude account. Do not assume zero risk.
- Anthropic's subscription terms and permitted usage can change independently of this fork.
- `pnpm audit --prod` still reports `GHSA-ch52-4w7c-c8xp` (high) through `@opencode/plugin > @opencode/util > @npmcli/arborist > npm-registry-fetch > make-fetch-happen > http-cache-semantics`. The audit reports no patched version. The vulnerable caching path has not been shown reachable from ordinary Claude requests, but that is **not** a guarantee. The upgraded OpenCode 2.0.31 dependency resolves the earlier OpenTelemetry advisory.
