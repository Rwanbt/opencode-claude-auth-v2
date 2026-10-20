import { Plugin, Provider } from "@opencode/plugin"
import type { IntegrationOAuthMethodRegistration } from "@opencode/plugin/promise/integration"
import type { SessionRequest } from "@opencode/plugin/promise/session"
import {
  attemptBase,
  AUTO_LOGIN_INSTRUCTIONS,
  defaultHasAccounts,
  describeAuthorizeFailure,
  describeRefreshFailure,
  failureCallback,
  IMPORT_FAILURE_INSTRUCTIONS,
  spawnClaudeLogin,
  waitForClaudeCodeLogin,
} from "./auto-login.ts"
import {
  getAccountBySource,
  getActiveRefreshFailureKind,
  initAccounts,
  loadPersistedAccountSource,
  setActiveAccountSource,
} from "./credentials.ts"
import { readAllClaudeAccounts } from "./keychain.ts"
import { initLogger, log } from "./logger.ts"
import {
  authorizeOAuth,
  CLAUDE_CODE_OAUTH_METADATA_KEY,
  CLAUDE_CODE_OAUTH_METADATA_VALUE,
  INTEGRATION_ID,
  labelOAuthCredential,
  METHOD_ID,
  oauthMethodDescriptor,
  realOAuthDeps,
  refreshOAuthCredential,
} from "./oauth-method.ts"
import { finishClaudeResponse, prepareClaudeRequest } from "./provider.ts"

export * from "./betas.ts"
export * from "./credentials.ts"
export * from "./oauth-method.ts"
export * from "./provider.ts"
export * from "./signing.ts"
export * from "./transforms.ts"

const PROVIDER_ID = Provider.ID.make("anthropic")
const SYSTEM_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude."

/**
 * Session request kinds that reach the model and are billed to the connected
 * subscription. OpenCode 2 dispatches one hook per kind - `context` drives the
 * agent loop, and compaction, generation and title are issued alongside it - so
 * a hook registered for only one of them leaves the rest without the identity
 * Claude Code requests are expected to carry.
 */
export const IDENTITY_REQUEST_HOOKS = [
  "context",
  "compaction",
  "generate",
  "title",
] as const

/** Prepends the Claude Code identity to an Anthropic request, once. */
export function injectClaudeIdentity(event: SessionRequest): void {
  if (event.model.providerID !== PROVIDER_ID) return
  if (event.system.some((part) => part.text.includes(SYSTEM_IDENTITY))) return
  event.system.unshift({ type: "text", text: SYSTEM_IDENTITY })
}

type NeedsAuthStatus = { status: "needs_auth"; message: string }
type ConnectionStatusWriter = (
  status: NeedsAuthStatus | undefined,
) => Promise<void>

function oauth(
  accounts: ReturnType<typeof readAllClaudeAccounts>,
  setNeedsAuth: ConnectionStatusWriter,
) {
  return {
    integrationID: INTEGRATION_ID,
    method: oauthMethodDescriptor(accounts),
    authorize: async (inputs) => {
      let current: ReturnType<typeof readAllClaudeAccounts> = []
      try {
        current = readAllClaudeAccounts()
      } catch (cause) {
        log("authorize_keychain_read_failed", { cause: String(cause) })
      }

      if (current.length > 0) {
        try {
          const value = await authorizeOAuth(inputs, current, realOAuthDeps)
          await setNeedsAuth(undefined)
          return {
            ...attemptBase(
              "Claude Code credentials imported from this device.",
            ),
            callback: Promise.resolve(value),
          }
        } catch (cause) {
          log("authorize_import_failed", { cause: String(cause) })
          return {
            ...attemptBase(IMPORT_FAILURE_INSTRUCTIONS),
            callback: failureCallback(
              new Error(describeAuthorizeFailure(cause)),
            ),
          }
        }
      }

      // No Claude Code credentials on this device yet: start the official
      // login so the user only has to authorize in the browser.
      const login = spawnClaudeLogin()
      if (!login) {
        return {
          ...attemptBase(IMPORT_FAILURE_INSTRUCTIONS),
          callback: failureCallback(
            new Error(
              describeAuthorizeFailure(
                new Error(
                  "Claude Code CLI was not found. Install it, run `claude auth login`, then reconnect.",
                ),
              ),
            ),
          ),
        }
      }

      return {
        ...attemptBase(AUTO_LOGIN_INSTRUCTIONS, Date.now() + 5 * 60_000),
        callback: (async () => {
          try {
            const signedIn = await waitForClaudeCodeLogin({
              hasAccounts: defaultHasAccounts,
              exited: () => login.exitedCode(),
            })
            if (!signedIn) {
              throw new Error(
                "Claude Code sign-in did not complete in time. Run `claude auth login`, then reconnect.",
              )
            }
            const fileAccounts = readAllClaudeAccounts()
            const value = await authorizeOAuth(
              inputs,
              fileAccounts,
              realOAuthDeps,
            )
            await setNeedsAuth(undefined)
            return value
          } catch (cause) {
            log("authorize_auto_login_failed", { cause: String(cause) })
            throw new Error(describeAuthorizeFailure(cause), { cause })
          } finally {
            login.kill()
          }
        })(),
      }
    },
    refresh: async (value) => {
      try {
        const refreshed = await refreshOAuthCredential(value, realOAuthDeps)
        await setNeedsAuth(undefined)
        return refreshed
      } catch (cause) {
        const source =
          typeof value.metadata?.source === "string"
            ? value.metadata.source
            : undefined
        const account = source ? getAccountBySource(source) : null
        if (getActiveRefreshFailureKind(account) === "terminal") {
          await setNeedsAuth({
            status: "needs_auth",
            message: describeRefreshFailure(),
          })
        }
        throw cause
      }
    },
    label: (value) => labelOAuthCredential(value),
  } satisfies IntegrationOAuthMethodRegistration
}

