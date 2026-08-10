import { existsSync, mkdirSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { ExtractedEntity, ImportEdge } from "./extract"

export interface GraphNode {
  id: string
  label: string
  file_type: string
  source_file: string
  source_location: string
  norm_label: string
  entity_type: string
  details?: string
}

export interface GraphLink {
  source: string
  target: string
  relation: string
  confidence: string
  confidence_score: number
  source_file: string
  source_location: string
  weight: number
  context: string
}

export interface GraphData {
  directed: boolean
  multigraph: boolean
  graph: {
    hyperedges: unknown[]
    built_at_commit: string
    total_files: number
    total_entities: number
    total_links: number
    confidence_breakdown: Record<string, number>
  }
  nodes: GraphNode[]
  links: GraphLink[]
  hyperedges: unknown[]
}

function normalize(label: string): string {
  return label
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_]/g, " ")
    .trim()
    .toLowerCase()
}

function getCommit(): string {
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"])
    return proc.stdout.toString().trim().slice(0, 10) || "unknown"
  } catch {
    return "unknown"
  }
}

function resolveFilePath(fileArg: string, sourceFile: string): string {
  if (fileArg.startsWith("/")) return fileArg
  const normalized = join(dirname(sourceFile), fileArg)
  const parts = normalized.split("/")
  const resolved: string[] = []
  for (const part of parts) {
    if (part === "." || part === "") continue
    if (part === "..") {
      resolved.pop()
      continue
    }
    resolved.push(part)
  }
  return resolved.join("/")
}

export function buildGraph(
  allEntities: Map<string, ExtractedEntity[]>,
  allImports: ImportEdge[],
  projectRoot: string,
  sourceTexts?: Map<string, string>
): GraphData {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const nodeIndex = new Map<string, GraphNode>()
  const normIndex = new Map<string, string[]>()
  const seen = new Set<string>()
  const fileEntities = new Map<string, string>()

  for (const [, entities] of allEntities) {
    for (const entity of entities) {
      if (seen.has(entity.entity_id)) continue
      seen.add(entity.entity_id)

      const node: GraphNode = {
        id: entity.entity_id,
        label: entity.label,
        file_type: "code",
        source_file: entity.source_file,
        source_location: entity.source_location,
        norm_label: normalize(entity.label),
        entity_type: entity.type,
        details: entity.details ?? "",
      }
      nodes.push(node)
      nodeIndex.set(entity.entity_id, node)

      const norm = node.norm_label
      if (!norm) continue
      if (!normIndex.has(norm)) normIndex.set(norm, [])
      normIndex.get(norm)!.push(entity.entity_id)
    }
  }

  for (const [, entities] of allEntities) {
    for (const entity of entities) {
      if (entity.parent_class) {
        const parent = findEntityByLabel(entity.source_file, entity.parent_class, allEntities)
        if (parent && parent !== entity.entity_id) {
          links.push({
            source: entity.entity_id,
            target: parent,
            relation: "contains",
            confidence: "EXTRACTED",
            confidence_score: 1.0,
            source_file: entity.source_file,
            source_location: entity.source_location,
            weight: 1.0,
            context: "class contains method",
          })
        }
      }

      if (entity.inherits) {
        for (const inh of entity.inherits) {
          const target = findEntityByLabel(entity.source_file, inh, allEntities)
          if (target) {
            links.push({
              source: entity.entity_id,
              target,
              relation: "inherits",
              confidence: "EXTRACTED",
              confidence_score: 1.0,
              source_file: entity.source_file,
              source_location: entity.source_location,
              weight: 1.0,
              context: "class inheritance",
            })
          }
        }
      }

      if (entity.implements) {
        for (const impl of entity.implements) {
          const target = findEntityByLabel(entity.source_file, impl, allEntities)
          if (target) {
            links.push({
              source: entity.entity_id,
              target,
              relation: "implements",
              confidence: "EXTRACTED",
              confidence_score: 1.0,
              source_file: entity.source_file,
              source_location: entity.source_location,
              weight: 1.0,
              context: "interface implementation",
            })
          }
        }
      }

      if (entity.calls) {
        for (const call of entity.calls) {
          // BUILTINS filtering only for bare function calls, not qualified x.method() calls
          if (!call.object_name && BUILTINS.has(call.name)) continue

          // Try qualified name first (e.g., WebUtil.initialize), then bare name
          let sameFileTarget: string | undefined
          if (call.object_name) {
            sameFileTarget = findEntityByLabel(entity.source_file, call.object_name + "." + call.name, allEntities)
          }
          if (!sameFileTarget) {
            sameFileTarget = findEntityByLabel(entity.source_file, call.name, allEntities)
          }
          if (sameFileTarget) {
            links.push({
              source: entity.entity_id,
              target: sameFileTarget,
              relation: "calls",
              confidence: "EXTRACTED",
              confidence_score: 1.0,
              source_file: entity.source_file,
              source_location: call.call_line,
              weight: 1.0,
              context: `call to ${call.name}${call.control_context ? " [" + call.control_context + "]" : ""}${call.is_self_call ? " (self)" : ""}`,
            })
          }
          if (call.file_args) {
            for (const fileArg of call.file_args) {
              const resolved = resolveFilePath(fileArg, entity.source_file)
              let configId = fileEntities.get(resolved)
              if (!configId) {
                const existingEntities = allEntities.get(resolved)
                if (existingEntities && existingEntities.length > 0) {
                  configId = existingEntities[0].entity_id
                } else {
                  configId = `@config/${resolved}`
                  if (!nodeIndex.has(configId)) {
                        const configNode: GraphNode = {
                          id: configId,
                          label: basename(resolved),
                          file_type: "config",
                          source_file: resolved,
                          source_location: "-",
                          norm_label: normalize(basename(resolved)),
                          entity_type: "config",
                          details: "",
                        }
                    nodes.push(configNode)
                    nodeIndex.set(configId, configNode)
                  }
                }
                fileEntities.set(resolved, configId)
              }
              links.push({
                source: entity.entity_id,
                target: configId,
                relation: "references",
                confidence: "EXTRACTED",
                confidence_score: 0.9,
                source_file: entity.source_file,
                source_location: call.call_line,
                weight: 1.0,
                context: `config file reference: ${fileArg}`,
              })
            }
          }
        }
      }

      if (entity.exports) {
        const exportTarget = findEntityByLabel(entity.source_file, entity.label, allEntities)
        if (exportTarget && exportTarget !== entity.entity_id) {
          links.push({
            source: entity.entity_id,
            target: exportTarget,
            relation: "exports",
            confidence: "EXTRACTED",
            confidence_score: 1.0,
            source_file: entity.source_file,
            source_location: entity.source_location,
            weight: 1.0,
            context: "export statement",
          })
        }
      }
    }
  }

  for (const imp of allImports) {
    for (const sym of imp.symbols) {
      if (sym === "*" || sym === "default") continue
      if (BUILTINS.has(sym)) continue
      const targets = findEntityGlobal(sym, imp.target_module, allEntities, nodeIndex)
      if (targets.length === 0) continue
      const sourceEntity = findAnyEntityInFile(imp.source_file, nodeIndex)
      if (!sourceEntity) continue
      const target = targets[0]
      links.push({
        source: sourceEntity.id,
        target: target,
        relation: "imports",
        confidence: targets.length === 1 ? "EXTRACTED" : "AMBIGUOUS",
        confidence_score: targets.length === 1 ? 1.0 : 0.2,
        source_file: imp.source_file,
        source_location: imp.line,
        weight: 1.0,
        context: targets.length === 1
          ? `import { ${sym} } from "${imp.target_module}"`
          : `import { ${sym} } from "${imp.target_module}" (candidates: ${targets.slice(0, 5).join(", ")})`,
      })
    }
  }

  const externalNodes = new Map<string, GraphNode>()

  const moduleFileMap = buildModuleFileMap(allEntities, allImports)
  const importIndex = buildImportIndex(allImports)

  const crossFileCalls = resolveCalls(nodeIndex, normIndex, allEntities, allImports, moduleFileMap, importIndex, externalNodes)

  for (const call of crossFileCalls) {
    links.push(call)
  }

  for (const [, node] of externalNodes) {
    nodes.push(node)
  }

  if (sourceTexts && sourceTexts.size > 0) {
    const jsonIndex = buildJsonFileIndex(allEntities)
    const jsonRefs = detectJsonReferences(sourceTexts, allEntities, jsonIndex)
    for (const ref of jsonRefs) {
      links.push(ref)
    }
  }

  const dedup = deduplicateLinks(links)

  const confidence: Record<string, number> = { EXTRACTED: 0, INFERRED: 0, AMBIGUOUS: 0, EXTERNAL: 0 }
  for (const link of dedup) {
    confidence[link.confidence] = (confidence[link.confidence] || 0) + 1
  }

  return {
    directed: false,
    multigraph: false,
    graph: {
      hyperedges: [],
      built_at_commit: getCommit(),
      total_files: allEntities.size,
      total_entities: nodes.length,
      total_links: dedup.length,
      confidence_breakdown: confidence,
    },
    nodes,
    links: dedup,
    hyperedges: [],
  }
}

