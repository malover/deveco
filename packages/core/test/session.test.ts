import { describe, expect } from "bun:test"
import { DateTime, Effect, Layer, Stream } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath, PositiveInt } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { Prompt } from "@opencode-ai/core/session/prompt"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionStore } from "@opencode-ai/core/session/store"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionMessageTable, SessionTable } from "@opencode-ai/core/session/sql"
import { WorkspaceV2 } from "@opencode-ai/core/workspace"
import { Location } from "@opencode-ai/core/location"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AgentV2 } from "@opencode-ai/core/agent"
import { testEffect } from "./lib/effect"

const database = Database.layerFromPath(":memory:")
const events = EventV2.layer.pipe(Layer.provide(database))
const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const projector = SessionProjector.layer.pipe(Layer.provide(events), Layer.provide(database))
const store = SessionStore.layer.pipe(Layer.provide(database))
const sessions = SessionV2.layer.pipe(
  Layer.provide(events),
  Layer.provide(database),
  Layer.provide(store),
  Layer.provide(projects),
  Layer.provide(SessionExecution.noopLayer),
)
const it = testEffect(
  Layer.mergeAll(database, events, projects, projector, store, SessionExecution.noopLayer, sessions),
)

const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })
const locationAlt = Location.Ref.make({ directory: AbsolutePath.make("/project-alt") })
const workspaceID = WorkspaceV2.ID.make("wrk_test")

describe("SessionV2.list", () => {
  it.effect("returns an empty list when no sessions exist", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service

      expect(yield* session.list()).toEqual([])
    }),
  )

  it.effect("returns all sessions by default in descending order", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const first = yield* session.create({ location })
      const second = yield* session.create({ location })

      const listed = yield* session.list()

      expect(listed).toHaveLength(2)
      expect(listed[0]!.id).toBe(second.id)
      expect(listed[1]!.id).toBe(first.id)
    }),
  )

  it.effect("returns sessions in ascending order when order is asc", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const first = yield* session.create({ location })
      const second = yield* session.create({ location })

      const listed = yield* session.list({ order: "asc" })

      expect(listed).toHaveLength(2)
      expect(listed[0]!.id).toBe(first.id)
      expect(listed[1]!.id).toBe(second.id)
    }),
  )

  it.effect("limits the number of returned sessions", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      yield* session.create({ location })
      yield* session.create({ location })
      yield* session.create({ location })

      expect(yield* session.list({ limit: PositiveInt.make(2) })).toHaveLength(2)
    }),
  )

  it.effect("filters sessions by directory", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const inDir = yield* session.create({ location })
      yield* session.create({ location: locationAlt })

      const listed = yield* session.list({ directory: AbsolutePath.make("/project") })

      expect(listed).toHaveLength(1)
      expect(listed[0]!.id).toBe(inDir.id)
    }),
  )

  it.effect("filters sessions by project", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })

      const listed = yield* session.list({ project: ProjectV2.ID.global })

      expect(listed).toHaveLength(1)
      expect(listed[0]!.id).toBe(created.id)
    }),
  )

  it.effect("filters sessions by workspace", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const withWorkspace = yield* session.create({
        location: Location.Ref.make({ directory: location.directory, workspaceID }),
      })
      yield* session.create({ location })

      const listed = yield* session.list({ workspaceID })

      expect(listed).toHaveLength(1)
      expect(listed[0]!.id).toBe(withWorkspace.id)
    }),
  )

  it.effect("filters sessions by title search", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })

      const listed = yield* session.list({ search: "New session" })

      expect(listed).toHaveLength(1)
      expect(listed[0]!.id).toBe(created.id)
    }),
  )

  it.effect("returns an empty list when search matches no titles", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      yield* session.create({ location })

      expect(yield* session.list({ search: "nonexistent" })).toEqual([])
    }),
  )

  it.effect("paginates with a next anchor returning sessions after the anchor in desc order", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const sesEarlier = SessionV2.ID.make("ses_anchor_earlier")
      const sesLater = SessionV2.ID.make("ses_anchor_later")
      yield* db.insert(ProjectTable).values({ id: ProjectV2.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
      yield* db.insert(SessionTable).values({
        id: sesEarlier,
        project_id: ProjectV2.ID.global,
        slug: "earlier",
        directory: AbsolutePath.make("/project"),
        title: "Earlier session",
        version: "test",
        time_created: 1000,
        time_updated: 1000,
      }).run().pipe(Effect.orDie)
      yield* db.insert(SessionTable).values({
        id: sesLater,
        project_id: ProjectV2.ID.global,
        slug: "later",
        directory: AbsolutePath.make("/project"),
        title: "Later session",
        version: "test",
        time_created: 2000,
        time_updated: 2000,
      }).run().pipe(Effect.orDie)

      const page = yield* session.list({
        anchor: { id: sesLater, time: 2000, direction: "next" },
      })

      expect(page).toHaveLength(1)
      expect(page[0]!.id).toBe(sesEarlier)
    }),
  )

  it.effect("paginates with a previous anchor returning sessions before the anchor in desc order", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const sesEarlier = SessionV2.ID.make("ses_anchor_prev_earlier")
      const sesLater = SessionV2.ID.make("ses_anchor_prev_later")
      yield* db.insert(ProjectTable).values({ id: ProjectV2.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
      yield* db.insert(SessionTable).values({
        id: sesEarlier,
        project_id: ProjectV2.ID.global,
        slug: "earlier-prev",
        directory: AbsolutePath.make("/project"),
        title: "Earlier session prev",
        version: "test",
        time_created: 1000,
        time_updated: 1000,
      }).run().pipe(Effect.orDie)
      yield* db.insert(SessionTable).values({
        id: sesLater,
        project_id: ProjectV2.ID.global,
        slug: "later-prev",
        directory: AbsolutePath.make("/project"),
        title: "Later session prev",
        version: "test",
        time_created: 2000,
        time_updated: 2000,
      }).run().pipe(Effect.orDie)

      const page = yield* session.list({
        anchor: { id: sesEarlier, time: 1000, direction: "previous" },
      })

      expect(page).toHaveLength(1)
      expect(page[0]!.id).toBe(sesLater)
    }),
  )
})

