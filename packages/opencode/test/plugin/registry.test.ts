import { describe, expect, it } from "bun:test"
import { ProviderV2 } from "@opencode-ai/core/provider"
import z from "zod"
import {
  webSearchEnabled,
  isZodType,
  isPluginTool,
  isJsonSchemaDefinition,
  legacyJsonSchema,
  zodJsonSchema,
  normalizeZodJsonSchema,
} from "../../src/tool/registry"

describe("webSearchEnabled", () => {
  it("returns true when provider is opencode", () => {
    const result = webSearchEnabled(ProviderV2.ID.opencode)
    expect(result).toBe(true)
  })

  it("returns true when exa flag is true", () => {
    const customProvider = "custom-provider" as ProviderV2.ID
    const result = webSearchEnabled(customProvider, { exa: true, parallel: false })
    expect(result).toBe(true)
  })

  it("returns true when parallel flag is true", () => {
    const customProvider = "custom-provider" as ProviderV2.ID
    const result = webSearchEnabled(customProvider, { exa: false, parallel: true })
    expect(result).toBe(true)
  })

  it("returns false when provider is not opencode and no flags set", () => {
    const customProvider = "custom-provider" as ProviderV2.ID
    const result = webSearchEnabled(customProvider, { exa: false, parallel: false })
    expect(result).toBe(false)
  })

  it("returns false when no flags object provided and provider is not opencode", () => {
    const customProvider = "anthropic" as ProviderV2.ID
    const result = webSearchEnabled(customProvider)
    expect(result).toBe(false)
  })
})

describe("isZodType", () => {
  it("accepts a valid zod schema", () => {
    const schema = z.string()
    expect(isZodType(schema)).toBe(true)
  })

  it("accepts a complex zod object schema", () => {
    const schema = z.object({ name: z.string(), age: z.number() })
    expect(isZodType(schema)).toBe(true)
  })

  it("rejects a plain object without _zod", () => {
    expect(isZodType({ foo: "bar" })).toBe(false)
  })

  it("rejects null", () => {
    expect(isZodType(null)).toBe(false)
  })

  it("rejects string", () => {
    expect(isZodType("not a zod")).toBe(false)
  })

  it("rejects number", () => {
    expect(isZodType(42)).toBe(false)
  })
})

describe("isPluginTool", () => {
  it("accepts a valid plugin tool definition", () => {
    const tool = {
      args: { name: { type: "string" } },
      description: "test tool",
      execute: async () => ({ output: "ok", metadata: {} }),
    }
    expect(isPluginTool(tool)).toBe(true)
  })

  it("rejects when args is missing", () => {
    const tool = {
      description: "test tool",
      execute: async () => ({ output: "ok" }),
    }
    expect(isPluginTool(tool)).toBe(false)
  })

  it("rejects when description is missing", () => {
    const tool = {
      args: {},
      execute: async () => ({ output: "ok" }),
    }
    expect(isPluginTool(tool)).toBe(false)
  })

  it("rejects when execute is missing", () => {
    const tool = {
      args: {},
      description: "test tool",
    }
    expect(isPluginTool(tool)).toBe(false)
  })

  it("rejects null", () => {
    expect(isPluginTool(null)).toBe(false)
  })

  it("rejects string", () => {
    expect(isPluginTool("tool")).toBe(false)
  })
})

describe("isJsonSchemaDefinition", () => {
  it("accepts boolean true", () => {
    expect(isJsonSchemaDefinition(true)).toBe(true)
  })

  it("accepts boolean false", () => {
    expect(isJsonSchemaDefinition(false)).toBe(true)
  })

  it("accepts a JSON Schema object", () => {
    expect(isJsonSchemaDefinition({ type: "string" })).toBe(true)
  })

  it("accepts an empty object", () => {
    expect(isJsonSchemaDefinition({})).toBe(true)
  })

  it("rejects null", () => {
    expect(isJsonSchemaDefinition(null)).toBe(false)
  })

  it("rejects array", () => {
    expect(isJsonSchemaDefinition([1, 2, 3])).toBe(false)
  })

  it("rejects string", () => {
    expect(isJsonSchemaDefinition("string")).toBe(false)
  })

  it("rejects number", () => {
    expect(isJsonSchemaDefinition(42)).toBe(false)
  })
})

