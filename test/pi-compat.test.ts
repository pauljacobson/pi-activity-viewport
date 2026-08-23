import assert from "node:assert/strict";
import test from "node:test";

import type { Component, TUI } from "@earendil-works/pi-tui";

import { installActivityViewport } from "../extensions/activity-viewport/pi-compat";

function container(children: Component[], lines: string[] = []): Component & { children: Component[] } {
  return {
    children,
    render: () => lines,
    invalidate: () => {},
  };
}

function component(lines: string[] = []): Component {
  return {
    render: () => lines,
    invalidate: () => {},
  };
}

test("rejects an unrecognized layout even when terminal rows is customized", () => {
  const terminal = { columns: 100, write: () => {} } as Record<string, unknown>;
  Object.defineProperty(terminal, "rows", {
    configurable: true,
    get: () => 30,
  });
  const tui = {
    children: [],
    terminal,
    requestRender: () => {},
  } as unknown as TUI;

  const result = installActivityViewport(tui, { render: () => [] } as never, component());
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /layout was not recognized/);
});

test("patches the nested chat container in Pi 0.84's document layout", () => {
  const probe = component();
  const transcriptChild = component(["tool activity"]);
  const chat = container([transcriptChild], ["native chat"]);
  const document = container([
    container([], ["header"]),
    container([], ["resources"]),
    chat,
  ], ["native document"]);
  const pending = container([]);
  const status = container([], ["working"]);
  const widgetsAbove = container([probe]);
  const editorContainer = container([component()]);
  const widgetsBelow = container([]);
  const footer = container([]);
  const tui = {
    children: [document, pending, status, widgetsAbove, editorContainer, widgetsBelow, footer],
    requestRender: () => {},
  } as unknown as TUI;
  let renderedChildren: Component[] | undefined;
  const viewport = {
    render: (children: Component[]) => {
      renderedChildren = children;
      return ["activity viewport"];
    },
  };

  const result = installActivityViewport(tui, viewport as never, probe);

  assert.equal(result.ok, true, result.ok ? undefined : result.reason);
  assert.deepEqual(chat.render(100), ["activity viewport"]);
  assert.equal(renderedChildren, chat.children);
  assert.deepEqual(document.render(100), ["native document"]);
  assert.deepEqual(status.render(100), []);
});

test("installs while Pi temporarily shows its reload component in the editor container", () => {
  const probe = component();
  const chat = container([], ["native chat"]);
  const pending = container([]);
  const status = container([component(["reloading"])]);
  const widgetsAbove = container([probe]);
  const reloadComponent = container([component(["Reloading extensions..."])]);
  const editorContainer = container([reloadComponent]);
  const tui = {
    children: [chat, pending, status, widgetsAbove, editorContainer],
    requestRender: () => {},
  } as unknown as TUI;

  const result = installActivityViewport(
    tui,
    { render: () => ["activity viewport"] } as never,
    probe,
  );

  assert.equal(result.ok, true, result.ok ? undefined : result.reason);
  assert.deepEqual(chat.render(100), ["activity viewport"]);
});

test("falls back to native chat and status when viewport rendering fails", () => {
  const probe = component();
  const chat = container([], ["native chat"]);
  const pending = container([]);
  const status = container([], ["native status"]);
  const widgetsAbove = container([probe]);
  const editorContainer = container([component()]);
  const tui = {
    children: [chat, pending, status, widgetsAbove, editorContainer],
    requestRender: () => {},
  } as unknown as TUI;
  const viewport = {
    render: () => { throw new Error("incompatible renderer"); },
    invalidate: () => {},
  };

  const result = installActivityViewport(tui, viewport as never, probe);

  assert.equal(result.ok, true, result.ok ? undefined : result.reason);
  assert.deepEqual(chat.render(100), ["native chat"]);
  assert.deepEqual(status.render(100), ["native status"]);
});

test("forwards Pi invalidation to the viewport cache", () => {
  const probe = component();
  const chat = container([], ["native chat"]);
  const pending = container([]);
  const status = container([], ["native status"]);
  const widgetsAbove = container([probe]);
  const editorContainer = container([component()]);
  const tui = {
    children: [chat, pending, status, widgetsAbove, editorContainer],
    requestRender: () => {},
  } as unknown as TUI;
  let invalidations = 0;
  const viewport = {
    render: () => ["activity viewport"],
    invalidate: () => { invalidations += 1; },
  };

  const result = installActivityViewport(tui, viewport as never, probe);
  assert.equal(result.ok, true, result.ok ? undefined : result.reason);

  chat.invalidate();
  assert.equal(invalidations, 1);
});

test("installs alongside a fixed editor rows accessor when the Pi layout is compatible", () => {
  const probe = component();
  const editor = {
    ...component(),
    getText: () => "",
    setText: () => {},
    handleInput: () => {},
  };
  const chat = container([], ["native chat"]);
  const pending = container([]);
  // pi-fixed-editor hides this renderable after retaining its original renderer.
  const hiddenStatus = container([]);
  const widgetsAbove = container([probe]);
  const editorContainer = container([editor]);
  const terminal = { columns: 100, write: () => {} } as Record<string, unknown>;
  Object.defineProperty(terminal, "rows", {
    configurable: true,
    get: () => 30,
  });
  let renders = 0;
  const tui = {
    children: [chat, pending, hiddenStatus, widgetsAbove, editorContainer],
    terminal,
    requestRender: () => { renders += 1; },
  } as unknown as TUI;
  const viewport = {
    render: () => ["activity viewport"],
  };

  const result = installActivityViewport(tui, viewport as never, probe);
  assert.equal(result.ok, true, result.ok ? undefined : result.reason);
  assert.deepEqual(chat.render(100), ["activity viewport"]);
  assert.equal(renders, 1);

  if (result.ok) result.dispose();
  assert.deepEqual(chat.render(100), ["native chat"]);
});