describe("SessionV2.get", () => {
  it.effect("returns session info for an existing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })

      expect(yield* session.get(created.id)).toEqual(created)
    }),
  )

  it.effect("returns NotFoundError for a missing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const missing = SessionV2.ID.make("ses_missing_get")

      const error = yield* session.get(missing).pipe(Effect.flip)

      expect(error._tag).toBe("Session.NotFoundError")
      expect(error.sessionID).toBe(missing)
    }),
  )
})

describe("SessionV2.create", () => {
  it.effect("creates a session with default title", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })

      expect(created.id).toBeDefined()
      expect(created.title).toMatch(/^New session - /)
      expect(created.projectID).toBe(ProjectV2.ID.global)
      expect(created.location.directory).toBe(AbsolutePath.make("/project"))
    }),
  )

  it.effect("returns existing session when creating with the same id", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const id = SessionSchema.ID.make("ses_idempotent")
      const first = yield* session.create({ location, id })
      const second = yield* session.create({ location, id })

      expect(second.id).toBe(first.id)
      expect(second.title).toBe(first.title)
    }),
  )

  it.effect("creates a session with a workspaceID in location", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const wsLocation = Location.Ref.make({ directory: AbsolutePath.make("/project"), workspaceID })
      const created = yield* session.create({ location: wsLocation })

      expect(created.location.workspaceID).toBe(workspaceID)
    }),
  )

  it.effect("creates a session with a specified agent", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const agentID = AgentV2.ID.make("code")
      const created = yield* session.create({ location, agent: agentID })

      expect(created.agent).toBe(agentID)
    }),
  )

  it.effect("creates a session with a specified model", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const modelRef = { id: ModelV2.ID.make("test-model"), providerID: ProviderV2.ID.make("test-provider") }
      const created = yield* session.create({ location, model: modelRef })

      expect(created.model?.id).toBe(modelRef.id)
      expect(created.model?.providerID).toBe(modelRef.providerID)
    }),
  )
})

