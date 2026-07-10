import { describe, expect, it as bunIt } from "bun:test"
import path from "node:path"
import { Effect, Layer } from "effect"
import { Skill } from "../../src/skill"
import { Agent } from "../../src/agent/agent"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Discovery } from "../../src/skill/discovery"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Config } from "../../src/config/config"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const node = CrossSpawnSpawner.defaultLayer

const it = testEffect(Layer.mergeAll(Skill.defaultLayer, node, testInstanceStoreLayer))
const itNoExternal = testEffect(
  Layer.mergeAll(
    Skill.layer.pipe(
      Layer.provide(Discovery.defaultLayer),
      Layer.provide(Config.defaultLayer),
      Layer.provide(EventV2Bridge.defaultLayer),
      Layer.provide(FSUtil.defaultLayer),
      Layer.provide(Global.layer),
      Layer.provide(RuntimeFlags.layer({ disableExternalSkills: true, disableClaudeCodeSkills: true })),
    ),
    node,
    testInstanceStoreLayer,
  ),
)

describe("fmt", () => {
  bunIt("returns empty message when no skills have descriptions", () => {
    const list: Skill.Info[] = [
      { name: "skill1", location: "/tmp/skill1/SKILL.md", content: "content" },
      { name: "skill2", location: "/tmp/skill2/SKILL.md", content: "content" },
    ]
    expect(Skill.fmt(list, { verbose: false })).toBe("No skills are currently available.")
    expect(Skill.fmt(list, { verbose: true })).toBe("No skills are currently available.")
  })

  bunIt("returns XML format when verbose is true", () => {
    const list: Skill.Info[] = [
      { name: "skill-b", description: "Second skill", location: "/tmp/skill2/SKILL.md", content: "content" },
      { name: "skill-a", description: "First skill", location: "/tmp/skill1/SKILL.md", content: "content" },
    ]
    const result = Skill.fmt(list, { verbose: true })
    expect(result).toContain("<available_skills>")
    expect(result).toContain("</available_skills>")
    expect(result).toContain("<skill>")
    expect(result).toContain("</skill>")
    expect(result).toContain("<name>skill-a</name>")
    expect(result).toContain("<description>First skill</description>")
    expect(result).toContain("<location>file:///tmp/skill1/SKILL.md</location>")
    expect(result).toContain("<name>skill-b</name>")
    expect(result).toContain("<description>Second skill</description>")
    // Should be sorted alphabetically by name
    expect(result.indexOf("skill-a")).toBeLessThan(result.indexOf("skill-b"))
  })

  bunIt("returns Markdown format when verbose is false", () => {
    const list: Skill.Info[] = [
      { name: "skill-b", description: "Second skill", location: "/tmp/skill2/SKILL.md", content: "content" },
      { name: "skill-a", description: "First skill", location: "/tmp/skill1/SKILL.md", content: "content" },
    ]
    const result = Skill.fmt(list, { verbose: false })
    expect(result).toContain("## Available Skills")
    expect(result).toContain("- **skill-a**: First skill")
    expect(result).toContain("- **skill-b**: Second skill")
    // Should be sorted alphabetically by name
    expect(result.indexOf("skill-a")).toBeLessThan(result.indexOf("skill-b"))
  })

  bunIt("filters out skills without descriptions", () => {
    const list: Skill.Info[] = [
      { name: "skill-a", location: "/tmp/skill1/SKILL.md", content: "content" },
      { name: "skill-b", description: "Has desc", location: "/tmp/skill2/SKILL.md", content: "content" },
    ]
    const resultVerbose = Skill.fmt(list, { verbose: true })
    expect(resultVerbose).toContain("skill-b")
    expect(resultVerbose).not.toContain("skill-a")

    const resultNormal = Skill.fmt(list, { verbose: false })
    expect(resultNormal).toContain("skill-b")
    expect(resultNormal).not.toContain("skill-a")
  })
})

describe("NotFoundError", () => {
  bunIt("formats message with comma-separated available skills", () => {
    const error = new Skill.NotFoundError({
      name: "missing-skill",
      available: ["skill-a", "skill-b", "skill-c"],
    })
    expect(error.message).toBe('Skill "missing-skill" not found. Available skills: skill-a, skill-b, skill-c')
  })

  bunIt("formats message with 'none' when no skills available", () => {
    const error = new Skill.NotFoundError({
      name: "missing-skill",
      available: [],
    })
    expect(error.message).toBe('Skill "missing-skill" not found. Available skills: none')
  })
})

