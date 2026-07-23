import os from "os"
import path from "path"
import fs from "fs"
import * as prompts from "@clack/prompts"
import { isTrusted, saveTrust } from "./trust/cache"
import { Global } from "@opencode-ai/core/global"

const WARNING = "\x1b[38;2;150;108;30m"
const RESET = "\x1b[0m"

// ── CLI i18n ────────────────────────────────────────────────
// Detects locale from the TUI KV store first (user's explicit language
// preference via the /lang switch), then falls back to system environment
// (LANG / LC_ALL / LC_MESSAGES). Only "en" and "zh" are supported here
// — the trust prompt runs before the TUI boots, so it cannot reuse
// TUI's i18next instance directly.

const DICT: Record<string, Record<string, string>> = {
  en: {
    intro: "Accessing workspace:",
    question:
      "Safety Check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what's in this folder first.",
    explanation: "Once trusted, DevEco Code will be able to read, edit, and execute files in this directory.",
    option_yes: "Yes, I trust this folder",
    option_no: "No, exit",
    option_no_home: "No, exit (Recommended)",
    option_yes_home: "Yes, I trust this folder (session only)",
    home_badge: "(Home directory)",
    declined: "Workspace not trusted. Exiting.",
    trusted: "Workspace trusted.",
  },
  zh: {
    intro: "访问工作区：",
    question:
      "安全确认：这是您创建的项目或您信任的项目吗？（如您自己的代码、知名开源项目或团队项目）。如果不是，请先查看此目录中的内容。",
    explanation: "信任后，DevEco Code 将能读取、修改和运行此目录中的文件。",
    option_yes: "是的，我信任此目录",
    option_no: "否，退出",
    option_no_home: "否，退出（推荐）",
    option_yes_home: "是的，我信任此目录（只信任本次）",
    home_badge: "(主目录)",
    declined: "工作区未受信任，退出。",
    trusted: "工作区已受信任。",
  },
}

function readKVLanguage(): "en" | "zh" | undefined {
  try {
    const kvPath = path.join(Global.Path.state, "kv.json")
    const content = fs.readFileSync(kvPath, "utf-8")
    const kv = JSON.parse(content) as Record<string, unknown>
    const lang = kv.language
    if (lang === "zh") return "zh"
    if (lang === "en") return "en"
  } catch {}
}

function detectCliLocale(): "en" | "zh" {
  const kvLang = readKVLanguage()
  if (kvLang) return kvLang

  const candidates = [
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
  ]
  for (const raw of candidates) {
    if (!raw) continue
    const lower = raw.toLowerCase()
    if (lower.startsWith("zh")) return "zh"
  }
  return "en"
}

const locale = detectCliLocale()
const dict = DICT[locale] ?? DICT.en
function t(key: string): string {
  return dict[key] ?? DICT.en[key] ?? key
}

// ── Trust prompt ─────────────────────────────────────────────

/**
 * Show a workspace trust prompt before the app starts.
 *
 * Uses @clack/prompts for the interactive chrome, matching Claude Code's
 * PermissionDialog flow:
 *
 *   ╭─ Accessing workspace ─────────────────────────────────╮
 *   │ /Users/test/my-project                                 │
 *   │ Is this a project you trust? (Your own code, a ...)   │
 *   │ Once trusted, DevEco Code can read, edit, ...          │
 *   │                                                        │
 *   │ ◯ Yes, I trust this folder                             │
 *   │ ◯ No, exit                                             │
 *
 * Visual differs from Claude Code's exact layout (clack puts the title
 * on the top border and uses ◯/◆ markers instead of ❯/✔ + numeric index).
 * The structural shape — frame header + body + select — is preserved.
 *
 * The prompt is skipped in non-interactive environments (no TTY) or when
 * the `DEVECO_TRUST` environment variable is set to `1`.
 *
 * For non-HOME directories, trust is persisted per-project in
 * ~/.config/deveco/trusted-paths.json and the prompt is skipped on
 * subsequent runs (with parent-directory inheritance: if an ancestor
 * was trusted, the directory is automatically trusted as well).
 *
 * For the user's home directory, the prompt is ALWAYS shown on entry
 * (no session-level skipping), but the trust decision is session-only
 * — saveTrust() does not write to disk for HOME.
 *
 * For the user's home directory, the prompt shows a "(Home directory)" badge
 * after the path, swaps the option order (No first, Yes second), appends
 * "(Recommended)" to the No label and "(session only)" to the Yes label
 * (always visible, not just on hover), and defaults to the No option —
 * reflecting the higher risk of trusting the entire home directory.
 */
export async function trustPrompt(directory: string): Promise<boolean> {
  // Auto-trust in non-interactive / CI environments
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return true
  }

  // Allow env var override for automation (CI, scripts, etc.)
  if (process.env.DEVECO_TRUST === "1") {
    return true
  }

  // HOME: always show the prompt — do NOT skip based on sessionHomeTrusted.
  // The user wants to be reminded every time they enter the home directory.
  // (The trust decision itself is still session-only — saveTrust() skips
  // disk writes for HOME; see cache.ts.)
  // For other directories: skip the prompt if previously trusted (with
  // parent-directory inheritance via the on-disk cache).
  const isHome = path.resolve(directory) === os.homedir()
  if (!isHome && await isTrusted(directory)) {
    return true
  }

  prompts.intro(`${WARNING}${t("intro")}${RESET}`)
  const homeBadge = isHome ? ` ${t("home_badge")}` : ""
  prompts.log.message(`\x1b[1m${directory}\x1b[22m${homeBadge}`)
  prompts.log.message(t("question"))
  prompts.log.message(t("explanation"))

  const result = await prompts.select({
    message: "",
    options: isHome
      ? [
          { value: "no", label: t("option_no_home") },
          { value: "yes", label: t("option_yes_home") },
        ]
      : [
          { value: "yes", label: t("option_yes") },
          { value: "no", label: t("option_no") },
        ],
    initialValue: isHome ? "no" : "yes",
  })

  if (prompts.isCancel(result) || result !== "yes") {
    prompts.log.warn(t("declined"))
    return false
  }

  await saveTrust(directory)
  prompts.log.success(t("trusted"))
  return true
}
