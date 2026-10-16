# Install opencode-claude-auth-v2

> **This fork is retired. Do not install it for new setups.** OpenCode 2 support is available in
> [`opencode-claude-auth@latest`](https://www.npmjs.com/package/opencode-claude-auth) (3.0.0 or newer).
> Replace this fork's package entry or local checkout path with `opencode-claude-auth@latest` in your `plugins` list,
> preserving other entries. Do not load both. Restart OpenCode and, if needed, run `/connect` → **Anthropic** →
> **Import Claude Code subscription**.
>
> Follow the [current upstream installation instructions](https://github.com/griffinmartin/opencode-claude-auth/blob/main/installation.md)
> and this fork's [migration guide](README.md#migrate-to-upstream). OpenCode 1 users should pin upstream `2.2.1` instead.

## Historical instructions (superseded)

These instructions target OpenCode 2 only.

## Prerequisites

```bash
opencode2 --version
claude auth login
```

OpenCode 2 is currently installed with:

```bash
npm install -g @opencode-ai/cli@next
```

## Local Checkout

Build this repository:

```bash
pnpm install
pnpm build
```

Add its absolute entrypoint to `~/.config/opencode/opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/absolute/path/to/opencode-claude-auth-v2/opencode-claude-auth.js",
  ],
}
```

## Published Package

Use:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

Quit and restart OpenCode 2 after changing the configuration.

## Migrating from OpenCode 1

Replace the OpenCode 1 configuration:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-claude-auth@latest"],
}
```

with the OpenCode 2 configuration:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-claude-auth-v2@latest"],
}
```

The changes are both required: OpenCode 2 uses `plugins` instead of `plugin`, and the original package only supports
OpenCode 1.

The old plugin connection is not reused by the OpenCode 2 integration. Run `claude auth login` if Claude Code is not already
signed in, restart OpenCode 2, then run `/connect` and choose **Anthropic > Import Claude Code subscription**. Existing
Claude Code credentials in the macOS Keychain, `~/.claude/.credentials.json`, or `$CLAUDE_CONFIG_DIR/.credentials.json` can
be imported without another browser login.

Existing `anthropic/<model>` references continue to work. Use `/models` to select a model under **Anthropic**.

If upgrading from `0.1.0-beta.3` or earlier, replace explicit `claude-subscription/<model>` references with
`anthropic/<model>` and reselect the model in existing OpenCode 2 sessions.

## Running OpenCode 1 and 2 Side by Side

OpenCode 1 rejects the OpenCode 2 `plugins` field, so both plugin entries cannot coexist in one configuration file. Leave the
existing OpenCode 1 config at `~/.config/opencode/opencode.json` and create an isolated OpenCode 2 config root:

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

Add an alias to `~/.zshrc` or `~/.bashrc`:

```bash
alias oc2='XDG_CONFIG_HOME="$HOME/.config/opencode-v2" XDG_DATA_HOME="$HOME/.local/share/opencode-v2" XDG_STATE_HOME="$HOME/.local/state/opencode-v2" XDG_CACHE_HOME="$HOME/.cache/opencode-v2" opencode2'
```

Restart the shell. Continue using `opencode` for OpenCode 1 and use `oc2` for the isolated OpenCode 2 installation. `HOME`
remains unchanged, so Claude Code credentials in the Keychain or `~/.claude/.credentials.json` remain available to the v2
plugin.

Both versions still discover project-level `opencode.json` files. Keep version-specific `plugin` and `plugins` entries in
their separate global configurations while running the two versions side by side.

## Verify

```bash
opencode2 plugin list
```

The list should contain:

```text
heymaaz.claude-auth-v2
```

In the TUI, run `/connect`, select **Anthropic**, and choose **Import Claude Code subscription**. Then use `/models` and
choose a model under **Anthropic**.

For loader failures, inspect `~/.local/share/opencode/log/opencode.log` or run with `OPENCODE_LOG_LEVEL=DEBUG`.
