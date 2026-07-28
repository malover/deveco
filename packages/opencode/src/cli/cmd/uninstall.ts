import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Installation } from "../../installation"
import { Global } from "@opencode-ai/core/global"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"

interface UninstallArgs {
  keepConfig: boolean
  keepData: boolean
  dryRun: boolean
  force: boolean
}

export interface RemovalTargets {
  directories: Array<{ path: string; label: string; keep: boolean }>
  shellConfig: string | null
  binary: string | null
}

export const UninstallCommand = {
  command: "uninstall",
  describe: "uninstall deveco and remove all related files",
  builder: (yargs: Argv) =>
    yargs
      .option("keep-config", {
        alias: "c",
        type: "boolean",
        describe: "keep configuration files",
        default: false,
      })
      .option("keep-data", {
        alias: "d",
        type: "boolean",
        describe: "keep session data and snapshots",
        default: false,
      })
      .option("dry-run", {
        type: "boolean",
        describe: "show what would be removed without removing",
        default: false,
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "skip confirmation prompts",
        default: false,
      }),

  handler: async (args: UninstallArgs) => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Uninstall DevEco Code")

    const method = await Installation.method()
    prompts.log.info(`Installation method: ${method}`)

    const targets = await collectRemovalTargets(args, method)

    await showRemovalSummary(targets, method)

    if (!args.force && !args.dryRun) {
      const confirm = await prompts.confirm({
        message: "Are you sure you want to uninstall?",
        initialValue: false,
      })
      if (!confirm || prompts.isCancel(confirm)) {
        prompts.outro("Cancelled")
        return
      }
    }

    if (args.dryRun) {
      prompts.log.warn("Dry run - no changes made")
      prompts.outro("Done")
      return
    }

    await executeUninstall(method, targets)

    prompts.outro("Done")
  },
}

async function collectRemovalTargets(args: UninstallArgs, method: Installation.Method): Promise<RemovalTargets> {
  const directories: RemovalTargets["directories"] = [
    { path: Global.Path.data, label: "Data", keep: args.keepData },
    { path: Global.Path.cache, label: "Cache", keep: false },
    { path: Global.Path.config, label: "Config", keep: args.keepConfig },
    { path: Global.Path.state, label: "State", keep: false },
  ]

  const shellConfig = method === "curl" || method === "irm" ? await getShellConfigFile() : null
  const binary = method === "curl" || method === "irm" ? process.execPath : null

  return { directories, shellConfig, binary }
}

async function showRemovalSummary(targets: RemovalTargets, method: Installation.Method) {
  prompts.log.message("The following will be removed:")

  for (const dir of targets.directories) {
    const exists = await fs
      .access(dir.path)
      .then(() => true)
      .catch(() => false)
    if (!exists) continue

    const size = await getDirectorySize(dir.path)
    const sizeStr = formatSize(size)
    const status = dir.keep ? UI.Style.TEXT_DIM + "(keeping)" : ""
    const prefix = dir.keep ? "○" : "✓"

    prompts.log.info(`  ${prefix} ${dir.label}: ${shortenPath(dir.path)} ${UI.Style.TEXT_DIM}(${sizeStr})${status}`)
  }

  if (targets.binary) {
    prompts.log.info(`  ✓ Binary: ${shortenPath(targets.binary)}`)
  }

  if (targets.shellConfig) {
    prompts.log.info(`  ✓ Shell PATH in ${shortenPath(targets.shellConfig)}`)
  }

  if (method !== "curl" && method !== "irm" && method !== "unknown") {
    const cmds: Record<string, string> = {
      npm: "npm uninstall -g @deveco/deveco-code",
      pnpm: "pnpm uninstall -g @deveco/deveco-code",
      bun: "bun remove -g @deveco/deveco-code",
    }
    prompts.log.info(`  ✓ Package: ${cmds[method] || method}`)
  }
}

async function executeUninstall(method: Installation.Method, targets: RemovalTargets) {
  const spinner = prompts.spinner()
  const errors: string[] = []

  await removeDirectories(targets, spinner, errors)
  await cleanShellConfigSafe(targets, spinner, errors)
  await uninstallPackage(method, spinner)
  showBinaryRemovalInstructions(method, targets)

  if (errors.length > 0) {
    UI.empty()
    prompts.log.warn('Some operations failed:')
    for (const err of errors) {
      prompts.log.error(`  ${err}`)
    }
  }

  UI.empty()
  prompts.log.success('Thank you for using DevEco Code!')
}

async function removeDirectories(
  targets: RemovalTargets,
  spinner: ReturnType<typeof prompts.spinner>,
  errors: string[],
) {
  for (const dir of targets.directories) {
    if (dir.keep) {
      prompts.log.step(`Skipping ${dir.label} (--keep-${dir.label.toLowerCase()})`)
      continue
    }

    const exists = await fs.access(dir.path).then(() => true).catch(() => false)
    if (!exists) continue

    spinner.start(`Removing ${dir.label}...`)
    const err = await fs.rm(dir.path, { recursive: true, force: true }).catch((e) => e)
    if (err) {
      spinner.stop(`Failed to remove ${dir.label}`, 1)
      errors.push(`${dir.label}: ${err.message}`)
      continue
    }
    spinner.stop(`Removed ${dir.label}`)
  }
}

