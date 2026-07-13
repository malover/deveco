import { afterEach, describe, expect, test } from "bun:test"
import { Global } from "@opencode-ai/core/global"
import { LocalCrypto } from "@/security/local-crypto"
import { hasDevecoOAuthEntry, loadAccessTokenFromDisk, saveAuthToDisk } from "@/plugin/deveco/storage"
import { tmpdir } from "../../fixture/fixture"

const originalDataDir = Global.Path.data

function authPath() {
  return `${Global.Path.data}/auth.json`
}

afterEach(() => {
  Global.Path.data = originalDataDir
})

describe("loadAccessTokenFromDisk", () => {
  test("returns access token from valid auth.json", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("deveco", { type: "oauth", access: "my-access-token", refresh: "r", expires: 999 })

    expect(loadAccessTokenFromDisk()).toBe("my-access-token")
  })

  test("returns empty string when auth.json does not exist", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    expect(loadAccessTokenFromDisk()).toBe("")
  })

  test("returns empty string when deveco entry is missing", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("other-provider", { type: "api", key: "k" })

    expect(loadAccessTokenFromDisk()).toBe("")
  })

  test("returns empty string when type is not oauth", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("deveco", { type: "api", access: "token", key: "k" })

    expect(loadAccessTokenFromDisk()).toBe("")
  })

  test("returns empty string when access field is missing", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("deveco", { type: "oauth", refresh: "r", expires: 999 })

    expect(loadAccessTokenFromDisk()).toBe("")
  })

  test("returns empty string on corrupt auth.json", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await Bun.write(authPath(), "{ invalid json }}}")

    expect(loadAccessTokenFromDisk()).toBe("")
  })
})

describe("hasDevecoOAuthEntry", () => {
  test("returns true when deveco oauth entry exists with access token", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("deveco", { type: "oauth", access: "token-123", refresh: "", expires: 0 })

    expect(hasDevecoOAuthEntry()).toBe(true)
  })

  test("returns false when auth.json does not exist", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    expect(hasDevecoOAuthEntry()).toBe(false)
  })

  test("returns false when deveco entry is missing", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("other-provider", { type: "oauth", access: "token", key: "k" })

    expect(hasDevecoOAuthEntry()).toBe(false)
  })

  test("returns false when type is not oauth", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("deveco", { type: "api", key: "k" })

    expect(hasDevecoOAuthEntry()).toBe(false)
  })

  test("returns false when access is empty string", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("deveco", { type: "oauth", access: "", refresh: "r", expires: 0 })

    expect(hasDevecoOAuthEntry()).toBe(false)
  })

  test("returns false when access field is missing", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("deveco", { type: "oauth", refresh: "r", expires: 0 })

    expect(hasDevecoOAuthEntry()).toBe(false)
  })

  test("returns false on corrupt auth.json", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await Bun.write(authPath(), "not valid json at all")

    expect(hasDevecoOAuthEntry()).toBe(false)
  })

  test("returns true even with empty refresh token (some login flows)", async () => {
    await using tmp = await tmpdir()
    Global.Path.data = tmp.path

    await saveAuthToDisk("deveco", { type: "oauth", access: "valid-token", refresh: "", expires: 99999 })

    expect(hasDevecoOAuthEntry()).toBe(true)
  })
})
