export type HomeGraphIndexAction = "initialized" | "synced" | "rebuilt"

export async function ensureHomeGraphIndex(input: {
  root: string
  hasIndex: boolean
  check: (args: string[]) => Promise<boolean>
  require: (args: string[]) => Promise<void>
}): Promise<HomeGraphIndexAction> {
  if (!input.hasIndex) {
    await input.require(["init", "-i", input.root])
    return "initialized"
  }

  const healthy = await input.check(["status", input.root])
  const synced = healthy ? await input.check(["sync", input.root]) : false
  if (healthy && synced) return "synced"

  await input.require(["index", "--force", input.root])
  return "rebuilt"
}
