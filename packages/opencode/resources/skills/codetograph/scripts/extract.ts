import { Parser, SyntaxNode } from "web-tree-sitter"
import { basename, dirname } from "node:path"

export interface CallSite {
  name: string
  call_line: string
  control_context?: string
  is_self_call: boolean
  file_args?: string[]
  object_name?: string
}

export interface ExtractedEntity {
  entity_id: string
  label: string
  type: "class" | "function" | "method" | "interface" | "enum" | "struct" | "constant" | "type_alias"
  source_file: string
  source_location: string
  parent_class?: string
  inherits?: string[]
  implements?: string[]
  params?: string[]
  returns?: string
  calls: CallSite[]
  exports: boolean
  details?: string
}

export interface ExtractedFile {
  path: string
  language: string
  entities: ExtractedEntity[]
  imports: ImportEdge[]
  export_symbols: string[]
}

export interface ImportEdge {
  source_file: string
  target_module: string
  symbols: string[]
  line: string
}

function makeId(filePath: string, name: string): string {
  const parent = basename(dirname(filePath))
  const file = basename(filePath).replace(/\.[^.]+$/, "")
  return `${parent}_${file}_${name}`
    .replace(/[./\\-]/g, "_")
    .toLowerCase()
}

function lineOf(node: SyntaxNode): string {
  return `L${node.startPosition.row + 1}`
}

export function extractEntities(
  tree: SyntaxNode,
  filePath: string,
  lang: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  switch (lang) {
    case "typescript":
    case "tsx":
    case "arkts":
      return extractTypeScript(tree, filePath, source)
    case "javascript":
      return extractJavaScript(tree, filePath, source)
    case "python":
      return extractPython(tree, filePath, source)
    case "go":
      return extractGo(tree, filePath, source)
    case "rust":
      return extractRust(tree, filePath, source)
    case "java":
      return extractJava(tree, filePath, source)
    case "cpp":
    case "c":
      return extractCpp(tree, filePath, source)
    case "csharp":
      return extractCSharp(tree, filePath, source)
    case "kotlin":
      return extractKotlin(tree, filePath, source)
    case "swift":
      return extractSwift(tree, filePath, source)
    case "json":
      return extractJson(tree, filePath)
    default:
      return { entities: [], imports: [] }
  }
}

