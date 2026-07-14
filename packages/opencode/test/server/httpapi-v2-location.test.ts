import { afterEach, describe, expect, test } from "bun:test"
import { Context, Schema } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

const context = Context.empty() as Context.Context<unknown>

function request(route: string, directory: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("x-deveco-directory", directory)
  return HttpApiApp.webHandler().handler(
    new Request(`http://localhost${route}`, {
      ...init,
      headers,
    }),
    context,
  )
}

// Wire format: server.connected carries Location.Info (with project),
// subsequent EventV2 payloads carry Location.Ref (directory + optional workspaceID, no project).
const LocationInfo = Schema.Struct({
  directory: Schema.String,
  workspaceID: Schema.optional(Schema.String),
  project: Schema.Struct({ id: Schema.String, directory: Schema.String }),
})

const LocationRef = Schema.Struct({
  directory: Schema.String,
  workspaceID: Schema.optional(Schema.String),
})

const ConnectedEvent = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("server.connected"),
  location: LocationInfo,
  data: Schema.Unknown,
})

const EventV2Payload = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  location: LocationRef,
  data: Schema.Unknown,
})

async function readConnectedEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const value = await reader.read()
  if (value.done) throw new Error("event stream closed")
  return Schema.decodeUnknownSync(ConnectedEvent)(
    JSON.parse(new TextDecoder().decode(value.value).replace(/^data: /, "")),
  )
}

async function readEventType(reader: ReadableStreamDefaultReader<Uint8Array>, type: string) {
  for (let index = 0; index < 20; index++) {
    const value = await reader.read()
    if (value.done) throw new Error("event stream closed")
    const event = Schema.decodeUnknownSync(EventV2Payload)(
      JSON.parse(new TextDecoder().decode(value.value).replace(/^data: /, "")),
    )
    if (event.type === type) return event
  }
  throw new Error(`timed out waiting for ${type}`)
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("v2 location HttpApi", () => {
  test("returns command and skill snapshots with resolved locations", async () => {
    await using tmp = await tmpdir({ git: true })

    for (const route of ["/api/command", "/api/skill"]) {
      const response = await request(route, tmp.path)
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        location: { directory: string; project: { id: string } }
        data: unknown
      }
      expect(body.data).toBeArray()
      expect(body.location.directory).toBe(tmp.path)
      expect(body.location.project.id).toBeTruthy()
    }
  })

  test("streams native EventV2 payloads with resolved locations", async () => {
    await using tmp = await tmpdir({ git: true })
    const response = await request("/api/event", tmp.path)
    const reader = response.body!.getReader()

    const connected = await readConnectedEvent(reader)
    expect(connected.type).toBe("server.connected")
    expect(connected.location.directory).toBe(tmp.path)
    expect(connected.location.project.directory).toBe(tmp.path)
    expect(connected.location.project.id).toBeTruthy()

    const created = await request("/session", tmp.path, { method: "POST" })
    expect(created.status).toBe(200)

    const event = await readEventType(reader, "session.created")
    expect(event.type).toBe("session.created")
    expect(event.location.directory).toBe(tmp.path)
    expect(event.data as Record<string, unknown>).toMatchObject({
      sessionID: expect.any(String),
    })

    await reader.cancel()
  })
})
