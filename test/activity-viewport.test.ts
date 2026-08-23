import assert from "node:assert/strict";
import test from "node:test";

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

import { ActivityViewport } from "../extensions/activity-viewport/activity-viewport";

function fakeTheme(): Theme {
  return {
    fg: (_color: string, text: string) => text,
  } as unknown as Theme;
}

function linesComponent(count: number, onRender?: () => void): Component {
  return {
    render: () => {
      onRender?.();
      return Array.from({ length: count }, (_, index) => `line ${index + 1}`);
    },
    invalidate: () => {},
  };
}

test("activity rendering is capped and reports truncation", () => {
  const theme = fakeTheme();
  const viewport = new ActivityViewport({ bodyRows: 10, theme: () => theme });
  const snapshot = {
    group: {
      components: [linesComponent(2_500)],
      eventCount: 1,
      active: true,
    },
    statusLines: [],
  };
  const renderBounded = Reflect.get(viewport, "renderBoundedActivity") as (
    value: typeof snapshot,
    width: number,
    currentTheme: Theme,
  ) => string[];

  const lines = renderBounded.call(viewport, snapshot, 80, theme);
  assert.equal(lines.length, 2_000);
  assert.match(lines[0]!, /earlier activity truncated/);
  assert.equal(lines.at(-1), "line 2500");
});

test("overlay status reuses the activity range calculated during rendering", () => {
  let renders = 0;
  const theme = fakeTheme();
  const viewport = new ActivityViewport({ bodyRows: 10, theme: () => theme });
  const snapshot = {
    group: {
      components: [linesComponent(40, () => { renders += 1; })],
      eventCount: 1,
      active: true,
    },
    statusLines: [],
  };
  Reflect.set(viewport, "latest", snapshot);

  viewport.beginOverlay();
  viewport.renderExpanded(100, 20);
  assert.match(viewport.getScrollStatus(100, 20), /lines 21-40 of 40/);
  assert.equal(renders, 1);
});

test("completed activity cache evicts old groups", () => {
  const theme = fakeTheme();
  const viewport = new ActivityViewport({ bodyRows: 10, theme: () => theme });
  const activityLines = Reflect.get(viewport, "activityLines") as (
    value: {
      group: { components: Component[]; eventCount: number; active: boolean; anchor: Component };
      statusLines: string[];
    },
    width: number,
  ) => string[];

  for (let index = 0; index < 13; index += 1) {
    activityLines.call(viewport, {
      group: {
        components: [linesComponent(1)],
        eventCount: 1,
        active: false,
        anchor: linesComponent(1),
      },
      statusLines: [],
    }, 80);
  }

  const cache = Reflect.get(viewport, "completedLineCache") as Map<Component, unknown>;
  assert.equal(cache.size, 12);
});

test("completed activity lines are cached until rendering inputs change", () => {
  let renders = 0;
  let theme = fakeTheme();
  const viewport = new ActivityViewport({ bodyRows: 10, theme: () => theme });
  const component = linesComponent(3, () => { renders += 1; });
  const anchor = linesComponent(1);
  const snapshot = {
    group: {
      components: [component],
      eventCount: 1,
      active: false,
      anchor,
    },
    statusLines: [],
  };
  const activityLines = Reflect.get(viewport, "activityLines") as (
    value: typeof snapshot,
    width: number,
  ) => string[];

  activityLines.call(viewport, snapshot, 80);
  activityLines.call(viewport, snapshot, 80);
  assert.equal(renders, 1);

  theme = fakeTheme();
  activityLines.call(viewport, snapshot, 80);
  assert.equal(renders, 2);
});
