import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const NodeSchema = z
  .object({
    id: z.string(),
    label: z.string().nullish(),
    entity_type: z.string().nullish(),
    source_file: z.string().nullish(),
    source_location: z.string().nullish(),
    file_type: z.string().nullish(),
    details: z.unknown().optional(),
  })
  .loose()

const LinkSchema = z
  .object({
    source: z.string(),
    target: z.string(),
    relation: z.string().nullish(),
    confidence: z.string().nullish(),
    context: z.string().nullish(),
    source_location: z.string().nullish(),
  })
  .loose()

const GraphSchema = z
  .object({
    graph: z.record(z.string(), z.unknown()).default({}),
    nodes: z.array(NodeSchema).default([]),
    links: z.array(LinkSchema).default([]),
  })
  .loose()

type Node = z.infer<typeof NodeSchema>
type Link = z.infer<typeof LinkSchema>
type Edge = Record<string, unknown>

const entityColors = {
  class: "#e74c3c",
  struct: "#e74c3c",
  method: "#3498db",
  function: "#2ecc71",
  file: "#9b59b6",
  interface: "#1abc9c",
  enum: "#f39c12",
  variable: "#95a5a6",
  external: "#7f8c8d",
  config: "#e67e22",
}
const defaultColor = "#34495e"

export class Service {
  readonly path: string
  readonly diagramsDir: string
  private data: z.infer<typeof GraphSchema> = { graph: {}, nodes: [], links: [] }
  private nodes = new Map<string, Node>()
  private adjacent = new Map<string, Link[]>()
  private reverseAdjacent = new Map<string, Link[]>()
  private callsBySource = new Map<string, Link[]>()
  private fileState = { mtime: 0, size: 0 }

  constructor(graphPath: string, diagramsDir = "") {
    this.path = graphPath
    this.diagramsDir = diagramsDir || path.join(path.dirname(graphPath), "diagrams")
  }

  async reload() {
    const stat = await fs.stat(this.path).catch(() => undefined)
    if (!stat) return
    if (stat.mtimeMs === this.fileState.mtime && stat.size === this.fileState.size) return
    this.data = GraphSchema.parse(JSON.parse(await fs.readFile(this.path, "utf8")))
    this.fileState = { mtime: stat.mtimeMs, size: stat.size }
    this.nodes = new Map(this.data.nodes.map((node) => [node.id, node]))
    this.adjacent = new Map()
    this.reverseAdjacent = new Map()
    this.callsBySource = new Map()
    this.data.links.forEach((link) => {
      append(this.adjacent, link.source, link)
      append(this.reverseAdjacent, link.target, link)
      if (link.relation === "calls") append(this.callsBySource, link.source, link)
    })
  }

  get available() {
    return this.fileState.size > 0
  }

  search(query: string, limit = 20) {
    return this.findScored(query)
      .slice(0, limit)
      .map(([score, id]) => {
        const node = this.nodes.get(id)!
        return {
          id: node.id,
          label: node.label ?? null,
          type: node.entity_type ?? null,
          file: node.source_file ?? null,
          location: node.source_location ?? null,
          score,
        }
      })
  }

  resolve(label: string) {
    const query = label.toLowerCase().trim()
    const candidates = [...this.nodes.values()]
      .map((node) => {
        const value = (node.label ?? "").toLowerCase()
        const score =
          value === query
            ? 100
            : value.endsWith(`.${query}`)
              ? 90
              : value.includes(query)
                ? 70 - Math.abs(value.length - query.length) * 0.1
                : query.includes(value)
                  ? 50 - Math.abs(query.length - value.length) * 0.1
                  : 0
        return score > 0 ? { ...summary(node), score: round(score) } : undefined
      })
      .filter((item): item is NonNullable<typeof item> => !!item)
      .sort((a, b) => b.score - a.score)
    return {
      query: label,
      matches: candidates.length,
      ...(candidates[0] ? { best_match: candidates[0] } : {}),
      candidates: candidates.slice(0, 10),
      ...(candidates.length > 10 ? { total_candidates: candidates.length } : {}),
    }
  }

