import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { analyzeProjectSpecWorkspace } from "@/tool/project-spec-workspace"

async function fixture(files: Record<string, string>, run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(import.meta.dir, "project-spec-analyze-"))
  try {
    await Promise.all(
      Object.entries(files).map(async ([relative, content]) => {
        const absolute = path.join(root, relative)
        await fs.mkdir(path.dirname(absolute), { recursive: true })
        await Bun.write(absolute, content)
      }),
    )
    await run(root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe("project_spec_analyze", () => {
  test("does not depend on an external file-search executable", async () => {
    const projectSpecWorkspaceSource = await Bun.file(
      new URL("../../src/tool/project-spec-workspace.ts", import.meta.url),
    ).text()
    expect(projectSpecWorkspaceSource).not.toContain('"rg"')
    expect(projectSpecWorkspaceSource).not.toContain("Bun.spawn")
  })

  test("keeps declared ArkTS modules in one project", async () => {
    await fixture(
      {
        "build-profile.json5": `{ modules: [{ name: "entry", srcPath: "entry" }, { name: "shared", srcPath: "shared" }] }`,
        "oh-package.json5": `{ name: "photos" }`,
        "entry/src/main/module.json5": `{ module: { name: "entry", type: "entry" } }`,
        "entry/src/main/ets/MainAbility.ets": "export class MainAbility {}\n",
        "shared/src/main/module.json5": `{ module: { name: "shared", type: "har" } }`,
        "shared/src/main/ets/Store.ets": "export class Store {}\n",
        "oh_modules/vendor/index.ts": "ignored\n",
      },
      async (root) => {
        const result = await analyzeProjectSpecWorkspace({
          root,
          revision: "abc123",
          includeStats: true,
          resolveDependencies: true,
        })
        expect(result.workspaceMode).toBe("single-project")
        expect(result.projects).toHaveLength(1)
        expect(result.projects[0]?.id).toBe("_root")
        expect(result.projects[0]?.outputSlug).toBe("photos")
        expect(result.projects[0]?.modules.map((item) => item.name)).toEqual(["entry", "shared"])
        expect(result.stats.sourceFiles).toBe(2)
      },
    )
  })

  test("discovers Repo-tool projects and local dependency direction", async () => {
    await fixture(
      {
        ".repo/manifest.xml": `<manifest><project name="apps/photos" path="apps/photos"/><project name="libs/media" path="libs/media"/></manifest>`,
        "apps/photos/package.json": JSON.stringify({ name: "photos", dependencies: { media: "file:../../libs/media" } }),
        "apps/photos/src/index.ts": "export const photos = true\n",
        "libs/media/package.json": JSON.stringify({ name: "media" }),
        "libs/media/src/index.ts": "export const media = true\n",
      },
      async (root) => {
        const result = await analyzeProjectSpecWorkspace({
          root,
          revision: "HEAD",
          includeStats: true,
          resolveDependencies: true,
        })
        expect(result.workspaceMode).toBe("multi-project")
        expect(result.projects.map((item) => item.id)).toEqual(["apps/photos", "libs/media"])
        expect(result.dependencies).toEqual([
          {
            consumer: "apps/photos",
            provider: "libs/media",
            contract: "media",
            evidence: "apps/photos/package.json",
          },
        ])
      },
    )
  })

  test("classifies source-heavy repositories as large", async () => {
    await fixture(
      {
        "package.json": JSON.stringify({ name: "large" }),
        "src/index.ts": "const value = 1\n".repeat(250_100),
      },
      async (root) => {
        const result = await analyzeProjectSpecWorkspace({
          root,
          revision: "HEAD",
          includeStats: true,
          resolveDependencies: false,
        })
        expect(result.scale).toBe("large")
        expect(result.stats.lines).toBeGreaterThanOrEqual(250_000)
      },
    )
  })
})