describe("SessionV2.prompt", () => {
  it.effect("admits a prompt and returns an Admitted result", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })
      const prompt = new Prompt({ text: "Hello" })

      const admitted = yield* session.prompt({
        sessionID: created.id,
        prompt,
        resume: false,
      })

      expect(admitted.sessionID).toBe(created.id)
      expect(admitted.prompt.text).toBe("Hello")
      expect(admitted.delivery).toBe("steer")
    }),
  )

  it.effect("admits a prompt with default resume triggering wake", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })
      const prompt = new Prompt({ text: "Hello with wake" })

      const admitted = yield* session.prompt({
        sessionID: created.id,
        prompt,
      })

      expect(admitted.sessionID).toBe(created.id)
      expect(admitted.prompt.text).toBe("Hello with wake")
    }),
  )

  it.effect("admits a prompt with an explicit message id", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })
      const prompt = new Prompt({ text: "Explicit ID" })
      const messageID = SessionMessage.ID.make("msg_explicit_id_prompt")

      const admitted = yield* session.prompt({
        id: messageID,
        sessionID: created.id,
        prompt,
        resume: false,
      })

      expect(admitted.id).toBe(messageID)
      expect(admitted.sessionID).toBe(created.id)
    }),
  )

  it.effect("returns NotFoundError when prompting a missing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const missing = SessionSchema.ID.make("ses_missing_prompt")
      const prompt = new Prompt({ text: "Hello" })

      const error = yield* session
        .prompt({ sessionID: missing, prompt, resume: false })
        .pipe(Effect.flip)

      expect(error._tag).toBe("Session.NotFoundError")
      expect(error.sessionID).toBe(missing)
    }),
  )

  it.effect("returns PromptConflictError when reusing the same messageID across different sessions", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const sessionA = yield* session.create({ location })
      const sessionB = yield* session.create({ location })
      const prompt = new Prompt({ text: "Hello" })
      const messageID = SessionMessage.ID.create()

      yield* session.prompt({
        id: messageID,
        sessionID: sessionA.id,
        prompt,
        resume: false,
      })

      const error = yield* session
        .prompt({
          id: messageID,
          sessionID: sessionB.id,
          prompt,
          resume: false,
        })
        .pipe(Effect.flip)

      expect(error._tag).toBe("Session.PromptConflictError")
      if (error instanceof SessionV2.PromptConflictError) {
        expect(error.sessionID).toBe(sessionB.id)
        expect(error.messageID).toBe(messageID)
      }
    }),
  )

  it.effect("admits a prompt with queue delivery", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })
      const prompt = new Prompt({ text: "Queued hello" })

      const admitted = yield* session.prompt({
        sessionID: created.id,
        prompt,
        delivery: "queue",
        resume: false,
      })

      expect(admitted.delivery).toBe("queue")
    }),
  )
})

describe("SessionV2.message", () => {
  it.effect("returns undefined when the message does not exist", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })

      const result = yield* session.message({
        sessionID: created.id,
        messageID: SessionMessage.ID.create(),
      })

      expect(result).toBeUndefined()
    }),
  )

  it.effect("returns undefined when the message belongs to a different session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const sessionA = yield* session.create({ location })
      const sessionB = yield* session.create({ location })

      const msg = yield* session.prompt({
        sessionID: sessionA.id,
        prompt: new Prompt({ text: "Hello A" }),
        resume: false,
      })

      const result = yield* session.message({
        sessionID: sessionB.id,
        messageID: msg.id,
      })

      expect(result).toBeUndefined()
    }),
  )
})

const insertUserMessage = Effect.fn("test/insertUserMessage")(function* (
  db: Database.Interface["db"],
  sessionID: SessionSchema.ID,
  id: SessionMessage.ID,
  seq: number,
  text: string,
  createdMs: number,
) {
  const row = {
    id,
    session_id: sessionID,
    type: "user" as const,
    seq,
    time_created: createdMs,
    time_updated: createdMs,
    data: { text, time: { created: createdMs } },
  }
  yield* db.insert(SessionMessageTable).values([row]).run().pipe(Effect.orDie)
})

