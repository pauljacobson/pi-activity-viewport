import assert from "node:assert/strict";
import test from "node:test";

import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  AssistantMessageComponent,
  initTheme,
  type MarkdownTransformContext,
  type MarkdownTransformer,
} from "@earendil-works/pi-coding-agent";

import {
  projectAssistant,
  resetAssistantProjectionCache,
} from "../extensions/activity-viewport/assistant-projection";

initTheme("dark", false);

const usage: AssistantMessage["usage"] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

function assistantMessage(content: AssistantMessage["content"]): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: "compatibility-test",
    usage,
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function sourceComponent(
  message: AssistantMessage,
  transformer: MarkdownTransformer,
): AssistantMessageComponent {
  const source = new AssistantMessageComponent(
    undefined,
    false,
    undefined,
    "Thinking...",
    1,
    [transformer],
  );
  source.updateContent(message, true);
  return source;
}

test("response projections preserve Pi markdown transformers and streaming state", () => {
  resetAssistantProjectionCache();
  const contexts: MarkdownTransformContext[] = [];
  const source = sourceComponent(
    assistantMessage([{ type: "text", text: "original response" }]),
    (markdown, context) => {
      contexts.push(context);
      return markdown.replace("original", "transformed");
    },
  );

  const projection = projectAssistant(source);
  assert.ok(projection.response, "Pi's assistant component contract should expose a response projection");
  assert.match(projection.response.render(80).join("\n"), /transformed response/);
  assert.ok(contexts.some((context) => context.messageType === "assistant" && context.isStreaming));
});

test("activity projections work with Pi's current assistant component contract", () => {
  resetAssistantProjectionCache();
  const source = sourceComponent(
    assistantMessage([
      { type: "thinking", thinking: "original thought" },
      { type: "toolCall", id: "tool-1", name: "read", arguments: { path: "README.md" } },
    ]),
    (markdown) => markdown.replace("original", "transformed"),
  );

  const projection = projectAssistant(source);
  assert.ok(projection.activity, "Pi's assistant component contract should expose an activity projection");
  assert.match(projection.activity.render(80).join("\n"), /transformed thought/);
  assert.equal(projection.response, undefined);
});
