/**
 * IDs that merely duplicate a same-family alias: Claude's catalog ships both
 * `claude-sonnet-4-5` and its dated snapshot `claude-sonnet-4-5-20250929`,
 * which both route to the same model. The alias stays selectable; the dated
 * snapshot is hidden only when its alias is present.
 */
export function shadowedSnapshotIDs(ids: readonly string[]): string[] {
  const present = new Set(ids)
  const shadowed: string[] = []
  for (const id of ids) {
    const match = /^(.*)-(\d{8})$/.exec(id)
    if (match !== null && present.has(match[1])) shadowed.push(id)
  }
  return shadowed
}
