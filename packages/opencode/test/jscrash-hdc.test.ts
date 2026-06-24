import { describe, expect, test } from "bun:test"
import { targetArgs } from "../resources/skills/arkts-runtime-fix/scripts/shared/hdc.mjs"

describe("hdc targetArgs", () => {
  test("returns empty array when deviceId is undefined", () => {
    expect(targetArgs(undefined)).toEqual([])
  })

  test("returns empty array when deviceId is empty string", () => {
    expect(targetArgs("")).toEqual([])
  })

  test("returns target args when deviceId is provided", () => {
    expect(targetArgs("device123")).toEqual(["-t", "device123"])
  })

  test("handles deviceId with special characters", () => {
    expect(targetArgs("192.168.1.1:5555")).toEqual(["-t", "192.168.1.1:5555"])
  })
})