export const ClaudeAuthPlugin = Plugin.define({
  id: "heymaaz.claude-auth-v2",
  setup: async (ctx) => {
    initLogger()
    let accounts: ReturnType<typeof readAllClaudeAccounts> = []
    try {
      accounts = readAllClaudeAccounts()
    } catch (cause) {
      log("plugin_init_error", { cause: String(cause) })
    }
    initAccounts(accounts)
    const selected = loadPersistedAccountSource() ?? accounts[0]?.source
    if (selected) setActiveAccountSource(selected)

    const setNeedsAuth: ConnectionStatusWriter = async (status) => {
      try {
        const connection =
          await ctx.integration.connection.active(INTEGRATION_ID)
        if (!connection) return
        await ctx.integration.connection.status({
          integrationID: INTEGRATION_ID,
          connection,
          status,
        })
      } catch (cause) {
        log("connection_status_failed", { cause: String(cause) })
      }
    }

    await ctx.integration.transform((draft) => {
      draft.update(INTEGRATION_ID, (integration) => {
        integration.name = "Anthropic"
      })
      draft.method.update(oauth(accounts, setNeedsAuth))
    })

    // The Anthropic integration keeps its built-in API-key method alongside
    // the subscription method registered above, so only OAuth usage is free.
    const hasSubscriptionConnection = async (): Promise<boolean> => {
      const connection = await ctx.integration.connection.active(INTEGRATION_ID)
      if (!connection) return false
      const credential = await ctx.integration.connection.resolve(connection)
      return credential?.type === "oauth" && credential.methodID === METHOD_ID
    }

    let subscription: boolean = false
    const loadConnection = async () => {
      try {
        subscription = await hasSubscriptionConnection()
      } catch (cause) {
        subscription = false
        log("connection_lookup_failed", { cause: String(cause) })
      }
    }
    await loadConnection()

    await ctx.provider.transform((provider) => {
      const anthropic = provider.get(PROVIDER_ID)
      if (!anthropic) return
      provider.update(PROVIDER_ID, (info) => {
        info.name = "Anthropic"
        info.integrationID = INTEGRATION_ID
      })
      for (const [modelID] of anthropic.models) {
        provider.models.update(PROVIDER_ID, modelID, (model) => {
          if (subscription) model.cost = []
        })
      }
    })

    // Re-evaluate when the user switches credentials so the provider follows
    // the active connection instead of whatever was selected at startup.
    const watcher = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({
        signal: watcher.signal,
      })) {
        if (
          event.type === "credential.updated" ||
          (event.type === "credential.switched" &&
            event.data.integrationID === INTEGRATION_ID)
        ) {
          const before: boolean = subscription
          await loadConnection()
          if (subscription !== before) await ctx.provider.reload()
        }
      }
    })().catch((cause) => {
      if (!watcher.signal.aborted)
        log("connection_watch_failed", { cause: String(cause) })
    })

    for (const kind of IDENTITY_REQUEST_HOOKS)
      await ctx.session.hook(kind, (event) => {
        if (subscription) injectClaudeIdentity(event)
      })

    // OpenCode's native Anthropic provider owns prompt conversion and streaming.
    // These HTTP hooks apply only the Claude Code subscription wire contract.
    const requests = new WeakMap<Request, { source?: string }>()
    await ctx.session.hook("http.request", async (event) => {
      if (event.model.providerID !== PROVIDER_ID) return
      const connection = await ctx.integration.connection.active(INTEGRATION_ID)
      if (!connection) return
      const credential = await ctx.integration.connection.resolve(connection)
      if (
        credential?.type !== "oauth" ||
        credential.methodID !== METHOD_ID ||
        credential.metadata?.[CLAUDE_CODE_OAUTH_METADATA_KEY] !==
          CLAUDE_CODE_OAUTH_METADATA_VALUE
      )
        return
      const source =
        typeof credential.metadata.source === "string"
          ? credential.metadata.source
          : undefined
      event.request = await prepareClaudeRequest(
        event.request,
        credential.access,
        source,
      )
      requests.set(event.request, { source })
    })
    await ctx.session.hook("http.response", async (event) => {
      const context = requests.get(event.request)
      if (!context) return
      requests.delete(event.request)
      event.response = await finishClaudeResponse(
        event.request,
        event.response,
        context.source,
      )
    })

    if (accounts.length === 0) {
      log("plugin_init_no_accounts", { reason: "no credentials found" })
    } else {
      log("plugin_init", {
        accountCount: accounts.length,
        sources: accounts.map((account) => account.source),
      })
    }

    return () => {
      watcher.abort()
    }
  },
})

export default ClaudeAuthPlugin
