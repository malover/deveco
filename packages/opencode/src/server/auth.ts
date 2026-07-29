export * as ServerAuth from "./auth"

import crypto from "node:crypto"
import { ConfigService } from "@/effect/config-service"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Config as EffectConfig, Context, Option, Redacted } from "effect"

export type Credentials = {
  password?: string
  username?: string
}

export type DecodedCredentials = {
  readonly username: string
  readonly password: Redacted.Redacted
}

export class Config extends ConfigService.Service<Config>()("@opencode/ServerAuthConfig", {
  password: EffectConfig.string("DEVECO_SERVER_PASSWORD").pipe(EffectConfig.option),
  username: EffectConfig.string("DEVECO_SERVER_USERNAME").pipe(EffectConfig.withDefault("deveco")),
}) {}

export type Info = Context.Service.Shape<typeof Config>

export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  return (
    Option.isSome(config.password) &&
    credentials.username === config.username &&
    timingSafeStringEqual(Redacted.value(credentials.password), config.password.value)
  )
}

// Constant-time string comparison to prevent timing attacks on password authentication.
// Standard === comparison short-circuits on the first mismatched byte, allowing an
// attacker to infer the password byte-by-byte by measuring response latency.
// SHA-256 normalizes both inputs to 32 bytes, avoiding timingSafeEqual's exception
// when buffer lengths differ (e.g. multi-byte UTF-8 characters).
function timingSafeStringEqual(a: string, b: string) {
  const hashA = crypto.createHash("sha256").update(a).digest()
  const hashB = crypto.createHash("sha256").update(b).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

export function header(credentials?: Credentials) {
  const password = credentials?.password ?? Flag.DEVECO_SERVER_PASSWORD
  if (!password) return undefined

  const username = credentials?.username ?? Flag.DEVECO_SERVER_USERNAME ?? "opencode"
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

export function headers(credentials?: Credentials) {
  const authorization = header(credentials)
  if (!authorization) return undefined
  return { Authorization: authorization }
}
