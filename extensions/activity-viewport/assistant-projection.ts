import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  AssistantMessageComponent,
  type MarkdownTransformer,
} from "@earendil-works/pi-coding-agent";

type RuntimeAssistantFields = {
  lastMessage?: AssistantMessage;
  hideThinkingBlock?: boolean;
  markdownTheme?: ConstructorParameters<typeof AssistantMessageComponent>[2];
  hiddenThinkingLabel?: string;
  outputPad?: number;
  markdownTransformers?: readonly MarkdownTransformer[];
  isStreaming?: boolean;
};

type Projection = {
  fingerprint: string;
  activity?: AssistantMessageComponent;
  response?: AssistantMessageComponent;
};

let cache = new WeakMap<AssistantMessageComponent, Projection>();

export function resetAssistantProjectionCache(): void {
  cache = new WeakMap<AssistantMessageComponent, Projection>();
}

function projectedMessage(
  source: AssistantMessage,
  content: AssistantMessage["content"],
  preserveStopReason: boolean,
): AssistantMessage {
  return {
    ...source,
    content,
    stopReason: preserveStopReason ? source.stopReason : "stop",
    errorMessage: preserveStopReason ? source.errorMessage : undefined,
  };
}

function createNativeProjection(
  source: RuntimeAssistantFields,
  message: AssistantMessage,
): AssistantMessageComponent {
  const projection = new AssistantMessageComponent(
    undefined,
    source.hideThinkingBlock ?? false,
    source.markdownTheme,
    source.hiddenThinkingLabel ?? "Thinking...",
    source.outputPad ?? 1,
    source.markdownTransformers ?? [],
  );
  projection.updateContent(message, source.isStreaming ?? false);
  return projection;
}

function fingerprint(message: AssistantMessage): string {
  return JSON.stringify({
    content: message.content,
    stopReason: message.stopReason,
    errorMessage: message.errorMessage,
  });
}

/** Split one native assistant row into ephemeral activity and durable response projections. */
export function projectAssistant(source: AssistantMessageComponent): Projection {
  const runtime = source as unknown as RuntimeAssistantFields;
  const message = runtime.lastMessage;
  // Pi does not expose the source message publicly. If a future compatible
  // component changes this internal field, preserve its native rendering
  // rather than dropping assistant output from the transcript.
  if (!message) return { fingerprint: "native-fallback", response: source };

  const nextFingerprint = fingerprint(message);
  const previous = cache.get(source);
  if (previous?.fingerprint === nextFingerprint) return previous;

  const hasToolCalls = message.content.some((item) => item.type === "toolCall");
  const activityContent = message.content.filter(
    (item) => item.type === "thinking" || item.type === "toolCall" || (hasToolCalls && item.type === "text"),
  );
  const responseContent = hasToolCalls
    ? []
    : message.content.filter((item) => item.type === "text");

  const next: Projection = {
    fingerprint: nextFingerprint,
    activity: activityContent.some((item) => item.type === "thinking" || item.type === "text")
      ? createNativeProjection(runtime, projectedMessage(message, activityContent, false))
      : undefined,
    response: responseContent.some((item) => item.type === "text" && item.text.trim())
      ? createNativeProjection(runtime, projectedMessage(message, responseContent, true))
      : undefined,
  };

  cache.set(source, next);
  return next;
}