  node(id: string) {
    const node = this.nodes.get(id)
    if (!node) return { error: `Node '${id}' not found` }
    return {
      ...summary(node),
      file_type: node.file_type ?? null,
      outgoing_links: this.adjacent.get(id)?.length ?? 0,
      incoming_links: this.reverseAdjacent.get(id)?.length ?? 0,
      calls_made: this.callsBySource.get(id)?.length ?? 0,
    }
  }

  neighbors(id: string, relation = "", confidence = "") {
    const node = this.nodes.get(id)
    if (!node) return { error: `Node '${id}' not found` }
    const accepted = (link: Link) =>
      (!relation || link.relation === relation) && (!confidence || link.confidence === confidence)
    return {
      node: summary(node),
      outgoing: (this.adjacent.get(id) ?? []).filter(accepted).map((link) => ({
        target_id: link.target,
        target_label: this.nodes.get(link.target)?.label ?? link.target,
        target_file: this.nodes.get(link.target)?.source_file ?? "",
        relation: link.relation,
        confidence: link.confidence,
        context: link.context ?? "",
        location: link.source_location ?? "",
      })),
      incoming: (this.reverseAdjacent.get(id) ?? []).filter(accepted).map((link) => ({
        source_id: link.source,
        source_label: this.nodes.get(link.source)?.label ?? link.source,
        source_file: this.nodes.get(link.source)?.source_file ?? "",
        relation: link.relation,
        confidence: link.confidence,
        context: link.context ?? "",
        location: link.source_location ?? "",
      })),
    }
  }

  expand(id: string, hops = 2, relation = "", maxNodes = 50) {
    const node = this.nodes.get(id)
    if (!node) return { error: `Node '${id}' not found` }
    const visited = new Set([id])
    const edges: Edge[] = []
    let frontier = [id]
    for (let hop = 0; hop < hops && frontier.length && visited.size < maxNodes; hop++) {
      const next: string[] = []
      for (const current of frontier) {
        for (const link of [...(this.adjacent.get(current) ?? []), ...(this.reverseAdjacent.get(current) ?? [])]) {
          if (relation && link.relation !== relation) continue
          const forward = link.source === current
          const target = forward ? link.target : link.source
          edges.push(edge(this.nodes, link, forward ? "forward" : "reverse"))
          if (!visited.has(target)) {
            visited.add(target)
            next.push(target)
          }
          if (visited.size >= maxNodes) break
        }
        if (visited.size >= maxNodes) break
      }
      frontier = next
    }
    return {
      seed: summary(node),
      hops,
      total_nodes: visited.size,
      total_edges: edges.length,
      nodes: [...visited].map((nodeId) => summary(this.nodes.get(nodeId)!)),
      edges,
    }
  }

  traceCalls(id: string, maxDepth = 3, maxSteps = 40) {
    const node = this.nodes.get(id)
    if (!node) return { error: `Node '${id}' not found` }
    const steps: Record<string, unknown>[] = []
    const visited = new Set<string>()
    const trace = (current: string, depth: number) => {
      if (depth > maxDepth || visited.has(current)) return
      visited.add(current)
      for (const link of this.callsBySource.get(current) ?? []) {
        const tags = contextTags(link.context ?? "")
        steps.push({
          caller_id: current,
          caller_label: this.nodes.get(current)?.label ?? current,
          callee_id: link.target,
          callee_label: this.nodes.get(link.target)?.label ?? link.target,
          callee_file: this.nodes.get(link.target)?.source_file ?? "",
          relation: "calls",
          confidence: link.confidence ?? "?",
          context_tags: tags,
          location: link.source_location ?? "",
        })
        if (steps.length >= maxSteps) return
        trace(link.target, depth + 1)
      }
    }
    trace(id, 0)
    const participants = new Map<string, string>()
    steps.forEach((step) => {
      participants.set(shortId(String(step.caller_id)), String(step.caller_label))
      participants.set(shortId(String(step.callee_id)), String(step.callee_label))
    })
    const mermaid = [
      "sequenceDiagram",
      ...[...participants].map(([participant, label]) => `    participant ${participant} as ${label}`),
      "",
      ...steps.map((step) => {
        const tags = step.context_tags as string[]
        return `    ${shortId(String(step.caller_id))}->>${shortId(String(step.callee_id))}: ${step.callee_label}() @${step.location} ${tags.length ? `[${tags.join(",")}]` : ""}`
      }),
    ].join("\n")
    return { entry: summary(node), depth: maxDepth, total_steps: steps.length, steps, mermaid }
  }

