#!/usr/bin/env node

import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const EXCLUDES = new Set([".git", ".homegraph", ".deveco", ".idea", ".vscode", ".repo", "node_modules", "oh_modules", "dist", "build", "out", "coverage", "generated", "vendor"])
const SOURCE_EXTENSIONS = new Set([".ets", ".ts", ".tsx", ".js", ".jsx", ".c", ".cc", ".cpp", ".h", ".hpp", ".java", ".kt", ".py", ".rs", ".go", ".swift", ".dart", ".rb", ".php", ".cs"])
const DESCRIPTORS = new Set([".gitmodules", "manifest.xml", "build-profile.json5", "module.json5", "app.json5", "oh-package.json5", "oh-package-lock.json5", "bundle.json", "subsystem_config.json", "BUILD.gn", "package.json", "pnpm-workspace.yaml", "Cargo.toml", "go.mod", "pom.xml", "settings.gradle", "settings.gradle.kts"])

const args = process.argv.slice(2)
if (!args[0] || args.includes("--help")) {
  console.log("Usage: bootstrap_projectspec.mjs <repository-root> [--output-root docs] [--revision HEAD] [--scan-level deep|quick|exhaustive|adaptive]")
  process.exit(args[0] ? 0 : 2)
}

function option(name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const root = path.resolve(args[0])
const outputRoot = path.resolve(root, option("--output-root", "docs"))
const revision = option("--revision", "HEAD")
const scanLevel = option("--scan-level", "deep")
if (!["quick", "deep", "exhaustive", "adaptive"].includes(scanLevel)) throw new Error(`Unsupported scan level: ${scanLevel}`)

const normalize = (value) => String(value).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "") || "."
const slug = (value) => String(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "root"
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : []
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {}

function stripJson5(text) {
  return text
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => JSON.stringify(value.replaceAll("\\'", "'")))
    .replace(/,\s*([}\]])/g, "$1")
}

async function readJson5(relative) {
  try { return object(JSON.parse(stripJson5(await fs.readFile(path.join(root, relative), "utf8")))) } catch { return {} }
}

async function readJson5Absolute(absolute) {
  try { return object(JSON.parse(stripJson5(await fs.readFile(absolute, "utf8")))) } catch { return {} }
}

async function walk(directory, files) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDES.has(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(absolute, files)
    else if (entry.isFile()) files.push(normalize(path.relative(root, absolute)))
  }
}

