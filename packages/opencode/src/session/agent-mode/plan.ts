import { SessionV1 } from "@opencode-ai/core/v1/session"
import { RoutingKind } from "./types"

// Plan mode routes via the user message agent field. plan_enter and plan_exit
// write synthetic user messages with agent set to plan or build; there is no
// session-level sticky state like debug mode uses.
export const routingKind = RoutingKind.MessageAgent

export function resolveFromMessageAgent(lastUser: SessionV1.User | undefined, requested?: string) {
  if (requested) return requested
  return lastUser?.agent
}

export * as SessionAgentModePlan from "./plan"