describe("SessionV2.messages", () => {
  it.effect("returns NotFoundError for a missing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const missing = SessionSchema.ID.make("ses_missing_messages")

      const error = yield* session
        .messages({ sessionID: missing })
        .pipe(Effect.flip)

      expect(error._tag).toBe("Session.NotFoundError")
      expect(error.sessionID).toBe(missing)
    }),
  )

  it.effect("returns messages in descending order by default", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const created = yield* session.create({ location })

      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_desc_1"), 1, "First", 1000)
      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_desc_2"), 2, "Second", 2000)
      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_desc_3"), 3, "Third", 3000)

      const msgs = yield* session.messages({ sessionID: created.id })

      expect(msgs).toHaveLength(3)
      expect(msgs[0]!.type).toBe("user")
      expect(msgs[0]!.id).toBe(SessionMessage.ID.make("msg_desc_3"))
      expect(msgs[1]!.id).toBe(SessionMessage.ID.make("msg_desc_2"))
      expect(msgs[2]!.id).toBe(SessionMessage.ID.make("msg_desc_1"))
    }),
  )

  it.effect("returns messages in ascending order", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const created = yield* session.create({ location })

      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_asc_1"), 1, "First", 1000)
      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_asc_2"), 2, "Second", 2000)

      const msgs = yield* session.messages({ sessionID: created.id, order: "asc" })

      expect(msgs).toHaveLength(2)
      expect(msgs[0]!.id).toBe(SessionMessage.ID.make("msg_asc_1"))
      expect(msgs[1]!.id).toBe(SessionMessage.ID.make("msg_asc_2"))
    }),
  )

  it.effect("limits the number of returned messages", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const created = yield* session.create({ location })

      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_limit_1"), 1, "First", 1000)
      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_limit_2"), 2, "Second", 2000)
      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_limit_3"), 3, "Third", 3000)

      const msgs = yield* session.messages({ sessionID: created.id, limit: 2 })

      expect(msgs).toHaveLength(2)
      expect(msgs[0]!.id).toBe(SessionMessage.ID.make("msg_limit_3"))
      expect(msgs[1]!.id).toBe(SessionMessage.ID.make("msg_limit_2"))
    }),
  )

  it.effect("paginates with a next cursor returning messages after the anchor in desc order", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const created = yield* session.create({ location })

      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_cursor_next_1"), 1, "First", 1000)
      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_cursor_next_2"), 2, "Second", 2000)
      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_cursor_next_3"), 3, "Third", 3000)

      const msgs = yield* session.messages({
        sessionID: created.id,
        cursor: { id: SessionMessage.ID.make("msg_cursor_next_2"), direction: "next" },
      })

      expect(msgs).toHaveLength(1)
      expect(msgs[0]!.id).toBe(SessionMessage.ID.make("msg_cursor_next_1"))
    }),
  )

  it.effect("paginates with a previous cursor returning messages before the anchor in desc order", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const created = yield* session.create({ location })

      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_cursor_prev_1"), 1, "First", 1000)
      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_cursor_prev_2"), 2, "Second", 2000)
      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_cursor_prev_3"), 3, "Third", 3000)

      const msgs = yield* session.messages({
        sessionID: created.id,
        cursor: { id: SessionMessage.ID.make("msg_cursor_prev_2"), direction: "previous" },
      })

      expect(msgs).toHaveLength(1)
      expect(msgs[0]!.id).toBe(SessionMessage.ID.make("msg_cursor_prev_3"))
    }),
  )

  it.effect("returns empty array when cursor message does not exist", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const created = yield* session.create({ location })

      yield* insertUserMessage(db, created.id, SessionMessage.ID.make("msg_cursor_ghost_1"), 1, "First", 1000)

      const msgs = yield* session.messages({
        sessionID: created.id,
        cursor: { id: SessionMessage.ID.make("msg_nonexistent"), direction: "next" },
      })

      expect(msgs).toEqual([])
    }),
  )
})

describe("SessionV2.context", () => {
  it.effect("returns NotFoundError for a missing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const missing = SessionSchema.ID.make("ses_missing_context")

      const error = yield* session
        .context(missing)
        .pipe(Effect.flip)

      expect(error._tag).toBe("Session.NotFoundError")
      expect(error.sessionID).toBe(missing)
    }),
  )
})

describe("SessionV2.interrupt", () => {
  it.effect("publishes InterruptRequested event for an existing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })

      yield* session.interrupt(created.id)

      const events = yield* session
        .events({ sessionID: created.id })
        .pipe(Stream.take(1), Stream.runCollect)

      const collected = Array.from(events)
      expect(collected).toHaveLength(1)
      expect(collected[0]!.event.type).toBe("session.next.interrupt.requested")
    }),
  )

  it.effect("succeeds for a non-existing session (delegates interrupt without seq)", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const missing = SessionV2.ID.make("ses_missing_interrupt")

      const result = yield* session.interrupt(missing).pipe(Effect.exit)

      expect(result._tag).toBe("Success")
    }),
  )
})

describe("SessionV2.resume", () => {
  it.effect("returns NotFoundError for a missing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const missing = SessionSchema.ID.make("ses_missing_resume")

      const error = yield* session.resume(missing).pipe(Effect.flip)

      expect(error._tag).toBe("Session.NotFoundError")
      if (error._tag === "Session.NotFoundError") {
        expect(error.sessionID).toBe(missing)
      }
    }),
  )

  it.effect("succeeds for an existing session under noop execution", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })

      const result = yield* session.resume(created.id).pipe(Effect.exit)

      expect(result._tag).toBe("Success")
    }),
  )
})

describe("SessionV2.switchModel", () => {
  it.effect("returns NotFoundError for a missing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const missing = SessionSchema.ID.make("ses_missing_switch_model")

      const error = yield* session
        .switchModel({
          sessionID: missing,
          model: { id: ModelV2.ID.make("test-model"), providerID: ProviderV2.ID.make("test-provider") },
        })
        .pipe(Effect.flip)

      expect(error._tag).toBe("Session.NotFoundError")
      expect(error.sessionID).toBe(missing)
    }),
  )

  it.effect("publishes a ModelSwitched event for an existing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })

      yield* session.switchModel({
        sessionID: created.id,
        model: { id: ModelV2.ID.make("new-model"), providerID: ProviderV2.ID.make("new-provider") },
      })

      const updated = yield* session.get(created.id)
      expect(updated.model?.id).toBe(ModelV2.ID.make("new-model"))
    }),
  )
})

