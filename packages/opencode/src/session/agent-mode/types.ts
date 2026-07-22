import { SessionV1 } from "@opencode-ai/core/v1/session"
import { SessionDebugState } from "@/session/debug-state"

export const RoutingKind = {
  MessageAgent: "message-agent",
  SessionSticky: "session-sticky",
} as const
export type RoutingKind = (typeof RoutingKind)[keyof typeof RoutingKind]

export type PromptRouteResult<TInput> =
  | { type: "continue"; input: TInput }
  | { type: "semantic-exit"; input: TInput; info: SessionDebugState.Info }

export type DebugCommandResult =
  | { type: "echo"; result: SessionV1.WithParts }
  | { type: "enter"; condition: string }

export type DebugMarkerState = SessionV1.DebugStatePart["state"]
