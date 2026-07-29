import crypto from "crypto"
import os from "os"
import path from "path"
import type { AnalyticsEvent } from "./types"

export const PATH_REDACTION_VERSION = 1 as const
export const PATH_REDACTION_MODE = "hmac-sha256-installation" as const

type PathScope = "project" | "project-root" | "home" | "external"

export interface PathRedactionOptions {
  salt: string
  projectPath?: string
  homePath?: string
}

type RedactableMagpieAnalyticsEvent = Omit<AnalyticsEvent, "pathRedactionVersion" | "pathRedactionMode"> &
  Partial<Pick<AnalyticsEvent, "pathRedactionVersion" | "pathRedactionMode">>

const PATH_FIELD = /(?:^|_)(?:path|file|filename|filepath|file_path|cwd|directory|dir|root|workspace|worktree)(?:$|_)/i
const PATH_TOKEN = /^<path:(?:project|project-root|home|external):[a-f0-9]{32}:(?:[a-z0-9]{1,10}|none)>$/
const HTTP_URL = /^https?:\/\//i
const FILE_URL = /^file:\/\//i
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/
const UNC_ABSOLUTE = /^\\\\/
const EXPLICIT_RELATIVE = /^(?:~[\\/]|\.{1,2}[\\/])/

export function redactAnalyticsEventPaths(
  event: RedactableMagpieAnalyticsEvent,
  options: PathRedactionOptions,
): AnalyticsEvent {
  const redactor = createPathRedactor(options)
  return {
    ...event,
    pathRedactionVersion: PATH_REDACTION_VERSION,
    pathRedactionMode: PATH_REDACTION_MODE,
    modifiedFileList: event.modifiedFileList.map((item) => ({
      ...item,
      fileName: redactor.path(item.fileName),
    })),
    toolExecutions: event.toolExecutions.map((execution) => ({
      ...execution,
      ...(execution.input ? { input: redactor.record(execution.input) } : {}),
      ...(execution.error ? { error: { ...execution.error, message: redactor.text(execution.error.message) } } : {}),
      ...(execution.outputTail ? { outputTail: redactor.text(execution.outputTail) } : {}),
    })),
    assistantExecutions: event.assistantExecutions.map((execution) => ({
      ...execution,
      ...(execution.error ? { error: { ...execution.error, message: redactor.text(execution.error.message) } } : {}),
    })),
    ...(event.sessionError
      ? { sessionError: { ...event.sessionError, message: redactor.text(event.sessionError.message) } }
      : {}),
  }
}

export function redactPath(value: string, options: PathRedactionOptions): string {
  return createPathRedactor(options).path(value)
}

export function redactTextPaths(value: string, options: PathRedactionOptions): string {
  return createPathRedactor(options).text(value)
}

function createPathRedactor(options: PathRedactionOptions) {
  const projectPath = options.projectPath ? normalizePath(options.projectPath, options.homePath) : undefined
  const context: PathRedactionContext = {
    options,
    projectPath,
    homePath: normalizePath(options.homePath || os.homedir(), options.homePath),
    projectRoots: Array.from(new Set([options.projectPath, projectPath].filter((item): item is string => !!item))),
    cache: new Map(),
  }
  return {
    path: (input: string) => redactCandidate(input, context),
    text: (input: string) => redactText(input, context),
    record: (input: object) => redactRecord(input, context),
  }
}

interface PathRedactionContext {
  options: PathRedactionOptions
  projectPath?: string
  homePath: string
  projectRoots: string[]
  cache: Map<string, string>
}

function redactCandidate(input: string, context: PathRedactionContext): string {
  if (!input || HTTP_URL.test(input)) return input
  const suffix = input.match(/(:\d+(?::\d+)?)$/)?.[1] || ""
  const raw = suffix ? input.slice(0, -suffix.length) : input
  if (PATH_TOKEN.test(raw)) return input
  const cached = context.cache.get(raw)
  if (cached) return `${cached}${suffix}`
  const normalized = normalizePath(raw, context.options.homePath)
  const absolute = isAbsolutePath(normalized)
    ? normalized
    : context.projectPath
      ? normalizePath(path.posix.join(context.projectPath, normalized), context.options.homePath)
      : normalized
  const projectRelative = context.projectPath ? relativeWithin(context.projectPath, absolute) : undefined
  const homeRelative = relativeWithin(context.homePath, absolute)
  const scope: PathScope =
    projectRelative === "."
      ? "project-root"
      : projectRelative !== undefined
        ? "project"
        : homeRelative !== undefined
          ? "home"
          : "external"
  const digest = crypto
    .createHmac("sha256", context.options.salt)
    .update(`${scope}\u0000${absolute}`)
    .digest("hex")
    .slice(0, 32)
  const token = `<path:${scope}:${digest}:${extensionOf(raw) || "none"}>`
  context.cache.set(raw, token)
  return `${token}${suffix}`
}