function extractTypeScript(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const entities: ExtractedEntity[] = []
  const imports: ImportEdge[] = []

  const clsName = (node: SyntaxNode): string => {
    const nameNode = node.childForFieldName?.("name") || node.descendantsOfType("type_identifier")[0]
    return nameNode?.text || "anonymous"
  }

  const walk = (node: SyntaxNode, parentClass?: string) => {
    for (const child of node.namedChildren) {
      const t = child.type

      if (t === "class_declaration" || t === "abstract_class_declaration") {
        const name = clsName(child)
        const id = makeId(filePath, name)
        const inhNode = child.descendantsOfType("class_heritage")
        const inherits: string[] = []
        const implementations: string[] = []
        for (const hn of inhNode) {
          for (const hc of hn.namedChildren) {
            if (hc.type === "extends_clause") {
              const val = firstIdentifier(hc)
              if (val) inherits.push(val)
            }
            if (hc.type === "implements_clause") {
              for (const ii of hc.namedChildren) {
                const val = firstIdentifier(ii)
                if (val) implementations.push(val)
              }
            }
          }
        }
        entities.push({
          entity_id: id,
          label: name,
          type: "class",
          source_file: filePath,
          source_location: lineOf(child),
          inherits: inherits.length ? inherits : undefined,
          implements: implementations.length ? implementations : undefined,
          calls: [],
          exports: false,
        })
        walk(child, name)
        continue
      }

      if (t === "interface_declaration") {
        const name = clsName(child)
        entities.push({
          entity_id: makeId(filePath, name),
          label: name,
          type: "interface",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
        continue
      }

      if (t === "enum_declaration") {
        const name = clsName(child)
        entities.push({
          entity_id: makeId(filePath, name),
          label: name,
          type: "enum",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
        continue
      }

      if (t === "type_alias_declaration") {
        const nameNode = child.childForFieldName?.("name")
        if (nameNode) {
          entities.push({
            entity_id: makeId(filePath, nameNode.text),
            label: nameNode.text,
            type: "type_alias",
            source_file: filePath,
            source_location: lineOf(child),
            calls: [],
            exports: false,
          })
        }
        continue
      }

      if (t === "function_declaration" || t === "generator_function_declaration") {
        const nameNode = child.childForFieldName?.("name")
        if (nameNode) {
          const name = nameNode.text
          const params = extractParams(child, source)
          const returnType = extractReturnType(child, source)
          const calls = extractCallsTS(child, source, parentClass)
          entities.push({
            entity_id: makeId(filePath, name),
            label: name,
            type: parentClass ? "method" : "function",
            source_file: filePath,
            source_location: lineOf(child),
            parent_class: parentClass,
            params,
            returns: returnType,
            calls,
            exports: false,
          })
        }
        continue
      }

      if (t === "method_definition") {
        const nameNode = child.childForFieldName?.("name")
        if (nameNode) {
          const name = nameNode.text
          const params = extractParams(child, source)
          const returnType = extractReturnType(child, source)
          const calls = extractCallsTS(child, source, parentClass)
          entities.push({
            entity_id: makeId(filePath, parentClass ? `${parentClass}_${name}` : name),
            label: parentClass ? `${parentClass}.${name}` : name,
            type: "method",
            source_file: filePath,
            source_location: lineOf(child),
            parent_class: parentClass,
            params,
            returns: returnType,
            calls,
            exports: false,
          })
        }
        continue
      }

      if (t === "arrow_function") {
        const parent = child.parent
        if (parent && parent.type === "variable_declarator") {
          const nameNode = parent.childForFieldName?.("name")
          if (nameNode && nameNode.type === "identifier") {
            const name = nameNode.text
            const calls = extractCallsTS(child, source, parentClass)
            entities.push({
              entity_id: makeId(filePath, name),
              label: name,
              type: "function",
              source_file: filePath,
              source_location: lineOf(parent),
              calls,
              exports: false,
            })
          }
        }
        continue
      }

      if (t === "import_statement") {
        const sourceNode = child.childForFieldName?.("source")
        if (sourceNode) {
          const symbols = child.descendantsOfType("import_specifier")
            .map((s: SyntaxNode) => {
              const alias = s.childForFieldName?.("alias")
              return alias?.text || s.childForFieldName?.("name")?.text || s.text
            })
            .filter(Boolean)
          const defaultSpec = child.childForFieldName?.("name")
          if (defaultSpec && defaultSpec.type !== "import") {
            symbols.unshift(defaultSpec.text)
          }
          if (symbols.length === 0) {
            const bare = child.namedChildren
              .filter((c: SyntaxNode) => c.type === "identifier")
              .map((c: SyntaxNode) => c.text)
            symbols.push(...bare)
          }
          imports.push({
            source_file: filePath,
            target_module: sourceNode.text.replace(/['"]/g, ""),
            symbols,
            line: lineOf(child),
          })
        }
        continue
      }

      if (t === "export_statement") {
        // Recurse into export_statement first to extract entities inside
        // (export default class X, export class X, export function X, etc.)
        // Without this, classes wrapped in export_statement are invisible to the graph.
        walk(child, parentClass)
        // Now mark extracted entities as exported
        for (const ec of child.namedChildren) {
          if (ec.type === "function_declaration") {
            const nameNode = ec.childForFieldName?.("name")
            if (nameNode) {
              const existing = findEntity(entities, nameNode.text, filePath)
              if (existing) existing.exports = true
            }
          }
          if (ec.type === "class_declaration" || ec.type === "abstract_class_declaration") {
            const n = clsName(ec)
            const existing = findEntity(entities, n, filePath)
            if (existing) existing.exports = true
          }
        }
        continue
      }

      if (t === "variable_declaration") {
        for (const decl of child.namedChildren) {
          if (decl.type !== "variable_declarator") continue
          const nameNode = decl.childForFieldName?.("name")
          if (!nameNode || !["identifier", "type_identifier"].includes(nameNode.type)) continue
          const value = decl.childForFieldName?.("value")
          if (value && value.type === "arrow_function") {
            const calls = extractCallsTS(value, source, parentClass)
            let found = findEntity(entities, nameNode.text, filePath)
            if (!found) {
              found = {
                entity_id: makeId(filePath, nameNode.text),
                label: nameNode.text,
                type: "function",
                source_file: filePath,
                source_location: lineOf(child),
                calls,
                exports: false,
              }
              entities.push(found)
            } else {
              found.calls = [...found.calls, ...calls]
            }
          }
        }
        continue
      }

      walk(child, parentClass)
    }
  }

  walk(tree)
  return { entities, imports }
}

function extractJavaScript(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const result = extractTypeScript(tree, filePath, source)
  return {
    entities: result.entities.filter(e => e.type !== "interface" && e.type !== "enum" && e.type !== "type_alias"),
    imports: result.imports,
  }
}

function extractPython(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const entities: ExtractedEntity[] = []
  const imports: ImportEdge[] = []

  const walk = (node: SyntaxNode, parentClass?: string) => {
    for (const child of node.namedChildren) {
      if (child.type === "class_definition") {
        const nameNode = child.childForFieldName?.("name")
        if (nameNode) {
          const name = nameNode.text
          const sup = child.childForFieldName?.("superclasses")
          const inherits = sup ? sup.namedChildren.map(c => c.text) : []
          entities.push({
            entity_id: makeId(filePath, name),
            label: name,
            type: "class",
            source_file: filePath,
            source_location: lineOf(child),
            inherits: inherits.length ? inherits : undefined,
            calls: [],
            exports: false,
          })
          walk(child, name)
        }
        continue
      }

      if (child.type === "function_definition") {
        const nameNode = child.childForFieldName?.("name")
        if (nameNode) {
          const name = nameNode.text
          const params = extractParams(child, source)
          const returns = extractReturnType(child, source)
          const calls = extractCallsPython(child, source, parentClass)
          entities.push({
            entity_id: makeId(filePath, name),
            label: name,
            type: parentClass ? "method" : "function",
            source_file: filePath,
            source_location: lineOf(child),
            parent_class: parentClass,
            params,
            returns,
            calls,
            exports: false,
          })
        }
        continue
      }

      if (child.type === "import_statement" || child.type === "import_from_statement") {
        const mod = child.type === "import_from_statement"
          ? child.childForFieldName?.("module_name")?.text || ""
          : child.namedChildren.filter(c => c.type === "dotted_name").map(c => c.text).join(".")
        const syms = child.namedChildren
          .filter(c => c.type === "dotted_name" || c.type === "aliased_import")
          .map(c => c.type === "aliased_import" ? c.namedChildren[0]?.text : c.text)
          .filter(Boolean)
        if (mod || syms.length) {
          imports.push({
            source_file: filePath,
            target_module: mod || ".",
            symbols: syms.length ? syms : ["*"],
            line: lineOf(child),
          })
        }
        continue
      }

      walk(child, parentClass)
    }
  }

  walk(tree)
  return { entities, imports }
}

function extractGo(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const entities: ExtractedEntity[] = []
  const imports: ImportEdge[] = []

  for (const child of tree.namedChildren) {
    if (child.type === "function_declaration") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        const params = extractParams(child, source)
        const returns = extractReturnType(child, source)
        const calls = extractCallsGeneric(child, source, "call_expression")
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "function",
          source_file: filePath,
          source_location: lineOf(child),
          params,
          returns,
          calls,
          exports: false,
        })
      }
      continue
    }

    if (child.type === "method_declaration") {
      const nameNode = child.childForFieldName?.("name")
      const recv = child.childForFieldName?.("receiver")
      if (nameNode) {
        const calls = extractCallsGeneric(child, source, "call_expression")
        const recvName = recv?.namedChildren[0]?.type === "parameter_declaration"
          ? recv.namedChildren[0].childForFieldName?.("type")?.text
          : undefined
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: recvName ? `${recvName}.${nameNode.text}` : nameNode.text,
          type: "method",
          source_file: filePath,
          source_location: lineOf(child),
          parent_class: recvName,
          calls,
          exports: false,
        })
      }
      continue
    }

    if (child.type === "type_declaration") {
      for (const spec of child.namedChildren) {
        if (spec.type !== "type_spec") continue
        const nameNode = spec.childForFieldName?.("name")
        if (!nameNode) continue
        const typeNode = spec.childForFieldName?.("type")
        const kind = typeNode?.type === "interface_type" ? "interface" : typeNode?.type === "struct_type" ? "struct" : "class"
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: kind,
          source_file: filePath,
          source_location: lineOf(spec),
          calls: [],
          exports: false,
        })
      }
      continue
    }

    if (child.type === "import_declaration") {
      for (const spec of child.namedChildren) {
        if (spec.type !== "import_spec") continue
        const pathNode = spec.childForFieldName?.("path")
        if (pathNode) {
          imports.push({
            source_file: filePath,
            target_module: pathNode.text.replace(/["]/g, ""),
            symbols: ["*"],
            line: lineOf(child),
          })
        }
      }
      continue
    }
  }

  return { entities, imports }
}

