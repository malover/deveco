import { describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { isolatedEnv } from "./cli-process"

describe("isolated CLI environment", () => {
  test("omits NODE_PATH when the Bun isolated store is absent", async () => {
    await using tmp = await tmpdir()
    const env = isolatedEnv(tmp.path, "{}", path.join(tmp.path, "missing-bun-store"))

    expect("NODE_PATH" in env).toBe(false)
  })

  test("keeps React NODE_PATH discovery for an available Bun store", async () => {
    await using tmp = await tmpdir()
    const reactNodeModules = path.join(tmp.path, "react@18.2.0", "node_modules")
    await mkdir(reactNodeModules, { recursive: true })

    const env = isolatedEnv(tmp.path, "{}", tmp.path)

    expect(env.NODE_PATH).toBe(reactNodeModules)
  })

  test("propagates unexpected Bun store read errors", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "not-a-directory")
    await writeFile(file, "content")

    expect(() => isolatedEnv(tmp.path, "{}", file)).toThrow()
  })
})
