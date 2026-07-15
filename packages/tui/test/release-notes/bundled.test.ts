import { describe, expect, test } from "bun:test"
import { parseSections } from "../../src/release-notes/bundled"

describe("parseSections", () => {
  test("parses a single section with date", () => {
    const sections = parseSections("## v0.1.2 (2026-07-09)\n\nSome content here.")
    expect(sections).toHaveLength(1)
    expect(sections[0].tag).toBe("v0.1.2")
    expect(sections[0].createdAt).toBe("2026-07-09")
    expect(sections[0].prerelease).toBe(false)
    expect(sections[0].body).toBe("Some content here.")
  })

  test("parses a section without date — createdAt is empty string", () => {
    const sections = parseSections("## 0.1.2\n\nBody text.")
    expect(sections).toHaveLength(1)
    expect(sections[0].tag).toBe("0.1.2")
    expect(sections[0].createdAt).toBe("")
    expect(sections[0].body).toBe("Body text.")
  })

  test("parses multiple sections in order", () => {
    const raw = [
      "## v0.2.0 (2026-07-16)",
      "",
      "New features.",
      "",
      "## v0.1.1 (2026-07-02)",
      "",
      "Initial release.",
    ].join("\n")
    const sections = parseSections(raw)
    expect(sections).toHaveLength(2)
    expect(sections[0].tag).toBe("v0.2.0")
    expect(sections[0].createdAt).toBe("2026-07-16")
    expect(sections[0].body).toBe("New features.")
    expect(sections[1].tag).toBe("v0.1.1")
    expect(sections[1].createdAt).toBe("2026-07-02")
    expect(sections[1].body).toBe("Initial release.")
  })

  test("detects prerelease from a hyphen suffix in the tag", () => {
    const sections = parseSections("## v1.0.0-rc1 (2026-07-01)\n\nRelease candidate.")
    expect(sections).toHaveLength(1)
    expect(sections[0].prerelease).toBe(true)
    expect(sections[0].tag).toBe("v1.0.0-rc1")
  })

  test("non-prerelease tag has prerelease=false", () => {
    const sections = parseSections("## v1.0.0 (2026-07-01)\n\nStable release.")
    expect(sections[0].prerelease).toBe(false)
  })

  test("trims leading and trailing whitespace from body", () => {
    const raw = "## v0.1.0 (2026-01-01)\n\n\n  Content with padding  \n\n"
    const sections = parseSections(raw)
    expect(sections[0].body).toBe("Content with padding")
  })

  test("ignores content before the first ## version header", () => {
    const raw = "# Changelog\n\nIntro paragraph.\n\n## v0.1.0 (2026-01-01)\n\nFirst."
    const sections = parseSections(raw)
    expect(sections).toHaveLength(1)
    expect(sections[0].tag).toBe("v0.1.0")
    expect(sections[0].body).toBe("First.")
  })

  test("ignores ## headers that are not version-like", () => {
    const raw = [
      "## Changelog",
      "",
      "Intro text.",
      "",
      "## v0.1.0 (2026-01-01)",
      "",
      "Body.",
    ].join("\n")
    const sections = parseSections(raw)
    expect(sections).toHaveLength(1)
    expect(sections[0].tag).toBe("v0.1.0")
    expect(sections[0].body).toBe("Body.")
  })

  test("treats #### sub-headings as body content, not new sections", () => {
    const raw = [
      "## v0.1.0 (2026-01-01)",
      "",
      "#### 新特性",
      "",
      "- 功能 A",
      "",
      "#### 缺陷修复",
      "",
      "- 修复 B",
    ].join("\n")
    const sections = parseSections(raw)
    expect(sections).toHaveLength(1)
    expect(sections[0].body).toContain("#### 新特性")
    expect(sections[0].body).toContain("- 功能 A")
    expect(sections[0].body).toContain("#### 缺陷修复")
    expect(sections[0].body).toContain("- 修复 B")
  })

  test("handles an empty section body (two headers back to back)", () => {
    const raw = "## v0.2.0 (2026-07-16)\n## v0.1.0 (2026-07-01)\n\nBody."
    const sections = parseSections(raw)
    expect(sections).toHaveLength(2)
    expect(sections[0].tag).toBe("v0.2.0")
    expect(sections[0].body).toBe("")
    expect(sections[1].tag).toBe("v0.1.0")
    expect(sections[1].body).toBe("Body.")
  })

  test("returns an empty array for input with no version headers", () => {
    expect(parseSections("# Title\n\nJust text.")).toHaveLength(0)
    expect(parseSections("")).toHaveLength(0)
  })

  test("does not match ## without a space (e.g. ##v0.1.0)", () => {
    const sections = parseSections("##v0.1.0 (2026-01-01)\n\nBody.")
    expect(sections).toHaveLength(0)
  })

  test("parses a tag without v prefix", () => {
    const sections = parseSections("## 1.0.0 (2026-01-01)\n\nStable.")
    expect(sections).toHaveLength(1)
    expect(sections[0].tag).toBe("1.0.0")
    expect(sections[0].prerelease).toBe(false)
  })

  test("preserves multiline body content verbatim (after trim)", () => {
    const raw = [
      "## v0.1.0 (2026-01-01)",
      "",
      "### Added",
      "",
      "- Feature A",
      "- Feature B",
      "",
      "### Fixed",
      "",
      "- Bug C",
    ].join("\n")
    const sections = parseSections(raw)
    expect(sections[0].body).toBe(
      "### Added\n\n- Feature A\n- Feature B\n\n### Fixed\n\n- Bug C",
    )
  })
})