function extractRust(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const entities: ExtractedEntity[] = []
  const imports: ImportEdge[] = []

  for (const child of tree.namedChildren) {
    if (child.type === "function_item") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        const calls = extractCallsGeneric(child, source, "call_expression")
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "function",
          source_file: filePath,
          source_location: lineOf(child),
          calls,
          exports: child.text.startsWith("pub "),
        })
      }
      continue
    }

    if (child.type === "struct_item") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "struct",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: child.text.startsWith("pub "),
        })
      }
      continue
    }

    if (child.type === "enum_item") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "enum",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: child.text.startsWith("pub "),
        })
      }
      continue
    }

    if (child.type === "trait_item") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "interface",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: child.text.startsWith("pub "),
        })
      }
      continue
    }

    if (child.type === "impl_item") {
      for (const ic of child.namedChildren) {
        if (ic.type === "function_item") {
          const nameNode = ic.childForFieldName?.("name")
          if (nameNode) {
            const calls = extractCallsGeneric(ic, source, "call_expression")
            const typeNode = child.childForFieldName?.("type")
            entities.push({
              entity_id: makeId(filePath, nameNode.text),
              label: nameNode.text,
              type: "method",
              source_file: filePath,
              source_location: lineOf(ic),
              parent_class: typeNode?.text,
              calls,
              exports: ic.text.startsWith("pub "),
            })
          }
        }
      }
      continue
    }

    if (child.type === "use_declaration") {
      imports.push({
        source_file: filePath,
        target_module: child.text.replace(/^use\s+/i, "").replace(/;$/, ""),
        symbols: ["*"],
        line: lineOf(child),
      })
      continue
    }
  }

  return { entities, imports }
}

