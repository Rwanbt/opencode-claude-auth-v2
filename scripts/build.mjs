import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const dist = new URL("../dist/", import.meta.url)

rmSync(dist, { recursive: true, force: true })
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc")], {
  stdio: "inherit",
})
mkdirSync(dist, { recursive: true })
copyFileSync(
  new URL("../src/anthropic-prompt.txt", import.meta.url),
  new URL("../dist/anthropic-prompt.txt", import.meta.url),
)
