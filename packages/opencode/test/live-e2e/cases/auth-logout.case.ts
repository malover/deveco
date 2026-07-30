import fs from "node:fs/promises"
import path from "node:path"
import stripAnsi from "strip-ansi"
import { realUserEnv } from "../env"
import type { LiveTestCase } from "../types"

const CASE_ID = "AUTH_LOGOUT"
const PROVIDER_ID = "live-e2e-provider"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "登出认证服务",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description:
    "验证 deveco auth logout 可在隔离环境中删除指定 provider 凭据，输出登出成功提示，并从 auth.json 中移除该凭据。",
  steps: [
    "创建隔离临时根目录，将数据、配置、缓存和状态路径全部指向临时目录。",
    "在隔离 auth.json 中预置测试 provider 凭据。",
    "执行 deveco auth logout live-e2e-provider。",
    "验证命令成功退出且输出包含 Remove credential 和 Logout successful。",
    "重新读取隔离 auth.json，验证凭据已被删除。",
  ],
  expected: [
    "deveco auth logout 退出码为 0。",
    "输出包含 Remove credential 和 Logout successful。",
    "隔离 auth.json 中不再包含 live-e2e-provider。",
  ],
  code: "packages/opencode/test/live-e2e/cases/auth-logout.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时根目录；不读取、删除或修改真实用户登录状态或凭据。",
  async run(ctx) {
    const tempRoot = await ctx.createTempWorkspace("auth-logout-")
    try {
      const env = buildIsolatedEnv(tempRoot)
      const authFile = path.join(tempRoot, "data", "deveco", "auth.json")
      assertAuthFileIsolated(authFile, tempRoot)
      await writeFixtureAuth(authFile)

      const start = Date.now()
      const result = await ctx.runDeveco(["auth", "logout", PROVIDER_ID], {
        env,
        timeoutMs: 30_000,
      })
      await Promise.all([
        ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
        ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
      ])
      if (result.exitCode !== 0) {
        throw new Error(
          `deveco auth logout exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
        )
      }

      validateLogoutOutput(stripAnsi(result.stdout))
      const afterCount = await readAuthCredentialCount(authFile)
      if (afterCount !== 0) {
        throw new Error(`Expected 0 credentials after logout, got ${afterCount}`)
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        details: {
          exitCode: result.exitCode,
          commandDurationMs: Date.now() - start,
          providerID: PROVIDER_ID,
          authFile,
          credentialsBefore: 1,
          credentialsAfter: 0,
        },
      }
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}

function buildIsolatedEnv(tempRoot: string) {
  return {
    ...realUserEnv(),
    DEVECO_TEST_HOME: tempRoot,
    XDG_DATA_HOME: path.join(tempRoot, "data"),
    XDG_CACHE_HOME: path.join(tempRoot, "cache"),
    XDG_CONFIG_HOME: path.join(tempRoot, "config"),
    XDG_STATE_HOME: path.join(tempRoot, "state"),
    DEVECO_CONFIG_DIR: path.join(tempRoot, "config", "deveco"),
    DEVECO_PURE: "1",
  }
}

function assertAuthFileIsolated(authFile: string, tempRoot: string) {
  const relative = path.relative(tempRoot, path.resolve(authFile))
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Auth file path must be inside temp root: ${authFile}`)
  }
}

async function writeFixtureAuth(authFile: string) {
  await fs.mkdir(path.dirname(authFile), { recursive: true })
  const fixture = {
    [PROVIDER_ID]: { type: "api", key: "live-e2e-test-key" },
  }
  await fs.writeFile(authFile, JSON.stringify(fixture, null, 2))
}

function validateLogoutOutput(output: string) {
  if (!output.includes("Remove credential")) {
    throw new Error(`Expected "Remove credential" in output:\n${output}`)
  }
  if (!output.includes("Logout successful")) {
    throw new Error(`Expected "Logout successful" in output:\n${output}`)
  }
}

async function readAuthCredentialCount(authFile: string): Promise<number> {
  const exists = await fs
    .stat(authFile)
    .then(() => true)
    .catch(() => false)
  if (!exists) throw new Error(`Expected auth file to exist after logout: ${authFile}`)
  const raw = JSON.parse(await fs.readFile(authFile, "utf-8")) as unknown
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Expected auth file to contain a JSON object: ${authFile}`)
  }
  if (PROVIDER_ID in raw) throw new Error(`Expected provider "${PROVIDER_ID}" to be removed from auth file`)
  return Object.keys(raw).length
}

export default testCase
