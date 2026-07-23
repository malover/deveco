import { readAnalyticsEnabled, readPrivacyBoolean } from "@/cli/deveco-privacy-settings"
import { getPrivacyAcceptedKey } from "@/cli/deveco-legal"
import { devecoAuth } from "../deveco"
import { createEnvironmentFields } from "./events"
import { getVersion } from "./storage"
import { ANALYTICS_ACTION } from "./types"
import type { AnalyticsSubmission, TuiUsageDailyEvent } from "./types"
import { globalUploader } from "./uploader"

export interface TuiUsageInput {
  statDate: string
  isStartup: boolean
}

export interface TuiUsageCollectorDependencies {
  analyticsEnabled(): Promise<boolean>
  isLoggedIn(): Promise<boolean>
  userId(): Promise<string | null>
  agreementAccepted(userId: string): Promise<boolean>
  version(): string
  upload(submission: AnalyticsSubmission): Promise<boolean>
}

declare const DEVECO_SKIP_AGREEMENT: boolean | undefined

async function readAgreementAccepted(userId: string): Promise<boolean> {
  if (
    (typeof DEVECO_SKIP_AGREEMENT !== "undefined" && DEVECO_SKIP_AGREEMENT) ||
    process.env.DEVECO_SKIP_AGREEMENT === "1"
  )
    return true
  return readPrivacyBoolean(getPrivacyAcceptedKey(userId), false)
}

const defaultDependencies: TuiUsageCollectorDependencies = {
  analyticsEnabled: readAnalyticsEnabled,
  isLoggedIn: () => devecoAuth.isLoggedIn(),
  userId: () => devecoAuth.getUserId(),
  agreementAccepted: readAgreementAccepted,
  version: getVersion,
  upload: (submission) => globalUploader.upload(submission),
}

export class TuiUsageCollector {
  constructor(private readonly dependencies: TuiUsageCollectorDependencies = defaultDependencies) {}

  async recordUsage(input: TuiUsageInput): Promise<boolean> {
    if (!(await this.dependencies.analyticsEnabled()) || !(await this.dependencies.isLoggedIn())) return false
    const userId = (await this.dependencies.userId())?.trim()
    if (!userId) return false
    if (!(await this.dependencies.agreementAccepted(userId))) return false

    const event: TuiUsageDailyEvent = {
      ...createEnvironmentFields(this.dependencies.version()),
      statDate: input.statDate,
      isStartup: input.isStartup,
    }
    return this.dependencies.upload({ action: ANALYTICS_ACTION.TUI_USAGE, event })
  }
}

export const globalTuiUsageCollector = new TuiUsageCollector()
