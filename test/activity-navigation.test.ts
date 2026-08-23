import assert from "node:assert/strict";
import test from "node:test";

import { ActivityNavigation } from "../extensions/activity-viewport/activity-navigation";

test("independent navigation instances do not share scroll state", () => {
  const inline = new ActivityNavigation(80, 10);
  const overlay = new ActivityNavigation(120, 30);

  assert.equal(inline.scrollBy(5, 50), true);
  assert.deepEqual(inline.visibleRange(50), { total: 50, start: 35, end: 45, newLines: 0 });
  assert.deepEqual(overlay.visibleRange(50), { total: 50, start: 20, end: 50, newLines: 0 });
});

test("new activity preserves a historical view and reports unseen lines", () => {
  const navigation = new ActivityNavigation(80, 10);

  navigation.visibleRange(100);
  navigation.scrollBy(20, 100);
  assert.deepEqual(navigation.visibleRange(100), { total: 100, start: 70, end: 80, newLines: 0 });
  assert.deepEqual(navigation.visibleRange(105), { total: 105, start: 70, end: 80, newLines: 5 });
});

test("returning to latest clears the unseen-line indicator", () => {
  const navigation = new ActivityNavigation(80, 10);

  navigation.visibleRange(100);
  navigation.scrollBy(20, 100);
  navigation.visibleRange(104);
  assert.equal(navigation.newLines, 4);
  assert.equal(navigation.scrollToLatest(), true);
  assert.deepEqual(navigation.visibleRange(104), { total: 104, start: 94, end: 104, newLines: 0 });
});

test("reset starts a new activity group in follow mode", () => {
  const navigation = new ActivityNavigation(80, 10);

  navigation.visibleRange(100);
  navigation.scrollBy(20, 100);
  navigation.visibleRange(103);
  navigation.reset();

  assert.deepEqual(navigation.visibleRange(8), { total: 8, start: 0, end: 8, newLines: 0 });
});
