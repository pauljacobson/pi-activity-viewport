import { VERSION } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

import type { ActivityViewport } from "./activity-viewport";
import { resetAssistantProjectionCache } from "./assistant-projection";

const PATCH_MARKER = Symbol.for("pi.activity-viewport.patch");
type RenderableContainer = Component & {
  children: Component[];
  [PATCH_MARKER]?: boolean;
};

type PatchResult =
  | { ok: true; dispose: () => void }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isContainer(value: unknown): value is RenderableContainer {
  return isRecord(value)
    && typeof Reflect.get(value, "render") === "function"
    && typeof Reflect.get(value, "invalidate") === "function"
    && Array.isArray(Reflect.get(value, "children"));
}

function findRootContainerIndex(children: Component[], component: Component): number | undefined {
  const index = children.findIndex((child) => isContainer(child) && child.children.includes(component));
  return index === -1 ? undefined : index;
}

type PiLayout = {
  chat: RenderableContainer;
  status: RenderableContainer;
};

/**
 * Pi 0.84 wraps header, resources, and chat in a document container, then adds
 * below-editor widgets and a footer after the editor. Return the nested chat
 * only when that complete shape is present so an older chat container is not
 * accidentally unwrapped merely because it happens to have three children.
 */
function findDocumentChat(
  rootChildren: Component[],
  widgetIndex: number,
  transcriptRoot: RenderableContainer,
): RenderableContainer | undefined {
  if (!isContainer(rootChildren[widgetIndex + 2]) || !isContainer(rootChildren[widgetIndex + 3])) {
    return undefined;
  }
  if (transcriptRoot.children.length !== 3) return undefined;
  const [header, resources, chat] = transcriptRoot.children;
  if (!isContainer(header) || !isContainer(resources) || !isContainer(chat)) return undefined;
  return chat;
}

/**
 * Find Pi's transcript and status containers by anchoring on our probe widget.
 *
 * Pi 0.80.x–0.81.x exposes chat directly as the first root row. Pi 0.84.x
 * exposes a document row there and nests chat below header/resources. During
 * /reload, Pi temporarily replaces the editor with a reload component before
 * firing session_start, so compatibility is based on stable surrounding rows.
 */
function findCompatibleLayout(tui: TUI, probe: Component): PiLayout | undefined {
  const rootChildren = tui.children;
  const widgetIndex = findRootContainerIndex(rootChildren, probe);
  if (widgetIndex === undefined || widgetIndex < 3) return undefined;

  const editor = rootChildren[widgetIndex + 1];
  const status = rootChildren[widgetIndex - 1];
  const pendingMessages = rootChildren[widgetIndex - 2];
  const transcriptRoot = rootChildren[widgetIndex - 3];

  if (!isContainer(editor)) return undefined;
  if (!isContainer(status) || !isContainer(pendingMessages) || !isContainer(transcriptRoot)) return undefined;
  const chat = findDocumentChat(rootChildren, widgetIndex, transcriptRoot) ?? transcriptRoot;
  if (chat === status) return undefined;

  return { chat, status };
}

function restoreOwnDescriptor(target: object, key: PropertyKey, descriptor?: PropertyDescriptor): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

/** Locate and patch Pi's compatible chat/status render seams. */
export function installActivityViewport(
  tui: TUI,
  viewport: ActivityViewport,
  probe: Component,
): PatchResult {
  // A fixed-editor extension may install an own terminal.rows accessor while
  // leaving Pi's transcript containers intact. Compatibility is determined by
  // the structural checks below, not by terminal ownership alone.
  const layout = findCompatibleLayout(tui, probe);
  if (!layout) {
    return { ok: false, reason: `Pi ${VERSION}'s chat/status layout was not recognized` };
  }
  const { chat, status } = layout;
  if (chat[PATCH_MARKER]) {
    return { ok: false, reason: "activity viewport is already installed" };
  }

  const chatRenderDescriptor = Object.getOwnPropertyDescriptor(chat, "render");
  const chatInvalidateDescriptor = Object.getOwnPropertyDescriptor(chat, "invalidate");
  const statusRenderDescriptor = Object.getOwnPropertyDescriptor(status, "render");
  const markerDescriptor = Object.getOwnPropertyDescriptor(chat, PATCH_MARKER);
  const originalChatRender = chat.render.bind(chat);
  const originalChatInvalidate = chat.invalidate.bind(chat);
  const originalStatusRender = status.render.bind(status);
  let viewportRenderSucceeded = false;

  const chatRender = (width: number): string[] => {
    viewportRenderSucceeded = false;
    try {
      const innerStatusWidth = Math.max(1, width - 4);
      const rendered = viewport.render(chat.children, originalStatusRender(innerStatusWidth), width);
      viewportRenderSucceeded = true;
      return rendered;
    } catch {
      return originalChatRender(width);
    }
  };
  const chatInvalidate = (): void => {
    originalChatInvalidate();
    viewport.invalidate();
    resetAssistantProjectionCache();
  };
  const statusRender = (width: number): string[] =>
    viewportRenderSucceeded ? [] : originalStatusRender(width);

  try {
    Object.defineProperty(chat, PATCH_MARKER, { value: true, configurable: true });
    Object.defineProperty(chat, "render", { value: chatRender, configurable: true, writable: true });
    Object.defineProperty(chat, "invalidate", { value: chatInvalidate, configurable: true, writable: true });
    Object.defineProperty(status, "render", { value: statusRender, configurable: true, writable: true });
  } catch {
    restoreOwnDescriptor(chat, "render", chatRenderDescriptor);
    restoreOwnDescriptor(chat, "invalidate", chatInvalidateDescriptor);
    restoreOwnDescriptor(status, "render", statusRenderDescriptor);
    restoreOwnDescriptor(chat, PATCH_MARKER, markerDescriptor);
    return { ok: false, reason: "Pi's render methods could not be patched safely" };
  }

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (chat.render === chatRender) restoreOwnDescriptor(chat, "render", chatRenderDescriptor);
    if (chat.invalidate === chatInvalidate) restoreOwnDescriptor(chat, "invalidate", chatInvalidateDescriptor);
    if (status.render === statusRender) restoreOwnDescriptor(status, "render", statusRenderDescriptor);
    if (chat[PATCH_MARKER]) restoreOwnDescriptor(chat, PATCH_MARKER, markerDescriptor);
    resetAssistantProjectionCache();
    tui.requestRender(true);
  };

  tui.requestRender(true);
  return { ok: true, dispose };
}
