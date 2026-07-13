import { Effect, Schema } from "effect"
import { Route, type RouteRoutedModelInput } from "../route/client"
import { Endpoint } from "../route/endpoint"
import { Framing } from "../route/framing"
import { Protocol } from "../route/protocol"
import * as OpenAIChat from "./openai-chat"
import { isRecord } from "./shared"

const ADAPTER = "openai-compatible-chat"

export type OpenAICompatibleChatModelInput = RouteRoutedModelInput

const OpenAICompatibleChatBody = Schema.StructWithRest(
  Schema.Struct(OpenAIChat.bodyFields),
  [Schema.Record(Schema.String, Schema.Any)],
)

const bodyOptions = (input: unknown) => {
  if (!isRecord(input)) return {}
  const openaiCompatible = isRecord(input.openaiCompatible) ? input.openaiCompatible : {}
  if (typeof openaiCompatible.userId !== "string") return {}
  return { user_id: openaiCompatible.userId }
}

export const protocol = Protocol.make({
  id: ADAPTER,
  body: {
    schema: OpenAICompatibleChatBody,
    from: (request) =>
      OpenAIChat.protocol.body.from(request).pipe(
        Effect.map((body) => ({
          ...body,
          ...bodyOptions(request.providerOptions),
        })),
      ),
  },
  stream: OpenAIChat.protocol.stream,
})

/**
 * Route for non-OpenAI providers that expose an OpenAI Chat-compatible
 * `/chat/completions` endpoint. Reuses `OpenAIChat.protocol` end-to-end and
 * overrides only the route id so providers can be resolved per-family without
 * colliding with native OpenAI. Provider helpers configure the route endpoint
 * before model selection.
 */
export const route = Route.make({
  id: ADAPTER,
  protocol,
  endpoint: Endpoint.path("/chat/completions"),
  framing: Framing.sse,
})

export * as OpenAICompatibleChat from "./openai-compatible-chat"
