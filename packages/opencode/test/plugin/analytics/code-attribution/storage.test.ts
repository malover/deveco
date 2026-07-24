import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { AttributionLedgerStorage, createAttributionLedger } from "@/plugin/analytics/code-attribution/storage"
import { ATTRIBUTION_SOURCE } from "@/plugin/analytics/code-attribution/line-attribution"
import { tmpdir } from "../../../fixture/fixture"

test("round-trips an encrypted attribution ledger without exposing code or paths", async () => {
  await using tmp = await tmpdir()
  const repositoryRoot = path.join(tmp.path, "private-project")
  const storage = new AttributionLedgerStorage(repositoryRoot, tmp.path)
  const ledger = createAttributionLedger({
    projectId: "550e8400-e29b-41d4-a716-446655440000",
    head: "a".repeat(40),
    reflogOffset: 123,
  })
  ledger.files["src/private.ts"] = {
    content: "export const privateValue = 1\n",
    sources: [ATTRIBUTION_SOURCE.AI],
  }
  ledger.processedCommits.push("b".repeat(40))
  ledger.processedPatches.push("c".repeat(40))

  await storage.save(ledger)
  expect(await storage.load()).toEqual(ledger)

  const raw = await fs.readFile(storage.filePath, "utf8")
  expect(raw).not.toContain(repositoryRoot)
  expect(raw).not.toContain("src/private.ts")
  expect(raw).not.toContain("privateValue")
})