function redactText(input: string, context: PathRedactionContext): string {
  if (!input) return input
  const protectedInput = protectHttpUrls(input)
  const knownRoots = redactKnownProjectRoots(protectedInput.value, context)
  const unquoted = redactUnquotedPaths(knownRoots, context)
  const knownPaths = redactKnownProjectPaths(unquoted, context)
  const remaining = redactRemainingPaths(knownPaths, context)
  return remaining.replace(
    /\u0000http-url-(\d+)\u0000/g,
    (_match, index: string) => protectedInput.urls[Number(index)] || "",
  )
}

function protectHttpUrls(input: string): { value: string; urls: string[] } {
  const urls: string[] = []
  return {
    value: input.replace(/https?:\/\/[^\s<>"'`]+/gi, (url) => {
      const index = urls.push(url) - 1
      return `\u0000http-url-${index}\u0000`
    }),
    urls,
  }
}

function redactKnownProjectRoots(input: string, context: PathRedactionContext): string {
  return context.projectRoots.reduce(
    (value, root) =>
      value.replace(
        new RegExp(
          `(^|[\\s(=\\[\\]{},:;])(${escapeRegExp(root)}(?::\\d+(?::\\d+)?)?)(?![.\\\\/])(?=$|[\\s\\p{P}])`,
          WINDOWS_ABSOLUTE.test(root) || UNC_ABSOLUTE.test(root) ? "giu" : "gu",
        ),
        (_match, prefix: string, candidate: string) => `${prefix}${redactCandidate(candidate, context)}`,
      ),
    input,
  )
}

