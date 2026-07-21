import os from "os"
import type { AnalyticsEnvironmentFields } from "./types"

export function createEnvironmentFields(sourceVersion: string): AnalyticsEnvironmentFields {
  return {
    sourceType: "DevEco-Code-Cli",
    sourceVersion,
    os_arch: os.arch(),
    os_name: process.platform,
    os_version: os.release(),
  }
}
