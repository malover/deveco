import { createHash, randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { Flock } from "@opencode-ai/core/util/flock"
import { LocalCrypto } from "@/security/local-crypto"
import { ATTRIBUTION_SOURCE, type AttributedFile, type AttributionSource } from "./line-attribution"

export const ATTRIBUTION_LEDGER_SCHEMA_VERSION = 1

export interface AttributionLedger {
  schemaVersion: typeof ATTRIBUTION_LEDGER_SCHEMA_VERSION
  projectId: string
  head: string | null
  reflogOffset: number
  files: Record<string, AttributedFile>
  processedCommits: string[]
  processedPatches: string[]
}

export function createAttributionLedger(input: {
  projectId: string
  head: string | null
  reflogOffset: number
}): AttributionLedger {
  return {
    schemaVersion: ATTRIBUTION_LEDGER_SCHEMA_VERSION,
    projectId: input.projectId,
    head: input.head,
    reflogOffset: input.reflogOffset,
    files: {},
    processedCommits: [],
    processedPatches: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isSource(value: unknown): value is AttributionSource {
  return (
    value === ATTRIBUTION_SOURCE.AI ||
    value === ATTRIBUTION_SOURCE.BASELINE ||
    value === ATTRIBUTION_SOURCE.HUMAN ||
    value === ATTRIBUTION_SOURCE.UNKNOWN
  )
}

function isAttributedFile(value: unknown): value is AttributedFile {
  return (
    isRecord(value) &&
    typeof value.content === "string" &&
    Array.isArray(value.sources) &&
    value.sources.every(isSource)
  )
}

function parseLedger(value: unknown): AttributionLedger | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== ATTRIBUTION_LEDGER_SCHEMA_VERSION ||
    typeof value.projectId !== "string" ||
    !(typeof value.head === "string" || value.head === null) ||
    typeof value.reflogOffset !== "number" ||
    !Number.isSafeInteger(value.reflogOffset) ||
    value.reflogOffset < 0 ||
    !isRecord(value.files) ||
    !Array.isArray(value.processedCommits) ||
    !value.processedCommits.every((item) => typeof item === "string") ||
    !Array.isArray(value.processedPatches) ||
    !value.processedPatches.every((item) => typeof item === "string")
  )
    return null

  const files: Record<string, AttributedFile> = {}
  for (const [file, attributed] of Object.entries(value.files)) {
    if (!isAttributedFile(attributed)) return null
    files[file] = attributed
  }
  const processedCommits = value.processedCommits.filter((item): item is string => typeof item === "string")
  const processedPatches = value.processedPatches.filter((item): item is string => typeof item === "string")
  return {
    schemaVersion: ATTRIBUTION_LEDGER_SCHEMA_VERSION,
    projectId: value.projectId,
    head: value.head,
    reflogOffset: value.reflogOffset,
    files,
    processedCommits,
    processedPatches,
  }
}

export class AttributionLedgerStorage {
  readonly filePath: string
  private readonly lockKey: string

  constructor(repositoryRoot: string, dataDir = Global.Path.data) {
    const key = createHash("sha256").update(repositoryRoot).digest("hex")
    this.filePath = path.join(dataDir, "analytics", "code-attribution", `${key}.json`)
    this.lockKey = `analytics-code-attribution:${this.filePath}`
  }

  async load(): Promise<AttributionLedger | null> {
    return Flock.withLock(this.lockKey, async () => {
      try {
        const encrypted = JSON.parse(await fs.readFile(this.filePath, "utf8"))
        if (!LocalCrypto.isEncryptedBlob(encrypted)) return null
        return parseLedger(JSON.parse(LocalCrypto.decryptForLocalStorage(encrypted)))
      } catch {
        return null
      }
    })
  }

  async save(ledger: AttributionLedger): Promise<void> {
    await Flock.withLock(this.lockKey, async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 })
      const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
      const encrypted = LocalCrypto.encryptForLocalStorage(JSON.stringify(ledger))
      try {
        await fs.writeFile(temporary, JSON.stringify(encrypted), { encoding: "utf8", mode: 0o600 })
        await fs.rename(temporary, this.filePath)
      } finally {
        await fs.unlink(temporary).catch(() => undefined)
      }
    })
  }

  async clear(): Promise<void> {
    await Flock.withLock(this.lockKey, () => fs.unlink(this.filePath).catch(() => undefined))
  }
}
