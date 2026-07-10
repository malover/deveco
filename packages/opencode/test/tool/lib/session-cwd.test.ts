import { describe, expect, it, beforeEach } from "bun:test"
import { setSessionCwd, getSessionCwd, clearSessionCwd } from "../../../src/tool/lib/session-cwd"

describe("setSessionCwd", () => {
  beforeEach(() => {
    clearSessionCwd()
  })

  it("stores the cwd for a given session", () => {
    setSessionCwd("session-1", "/path/to/project")
    expect(getSessionCwd("session-1")).toBe("/path/to/project")
  })

  it("overwrites previous cwd for the same session", () => {
    setSessionCwd("session-1", "/old/path")
    setSessionCwd("session-1", "/new/path")
    expect(getSessionCwd("session-1")).toBe("/new/path")
  })

  it("trims sessionID before storing", () => {
    setSessionCwd("  session-1  ", "/path")
    expect(getSessionCwd("session-1")).toBe("/path")
  })

  it("trims cwd before storing", () => {
    setSessionCwd("session-1", "  /path/to/project  ")
    expect(getSessionCwd("session-1")).toBe("/path/to/project")
  })

  it("rejects empty sessionID", () => {
    setSessionCwd("", "/path")
    expect(getSessionCwd("")).toBeUndefined()
  })

  it("rejects empty cwd", () => {
    setSessionCwd("session-1", "")
    expect(getSessionCwd("session-1")).toBeUndefined()
  })

  it("rejects both empty", () => {
    setSessionCwd("", "")
    expect(getSessionCwd("")).toBeUndefined()
  })

  it("rejects whitespace-only sessionID", () => {
    setSessionCwd("   ", "/path")
    expect(getSessionCwd("   ")).toBeUndefined()
    expect(getSessionCwd("")).toBeUndefined()
  })
})

describe("getSessionCwd", () => {
  beforeEach(() => {
    clearSessionCwd()
  })

  it("returns the stored cwd for an existing session", () => {
    setSessionCwd("s1", "/stored/path")
    expect(getSessionCwd("s1")).toBe("/stored/path")
  })

  it("returns undefined for a non-existent session", () => {
    expect(getSessionCwd("non-existent")).toBeUndefined()
  })

  it("returns undefined when sessionID is undefined", () => {
    expect(getSessionCwd(undefined)).toBeUndefined()
  })

  it("returns undefined when sessionID is empty string", () => {
    expect(getSessionCwd("")).toBeUndefined()
  })

  it("matches trimmed key from setSessionCwd", () => {
    setSessionCwd("  session-1  ", "/path")
    expect(getSessionCwd("session-1")).toBe("/path")
    expect(getSessionCwd("  session-1  ")).toBeUndefined()
  })
})

describe("clearSessionCwd", () => {
  beforeEach(() => {
    clearSessionCwd()
  })

  it("clears a specific session", () => {
    setSessionCwd("s1", "/path1")
    setSessionCwd("s2", "/path2")
    clearSessionCwd("s1")
    expect(getSessionCwd("s1")).toBeUndefined()
    expect(getSessionCwd("s2")).toBe("/path2")
  })

  it("silently handles clearing a non-existent session", () => {
    setSessionCwd("s1", "/path1")
    clearSessionCwd("non-existent")
    expect(getSessionCwd("s1")).toBe("/path1")
  })

    it.each([
      ["no arguments", () => clearSessionCwd()],
      ["undefined", () => clearSessionCwd(undefined)],
      ["empty string", () => clearSessionCwd("")],
    ])("clears all sessions when called with %s", (_label, fn) => {
      setSessionCwd("s1", "/path1")
      setSessionCwd("s2", "/path2")
      fn()
      expect(getSessionCwd("s1")).toBeUndefined()
      expect(getSessionCwd("s2")).toBeUndefined()
    })
})

describe("session-cwd lifecycle", () => {
  beforeEach(() => {
    clearSessionCwd()
  })

  it("supports set then get then clear then get", () => {
    setSessionCwd("s1", "/lifecycle/path")
    expect(getSessionCwd("s1")).toBe("/lifecycle/path")
    clearSessionCwd("s1")
    expect(getSessionCwd("s1")).toBeUndefined()
  })

  it("isolates state between lifecycle cycles", () => {
    setSessionCwd("cycle-1", "/first")
    clearSessionCwd()
    setSessionCwd("cycle-2", "/second")
    expect(getSessionCwd("cycle-1")).toBeUndefined()
    expect(getSessionCwd("cycle-2")).toBe("/second")
  })
})
