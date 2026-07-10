import { describe, expect, it } from "bun:test"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { Agent } from "../src/agent/agent"
import { deriveSubagentSessionPermission } from "../src/agent/subagent-permissions"

function makeSubagent(permission: PermissionV1.Ruleset): Agent.Info {
  return {
    name: "test-agent",
    mode: "subagent" as const,
    permission,
    options: {},
  } as Agent.Info
}

function rule(permission: string, pattern: string, action: PermissionV1.Action): PermissionV1.Rule {
  return { permission, pattern, action }
}

describe("deriveSubagentSessionPermission", () => {
  describe("default deny rules for task and todowrite", () => {
    it("adds both todowrite and task deny when subagent has no matching permissions", () => {
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: [],
        subagent: makeSubagent([]),
      })
      expect(result).toEqual([
        { permission: "todowrite", pattern: "*", action: "deny" },
        { permission: "task", pattern: "*", action: "deny" },
      ])
    })

    it("omits task deny when subagent has a task permission rule", () => {
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: [],
        subagent: makeSubagent([rule("task", "*", "allow")]),
      })
      expect(result).toEqual([
        { permission: "todowrite", pattern: "*", action: "deny" },
      ])
      const taskDeny = result.find((r) => r.permission === "task" && r.action === "deny")
      expect(taskDeny).toBeUndefined()
    })

    it("omits todowrite deny when subagent has a todowrite permission rule", () => {
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: [],
        subagent: makeSubagent([rule("todowrite", "*", "allow")]),
      })
      expect(result).toEqual([
        { permission: "task", pattern: "*", action: "deny" },
      ])
      const todoDeny = result.find((r) => r.permission === "todowrite" && r.action === "deny")
      expect(todoDeny).toBeUndefined()
    })

    it("omits both denies when subagent has both task and todowrite rules", () => {
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: [],
        subagent: makeSubagent([
          rule("task", "*", "allow"),
          rule("todowrite", "*", "allow"),
        ]),
      })
      expect(result).toEqual([])
    })

    it("matches task permission regardless of action type", () => {
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: [],
        subagent: makeSubagent([rule("task", "general", "deny")]),
      })
      const taskDeny = result.filter((r) => r.permission === "task" && r.action === "deny")
      expect(taskDeny).toHaveLength(0)
    })

    it("matches todowrite permission regardless of action type", () => {
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: [],
        subagent: makeSubagent([rule("todowrite", "*.txt", "ask")]),
      })
      const todoDeny = result.filter((r) => r.permission === "todowrite" && r.action === "deny")
      expect(todoDeny).toHaveLength(0)
    })
  })

  describe("parent session permission filtering", () => {
    it("keeps external_directory allow rules from parent", () => {
      const parent: PermissionV1.Ruleset = [
        rule("external_directory", "/some/path", "allow"),
      ]
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: parent,
        subagent: makeSubagent([]),
      })
      const extDir = result.find((r) => r.permission === "external_directory")
      expect(extDir).toEqual({ permission: "external_directory", pattern: "/some/path", action: "allow" })
    })

    it("keeps external_directory ask rules from parent", () => {
      const parent: PermissionV1.Ruleset = [
        rule("external_directory", "/other", "ask"),
      ]
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: parent,
        subagent: makeSubagent([]),
      })
      const extDir = result.find((r) => r.permission === "external_directory")
      expect(extDir).toEqual({ permission: "external_directory", pattern: "/other", action: "ask" })
    })

    it("keeps deny rules from parent regardless of permission type", () => {
      const parent: PermissionV1.Ruleset = [
        rule("bash", "rm -rf", "deny"),
        rule("edit", "/protected/*", "deny"),
      ]
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: parent,
        subagent: makeSubagent([]),
      })
      const bashDeny = result.find((r) => r.permission === "bash" && r.action === "deny")
      const editDeny = result.find((r) => r.permission === "edit" && r.action === "deny")
      expect(bashDeny).toEqual({ permission: "bash", pattern: "rm -rf", action: "deny" })
      expect(editDeny).toEqual({ permission: "edit", pattern: "/protected/*", action: "deny" })
    })

    it("filters out allow rules that are not external_directory", () => {
      const parent: PermissionV1.Ruleset = [
        rule("bash", "*", "allow"),
        rule("edit", "*", "allow"),
      ]
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: parent,
        subagent: makeSubagent([]),
      })
      const bashAllow = result.find((r) => r.permission === "bash" && r.action === "allow")
      const editAllow = result.find((r) => r.permission === "edit" && r.action === "allow")
      expect(bashAllow).toBeUndefined()
      expect(editAllow).toBeUndefined()
    })

    it("filters out ask rules that are not external_directory", () => {
      const parent: PermissionV1.Ruleset = [
        rule("bash", "*", "ask"),
      ]
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: parent,
        subagent: makeSubagent([]),
      })
      const bashAsk = result.find((r) => r.permission === "bash" && r.action === "ask")
      expect(bashAsk).toBeUndefined()
    })

    it("keeps external_directory deny rules from parent (matches both conditions)", () => {
      const parent: PermissionV1.Ruleset = [
        rule("external_directory", "/secret", "deny"),
      ]
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: parent,
        subagent: makeSubagent([]),
      })
      const extDirDeny = result.find(
        (r) => r.permission === "external_directory" && r.action === "deny",
      )
      expect(extDirDeny).toEqual({ permission: "external_directory", pattern: "/secret", action: "deny" })
    })
  })

  describe("combined parent filtering and default deny behavior", () => {
    it("returns parent filtered rules plus default denies with mixed parent rules", () => {
      const parent: PermissionV1.Ruleset = [
        rule("bash", "*", "allow"),
        rule("bash", "rm -rf", "deny"),
        rule("external_directory", "/tmp", "ask"),
        rule("edit", "*", "allow"),
      ]
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: parent,
        subagent: makeSubagent([]),
      })
      // bash allow filtered out, bash deny kept, external_directory kept, edit allow filtered out
      // + todowrite deny + task deny
      expect(result).toHaveLength(4)
      expect(result[0]).toEqual({ permission: "bash", pattern: "rm -rf", action: "deny" })
      expect(result[1]).toEqual({ permission: "external_directory", pattern: "/tmp", action: "ask" })
      expect(result[2]).toEqual({ permission: "todowrite", pattern: "*", action: "deny" })
      expect(result[3]).toEqual({ permission: "task", pattern: "*", action: "deny" })
    })

    it("returns only parent filtered rules when subagent has both task and todowrite", () => {
      const parent: PermissionV1.Ruleset = [
        rule("bash", "rm -rf", "deny"),
        rule("external_directory", "/path", "allow"),
        rule("edit", "*", "allow"),
      ]
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: parent,
        subagent: makeSubagent([
          rule("task", "*", "allow"),
          rule("todowrite", "*", "allow"),
        ]),
      })
      // bash deny kept, external_directory allowed, edit allow filtered out
      // no default denies because subagent has both
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ permission: "bash", pattern: "rm -rf", action: "deny" })
      expect(result[1]).toEqual({ permission: "external_directory", pattern: "/path", action: "allow" })
    })

    it("positions parent filtered rules before default deny rules", () => {
      const parent: PermissionV1.Ruleset = [
        rule("bash", "rm -rf", "deny"),
      ]
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: parent,
        subagent: makeSubagent([]),
      })
      expect(result[0]).toEqual({ permission: "bash", pattern: "rm -rf", action: "deny" })
      expect(result[1]).toEqual({ permission: "todowrite", pattern: "*", action: "deny" })
      expect(result[2]).toEqual({ permission: "task", pattern: "*", action: "deny" })
    })

    it("handles empty parent with subagent having only task permission", () => {
      const result = deriveSubagentSessionPermission({
        parentSessionPermission: [],
        subagent: makeSubagent([rule("task", "*", "allow")]),
      })
      expect(result).toEqual([
        { permission: "todowrite", pattern: "*", action: "deny" },
      ])
    })
  })
})