function extractJava(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const entities: ExtractedEntity[] = []
  const imports: ImportEdge[] = []

  for (const child of tree.namedChildren) {
    if (child.type === "class_declaration") {

      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        const sup = child.childForFieldName?.("superclass")
        const ifaces = child.childForFieldName?.("interfaces")
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "class",
          source_file: filePath,
          source_location: lineOf(child),
          inherits: sup ? [sup.text] : undefined,
          implements: ifaces ? ifaces.namedChildren.map(c => c.text) : undefined,
          calls: [],
          exports: false,
        })
        for (const body of child.namedChildren) {
          if (body.type !== "class_body") continue
          for (const member of body.namedChildren) {
            if (member.type === "method_declaration") {
              const mn = member.childForFieldName?.("name")
              if (mn) {
                const calls = extractCallsJava(member, source, nameNode.text)
                entities.push({
                  entity_id: makeId(filePath, `${nameNode.text}_${mn.text}`),
                  label: `${nameNode.text}.${mn.text}`,
                  type: "method",
                  source_file: filePath,
                  source_location: lineOf(member),
                  parent_class: nameNode.text,
                  calls,
                  exports: false,
                })
              }
            }
          }
        }
      }
      continue
    }

    if (child.type === "interface_declaration") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "interface",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
      }
      continue
    }

    if (child.type === "enum_declaration") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "enum",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
      }
      continue
    }

    if (child.type === "import_declaration") {
      imports.push({
        source_file: filePath,
        target_module: child.text.replace(/^import\s+/i, "").replace(/;$/, ""),
        symbols: ["*"],
        line: lineOf(child),
      })
      continue
    }
  }

  return { entities, imports }
}

