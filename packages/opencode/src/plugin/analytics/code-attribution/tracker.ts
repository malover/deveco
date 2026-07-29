import type { AiCodeAttributionEvent } from "../types"
import { GitRepository, type GitCommitChange, type GitReflogEntry } from "./git-repository"
import {
  ATTRIBUTION_SOURCE,
  attributeContent,
  countAddedLines,
  createAttributedFile,
  type AttributionSource,
} from "./line-attribution"
import { AttributionLedgerStorage, createAttributionLedger, type AttributionLedger } from "./storage"

const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
const maxDedupeEntries = 512

export interface CodeAttributionTracker {
  setEnabled(enabled: boolean): Promise<void>
  purge(): Promise<void>
  beforeAiTool(): Promise<void>
  afterAiTool(): Promise<void>
  poll(): Promise<void>
  shutdown(): Promise<void>
}

export interface CodeAttributionTrackerOptions {
  directory: string
  projectId: string
  dataDir?: string
  pollInterval?: number
  discoveryInterval?: number
  diagnostic?(message: string): void | Promise<void>
  submit(event: AiCodeAttributionEvent): Promise<boolean>
}

class NoopCodeAttributionTracker implements CodeAttributionTracker {
  async setEnabled(): Promise<void> {}
  async purge(): Promise<void> {}
  async beforeAiTool(): Promise<void> {}
  async afterAiTool(): Promise<void> {}
  async poll(): Promise<void> {}
  async shutdown(): Promise<void> {}
}

function isCommitEntry(entry: GitReflogEntry): boolean {
  return /^(commit(?: \([^)]*\))?|merge|cherry-pick|rebase \((?:pick|reword|edit|squash|fixup)\))(?::|$)/.test(
    entry.message,
  )
}

function isAmendEntry(entry: GitReflogEntry): boolean {
  return entry.message.startsWith("commit (amend)")
}

function appendBounded(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value)
  if (list.length > maxDedupeEntries) list.splice(0, list.length - maxDedupeEntries)
}

function addTotals(
  target: Omit<AiCodeAttributionEvent, "projectId">,
  source: Omit<AiCodeAttributionEvent, "projectId">,
): void {
  target.aiGeneratedLines += source.aiGeneratedLines
  target.humanGeneratedLines += source.humanGeneratedLines
  target.unknownGeneratedLines += source.unknownGeneratedLines
  target.totalGeneratedLines += source.totalGeneratedLines
}

class LocalCodeAttributionTracker implements CodeAttributionTracker {
  private ledger: AttributionLedger | null = null
  private enabled = false
  private stopped = false
  private timer: ReturnType<typeof setInterval> | null = null
  private serial: Promise<void> = Promise.resolve()
  private activeAiTools = 0
  private readonly storage: AttributionLedgerStorage
  private readonly pollInterval: number

