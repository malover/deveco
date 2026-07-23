export interface TuiUsageRecord {
  statDate: string
  isStartup: boolean
}

interface DateWindow {
  statDate: string
  end: number
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const DEFAULT_RETRY_DELAY_MS = 60 * 1000

export function shanghaiDateWindow(timestamp: number): DateWindow {
  const shifted = new Date(timestamp + SHANGHAI_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = shifted.getUTCMonth()
  const day = shifted.getUTCDate()
  return {
    statDate: `${year.toString().padStart(4, "0")}-${(month + 1).toString().padStart(2, "0")}-${day
      .toString()
      .padStart(2, "0")}`,
    end: Date.UTC(year, month, day + 1) - SHANGHAI_OFFSET_MS,
  }
}

export class TuiUsageTracker {
  private readonly recordedDates = new Set<string>()
  private readonly pendingDates = new Map<string, Promise<boolean>>()
  private readonly retryAfter = new Map<string, number>()
  private dateWindow?: DateWindow

  constructor(
    private readonly record: (input: TuiUsageRecord) => Promise<boolean>,
    private readonly now: () => number = Date.now,
    private readonly retryDelay = DEFAULT_RETRY_DELAY_MS,
  ) {}

  recordStartup(timestamp = this.now()): Promise<boolean> {
    return this.persist(this.dateAt(timestamp), true, timestamp)
  }

  recordActivity(timestamp = this.now()): Promise<boolean> {
    const statDate = this.dateAt(timestamp)
    if (this.recordedDates.has(statDate)) return Promise.resolve(false)
    if ((this.retryAfter.get(statDate) ?? 0) > timestamp) return Promise.resolve(false)
    return this.persist(statDate, false, timestamp)
  }

  private dateAt(timestamp: number): string {
    const cached = this.dateWindow
    if (cached && timestamp < cached.end && timestamp >= cached.end - 24 * 60 * 60 * 1000) return cached.statDate
    this.dateWindow = shanghaiDateWindow(timestamp)
    return this.dateWindow.statDate
  }

  private persist(statDate: string, isStartup: boolean, timestamp: number): Promise<boolean> {
    if (this.recordedDates.has(statDate)) return Promise.resolve(false)
    const pending = this.pendingDates.get(statDate)
    if (pending) return pending

    const operation = this.record({ statDate, isStartup })
      .then((persisted) => {
        if (persisted) {
          this.recordedDates.add(statDate)
          this.retryAfter.delete(statDate)
        } else {
          this.retryAfter.set(statDate, timestamp + this.retryDelay)
        }
        return persisted
      })
      .catch(() => {
        this.retryAfter.set(statDate, timestamp + this.retryDelay)
        return false
      })
      .finally(() => {
        this.pendingDates.delete(statDate)
      })
    this.pendingDates.set(statDate, operation)
    return operation
  }
}