function extractCpp(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const entities: ExtractedEntity[] = []
  const imports: ImportEdge[] = []

  for (const child of tree.namedChildren) {
    if (child.type === "function_definition") {
      const decl = child.childForFieldName?.("declarator")
      if (decl) {
        const name = findCppName(decl)
        const calls = extractCallsGeneric(child, source, "call_expression")
        entities.push({
          entity_id: makeId(filePath, name),
          label: name,
          type: "function",
          source_file: filePath,
          source_location: lineOf(child),
          calls,
          exports: false,
        })
      }
      continue
    }

    if (child.type === "class_specifier") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "class",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
      }
      continue
    }

    if (child.type === "struct_specifier") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "struct",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
      }
      continue
    }

    if (child.type === "preproc_include") {
      const path = child.namedChildren
        .filter(c => c.type === "string_literal" || c.type === "system_lib_string")
        .map(c => c.text.replace(/["<>]/g, ""))
        .join("")
      if (path) {
        imports.push({
          source_file: filePath,
          target_module: path,
          symbols: ["*"],
          line: lineOf(child),
        })
      }
      continue
    }
  }

  return { entities, imports }
}

function extractCSharp(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const entities: ExtractedEntity[] = []
  const imports: ImportEdge[] = []

  for (const child of tree.namedChildren) {
    if (child.type === "class_declaration" || child.type === "struct_declaration" || child.type === "interface_declaration") {

      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        const kind = child.type === "class_declaration" ? "class"
          : child.type === "struct_declaration" ? "struct"
          : "interface"
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: kind,
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
        for (const member of child.namedChildren) {
          if (member.type === "method_declaration") {
            const mn = member.childForFieldName?.("name")
            if (mn) {
              const calls = extractCallsCSharp(member, source, nameNode.text)
              entities.push({
                entity_id: makeId(filePath, `${nameNode.text}_${mn.text}`),
                label: `${nameNode.text}.${mn.text}`,
                type: "method",
                source_file: filePath,
                source_location: lineOf(member),
                parent_class: nameNode.text,
                calls,
                exports: false,
              })
            }
          }
        }
      }
      continue
    }

    if (child.type === "using_directive") {
      imports.push({
        source_file: filePath,
        target_module: child.namedChildren.map(c => c.text).join("."),
        symbols: ["*"],
        line: lineOf(child),
      })
      continue
    }
  }

  return { entities, imports }
}

function extractKotlin(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const entities: ExtractedEntity[] = []
  const imports: ImportEdge[] = []

  for (const child of tree.namedChildren) {
    if (child.type === "class_declaration" || child.type === "object_declaration") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        const name = nameNode.text
        entities.push({
          entity_id: makeId(filePath, name),
          label: name,
          type: "class",
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
        for (const member of child.namedChildren) {
          if (member.type !== "class_body") continue
          for (const m of member.namedChildren) {
            if (m.type === "function_declaration") {
              const mn = m.childForFieldName?.("name")
              if (mn) {
                const calls = extractCallsTS(m, source, name)
                entities.push({
                  entity_id: makeId(filePath, `${name}_${mn.text}`),
                  label: `${name}.${mn.text}`,
                  type: "method",
                  source_file: filePath,
                  source_location: lineOf(m),
                  parent_class: name,
                  calls,
                  exports: false,
                })
              }
            }
          }
        }
      }
      continue
    }

    if (child.type === "function_declaration") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        const calls = extractCallsTS(child, source)
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "function",
          source_file: filePath,
          source_location: lineOf(child),
          calls,
          exports: false,
        })
      }
      continue
    }

    if (child.type === "package_header" || child.type === "import_header") {
      for (const header of child.namedChildren) {
        imports.push({
          source_file: filePath,
          target_module: header.text.startsWith("import ") ? header.text.replace(/^import\s+/, "").trim() : header.text,
          symbols: ["*"],
          line: lineOf(child),
        })
      }
    }
  }

  return { entities, imports }
}

function extractSwift(
  tree: SyntaxNode,
  filePath: string,
  source: string
): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const entities: ExtractedEntity[] = []
  const imports: ImportEdge[] = []

  for (const child of tree.namedChildren) {
    if (child.type === "class_declaration" || child.type === "struct_declaration") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        const name = nameNode.text
        const kind = child.type === "class_declaration" ? "class" : "struct"
        entities.push({
          entity_id: makeId(filePath, name),
          label: name,
          type: kind,
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
        for (const member of child.namedChildren) {
          if (member.type !== "declarations") {
            if (member.type === "function_declaration") {
              const mn = member.childForFieldName?.("name")
              if (mn) {
                const calls = extractCallsGeneric(member, source, "call_expression")
                entities.push({
                  entity_id: makeId(filePath, `${name}_${mn.text}`),
                  label: `${name}.${mn.text}`,
                  type: "method",
                  source_file: filePath,
                  source_location: lineOf(member),
                  parent_class: name,
                  calls,
                  exports: false,
                })
              }
            }
            continue
          }
          for (const decl of member.namedChildren) {
            if (decl.type === "function_declaration") {
              const mn = decl.childForFieldName?.("name")
              if (mn) {
                const calls = extractCallsGeneric(decl, source, "call_expression")
                entities.push({
                  entity_id: makeId(filePath, `${name}_${mn.text}`),
                  label: `${name}.${mn.text}`,
                  type: "method",
                  source_file: filePath,
                  source_location: lineOf(decl),
                  parent_class: name,
                  calls,
                  exports: false,
                })
              }
            }
          }
        }
      }
      continue
    }

    if (child.type === "enum_declaration" || child.type === "protocol_declaration") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        const kind = child.type === "enum_declaration" ? "enum" : "interface"
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: kind,
          source_file: filePath,
          source_location: lineOf(child),
          calls: [],
          exports: false,
        })
      }
      continue
    }

    if (child.type === "function_declaration") {
      const nameNode = child.childForFieldName?.("name")
      if (nameNode) {
        const calls = extractCallsGeneric(child, source, "call_expression")
        entities.push({
          entity_id: makeId(filePath, nameNode.text),
          label: nameNode.text,
          type: "function",
          source_file: filePath,
          source_location: lineOf(child),
          calls,
          exports: false,
        })
      }
      continue
    }

    if (child.type === "import_declaration") {
      imports.push({
        source_file: filePath,
        target_module: child.text.replace(/^import\s+/i, "").replace(/\n/g, ""),
        symbols: ["*"],
        line: lineOf(child),
      })
      continue
    }
  }

  return { entities, imports }
}

