#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

const EXCLUDES = new Set([
  ".git", ".repo", ".homegraph", ".hvigor", ".idea", ".vscode", "node_modules", "oh_modules",
  "build", "out", "dist", "coverage", "vendor", "third_party", "third-party", "generated",
])

const SOURCE_EXTENSIONS = new Set([
  ".ets", ".ts", ".tsx", ".js", ".jsx", ".c", ".cc", ".cpp", ".cxx", ".h", ".hh",
  ".hpp", ".java", ".kt", ".kts", ".py", ".rs", ".go", ".swift", ".dart", ".rb", ".php", ".cs",
])

const DESCRIPTOR_NAMES = new Set([
  ".gitmodules", "manifest.xml", "build-profile.json5", "module.json5", "app.json5",
  "oh-package.json5", "oh-package-lock.json5", "bundle.json", "subsystem_config.json", "BUILD.gn",
  "package.json", "pnpm-workspace.yaml", "Cargo.toml", "go.mod", "pom.xml", "settings.gradle",
  "settings.gradle.kts",
])

const args = process.argv.slice(2)
if (!args.length || args.includes("--help")) {
  console.log("Usage: bootstrap_projectspec.mjs <workspace-root> [--output-root docs] [--revision HEAD]")
  process.exit(args.length ? 0 : 2)
}

function option(name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const root = path.resolve(args[0])
const outputRoot = path.resolve(root, option("--output-root", "docs"))
const revision = option("--revision", "HEAD")

function normalize(value) {
  const result = String(value).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "")
  return result || "."
}

function slug(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "root"
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []
}

function uniqueBy(items, key) {
  const seen = new Set()
  return items.filter((item) => {
    const value = key(item)
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}

function stripJsonComments(text) {
  let output = ""
  let quote = ""
  let escaped = false
  for (let index = 0; index < text.length; index++) {
    const current = text[index]
    const next = text[index + 1]
    if (quote) {
      output += current
      if (escaped) escaped = false
      else if (current === "\\") escaped = true
      else if (current === quote) quote = ""
      continue
    }
    if (current === '"' || current === "'") {
      quote = current
      output += current
      continue
    }
    if (current === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index++
      output += "\n"
      continue
    }
    if (current === "/" && next === "*") {
      index += 2
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index++
      index++
      continue
    }
    output += current
  }
  return output
}

async function readLooseJson(relative) {
  try {
    let text = stripJsonComments(await fs.readFile(path.join(root, relative), "utf8"))
    text = text
      .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3')
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => JSON.stringify(value.replaceAll("\\'", "'")))
      .replace(/,\s*([}\]])/g, "$1")
    return isObject(JSON.parse(text))
  } catch {
    return {}
  }
}

async function exists(relative) {
  try {
    await fs.access(path.join(root, relative))
    return true
  } catch {
    return false
  }
}

async function walk(directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDES.has(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    const relative = normalize(path.relative(root, absolute))
    if (entry.isDirectory()) await walk(absolute, files)
    else if (entry.isFile()) files.push(relative)
  }
}

