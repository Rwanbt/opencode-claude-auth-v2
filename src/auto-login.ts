import { spawn, type ChildProcess } from "node:child_process"
import { readAllClaudeAccounts } from "./keychain.ts"
import { log } from "./logger.ts"

/** Shown while the official Claude Code login is running. */
export const AUTO_LOGIN_INSTRUCTIONS =
  "Claude Code is not signed in on this device. A browser window will open — sign in with your Claude subscription and the import completes automatically."

/** Shown when the credential import itself fails. */
export const IMPORT_FAILURE_INSTRUCTIONS =
  "Claude Code credentials could not be imported."

/**
 * Every authorization attempt must carry a parseable absolute URL: the desktop
 * dialog runs `new URL(url)` unconditionally (and appends its own query
 * parameters) before it can render the attempt, so an empty string crashes the
 * whole connect dialog. The official CLI opens the browser itself; this link is
 * only the dialog's fallback destination.
 */
export const AUTHORIZATION_URL = "https://claude.ai/"

/** Builds the shared fields of an `auto` authorization attempt. */
export function attemptBase(instructions: string, expiresAt?: number) {
  return {
    mode: "auto" as const,
    url: AUTHORIZATION_URL,
    instructions,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  }
}

const AUTO_LOGIN_WINDOW_MS = 5 * 60_000
const POLL_INTERVAL_MS = 2_000

export interface LoginProcessHandle {
  kill(): void
  /** Exit code once the login process finished, otherwise null. */
  exitedCode(): number | null
}

/**
 * Starts the official `claude auth login` CLI so the user can authorize in the
 * browser while the integration attempt waits. Fixed command line only: no
 * caller-supplied arguments are ever interpolated.
 */
export function spawnClaudeLogin(
  spawnFn: typeof spawn = spawn,
  platform: NodeJS.Platform = process.platform,
): LoginProcessHandle | null {
  const env = { ...process.env, TERM: "dumb" }
  let exitCode: number | null = null
  try {
    const child: ChildProcess =
      platform === "win32"
        ? spawnFn(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", "claude auth login --claudeai"],
            { stdio: "ignore", windowsHide: true, env },
          )
        : spawnFn("claude", ["auth", "login", "--claudeai"], {
            stdio: "ignore",
            windowsHide: true,
            env,
          })
    child.on("error", (err) => {
      log("auto_login_spawn_error", { error: err.message })
    })
    child.on("exit", (code) => {
      exitCode = code ?? null
    })
    child.unref?.()
    return {
      kill: () => {
        try {
          child.kill()
        } catch {
          // process may already have exited
        }
      },
      exitedCode: () => exitCode,
    }
  } catch (cause) {
    log("auto_login_spawn_failed", {
      error: cause instanceof Error ? cause.message : String(cause),
    })
    return null
  }
}

export interface WaitForLoginOptions {
  hasAccounts: () => boolean
  /** Exit code of the login process, when one was started. */
  exited?: () => number | null
  timeoutMs?: number
  intervalMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Polls Claude Code's credential store until an account appears or the window
 * closes. Returns whether credentials were found.
 */
export async function waitForClaudeCodeLogin(
  options: WaitForLoginOptions,
): Promise<boolean> {
  const {
    hasAccounts,
    exited,
    timeoutMs = AUTO_LOGIN_WINDOW_MS,
    intervalMs = POLL_INTERVAL_MS,
    now = Date.now,
    sleep = defaultSleep,
  } = options
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    if (hasAccounts()) return true
    const code = exited?.()
    if (code !== null && code !== undefined) {
      // Give the CLI a moment to flush credentials before trusting its exit.
      await sleep(500)
      return hasAccounts()
    }
    await sleep(intervalMs)
  }
  return hasAccounts()
}

/** Reads the real Claude Code credential store. */
export function defaultHasAccounts(): boolean {
  try {
    return readAllClaudeAccounts().length > 0
  } catch {
    return false
  }
}

/** User-facing message for a failed authorization. */
export function describeAuthorizeFailure(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause)
  return `${IMPORT_FAILURE_INSTRUCTIONS} ${detail}`
}

/**
 * A rejected OAuth callback. The delay gives the host time to attach its
 * handler so the rejection surfaces as a failed attempt, not an unhandled
 * promise.
 */
export function failureCallback(
  cause: unknown,
  delayMs = 1_200,
): Promise<never> {
  const error = cause instanceof Error ? cause : new Error(String(cause))
  return new Promise((_, reject) => {
    setTimeout(() => reject(error), delayMs)
  })
}

/** Message used when a stored connection can no longer refresh. */
export function describeRefreshFailure(): string {
  return "Claude Code session expired or was revoked. Reconnect the Anthropic integration (Add Claude Code subscription) or run `claude auth login`."
}