function extractJson(_tree: SyntaxNode, filePath: string): { entities: ExtractedEntity[]; imports: ImportEdge[] } {
  const name = basename(filePath)
  return {
    entities: [{
      entity_id: makeId(filePath, name),
      label: name,
      type: "constant",
      source_file: filePath,
      source_location: "-",
      calls: [],
      exports: false,
    }],
    imports: [],
  }
}

function extractParams(node: SyntaxNode, source: string): string[] | undefined {
  const paramsNode = node.childForFieldName?.("parameters")
  if (!paramsNode) return undefined
  const params = paramsNode.descendantsOfType("identifier")
    .filter(p => p.parent?.type === "required_parameter" || p.parent?.type === "optional_parameter" || p.parent?.type === "rest_parameter" || p.parent?.type === "parameter")
    .map(p => p.text)
  return params.length ? params : undefined
}

function extractReturnType(node: SyntaxNode, source: string): string | undefined {
  const ret = node.childForFieldName?.("return_type") || node.childForFieldName?.("result")
  return ret?.text
}

function isAncestor(ancestor: SyntaxNode, descendant: SyntaxNode): boolean {
  let n: SyntaxNode | null = descendant
  while (n) {
    if (n.id === ancestor.id) return true
    n = n.parent
  }
  return false
}

function resolveControlContext(
  callNode: SyntaxNode,
  rootNode: SyntaxNode,
  lang: string
): string | undefined {
  const CONTROL = new Set([
    "if_statement", "switch_statement", "switch_expression", "switch_block",
    "for_statement", "for_in_statement", "for_range_loop", "for_each_statement",
    "enhanced_for_statement", "while_statement", "do_statement", "repeat_while_statement",
    "try_statement", "catch_clause", "except_clause", "with_statement", "match_statement",
    "if_expression", "match_expression", "loop_expression",
  ])

  let p: SyntaxNode | null = callNode.parent
  while (p && p.id !== rootNode.id) {
    if (p.type === "if_statement" || p.type === "if_expression") {
      const cons = p.childForFieldName?.("consequence")
      const alt = p.childForFieldName?.("alternative")
      if (cons && isAncestor(cons, callNode)) return "if"
      if (alt && isAncestor(alt, callNode)) return "else"
      return undefined
    }
    if (p.type === "switch_statement" || p.type === "switch_expression" || p.type === "switch_block") {
      return "switch"
    }
    if (["for_statement", "for_in_statement", "for_range_loop", "for_each_statement",
      "enhanced_for_statement", "while_statement", "do_statement", "repeat_while_statement"].includes(p.type)) {
      return "loop"
    }
    if (p.type === "catch_clause" || p.type === "except_clause") return "catch"
    if (p.type === "try_statement") {
      const handler = p.childForFieldName?.("handler")
      const finalizer = p.childForFieldName?.("finalizer")
      if (handler && isAncestor(handler, callNode)) return "catch"
      if (finalizer && isAncestor(finalizer, callNode)) return "finally"
      return "try"
    }
    if (p.type === "with_statement") return "with"
    if (p.type === "match_statement" || p.type === "match_expression") return "match"
    if (p.type === "loop_expression") return "loop"
    p = p.parent
  }
  return undefined
}