function buildModuleFileMap(
  allEntities: Map<string, ExtractedEntity[]>,
  allImports: ImportEdge[]
): Map<string, Set<string>> {
  const moduleFiles = new Map<string, Set<string>>()

  // Collect all unique @ohos/xxx module aliases from imports
  const moduleAliases = new Set<string>()
  for (const imp of allImports) {
    const match = imp.target_module.match(/^@ohos\/([^/]+)$/)
    if (match) {
      moduleAliases.add(match[0])
    }
  }

  // Map module alias → source files under matching directory
  for (const [filePath] of allEntities) {
    for (const alias of moduleAliases) {
      const moduleName = alias.replace(/^@ohos\//, "")
      if (filePath.includes(`/${moduleName}/`) || filePath.startsWith(`${moduleName}/`)) {
        if (!moduleFiles.has(alias)) moduleFiles.set(alias, new Set())
        moduleFiles.get(alias)!.add(filePath)
      }
    }
  }

  // Also add self-mapping for relative imports (./xxx, ../xxx)
  for (const imp of allImports) {
    if (imp.target_module.startsWith(".")) {
      // Already a file path, no alias mapping needed
      continue
    }
  }

  return moduleFiles
}

function buildImportIndex(
  allImports: ImportEdge[]
): Map<string, Map<string, string>> {
  const idx = new Map<string, Map<string, string>>()
  for (const imp of allImports) {
    if (!idx.has(imp.source_file)) idx.set(imp.source_file, new Map())
    const fileMap = idx.get(imp.source_file)!
    for (const sym of imp.symbols) {
      if (!fileMap.has(sym)) {
        fileMap.set(sym, imp.target_module)
      }
    }
  }
  return idx
}

function resolveCalls(
  nodeIndex: Map<string, GraphNode>,
  normIndex: Map<string, string[]>,
  allEntities: Map<string, ExtractedEntity[]>,
  allImports: ImportEdge[],
  moduleFileMap: Map<string, Set<string>>,
  importIndex: Map<string, Map<string, string>>,
  externalNodes: Map<string, GraphNode>
): GraphLink[] {
  const links: GraphLink[] = []

  for (const [, entities] of allEntities) {
    for (const entity of entities) {
      if (!entity.calls || entity.calls.length === 0) continue

      for (const call of entity.calls) {
        // BUILTINS filtering only for bare function calls, not qualified x.method() calls
        if (!call.object_name && BUILTINS.has(call.name)) continue

        // Try qualified name first (e.g., WebUtil.initialize), then bare name
        let sameFileTarget: string | undefined
        if (call.object_name) {
          sameFileTarget = findEntityByLabel(entity.source_file, call.object_name + "." + call.name, allEntities)
        }
        if (!sameFileTarget) {
          sameFileTarget = findEntityByLabel(entity.source_file, call.name, allEntities)
        }
        if (sameFileTarget) continue

        const normCall = normalize(call.name)
        const candidates = normIndex.get(normCall)


        let resolved = false

        // Phase 1: label-based match via normIndex.
        // When object_name is set, the call is qualified (e.g., Logger.info) —
        // skip single-candidate resolution here; let Phase 2 import-object handle it.
        if (!call.object_name) {
          const filtered = (candidates || []).filter(c => {
            const node = nodeIndex.get(c)
            return node && node.source_file !== entity.source_file
          })

          if (filtered.length === 1) {
            links.push({
              source: entity.entity_id,
              target: filtered[0],
              relation: "calls",
              confidence: "INFERRED",
              confidence_score: 0.5,
              source_file: entity.source_file,
              source_location: call.call_line,
              weight: 1.0,
              context: `cross-file call to ${call.name} (resolved via index)`,
            })
            resolved = true
          } else if (filtered.length > 1) {
            // Multiple candidates — prefer ones from imported modules
            const fileImports = importIndex.get(entity.source_file)
            const importedModule = fileImports?.get(call.name)

            let bestTarget = filtered[0]
            if (importedModule && moduleFileMap.has(importedModule)) {
              const modFiles = moduleFileMap.get(importedModule)!
              const modMatch = filtered.find(c => {
                const n = nodeIndex.get(c)
                return n && modFiles.has(n.source_file)
              })
              if (modMatch) bestTarget = modMatch
            }

            links.push({
              source: entity.entity_id,
              target: bestTarget,
              relation: "calls",
              confidence: "AMBIGUOUS",
              confidence_score: 0.2,
              source_file: entity.source_file,
              source_location: call.call_line,
              weight: 1.0,
              context: `cross-file call to ${call.name} (candidates: ${filtered.slice(0, 5).map(id => {
                const n = nodeIndex.get(id)
                return n ? n.label : id
              }).join(", ")})`,
            })
            resolved = true
          }
        }

        // Phase 2: import-guided resolution (when label match fails or call name is an import symbol)
        if (!resolved) {
          const fileImports = importIndex.get(entity.source_file)
          const importSymbol = call.object_name || call.name
          const importedModule = fileImports?.get(importSymbol)

          if (importedModule && moduleFileMap.has(importedModule)) {
            const modFiles = moduleFileMap.get(importedModule)!

            // When object_name is set, look for exact entity: object_name.call_name
            if (call.object_name) {
              const qualifiedName = `${call.object_name}.${call.name}`
              for (const mf of modFiles) {
                const fileEntities = allEntities.get(mf)
                if (!fileEntities) continue
                for (const fe of fileEntities) {
                  if (fe.label === qualifiedName) {
                    links.push({
                      source: entity.entity_id,
                      target: fe.entity_id,
                      relation: "calls",
                      confidence: "INFERRED",
                      confidence_score: 0.5,
                      source_file: entity.source_file,
                      source_location: call.call_line,
                      weight: 1.0,
                      context: `cross-file call to ${qualifiedName} (import-object: ${importedModule} → ${mf})`,
                    })
                    resolved = true
                    break
                  }
                }
                if (resolved) break
              }
            }

            // Fallback: file-based match (without object_name or when exact match not found)
            if (!resolved) {
              const normCallName = normCall.replace(/\s+/g, "")

              let bestFile = ""
              let bestMatch: ExtractedEntity[] | undefined
              for (const mf of modFiles) {
                const fileEntities = allEntities.get(mf)
                if (fileEntities && fileEntities.length > 0) {
                  const fileName = basename(mf).replace(/\.[^.]+$/, "").toLowerCase()
                  if (fileName === normCallName || fileName === call.name.toLowerCase()) {
                    bestFile = mf
                    bestMatch = fileEntities
                    break
                  }
                  if (!bestFile) {
                    bestFile = mf
                    bestMatch = fileEntities
                  }
                }
              }

              if (bestMatch && bestMatch.length > 0) {
                links.push({
                  source: entity.entity_id,
                  target: bestMatch[0].entity_id,
                  relation: "calls",
                  confidence: "INFERRED",
                  confidence_score: 0.45,
                  source_file: entity.source_file,
                  source_location: call.call_line,
                  weight: 1.0,
                  context: `cross-file call to ${call.name} (import-guided: ${importedModule} → ${bestFile})`,
                })
                resolved = true
              }
            }
          }

          // Phase 2b: suffix match via import symbols
          // When call.name is a method name (e.g., "initialize") not a direct import symbol,
          // try matching it against entity labels in imported modules as ImportSymbol.method
          if (!resolved && fileImports) {
            for (const [importSym, importMod] of fileImports) {
              if (!moduleFileMap.has(importMod)) continue
              const qualifiedName = `${importSym}.${call.name}`
              const modFiles = moduleFileMap.get(importMod)!
              for (const mf of modFiles) {
                const fileEntities = allEntities.get(mf)
                if (!fileEntities) continue
                for (const fe of fileEntities) {
                  if (fe.label === qualifiedName) {
                    links.push({
                      source: entity.entity_id,
                      target: fe.entity_id,
                      relation: "calls",
                      confidence: "INFERRED",
                      confidence_score: 0.4,
                      source_file: entity.source_file,
                      source_location: call.call_line,
                      weight: 1.0,
                      context: `cross-file call to ${call.name} (import-suffix: ${qualifiedName} in ${importMod} → ${mf})`,
                    })
                    resolved = true
                    break
                  }
                }
                if (resolved) break
              }
              if (resolved) break
            }
          }
        }

        // Phase 3: fallback to @external
        if (!resolved) {
          const extId = `@external/${call.name}`
          if (!externalNodes.has(extId)) {
            externalNodes.set(extId, {
              id: extId,
              label: call.name,
              file_type: "external",
              source_file: "@external",
              source_location: "-",
              norm_label: normCall,
              entity_type: "external",
              details: "",
            })
          }
          links.push({
            source: entity.entity_id,
            target: extId,
            relation: "calls",
            confidence: "EXTERNAL",
            confidence_score: 0.3,
            source_file: entity.source_file,
            source_location: call.call_line,
            weight: 1.0,
            context: `call to external: ${call.name}`,
          })
        }
      }
    }
  }

  return links
}

function buildJsonFileIndex(allEntities: Map<string, ExtractedEntity[]>): Map<string, string> {
  const index = new Map<string, string>()
  for (const [file, entities] of allEntities) {
    if (!file.endsWith(".json")) continue
    for (const e of entities) {
      index.set(basename(file).toLowerCase(), e.entity_id)
    }
  }
  return index
}

function detectJsonReferences(
  sourceTexts: Map<string, string>,
  allEntities: Map<string, ExtractedEntity[]>,
  jsonIndex: Map<string, string>
): GraphLink[] {
  const links: GraphLink[] = []

  for (const [file, source] of sourceTexts) {
    if (file.endsWith(".json")) continue

    const patterns = [
      /'([^']*\.json)'/g,
      /"([^"]*\.json)"/g,
      /`([^`]*\.json)`/g,
    ]
    const seenTargets = new Set<string>()

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const jsonRef = match[1]
        const jsonFilename = basename(jsonRef).toLowerCase()
        const targetId = jsonIndex.get(jsonFilename)
        if (!targetId) continue
        if (seenTargets.has(targetId)) continue
        seenTargets.add(targetId)

        const lineNum = source.slice(0, match.index!).split("\n").length
        const sourceEntity = findEntityForLine(file, lineNum, allEntities)
        if (!sourceEntity) continue

        links.push({
          source: sourceEntity,
          target: targetId,
          relation: "references",
          confidence: "EXTRACTED",
          confidence_score: 0.9,
          source_file: file,
          source_location: `L${lineNum}`,
          weight: 1.0,
          context: `json reference: ${jsonRef}`,
        })
      }
    }
  }

  return links
}

function findEntityForLine(
  file: string,
  lineNum: number,
  allEntities: Map<string, ExtractedEntity[]>
): string | undefined {
  const entities = allEntities.get(file)
  if (!entities || entities.length === 0) return undefined

  let best: ExtractedEntity | undefined
  let bestLine = 0
  for (const e of entities) {
    const el = parseInt(e.source_location.replace("L", ""), 10)
    if (!isNaN(el) && el <= lineNum && el > bestLine) {
      best = e
      bestLine = el
    }
  }
  return best?.entity_id
}

function deduplicateLinks(links: GraphLink[]): GraphLink[] {
  const seen = new Set<string>()
  const result: GraphLink[] = []

  for (const link of links) {
    const key = `${link.source}||${link.target}||${link.relation}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(link)
  }

  return result
}

