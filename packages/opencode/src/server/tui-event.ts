import { SessionID } from "@/session/schema"
import { PositiveInt } from "@opencode-ai/core/schema"
import { EventV2 } from "@opencode-ai/core/event"
import { Effect, Schema } from "effect"

export const BtwEvent = {
  Start: EventV2.define({
    type: "btw.start",
    schema: {
      asideID: Schema.String,
      sessionID: SessionID,
      question: Schema.String,
    },
  }),
  Delta: EventV2.define({
    type: "btw.delta",
    schema: {
      asideID: Schema.String,
      text: Schema.String,
    },
  }),
  Complete: EventV2.define({
    type: "btw.complete",
    schema: {
      asideID: Schema.String,
    },
  }),
  Error: EventV2.define({
    type: "btw.error",
    schema: {
      asideID: Schema.String,
      message: Schema.String,
    },
  }),
}

const DEFAULT_TOAST_DURATION = 5000

export const TuiEvent = {
  PromptAppend: EventV2.define({ type: "tui.prompt.append", schema: { text: Schema.String } }),
  CommandExecute: EventV2.define({
    type: "tui.command.execute",
    schema: {
      command: Schema.Union([
        Schema.Literals([
          "session.list",
          "session.new",
          "session.share",
          "session.interrupt",
          "session.compact",
          "session.page.up",
          "session.page.down",
          "session.line.up",
          "session.line.down",
          "session.half.page.up",
          "session.half.page.down",
          "session.first",
          "session.last",
          "prompt.clear",
          "prompt.submit",
          "agent.cycle",
        ]),
        Schema.String,
      ]),
    },
  }),
  ToastShow: EventV2.define({
    type: "tui.toast.show",
    schema: {
      title: Schema.optional(Schema.String),
      message: Schema.String,
      variant: Schema.Literals(["info", "success", "warning", "error"]),
      duration: PositiveInt.pipe(Schema.withDecodingDefault(Effect.succeed(DEFAULT_TOAST_DURATION))).annotate({
        description: "Duration in milliseconds",
      }),
    },
  }),
  SessionSelect: EventV2.define({
    type: "tui.session.select",
    schema: {
      sessionID: SessionID.annotate({ description: "Session ID to navigate to" }),
    },
  }),
}
