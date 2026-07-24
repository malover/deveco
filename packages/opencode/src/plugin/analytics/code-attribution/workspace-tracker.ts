import fs from "fs/promises"
import path from "path"
import { GitRepository } from "./git-repository"
import {
  createRepositoryCodeAttributionTracker,
  type CodeAttributionTracker,
  type CodeAttributionTrackerOptions,
} from "./tracker"

const excludedDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "vendor",
])

export async function discoverWorkspaceRepositories(directory: string): Promise<GitRepository[]> {
  const repositories = new Map<string, GitRepository>()
  const workspace = path.resolve(directory)
  const ancestor = await GitRepository.discover(workspace)
  if (ancestor) repositories.set(ancestor.root, ancestor)

  const walk = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
    if (entries.some((entry) => entry.name === ".git" && !entry.isSymbolicLink())) {
      const repository = await GitRepository.discover(current)
      if (repository) repositories.set(repository.root, repository)
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || excludedDirectories.has(entry.name)) continue
      await walk(path.join(current, entry.name))
    }
  }

  await walk(workspace)
  return [...repositories.values()].sort((left, right) => left.root.localeCompare(right.root))
}

class WorkspaceCodeAttributionTracker implements CodeAttributionTracker {
  private readonly trackers = new Map<string, CodeAttributionTracker>()
  private readonly discoveryInterval: number
  private discoveryTimer: ReturnType<typeof setInterval> | null = null
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

  private startDiscoveryTimer(): void {
    if (this.discoveryTimer || this.discoveryInterval <= 0) return
    this.discoveryTimer = setInterval(() => void this.poll(), this.discoveryInterval)
    this.discoveryTimer.unref?.()
  }

  private stopDiscoveryTimer(): void {
    if (!this.discoveryTimer) return
    clearInterval(this.discoveryTimer)
    this.discoveryTimer = null
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.run(async () => {
      if (!enabled) {
        this.enabled = false
        this.stopDiscoveryTimer()
        await this.fanOut("disable", (tracker) => tracker.setEnabled(false))
        return
      }
      if (this.stopped) return
      this.enabled = true
      await this.discoverAndAttach()
      await this.fanOut("enable", (tracker) => tracker.setEnabled(true))
      this.startDiscoveryTimer()
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
      await this.discoverAndAttach()
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
      this.stopDiscoveryTimer()
      await this.fanOut("shutdown", (tracker) => tracker.shutdown())
    })
  }
}

export async function createWorkspaceCodeAttributionTracker(
  options: CodeAttributionTrackerOptions,
): Promise<CodeAttributionTracker> {
  return new WorkspaceCodeAttributionTracker(options)
}
