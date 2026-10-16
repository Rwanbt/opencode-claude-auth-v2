# opencode-claude-auth-v2

> **Security-hardened personal fork (Rwanbt):** See [SECURITY-HARDENING.md](SECURITY-HARDENING.md)
> for the threat model, verified fixes, residual risks and local installation.
> **Do not install `opencode-claude-auth-v2@latest`** expecting these changes:
> that npm package is not published by this security fork. Install the reviewed
> checkout locally instead, after a successful build.

> **Retired: use [`opencode-claude-auth`](https://github.com/griffinmartin/opencode-claude-auth) instead.**
> OpenCode 2 support was merged upstream in [PR #274](https://github.com/griffinmartin/opencode-claude-auth/pull/274)
> and released in **3.0.0**. The original `heymaaz` fork is retired;
> this independent fork contains security fixes but is not a maintained upstream release.

## Original upstream migration path (not the audited fork installation)

1. In your OpenCode configuration, replace `opencode-claude-auth-v2` (including pinned versions or local checkout paths)
   with `opencode-claude-auth@latest`. Preserve your other plugins and settings; **do not load both packages**.

   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "plugins": ["opencode-claude-auth@latest"],
   }
   ```

2. Restart OpenCode. If subscription authentication needs reconnecting, run `/connect`, choose **Anthropic**, then
   **Import Claude Code subscription**. Your existing Claude Code credentials can be imported from this device.
3. Keep existing `anthropic/<model>` references. Report future issues to the
   [upstream repository](https://github.com/griffinmartin/opencode-claude-auth/issues).

No separate `npm install` is needed for a package configured in OpenCode's `plugins` list.
Existing fork installations are not automatically migrated and are not being unpublished.
For OpenCode 1, use `opencode-claude-auth@2.2.1`, not upstream `@latest`.

See the [upstream installation instructions](https://github.com/griffinmartin/opencode-claude-auth/blob/main/installation.md)
for current guidance.

---

## Historical fork documentation

The instructions below are retained for reference only and are superseded by the migration guidance above.

Use an existing Claude Code Pro or Max subscription in the OpenCode 2 beta.

This is an OpenCode 2-only fork of
[`griffinmartin/opencode-claude-auth`](https://github.com/griffinmartin/opencode-claude-auth). Use Griffin's package for
OpenCode 1.

> OpenCode 2 and its plugin API are in beta. This package currently targets
> `@opencode-ai/cli@0.0.0-next-17444` and may require updates with later beta builds.

## How It Works

The plugin:

- discovers Claude Code credentials in the macOS Keychain or `~/.claude/.credentials.json`;
- adds a Claude Code OAuth method to OpenCode 2's Anthropic integration;
- routes OpenCode's built-in **Anthropic** provider through the Claude subscription transport;
- routes requests through the AI SDK Anthropic provider with Claude subscription bearer authentication;
- preserves OpenCode's own tools and permission loop;
- refreshes expiring OAuth credentials and writes rotated tokens back to their original source;
- applies the request, billing, beta-header, tool-name, and streaming transformations inherited from the original plugin.

Installing this plugin opts the Anthropic provider into Claude subscription use. Models keep their normal
`anthropic/<model>` IDs; the plugin replaces the request transport because Claude subscription OAuth requires bearer
authentication and additional request transformations.

## Requirements

- Node.js 22 or newer
- `@opencode-ai/cli@next`
- Claude Code installed and authenticated with `claude auth login`
- A Claude Pro or Max subscription

## Install

Add the published package to your OpenCode 2 configuration:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

Restart OpenCode 2 after changing plugin configuration.

For local development, build the checkout:

```bash
pnpm install
pnpm build
```

Then load its absolute entrypoint instead:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/absolute/path/to/opencode-claude-auth-v2/opencode-claude-auth.js",
  ],
}
```

## Migrating from OpenCode 1

OpenCode 1 uses the singular `plugin` field and the original package:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-claude-auth@latest"],
}
```

When upgrading to OpenCode 2, replace it with the plural `plugins` field and this v2 package:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

The OpenCode 1 plugin and its saved connection are not used by the OpenCode 2 integration. Ensure Claude Code is signed in
with `claude auth login`, restart OpenCode 2, then run `/connect` and choose **Anthropic > Import Claude Code
subscription**. If Claude Code is already signed in on the device, the existing Keychain or credentials-file entry can be
imported without another browser login.

Existing `anthropic/<model>` references continue to work. Use `/models` to select a model under **Anthropic**.

If you used `0.1.0-beta.3` or earlier, replace explicit `claude-subscription/<model>` references with
`anthropic/<model>` and reselect the model in existing OpenCode 2 sessions.

## Running OpenCode 1 and 2 Side by Side

Do not put both `plugin` and `plugins` in the same configuration. OpenCode 1 rejects the OpenCode 2 `plugins` field.

Keep the existing OpenCode 1 configuration at `~/.config/opencode/opencode.json`. Create a separate OpenCode 2 config root:

```bash
mkdir -p "$HOME/.config/opencode-v2/opencode"
```

Create `~/.config/opencode-v2/opencode/opencode.json` with:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

Add this alias to `~/.zshrc` or `~/.bashrc`:

```bash
alias oc2='XDG_CONFIG_HOME="$HOME/.config/opencode-v2" XDG_DATA_HOME="$HOME/.local/share/opencode-v2" XDG_STATE_HOME="$HOME/.local/state/opencode-v2" XDG_CACHE_HOME="$HOME/.cache/opencode-v2" opencode2'
```

Restart the shell, then use `opencode` for OpenCode 1 and `oc2` for OpenCode 2. The alias isolates configuration, sessions,
state, and plugin caches while leaving `HOME` unchanged, so the v2 plugin can still import Claude Code credentials from the
Keychain or `~/.claude/.credentials.json`.

Project-level `opencode.json` files are still discovered by both versions. Keep version-specific `plugin` or `plugins`
entries in the separate global configurations when using both versions side by side.

## Use

Start OpenCode 2 and select a model from the **Anthropic** provider:

```bash
opencode2
```

Run `/connect` once and choose **Anthropic > Import Claude Code subscription**. You can repeat that flow to
replace the stored connection or switch Claude Code accounts.

## Why Not `ai-sdk-provider-claude-code`?

That community provider runs the Claude Agent SDK as its own agent harness. Its AI SDK v6 implementation does not support
application-provided custom tools. OpenCode needs model tool calls returned to its own permissioned tool loop, so this plugin
uses OpenCode 2's native Anthropic provider. Its HTTP hooks adjust requests and responses for Claude Code subscription billing.

## Credential Sources

1. macOS Keychain entries named `Claude Code-credentials*`
2. `~/.claude/.credentials.json`, or `$CLAUDE_CONFIG_DIR/.credentials.json` when configured

Multiple macOS accounts appear as choices in the OpenCode 2 connection flow. The selected source is persisted locally.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

See [RELEASING.md](./RELEASING.md) for the beta release and npm publishing process.

Diagnostic logging can be enabled with `CLAUDE_AUTH_DEBUG=1` or set to a file path:

```bash
CLAUDE_AUTH_DEBUG=/tmp/claude-auth-debug.log opencode2
```

## Attribution

This repository preserves the history and MIT-licensed implementation of
[`griffinmartin/opencode-claude-auth`](https://github.com/griffinmartin/opencode-claude-auth). The OpenCode 2 integration
architecture follows the public provider-plugin patterns in
[`anomalyco/opencode`](https://github.com/anomalyco/opencode), particularly its GitHub Copilot provider.

## Disclaimer

OpenCode's documentation states that Anthropic does not permit Claude Pro or Max subscription use through third-party
plugins. This project is unofficial, may stop working when Anthropic changes its OAuth infrastructure, and should be used
at your own discretion.

## License

MIT
