import { expect, test } from "bun:test"
import {
  ATTRIBUTION_SOURCE,
  attributeContent,
  countAddedLines,
  createAttributedFile,
} from "@/plugin/analytics/code-attribution/line-attribution"

test("counts the final writer after alternating AI and human edits", () => {
  const parent = "export const base = 0\n"
  const baseline = createAttributedFile(parent)
  const firstAi = attributeContent(
    baseline,
    `${parent}export const first = 1\nexport const second = 2\n`,
    ATTRIBUTION_SOURCE.AI,
  )
  const human = attributeContent(
    firstAi,
    `${parent}export const firstByHuman = 10\nexport const second = 2\n`,
    ATTRIBUTION_SOURCE.HUMAN,
  )
  const secondAi = attributeContent(
    human,
    `${parent}export const firstByHuman = 10\nexport const secondByAi = 20\n`,
    ATTRIBUTION_SOURCE.AI,
  )

  expect(countAddedLines(parent, secondAi)).toEqual({
    aiGeneratedLines: 1,
    humanGeneratedLines: 1,
    unknownGeneratedLines: 0,
    totalGeneratedLines: 2,
  })
})

test("does not accumulate AI lines overwritten by a later AI checkpoint", () => {
  const first = attributeContent(createAttributedFile(""), "const oldA = 1\nconst oldB = 2\n", ATTRIBUTION_SOURCE.AI)
  const second = attributeContent(
    first,
    "const finalA = 10\nconst finalB = 20\nconst finalC = 30\n",
    ATTRIBUTION_SOURCE.AI,
  )

  expect(countAddedLines("", second)).toEqual({
    aiGeneratedLines: 3,
    humanGeneratedLines: 0,
    unknownGeneratedLines: 0,
    totalGeneratedLines: 3,
  })
})

test("does not count deleted AI output and ignores blank added lines", () => {
  const generated = attributeContent(
    createAttributedFile(""),
    "const retained = true\nconst removed = true\n\n",
    ATTRIBUTION_SOURCE.AI,
  )
  const final = attributeContent(generated, "const retained = true\n\n", ATTRIBUTION_SOURCE.HUMAN)

  expect(countAddedLines("", final)).toEqual({
    aiGeneratedLines: 1,
    humanGeneratedLines: 0,
    unknownGeneratedLines: 0,
    totalGeneratedLines: 1,
  })
})

test("preserves provenance for moved and whitespace-only formatted lines", () => {
  const generated = attributeContent(createAttributedFile(""), "const first=1\nconst second=2\n", ATTRIBUTION_SOURCE.AI)
  const formattedAndMoved = attributeContent(generated, "const second = 2\nconst first = 1\n", ATTRIBUTION_SOURCE.HUMAN)

  expect(countAddedLines("", formattedAndMoved)).toEqual({
    aiGeneratedLines: 2,
    humanGeneratedLines: 0,
    unknownGeneratedLines: 0,
    totalGeneratedLines: 2,
  })
})

test("treats whitespace changes inside string literals as substantive edits", () => {
  const generated = attributeContent(createAttributedFile(""), 'const text = "a = b"\n', ATTRIBUTION_SOURCE.AI)
  const human = attributeContent(generated, 'const text = "a=b"\n', ATTRIBUTION_SOURCE.HUMAN)

  expect(countAddedLines("", human)).toEqual({
    aiGeneratedLines: 0,
    humanGeneratedLines: 1,
    unknownGeneratedLines: 0,
    totalGeneratedLines: 1,
  })
})

test("keeps unobserved additions unknown", () => {
  const recovered = attributeContent(createAttributedFile(""), "const recovered = true\n", ATTRIBUTION_SOURCE.UNKNOWN)

  expect(countAddedLines("", recovered)).toEqual({
    aiGeneratedLines: 0,
    humanGeneratedLines: 0,
    unknownGeneratedLines: 1,
    totalGeneratedLines: 1,
  })
})
