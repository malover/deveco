const SOURCE_PATH =
  /(?:[A-Za-z0-9_.@+-]+[\\/])+[A-Za-z0-9_.@+ -]+\.(?:ets|ts|tsx|js|jsx|json5|json|md|cpp|cc|c|h|hpp|java|kt|py|rs|go)/g
const EVIDENCE_WORDS =
  /entry|start|init|create|ability|stage|module|depend|import|call|consumer|contract|manager|config|state|model|persist|database|storage|flow|lifecycle|risk|shared|service|view|controller|repository|build|test|permission|manifest|->|→|\/|\\/i

export function compactProjectSpecEvidence(input: string, limit: number) {
  const seen = new Set<string>()
  const output: string[] = []
  let characters = 0

  const candidates = input.split(/\r?\n/).flatMap((source, index) => {
    const line = source
      .replace(/^\s*\d+\s*[|:]\s*/, "")
      .replace(/\s+/g, " ")
      .trim()
    if (!line || !EVIDENCE_WORDS.test(line)) return []
    const clipped = line.slice(0, 300)
    const key = clipped.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    const score =
      (/[A-Za-z0-9_.@+-]+[\\/][^\s:`)]+\.[A-Za-z0-9]+/.test(clipped) ? 5 : 0) +
      (/\b(calls?|callers?|consumers?|depends?|imports?|instantiates?)\b|->|→/i.test(clipped) ? 3 : 0) +
      (/entry|startup|onCreate|main|persist|database|config|manager|contract|risk|test/i.test(clipped) ? 2 : 0) -
      (/^[A-Za-z0-9_]+\s*→\s*Type$/.test(clipped) ? 5 : 0)
    return [{ line: clipped, index, score }]
  })

  candidates.sort((left, right) => right.score - left.score || left.index - right.index)
  for (const candidate of candidates) {
    const clipped = candidate.line
    if (characters + clipped.length + 1 > limit) continue
    output.push(clipped)
    characters += clipped.length + 1
  }

  if (output.length === 0) return input.replace(/\s+/g, " ").trim().slice(0, limit)
  return output.join("\n")
}

export function extractProjectSpecPaths(input: string) {
  return [...new Set(input.match(SOURCE_PATH) ?? [])]
    .map((item) => item.replaceAll("\\", "/").trim())
    .filter(
      (item) =>
        !item
          .split("/")
          .some((part) => ["node_modules", ".git", ".homegraph", "build", "dist", "generated"].includes(part)),
    )
}
