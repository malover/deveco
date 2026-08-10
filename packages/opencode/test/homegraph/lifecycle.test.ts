import { describe, expect, test } from "bun:test"
import { ensureHomeGraphIndex } from "@/homegraph/lifecycle"

describe("HomeGraph index lifecycle", () => {
  test("initializes a missing index", async () => {
    const calls: string[][] = []
    const action = await ensureHomeGraphIndex({
      root: "/project",
      hasIndex: false,
      check: async () => true,
      require: async (args) => {
        calls.push(args)
      },
    })

    expect(action).toBe("initialized")
    expect(calls).toEqual([["init", "-i", "/project"]])
  })

  test("syncs a healthy index without rebuilding", async () => {
    const checked: string[][] = []
    const required: string[][] = []
    const action = await ensureHomeGraphIndex({
      root: "/project",
      hasIndex: true,
      check: async (args) => {
        checked.push(args)
        return true
      },
      require: async (args) => {
        required.push(args)
      },
    })

    expect(action).toBe("synced")
    expect(checked).toEqual([
      ["status", "/project"],
      ["sync", "/project"],
    ])
    expect(required).toEqual([])
  })

  test("rebuilds an invalid or unsyncable index", async () => {
    const required: string[][] = []
    const action = await ensureHomeGraphIndex({
      root: "/project",
      hasIndex: true,
      check: async () => false,
      require: async (args) => {
        required.push(args)
      },
    })

    expect(action).toBe("rebuilt")
    expect(required).toEqual([["index", "--force", "/project"]])
  })
})