  reverseTraceCalls(id: string, maxDepth = 3, maxSteps = 40) {
    const node = this.nodes.get(id)
    if (!node) return { error: `Node '${id}' not found` }
    const byTarget = new Map<string, Link[]>()
    ;[...this.callsBySource.values()].flat().forEach((link) => append(byTarget, link.target, link))
    const steps: Record<string, unknown>[] = []
    const visited = new Set<string>()
    const trace = (current: string, depth: number) => {
      if (depth > maxDepth || visited.has(current)) return
      visited.add(current)
      for (const link of byTarget.get(current) ?? []) {
        steps.push({
          caller_id: link.source,
          caller_label: this.nodes.get(link.source)?.label ?? link.source,
          caller_file: this.nodes.get(link.source)?.source_file ?? "",
          callee_id: current,
          callee_label: this.nodes.get(current)?.label ?? current,
          relation: "calls",
          confidence: link.confidence ?? "?",
          context_tags: contextTags(link.context ?? ""),
          location: link.source_location ?? "",
        })
        if (steps.length >= maxSteps) return
        trace(link.source, depth + 1)
      }
    }
    trace(id, 0)
    return { entry: summary(node), depth: maxDepth, total_steps: steps.length, steps }
  }

  findPath(fromId: string, toId: string, maxHops = 6) {
    if (!this.nodes.has(fromId)) return { error: `Source node '${fromId}' not found` }
    if (!this.nodes.has(toId)) return { error: `Target node '${toId}' not found` }
    const queue: Array<[string, Record<string, unknown>[]]> = [[fromId, []]]
    const visited = new Set([fromId])
    while (queue.length) {
      const [current, route] = queue.shift()!
      if (route.length >= maxHops) continue
      for (const link of [...(this.adjacent.get(current) ?? []), ...(this.reverseAdjacent.get(current) ?? [])]) {
        const next = link.source === current ? link.target : link.source
        const nextRoute = [
          ...route,
          {
            from: link.source,
            to: link.target,
            from_label: this.nodes.get(link.source)?.label ?? link.source,
            to_label: this.nodes.get(link.target)?.label ?? link.target,
            relation: link.relation,
            confidence: link.confidence,
            context: link.context ?? "",
            direction: link.source === current ? "forward" : "reverse",
          },
        ]
        if (next === toId)
          return {
            from: summary(this.nodes.get(fromId)!),
            to: summary(this.nodes.get(toId)!),
            hops: nextRoute.length,
            path: nextRoute,
          }
        if (visited.has(next)) continue
        visited.add(next)
        queue.push([next, nextRoute])
      }
    }
    return { error: `No path found between '${fromId}' and '${toId}' within ${maxHops} hops` }
  }

  stats() {
    return {
      ...this.data.graph,
      confidence_breakdown: counts(this.data.links.map((link) => link.confidence ?? "?")),
      relation_types: counts(this.data.links.map((link) => link.relation ?? "?")),
    }
  }

