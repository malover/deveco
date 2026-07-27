import { $ } from "bun"
import fs from "fs"
import path from "path"

export const DEVECO_CLI_VENDOR_DIRNAME = "deveco-cli"

const PACKAGE_NAMES = ["@deveco/deveco-cli", "@deveco-test/deveco-cli"] as const
const PACKAGE_JSON_NAME = "@deveco/deveco-cli"

export function resolveDevecoCliPackageRoot(searchFrom: string): string | undefined {
  let current = searchFrom
  for (;;) {
    for (const name of PACKAGE_NAMES) {
      const candidate = path.join(current, "node_modules", ...name.split("/"))
      if (fs.existsSync(path.join(candidate, "package.json"))) {
        return candidate
      }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return undefined
}

export function resolveDevecoCliEntry(packageRoot: string): string {
  return path.join(packageRoot, "dist", "cli.js")
}

export function resolveVendoredDevecoCliEntry(vendorRoot: string): string {
  for (const name of PACKAGE_NAMES) {
    const candidate = path.join(vendorRoot, "node_modules", ...name.split("/"), "dist", "cli.js")
    if (fs.existsSync(candidate)) return candidate
  }
  return resolveDevecoCliEntry(vendorRoot)
}

export async function readDevecoCliVersion(packageRoot: string): Promise<string> {
  const pkg = JSON.parse(await fs.promises.readFile(path.join(packageRoot, "package.json"), "utf8")) as {
    version?: string
  }
  return pkg.version ?? "unknown"
}

async function writeVendorPackageJson(destRoot: string, version: string) {
  await fs.promises.writeFile(
    path.join(destRoot, "package.json"),
    JSON.stringify(
      {
        name: "deveco-cli-vendor",
        private: true,
        dependencies: {
          [PACKAGE_JSON_NAME]: version,
        },
      },
      null,
      2,
    ),
  )
}

async function installDevecoCliVendor(destRoot: string, version: string) {
  await fs.promises.rm(destRoot, { recursive: true, force: true })
  await fs.promises.mkdir(destRoot, { recursive: true })
  await writeVendorPackageJson(destRoot, version)

  const registry = (process.env.NPM_REGISTRY ?? "").trim()
  if (registry) {
    await $`bun install --production --registry=${registry.replace(/\/$/, "")}`.cwd(destRoot)
  } else {
    await $`bun install --production`.cwd(destRoot)
  }

  const entry = resolveVendoredDevecoCliEntry(destRoot)
  if (!fs.existsSync(entry)) {
    throw new Error(`deveco-cli entry not found after install: ${entry}`)
  }
}

export async function ensureDevecoCliCached(opts: { packageDir: string; cacheDir: string }) {
  const src = resolveDevecoCliPackageRoot(opts.packageDir)
  if (!src) {
    throw new Error(
      'deveco-cli package not found in node_modules. Add "@deveco/deveco-cli" to dependencies and run bun install.',
    )
  }

  const version = await readDevecoCliVersion(src)
  const dest = path.join(opts.cacheDir, DEVECO_CLI_VENDOR_DIRNAME)
  const marker = path.join(dest, ".version")
  const entry = resolveVendoredDevecoCliEntry(dest)

  if (fs.existsSync(marker)) {
    const current = (await fs.promises.readFile(marker, "utf8")).trim()
    if (current === version && fs.existsSync(entry)) {
      console.log(`  deveco-cli@${version} already cached`)
      return { dest, version }
    }
  }

  console.log(`  Caching deveco-cli@${version}...`)
  await installDevecoCliVendor(dest, version)
  await fs.promises.writeFile(marker, version)
  console.log(`  Cached deveco-cli@${version}`)
  return { dest, version }
}

export async function bundleDevecoCliVendor(opts: { packageDir: string; cacheDir: string; vendorDir: string }) {
  const cache = path.join(opts.cacheDir, DEVECO_CLI_VENDOR_DIRNAME)
  const cacheEntry = resolveVendoredDevecoCliEntry(cache)

  if (!fs.existsSync(cacheEntry)) {
    await ensureDevecoCliCached({ packageDir: opts.packageDir, cacheDir: opts.cacheDir })
  }

  await fs.promises.rm(opts.vendorDir, { recursive: true, force: true })
  await fs.promises.cp(cache, opts.vendorDir, { recursive: true })

  // npm pack excludes node_modules; archive it for postinstall to restore
  const nodeModulesDir = path.join(opts.vendorDir, "node_modules")
  if (fs.existsSync(nodeModulesDir)) {
    await $`tar -czf ${path.join(opts.vendorDir, "deps.tar.gz")} -C ${opts.vendorDir} node_modules`
    await fs.promises.rm(nodeModulesDir, { recursive: true, force: true })
  }

  const version = (await fs.promises.readFile(path.join(cache, ".version"), "utf8")).trim()
  console.log(`  Bundled deveco-cli@${version}`)
}
