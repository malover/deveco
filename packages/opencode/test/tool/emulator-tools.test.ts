import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import { z } from "zod"
import {
  jsonSchemaToEffectSchema,
  parseToolArgs,
  inputSchemaToZodArgs,
} from "../../src/plugin/harmony-napi-dynamic-tools"
import emulatorTools from "../../src/tool/lib/emulator_tools.json"

function validateArgs(inputSchema: unknown, args: unknown): boolean {
  const schema = jsonSchemaToEffectSchema(inputSchema)
  if (!schema) return false
  return Schema.is(schema)(args)
}

function parseTool(name: string, args: unknown) {
  const tool = emulatorTools.find((t) => t.name === name)
  return parseToolArgs(args, tool?.inputSchema)
}

describe("emulator tools data", () => {
  it("contains 1 tool definition", () => {
    expect(emulatorTools).toHaveLength(1)
  })

  it.each(emulatorTools.map((tool) => [tool.name, tool]))(
    "has %s with string name, string description, and object inputSchema",
    (_name, tool) => {
      expect(typeof tool.name).toBe("string")
      expect(tool.name.length).toBeGreaterThan(0)
      expect(typeof tool.description).toBe("string")
      expect(tool.description!.length).toBeGreaterThan(0)
      expect(typeof tool.inputSchema).toBe("object")
      expect(tool.inputSchema).not.toBeNull()
      expect((tool.inputSchema as { type: string }).type).toBe("object")
    },
  )

  it("defines expected tool names", () => {
    const names = emulatorTools.map((t) => t.name)
    expect(names).toEqual(["check_ets_files"])
  })

  it("declares required fields only for tools that need them", () => {
    const withRequired = emulatorTools
      .filter((t) => (t.inputSchema as { required?: string[] }).required?.length)
      .map((t) => t.name)
    expect(withRequired).toEqual(["check_ets_files"])
  })
})

describe("parameter schema validation", () => {
  describe("check_ets_files", () => {
    const schema = emulatorTools.find((t) => t.name === "check_ets_files")!.inputSchema

    it("accepts valid files array", () => {
      expect(validateArgs(schema, { files: ["a.ets", "b.ets"] })).toBe(true)
    })

    it("accepts empty files array", () => {
      expect(validateArgs(schema, { files: [] })).toBe(true)
    })

    it("rejects missing files field", () => {
      expect(validateArgs(schema, {})).toBe(false)
    })

    it("rejects files as string instead of array", () => {
      expect(validateArgs(schema, { files: "not-array" })).toBe(false)
    })

    it("rejects files with non-string items", () => {
      expect(validateArgs(schema, { files: [123] })).toBe(false)
    })
  })
})

describe("parseToolArgs", () => {
  describe("check_ets_files", () => {
    it("accepts valid object args", () => {
      const result = parseTool("check_ets_files", { files: ["src/Main.ets"] })
      expect(result.files).toEqual(["src/Main.ets"])
    })

    it("accepts argsJson string", () => {
      const result = parseTool("check_ets_files", { argsJson: '{"files":["a.ets"]}' })
      expect(result.files).toEqual(["a.ets"])
    })

    it("rejects missing required files via object args", () => {
      expect(() => parseTool("check_ets_files", {})).toThrow("Args validation failed:")
    })

    it("rejects missing required files via argsJson", () => {
      expect(() => parseTool("check_ets_files", { argsJson: "{}" })).toThrow("Args validation failed:")
    })

    it("rejects wrong type via argsJson", () => {
      expect(() => parseTool("check_ets_files", { argsJson: '{"files":"not-array"}' })).toThrow(
        "Args validation failed:",
      )
    })

    it("rejects non-object argsJson string", () => {
      expect(() => parseTool("check_ets_files", { argsJson: '"hello"' })).toThrow(
        "argsJson must be a JSON object string",
      )
    })

    it("rejects array argsJson", () => {
      expect(() => parseTool("check_ets_files", { argsJson: "[1,2]" })).toThrow(
        "argsJson must be a JSON object string",
      )
    })

    it("rejects malformed JSON in argsJson", () => {
      expect(() => parseTool("check_ets_files", { argsJson: "{invalid" })).toThrow()
    })
  })
})

describe("inputSchemaToZodArgs", () => {
  describe("check_ets_files", () => {
    it("generates required files field as non-optional ZodArray", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "check_ets_files")!.inputSchema,
      )
      expect(args.files).toBeDefined()
      expect(args.files).not.toBeInstanceOf(z.ZodOptional)
      expect(args.files).toBeInstanceOf(z.ZodArray)
    })

    it("validates files accepts string array", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "check_ets_files")!.inputSchema,
      )
      expect(args.files.safeParse(["a.ets", "b.ets"]).success).toBe(true)
    })

    it("validates files rejects non-array", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "check_ets_files")!.inputSchema,
      )
      expect(args.files.safeParse("not-array").success).toBe(false)
    })
  })
})