function isFilePathString(value: string): boolean {
  return /\.(json|yaml|yml|toml|xml|csv|ini|config|properties|env|sql|graphql|gql|proto|hbs|ejs|njk|pug|jade)$/i.test(value)
}

function extractStringArgPaths(callNode: SyntaxNode): string[] | undefined {
  const args = callNode.childForFieldName?.("arguments")
  if (!args) return undefined
  const paths: string[] = []
  for (const arg of args.namedChildren) {
    if (arg.type === "string") {
      const value = arg.text.replace(/^['"]|['"]$/g, "")
      if (isFilePathString(value)) {
        paths.push(value)
      }
    } else if (arg.type === "template_string") {
      const value = arg.text.replace(/`/g, "").replace(/\$\{[^}]*\}/g, "*")
      if (isFilePathString(value)) {
        paths.push(value)
      }
    }
  }
  return paths.length > 0 ? paths : undefined
}

function extractCallsTS(node: SyntaxNode, source: string, parentClass?: string): CallSite[] {
  const result: CallSite[] = []

  for (const callNode of node.descendantsOfType("call_expression")) {
    const func = callNode.childForFieldName?.("function")
    if (!func) continue

    let name = ""
    let isSelfCall = false

    if (func.type === "identifier") {
      name = func.text
    } else if (func.type === "member_expression") {
      const obj = func.childForFieldName?.("object")
      const objText = obj?.text
      isSelfCall = objText === "this" || objText === "self"
      const prop = func.childForFieldName?.("property")
      if (prop) name = prop.text
    }

    if (!name) continue

    const site: CallSite = {
      name,
      call_line: lineOf(callNode),
      control_context: resolveControlContext(callNode, node, "ts"),
      is_self_call: isSelfCall,
      file_args: extractStringArgPaths(callNode),
    }

    // Preserve object prefix for member_expression calls like WebUtil.initialize()
    if (func.type === "member_expression") {
      const obj = func.childForFieldName?.("object")
      const objText = obj?.text
      if (!isSelfCall && objText) {
        site.object_name = objText
      }
    }

    result.push(site)
  }

  for (const callNode of node.descendantsOfType("new_expression")) {
    const ctor = callNode.childForFieldName?.("constructor")
    if (ctor && ctor.type === "identifier") {
      result.push({
        name: ctor.text,
        call_line: lineOf(callNode),
        control_context: resolveControlContext(callNode, node, "ts"),
        is_self_call: false,
      })
    }
  }

  return result
}

function extractCallsPython(node: SyntaxNode, source: string, parentClass?: string): CallSite[] {
  const result: CallSite[] = []

  for (const callNode of node.descendantsOfType("call")) {
    let name = ""
    let isSelfCall = false

    const firstChild = callNode.firstNamedChild
    if (!firstChild) continue

    if (firstChild.type === "identifier") {
      name = firstChild.text
    } else if (firstChild.type === "attribute") {
      const obj = firstChild.childForFieldName?.("object")
      isSelfCall = obj?.text === "self"
      const objText = obj?.text
      const attr = firstChild.childForFieldName?.("attribute")
      if (attr) name = attr.text
      else name = firstChild.text
    } else {
      name = firstChild.text
    }

    if (!name || name === "None" || name === "True" || name === "False") continue

    const pySite: CallSite = {
      name,
      call_line: lineOf(callNode),
      control_context: resolveControlContext(callNode, node, "python"),
      is_self_call: isSelfCall,
    }
    // Preserve object prefix for x.method() calls
    if (firstChild.type === "attribute") {
      const obj = firstChild.childForFieldName?.("object")
      const objText = obj?.text
      if (!isSelfCall && objText) {
        pySite.object_name = objText
      }
    }
    result.push(pySite)
  }

  return result
}

function extractCallsJava(node: SyntaxNode, source: string, parentClass?: string): CallSite[] {
  const result: CallSite[] = []

  for (const callNode of node.descendantsOfType("method_invocation")) {
    const obj = callNode.childForFieldName?.("object")
    let isSelfCall = false
    if (typeof obj?.text === "string") {
      isSelfCall = obj.text === "this"
    } else if (!obj) {
      isSelfCall = parentClass ? true : false
    }

    const methodName = callNode.childForFieldName?.("name")
    if (!methodName) {
      const ident = callNode.descendantsOfType("identifier")[0]
      if (ident) {
        result.push({
          name: ident.text,
          call_line: lineOf(callNode),
          control_context: resolveControlContext(callNode, node, "java"),
          is_self_call: isSelfCall,
        })
      }
      continue
    }

    let name = ""
    if (methodName.type === "identifier") {
      name = methodName.text
    } else {
      const ident = methodName.descendantsOfType("identifier")[0]
      if (ident) name = ident.text
    }

    if (!name) continue

    const javaSite: CallSite = {
      name,
      call_line: lineOf(callNode),
      control_context: resolveControlContext(callNode, node, "java"),
      is_self_call: isSelfCall,
    }

    // Preserve object prefix for calls like logger.error()
    if (obj && !isSelfCall && typeof obj.text === "string") {
      javaSite.object_name = obj.text
    }

    result.push(javaSite)
  }

  for (const callNode of node.descendantsOfType("object_creation_expression")) {
    const typeNode = callNode.childForFieldName?.("type")
    if (typeNode) {
      const ident = typeNode.descendantsOfType("identifier")[0]
      if (ident) {
        result.push({
          name: ident.text,
          call_line: lineOf(callNode),
          control_context: resolveControlContext(callNode, node, "java"),
          is_self_call: false,
        })
      }
    }
  }

  return result
}

function extractCallsCSharp(node: SyntaxNode, source: string, parentClass?: string): CallSite[] {
  const result: CallSite[] = []

  for (const callNode of node.descendantsOfType("invocation_expression")) {
    const funcNode = callNode.childForFieldName?.("function")
    if (!funcNode) continue

    let name = ""
    let isSelfCall = false

    if (funcNode.type === "identifier") {
      name = funcNode.text
    } else if (funcNode.type === "member_access_expression") {
      const obj = funcNode.childForFieldName?.("expression")
      isSelfCall = obj?.text === "this"
      const memberName = funcNode.childForFieldName?.("name")
      if (memberName) name = memberName.text
    }

    if (!name) continue

    const csharpSite: CallSite = {
      name,
      call_line: lineOf(callNode),
      control_context: resolveControlContext(callNode, node, "csharp"),
      is_self_call: isSelfCall,
    }

    // Preserve object prefix for calls like Console.WriteLine()
    if (funcNode.type === "member_access_expression") {
      const objExpr = funcNode.childForFieldName?.("expression")
      const objText = objExpr?.text
      if (!isSelfCall && objText) {
        csharpSite.object_name = objText
      }
    }

    result.push(csharpSite)
  }

  return result
}

function extractCallsGeneric(node: SyntaxNode, source: string, callType: string, newType?: string): CallSite[] {
  const result: CallSite[] = []

  for (const callNode of node.descendantsOfType(callType)) {
    const func = callNode.childForFieldName?.("function")
    if (func) {
      if (func.type === "identifier") {
        result.push({
          name: func.text,
          call_line: lineOf(callNode),
          is_self_call: false,
        })
      } else if (func.type === "member_expression" || func.type === "selector_expression" || func.type === "field_expression") {
        const obj = func.childForFieldName?.("object")
        const prop = func.childForFieldName?.("property") || func.childForFieldName?.("field")
        if (prop) {
          const site: CallSite = {
            name: prop.text,
            call_line: lineOf(callNode),
            is_self_call: false,
          }
          if (obj?.text) site.object_name = obj.text
          result.push(site)
        }
      }
    }
  }

  if (newType) {
    for (const callNode of node.descendantsOfType(newType)) {
      const ctor = callNode.childForFieldName?.("constructor")
      if (ctor && ctor.type === "identifier") {
        result.push({
          name: ctor.text,
          call_line: lineOf(callNode),
          is_self_call: false,
        })
      }
    }
  }

  return result
}

function callsToCallSites(names: string[], sourceLoc: string): CallSite[] {
  return names.map(n => ({ name: n, call_line: sourceLoc, is_self_call: false }))
}

function firstIdentifier(node: SyntaxNode): string | undefined {
  for (const child of node.namedChildren) {
    if (child.type === "identifier" || child.type === "type_identifier") return child.text
    const nested = firstIdentifier(child)
    if (nested) return nested
  }
}

function findCppName(decl: SyntaxNode): string {
  for (const child of decl.namedChildren) {
    if (child.type === "identifier") return child.text
    if (child.type === "function_declarator" || child.type === "pointer_declarator") {
      const n = findCppName(child)
      if (n) return n
    }
  }
  return "anonymous"
}

function findEntity(entities: ExtractedEntity[], label: string, filePath: string): ExtractedEntity | undefined {
  return entities.find(e => e.label === label && e.source_file === filePath)
}