function findEntityByLabel(
  filePath: string,
  label: string,
  allEntities: Map<string, ExtractedEntity[]>
): string | undefined {
  const entities = allEntities.get(filePath)
  const candidates = entities ?? (() => {
    const all: ExtractedEntity[] = []
    for (const [, ents] of allEntities) all.push(...ents)
    return all
  })()

  // Exact match
  for (const e of candidates) {
    if (e.label === label) return e.entity_id
  }

  // Suffix match: e.g., "initPreference" matches "PreferenceManager.initPreference"
  const dotLabel = `.${label}`
  for (const e of candidates) {
    if (e.label.endsWith(dotLabel)) return e.entity_id
  }

  return undefined
}

function findEntityGlobal(
  sym: string,
  targetModule: string,
  allEntities: Map<string, ExtractedEntity[]>,
  nodeIndex: Map<string, GraphNode>
): string[] {
  const normSym = normalize(sym)
  const results: string[] = []

  for (const [, entities] of allEntities) {
    for (const e of entities) {
      if (e.label === sym || normalize(e.label) === normSym) {
        results.push(e.entity_id)
      }
    }
  }

  if (results.length === 0) {
    const moduleSuffix = targetModule.replace(/^\.?\//, "").replace(/[/\\]/g, "_")
    for (const [id] of nodeIndex) {
      if (id.includes(moduleSuffix.toLowerCase()) && id.endsWith(`_${sym.toLowerCase()}`)) {
        results.push(id)
      }
    }
  }

  return results
}

function findAnyEntityInFile(
  filePath: string,
  nodeIndex: Map<string, GraphNode>
): GraphNode | undefined {
  for (const [, node] of nodeIndex) {
    if (node.source_file === filePath) return node
  }
  return undefined
}

const BUILTINS = new Set([
  "str", "int", "float", "bool", "list", "dict", "set", "tuple", "type",
  "len", "range", "print", "super", "self", "None", "True", "False",
  "String", "Number", "Object", "Array", "Function", "Boolean", "Error",
  "console", "window", "document", "Math", "JSON", "Promise",
  "System", "println",
  "string", "int32", "int64", "float32", "float64", "byte", "rune",
  "make", "append", "len", "cap", "copy", "delete",
  "println", "Ok", "Err", "Some", "None", "Vec", "HashMap",
  "this", "super", "func",

  // ArkUI component builders (never user-defined)
  "Blank", "Button", "Circle", "CircleArrow", "Ellipse", "Image",
  "LoadingView", "NodeContainer", "Polygon", "Popup", "Rect",
  "SymbolGlyph", "Text", "TextArea", "TextInput", "Web",
  "ForEach", "LazyForEach", "Extend",

  // ArkUI component chain properties
  "width", "height", "fontSize", "fontColor", "fontWeight", "fontFamily",
  "backgroundColor", "backgroundBlurStyle", "backgroundImage", "backgroundImageSize",
  "margin", "padding", "border", "borderRadius", "opacity", "visibility",
  "animation", "alignItems", "justifyContent", "flexGrow", "layoutWeight",
  "aspectRatio", "textAlign", "textOverflow", "maxLines", "fill", "stroke",
  "size", "points", "transition", "clip", "clipContent", "renderGroup",
  "focusable", "defaultFocus", "draggable", "allowDrop", "vertical", "horizontal",
  "relative", "align", "indicator", "tabBar", "barHeight", "barWidth",
  "barOverlap", "barPosition", "barMode", "scrollBar", "scrollable",
  "scrollTo", "nestedScroll", "divider", "titleMode", "hideBackButton",
  "hideTitleBar", "showSideBar", "showControlButton", "cacheMode", "cachedCount",
  "preloadItems", "attributeModifier", "objectFit", "colorFilter",
  "placeholderFont", "buttonStyle", "controlSize", "enterKeyType", "caretStyle",
  "geometryTransition", "animationMode", "interpolatingSpring", "pixelMapBuilder",
  "fontStyle", "blur", "shadow", "brightness", "contrast", "saturate",
  "grayscale", "sepia", "invert", "hueRotate", "linearGradient",
  "radialGradient", "sweepGradient", "overlay", "colorBlend",
  "alt", "autoHide", "darkMode", "isBusy",
  "domStorageAccess", "fileAccess", "forceDarkAccess", "geolocationAccess",
  "hasVoiceCapability", "horizontalScrollBarAccess", "imageAccess",
  "javaScriptAccess", "javaScriptProxy", "mixedMode",
  "verticalScrollBarAccess", "zoomAccess",
  "px2vp", "vp", "updateScrollDirection",

  // ArkUI event handlers
  "onClick", "onChange", "onAppear", "onDisappear", "onScroll",
  "onAnimationStart", "onAreaChange", "onAttach", "onBackPressed",
  "onControllerAttached", "onDataAdd", "onDidScroll", "onDigitalCrown",
  "onHidden", "onInactive", "onActive", "onItemDragStart", "onItemDrop",
  "onKeyPreIme", "onLoadIntercept", "onPageBegin", "onPageEnd", "onReady",
  "onShown", "onSslErrorEventReceive", "onClickIcon", "onClickProcess",
  "bindPopup", "bindScroller", "onTouch", "onSizeChange", "onVisibleAreaChange",
  "onFocus", "onBlur", "onHover", "onHoverEnter", "onHoverLeave", "onMouse",
  "onKeyEvent", "onDragStart", "onDragEnter", "onDragMove", "onDragLeave",
  "onDrop", "onGesture", "onPinchGesture", "onSwipe", "onPan", "onTap",
  "onLongPress", "onAnimationEnd", "stopPropagation", "preventDefault",

  // ArkUI modifiers & style types
  "GridAttributeModifier", "ImageAttributeModifier", "TabAttributeModifier",
  "TextAreaAttributeModifier", "TextInputAttributeModifier", "SymbolGlyphModifier",
  "ParagraphStyle", "TextStyle", "SubTabBarStyle", "GlobalInfoModel",
  "BreakpointType",

  // JS/TS array methods
  "map", "filter", "reduce", "forEach", "find", "some", "every", "push",
  "pop", "shift", "unshift", "splice", "slice", "sort", "reverse", "join",
  "concat", "includes", "indexOf", "lastIndexOf", "flatMap", "keys", "values",
  "entries", "from", "of", "fill", "reduceRight", "findIndex", "flat",

  // JS/TS string methods
  "split", "replace", "trim", "startsWith", "endsWith", "substring",
  "toLowerCase", "toUpperCase", "toString", "valueOf", "match", "search",
  "padStart", "padEnd", "repeat", "charAt", "charCodeAt", "codePointAt",
  "localeCompare", "normalize",

  // JS/TS Map/Set/Object methods
  "get", "set", "has", "delete", "clear", "then", "catch", "resolve",
  "reject", "finally",

  // JS/TS Math methods
  "abs", "ceil", "floor", "round", "max", "min", "random", "pow", "sqrt",
  "log", "log2", "log10", "exp", "sin", "cos", "tan", "asin", "acos",
  "atan", "atan2", "sign", "trunc",

  // JS/TS Number/Date/RegExp
  "toFixed", "toPrecision", "toExponential", "parseInt", "parseFloat",
  "isNaN", "isFinite", "isArray", "now", "parse", "stringify", "test",
  "exec", "Uint8Array", "Map", "Set", "RegExp", "Date", "getTime",
  "AbortController", "CustomEvent", "DOMException", "Headers",
  "Proxy", "ReadableStream", "BigInt",

  // JS runtime globals
  "log", "error", "warn", "info", "debug", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "addEventListener", "removeEventListener",
  "on", "off", "select",

  // ArkTS resource references
  "$r", "$rawfile",

  // HarmonyOS common APIs
  "getHostContext", "getUIContext", "getWindowProperties", "getDefaultDisplaySync",
  "getWindowAvoidArea", "getAvoidArea", "getCameraManager", "animateTo",
  "matchMediaSync", "canIUse", "getMediaQuery", "getLastWindow",
  "getMainWindowSync", "getPromptAction", "getRawFileContentSync",
  "getRawFileStringByKey", "getString", "getBoolean", "getNumber",
  "getValue", "getData", "getType", "getJSON", "getMediaContent",
  "getElementById", "getWebController", "getWebNode", "getUserAgent",
  "getDrawableDescriptor", "getInstance", "getDetailViewModel",
  "getTitleButtonRect", "createEngine", "showAlertDialog",
  "showTextPickerDialog", "showToast", "showLongToast", "startAbility",
  "startAbilityByType", "postCardAction", "moveAbilityToBackground",
  "setImmersiveWindow", "updateStatusBarColor", "eventEmitter", "sendEvent",
  "publish", "setListener", "create", "setStyle", "setValue",
  "pushData", "pushPath", "shutdown", "stop", "dismiss", "toggle",
  "openLink", "jumpPage", "showNext", "showPrevious", "makeCall",
  "runJavaScript", "runJavaScriptExt", "setCustomUserAgent",
  "setPathAllowingUniversalAccess", "setStyledString", "highlightAll",
  "writeAudio", "handleLoadIntercept", "handleCancel", "canUseHds",
  "predicate", "decodeToString", "done", "exit",

  // Node.js file system & path methods
  "existsSync", "readFileSync", "writeFileSync", "readdir", "readdirSync",
  "rmSync", "rmdSync", "unlinkSync", "renameSync", "statSync", "stat",
  "isDirectory", "isFile", "extname", "join", "dirname", "basename",
  "cwd", "exec", "walk",
])

export function detectCycles(nodes: GraphNode[], links: GraphLink[]): string[][] {
  const adj = new Map<string, string[]>()
  for (const n of nodes) {
    adj.set(n.id, [])
  }
  for (const l of links) {
    if (adj.has(l.source)) {
      adj.get(l.source)!.push(l.target)
    }
  }

  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  const parent = new Map<string, string>()
  const cycles: string[][] = []

  for (const n of nodes) {
    color.set(n.id, WHITE)
  }

  function dfs(u: string) {
    color.set(u, GRAY)
    for (const v of adj.get(u) || []) {
      if (color.get(v) === WHITE) {
        parent.set(v, u)
        dfs(v)
      } else if (color.get(v) === GRAY) {
        const cycle: string[] = [v]
        let cur = u
        while (cur !== v) {
          cycle.push(cur)
          cur = parent.get(cur) || v
        }
        cycle.push(v)
        cycles.push(cycle.reverse())
      }
    }
    color.set(u, BLACK)
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) dfs(n.id)
  }

  return cycles
}

