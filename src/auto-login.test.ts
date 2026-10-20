import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { spawn } from "node:child_process"
import {
  describeAuthorizeFailure,
  describeRefreshFailure,
  failureCallback,
  spawnClaudeLogin,
  waitForClaudeCodeLogin,
} from "./auto-login.ts"

describe("waitForClaudeCodeLogin", () => {
  it("resolves true as soon as credentials appear", async () => {
    let reads = 0
    const seen: number[] = []
    const found = await waitForClaudeCodeLogin({
      hasAccounts: () => {
        reads += 1
        return reads >= 3
      },
      timeoutMs: 60_000,
      intervalMs: 2_000,
      now: () => 0,
      sleep: async (ms) => {
        seen.push(ms)
      },
    })
    assert.equal(found, true)
    assert.equal(reads, 3)
    assert.deepEqual(seen, [2_000, 2_000])
  })

  it("resolves false when the window closes without credentials", async () => {
    let clock = 0
    const found = await waitForClaudeCodeLogin({
      hasAccounts: () => false,
      timeoutMs: 5_000,
      intervalMs: 2_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
    })
    assert.equal(found, false)
  })

  it("checks once more at the deadline", async () => {
    let clock = 0
    let available = false
    const found = await waitForClaudeCodeLogin({
      hasAccounts: () => available,
      timeoutMs: 4_000,
      intervalMs: 2_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
        if (clock >= 4_000) available = true
      },
    })
    assert.equal(found, true)
  })

  it("stops as soon as the login process exits without credentials", async () => {
    let clock = 0
    const sleeps: number[] = []
    const found = await waitForClaudeCodeLogin({
      hasAccounts: () => false,
      exited: () => 1,
      timeoutMs: 60_000,
      intervalMs: 2_000,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms)
        clock += ms
      },
    })
    assert.equal(found, false)
    assert.deepEqual(sleeps, [500])
  })
})

describe("spawnClaudeLogin", () => {
  function fakeSpawn(result: { throws?: boolean } = {}) {
    const calls: Array<{
      command: string
      args: readonly string[]
      options: Record<string, unknown> | undefined
    }> = []
    let killed = false
    const child = {
      on: () => child,
      unref: () => undefined,
      kill: () => {
        killed = true
      },
    }
    const fn = ((
      command: string,
      args: readonly string[],
      options?: object,
    ) => {
      if (result.throws) throw new Error("spawn failed")
      calls.push({ command, args, options: options as Record<string, unknown> })
      return child
    }) as unknown as typeof spawn
    return {
      fn,
      calls,
      wasKilled: () => killed,
    }
  }

  it("runs the official login on Windows through the fixed command line", () => {
    const fake = fakeSpawn()
    const handle = spawnClaudeLogin(fake.fn, "win32")
    assert.notEqual(handle, null)
    assert.equal(fake.calls.length, 1)
    const [call] = fake.calls
    assert.match(call.command, /cmd\.exe$/i)
    assert.deepEqual(call.args, [
      "/d",
      "/s",
      "/c",
      "claude auth login --claudeai",
    ])
    handle?.kill()
    assert.equal(fake.wasKilled(), true)
  })

  it("runs the CLI directly on other platforms", () => {
    const fake = fakeSpawn()
    spawnClaudeLogin(fake.fn, "linux")
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].command, "claude")
    assert.deepEqual(fake.calls[0].args, ["auth", "login", "--claudeai"])
  })

  it("returns null when the process cannot be started", () => {
    const fake = fakeSpawn({ throws: true })
    assert.equal(spawnClaudeLogin(fake.fn, "win32"), null)
  })
})

describe("failure reporting", () => {
  it("rejects the callback with the underlying error", async () => {
    const error = new Error("no credentials")
    await assert.rejects(
      failureCallback(error, 1),
      (rejected: unknown) => rejected === error,
    )
  })

  it("wraps the failure reason in a user-facing message", () => {
    assert.match(
      describeAuthorizeFailure(new Error("no credentials")),
      /could not be imported.*no credentials/,
    )
  })

  it("tells the user how to reconnect after a dead session", () => {
    assert.match(describeRefreshFailure(), /Claude Code subscription/)
    assert.match(describeRefreshFailure(), /claude auth login/)
  })
})