function ownerFor(projects, candidate) {
  return projects
    .filter((project) => project.path === "." || candidate === project.path || candidate.startsWith(`${project.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0]
}

function countSources(files, rootPath) {
  const prefix = rootPath === "." ? "" : `${rootPath}/`
  return files.filter((file) => file.startsWith(prefix) && SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())).length
}

function projectKind(descriptors) {
  const arkts = descriptors.some((item) => item.endsWith("build-profile.json5"))
  const component = descriptors.some((item) => item.endsWith("bundle.json"))
  if (arkts && component) return "mixed"
  if (arkts) return "arkts-application"
  if (component) return "openharmony-component"
  if (descriptors.some((item) => item.endsWith("package.json") || item.endsWith("oh-package.json5"))) return "package"
  return "other"
}

function outputBase(project, multiple) {
  if (!multiple) return ""
  return project.path === "." ? project.outputSlug : project.path
}

function documentPath(base, name) {
  return base ? `${base}/${name}` : name
}

function addDocument(documents, relative, kind, scope, reason) {
  if (!documents.some((item) => item.path === relative)) documents.push({ path: relative, kind, scope, reason })
}

function surfaceSignals(module, files) {
  const prefix = module.path === "." ? "" : `${module.path}/`
  const owned = files.filter((file) => file.startsWith(prefix))
  const names = owned.map((file) => path.posix.basename(file).toLowerCase())
  return {
    publicEntry: names.some((name) => ["index.ets", "index.ts", "index.js", "index.d.ts"].includes(name)),
    native: owned.some((file) => /\/src\/main\/cpp\/|\/include\/|BUILD\.gn$/i.test(`/${file}`)),
    tests: owned.some((file) => /\/(?:test|tests|ohosTest)\//i.test(`/${file}`) || /(?:\.test\.|\.spec\.|_test\.)/i.test(file)),
    resources: owned.some((file) => /\/resources\//i.test(`/${file}`)),
    ets: owned.some((file) => file.endsWith(".ets")),
    uxCandidate: owned.some((file) => /\/(?:pages?|views?|components?|widgets?)\//i.test(`/${file}`)),
    domainModelCandidate: owned.some((file) => /\/(?:models?|entities|entity|schemas?)\//i.test(`/${file}`) || /(?:^|\/)(?!.*ViewModel)[^/]*(?:Model|Entity)\.ets$/i.test(file)),
    stateCandidate: owned.some((file) => /\/(?:viewmodels?|stores?|state)\//i.test(`/${file}`) || /(?:ViewModel|Store|State)\.(?:ets|ts)$/i.test(file)),
    serviceCandidate: owned.some((file) => /\/(?:services?|usecases?|interactors?)\//i.test(`/${file}`)),
    repositoryCandidate: owned.some((file) => /\/(?:repositories|repository|datasources?|persistence)\//i.test(`/${file}`)),
  }
}


function analysisPriorityHint(module) {
  const signals = module.signals || {}
  const surfaces = module.declaredSurfaces || { abilities: [], pages: [], permissions: [] }
  const sourceFiles = Number(module.sourceFiles || 0)
  const highSignals = [
    signals.native, signals.stateCandidate, signals.domainModelCandidate, signals.repositoryCandidate,
    signals.serviceCandidate, surfaces.abilities?.length > 0, surfaces.pages?.length > 0, sourceFiles >= 120,
  ].filter(Boolean).length
  if (highSignals >= 2 || signals.native || sourceFiles >= 300) return "deep-candidate"
  if (highSignals >= 1 || signals.uxCandidate || signals.publicEntry || sourceFiles >= 25) return "standard-candidate"
  return "focused-candidate"
}

function moduleDescriptorPriority(relative) {
  if (/\/src\/main\/module\.json5$/i.test(relative)) return 0
  if (/\/src\/(?:ohosTest|test|tests)\/module\.json5$/i.test(relative)) return 20
  return 10
}
function moduleOutputSlugs(modules) {
  const counts = new Map()
  for (const module of modules) {
    const base = slug(module.name)
    counts.set(base, (counts.get(base) || 0) + 1)
  }
  return new Map(modules.map((module) => {
    const base = slug(module.name)
    if ((counts.get(base) || 0) === 1) return [module.id, base]
    const disambiguator = slug(module.path === "." ? "root" : module.path)
    return [module.id, `${base}-${disambiguator}`]
  }))
}

async function main() {
  const files = []
  await walk(root, files)
  if (await exists(".repo/manifest.xml")) files.push(".repo/manifest.xml")
  files.sort()

  const descriptors = uniqueBy(
    files.filter((file) => DESCRIPTOR_NAMES.has(path.posix.basename(file)) || file === ".repo/manifest.xml"),
    (item) => item,
  )

  const linkedRoots = new Set()
  if (files.includes(".gitmodules")) {
    const text = await fs.readFile(path.join(root, ".gitmodules"), "utf8")
    for (const match of text.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)) linkedRoots.add(normalize(match[1]))
  }
  if (files.includes(".repo/manifest.xml")) {
    const text = await fs.readFile(path.join(root, ".repo/manifest.xml"), "utf8")
    for (const match of text.matchAll(/<project\b[^>]*\bpath=["']([^"']+)["']/g)) linkedRoots.add(normalize(match[1]))
  }

  const workspaceRoots = new Set()
  if (files.includes("package.json")) {
    const packageData = await readLooseJson("package.json")
    const patterns = Array.isArray(packageData.workspaces) ? packageData.workspaces : strings(isObject(packageData.workspaces).packages)
    for (const pattern of patterns.filter((item) => !item.startsWith("!"))) {
      const expression = new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+")}/package\\.json$`)
      for (const file of files.filter((item) => expression.test(item))) workspaceRoots.add(normalize(path.posix.dirname(file)))
    }
  }

  const buildProfiles = descriptors.filter((file) => file.endsWith("build-profile.json5"))
  const declaredModuleRoots = new Set()
  for (const descriptor of buildProfiles) {
    const data = await readLooseJson(descriptor)
    const projectPath = normalize(path.posix.dirname(descriptor))
    for (const value of Array.isArray(data.modules) ? data.modules : []) {
      const module = isObject(value)
      const sourcePath = typeof module.srcPath === "string" ? module.srcPath : module.name
      if (sourcePath) declaredModuleRoots.add(normalize(path.posix.join(projectPath === "." ? "" : projectPath, sourcePath)))
    }
  }

  const projectRoots = new Set([...linkedRoots, ...workspaceRoots])
  const rootHasStructuralProjectDescriptor = descriptors.some((item) =>
    path.posix.dirname(item) === "." && (item.endsWith("build-profile.json5") || item.endsWith("bundle.json"))
  )
  for (const descriptor of descriptors) {
    if (!/(?:build-profile\.json5|bundle\.json|package\.json|oh-package\.json5)$/.test(descriptor)) continue
    const candidate = normalize(path.posix.dirname(descriptor))
    const parts = candidate.toLowerCase().split("/")
    const nonProduct = parts.some((item) => ["templates", "fixtures", "testdata", "examples", "samples"].includes(item))
    const structuralRoot = descriptor.endsWith("build-profile.json5") || descriptor.endsWith("bundle.json")
    const declaredRoot = linkedRoots.has(candidate) || workspaceRoots.has(candidate)
    const rootWorkspaceContainerOnly = candidate === "."
      && (descriptor.endsWith("package.json") || descriptor.endsWith("oh-package.json5"))
      && !rootHasStructuralProjectDescriptor
      && (workspaceRoots.size > 0 || linkedRoots.size > 0)
    if (!rootWorkspaceContainerOnly && (candidate === "." || structuralRoot || declaredRoot) && (!nonProduct || declaredRoot)) {
      projectRoots.add(candidate)
    }
  }

  // An ArkTS module declared by an enclosing build-profile is not a separate Project merely
  // because it also contains package metadata. Explicit repo/sub-repo topology may still win.
  for (const candidate of [...projectRoots]) {
    if (declaredModuleRoots.has(candidate) && !linkedRoots.has(candidate)) projectRoots.delete(candidate)
  }

  if (!projectRoots.size) projectRoots.add(".")

  const projects = []
  for (const projectPath of [...projectRoots].sort()) {
    const ownedDescriptors = descriptors.filter((file) => path.posix.dirname(file) === (projectPath === "." ? "." : projectPath))
    const packageDescriptor = ownedDescriptors.find((item) => item.endsWith("oh-package.json5"))
      || ownedDescriptors.find((item) => item.endsWith("package.json"))
    const packageMetadata = packageDescriptor ? await readLooseJson(packageDescriptor) : {}
    const bundleDescriptor = ownedDescriptors.find((item) => item.endsWith("bundle.json"))
    const bundleMetadata = bundleDescriptor ? await readLooseJson(bundleDescriptor) : {}
    const component = isObject(bundleMetadata.component)
    const displayName = typeof packageMetadata.name === "string"
      ? packageMetadata.name
      : typeof component.name === "string"
        ? component.name
        : projectPath === "." ? path.basename(root) : path.posix.basename(projectPath)

    projects.push({
      id: projectPath === "." ? "_root" : projectPath,
      path: projectPath,
      name: displayName,
      outputSlug: slug(displayName),
      packageName: typeof packageMetadata.name === "string" ? packageMetadata.name : null,
      kind: projectKind(ownedDescriptors),
      subsystem: typeof component.subsystem === "string" ? component.subsystem : null,
      descriptors: ownedDescriptors,
      modules: [],
      boundaryStatus: "candidate-needs-homegraph-verification",
    })
  }

  for (const descriptor of buildProfiles) {
    const project = ownerFor(projects, descriptor)
    if (!project) continue
    const data = await readLooseJson(descriptor)
    for (const [index, value] of (Array.isArray(data.modules) ? data.modules : []).entries()) {
      const module = isObject(value)
      const name = typeof module.name === "string" ? module.name : `module-${index + 1}`
      const sourcePath = typeof module.srcPath === "string" ? module.srcPath : name
      const modulePath = normalize(path.posix.join(project.path === "." ? "" : project.path, sourcePath))
      project.modules.push({
        id: `${name}@${modulePath}`,
        name,
        path: modulePath,
        kind: "arkts-module",
        descriptor,
        targets: strings(module.targets?.map?.((item) => isObject(item).name)).filter(Boolean),
      })
    }
  }

  const moduleDescriptors = descriptors
    .filter((file) => file.endsWith("module.json5"))
    .sort((left, right) => moduleDescriptorPriority(left) - moduleDescriptorPriority(right) || left.localeCompare(right))

  for (const descriptor of moduleDescriptors) {
    const project = ownerFor(projects, descriptor)
    if (!project) continue
    const descriptorDir = normalize(path.posix.dirname(descriptor))
    const normalizedModuleRoot = normalize(descriptorDir.replace(/\/src\/(?:main|ohosTest|test|tests)$/, ""))
    const existing = project.modules.find((module) =>
      normalizedModuleRoot === module.path
      || descriptorDir === module.path
      || descriptorDir.startsWith(`${module.path}/`)
    )
    const data = await readLooseJson(descriptor)
    const moduleData = isObject(data.module).name ? isObject(data.module) : data
    const modulePath = existing?.path || normalizedModuleRoot
    const name = existing?.name || (typeof moduleData.name === "string" ? moduleData.name : path.posix.basename(modulePath))
    const abilities = [
      ...(Array.isArray(moduleData.abilities) ? moduleData.abilities : []),
      ...(Array.isArray(moduleData.extensionAbilities) ? moduleData.extensionAbilities : []),
    ]
      .map((item) => isObject(item))
      .map((item) => ({ name: item.name || null, type: item.type || "ability", srcEntry: item.srcEntry || null }))
      .filter((item) => item.name)
    const pages = typeof moduleData.pages === "string" ? [moduleData.pages] : strings(moduleData.pages)
    const permissions = (Array.isArray(moduleData.requestPermissions) ? moduleData.requestPermissions : [])
      .map((item) => isObject(item).name)
      .filter(Boolean)
    const target = existing || {
      id: `${name}@${modulePath}`,
      name,
      path: modulePath,
      kind: typeof moduleData.type === "string" ? moduleData.type : "arkts-module",
      targets: [],
    }

    // Prefer the production src/main descriptor. Test descriptors may add context but must not
    // replace the authoritative runtime descriptor/surfaces for the same module.
    const currentPriority = target.descriptor ? moduleDescriptorPriority(target.descriptor) : Number.POSITIVE_INFINITY
    const nextPriority = moduleDescriptorPriority(descriptor)
    if (nextPriority <= currentPriority) {
      target.descriptor = descriptor
      target.kind = typeof moduleData.type === "string" ? moduleData.type : target.kind
      target.declaredSurfaces = { abilities, pages, permissions }
    }
    if (!existing) project.modules.push(target)
  }

  for (const descriptor of descriptors.filter((file) => file.endsWith("BUILD.gn"))) {
    const project = ownerFor(projects, descriptor)
    if (!project || !["openharmony-component", "mixed"].includes(project.kind)) continue
    const content = await fs.readFile(path.join(root, descriptor), "utf8")
    const names = [...content.matchAll(/\b(?:ohos_[a-z_]+|group|executable|shared_library|static_library|source_set)\s*\(\s*["']([^"']+)["']/g)]
      .map((match) => match[1])
    for (const name of [...new Set(names)]) {
      const modulePath = normalize(path.posix.dirname(descriptor))
      project.modules.push({ id: `${name}@${modulePath}`, name, path: modulePath, kind: "gn-target", descriptor, targets: [] })
    }
  }

  for (const project of projects) {
    project.modules = uniqueBy(project.modules, (module) => module.id)
      .map((module) => ({
        ...module,
        sourceFiles: countSources(files, module.path),
        signals: surfaceSignals(module, files),
      }))
      .sort((left, right) => left.path.localeCompare(right.path) || left.name.localeCompare(right.name))
  }

  const dependencies = []
  for (const descriptor of descriptors.filter((file) => /(?:oh-package|package)\.json5?$/.test(file))) {
    const consumer = ownerFor(projects, descriptor)
    if (!consumer) continue
    const data = await readLooseJson(descriptor)
    for (const map of [data.dependencies, data.devDependencies, data.peerDependencies]) {
      for (const [contract, raw] of Object.entries(isObject(map))) {
        if (typeof raw !== "string") continue
        let provider
        if (raw.startsWith("workspace:")) provider = projects.find((item) => item.id !== consumer.id && item.packageName === contract)
        else if (/^(?:file|link):/.test(raw)) {
          const target = normalize(path.posix.join(path.posix.dirname(descriptor), raw.replace(/^(?:file|link):/, "")))
          provider = ownerFor(projects, target)
        }
        if (provider && provider.id !== consumer.id) dependencies.push({ consumer: consumer.id, provider: provider.id, contract, evidence: descriptor })
      }
    }
  }

  const sourceFiles = files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())).length
  const moduleCount = projects.reduce((sum, project) => sum + project.modules.length, 0)
  const scale = sourceFiles >= 10000 || projects.length >= 50 || moduleCount >= 300 ? "very-large"
    : sourceFiles >= 3000 || projects.length >= 20 || moduleCount >= 100 ? "large" : "standard"

  const inventory = {
    schemaVersion: 3,
    generatedBy: "bootstrap_projectspec.mjs",
    root: ".",
    selectedRevision: revision,
    workspaceMode: projects.length > 1 ? "multi-project" : "single-project",
    scale,
    exclusions: [...EXCLUDES],
    stats: { projectCount: projects.length, moduleCount, sourceFiles },
    topology: {
      repoManifest: files.includes(".repo/manifest.xml") ? ".repo/manifest.xml" : null,
      gitmodules: files.includes(".gitmodules") ? ".gitmodules" : null,
      linkedRoots: [...linkedRoots].sort(),
      workspaceRoots: [...workspaceRoots].sort(),
    },
    projects,
    dependencies: uniqueBy(dependencies, (item) => JSON.stringify(item)),
    descriptorEvidence: descriptors,
    hierarchyPolicy: "deterministic-candidates; verify/correct with HomeGraph plus build ownership before semantic generation",
  }

  const multiple = projects.length > 1
  const documents = []
  const capabilityCandidates = []

  addDocument(documents, "index.md", "index", "workspace", "mandatory repository analysis-derived navigation")

  const plannedProjects = projects.map((project) => {
    const base = outputBase(project, multiple)
    addDocument(documents, documentPath(base, "architecture.md"), "project-architecture", project.id, "mandatory Project architecture")
    addDocument(documents, documentPath(base, "business.md"), "project-business", project.id, "mandatory Project business")
    addDocument(documents, documentPath(base, "constraints-and-limitations.md"), "constraints-and-limitations", project.id, "mandatory Project architectural contract")

    const slugs = moduleOutputSlugs(project.modules)
    const modules = project.modules.map((module) => {
      const moduleSlug = slugs.get(module.id)
      const architectureDocument = documentPath(base, `modules/${moduleSlug}/architecture.md`)
      addDocument(documents, architectureDocument, "module-architecture", module.id, "mandatory V1 module architecture")

      const surfaces = module.declaredSurfaces || { abilities: [], pages: [], permissions: [] }
      for (const ability of surfaces.abilities) {
        capabilityCandidates.push({
          id: slug(`${project.id}-${ability.name}`), kind: ability.type, name: ability.name, entry: ability.srcEntry,
          project: project.id, module: module.id, evidence: module.descriptor,
        })
      }
      for (const page of surfaces.pages) {
        capabilityCandidates.push({
          id: slug(`${project.id}-${page}`), kind: "page-profile", name: page,
          project: project.id, module: module.id, evidence: module.descriptor,
        })
      }

      return {
        id: module.id,
        name: module.name,
        path: module.path,
        kind: module.kind,
        outputSlug: moduleSlug,
        architectureDocument,
        businessRole: "pending",
        businessDetail: "pending",
        businessOwnerDocument: null,
        businessRationale: [],
        analysisDepth: "pending",
        analysisPriorityHint: analysisPriorityHint(module),
        candidateSignals: {
          sourceFiles: module.sourceFiles,
          ...module.signals,
          declaredAbilities: surfaces.abilities.length,
          declaredPages: surfaces.pages.length,
          declaredPermissions: surfaces.permissions.length,
        },
      }
    })

    const analysisSlug = slug(base || project.outputSlug || project.name || project.id)
    return {
      id: project.id,
      name: project.name,
      path: project.path,
      kind: project.kind,
      subsystem: project.subsystem,
      base,
      boundaryStatus: "candidate-needs-homegraph-verification",
      analysisDocument: `.projectspec/analysis/${analysisSlug}.json`,
      architectureDocument: documentPath(base, "architecture.md"),
      businessDocument: documentPath(base, "business.md"),
      governanceDocument: documentPath(base, "constraints-and-limitations.md"),
      modules,
    }
  })

  const plan = {
    schemaVersion: 5,
    generatedBy: "bootstrap_projectspec.mjs",
    phase: "structural-candidates",
    requiresHomeGraphVerification: true,
    requiresSemanticEnrichment: true,
    selectedRevision: revision,
    workspaceMode: inventory.workspaceMode,
    indexDocument: "index.md",
    repositoryIntelligenceDocument: ".projectspec/repository-intelligence.json",
    documents,
    projects: plannedProjects,
    capabilityCandidates,
    capabilities: [],
    excludedCapabilityCandidates: [],
    crossProjectEdges: inventory.dependencies,
    semanticEnrichmentContract: {
      maxHierarchyCorrectionsPasses: 1,
      required: [
        "verify/correct deterministic Project/module candidates with repository-wide HomeGraph plus build ownership evidence",
        "classify every module as behavior-owner, supporting-behavior, or architecture-only",
        "classify business detail as standalone, project-grouped, or none",
        "add module Business documents only for standalone semantic owners",
        "ensure Project Business absorbs project-grouped behavior",
        "assign each module analysisDepth focused/standard/deep from significance plus HomeGraph evidence",
        "perform just-in-time module analysis immediately before writing each module",
        "require at least two distinct HomeGraph passes for deep modules",
        "trace representative UX/domain/data flows including meaningful observed states/branches",
        "perform repository-wide reference implementation search for important modules",
        "record state/data/integration/conditional-section and Mermaid decisions in Project analysis JSON",
        "populate one Project governance registry with scoped ARC/CHK/LIM entries",
        "build index.md from repository intelligence plus Project analysis JSON after all Projects",
      ],
    },
  }

  const metadataRoot = path.join(outputRoot, ".projectspec")
  await fs.mkdir(metadataRoot, { recursive: true })
  for (const [name, value] of [["workspace-inventory.json", inventory], ["documentation-plan.json", plan]]) {
    const destination = path.join(metadataRoot, name)
    const temporary = `${destination}.tmp`
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    await fs.rename(temporary, destination)
  }

  console.log(JSON.stringify({
    inventory: normalize(path.relative(root, path.join(metadataRoot, "workspace-inventory.json"))),
    plan: normalize(path.relative(root, path.join(metadataRoot, "documentation-plan.json"))),
    workspaceMode: inventory.workspaceMode,
    scale,
    projectCandidates: projects.length,
    modules: moduleCount,
    capabilityCandidates: capabilityCandidates.length,
  }))
}

main().catch((error) => {
  console.error(`ProjectSpec bootstrap failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