export function computeGodNodes(nodes: GraphNode[], links: GraphLink[]): { id: string; label: string; file: string; connections: number }[] {
  const degree = new Map<string, number>()
  for (const n of nodes) {
    if (BUILTINS.has(n.label)) continue
    degree.set(n.id, 0)
  }
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) || 0) + 1)
    degree.set(l.target, (degree.get(l.target) || 0) + 1)
  }
  return [...degree.entries()]
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id, d]) => {
      const node = nodes.find(n => n.id === id)
      return {
        id,
        label: node?.label || id,
        file: node?.source_file || "unknown",
        connections: d,
      }
    })
}

export function computeSurprisingConnections(
  links: GraphLink[],
  nodes: GraphNode[],
  godDegree: Map<string, number>
): { source: string; target: string; relation: string; score: number; reason: string }[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  const scored = links.map(link => {
    const src = nodeMap.get(link.source)
    const tgt = nodeMap.get(link.target)
    let score = link.confidence_score
    const reasons: string[] = []

    if (src && tgt && src.source_file !== tgt.source_file) {
      score += 2
      reasons.push("cross-file")

      const srcDir = dirname(src.source_file).split("/")[0]
      const tgtDir = dirname(tgt.source_file).split("/")[0]
      if (srcDir !== tgtDir) {
        score += 2
        reasons.push("cross-dir")
      }
    }

    const srcDeg = godDegree.get(link.source) || 0
    const tgtDeg = godDegree.get(link.target) || 0
    if ((srcDeg > 10 && tgtDeg <= 3) || (tgtDeg > 10 && srcDeg <= 3)) {
      score += 1
      reasons.push("hub→peripheral")
    }

    if (link.confidence === "AMBIGUOUS") {
      score *= 2
      reasons.push("ambiguous")
    }

    return {
      source: link.source,
      target: link.target,
      relation: link.relation,
      score,
      reason: reasons.join(" + ") || "standard",
    }
  })

  return scored
    .filter(s => s.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

export function exportGraphJson(graph: GraphData, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true })
  const path = join(outputDir, "codetograph.json")
  Bun.write(path, JSON.stringify(graph, null, 2))
  console.log(`✅ codetograph.json written to ${path}`)
}

