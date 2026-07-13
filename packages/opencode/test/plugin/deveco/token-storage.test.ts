import { describe, expect, test } from "bun:test"
import fs from "fs"
import path from "path"
import { TokenStorage } from "@/plugin/deveco/token-storage"
import { LocalCrypto } from "@/security/local-crypto"
import { tmpdir } from "../../fixture/fixture"

describe("TokenStorage — save and load roundtrip", () => {
  test("saves and loads a token through real encryption", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)

    await storage.saveToken("my-jwt-token-123")

    const loaded = await storage.loadToken()
    expect(loaded).toBe("my-jwt-token-123")
  })

  test("overwrites previous token on save", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)

    await storage.saveToken("first-token")
    await storage.saveToken("second-token")

    expect(await storage.loadToken()).toBe("second-token")
  })

  test("writes encrypted data to token.enc file", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)

    await storage.saveToken("secret-jwt")

    const filePath = path.join(tmp.path, "token.enc")
    expect(fs.existsSync(filePath)).toBe(true)

    // File should contain an encrypted blob, not plaintext
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    expect(LocalCrypto.isEncryptedBlob(raw)).toBe(true)
    expect(JSON.stringify(raw)).not.toContain("secret-jwt")
  })

  test("roundtrips long tokens", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)

    const longToken = "eyJ" + "A".repeat(2000) + ".signature"
    await storage.saveToken(longToken)

    expect(await storage.loadToken()).toBe(longToken)
  })
})

describe("TokenStorage — loadToken edge cases", () => {
  test("returns null when token file does not exist", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)

    expect(await storage.loadToken()).toBeNull()
  })

  test("returns null and clears file when data is not an encrypted blob", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)
    const filePath = path.join(tmp.path, "token.enc")

    // Write invalid data
    fs.writeFileSync(filePath, JSON.stringify({ not: "encrypted" }))

    expect(await storage.loadToken()).toBeNull()
  })

  test("returns null and clears file when data is corrupt JSON", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)
    const filePath = path.join(tmp.path, "token.enc")

    fs.writeFileSync(filePath, "{ invalid json !!!")

    expect(await storage.loadToken()).toBeNull()
  })
})

describe("TokenStorage — clearToken", () => {
  test("removes the token file", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)

    await storage.saveToken("to-be-cleared")
    expect(await storage.loadToken()).toBe("to-be-cleared")

    await storage.clearToken()
    expect(await storage.loadToken()).toBeNull()
  })

  test("does not throw when file does not exist", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)

    // Should not throw
    await storage.clearToken()
  })
})

describe("TokenStorage — saveToken validation", () => {
  test("throws on empty string", async () => {
    await using tmp = await tmpdir()
    const storage = new TokenStorage(tmp.path)

    await expect(storage.saveToken("")).rejects.toThrow(/empty/i)
  })
})