function redactUnquotedPaths(input: string, context: PathRedactionContext): string {
  const spacedFiles = input.replace(
    /(^|[\s(=[{,:;])((?:(?:file:\/\/\/|\/|~[\\/]|\.\.?[\\/]|[A-Za-z]:[\\/]|\\\\)|(?:[^\s<>"'`()\[\]{},;:/\\]+[\\/]))[^\r\n<>"'`]*?\.[\p{L}\p{N}]{1,10}(?::\d+(?::\d+)?)?)(?![.\\/])(?=$|[\s\p{P}])/gu,
    (_match, prefix: string, candidate: string) => `${prefix}${redactCandidate(candidate, context)}`,
  )
  return spacedFiles.replace(
    /(^|[\s(=[{,:;])((?:file:\/\/\/|\/|~[\\/]|[A-Za-z]:[\\/]|\\\\)[^\r\n<>"'`,;!?\])}]+?)(?=(?:\s+(?:now|then|and|but|please|next|afterwards)(?=$|[\s\p{P}]))|(?:\s+(?:然后|接着|现在)(?=$|[\s\p{P}]))|$|[,;!?])/giu,
    (_match, prefix: string, candidate: string) => `${prefix}${redactCandidate(candidate, context)}`,
  )
}

function redactKnownProjectPaths(input: string, context: PathRedactionContext): string {
  return context.projectRoots.reduce(
    (value, root) =>
      value.replace(
        new RegExp(
          `(^|[\\s(=\\[\\]{},:;])(${escapeRegExp(root)}(?:[\\\\/][^\\s<>"'\`\\])},;!?]+)+(?::\\d+(?::\\d+)?)?)(?=$|[\\s\\p{P}])`,
          WINDOWS_ABSOLUTE.test(root) || UNC_ABSOLUTE.test(root) ? "giu" : "gu",
        ),
        (_match, prefix: string, candidate: string) => `${prefix}${redactCandidate(candidate, context)}`,
      ),
    input,
  )
}

function redactRemainingPaths(input: string, context: PathRedactionContext): string {
  const quoted = input.replace(/(["'`])([^"'`\r\n]+)\1/g, (match, quote: string, candidate: string) => {
    if (!looksLikePath(candidate)) return match
    return `${quote}${redactCandidate(candidate, context)}${quote}`
  })
  const fileUrls = quoted.replace(/file:\/\/\/[^\s<>"'`]+/gi, (candidate) => redactCandidate(candidate, context))
  const unc = fileUrls.replace(/\\\\[^\s<>"'`\])},;]+/g, (candidate) => redactCandidate(candidate, context))
  const windows = unc.replace(
    /(^|[\s(=[{,'"`])([A-Za-z]:[\\/][^\s<>"'`\])},;]+)/g,
    (_match, prefix: string, candidate: string) => `${prefix}${redactCandidate(candidate, context)}`,
  )
  const explicit = windows.replace(
    /(^|[\s(=[{:;,])((?:\/|~[\\/]|\.\.?[\\/])[^\s<>"'`\])},;]+)/g,
    (_match, prefix: string, candidate: string) => `${prefix}${redactCandidate(candidate, context)}`,
  )
  return explicit.replace(
    /(^|[\s(=[{'`,])((?:[^\s<>"'`()\[\]{},;:/\\]+[\\/])+[^\s<>"'`()\[\]{},;:/\\]+(?::\d+(?::\d+)?)?)/gu,
    (_match, prefix: string, candidate: string) =>
      HTTP_URL.test(candidate) ? `${prefix}${candidate}` : `${prefix}${redactCandidate(candidate, context)}`,
  )
}

function redactValue(input: unknown, context: PathRedactionContext, key?: string): unknown {
  if (typeof input === "string") {
    if (key && PATH_FIELD.test(key) && !HTTP_URL.test(input)) return redactCandidate(input, context)
    return redactText(input, context)
  }
  if (Array.isArray(input)) return input.map((item) => redactValue(item, context))
  if (!input || typeof input !== "object") return input
  return redactRecord(input, context)
}

function redactRecord(input: object, context: PathRedactionContext) {
  return Object.fromEntries(
    Object.entries(input).map(([itemKey, item]) => [itemKey, redactValue(item, context, itemKey)]),
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function looksLikePath(value: string): boolean {
  if (!value || PATH_TOKEN.test(value) || HTTP_URL.test(value)) return false
  return (
    FILE_URL.test(value) ||
    value.startsWith("/") ||
    WINDOWS_ABSOLUTE.test(value) ||
    UNC_ABSOLUTE.test(value) ||
    EXPLICIT_RELATIVE.test(value) ||
    /[\\/]/.test(value)
  )
}

function normalizePath(value: string, homePath?: string): string {
  const decoded = decodeFileUrl(value)
  const expanded =
    decoded === "~"
      ? homePath || os.homedir()
      : decoded.startsWith("~/") || decoded.startsWith("~\\")
        ? `${homePath || os.homedir()}/${decoded.slice(2)}`
        : decoded
  const windows = WINDOWS_ABSOLUTE.test(expanded) || UNC_ABSOLUTE.test(expanded)
  const normalized = path.posix.normalize(expanded.replaceAll("\\", "/"))
  return windows ? normalized.toLowerCase() : normalized
}

function decodeFileUrl(value: string): string {
  if (!FILE_URL.test(value)) return value
  try {
    const decoded = decodeURIComponent(value.replace(/^file:\/\//i, ""))
    return /^\/[A-Za-z]:\//.test(decoded) ? decoded.slice(1) : decoded
  } catch {
    return value.replace(/^file:\/\//i, "")
  }
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[a-z]:\//.test(value) || value.startsWith("//")
}

function relativeWithin(parent: string, child: string): string | undefined {
  if (!isAbsolutePath(parent) || !isAbsolutePath(child)) return undefined
  const relative = path.posix.relative(parent, child)
  if (!relative) return "."
  if (relative === ".." || relative.startsWith("../") || path.posix.isAbsolute(relative)) return undefined
  return relative
}

function extensionOf(value: string): string | undefined {
  const withoutUrl = decodeFileUrl(value).replaceAll("\\", "/")
  const extension = path.posix.extname(withoutUrl).slice(1).toLowerCase()
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : undefined
}
