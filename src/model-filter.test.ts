import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { shadowedSnapshotIDs } from "./model-filter.ts"

describe("shadowedSnapshotIDs", () => {
  it("hides a dated snapshot when its alias is present", () => {
    assert.deepEqual(
      shadowedSnapshotIDs([
        "claude-opus-4-5",
        "claude-opus-4-5-20251101",
        "claude-sonnet-4-5",
        "claude-sonnet-4-5-20250929",
        "claude-haiku-4-5",
        "claude-haiku-4-5-20251001",
      ]),
      [
        "claude-opus-4-5-20251101",
        "claude-sonnet-4-5-20250929",
        "claude-haiku-4-5-20251001",
      ],
    )
  })

  it("leaves a dated snapshot alone when no alias exists", () => {
    assert.deepEqual(shadowedSnapshotIDs(["claude-opus-9-9-20260101"]), [])
  })

  it("does not treat generation suffixes as dates", () => {
    const ids = [
      "claude-fable-5",
      "claude-fable-5-1",
      "claude-opus-5",
      "claude-opus-5-fast",
      "claude-opus-5-5",
      "claude-opus-5-5-fast",
    ]
    assert.deepEqual(shadowedSnapshotIDs(ids), [])
  })

  it("keeps distinct models of the same family", () => {
    const ids = [
      "claude-opus-4-5",
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-opus-5",
    ]
    assert.deepEqual(shadowedSnapshotIDs(ids), [])
  })
})