describe("SessionV2.events", () => {
  it.effect("returns a filtered stream of durable events", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })
      yield* session.prompt({ sessionID: created.id, prompt: new Prompt({ text: "Hello" }), resume: false })

      const events = yield* session
        .events({ sessionID: created.id })
        .pipe(Stream.take(1), Stream.runCollect)

      const collected = Array.from(events)
      expect(collected).toHaveLength(1)
      expect(collected[0]!.event.type).toBe("session.next.prompt.admitted")
    }),
  )

  it.effect("returns NotFoundError for events of a missing session", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const missing = SessionV2.ID.make("ses_missing_events")

      const result = yield* session
        .events({ sessionID: missing })
        .pipe(Stream.runCollect, Effect.exit)

      expect(result._tag).toBe("Failure")
    }),
  )

  it.effect("returns events after the given cursor", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })

      yield* session.prompt({ sessionID: created.id, prompt: new Prompt({ text: "First" }), resume: false })

      const firstBatch = yield* session
        .events({ sessionID: created.id })
        .pipe(Stream.take(1), Stream.runCollect)

      const cursor = Array.from(firstBatch)[0]!.cursor

      yield* session.prompt({ sessionID: created.id, prompt: new Prompt({ text: "Second" }), resume: false })

      const allAfter = yield* session
        .events({ sessionID: created.id, after: cursor })
        .pipe(Stream.take(1), Stream.runCollect)

      const afterEvents = Array.from(allAfter)
      expect(afterEvents).toHaveLength(1)
    }),
  )
})

describe("SessionV2.unimplemented stubs", () => {
  const stubs = [
    { operation: "shell" as const, call: (svc: SessionV2.Interface, id: SessionSchema.ID) => svc.shell({ sessionID: id, command: "ls" }) },
    { operation: "skill" as const, call: (svc: SessionV2.Interface, id: SessionSchema.ID) => svc.skill({ sessionID: id, skill: "test" }) },
    { operation: "switchAgent" as const, call: (svc: SessionV2.Interface, id: SessionSchema.ID) => svc.switchAgent({ sessionID: id, agent: "code" }) },
  ]

  for (const stub of stubs) {
    it.effect(`returns OperationUnavailableError for ${stub.operation}`, () =>
      Effect.gen(function* () {
        const session = yield* SessionV2.Service
        const created = yield* session.create({ location })

        const error = yield* stub.call(session, created.id).pipe(Effect.flip)

        expect(error._tag).toBe("Session.OperationUnavailableError")
        if (error instanceof SessionV2.OperationUnavailableError) {
          expect(error.operation).toBe(stub.operation)
        }
      }),
    )
  }
})

describe("SessionV2.gated stubs (compact/wait)", () => {
  const gatedStubs = [
    { operation: "compact" as const, callExisting: (svc: SessionV2.Interface, id: SessionSchema.ID) => svc.compact({ sessionID: id }), callMissing: (svc: SessionV2.Interface, id: SessionSchema.ID) => svc.compact({ sessionID: id }) },
    { operation: "wait" as const, callExisting: (svc: SessionV2.Interface, id: SessionSchema.ID) => svc.wait(id), callMissing: (svc: SessionV2.Interface, id: SessionSchema.ID) => svc.wait(id) },
  ]

  for (const stub of gatedStubs) {
    it.effect(`returns OperationUnavailableError for ${stub.operation} on an existing session`, () =>
      Effect.gen(function* () {
        const session = yield* SessionV2.Service
        const created = yield* session.create({ location })

        const error = yield* stub.callExisting(session, created.id).pipe(Effect.flip)

        expect(error._tag).toBe("Session.OperationUnavailableError")
        if (error instanceof SessionV2.OperationUnavailableError) {
          expect(error.operation).toBe(stub.operation)
        }
      }),
    )

    it.effect(`returns NotFoundError for ${stub.operation} on a missing session`, () =>
      Effect.gen(function* () {
        const session = yield* SessionV2.Service
        const missing = SessionV2.ID.make(`ses_missing_${stub.operation}`)

        const error = yield* stub.callMissing(session, missing).pipe(Effect.flip)

        expect(error._tag).toBe("Session.NotFoundError")
      }),
    )
  }
})
