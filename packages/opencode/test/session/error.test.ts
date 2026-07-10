import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { NamedError } from "@opencode-ai/core/util/error"
import {
  AuthError,
  MessageError,
  OutputLengthError,
  Shared,
  SharedSchema,
} from "../../src/session/message-error"

// ── OutputLengthError ────────────────────────────────────────────────────────

describe("OutputLengthError", () => {
  test("constructs with empty data and default name", () => {
    const err = new OutputLengthError({})
    expect(err.name).toBe("MessageOutputLengthError")
    expect(err.data).toEqual({})
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(NamedError)
  })

  test("preserves cause when provided", () => {
    const cause = new Error("underlying")
    const err = new OutputLengthError({}, { cause })
    expect(err.cause).toBe(cause)
  })

  test("has static tag equal to name literal", () => {
    expect(OutputLengthError.tag).toBe("MessageOutputLengthError")
  })

  test("isInstance returns true for matching name", () => {
    const err = new OutputLengthError({})
    expect(OutputLengthError.isInstance(err)).toBe(true)
  })

  test("isInstance returns true for plain object with matching name", () => {
    expect(OutputLengthError.isInstance({ name: "MessageOutputLengthError" })).toBe(true)
  })

  test("isInstance returns false for different name", () => {
    expect(OutputLengthError.isInstance({ name: "OtherError" })).toBe(false)
  })

  test("isInstance returns false for null", () => {
    expect(OutputLengthError.isInstance(null)).toBe(false)
  })

  test("isInstance returns false for undefined", () => {
    expect(OutputLengthError.isInstance(undefined)).toBe(false)
  })

  test("isInstance returns false for non-object", () => {
    expect(OutputLengthError.isInstance("string")).toBe(false)
    expect(OutputLengthError.isInstance(42)).toBe(false)
  })

  test("isInstance returns false for object without name", () => {
    expect(OutputLengthError.isInstance({ data: {} })).toBe(false)
  })

  test("toObject returns serializable representation", () => {
    const err = new OutputLengthError({})
    expect(err.toObject()).toEqual({ name: "MessageOutputLengthError", data: {} })
  })

  test("schema returns a Schema.Top", () => {
    const err = new OutputLengthError({})
    const schema = err.schema()
    expect(schema).toBeDefined()
  })

  test("Schema and EffectSchema are equal", () => {
    expect(OutputLengthError.Schema).toBe(OutputLengthError.EffectSchema)
  })
})

// ── AuthError ────────────────────────────────────────────────────────────────

describe("AuthError", () => {
  test("constructs with providerID and message", () => {
    const err = new AuthError({ providerID: "openai", message: "Invalid API key" })
    expect(err.name).toBe("ProviderAuthError")
    expect(err.data.providerID).toBe("openai")
    expect(err.data.message).toBe("Invalid API key")
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(NamedError)
  })

  test("preserves cause when provided", () => {
    const cause = new Error("upstream auth failure")
    const err = new AuthError({ providerID: "anthropic", message: "expired" }, { cause })
    expect(err.cause).toBe(cause)
  })

  test("has static tag equal to name literal", () => {
    expect(AuthError.tag).toBe("ProviderAuthError")
  })

  test("isInstance returns true for matching name", () => {
    const err = new AuthError({ providerID: "p", message: "m" })
    expect(AuthError.isInstance(err)).toBe(true)
  })

  test("isInstance returns true for plain object with matching name", () => {
    expect(AuthError.isInstance({ name: "ProviderAuthError" })).toBe(true)
  })

  test("isInstance returns false for different name", () => {
    expect(AuthError.isInstance({ name: "OtherError" })).toBe(false)
  })

  test("isInstance returns false for null", () => {
    expect(AuthError.isInstance(null)).toBe(false)
  })

  test("isInstance returns false for undefined", () => {
    expect(AuthError.isInstance(undefined)).toBe(false)
  })

  test("isInstance returns false for non-object", () => {
    expect(AuthError.isInstance(0)).toBe(false)
    expect(AuthError.isInstance(true)).toBe(false)
  })

  test("isInstance returns false for object without name", () => {
    expect(AuthError.isInstance({ data: {} })).toBe(false)
  })

  test("isInstance distinguishes from OutputLengthError", () => {
    const outErr = new OutputLengthError({})
    expect(AuthError.isInstance(outErr)).toBe(false)
    expect(OutputLengthError.isInstance(outErr)).toBe(true)
  })

  test("toObject returns serializable representation", () => {
    const err = new AuthError({ providerID: "x", message: "y" })
    expect(err.toObject()).toEqual({ name: "ProviderAuthError", data: { providerID: "x", message: "y" } })
  })

  test("schema returns a Schema.Top", () => {
    const err = new AuthError({ providerID: "i", message: "m" })
    expect(err.schema()).toBeDefined()
  })

  test("Schema and EffectSchema are equal", () => {
    expect(AuthError.Schema).toBe(AuthError.EffectSchema)
  })
})

