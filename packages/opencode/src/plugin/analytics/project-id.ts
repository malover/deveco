import crypto from "crypto"
import fs from "fs/promises"
import path from "path"
import { Flock } from "@opencode-ai/core/util/flock"
import { Global } from "@opencode-ai/core/global"

const PROJECT_ID_FILE = "project-ids.json"
const PROJECT_ID_SCHEMA_VERSION = 1

interface ProjectIdStorage {
  schemaVersion: typeof PROJECT_ID_SCHEMA_VERSION
  projects: Record<string, string>
}

function createStorage(): ProjectIdStorage {
  return {
    schemaVersion: PROJECT_ID_SCHEMA_VERSION,
    projects: {},
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

function storageFile(dataDir: string): string {
  return path.join(dataDir, "analytics", PROJECT_ID_FILE)
}

async function readStorage(file: string): Promise<ProjectIdStorage> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<ProjectIdStorage>
    if (parsed.schemaVersion !== PROJECT_ID_SCHEMA_VERSION || !parsed.projects || typeof parsed.projects !== "object") {
      return createStorage()
    }
    return {
      schemaVersion: PROJECT_ID_SCHEMA_VERSION,
      projects: Object.fromEntries(Object.entries(parsed.projects).filter((entry) => isUuid(entry[1]))),
    }
  } catch {
    return createStorage()
  }
}

async function writeStorage(file: string, storage: ProjectIdStorage): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, JSON.stringify(storage, null, 2), "utf8")
    await fs.rename(temporary, file)
  } finally {
    await fs.unlink(temporary).catch(() => undefined)
  }
}

export async function normalizeProjectDirectory(
  directory: string,
  platform: NodeJS.Platform = process.platform,
): Promise<string> {
  const resolved = path.resolve(directory)
  const canonical = await fs.realpath(resolved).catch(() => resolved)
  return platform === "win32" ? canonical.toLowerCase() : canonical
}

export async function getOrCreateProjectId(directory: string, dataDir = Global.Path.data): Promise<string> {
  const normalized = await normalizeProjectDirectory(directory)
  const directoryHash = crypto.createHash("sha256").update(normalized).digest("hex")
  const file = storageFile(dataDir)

  return Flock.withLock(`analytics-project-ids:${file}`, async () => {
    const storage = await readStorage(file)
    const existing = storage.projects[directoryHash]
    if (isUuid(existing)) return existing

    const projectId = crypto.randomUUID()
    storage.projects[directoryHash] = projectId
    await writeStorage(file, storage).catch(() => undefined)
    return projectId
  })
}