async function cleanShellConfigSafe(
  targets: RemovalTargets,
  spinner: ReturnType<typeof prompts.spinner>,
  errors: string[],
) {
  if (!targets.shellConfig) {
    return
  }

  spinner.start('Cleaning shell config...')
  const err = await cleanShellConfig(targets.shellConfig).catch((e) => e)
  if (err) {
    spinner.stop('Failed to clean shell config', 1)
    errors.push(`Shell config: ${err.message}`)
  } else {
    spinner.stop('Cleaned shell config')
  }
}

async function uninstallPackage(method: Installation.Method, spinner: ReturnType<typeof prompts.spinner>) {
  if (method === 'curl' || method === 'irm' || method === 'unknown') {
    return
  }

  const cmds: Record<string, string[]> = {
    npm: ['npm', 'uninstall', '-g', '@deveco/deveco-code'],
    pnpm: ['pnpm', 'uninstall', '-g', '@deveco/deveco-code'],
    bun: ['bun', 'remove', '-g', '@deveco/deveco-code'],
  }

  const cmd = cmds[method]
  if (!cmd) {
    return
  }

  spinner.start(`Running ${cmd.join(' ')}...`)
  const result = await Process.run(cmd, { nothrow: true })
  if (result.code !== 0) {
    spinner.stop(`Package manager uninstall failed: exit code ${result.code}`, 1)
    prompts.log.warn(`You may need to run manually: ${cmd.join(' ')}`)
  } else {
    spinner.stop('Package removed')
  }
}

// curl: don't auto-delete binary — show manual rm commands (safety: binary may be running)
export function showBinaryRemovalInstructions(method: Installation.Method, targets: RemovalTargets) {
  if ((method !== "curl" && method !== "irm") || !targets.binary) {
    return
  }

  UI.empty()
  prompts.log.message('To finish removing the binary, run:')
  if (process.platform === 'win32') {
    prompts.log.info(`  Remove-Item "${targets.binary}" -Force`)
    const installDir = path.dirname(path.dirname(targets.binary))
    if (installDir.includes('.deveco')) {
      prompts.log.info(`  Remove-Item "${installDir}" -Recurse -Force`)
    }
    // Windows PATH is managed via the registry, not shell config files — prompt user to remove the entry manually
    const binDir = path.dirname(targets.binary)
    prompts.log.info(`  # Remove "${binDir}" from user PATH via System Settings or PowerShell`)
  } else {
    prompts.log.info(`  rm "${targets.binary}"`)
    const installDir = path.dirname(path.dirname(targets.binary))
    if (installDir.includes('.deveco')) {
      prompts.log.info(`  rmdir "${installDir}" 2>/dev/null`)
    }
  }
}

async function getShellConfigFile(): Promise<string | null> {
  // Windows: PATH is managed via the registry, not shell config files
  if (process.platform === "win32") {
    return null
  }
  const shell = path.basename(process.env.SHELL || "bash")
  const home = os.homedir()
  const zdotdir = process.env.ZDOTDIR || home
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config")

  const configFiles: Record<string, string[]> = {
    fish: [path.join(xdgConfig, "fish", "config.fish")],
    zsh: [
      path.join(zdotdir, ".zshrc"),
      path.join(zdotdir, ".zshenv"),
      path.join(xdgConfig, "zsh", ".zshrc"),
      path.join(xdgConfig, "zsh", ".zshenv"),
    ],
    bash: [
      path.join(home, ".bashrc"),
      path.join(home, ".bash_profile"),
      path.join(home, ".profile"),
      path.join(xdgConfig, "bash", ".bashrc"),
      path.join(xdgConfig, "bash", ".bash_profile"),
    ],
    ash: [path.join(home, ".ashrc"), path.join(home, ".profile")],
    sh: [path.join(home, ".ashrc"), path.join(home, ".profile")],
  }

  const candidates = configFiles[shell] || configFiles.bash

  for (const file of candidates) {
    const exists = await fs
      .access(file)
      .then(() => true)
      .catch(() => false)
    if (!exists) continue

    const content = await Filesystem.readText(file).catch(() => "")
    if (content.includes("# deveco") || content.includes(".deveco/bin")) {
      return file
    }
  }

  return null
}

async function cleanShellConfig(file: string) {
  const content = await Filesystem.readText(file)
  const lines = content.split("\n")

  const filtered = lines.filter((line) => {
    const trimmed = line.trim()
    if (trimmed === "# deveco") return false
    if (trimmed.startsWith("export PATH=") && trimmed.includes(".deveco/bin")) return false
    if (trimmed.startsWith("fish_add_path") && trimmed.includes(".deveco")) return false
    return true
  })

  // Remove trailing blank lines
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === "") {
    filtered.pop()
  }

  const output = filtered.join("\n") + "\n"
  await Filesystem.write(file, output)
}

async function getDirectorySize(dir: string): Promise<number> {
  let total = 0

  const walk = async (current: string) => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])

    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (entry.isFile()) {
        const stat = await fs.stat(full).catch(() => null)
        if (stat) total += stat.size
      }
    }
  }

  await walk(dir)
  return total
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function shortenPath(p: string): string {
  const home = os.homedir()
  if (p.startsWith(home)) {
    return p.replace(home, "~")
  }
  return p
}