// ── Shared / SharedSchema ────────────────────────────────────────────────────

describe("Shared", () => {
  test("is a readonly tuple of length 3", () => {
    expect(Shared).toHaveLength(3)
  })

  test("contains AuthError.EffectSchema, Unknown.EffectSchema, and OutputLengthError.EffectSchema in order", () => {
    expect(Shared[0]).toBe(AuthError.EffectSchema)
    expect(Shared[1]).toBe(NamedError.Unknown.EffectSchema)
    expect(Shared[2]).toBe(OutputLengthError.EffectSchema)
  })
})

describe("SharedSchema", () => {
  const decode = Schema.decodeUnknownSync(SharedSchema)
  const encode = Schema.encodeSync(SharedSchema)

  test("decodes AuthError-shaped input", () => {
    const input = { name: "ProviderAuthError", data: { providerID: "a", message: "b" } }
    const decoded = decode(input)
    expect(AuthError.isInstance(decoded)).toBe(true)
    expect((decoded as InstanceType<typeof AuthError>).data.providerID).toBe("a")
  })

  test("decodes UnknownError-shaped input (required message, optional ref)", () => {
    const input = { name: "UnknownError", data: { message: "boom" } }
    const decoded = decode(input)
    expect(NamedError.Unknown.isInstance(decoded)).toBe(true)
    expect((decoded as InstanceType<typeof NamedError.Unknown>).data.message).toBe("boom")
  })

  test("decodes UnknownError-shaped input with ref", () => {
    const input = { name: "UnknownError", data: { message: "boom", ref: "ref-42" } }
    const decoded = decode(input)
    expect((decoded as InstanceType<typeof NamedError.Unknown>).data.ref).toBe("ref-42")
  })

  test("decodes OutputLengthError-shaped input", () => {
    const input = { name: "MessageOutputLengthError", data: {} }
    const decoded = decode(input)
    expect(OutputLengthError.isInstance(decoded)).toBe(true)
  })

  test("throws ParseError on unknown tag", () => {
    const input = { name: "NoSuchError", data: {} }
    expect(() => decode(input)).toThrow()
  })

  test("throws ParseError on malformed AuthError data", () => {
    const input = { name: "ProviderAuthError", data: { providerID: 123, message: "ok" } }
    expect(() => decode(input)).toThrow()
  })

  test("round-trips AuthError through encode then decode", () => {
    const err = new AuthError({ providerID: "p", message: "m" })
    const encoded = encode(err) as Record<string, unknown>
    expect(encoded.name).toBe("ProviderAuthError")
    const decoded = decode(encoded) as { name: string; data: { providerID: string; message: string } }
    expect(AuthError.isInstance(decoded)).toBe(true)
    expect(decoded).toEqual(err.toObject())
  })

  test("round-trips OutputLengthError through encode then decode", () => {
    const err = new OutputLengthError({})
    const encoded = encode(err) as Record<string, unknown>
    expect(encoded.name).toBe("MessageOutputLengthError")
    const decoded = decode(encoded)
    expect(OutputLengthError.isInstance(decoded)).toBe(true)
  })
})

// ── MessageError namespace ───────────────────────────────────────────────────

describe("MessageError namespace", () => {
  test("exposes AuthError as same reference as direct import", () => {
    expect(MessageError.AuthError).toBe(AuthError)
  })

  test("exposes OutputLengthError as same reference as direct import", () => {
    expect(MessageError.OutputLengthError).toBe(OutputLengthError)
  })

  test("exposes Shared as same reference as direct import", () => {
    expect(MessageError.Shared).toBe(Shared)
  })

  test("exposes SharedSchema as same reference as direct import", () => {
    expect(MessageError.SharedSchema).toBe(SharedSchema)
  })

  test("exposes self-referential namespace", () => {
    expect(MessageError.MessageError).toBeDefined()
    expect(MessageError.MessageError.AuthError).toBe(AuthError)
  })
})
