import { describe, expect, test } from "bun:test"
import { HomeGraphBootstrap } from "@/homegraph/bootstrap"
import { selectHomeGraphExecutable } from "@/homegraph/integration"

describe("HomeGraph integration", () => {
  test("returns no executable when HomeGraph is not installed", () => {
    expect(selectHomeGraphExecutable([])).toBeUndefined()
    expect(selectHomeGraphExecutable(["/definitely/missing/homegraph"])).toBeUndefined()
  })

  test("keeps MCP startup side-effect free and reserves bootstrap for /init", async () => {
    const [serve, initialize] = await Promise.all([
      Bun.file(new URL("../../src/homegraph/serve.ts", import.meta.url)).text(),
      Bun.file(new URL("../../src/command/template/initialize.txt", import.meta.url)).text(),
    ])

    expect(serve).not.toContain("ensureHomeGraphIndex")
    expect(serve).not.toContain("bootstrap()")
    expect(initialize).toContain("!`${homegraph_init_command}`")
    expect(HomeGraphBootstrap.bootstrapCommand("/project").at(-2)).toEndWith("bootstrap.ts")
    expect(HomeGraphBootstrap.bootstrapCommand("/project").at(-1)).toBe("/project")
  })
})