describe("available", () => {
  it.live("returns all skills sorted when no agent provided", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".deveco", "skill", "z-skill", "SKILL.md"),
                `---
name: z-skill
description: Last alphabetically.
---
`,
              ),
              Bun.write(
                path.join(dir, ".deveco", "skill", "a-skill", "SKILL.md"),
                `---
name: a-skill
description: First alphabetically.
---
`,
              ),
            ]),
          )
          const skill = yield* Skill.Service
          const list = (yield* skill.available()).filter((s) => s.location !== "<built-in>")
          expect(list.find((x) => x.name === "a-skill")).toBeDefined()
          expect(list.find((x) => x.name === "z-skill")).toBeDefined()
          // Verify alphabetical sorting
          const aIndex = list.findIndex((x) => x.name === "a-skill")
          const zIndex = list.findIndex((x) => x.name === "z-skill")
          expect(aIndex).toBeLessThan(zIndex)
        }),
      { git: true },
    ),
    30_000,
  )

  it.live("filters skills denied by agent permission", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".deveco", "skill", "allowed-skill", "SKILL.md"),
                `---
name: allowed-skill
description: Allowed skill.
---
`,
              ),
              Bun.write(
                path.join(dir, ".deveco", "skill", "denied-skill", "SKILL.md"),
                `---
name: denied-skill
description: Denied skill.
---
`,
              ),
            ]),
          )
          const skill = yield* Skill.Service
          const agent: Agent.Info = {
            name: "test-agent",
            mode: "all",
            permission: [
              { permission: "skill", pattern: "denied-skill", action: "deny" },
            ],
            options: {},
          }
          const list = yield* skill.available(agent)
          expect(list.find((x) => x.name === "allowed-skill")).toBeDefined()
          expect(list.find((x) => x.name === "denied-skill")).toBeUndefined()
        }),
      { git: true },
    ),
    30_000,
  )

  it.live("includes skills with 'ask' action", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".deveco", "skill", "ask-skill", "SKILL.md"),
              `---
name: ask-skill
description: Skill that requires ask.
---
`,
            ),
          )
          const skill = yield* Skill.Service
          const agent: Agent.Info = {
            name: "test-agent",
            mode: "all",
            permission: [{ permission: "skill", pattern: "ask-skill", action: "ask" }],
            options: {},
          }
          const list = yield* skill.available(agent)
          expect(list.find((x) => x.name === "ask-skill")).toBeDefined()
        }),
      { git: true },
    ),
    30_000,
  )
})

describe("require", () => {
  it.live("returns skill info when skill exists", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".deveco", "skill", "existing-skill", "SKILL.md"),
              `---
name: existing-skill
description: An existing skill.
---
Skill content.
`,
            ),
          )
          const skill = yield* Skill.Service
          const info = yield* skill.require("existing-skill")
          expect(info.name).toBe("existing-skill")
          expect(info.description).toBe("An existing skill.")
          expect(info.location).toContain("existing-skill")
          expect(info.content).toContain("Skill content.")
        }),
      { git: true },
    ),
  )
})

describe("get", () => {
  it.live("returns undefined when skill does not exist", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const skill = yield* Skill.Service
          const info = yield* skill.get("nonexistent-skill")
          expect(info).toBeUndefined()
        }),
      { git: true },
    ),
  )
})

describe("skill loading with invalid frontmatter", () => {
  itNoExternal.live("skips skills with malformed YAML frontmatter", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".deveco", "skill", "bad-yaml", "SKILL.md"),
                `---
name: [invalid yaml
---
`,
              ),
              Bun.write(
                path.join(dir, ".deveco", "skill", "good-skill", "SKILL.md"),
                `---
name: good-skill
description: Valid skill.
---
`,
              ),
            ]),
          )
          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.find((x) => x.name === "good-skill")).toBeDefined()
          expect(list.find((x) => x.name === "bad-yaml")).toBeUndefined()
          expect(list.find((s) => s.location.includes("bad-yaml"))).toBeUndefined()
        }),
      { git: true },
    ),
  )

  itNoExternal.live("skips skills with frontmatter missing required name field", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".deveco", "skill", "no-name", "SKILL.md"),
                `---
description: Missing name field.
---
`,
              ),
              Bun.write(
                path.join(dir, ".deveco", "skill", "valid-skill", "SKILL.md"),
                `---
name: valid-skill
description: Valid skill.
---
`,
              ),
            ]),
          )
          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.find((x) => x.name === "valid-skill")).toBeDefined()
          expect(list.find((x) => x.name === "no-name")).toBeUndefined()
          expect(list.find((s) => s.location.includes("no-name"))).toBeUndefined()
        }),
      { git: true },
    ),
  )

  itNoExternal.live("skips skills when frontmatter name is not a string", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".deveco", "skill", "numeric-name", "SKILL.md"),
              `---
name: 123
description: Name is number not string.
---
`,
            ),
          )
          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.find((x) => x.name === "numeric-name")).toBeUndefined()
          expect(list.find((x) => x.name === "123")).toBeUndefined()
          expect(list.find((s) => s.location.includes("numeric-name"))).toBeUndefined()
        }),
      { git: true },
    ),
  )

  itNoExternal.live("skips skills when frontmatter description is not a string", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".deveco", "skill", "bad-desc", "SKILL.md"),
                `---
name: bad-desc
description: [1, 2, 3]
---
`,
              ),
              Bun.write(
                path.join(dir, ".deveco", "skill", "ok-skill", "SKILL.md"),
                `---
name: ok-skill
description: Valid description.
---
`,
              ),
            ]),
          )
          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter((s) => s.location !== "<built-in>")
          expect(list.find((x) => x.name === "ok-skill")).toBeDefined()
          expect(list.find((x) => x.name === "bad-desc")).toBeUndefined()
          expect(list.find((s) => s.location.includes("bad-desc"))).toBeUndefined()
        }),
      { git: true },
    ),
  )
})