  constructor(
    private readonly repository: GitRepository,
    private readonly options: CodeAttributionTrackerOptions,
  ) {
    this.storage = new AttributionLedgerStorage(repository.root, options.dataDir)
    this.pollInterval = options.pollInterval ?? 2000
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation, operation)
    this.serial = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.run(async () => {
      if (!enabled) {
        this.stopTimer()
        this.enabled = false
        this.activeAiTools = 0
        this.ledger = null
        return
      }
      if (this.enabled || this.stopped) return

      const persisted = await this.storage.load()
      if (persisted?.projectId === this.options.projectId) {
        this.ledger = persisted
        this.enabled = true
        await this.catchUp(ATTRIBUTION_SOURCE.UNKNOWN)
        await this.reconcileWorktree(ATTRIBUTION_SOURCE.UNKNOWN)
      } else {
        this.ledger = createAttributionLedger({
          projectId: this.options.projectId,
          head: await this.repository.head(),
          reflogOffset: await this.repository.reflogSize(),
        })
        await this.snapshotCurrentWorktree(ATTRIBUTION_SOURCE.BASELINE)
        await this.save()
        this.enabled = true
      }
      this.startTimer()
    })
  }

  async purge(): Promise<void> {
    await this.run(async () => {
      this.stopTimer()
      this.enabled = false
      this.activeAiTools = 0
      this.ledger = null
      await this.storage.clear()
    })
  }

  async beforeAiTool(): Promise<void> {
    await this.run(async () => {
      if (!this.enabled) return
      if (this.activeAiTools === 0) {
        await this.catchUp(ATTRIBUTION_SOURCE.HUMAN)
        await this.reconcileWorktree(ATTRIBUTION_SOURCE.HUMAN)
      }
      this.activeAiTools++
    })
  }

  async afterAiTool(): Promise<void> {
    await this.run(async () => {
      if (!this.enabled) return
      try {
        await this.catchUp(ATTRIBUTION_SOURCE.AI)
        await this.reconcileWorktree(ATTRIBUTION_SOURCE.AI)
      } finally {
        this.activeAiTools = Math.max(0, this.activeAiTools - 1)
      }
    })
  }

  async poll(): Promise<void> {
    await this.run(async () => {
      if (!this.enabled) return
      if (this.activeAiTools > 0) return
      await this.catchUp(ATTRIBUTION_SOURCE.HUMAN)
    })
  }

  async shutdown(): Promise<void> {
    await this.run(async () => {
      if (this.stopped) return
      this.stopped = true
      this.stopTimer()
      if (!this.enabled) return
      const source = this.activeAiTools > 0 ? ATTRIBUTION_SOURCE.AI : ATTRIBUTION_SOURCE.HUMAN
      await this.catchUp(source)
      await this.reconcileWorktree(source)
      this.activeAiTools = 0
      this.enabled = false
    })
  }

  private startTimer(): void {
    if (this.timer || this.pollInterval <= 0) return
    this.timer = setInterval(
      () => void this.poll().catch(() => this.diagnostic("Attribution tracker operation failed: poll")),
      this.pollInterval,
    )
    this.timer.unref?.()
  }

  private stopTimer(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private async save(): Promise<void> {
    if (this.ledger) await this.storage.save(this.ledger)
  }

  private async diagnostic(message: string): Promise<void> {
    try {
      await this.options.diagnostic?.(message)
    } catch {
      // Diagnostics must never affect repository tracking.
    }
  }

  private async snapshotCurrentWorktree(source: AttributionSource): Promise<void> {
    const ledger = this.ledger
    if (!ledger) return
    const files: AttributionLedger["files"] = {}
    for (const file of await this.repository.dirtyFiles()) {
      files[file.path] = createAttributedFile(file.content, source)
    }
    ledger.files = files
  }

  private async reconcileWorktree(source: AttributionSource): Promise<void> {
    const ledger = this.ledger
    if (!ledger) return
    const files: AttributionLedger["files"] = {}
    for (const file of await this.repository.dirtyFiles()) {
      const previous =
        ledger.files[file.path] ??
        createAttributedFile(
          ledger.head ? await this.repository.readBlob(ledger.head, file.path) : "",
          ATTRIBUTION_SOURCE.UNKNOWN,
        )
      files[file.path] = attributeContent(previous, file.content, source)
    }
    ledger.files = files
    await this.save()
  }

  private async resetForHistoryTransition(head: string, source: AttributionSource): Promise<void> {
    const ledger = this.ledger
    if (!ledger) return
    await this.reconcileWorktree(source)
    ledger.head = head
  }

  private async catchUp(fallback: AttributionSource): Promise<void> {
    const ledger = this.ledger
    if (!ledger) return
    const size = await this.repository.reflogSize()
    if (size === ledger.reflogOffset) return
    if (size < ledger.reflogOffset) {
      ledger.reflogOffset = size
      await this.reconcileWorktree(ATTRIBUTION_SOURCE.UNKNOWN)
      ledger.head = await this.repository.head()
      await this.save()
      return
    }

    const result = await this.repository.readReflog(ledger.reflogOffset)
    let completed = true
    for (const entry of result.entries) {
      if (isCommitEntry(entry)) {
        completed = await this.processCommit(entry, fallback)
        if (!completed) break
        continue
      }
      if (entry.oldHead !== entry.newHead) {
        await this.resetForHistoryTransition(entry.newHead, ATTRIBUTION_SOURCE.UNKNOWN)
      }
    }
    if (completed) ledger.reflogOffset = result.nextOffset
    await this.save()
  }

  private async processCommit(entry: GitReflogEntry, fallback: AttributionSource): Promise<boolean> {
    const ledger = this.ledger
    if (!ledger) return true
    if (ledger.processedCommits.includes(entry.newHead)) {
      ledger.head = entry.newHead
      await this.refreshFilesAfterCommit(fallback)
      return true
    }

    const parent = (await this.repository.commitParent(entry.newHead)) ?? emptyTree
    const parentChanges = await this.repository.commitChanges(parent, entry.newHead)
    const patch = await this.repository.patchId(parent, entry.newHead, parentChanges)
    if (ledger.processedPatches.includes(patch)) {
      appendBounded(ledger.processedCommits, entry.newHead)
      ledger.head = entry.newHead
      await this.refreshFilesAfterCommit(fallback)
      return true
    }

    const compareBase = isAmendEntry(entry) && ledger.processedCommits.includes(entry.oldHead) ? entry.oldHead : parent
    const totals = {
      aiGeneratedLines: 0,
      humanGeneratedLines: 0,
      unknownGeneratedLines: 0,
      totalGeneratedLines: 0,
    }
    const changes =
      compareBase === parent ? parentChanges : await this.repository.commitChanges(compareBase, entry.newHead)
    for (const change of changes) {
      addTotals(totals, await this.countChange(compareBase, entry.newHead, change, fallback))
    }

    if (totals.totalGeneratedLines > 0) {
      const accepted = await this.options.submit({ projectId: this.options.projectId, ...totals })
      await this.diagnostic(
        `Attribution commit: ai=${totals.aiGeneratedLines}, human=${totals.humanGeneratedLines}, unknown=${totals.unknownGeneratedLines}, total=${totals.totalGeneratedLines}, queued=${accepted}`,
      )
      if (!accepted) return false
    }

    appendBounded(ledger.processedCommits, entry.newHead)
    appendBounded(ledger.processedPatches, patch)
    ledger.head = entry.newHead
    await this.refreshFilesAfterCommit(fallback)
    return true
  }

  private async countChange(
    base: string,
    commit: string,
    change: GitCommitChange,
    fallback: AttributionSource,
  ): Promise<Omit<AiCodeAttributionEvent, "projectId">> {
    const ledger = this.ledger
    const basePath = change.oldPath ?? change.path
    const baseContent = await this.repository.readBlob(base, basePath)
    const committedContent = change.status === "deleted" ? "" : await this.repository.readBlob(commit, change.path)
    const previous =
      ledger?.files[change.path] ??
      (change.oldPath ? ledger?.files[change.oldPath] : undefined) ??
      createAttributedFile(baseContent, ATTRIBUTION_SOURCE.UNKNOWN)
    const committed = attributeContent(previous, committedContent, fallback)
    return countAddedLines(baseContent, committed)
  }

  private async refreshFilesAfterCommit(fallback: AttributionSource): Promise<void> {
    const ledger = this.ledger
    if (!ledger) return
    const files: AttributionLedger["files"] = {}
    for (const file of await this.repository.dirtyFiles()) {
      const previous =
        ledger.files[file.path] ??
        createAttributedFile(
          ledger.head ? await this.repository.readBlob(ledger.head, file.path) : "",
          ATTRIBUTION_SOURCE.UNKNOWN,
        )
      files[file.path] = attributeContent(previous, file.content, fallback)
    }
    ledger.files = files
  }
}

export async function createRepositoryCodeAttributionTracker(
  options: CodeAttributionTrackerOptions,
): Promise<CodeAttributionTracker> {
  const repository = await GitRepository.discover(options.directory)
  if (!repository) return new NoopCodeAttributionTracker()
  return new LocalCodeAttributionTracker(repository, options)
}