  godNodes(topN = 10, excludeExternal = true) {
    return [...this.nodes.values()]
      .filter((node) => !excludeExternal || (!node.id.startsWith("@external/") && !node.id.startsWith("@config/")))
      .map((node) => ({
        node,
        degree: (this.adjacent.get(node.id)?.length ?? 0) + (this.reverseAdjacent.get(node.id)?.length ?? 0),
      }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, topN)
      .map(({ node, degree }) => ({
        id: node.id,
        label: node.label,
        type: node.entity_type,
        file: node.source_file,
        degree,
        outgoing: this.adjacent.get(node.id)?.length ?? 0,
        incoming: this.reverseAdjacent.get(node.id)?.length ?? 0,
        relations: counts((this.adjacent.get(node.id) ?? []).map((link) => link.relation ?? "?")),
        details: node.details,
      }))
  }

  async diagramPath(entityId: string) {
    const indexPath = path.join(this.diagramsDir, "INDEX.json")
    const index = await fs
      .readFile(indexPath, "utf8")
      .then((value) => z.record(z.string(), z.string()).parse(JSON.parse(value)))
      .catch(() => undefined)
    if (!index) return { error: "INDEX.json not found. Generate diagrams first with mermaid_seq.py --out-dir" }
    const matchedId = index[entityId]
      ? entityId
      : Object.keys(index).find((key) => key.toLowerCase().includes(entityId.toLowerCase()))
    if (!matchedId) return { error: `No diagram found for '${entityId}'` }
    const diagramPath = path.join(this.diagramsDir, index[matchedId])
    return {
      entity_id: entityId,
      ...(matchedId === entityId ? {} : { matched_id: matchedId }),
      diagram_path: diagramPath,
      relative_path: index[matchedId],
      exists: await fs
        .stat(diagramPath)
        .then(() => true)
        .catch(() => false),
    }
  }

  async exportHtml(outputPath: string, nodeLimit = 5000) {
    const degree = new Map<string, number>()
    this.data.links.forEach((link) => {
      degree.set(link.source, (degree.get(link.source) ?? 0) + 1)
      degree.set(link.target, (degree.get(link.target) ?? 0) + 1)
    })
    const aggregate = this.nodes.size > nodeLimit
    const maxDegree = Math.max(1, ...degree.values())
    const moduleCounts = counts([...this.nodes.values()].map(moduleName))
    const maxModuleSize = Math.max(1, ...Object.values(moduleCounts))
    const nodes = aggregate
      ? Object.entries(moduleCounts).map(([name, count]) => ({
          id: name,
          label: name,
          color: color("class"),
          size: 10 + 30 * (count / maxModuleSize),
          font: { size: 14, color: "#fff" },
          title: `${name} (${count} entities)`,
          community_name: name,
          source_file: "",
          file_type: "community",
          degree: count,
        }))
      : [...this.nodes.values()].map((node) => ({
          id: node.id,
          label: node.label ?? node.id,
          color: color(node.entity_type ?? ""),
          size: Math.round((8 + 20 * ((degree.get(node.id) ?? 1) / maxDegree)) * 10) / 10,
          font: { size: (degree.get(node.id) ?? 1) >= maxDegree * 0.15 ? 10 : 0, color: "#fff" },
          title: `${node.label ?? node.id} (${node.entity_type ?? ""}) [${node.source_file ?? ""}]`,
          community_name: moduleName(node),
          source_file: node.source_file ?? "",
          file_type: node.entity_type ?? "",
          degree: degree.get(node.id) ?? 1,
          details: node.details,
        }))
    const edges = aggregate
      ? aggregateEdges(this.data.links, this.nodes)
      : this.data.links.map((link) => ({
          from: link.source,
          to: link.target,
          label: link.relation ?? "",
          title: `${link.relation ?? ""} [${link.confidence ?? "EXTRACTED"}]`,
          dashes: link.confidence !== "EXTRACTED",
          width: link.confidence === "EXTRACTED" ? 2 : 1,
          color: { opacity: link.confidence === "EXTRACTED" ? 0.7 : 0.3 },
          confidence: link.confidence ?? "EXTRACTED",
        }))
    const legend = [...new Set(nodes.map((node) => node.file_type).filter(Boolean))].map((label) => ({
      label,
      color: entityColors[label as keyof typeof entityColors] ?? defaultColor,
    }))
    const html = renderHtml(path.basename(this.path), this.nodes.size, this.data.links.length, nodes, edges, legend)
    await fs.mkdir(path.dirname(outputPath) || ".", { recursive: true })
    await fs.writeFile(outputPath, html)
    return outputPath
  }

  queryGraph(question: string, mode = "bfs", depth = 3, maxNodes = 50, contextFilter = "") {
    const terms = queryTerms(question)
    if (!terms.length) return { error: "No searchable terms in question", question }
    const scores = this.scoreNodes(terms)
    const seeds = [...scores]
      .sort((a, b) => b[1] - a[1])
      .filter((item, index, all) => index < 10 && (!all[0]![1] || item[1] >= all[0]![1] * 0.2))
      .slice(0, 3)
    const inferredFilter = inferFilter(question)
    const effectiveFilter = contextFilter || inferredFilter
    if (!seeds.length)
      return {
        question,
        tokens: terms,
        inferred_filter: inferredFilter,
        effective_filter: "",
        mode,
        seeds: [],
        total_nodes: 0,
        total_edges: 0,
        nodes: [],
        edges: [],
        message: "No matching entities found",
      }
    const subgraphNodes = new Set<string>()
    const subgraphEdges: Edge[] = []
    const visited = new Set<string>()
    seeds.forEach(([id]) => {
      if (subgraphNodes.size >= maxNodes) return
      if (mode === "dfs") {
        this.dfs(id, depth, effectiveFilter, new Set(), subgraphNodes, subgraphEdges, maxNodes)
        return
      }
      this.bfs(id, depth, effectiveFilter, visited, subgraphNodes, subgraphEdges, maxNodes)
    })
    const seedIds = new Set(seeds.map(([id]) => id))
    const resultNodes = [
      ...seeds.map(([id, score]) => ({ ...summary(this.nodes.get(id)!), score: round(score), is_seed: true })),
      ...[...subgraphNodes]
        .filter((id) => !seedIds.has(id))
        .map((id) => ({ ...summary(this.nodes.get(id)!), is_seed: false })),
    ]
    return {
      question,
      tokens: terms,
      inferred_filter: inferredFilter,
      effective_filter: effectiveFilter,
      mode,
      depth,
      seeds: seeds.map(([id, score]) => ({ id, label: this.nodes.get(id)?.label, score: round(score) })),
      total_nodes: resultNodes.length,
      total_edges: subgraphEdges.length,
      nodes: resultNodes,
      edges: subgraphEdges,
    }
  }

  private findScored(query: string): Array<[number, string]> {
    const tokens = tokenize(query)
    if (!tokens.values.length) return []
    const scored = [...this.nodes.values()].flatMap((node): Array<[number, string]> => {
      const label = (node.label ?? "").toLowerCase()
      const id = node.id.toLowerCase()
      const file = (node.source_file ?? "").toLowerCase()
      const values = tokens.values.map((token) =>
        label === token || id === token
          ? 20
          : label.includes(token) || id.includes(token)
            ? 10
            : file.includes(token)
              ? tokens.values.length === 1
                ? 10
                : 5
              : token.length >= 4 && fuzzy(token, label)
                ? 3
                : token.length >= 4 && fuzzy(token, id)
                  ? 2
                  : 0,
      )
      if (tokens.and && values.some((value) => value === 0)) return []
      const score = values.reduce<number>((sum, value) => sum + value, 0)
      return score ? [[score, node.id]] : []
    })
    return scored.sort((a, b) => b[0] - a[0])
  }

  private scoreNodes(terms: string[]) {
    const idf = new Map(
      terms.map((term) => {
        const frequency = [...this.nodes.values()].filter((node) =>
          (node.label ?? "").toLowerCase().includes(term),
        ).length
        return [term, frequency ? Math.log((this.nodes.size + 1) / (frequency + 1)) + 1 : 1]
      }),
    )
    return new Map(
      [...this.nodes.values()].flatMap((node): Array<[string, number]> => {
        const label = (node.label ?? "").toLowerCase()
        const file = (node.source_file ?? "").toLowerCase()
        const score = terms.reduce((total, term) => {
          const weight = idf.get(term) ?? 1
          return (
            total +
            (label === term
              ? 1000 * weight
              : label.startsWith(term)
                ? 100 * weight
                : label.includes(term)
                  ? weight
                  : 0) +
            (file.includes(term) ? 0.5 * weight : 0)
          )
        }, 0)
        return score ? [[node.id, score]] : []
      }),
    )
  }

  private bfs(
    seed: string,
    depth: number,
    relation: string,
    visited: Set<string>,
    nodes: Set<string>,
    edges: Edge[],
    maxNodes: number,
  ) {
    const degrees = new Map(
      [...this.nodes].map(([id]) => [
        id,
        (this.adjacent.get(id)?.length ?? 0) + (this.reverseAdjacent.get(id)?.length ?? 0),
      ]),
    )
    const sortedDegrees = [...degrees.values()].sort((a, b) => a - b)
    const hubDegree = Math.max(50, sortedDegrees[Math.floor(sortedDegrees.length * 0.99)] ?? 0)
    let frontier = [seed]
    for (let hop = 0; hop < depth && frontier.length && nodes.size < maxNodes; hop++) {
      const next: string[] = []
      frontier.forEach((current) => {
        ;[...(this.adjacent.get(current) ?? []), ...(this.reverseAdjacent.get(current) ?? [])].forEach((link) => {
          if (nodes.size >= maxNodes || (relation && link.relation !== relation)) return
          const target = link.source === current ? link.target : link.source
          nodes.add(current).add(target)
          edges.push(edge(this.nodes, link, link.source === current ? "forward" : "reverse"))
          if (!visited.has(target)) {
            visited.add(target)
            if ((degrees.get(target) ?? 0) < hubDegree || target === seed) next.push(target)
          }
        })
      })
      frontier = next
    }
  }

  private dfs(
    id: string,
    depth: number,
    relation: string,
    visited: Set<string>,
    nodes: Set<string>,
    edges: Edge[],
    maxNodes: number,
  ) {
    if (depth <= 0 || visited.has(id) || nodes.size >= maxNodes) return
    visited.add(id)
    for (const link of this.adjacent.get(id) ?? []) {
      if (relation && link.relation !== relation) continue
      nodes.add(id).add(link.target)
      edges.push(edge(this.nodes, link, "forward"))
      if (nodes.size >= maxNodes) return
      this.dfs(link.target, depth - 1, relation, visited, nodes, edges, maxNodes)
    }
  }
}

function append<T>(map: Map<string, T[]>, key: string, value: T) {
  map.set(key, [...(map.get(key) ?? []), value])
}

function summary(node: Node) {
  return {
    id: node.id,
    label: node.label ?? null,
    type: node.entity_type ?? null,
    file: node.source_file ?? null,
    location: node.source_location ?? null,
    details: node.details ?? null,
  }
}

function edge(nodes: Map<string, Node>, link: Link, direction: "forward" | "reverse") {
  return {
    source_id: link.source,
    target_id: link.target,
    source_label: nodes.get(link.source)?.label ?? link.source,
    target_label: nodes.get(link.target)?.label ?? link.target,
    relation: link.relation,
    confidence: link.confidence,
    context: link.context ?? "",
    direction,
  }
}

function counts(values: string[]) {
  return Object.fromEntries(
    [...new Set(values)].map((value) => [value, values.filter((item) => item === value).length]),
  )
}

function contextTags(context: string) {
  return [
    context.includes("(self)") ? "self" : "",
    ...["if", "else", "loop", "switch", "try", "catch"].filter((tag) => context.includes(`[${tag}]`)),
  ].filter(Boolean)
}

function shortId(id: string) {
  return id.includes("_") ? id.slice(id.lastIndexOf("_") + 1) : id
}

function tokenize(query: string) {
  const hasOr = /\bOR\b/i.test(query)
  const and = /\bAND\b/i.test(query) && !hasOr
  return {
    and,
    values: query
      .replace(/\b(?:AND|OR)\b/gi, " ")
      .split(/[\s,;:|&/+]+/)
      .map((word) => word.replace(/^[._\-()[\]{}!?'"]+|[._\-()[\]{}!?'"]+$/g, "").toLowerCase())
      .filter((word) => word.length >= 2),
  }
}

function levenshtein(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index)
  for (let column = 1; column <= right.length; column++) {
    let previous = rows[0]!
    rows[0] = column
    for (let row = 1; row <= left.length; row++) {
      const current = rows[row]!
      rows[row] = Math.min(rows[row]! + 1, rows[row - 1]! + 1, previous + (left[row - 1] === right[column - 1] ? 0 : 1))
      previous = current
    }
  }
  return rows[left.length]!
}

function fuzzy(token: string, target: string) {
  const distance = token.length <= 6 ? 1 : 2
  if (target.length < Math.max(3, token.length - distance * 2) || target.length > token.length + 8) return false
  const overlap = new Set(token).size ? [...new Set(token)].filter((character) => target.includes(character)).length : 0
  if (overlap < Math.max(2, token.length - distance - 1)) return false
  for (
    let size = Math.max(3, token.length - distance);
    size <= Math.min(target.length, token.length + distance);
    size++
  ) {
    for (let offset = 0; offset <= target.length - size; offset++) {
      if (levenshtein(token, target.slice(offset, offset + size)) <= distance) return true
    }
  }
  return false
}

function queryTerms(question: string) {
  return (
    question
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((term) =>
        term
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^\x00-\x7F]/g, ""),
      )
      .filter((term) => term.length > 2) ?? []
  ).filter(Boolean)
}

function inferFilter(question: string) {
  const hints: Array<[string, string]> = [
    ["call", "calls"],
    ["invoke", "calls"],
    ["import", "imports"],
    ["module", "imports"],
    ["field", "field"],
    ["property", "field"],
    ["member", "field"],
    ["parameter", "parameter_type"],
    ["param", "parameter_type"],
    ["return", "return_type"],
    ["inherit", "inherits"],
    ["contain", "contains"],
    ["implement", "implements"],
    ["export", "exports"],
    ["reference", "references"],
  ]
  return hints.find(([hint]) => question.toLowerCase().includes(hint))?.[1] ?? ""
}

function moduleName(node: Node) {
  const file = node.source_file ?? ""
  return file.includes("/") ? file.split("/")[0]! : file || "unknown"
}

function aggregateEdges(links: Link[], nodes: Map<string, Node>) {
  const values = new Map<string, number>()
  links.forEach((link) => {
    const source = nodes.get(link.source)
    const target = nodes.get(link.target)
    if (!source || !target) return
    const from = moduleName(source)
    const to = moduleName(target)
    if (from === to) return
    const key = [from, to].sort().join("\u0000")
    values.set(key, (values.get(key) ?? 0) + 1)
  })
  return [...values].map(([key, weight]) => {
    const [from, to] = key.split("\u0000")
    return { from, to, label: `${weight} edges`, value: weight, confidence: "AGGREGATED" }
  })
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function color(type: string) {
  const value = entityColors[type as keyof typeof entityColors] ?? defaultColor
  return { background: value, border: value, highlight: { background: "#fff", border: value } }
}

function renderHtml(name: string, entities: number, links: number, nodes: unknown, edges: unknown, legend: unknown) {
  const safe = (value: unknown) => JSON.stringify(value).replaceAll("</", "<\\/")
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code Graph - ${escapeHtml(name)}</title><script src="https://unpkg.com/vis-network@9.1.6/dist/vis-network.min.js"></script>
<style>*{box-sizing:border-box}html,body{height:100%;margin:0;font-family:system-ui;background:#1a1a2e;color:#e0e0e0}#container{display:flex;height:100%}#sidebar{width:340px;background:#16213e;padding:16px;overflow:auto;border-right:1px solid #0f3460}h2,h3{color:#e94560}#search{width:100%;padding:8px;background:#1a1a2e;color:#eee;border:1px solid #0f3460;border-radius:6px}#legend{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}#legend span{padding:2px 8px;border-radius:4px;font-size:11px;color:#fff}#graph{flex:1}.attr,.edge{font-size:12px;margin:4px 0;word-break:break-word}.muted{color:#8b91a8}.section{margin-top:12px;padding-top:8px;border-top:1px solid #0f3460}</style></head>
<body><div id="container"><aside id="sidebar"><h2>Code Graph</h2><div class="muted">${entities} entities · ${links} edges</div><p><input id="search" placeholder="Search nodes..."></p><div id="legend"></div><div id="info">Click a node to inspect</div><div id="detail"></div></aside><div id="graph"></div></div>
<script>const RAW_NODES=${safe(nodes)},RAW_EDGES=${safe(edges)},LEGEND=${safe(legend)};const byId=Object.fromEntries(RAW_NODES.map(n=>[n.id,n]));const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');const legend=document.getElementById('legend');LEGEND.forEach(item=>{const tag=document.createElement('span');tag.textContent=item.label;tag.style.background=item.color;legend.appendChild(tag)});const data={nodes:new vis.DataSet(RAW_NODES),edges:new vis.DataSet(RAW_EDGES)};const network=new vis.Network(document.getElementById('graph'),data,{physics:{solver:'forceAtlas2Based',forceAtlas2Based:{gravitationalConstant:-30,centralGravity:.005,springLength:120,springConstant:.04}},nodes:{shape:'dot',borderWidth:0},edges:{arrows:{to:{enabled:true,scaleFactor:.6}},smooth:{type:'continuous'},font:{size:9,color:'#a0a0b0'}},interaction:{hover:true}});network.on('stabilizationIterationsDone',()=>network.setOptions({physics:false}));network.stabilize(200);network.on('click',params=>{if(params.nodes.length!==1)return;const id=params.nodes[0],node=byId[id],related=RAW_EDGES.filter(edge=>edge.from===id||edge.to===id);document.getElementById('info').innerHTML='<b>'+related.length+'</b> connections';const details=(node.details||[]).map(item=>'<div class="edge">['+esc(item.kind)+'] '+esc(item.name)+(item.type?' : '+esc(item.type):'')+'</div>').join('');const relations=related.slice(0,30).map(edge=>{const outgoing=edge.from===id,other=byId[outgoing?edge.to:edge.from];return '<div class="edge">'+(outgoing?'→':'←')+' '+esc(other?.label||other?.id)+' <span class="muted">['+esc(edge.label)+' / '+esc(edge.confidence)+']</span></div>'}).join('');document.getElementById('detail').innerHTML='<h3>'+esc(node.label||id)+'</h3><div class="attr muted">'+esc(node.file_type)+' · '+esc(node.source_file)+'</div>'+(details?'<div class="section"><b>Details</b>'+details+'</div>':'')+'<div class="section"><b>Relationships</b>'+relations+'</div>'});document.getElementById('search').addEventListener('input',event=>{const query=event.target.value.toLowerCase();if(!query){network.unselectAll();return}network.selectNodes(RAW_NODES.filter(node=>(node.label||'').toLowerCase().includes(query)||(node.source_file||'').toLowerCase().includes(query)).slice(0,20).map(node=>node.id))});</script></body></html>`
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

export * as CodeToGraphService from "./service"