function ownerFor(projects, relative) {
  return projects.filter((item) => item.path === "." || relative === item.path || relative.startsWith(`${item.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]
}

function moduleFor(project, relative) {
  return project.modules.filter((item) => item.path === "." || relative === item.path || relative.startsWith(`${item.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]
}

function workspacePatterns(data) {
  const workspaces = data.workspaces
  if (Array.isArray(workspaces)) return workspaces.filter((item) => typeof item === "string")
  return strings(object(workspaces).packages)
}

function workspaceExpression(pattern) {
  return new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("[^/]+")}/(?:oh-package|package)\\.json5?$`)
}

function sourceCount(files, base) {
  const prefix = base === "." ? "" : `${base}/`
  return files.filter((file) => file.startsWith(prefix) && SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())).length
}

function signals(files, modulePath) {
  const prefix = modulePath === "." ? "" : `${modulePath}/`
  const owned = files.filter((file) => file.startsWith(prefix))
  const text = owned.join("\n").toLowerCase()
  return {
    ets: owned.some((file) => file.endsWith(".ets")),
    uxCandidate: /(^|\/)(pages?|views?|components?|widgets?)(\/|$)/.test(text),
    stateCandidate: /(^|\/)(state|stores?|viewmodels?)(\/|$)|viewmodel|store|state\.(ets|ts)/.test(text),
    domainModelCandidate: /(^|\/)(models?|entities|schemas?)(\/|$)|model\.(ets|ts)/.test(text),
    serviceCandidate: /(^|\/)(services?|usecases?|interactors?)(\/|$)/.test(text),
    repositoryCandidate: /(^|\/)(repositories?|datasources?|persistence)(\/|$)/.test(text),
    native: /(^|\/)(include|src\/main\/cpp)(\/|$)|build\.gn$/.test(text),
    tests: /(^|\/)(test|tests|ohostest)(\/|$)|\.test\.|\.spec\.|_test\./.test(text),
    resources: /(^|\/)resources\//.test(text),
    publicEntry: owned.some((file) => /(^|\/)(index|main|entry)\.(ets|ts|js)$/.test(file)),
  }
}

function declaredSurfaces(data) {
  const abilities = [...(Array.isArray(data.abilities) ? data.abilities : []), ...(Array.isArray(data.extensionAbilities) ? data.extensionAbilities : [])]
    .map((item) => object(item)).map((item) => ({ name: item.name || null, type: item.type || "ability", srcEntry: item.srcEntry || null })).filter((item) => item.name)
  return {
    abilities,
    pages: typeof data.pages === "string" ? [data.pages] : strings(data.pages),
    permissions: (Array.isArray(data.requestPermissions) ? data.requestPermissions : []).map((item) => object(item).name).filter(Boolean),
  }
}

function analysisHint(module) {
  const signal = module.signals
  const strong = [signal.native, signal.stateCandidate, signal.domainModelCandidate, signal.repositoryCandidate, signal.serviceCandidate, module.sourceFiles >= 120, module.declaredSurfaces.abilities.length > 0, module.declaredSurfaces.pages.length > 0].filter(Boolean).length
  if (strong >= 2 || signal.native || module.sourceFiles >= 300 || (signal.repositoryCandidate && module.sourceFiles >= 25)) return "deep"
  if (strong >= 1 || signal.uxCandidate || signal.publicEntry || module.sourceFiles >= 25) return "standard"
  return "focused"
}

function adaptiveDepth(module, project, allProjects) {
  if (module.analysisPriorityHint === "deep" || module.signals.native) return "deep"
  if (allProjects.length > 1 && module.analysisPriorityHint === "focused") return "focused"
  if (project.modules.length > 1 && (module.signals.uxCandidate || module.signals.serviceCandidate)) return "standard"
  return module.analysisPriorityHint
}

function selectedDepth(module, scanLevel, project, allProjects) {
  if (scanLevel === "adaptive") return adaptiveDepth(module, project, allProjects)
  if (scanLevel === "exhaustive") return "deep"
  if (scanLevel === "quick") return module.analysisPriorityHint === "deep" ? "standard" : "focused"
  return module.analysisPriorityHint
}

function ancestorBuildOwns(modulePath, buildRecords) {
  return buildRecords.some((record) => record.path !== modulePath && record.modules.some((module) => {
    const candidate = normalize(path.posix.join(record.path === "." ? "" : record.path, module.srcPath || module.name || ""))
    return candidate !== "." && (modulePath === candidate || modulePath.startsWith(`${candidate}/`))
  }))
}

function descriptorPathFor(relative) {
  return normalize(path.posix.dirname(relative))
}

function localTarget(raw, descriptor, resolvedProjects, packageNames) {
  const value = raw.replace(/^(?:file|link):/, "")
  if (!raw.startsWith("workspace:") && !raw.startsWith("file:") && !raw.startsWith("link:") && !value.startsWith(".")) return null
  if (raw.startsWith("workspace:")) return resolvedProjects.find((item) => item.packageName === packageNames)
  return { path: normalize(path.posix.join(descriptorPathFor(descriptor), value)) }
}

function dependencyKey(item) {
  return [item.consumer, item.consumerModule, item.provider, item.providerModule, item.contract, item.evidence].join("|")
}

async function fileManifest(files) {
  return Promise.all(files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()) || DESCRIPTORS.has(path.posix.basename(file))).map(async (file) => {
    const stat = await fs.stat(path.join(root, file))
    const digest = crypto.createHash("sha1").update(await fs.readFile(path.join(root, file))).digest("hex").slice(0, 12)
    return { path: file, size: stat.size, digest }
  }))
}

function changedModules(previous, inventory) {
  const oldFiles = new Map((previous?.fileManifest || []).map((item) => [item.path, `${item.size}:${item.digest}`]))
  const currentFiles = new Map(inventory.fileManifest.map((item) => [item.path, `${item.size}:${item.digest}`]))
  const changedFiles = [...new Set([...oldFiles.keys(), ...currentFiles.keys()])].filter((file) => oldFiles.get(file) !== currentFiles.get(file))
  if (!previous || previous.selectedRevision !== inventory.selectedRevision) return inventory.projects.flatMap((project) => project.modules.map((module) => module.id))
  return inventory.projects.flatMap((project) => project.modules.filter((module) => changedFiles.some((file) => file === module.path || file.startsWith(`${module.path}/`))).map((module) => module.id))
}

async function main() {
  const files = []
  await walk(root, files)
  if (await fs.stat(path.join(root, ".repo", "manifest.xml")).then(() => true).catch(() => false)) files.push(".repo/manifest.xml")
  files.sort()
  const descriptors = files.filter((file) => DESCRIPTORS.has(path.posix.basename(file)))
  const buildProfiles = descriptors.filter((file) => file.endsWith("build-profile.json5"))
  const buildRecords = await Promise.all(buildProfiles.map(async (file) => {
    const base = descriptorPathFor(file)
    const data = await readJson5(file)
    return { path: base, file, modules: (Array.isArray(data.modules) ? data.modules : []).map((item) => object(item)) }
  }))
  const projectPaths = new Set()
  const linkedRoots = new Set()
  if (files.includes(".gitmodules")) {
    const text = await fs.readFile(path.join(root, ".gitmodules"), "utf8")
    for (const match of text.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)) linkedRoots.add(normalize(match[1]))
  }
  if (files.includes(".repo/manifest.xml")) {
    const text = await fs.readFile(path.join(root, ".repo/manifest.xml"), "utf8")
    for (const match of text.matchAll(/<project\b[^>]*\bpath=["']([^"']+)["']/g)) linkedRoots.add(normalize(match[1]))
  }
  for (const linkedRoot of linkedRoots) projectPaths.add(linkedRoot)
  const workspaceRoots = new Set()
  if (files.includes("package.json")) {
    const packageData = await readJson5("package.json")
    for (const pattern of workspacePatterns(packageData).filter((item) => !item.startsWith("!"))) {
      const expression = workspaceExpression(pattern)
      for (const file of files.filter((item) => expression.test(item))) workspaceRoots.add(normalize(path.posix.dirname(file)))
    }
  }
  for (const workspaceRoot of workspaceRoots) projectPaths.add(workspaceRoot)
  for (const record of buildRecords) if (!ancestorBuildOwns(record.path, buildRecords)) projectPaths.add(record.path)
  for (const descriptor of descriptors.filter((file) => file.endsWith("bundle.json"))) projectPaths.add(descriptorPathFor(descriptor))
  for (const candidate of [...projectPaths]) if (ancestorBuildOwns(candidate, buildRecords) && !linkedRoots.has(candidate)) projectPaths.delete(candidate)
  if (files.includes("package.json") && !projectPaths.size) projectPaths.add(".")
  if (!projectPaths.size) projectPaths.add(".")

  const resolvedProjects = await Promise.all([...projectPaths].sort().map(async (projectPath) => {
    const owned = descriptors.filter((file) => normalize(path.posix.dirname(file)) === projectPath)
    const packageDescriptor = owned.find((file) => /(?:oh-package|package)\.json5?$/.test(file))
    const packageData = packageDescriptor ? await readJson5(packageDescriptor) : {}
    const name = typeof packageData.name === "string" ? packageData.name : projectPath === "." ? path.basename(root) : path.posix.basename(projectPath)
    return { id: projectPath === "." ? "_root" : projectPath, path: projectPath, name, outputSlug: slug(name), kind: owned.some((file) => file.endsWith("build-profile.json5")) ? "arkts-application" : owned.some((file) => file.endsWith("bundle.json")) ? "openharmony-component" : packageDescriptor ? "package" : "other", packageName: typeof packageData.name === "string" ? packageData.name : null, descriptors: owned, modules: [], boundaryStatus: "candidate-needs-homegraph-verification" }
  }))

  for (const record of buildRecords) {
    const project = ownerFor(resolvedProjects, record.path)
    if (!project) continue
    for (const [index, raw] of record.modules.entries()) {
      const name = typeof raw.name === "string" ? raw.name : `module-${index + 1}`
      const modulePath = normalize(path.posix.join(project.path === "." ? "" : project.path, typeof raw.srcPath === "string" ? raw.srcPath : name))
      project.modules.push({ id: `${name}@${modulePath}`, name, path: modulePath, kind: typeof raw.type === "string" ? raw.type : "arkts-module", descriptor: record.file, targets: strings(raw.targets?.map?.((target) => object(target).name)) })
    }
  }
  for (const descriptor of descriptors.filter((file) => file.endsWith("module.json5"))) {
    const descriptorDir = descriptorPathFor(descriptor)
    const project = ownerFor(resolvedProjects, descriptorDir)
    if (!project) continue
    const data = await readJson5(descriptor)
    const moduleData = object(data.module).name ? object(data.module) : data
    const modulePath = normalize(descriptorDir.replace(/\/src\/(?:main|ohosTest|test|tests)$/, ""))
    const existing = project.modules.find((module) => module.path === modulePath || module.path === descriptorDir || descriptorDir.startsWith(`${module.path}/`))
    const target = existing || { id: `${moduleData.name || path.posix.basename(modulePath)}@${modulePath}`, name: moduleData.name || path.posix.basename(modulePath), path: modulePath, kind: moduleData.type || "arkts-module", targets: [] }
    target.descriptor = descriptor
    target.kind = moduleData.type || target.kind
    target.declaredSurfaces = declaredSurfaces(moduleData)
    if (!existing) project.modules.push(target)
  }
  for (const project of resolvedProjects) {
    if (!project.modules.length) project.modules.push({ id: `${project.name}@${project.path}`, name: project.name, path: project.path, kind: "source-root", targets: [], descriptor: project.descriptors[0] || null, declaredSurfaces: { abilities: [], pages: [], permissions: [] } })
    const used = new Map()
    project.modules = project.modules.map((module) => {
      const base = slug(module.name)
      const count = (used.get(base) || 0) + 1
      used.set(base, count)
      const complete = { ...module, outputSlug: count === 1 ? base : `${base}-${slug(module.path)}`, declaredSurfaces: module.declaredSurfaces || { abilities: [], pages: [], permissions: [] }, sourceFiles: sourceCount(files, module.path) }
      complete.signals = signals(files, module.path)
      complete.analysisPriorityHint = analysisHint(complete)
      return complete
    }).sort((a, b) => a.path.localeCompare(b.path))
  }

  const dependencies = []
  const packageDescriptors = descriptors.filter((file) => /(?:oh-package|package)\.json5?$/.test(file))
  const packageNames = new Map()
  for (const descriptor of packageDescriptors) {
    const data = await readJson5(descriptor)
    if (typeof data.name === "string") packageNames.set(descriptorPathFor(descriptor), data.name)
  }
  for (const descriptor of packageDescriptors) {
    const consumer = ownerFor(resolvedProjects, descriptorPathFor(descriptor))
    if (!consumer) continue
    const consumerModule = moduleFor(consumer, descriptorPathFor(descriptor))
    const data = await readJson5(descriptor)
    for (const dependencyMap of [data.dependencies, data.devDependencies, data.peerDependencies]) {
      for (const [contract, raw] of Object.entries(object(dependencyMap))) {
        if (typeof raw !== "string") continue
        const target = localTarget(raw, descriptor, resolvedProjects, contract)
        if (!target) continue
        const provider = target.path ? ownerFor(resolvedProjects, target.path) : target
        if (!provider) continue
        const providerModule = target.path ? moduleFor(provider, target.path) : moduleFor(provider, provider.path)
        if (!providerModule || (provider.id === consumer.id && providerModule.id === consumerModule?.id)) continue
        dependencies.push({ consumer: consumer.id, consumerModule: consumerModule?.id || null, provider: provider.id, providerModule: providerModule.id, contract, evidence: descriptor })
      }
    }
  }
  const uniqueDependencies = dependencies.filter((item, index, all) => all.findIndex((other) => dependencyKey(other) === dependencyKey(item)) === index).sort((a, b) => dependencyKey(a).localeCompare(dependencyKey(b)))
  const manifest = await fileManifest(files)
  const multiple = resolvedProjects.length > 1
  const documents = [{ path: "index.md", kind: "index", scope: "workspace", reason: "mandatory repository router" }]
  const addDocument = (relative, kind, scope, reason) => { if (!documents.some((item) => item.path === relative)) documents.push({ path: relative, kind, scope, reason }) }
  if (multiple) addDocument("constraints-and-limitations.md", "constraints-and-limitations", "workspace", "cross-Project governance only")
  const baseFor = (project) => multiple ? (project.path === "." ? project.outputSlug : project.path) : ""
  const documentPath = (base, relative) => base ? `${base}/${relative}` : relative
  const plannedProjects = resolvedProjects.map((project) => {
    const base = baseFor(project)
    const architectureDocument = documentPath(base, "architecture.md")
    const businessDocument = documentPath(base, "business.md")
    const governanceDocument = documentPath(base, "constraints-and-limitations.md")
    addDocument(architectureDocument, "project-architecture", project.id, "mandatory Project Architecture")
    addDocument(businessDocument, "project-business", project.id, "mandatory Project Business")
    addDocument(governanceDocument, "constraints-and-limitations", project.id, "mandatory Project governance")
    const modules = project.modules.map((module) => {
      const architecture = documentPath(base, `modules/${module.outputSlug}/architecture.md`)
      addDocument(architecture, "module-architecture", module.id, "every physical module receives Architecture")
      const surfaces = module.declaredSurfaces
      const relatedEdges = uniqueDependencies.filter((edge) => edge.consumerModule === module.id || edge.providerModule === module.id)
      const behaviorOwner = surfaces.abilities.length > 0 || surfaces.pages.length > 0 || (module.signals.uxCandidate && module.signals.stateCandidate)
      const supportingBehavior = module.signals.serviceCandidate || module.signals.domainModelCandidate || module.signals.repositoryCandidate
      const role = behaviorOwner ? "behavior-owner" : supportingBehavior ? "supporting-behavior" : "architecture-only"
      const standalone = role === "behavior-owner" || (role === "supporting-behavior" && (module.signals.repositoryCandidate || module.signals.serviceCandidate) && module.sourceFiles >= 25)
      const detail = role === "architecture-only" ? "none" : standalone ? "standalone" : "project-grouped"
      const businessOwnerDocument = standalone ? documentPath(base, `modules/${module.outputSlug}/business.md`) : null
      if (businessOwnerDocument) addDocument(businessOwnerDocument, "module-business", module.id, `${role} standalone Business`)
      return { id: module.id, name: module.name, path: module.path, kind: module.kind, architectureDocument: architecture, businessRole: role, businessDetail: detail, businessOwnerDocument, businessRationale: ["Deterministic role gate from descriptor, source-tree, and declared surface signals"], analysisDepth: selectedDepth(module, scanLevel, project, resolvedProjects), analysisDocument: `.projectspec/analysis/${slug(project.name)}.json`, candidateSignals: { ...module.signals, sourceFiles: module.sourceFiles, declaredAbilities: surfaces.abilities.length, declaredPages: surfaces.pages.length, declaredPermissions: surfaces.permissions.length }, entrySurfaces: [...surfaces.abilities.map((item) => item.name), ...surfaces.pages], dependencies: relatedEdges.filter((edge) => edge.consumerModule === module.id), consumers: relatedEdges.filter((edge) => edge.providerModule === module.id) }
    })
    return { id: project.id, name: project.name, path: project.path, kind: project.kind, packageName: project.packageName, base, boundaryStatus: project.boundaryStatus, analysisDocument: `.projectspec/analysis/${slug(project.name)}.json`, architectureDocument, businessDocument, governanceDocument, modules }
  })
  const inventory = { schemaVersion: 2, generatedBy: "generate-projectspec-hierarchy-balanced/bootstrap_projectspec.mjs", root: ".", selectedRevision: revision, workspaceMode: multiple ? "multi-project" : "single-project", scanLevel, scale: files.length > 10000 ? "large" : "standard", exclusions: [...EXCLUDES], stats: { projectCount: resolvedProjects.length, moduleCount: resolvedProjects.reduce((sum, project) => sum + project.modules.length, 0), sourceFiles: files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())).length }, fileManifest: manifest, topology: { repoManifest: files.includes(".repo/manifest.xml") ? ".repo/manifest.xml" : null, gitmodules: files.includes(".gitmodules") ? ".gitmodules" : null, linkedRoots: [...linkedRoots].sort(), workspaceRoots: [...workspaceRoots].sort() }, projects: resolvedProjects, dependencies: uniqueDependencies, descriptorEvidence: descriptors, hierarchyPolicy: "ancestor build-profile module ownership; freeze after repository-wide HomeGraph and build ownership evidence" }
  const plan = { schemaVersion: 2, generatedBy: "generate-projectspec-hierarchy-balanced/bootstrap_projectspec.mjs", phase: "structural-candidates", requiresHomeGraphVerification: true, requiresSemanticEnrichment: true, selectedRevision: revision, scanLevel, workspaceMode: inventory.workspaceMode, indexDocument: "index.md", repositoryScanDocument: ".projectspec/project-scan-report.json", crossProjectEdges: uniqueDependencies, documents, projects: plannedProjects, oldDeepScan: { mode: "internal-analysis-only", classification: "llm-primary", csvBaseline: "documentation-requirements.csv", merge: "OR", customLlmScans: true, statuses: ["observed", "declared", "inferred", "unavailable", "not inspected", "llm-only", "csv-baseline-only"], conditionalTopics: ["api", "data-models", "state-management", "ui-components", "ux-navigation", "localization", "tests", "build-deployment-ci", "assets", "security-permissions", "async-events"] }, scanStateSchema: ["mode", "scanLevel", "repositoryRevision", "homegraphRevision", "completedSteps", "cachedLLMAnalysis", "mergedCSVBaseline", "currentStep", "outputs", "missingOutputs", "validationStatus", "homegraphCoverageLedger", "fallbackApproval", "changedModules", "impactedAncestors"], semanticEnrichmentContract: { maxBoundaryCorrections: 1, moduleArchitecture: "mandatory for every physical module", businessGate: ["behavior-owner", "supporting-behavior", "architecture-only"], governance: "ARC/LIM only; inline how-to-work and what-to-check; no CHK or Change Checks table", homegraph: "repository-wide status -> files -> anchored explore with explicit fallback approval", index: "last" }, capabilityCandidates: [], capabilities: [], excludedCapabilityCandidates: [] }
  const metadataRoot = path.join(outputRoot, ".projectspec")
  const previousInventory = await readJson5Absolute(path.join(metadataRoot, "workspace-inventory.json"))
  const previousReport = await readJson5Absolute(path.join(metadataRoot, "project-scan-report.json"))
  const changed = changedModules(previousInventory, inventory)
  const priorCompleted = Array.isArray(previousReport.completedSteps) && previousReport.selectedRevision === revision ? previousReport.completedSteps : []
  const scopes = plannedProjects.flatMap((project) => [
    ...project.modules.map((module) => ({ id: module.id, kind: "module", project: project.id, path: module.architectureDocument, documents: [module.architectureDocument, ...(module.businessOwnerDocument ? [module.businessOwnerDocument] : [])], status: "pending" })),
    { id: project.id, kind: "project", path: project.architectureDocument, documents: [project.businessDocument, project.architectureDocument, project.governanceDocument], status: "pending" },
  ])
  const priorScopes = new Map((Array.isArray(previousReport.scopes) ? previousReport.scopes : []).map((scope) => [scope.id, scope]))
  for (const scope of scopes) {
    const prior = priorScopes.get(scope.id)
    if (prior && !changed.includes(scope.id) && prior.status === "complete") Object.assign(scope, prior)
  }
  const scanReport = { schemaVersion: 3, mode: previousReport.mode || "manual-or-goal-step0", scanLevel, repositoryRevision: revision, selectedRevision: revision, homegraphRevision: previousReport.homegraphRevision || "not-exposed", completedSteps: [...new Set(["bootstrap", ...priorCompleted])], cachedLLMAnalysis: previousReport.cachedLLMAnalysis || null, mergedCSVBaseline: previousReport.mergedCSVBaseline || { source: "documentation-requirements.csv", status: "jit-pending" }, currentStep: previousReport.currentStep || "homegraph-readiness", outputs: [".projectspec/workspace-inventory.json", ".projectspec/documentation-plan.json", ".projectspec/evidence-plan.json"], missingOutputs: documents.map((item) => item.path), validationStatus: "pending", scopes, changedScopes: changed, unresolvedGaps: [], completed: false, resume: { reusedCheckpoint: Boolean(previousReport.selectedRevision === revision), changedModules: changed, impactedAncestors: [...new Set(changed.map((id) => id.split("@", 1)[0]))] }, homegraph: previousReport.homegraph || { readiness: "pending", anchors: [], projectModuleCoverage: [], representativeFlows: [], stateDataPersistenceIntegration: [], unresolvedQuestions: [], recoveryAttempts: [], fallbackApproval: null } }
  scanReport.selectedRevision = revision
  const evidencePlan = { schemaVersion: 1, planSchemaVersion: plan.schemaVersion, revision, workspaceMode: inventory.workspaceMode, modules: plannedProjects.flatMap((project) => project.modules.map((module) => ({ moduleId: module.id, projectId: project.id, path: module.path, selectedDepth: module.analysisDepth, adaptivePolicy: "signals-and-scale", activatedTopics: ["ownership", "runtime", ...(module.candidateSignals.stateCandidate ? ["state-management", "data-models"] : []), ...(module.candidateSignals.uxCandidate ? ["ui-components", "ux-navigation"] : []), ...(module.candidateSignals.repositoryCandidate ? ["persistence", "cache-invalidation"] : []), ...(module.candidateSignals.native ? ["platform-boundary"] : []), ...(module.candidateSignals.tests ? ["tests"] : [])], requiredEvidence: ["responsibility", "entry-lifecycle-contract", "dependency-direction", "representative-flow", "state-data", "integration", "extension-blast-radius", "evidence-status"], anchors: [module.path, ...module.entrySurfaces].filter(Boolean), unresolvedQuestions: [] }))), dependencies: uniqueDependencies.map((edge) => ({ consumerModule: edge.consumerModule, providerModule: edge.providerModule, contract: edge.contract, anchor: edge.evidence })) }
  await fs.mkdir(metadataRoot, { recursive: true })
  for (const [name, value] of [["workspace-inventory.json", inventory], ["documentation-plan.json", plan], ["evidence-plan.json", evidencePlan], ["project-scan-report.json", scanReport]]) {
    const destination = path.join(metadataRoot, name)
    await fs.writeFile(`${destination}.tmp`, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    await fs.rename(`${destination}.tmp`, destination)
  }
  console.log(JSON.stringify({ inventory: normalize(path.relative(root, path.join(metadataRoot, "workspace-inventory.json"))), plan: normalize(path.relative(root, path.join(metadataRoot, "documentation-plan.json"))), evidencePlan: normalize(path.relative(root, path.join(metadataRoot, "evidence-plan.json"))), workspaceMode: inventory.workspaceMode, scanLevel, projects: resolvedProjects.length, modules: inventory.stats.moduleCount, changedModules: changed.length }))
}

main().catch((error) => { console.error(`Balanced ProjectSpec bootstrap failed: ${error instanceof Error ? error.message : String(error)}`); process.exit(1) })
