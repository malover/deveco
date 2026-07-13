import { afterEach, describe, expect } from "bun:test"
import { Effect, Exit, Fiber, Layer, Queue } from "effect"
import path from "path"
import fs from "fs/promises"
import { PlanExitTool, PlanWriteTool, PlanEnterTool } from "@/tool/plan.ts"
import { Question } from "../../src/question"
import { Session } from "../../src/session/session"
import { Provider } from "../../src/provider/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { SessionID, MessageID } from "@/session/schema.ts"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "@/tool/truncate"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { InstanceRef } from "@/effect/instance-ref.ts"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test-provider"),
  modelID: ModelV2.ID.make("test-model"),
}

const sessionInfo: Session.Info = {
  id: SessionID.make("ses_plan-test"),
  slug: "plan-test-slug",
  projectID: "proj_test" as any,
  directory: "/tmp/test",
  title: "Plan Test",
  version: "1",
  time: { created: Date.now(), updated: Date.now() },
}

const ctx = {
  sessionID: sessionInfo.id,
  messageID: MessageID.make("msg_plan-test"),
  callID: "call_plan-test",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const ctxNoCallID = {
  sessionID: sessionInfo.id,
  messageID: MessageID.make("msg_plan-test-no-callid"),
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const lastUserModel = {
  providerID: ProviderV2.ID.make("custom-provider"),
  modelID: ModelV2.ID.make("custom-model"),
}

const lastUserMsg: SessionV1.WithParts = {
  info: {
    id: MessageID.ascending(),
    role: "user" as const,
    sessionID: sessionInfo.id,
    model: lastUserModel,
    time: { created: Date.now() },
  } as SessionV1.User,
  parts: [],
}

const baseLayer = Layer.mergeAll(
  Agent.defaultLayer,
  Truncate.defaultLayer,
  EventV2Bridge.defaultLayer,
  CrossSpawnSpawner.defaultLayer,
)

const providerLayer = Layer.mock(Provider.Service, {
  defaultModel: () => Effect.succeed(ref),
})

const questionLayer = Question.layer.pipe(Layer.provideMerge(EventV2Bridge.defaultLayer))

const pending = Effect.fn("PlanToolTest.pending")(function* (question: Question.Interface) {
  const events = yield* EventV2Bridge.Service
  const asked = yield* Queue.unbounded<void>()
  const off = yield* events.listen((event) => {
    if (event.type === Question.Event.Asked.type) Queue.offerUnsafe(asked, undefined)
    return Effect.void
  })
  yield* Effect.addFinalizer(() => off)
  for (;;) {
    const items = yield* question.list()
    const item = items[0]
    if (item) return item
    yield* Queue.take(asked).pipe(Effect.timeout("3 seconds"))
  }
})

describe("tool.plan", () => {
  describe("PlanWriteTool", () => {
    const writeIt = testEffect(Layer.mergeAll(
      baseLayer,
      Layer.mock(Session.Service, {
        get: () => Effect.succeed(sessionInfo),
      }),
      providerLayer,
    ))

    writeIt.instance("should write plan content to file and return display path", () =>
      Effect.gen(function* () {
        const instance = yield* InstanceRef
        if (!instance) return yield* Effect.die(new Error("no instance"))
        const session = yield* Session.Service
        const info = yield* session.get(ctx.sessionID)
        const planPath = Session.plan(info, instance)
        const toolInfo = yield* PlanWriteTool
        const tool = yield* toolInfo.init()
        const content = "# Plan\n\nStep 1: Do something\nStep 2: Review"
        const result = yield* tool.execute({ content }, ctx)
        expect(result.title).toBe("Plan Written")
        expect(result.output).toContain("Plan written to")
        const displayPath = path.relative(instance.worktree, planPath)
        expect(result.output).toContain(displayPath)
        expect(result.metadata.path).toBe(planPath)
        const written = yield* Effect.tryPromise(() => fs.readFile(planPath, "utf-8"))
        expect(written).toBe(content)
      }),
    )

    writeIt.instance("should overwrite existing plan file with new content", () =>
      Effect.gen(function* () {
        const instance = yield* InstanceRef
        if (!instance) return yield* Effect.die(new Error("no instance"))
        const session = yield* Session.Service
        const info = yield* session.get(ctx.sessionID)
        const planPath = Session.plan(info, instance)
        yield* Effect.tryPromise(() =>
          fs.mkdir(path.dirname(planPath), { recursive: true }),
        )
        yield* Effect.tryPromise(() =>
          fs.writeFile(planPath, "old plan content", "utf-8"),
        )
        const toolInfo = yield* PlanWriteTool
        const tool = yield* toolInfo.init()
        const newContent = "updated plan content"
        const result = yield* tool.execute({ content: newContent }, ctx)
        expect(result.title).toBe("Plan Written")
        const written = yield* Effect.tryPromise(() => fs.readFile(planPath, "utf-8"))
        expect(written).toBe(newContent)
      }),
    )
  })

  describe("PlanExitTool", () => {
    const exitCaptured = { msgs: [] as SessionV1.User[], parts: [] as SessionV1.TextPart[] }

    const exitIt = testEffect(Layer.mergeAll(
      baseLayer,
      Layer.mock(Session.Service, {
        get: () => Effect.succeed(sessionInfo),
        messages: () => Effect.succeed([]),
        updateMessage: (msg) => Effect.sync(() => { exitCaptured.msgs.push(msg as SessionV1.User); return msg }),
        updatePart: (part) => Effect.sync(() => { exitCaptured.parts.push(part as SessionV1.TextPart); return part }),
      }),
      providerLayer,
      questionLayer,
    ))

    exitIt.instance("should create build agent message with fallback model when approved", () =>
      Effect.gen(function* () {
        exitCaptured.msgs.length = 0
        exitCaptured.parts.length = 0
        const question = yield* Question.Service
        const toolInfo = yield* PlanExitTool
        const tool = yield* toolInfo.init()
        const fiber = yield* tool.execute({}, ctx).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        yield* question.reply({ requestID: item.id, answers: [["Yes"]] })
        const result = yield* Fiber.join(fiber)
        expect(result.title).toBe("Switching to build agent")
        expect(result.output).toContain("User approved switching to build agent")
        expect(exitCaptured.msgs.length).toBe(1)
        expect(exitCaptured.msgs[0].agent).toBe("build")
        expect(exitCaptured.msgs[0].model).toEqual(ref)
        expect(exitCaptured.parts.length).toBe(1)
        expect(exitCaptured.parts[0].synthetic).toBe(true)
        expect(exitCaptured.parts[0].text).toContain("has been approved")
      }),
    )

    exitIt.instance("should fail with RejectedError when user answers No", () =>
      Effect.gen(function* () {
        const question = yield* Question.Service
        const toolInfo = yield* PlanExitTool
        const tool = yield* toolInfo.init()
        const fiber = yield* tool.execute({}, ctx).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        yield* question.reply({ requestID: item.id, answers: [["No"]] })
        const exit = yield* Fiber.await(fiber)
        expect(Exit.isFailure(exit)).toBe(true)
      }),
    )

    exitIt.instance("should include tool param in question when callID is present", () =>
      Effect.gen(function* () {
        const question = yield* Question.Service
        const toolInfo = yield* PlanExitTool
        const tool = yield* toolInfo.init()
        const fiber = yield* tool.execute({}, ctx).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        expect(item.tool).toBeDefined()
        expect(item.tool!.callID).toBe(ctx.callID)
        expect(item.tool!.messageID).toBe(ctx.messageID)
        yield* question.reply({ requestID: item.id, answers: [["Yes"]] })
        yield* Fiber.join(fiber)
      }),
    )

    exitIt.instance("should omit tool param from question when callID is absent", () =>
      Effect.gen(function* () {
        const question = yield* Question.Service
        const toolInfo = yield* PlanExitTool
        const tool = yield* toolInfo.init()
        const fiber = yield* tool.execute({}, ctxNoCallID).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        expect(item.tool).toBeUndefined()
        yield* question.reply({ requestID: item.id, answers: [["Yes"]] })
        yield* Fiber.join(fiber)
      }),
    )

    const exitWithModelCaptured = { msgs: [] as SessionV1.User[], parts: [] as SessionV1.TextPart[] }

    const exitWithModelIt = testEffect(Layer.mergeAll(
      baseLayer,
      Layer.mock(Session.Service, {
        get: () => Effect.succeed(sessionInfo),
        messages: () => Effect.succeed([lastUserMsg]),
        updateMessage: (msg) => Effect.sync(() => { exitWithModelCaptured.msgs.push(msg as SessionV1.User); return msg }),
        updatePart: (part) => Effect.sync(() => { exitWithModelCaptured.parts.push(part as SessionV1.TextPart); return part }),
      }),
      providerLayer,
      questionLayer,
    ))

    exitWithModelIt.instance("should use last user message model in build message", () =>
      Effect.gen(function* () {
        exitWithModelCaptured.msgs.length = 0
        exitWithModelCaptured.parts.length = 0
        const question = yield* Question.Service
        const toolInfo = yield* PlanExitTool
        const tool = yield* toolInfo.init()
        const fiber = yield* tool.execute({}, ctx).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        yield* question.reply({ requestID: item.id, answers: [["Yes"]] })
        const result = yield* Fiber.join(fiber)
        expect(result.title).toBe("Switching to build agent")
        expect(exitWithModelCaptured.msgs.length).toBe(1)
        expect(exitWithModelCaptured.msgs[0].agent).toBe("build")
        expect(exitWithModelCaptured.msgs[0].model).toEqual(lastUserModel)
      }),
    )
  })

  describe("PlanEnterTool", () => {
    const enterCaptured = { msgs: [] as SessionV1.User[], parts: [] as SessionV1.TextPart[] }

    const enterIt = testEffect(Layer.mergeAll(
      baseLayer,
      Layer.mock(Session.Service, {
        get: () => Effect.succeed(sessionInfo),
        messages: () => Effect.succeed([]),
        updateMessage: (msg) => Effect.sync(() => { enterCaptured.msgs.push(msg as SessionV1.User); return msg }),
        updatePart: (part) => Effect.sync(() => { enterCaptured.parts.push(part as SessionV1.TextPart); return part }),
      }),
      providerLayer,
      questionLayer,
    ))

    enterIt.instance("should create plan agent message with fallback model when approved", () =>
      Effect.gen(function* () {
        enterCaptured.msgs.length = 0
        enterCaptured.parts.length = 0
        const instance = yield* InstanceRef
        if (!instance) return yield* Effect.die(new Error("no instance"))
        const session = yield* Session.Service
        const info = yield* session.get(ctx.sessionID)
        const planDisplayPath = path.relative(instance.worktree, Session.plan(info, instance))
        const question = yield* Question.Service
        const toolInfo = yield* PlanEnterTool
        const tool = yield* toolInfo.init()
        const fiber = yield* tool.execute({}, ctx).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        yield* question.reply({ requestID: item.id, answers: [["Yes"]] })
        const result = yield* Fiber.join(fiber)
        expect(result.title).toBe("Switching to plan agent")
        expect(result.output).toContain(planDisplayPath)
        expect(enterCaptured.msgs.length).toBe(1)
        expect(enterCaptured.msgs[0].agent).toBe("plan")
        expect(enterCaptured.msgs[0].model).toEqual(ref)
        expect(enterCaptured.parts.length).toBe(1)
        expect(enterCaptured.parts[0].synthetic).toBe(true)
      }),
    )

    enterIt.instance("should fail with RejectedError when user answers No", () =>
      Effect.gen(function* () {
        const question = yield* Question.Service
        const toolInfo = yield* PlanEnterTool
        const tool = yield* toolInfo.init()
        const fiber = yield* tool.execute({}, ctx).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        yield* question.reply({ requestID: item.id, answers: [["No"]] })
        const exit = yield* Fiber.await(fiber)
        expect(Exit.isFailure(exit)).toBe(true)
      }),
    )

    const enterWithModelCaptured = { msgs: [] as SessionV1.User[], parts: [] as SessionV1.TextPart[] }

    const enterWithModelIt = testEffect(Layer.mergeAll(
      baseLayer,
      Layer.mock(Session.Service, {
        get: () => Effect.succeed(sessionInfo),
        messages: () => Effect.succeed([lastUserMsg]),
        updateMessage: (msg) => Effect.sync(() => { enterWithModelCaptured.msgs.push(msg as SessionV1.User); return msg }),
        updatePart: (part) => Effect.sync(() => { enterWithModelCaptured.parts.push(part as SessionV1.TextPart); return part }),
      }),
      providerLayer,
      questionLayer,
    ))

    enterWithModelIt.instance("should use last user message model in plan message", () =>
      Effect.gen(function* () {
        enterWithModelCaptured.msgs.length = 0
        enterWithModelCaptured.parts.length = 0
        const question = yield* Question.Service
        const toolInfo = yield* PlanEnterTool
        const tool = yield* toolInfo.init()
        const fiber = yield* tool.execute({}, ctx).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        yield* question.reply({ requestID: item.id, answers: [["Yes"]] })
        const result = yield* Fiber.join(fiber)
        expect(result.title).toBe("Switching to plan agent")
        expect(enterWithModelCaptured.msgs.length).toBe(1)
        expect(enterWithModelCaptured.msgs[0].agent).toBe("plan")
        expect(enterWithModelCaptured.msgs[0].model).toEqual(lastUserModel)
      }),
    )
  })
})