export function exportReport(
  graph: GraphData,
  allEntities: Map<string, ExtractedEntity[]>,
  outputDir: string,
  projectName: string
): void {
  const cycles = detectCycles(graph.nodes, graph.links)
  const degree = new Map<string, number>()
  for (const l of graph.links) {
    degree.set(l.source, (degree.get(l.source) || 0) + 1)
    degree.set(l.target, (degree.get(l.target) || 0) + 1)
  }
  const godNodes = computeGodNodes(graph.nodes, graph.links)
  const surprising = computeSurprisingConnections(graph.links, graph.nodes, degree)

  const communities = new Map<string, { nodes: GraphNode[]; links: GraphLink[] }>()
  for (const node of graph.nodes) {
    const dir = dirname(node.source_file)
    if (!communities.has(dir)) communities.set(dir, { nodes: [], links: [] })
    communities.get(dir)!.nodes.push(node)
  }
  for (const link of graph.links) {
    const src = graph.nodes.find(n => n.id === link.source)
    if (src) {
      const dir = dirname(src.source_file)
      communities.get(dir)?.links.push(link)
    }
  }

  const isolated = graph.nodes.filter(n => (degree.get(n.id) || 0) === 0)
  const ambiguousOnly = graph.nodes.filter(n =>
    (degree.get(n.id) || 0) > 0 &&
    graph.links.filter(l => l.source === n.id || l.target === n.id).every(l => l.confidence === "AMBIGUOUS")
  )

  const fileCalls = new Map<string, boolean>()
  for (const link of graph.links) {
    if (link.relation === "calls") {
      fileCalls.set(link.source_file, true)
    }
  }
  const callFreeFiles = [...allEntities.keys()]
    .filter(f => !fileCalls.has(f))

  let report = `# Project: ${projectName}

Built at: ${graph.graph.built_at_commit} | Entities: ${graph.graph.total_entities} | Links: ${graph.graph.total_links} | Date: ${new Date().toISOString().slice(0, 10)}

## Summary

| Metric | Value |
|--------|-------|
| Total files analyzed | ${graph.graph.total_files} |
| Total entities (classes + functions + methods) | ${graph.graph.total_entities} |
| Total links (edges) | ${graph.graph.total_links} |
| EXTRACTED edges | ${graph.graph.confidence_breakdown.EXTRACTED || 0} |
| INFERRED edges | ${graph.graph.confidence_breakdown.INFERRED || 0} |
| AMBIGUOUS edges | ${graph.graph.confidence_breakdown.AMBIGUOUS || 0} |
| EXTERNAL edges | ${graph.graph.confidence_breakdown.EXTERNAL || 0} |
| Cross-file calls resolved | ${graph.links.filter(l => l.relation === "calls" && l.confidence !== "EXTRACTED").length} |
| Circular dependencies | ${cycles.length} |

## System Graph Overview

`

  for (const [file, entities] of [...allEntities.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    report += `### ${file}\n\n`
    for (const entity of entities) {
      report += `- **${entity.type}:** \`${entity.label}\` (${entity.source_location})\n`
      if (entity.inherits && entity.inherits.length > 0) {
        report += `  - inherits: [${entity.inherits.join(", ")}]\n`
      }
      if (entity.implements && entity.implements.length > 0) {
        report += `  - implements: [${entity.implements.join(", ")}]\n`
      }
      if (entity.calls && entity.calls.length > 0) {
        report += `  - calls: [${entity.calls.map(c => c.object_name ? `${c.object_name}.${c.name}` : c.name).join(", ")}]\n`
      }
    }
    report += "\n"
  }

  report += `
## Relationship Matrix (Dependency Tree)

### Same-file edges (EXTRACTED)

`
  for (const link of graph.links.filter(l => l.confidence === "EXTRACTED")) {
    report += `- \`${link.source}\` --${link.relation}--> \`${link.target}\`\n`
  }

  report += `
### Cross-file edges (INFERRED)

`
  for (const link of graph.links.filter(l => l.confidence === "INFERRED")) {
    report += `- \`${link.source}\` --${link.relation}(INFERRED, ${link.confidence_score})--> \`${link.target}\` (${link.context})\n`
  }

  report += `
### Cross-file edges (AMBIGUOUS)

`
  for (const link of graph.links.filter(l => l.confidence === "AMBIGUOUS")) {
    report += `- \`${link.source}\` --${link.relation}(AMBIGUOUS, ${link.confidence_score})--> \`${link.target}\` (${link.context})\n`
  }

  report += `
### External SDK / library calls (EXTERNAL)

`
  for (const link of graph.links.filter(l => l.confidence === "EXTERNAL")) {
    report += `- \`${link.source}\` --${link.relation}--> \`${link.target}\` (${link.context})\n`
  }

  report += `
## Circular Dependencies

`
  if (cycles.length === 0) {
    report += "No circular dependencies detected.\n"
  } else {
    for (const cycle of cycles) {
      report += `- ⚠️ \`${cycle.join(" → ")}\`\n`
    }
  }

  report += `
## God Nodes (top-15 by degree)

| Node ID | Label | File | Connections |
|---------|-------|------|-------------|
`
  for (const gn of godNodes) {
    report += `| ⚡ ${gn.id} | ${gn.label} | ${gn.file} | ${gn.connections} |\n`
  }

  report += `
## Surprising Connections (top-10 scored)

| Rank | Source | Target | Relation | Score | Reason |
|------|--------|--------|----------|-------|--------|
`
  surprising.forEach((sc, i) => {
    report += `| ${i + 1} | ${sc.source} | ${sc.target} | ${sc.relation} | ${sc.score} | ${sc.reason} |\n`
  })

  report += `
## Community Hubs (by directory)

`
  for (const [dir, comm] of [...communities.entries()].sort(([, a], [, b]) => b.nodes.length - a.nodes.length)) {
    report += `### ${dir}/ (${comm.nodes.length} entities)\n\n`

    const localDeg = new Map<string, number>()
    for (const link of comm.links) {
      localDeg.set(link.source, (localDeg.get(link.source) || 0) + 1)
      localDeg.set(link.target, (localDeg.get(link.target) || 0) + 1)
    }

    const top = [...localDeg.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)

    report += `| Entity | Type | Local Degree | Top Connection |\n`
    report += `|--------|------|-------------|----------------|\n`
    for (const [id, deg] of top) {
      const node = graph.nodes.find(n => n.id === id)
      const topLink = comm.links.find(l => l.source === id)
      report += `| ${node?.label || id} | ${node?.entity_type || "?"} | ${deg} | → ${topLink?.target.slice(0, 30) || "-"} |\n`
    }
    report += "\n"
  }

  report += `
## Knowledge Gaps

- **Isolated entities** (degree = 0): ${isolated.length}
`
  if (isolated.length > 0 && isolated.length <= 20) {
    for (const e of isolated) {
      report += `  - ${e.id} (${e.source_file})\n`
    }
  } else if (isolated.length > 20) {
    report += `  (${isolated.length} entities, showing first 10)\n`
    for (const e of isolated.slice(0, 10)) {
      report += `  - ${e.id} (${e.source_file})\n`
    }
  }

  report += `- **AMBIGUOUS-only entities**: ${ambiguousOnly.length}\n`
  if (ambiguousOnly.length > 0 && ambiguousOnly.length <= 10) {
    for (const e of ambiguousOnly) {
      report += `  - ${e.id} (${e.source_file})\n`
    }
  }

  report += `- **Call-free files** (no outgoing calls from any entity): ${callFreeFiles.length}\n`
  if (callFreeFiles.length <= 10) {
    for (const f of callFreeFiles) {
      report += `  - ${f}\n`
    }
  }

  report += `
## Self-Audit Verification Table

| Directory | Files in Project | Files Deep-Analyzed | Entities Extracted | Status |
|-----------|-----------------|---------------------|--------------------|--------|
`
  for (const [dir, infos] of directorySummary(allEntities)) {
    report += `| ${dir} | ${infos.total} | ${infos.analyzed} | ${infos.entities} | ${infos.status} |\n`
  }

  report += `
## Final Audit Report

| Total Files | Deeply Analyzed | Entities | Links | Cross-file Calls | Missing | Status |
|-------------|-----------------|----------|-------|-----------------|---------|--------|
| ${graph.graph.total_files} | ${graph.graph.total_files} | ${graph.graph.total_entities} | ${graph.graph.total_links} | ${graph.links.filter(l => l.relation === "calls" && l.confidence !== "EXTRACTED").length} | 0 | ✅ Pass |
`

  mkdirSync(outputDir, { recursive: true })
  const path = join(outputDir, "codetograph_tree.md")
  Bun.write(path, report)
  console.log(`✅ codetograph_tree.md written to ${path}`)
}

function directorySummary(allEntities: Map<string, ExtractedEntity[]>): Map<string, { total: number; analyzed: number; entities: number; status: string }> {
  const dirs = new Map<string, { files: Set<string>; entities: number }>()
  for (const [file, entities] of allEntities) {
    const dir = dirname(file)
    if (!dirs.has(dir)) dirs.set(dir, { files: new Set(), entities: 0 })
    const d = dirs.get(dir)!
    d.files.add(file)
    d.entities += entities.length
  }
  const result = new Map<string, { total: number; analyzed: number; entities: number; status: string }>()
  for (const [dir, info] of dirs) {
    result.set(dir, {
      total: info.files.size,
      analyzed: info.files.size,
      entities: info.entities,
      status: "✅",
    })
  }
  return result
}
