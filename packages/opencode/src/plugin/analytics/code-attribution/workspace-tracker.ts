import fs from "fs/promises"
import path from "path"
import { GitRepository } from "./git-repository"
import {
  createRepositoryCodeAttributionTracker,
  type CodeAttributionTracker,
  type CodeAttributionTrackerOptions,
} from "./tracker"
import { clearAttributionLedgers } from "./storage"

const excludedDirectories = new Set([
  ".cache",
  ".git",
  ".local",
  ".next",
  ".trash",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "library",
  "node_modules",
  "out",
  "target",
  "vendor",
  "venv",
])
const maxDiscoveryDepth = 1
const maxDiscoveryDirectories = 1024
const maxDiscoveryDuration = 200

export async function discoverWorkspaceRepositories(directory: string): Promise<GitRepository[]> {
  const repositories = new Map<string, GitRepository>()
  const workspace = path.resolve(directory)
  const ancestor = await GitRepository.discover(workspace)
  if (ancestor) return [ancestor]
  const deadline = Date.now() + maxDiscoveryDuration
  let visited = 0

  const walk = async (current: string, depth: number): Promise<void> => {
    if (visited >= maxDiscoveryDirectories || Date.now() >= deadline) return
    visited++
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
    if (entries.some((entry) => entry.name === ".git" && !entry.isSymbolicLink())) {
      const repository = await GitRepository.discover(current)
      if (repository) repositories.set(repository.root, repository)
    }

    if (depth >= maxDiscoveryDepth) return
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        excludedDirectories.has(entry.name.toLowerCase()) ||
        visited >= maxDiscoveryDirectories ||
        Date.now() >= deadline
      )
        continue
      await walk(path.join(current, entry.name), depth + 1)
    }
  }

  await walk(workspace, 0)
  return [...repositories.values()].sort((left, right) => left.root.localeCompare(right.root))
}

class WorkspaceCodeAttributionTracker implements CodeAttributionTracker {
  private readonly trackers = new Map<string, CodeAttributionTracker>()
  private readonly discoveryInterval: number
  private lastDiscovery = 0
  private serial: Promise<void> = Promise.resolve()
  private enabled = false
  private stopped = false

  constructor(private readonly options: CodeAttributionTrackerOptions) {
    this.discoveryInterval = options.discoveryInterval ?? 10000
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation, operation)
    this.serial = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async diagnostic(message: string): Promise<void> {
    try {
      await this.options.diagnostic?.(message)
    } catch {
      // Diagnostics must never affect repository tracking.
    }
  }

  private async discoverAndAttach(): Promise<void> {
    if (this.discoveryInterval > 0 && Date.now() - this.lastDiscovery < this.discoveryInterval) return
    let attached = 0
    for (const repository of await discoverWorkspaceRepositories(this.options.directory)) {
      if (this.trackers.has(repository.root)) continue
      const tracker = await createRepositoryCodeAttributionTracker({
        ...this.options,
        directory: repository.root,
      })
      this.trackers.set(repository.root, tracker)
      attached++
      if (this.enabled) await tracker.setEnabled(true)
    }
    this.lastDiscovery = Date.now()
    if (attached > 0) {
      await this.diagnostic(`Attribution repositories discovered: ${this.trackers.size}`)
    }
  }

  private async fanOut(
    operationName: string,
    operation: (tracker: CodeAttributionTracker) => Promise<void>,
  ): Promise<void> {
    const results = await Promise.allSettled([...this.trackers.values()].map(operation))
    const failures = results.filter((result) => result.status === "rejected").length
    if (failures > 0) {
      await this.diagnostic(`Attribution tracker operation failed: ${operationName}, count=${failures}`)
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.run(async () => {
      if (enabled === this.enabled) return
      if (!enabled) {
        this.enabled = false
        await this.fanOut("disable", (tracker) => tracker.setEnabled(false))
        return
      }
      if (this.stopped) return
      this.enabled = true
      await this.fanOut("enable", (tracker) => tracker.setEnabled(true))
    })
  }

  async purge(): Promise<void> {
    await this.run(async () => {
      this.enabled = false
      await this.fanOut("purge", (tracker) => tracker.purge())
      await clearAttributionLedgers(this.options.dataDir)
    })
  }

  async beforeAiTool(): Promise<void> {
    await this.run(async () => {
      if (!this.enabled) return
      await this.discoverAndAttach()
      await this.fanOut("before-ai-tool", (tracker) => tracker.beforeAiTool())
    })
  }

  async afterAiTool(): Promise<void> {
    await this.run(async () => {
      if (!this.enabled) return
      await this.fanOut("after-ai-tool", (tracker) => tracker.afterAiTool())
    })
  }

  async poll(): Promise<void> {
    await this.run(async () => {
      if (!this.enabled) return
      await this.discoverAndAttach()
      await this.fanOut("poll", (tracker) => tracker.poll())
    })
  }

  async shutdown(): Promise<void> {
    await this.run(async () => {
      if (this.stopped) return
      this.stopped = true
      this.enabled = false
      await this.fanOut("shutdown", (tracker) => tracker.shutdown())
    })
  }
}

export async function createWorkspaceCodeAttributionTracker(
  options: CodeAttributionTrackerOptions,
): Promise<CodeAttributionTracker> {
  return new WorkspaceCodeAttributionTracker(options)
}