describe("legacyJsonSchema", () => {
  it("filters entries to only JSON Schema definitions", () => {
    const entries: [string, unknown][] = [
      ["name", { type: "string", description: "user name" }],
      ["count", { type: "number" }],
    ]
    const result = legacyJsonSchema(entries)
    expect(result.type).toBe("object")
    expect(result.properties).toEqual({
      name: { type: "string", description: "user name" },
      count: { type: "number" },
    })
    expect(result.required).toEqual(["name", "count"])
  })

  it("filters out non-schema entries", () => {
    const entries: [string, unknown][] = [
      ["name", { type: "string" }],
      ["handler", () => {}],
      ["value", "not a schema"],
    ]
    const result = legacyJsonSchema(entries)
    expect(result.properties).toEqual({ name: { type: "string" } })
    expect(result.required).toEqual(["name"])
  })

  it("accepts boolean JSON Schema definitions", () => {
    const entries: [string, unknown][] = [
      ["always", true],
      ["never", false],
    ]
    const result = legacyJsonSchema(entries)
    expect(result.properties).toEqual({ always: true, never: false })
    expect(result.required).toEqual(["always", "never"])
  })

  it("returns empty properties when no valid entries", () => {
    const entries: [string, unknown][] = [
      ["bad1", "string value"],
      ["bad2", 123],
    ]
    const result = legacyJsonSchema(entries)
    expect(result.properties).toEqual({})
    expect(result.required).toEqual([])
  })
})

describe("zodJsonSchema and normalizeZodJsonSchema", () => {
  it("converts a simple zod object to JSON Schema", () => {
    const schema = z.object({ name: z.string(), age: z.number() })
    const result = zodJsonSchema(schema)
    expect(result.type).toBe("object")
    expect(result.properties).toBeDefined()
    expect(result.properties?.name).toBeDefined()
    expect(result.properties?.age).toBeDefined()
  })

  it("converts zod schema with optional fields", () => {
    const schema = z.object({ name: z.string(), desc: z.string().optional() })
    const result = zodJsonSchema(schema)
    expect(result.type).toBe("object")
    expect(result.required).toContain("name")
  })

  it("normalizes arrays by mapping items", () => {
    const input = [{ type: "string" }, { type: "number" }]
    const result = normalizeZodJsonSchema(input)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual([{ type: "string" }, { type: "number" }])
  })

  it("normalizes nested objects", () => {
    const input = { properties: { nested: { type: "object" } } }
    const result = normalizeZodJsonSchema(input) as Record<string, unknown>
    expect(result.properties).toEqual({ nested: { type: "object" } })
  })

  it("returns primitives unchanged", () => {
    expect(normalizeZodJsonSchema("string")).toBe("string")
    expect(normalizeZodJsonSchema(42)).toBe(42)
    expect(normalizeZodJsonSchema(null)).toBe(null)
    expect(normalizeZodJsonSchema(undefined)).toBe(undefined)
  })

  it("keeps exclusiveMaximum when it is a numeric value", () => {
    const input = { type: "number", exclusiveMaximum: 100 }
    const result = normalizeZodJsonSchema(input) as Record<string, unknown>
    expect(result.exclusiveMaximum).toBe(100)
  })

  it("strips exclusiveMaximum when it is a boolean", () => {
    const input = { type: "number", exclusiveMaximum: true }
    const result = normalizeZodJsonSchema(input) as Record<string, unknown>
    expect(result).not.toHaveProperty("exclusiveMaximum")
  })

  it("keeps exclusiveMinimum when it is a numeric value", () => {
    const input = { type: "number", exclusiveMinimum: 0 }
    const result = normalizeZodJsonSchema(input) as Record<string, unknown>
    expect(result.exclusiveMinimum).toBe(0)
  })

  it("strips exclusiveMinimum when it is a boolean", () => {
    const input = { type: "number", exclusiveMinimum: false }
    const result = normalizeZodJsonSchema(input) as Record<string, unknown>
    expect(result).not.toHaveProperty("exclusiveMinimum")
  })

  it("strips both exclusive boolean fields while keeping other fields", () => {
    const input = {
      type: "integer",
      exclusiveMinimum: true,
      exclusiveMaximum: false,
      minimum: 1,
      maximum: 100,
    }
    const result = normalizeZodJsonSchema(input) as Record<string, unknown>
    expect(result).toEqual({ type: "integer", minimum: 1, maximum: 100 })
  })

  it("recursively filters exclusive boolean in nested objects", () => {
    const input = {
      properties: {
        foo: { type: "number", exclusiveMaximum: true },
      },
    }
    const result = normalizeZodJsonSchema(input) as Record<string, unknown>
    const properties = result.properties as Record<string, unknown>
    const foo = properties.foo as Record<string, unknown>
    expect(foo).toEqual({ type: "number" })
  })

  it("recursively filters exclusive boolean inside arrays", () => {
    const input = [{ exclusiveMinimum: true, type: "number" }]
    const result = normalizeZodJsonSchema(input) as Record<string, unknown>[]
    expect(result[0]).toEqual({ type: "number" })
  })

  it("returns empty object for empty input object", () => {
    const result = normalizeZodJsonSchema({}) as Record<string, unknown>
    expect(Object.keys(result)).toEqual([])
  })
})
