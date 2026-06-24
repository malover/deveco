import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import path from "path"
import { Database } from "@opencode-ai/core/database/database"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"

let savedDisableChannelDb: string | undefined
let savedDevecoDb: string | undefined

beforeEach(() => {
  savedDisableChannelDb = process.env.DEVECO_DISABLE_CHANNEL_DB
  savedDevecoDb = process.env.DEVECO_DB
})

afterEach(() => {
  if (savedDisableChannelDb === undefined) delete process.env.DEVECO_DISABLE_CHANNEL_DB
  else process.env.DEVECO_DISABLE_CHANNEL_DB = savedDisableChannelDb
  if (savedDevecoDb === undefined) delete process.env.DEVECO_DB
  else process.env.DEVECO_DB = savedDevecoDb
})

describe("Database.path", () => {
  test("returns a path under data directory", () => {
    expect(Database.path()).toContain(Global.Path.data)
  })

  test("returns a deveco-branded database file", () => {
    expect(path.basename(Database.path())).toMatch(/^deveco/)
  })

  test("returns deveco.db when DEVECO_DISABLE_CHANNEL_DB is 1", () => {
    process.env.DEVECO_DISABLE_CHANNEL_DB = "1"
    expect(Database.path()).toBe(path.join(Global.Path.data, "deveco.db"))
  })

  test("returns deveco.db when DEVECO_DISABLE_CHANNEL_DB is true", () => {
    process.env.DEVECO_DISABLE_CHANNEL_DB = "true"
    expect(Database.path()).toBe(path.join(Global.Path.data, "deveco.db"))
  })
})

describe("Flag.DEVECO_DB regression guard", () => {
  test("Flag defines DEVECO_DB property", () => {
    expect("DEVECO_DB" in Flag).toBe(true)
  })

  test("database.ts source references Flag.DEVECO_DB for custom path override", () => {
    const source = Bun.file(path.join(import.meta.dir, "../src/database/database.ts")).text()
    return source.then((text) => {
      expect(text).toContain("Flag.DEVECO_DB")
    })
  })
})
