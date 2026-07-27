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
  it("contains 6 tool definitions", () => {
    expect(emulatorTools).toHaveLength(6)
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
    expect(names).toEqual([
      "check_ets_files",
      "build_project",
      "start_app",
      "verify_ui",
      "save_ui_screenshot",
      "get_ui_verification_log",
    ])
  })

  it("declares required fields only for tools that need them", () => {
    const withRequired = emulatorTools
      .filter((t) => (t.inputSchema as { required?: string[] }).required?.length)
      .map((t) => t.name)
    expect(withRequired).toEqual(["check_ets_files", "verify_ui", "save_ui_screenshot", "get_ui_verification_log"])
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

  describe("build_project", () => {
    const schema = emulatorTools.find((t) => t.name === "build_project")!.inputSchema

    it("accepts empty object with all optional fields", () => {
      expect(validateArgs(schema, {})).toBe(true)
    })

    it("accepts build_mode string", () => {
      expect(validateArgs(schema, { build_mode: "debug" })).toBe(true)
    })

    it("accepts clean boolean", () => {
      expect(validateArgs(schema, { clean: true })).toBe(true)
    })

    it("accepts enable_inspector_source_jump boolean", () => {
      expect(validateArgs(schema, { enable_inspector_source_jump: false })).toBe(true)
    })

    it("accepts log_path string", () => {
      expect(validateArgs(schema, { log_path: "/tmp/build.log" })).toBe(true)
    })

    it("accepts module string", () => {
      expect(validateArgs(schema, { module: "entry@default" })).toBe(true)
    })

    it("accepts product string", () => {
      expect(validateArgs(schema, { product: "default" })).toBe(true)
    })

    it("accepts all fields combined", () => {
      expect(
        validateArgs(schema, {
          build_mode: "release",
          clean: true,
          enable_inspector_source_jump: false,
          log_path: "/tmp/log",
          module: "entry",
          product: "default",
        }),
      ).toBe(true)
    })

    it("rejects build_mode as number", () => {
      expect(validateArgs(schema, { build_mode: 42 })).toBe(false)
    })

    it("rejects clean as string", () => {
      expect(validateArgs(schema, { clean: "true" })).toBe(false)
    })
  })

  describe("start_app", () => {
    const schema = emulatorTools.find((t) => t.name === "start_app")!.inputSchema

    it("accepts empty object with all optional fields", () => {
      expect(validateArgs(schema, {})).toBe(true)
    })

    it("accepts ability string", () => {
      expect(validateArgs(schema, { ability: "EntryAbility" })).toBe(true)
    })

    it("accepts hvd string", () => {
      expect(validateArgs(schema, { hvd: "127.0.0.1:5555" })).toBe(true)
    })

    it("accepts module string", () => {
      expect(validateArgs(schema, { module: "entry" })).toBe(true)
    })

    it("accepts target string", () => {
      expect(validateArgs(schema, { target: "default" })).toBe(true)
    })

    it("accepts all fields combined", () => {
      expect(
        validateArgs(schema, { ability: "MainAbility", hvd: "emulator-1", module: "entry", target: "default" }),
      ).toBe(true)
    })

    it("rejects ability as number", () => {
      expect(validateArgs(schema, { ability: 123 })).toBe(false)
    })

    it("rejects hvd as boolean", () => {
      expect(validateArgs(schema, { hvd: true })).toBe(false)
    })
  })

  describe("verify_ui", () => {
    const schema = emulatorTools.find((t) => t.name === "verify_ui")!.inputSchema

    it("accepts valid testPlan only", () => {
      expect(validateArgs(schema, { testPlan: "click button A" })).toBe(true)
    })

    it("accepts testPlan with optional fields", () => {
      expect(
        validateArgs(schema, { testPlan: "navigate menu", bundleName: "com.example", device: "emulator", freshStart: true }),
      ).toBe(true)
    })

    it("rejects missing testPlan", () => {
      expect(validateArgs(schema, {})).toBe(false)
    })

    it("rejects testPlan as number", () => {
      expect(validateArgs(schema, { testPlan: 123 })).toBe(false)
    })

    it("rejects bundleName as number", () => {
      expect(validateArgs(schema, { testPlan: "ok", bundleName: 123 })).toBe(false)
    })

    it("rejects freshStart as string", () => {
      expect(validateArgs(schema, { testPlan: "ok", freshStart: "true" })).toBe(false)
    })
  })

  describe("save_ui_screenshot", () => {
    const schema = emulatorTools.find((t) => t.name === "save_ui_screenshot")!.inputSchema

    it("accepts valid id and dirname", () => {
      expect(validateArgs(schema, { id: "abc", dirname: "/tmp/screenshots" })).toBe(true)
    })

    it("rejects missing id", () => {
      expect(validateArgs(schema, { dirname: "/tmp" })).toBe(false)
    })

    it("rejects missing dirname", () => {
      expect(validateArgs(schema, { id: "abc" })).toBe(false)
    })

    it("rejects both missing", () => {
      expect(validateArgs(schema, {})).toBe(false)
    })

    it("rejects id as number", () => {
      expect(validateArgs(schema, { id: 123, dirname: "/tmp" })).toBe(false)
    })

    it("rejects dirname as boolean", () => {
      expect(validateArgs(schema, { id: "abc", dirname: true })).toBe(false)
    })
  })

  describe("get_ui_verification_log", () => {
    const schema = emulatorTools.find((t) => t.name === "get_ui_verification_log")!.inputSchema

    it("accepts valid id only", () => {
      expect(validateArgs(schema, { id: "verification-123" })).toBe(true)
    })

    it("accepts id with maxLogSize integer", () => {
      expect(validateArgs(schema, { id: "v1", maxLogSize: 10000 })).toBe(true)
    })

    it("accepts maxLogSize of -1 for unlimited", () => {
      expect(validateArgs(schema, { id: "v1", maxLogSize: -1 })).toBe(true)
    })

    it("accepts id with searchKeywords string", () => {
      expect(validateArgs(schema, { id: "v1", searchKeywords: "error" })).toBe(true)
    })

    it("accepts all fields", () => {
      expect(validateArgs(schema, { id: "v1", maxLogSize: 5000, searchKeywords: "warn" })).toBe(true)
    })

    it("rejects missing id", () => {
      expect(validateArgs(schema, {})).toBe(false)
    })

    it("rejects maxLogSize as string", () => {
      expect(validateArgs(schema, { id: "v1", maxLogSize: "100" })).toBe(false)
    })

    it("rejects searchKeywords as number", () => {
      expect(validateArgs(schema, { id: "v1", searchKeywords: 42 })).toBe(false)
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

  describe("build_project", () => {
    it("accepts empty object for all-optional schema", () => {
      const result = parseTool("build_project", {})
      expect(result).toEqual({})
    })

    it("accepts optional fields via object args", () => {
      const result = parseTool("build_project", { build_mode: "release", clean: true })
      expect(result.build_mode).toBe("release")
      expect(result.clean).toBe(true)
    })

    it("accepts argsJson with optional fields", () => {
      const result = parseTool("build_project", { argsJson: '{"build_mode":"debug","module":"entry"}' })
      expect(result.build_mode).toBe("debug")
      expect(result.module).toBe("entry")
    })

    it("rejects wrong type via object args", () => {
      expect(() => parseTool("build_project", { build_mode: 123 })).toThrow("Args validation failed:")
    })

    it("rejects wrong type via argsJson", () => {
      expect(() => parseTool("build_project", { argsJson: '{"clean":"not-bool"}' })).toThrow(
        "Args validation failed:",
      )
    })
  })

  describe("start_app", () => {
    it("accepts empty object for all-optional schema", () => {
      const result = parseTool("start_app", {})
      expect(result).toEqual({})
    })

    it("accepts optional args via object", () => {
      const result = parseTool("start_app", { ability: "EntryAbility", target: "default" })
      expect(result.ability).toBe("EntryAbility")
      expect(result.target).toBe("default")
    })

    it("rejects wrong type via object args", () => {
      expect(() => parseTool("start_app", { ability: true })).toThrow("Args validation failed:")
    })
  })

  describe("verify_ui", () => {
    it("accepts valid object args with required testPlan", () => {
      const result = parseTool("verify_ui", { testPlan: "click login button" })
      expect(result.testPlan).toBe("click login button")
    })

    it("accepts testPlan with all optional fields", () => {
      const result = parseTool("verify_ui", {
        testPlan: "swipe left",
        bundleName: "com.example.app",
        device: "127.0.0.1:5555",
        freshStart: true,
      })
      expect(result.testPlan).toBe("swipe left")
      expect(result.bundleName).toBe("com.example.app")
      expect(result.device).toBe("127.0.0.1:5555")
      expect(result.freshStart).toBe(true)
    })

    it("rejects missing testPlan from object args", () => {
      expect(() => parseTool("verify_ui", {})).toThrow("Args validation failed:")
    })

    it("rejects missing testPlan from argsJson", () => {
      expect(() => parseTool("verify_ui", { argsJson: '{"bundleName":"com.app"}' })).toThrow(
        "Args validation failed:",
      )
    })

    it("accepts valid argsJson with testPlan", () => {
      const result = parseTool("verify_ui", { argsJson: '{"testPlan":"navigate settings"}' })
      expect(result.testPlan).toBe("navigate settings")
    })

    it("rejects wrong type for testPlan via object args", () => {
      expect(() => parseTool("verify_ui", { testPlan: 42 })).toThrow("Args validation failed:")
    })
  })

  describe("save_ui_screenshot", () => {
    it("accepts valid id and dirname via object", () => {
      const result = parseTool("save_ui_screenshot", { id: "abc-123", dirname: "/tmp/screenshots" })
      expect(result.id).toBe("abc-123")
      expect(result.dirname).toBe("/tmp/screenshots")
    })

    it("rejects missing id from object args", () => {
      expect(() => parseTool("save_ui_screenshot", { dirname: "/tmp" })).toThrow("Args validation failed:")
    })

    it("rejects missing dirname from object args", () => {
      expect(() => parseTool("save_ui_screenshot", { id: "abc" })).toThrow("Args validation failed:")
    })

    it("accepts valid argsJson", () => {
      const result = parseTool("save_ui_screenshot", { argsJson: '{"id":"v1","dirname":"/tmp"}' })
      expect(result.id).toBe("v1")
      expect(result.dirname).toBe("/tmp")
    })

    it("rejects missing required fields from argsJson", () => {
      expect(() => parseTool("save_ui_screenshot", { argsJson: '{"id":"v1"}' })).toThrow(
        "Args validation failed:",
      )
    })

    it("rejects null args returns empty object", () => {
      const result = parseTool("save_ui_screenshot", null)
      expect(result).toEqual({})
    })

    it("rejects undefined args returns empty object", () => {
      const result = parseTool("save_ui_screenshot", undefined)
      expect(result).toEqual({})
    })
  })

  describe("get_ui_verification_log", () => {
    it("accepts valid id only via object", () => {
      const result = parseTool("get_ui_verification_log", { id: "log-123" })
      expect(result.id).toBe("log-123")
    })

    it("accepts id with maxLogSize", () => {
      const result = parseTool("get_ui_verification_log", { id: "log-1", maxLogSize: 10000 })
      expect(result.id).toBe("log-1")
      expect(result.maxLogSize).toBe(10000)
    })

    it("accepts id with searchKeywords", () => {
      const result = parseTool("get_ui_verification_log", { id: "log-1", searchKeywords: "error" })
      expect(result.id).toBe("log-1")
      expect(result.searchKeywords).toBe("error")
    })

    it("accepts id with maxLogSize -1 for unlimited", () => {
      const result = parseTool("get_ui_verification_log", { id: "log-1", maxLogSize: -1 })
      expect(result.maxLogSize).toBe(-1)
    })

    it("rejects missing id from object args", () => {
      expect(() => parseTool("get_ui_verification_log", {})).toThrow("Args validation failed:")
    })

    it("rejects maxLogSize as string", () => {
      expect(() => parseTool("get_ui_verification_log", { id: "v1", maxLogSize: "100" })).toThrow(
        "Args validation failed:",
      )
    })

    it("accepts valid argsJson", () => {
      const result = parseTool("get_ui_verification_log", { argsJson: '{"id":"v1","maxLogSize":5000}' })
      expect(result.id).toBe("v1")
      expect(result.maxLogSize).toBe(5000)
    })

    it("rejects missing id from argsJson", () => {
      expect(() => parseTool("get_ui_verification_log", { argsJson: '{"maxLogSize":100}' })).toThrow(
        "Args validation failed:",
      )
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

  describe("build_project", () => {
    it("generates all fields as optional", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "build_project")!.inputSchema,
      )
      for (const key of ["build_mode", "clean", "enable_inspector_source_jump", "log_path", "module", "product"]) {
        expect(args[key]).toBeDefined()
        expect(args[key]).toBeInstanceOf(z.ZodOptional)
      }
    })

    it("generates correct types for each field", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "build_project")!.inputSchema,
      )
      // build_mode: nullable string → optional
      expect((args.build_mode as z.ZodOptional<z.ZodTypeAny>).unwrap()).toBeInstanceOf(z.ZodNullable)
      // clean: nullable boolean → optional
      expect((args.clean as z.ZodOptional<z.ZodTypeAny>).unwrap()).toBeInstanceOf(z.ZodNullable)
    })
  })

  describe("start_app", () => {
    it("generates all fields as optional", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "start_app")!.inputSchema,
      )
      for (const key of ["ability", "hvd", "module", "target"]) {
        expect(args[key]).toBeDefined()
        expect(args[key]).toBeInstanceOf(z.ZodOptional)
      }
    })
  })

  describe("verify_ui", () => {
    it("generates required testPlan as non-optional", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "verify_ui")!.inputSchema,
      )
      expect(args.testPlan).toBeDefined()
      expect(args.testPlan).not.toBeInstanceOf(z.ZodOptional)
    })

    it("generates optional fields as ZodOptional", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "verify_ui")!.inputSchema,
      )
      expect(args.bundleName).toBeInstanceOf(z.ZodOptional)
      expect(args.device).toBeInstanceOf(z.ZodOptional)
      expect(args.freshStart).toBeInstanceOf(z.ZodOptional)
    })

    it("validates testPlan accepts string", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "verify_ui")!.inputSchema,
      )
      expect(args.testPlan.safeParse("navigate settings").success).toBe(true)
    })

    it("validates testPlan rejects number", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "verify_ui")!.inputSchema,
      )
      expect(args.testPlan.safeParse(42).success).toBe(false)
    })
  })

  describe("save_ui_screenshot", () => {
    it("generates required fields as non-optional strings", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "save_ui_screenshot")!.inputSchema,
      )
      expect(args.id).toBeDefined()
      expect(args.id).not.toBeInstanceOf(z.ZodOptional)
      expect(args.dirname).toBeDefined()
      expect(args.dirname).not.toBeInstanceOf(z.ZodOptional)
    })

    it("validates id accepts string", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "save_ui_screenshot")!.inputSchema,
      )
      expect(args.id.safeParse("test-id").success).toBe(true)
    })

    it("validates dirname accepts string", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "save_ui_screenshot")!.inputSchema,
      )
      expect(args.dirname.safeParse("/tmp/screenshots").success).toBe(true)
    })
  })

  describe("get_ui_verification_log", () => {
    it("generates id as required and optional fields as optional", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "get_ui_verification_log")!.inputSchema,
      )
      expect(args.id).toBeDefined()
      expect(args.id).not.toBeInstanceOf(z.ZodOptional)
      expect(args.maxLogSize).toBeInstanceOf(z.ZodOptional)
      expect(args.searchKeywords).toBeInstanceOf(z.ZodOptional)
    })

    it("generates maxLogSize as number type", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "get_ui_verification_log")!.inputSchema,
      )
      const inner = (args.maxLogSize as z.ZodOptional<z.ZodTypeAny>).unwrap()
      expect((inner as z.ZodNullable<z.ZodTypeAny>).unwrap()).toBeInstanceOf(z.ZodNumber)
    })

    it("validates maxLogSize accepts -1", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "get_ui_verification_log")!.inputSchema,
      )
      expect(args.maxLogSize.safeParse(-1).success).toBe(true)
    })

    it("validates searchKeywords accepts string", () => {
      const args = inputSchemaToZodArgs(
        emulatorTools.find((t) => t.name === "get_ui_verification_log")!.inputSchema,
      )
      expect(args.searchKeywords.safeParse("error").success).toBe(true)
    })
  })
})
