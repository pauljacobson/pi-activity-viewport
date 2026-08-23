import {
  AssistantMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

import { ActivityNavigation } from "./activity-navigation";
import { projectAssistant } from "./assistant-projection";

const MAX_ACTIVITY_LINES = 2_000;
const MAX_CACHED_GROUPS = 12;
const MAX_CACHED_WIDTHS = 3;

export type ActivityNavigationTarget = "inline" | "overlay";

type ActivityGroup = {
  components: Component[];
  eventCount: number;
  active: boolean;
  anchor?: Component;
};

type RenderToken =
  | { type: "component"; component: Component }
  | { type: "viewport"; group: ActivityGroup };

type ActivitySnapshot = {
  group: ActivityGroup;
  statusLines: string[];
};

type CachedActivityLines = {
  components: Component[];
  theme: Theme;
  lines: string[];
};

export type ActivityViewportOptions = {
  bodyRows: number;
  theme: () => Theme;
};

function renderComponent(component: Component, width: number): string[] {
  const lines = component.render(width);
  if (!Array.isArray(lines)) {
    throw new TypeError("Activity component returned an invalid render result");
  }
  return lines;
}

function horizontalRule(prefix: string, label: string, width: number): string {
  const used = visibleWidth(prefix) + visibleWidth(label) + 1;
  return `${prefix}${label} ${"─".repeat(Math.max(0, width - used))}`;
}

export class ActivityViewport {
  private latest?: ActivitySnapshot;
  private latestAnchor?: Component;
  private readonly inlineNavigation: ActivityNavigation;
  private readonly overlayNavigation: ActivityNavigation;
  private completedLineCache = new Map<Component, Map<number, CachedActivityLines>>();

  constructor(private readonly options: ActivityViewportOptions) {
    this.inlineNavigation = new ActivityNavigation(80, options.bodyRows);
    this.overlayNavigation = new ActivityNavigation(80, options.bodyRows);
  }

  render(
    transcriptChildren: Component[],
    statusLines: string[],
    width: number,
  ): string[] {
    const tokens: RenderToken[] = [];
    const groups: ActivityGroup[] = [];
    let currentGroup: ActivityGroup | undefined;
    let turnAnchor: Component | undefined;

    const ensureGroup = (): ActivityGroup => {
      if (currentGroup) return currentGroup;
      currentGroup = { components: [], eventCount: 0, active: false, anchor: turnAnchor };
      groups.push(currentGroup);
      tokens.push({ type: "viewport", group: currentGroup });
      return currentGroup;
    };

    for (const child of transcriptChildren) {
      if (child instanceof UserMessageComponent) {
        currentGroup = undefined;
        turnAnchor = child;
        tokens.push({ type: "component", component: child });
        continue;
      }

      if (child instanceof ToolExecutionComponent) {
        const group = ensureGroup();
        group.components.push(child);
        group.eventCount += 1;
        continue;
      }

      if (child instanceof AssistantMessageComponent) {
        const projection = projectAssistant(child);
        if (projection.activity) {
          const group = ensureGroup();
          group.components.push(projection.activity);
          group.eventCount += 1;
        }
        if (projection.response) {
          tokens.push({ type: "component", component: projection.response });
        }
        continue;
      }

      tokens.push({ type: "component", component: child });
    }

    if (statusLines.length > 0) {
      // A fresh user message closes the previous turn's group. Start a new
      // viewport for its working indicator instead of reviving the old group.
      const group = currentGroup ?? ensureGroup();
      group.active = true;
    }

    const latestGroup = groups.at(-1);
    if (latestGroup) {
      if (latestGroup.anchor && latestGroup.anchor !== this.latestAnchor) {
        this.inlineNavigation.reset();
        this.overlayNavigation.reset();
      }
      this.latestAnchor = latestGroup.anchor ?? this.latestAnchor;
      this.latest = {
        group: latestGroup,
        statusLines: latestGroup.active ? statusLines : [],
      };
    }

    const output: string[] = [];
    for (const token of tokens) {
      if (token.type === "component") {
        output.push(...renderComponent(token.component, width));
        continue;
      }
      const extraStatus = token.group.active ? statusLines : [];
      output.push(...this.renderGroup(token.group, extraStatus, width, token.group === latestGroup));
    }
    return output;
  }

  hasActivity(): boolean {
    return this.latest !== undefined;
  }

  beginOverlay(): void {
    this.overlayNavigation.reset();
  }

  endOverlay(): void {
    this.overlayNavigation.reset();
  }

  invalidate(): void {
    this.completedLineCache.clear();
  }

  scrollBy(delta: number, target: ActivityNavigationTarget = "inline"): boolean {
    if (!this.latest) return false;
    const navigation = this.navigation(target);
    const total = this.activityLines(this.latest, navigation.width).length;
    return navigation.scrollBy(delta, total);
  }

  scrollPage(
    direction: -1 | 1,
    rows = this.options.bodyRows,
    target: ActivityNavigationTarget = "inline",
  ): boolean {
    if (!this.latest) return false;
    const navigation = this.navigation(target);
    const total = this.activityLines(this.latest, navigation.width).length;
    return navigation.scrollPage(direction, total, rows);
  }

  scrollToLatest(target: ActivityNavigationTarget = "inline"): boolean {
    return this.navigation(target).scrollToLatest();
  }

  renderExpanded(width: number, bodyRows: number): string[] {
    const innerWidth = Math.max(1, width - 4);
    const contentWidth = Math.max(1, innerWidth - 1);
    this.overlayNavigation.setViewport(contentWidth, bodyRows);
    if (!this.latest) {
      return Array.from({ length: bodyRows }, (_, index) =>
        index === Math.floor(bodyRows / 2) ? this.options.theme().fg("dim", "No activity yet") : "",
      );
    }

    const visible = this.visibleLines(this.latest, contentWidth, bodyRows, "overlay");
    return this.withScrollbar(visible, contentWidth, bodyRows);
  }

  getScrollStatus(width: number, bodyRows: number): string {
    if (!this.latest) return "no activity";
    const contentWidth = Math.max(1, width - 5);
    const dimensionsChanged = this.overlayNavigation.width !== contentWidth
      || this.overlayNavigation.bodyRows !== bodyRows;
    this.overlayNavigation.setViewport(contentWidth, bodyRows);
    const currentRange = dimensionsChanged ? undefined : this.overlayNavigation.visible;
    const { total, start, end, newLines } = currentRange ?? this.visibleLines(
      this.latest,
      contentWidth,
      bodyRows,
      "overlay",
    );
    if (total === 0) return "no activity";
    const unseen = newLines > 0 ? ` · ↓ ${newLines} new` : "";
    return `lines ${start + 1}-${end} of ${total}${unseen}`;
  }

  private navigation(target: ActivityNavigationTarget): ActivityNavigation {
    return target === "overlay" ? this.overlayNavigation : this.inlineNavigation;
  }

  private activityLines(snapshot: ActivitySnapshot, innerWidth: number): string[] {
    const cacheKey = snapshot.group.anchor ?? snapshot.group.components[0];
    const theme = this.options.theme();
    if (!snapshot.group.active && snapshot.statusLines.length === 0 && cacheKey) {
      const cachedByWidth = this.completedLineCache.get(cacheKey);
      const cached = cachedByWidth?.get(innerWidth);
      if (
        cached
        && cached.theme === theme
        && cached.components.length === snapshot.group.components.length
        && cached.components.every((component, index) => component === snapshot.group.components[index])
      ) {
        // Refresh recency so the bounded cache keeps recently visible turns.
        this.completedLineCache.delete(cacheKey);
        this.completedLineCache.set(cacheKey, cachedByWidth!);
        return cached.lines;
      }

      const lines = this.renderBoundedActivity(snapshot, innerWidth, theme);
      const nextByWidth = cachedByWidth ?? new Map<number, CachedActivityLines>();
      if (!nextByWidth.has(innerWidth) && nextByWidth.size >= MAX_CACHED_WIDTHS) {
        const oldestWidth = nextByWidth.keys().next().value;
        if (oldestWidth !== undefined) nextByWidth.delete(oldestWidth);
      }
      nextByWidth.set(innerWidth, {
        components: [...snapshot.group.components],
        theme,
        lines,
      });
      if (!this.completedLineCache.has(cacheKey) && this.completedLineCache.size >= MAX_CACHED_GROUPS) {
        const oldestGroup = this.completedLineCache.keys().next().value;
        if (oldestGroup) this.completedLineCache.delete(oldestGroup);
      }
      this.completedLineCache.delete(cacheKey);
      this.completedLineCache.set(cacheKey, nextByWidth);
      return lines;
    }

    return this.renderBoundedActivity(snapshot, innerWidth, theme);
  }

  private renderBoundedActivity(snapshot: ActivitySnapshot, innerWidth: number, theme: Theme): string[] {
    const statusLines = snapshot.statusLines.map((line) => truncateToWidth(line, innerWidth, ""));
    const chunks: string[][] = [];
    let remaining = Math.max(0, MAX_ACTIVITY_LINES - statusLines.length);
    let truncated = statusLines.length > MAX_ACTIVITY_LINES;

    for (let index = snapshot.group.components.length - 1; index >= 0; index -= 1) {
      if (remaining === 0) {
        truncated = true;
        break;
      }
      const rendered = renderComponent(snapshot.group.components[index]!, innerWidth);
      if (rendered.length > remaining) {
        chunks.unshift(rendered.slice(-remaining));
        remaining = 0;
        truncated = true;
        break;
      }
      chunks.unshift(rendered);
      remaining -= rendered.length;
    }

    const combined = [...chunks.flat(), ...statusLines].slice(-MAX_ACTIVITY_LINES);
    if (!truncated) return combined;
    const marker = theme.fg("dim", `… earlier activity truncated to ${MAX_ACTIVITY_LINES} lines`);
    return [marker, ...combined.slice(-(MAX_ACTIVITY_LINES - 1))];
  }

  private visibleLines(
    snapshot: ActivitySnapshot,
    innerWidth: number,
    bodyRows: number,
    target: ActivityNavigationTarget,
  ): {
    lines: string[];
    total: number;
    start: number;
    end: number;
    newLines: number;
  } {
    const combined = this.activityLines(snapshot, innerWidth);
    const navigation = this.navigation(target);
    navigation.setViewport(innerWidth, bodyRows);
    const range = navigation.visibleRange(combined.length, bodyRows);
    return { ...range, lines: combined.slice(range.start, range.end) };
  }

  private withScrollbar(
    visible: { lines: string[]; total: number; start: number; end: number },
    contentWidth: number,
    bodyRows: number,
  ): string[] {
    const theme = this.options.theme();
    const emptyRows = Math.max(0, bodyRows - visible.lines.length);
    const rows = [
      ...Array.from({ length: emptyRows }, () => ""),
      ...visible.lines,
    ];
    const glyphs = Array.from({ length: bodyRows }, () => " ");

    if (visible.total > bodyRows) {
      const thumbSize = Math.max(1, Math.ceil((bodyRows * bodyRows) / visible.total));
      const travel = Math.max(0, bodyRows - thumbSize);
      const maxStart = Math.max(1, visible.total - bodyRows);
      const thumbStart = Math.round((visible.start / maxStart) * travel);
      for (let index = 0; index < bodyRows; index += 1) {
        glyphs[index] = index >= thumbStart && index < thumbStart + thumbSize
          ? theme.fg("accent", "█")
          : theme.fg("borderMuted", "│");
      }
    }

    return rows.map((line, index) =>
      `${truncateToWidth(line, contentWidth, "", true)}${glyphs[index] ?? " "}`,
    );
  }

  private renderGroup(
    group: ActivityGroup,
    statusLines: string[],
    width: number,
    scrollable: boolean,
  ): string[] {
    if (width < 12) {
      return [
        ...group.components.flatMap((component) => renderComponent(component, width)),
        ...statusLines.map((line) => truncateToWidth(line, width, "")),
      ];
    }

    const theme = this.options.theme();
    const innerWidth = Math.max(1, width - 4);
    const contentWidth = Math.max(1, innerWidth - 1);
    const snapshot = { group, statusLines };
    if (scrollable) {
      this.inlineNavigation.setViewport(contentWidth, this.options.bodyRows);
    }
    const visibleResult = scrollable
      ? this.visibleLines(snapshot, contentWidth, this.options.bodyRows, "inline")
      : (() => {
          const activityLines = this.activityLines(snapshot, contentWidth);
          return {
            lines: activityLines.slice(-this.options.bodyRows),
            total: activityLines.length,
            start: Math.max(0, activityLines.length - this.options.bodyRows),
            end: activityLines.length,
            newLines: 0,
          };
        })();
    const visible = this.withScrollbar(visibleResult, contentWidth, this.options.bodyRows);
    const earlier = visibleResult.start;
    const later = Math.max(0, visibleResult.total - visibleResult.end);
    const state = group.active ? "● live" : "✓ complete";
    const scrollLabel = earlier > 0 || later > 0
      ? ` · ↑${earlier} ↓${later}`
      : "";
    const unseenLabel = visibleResult.newLines > 0
      ? ` · ${visibleResult.newLines} new below`
      : "";
    const label = ` Activity · ${group.eventCount} events · ${state}${scrollLabel}${unseenLabel}`;
    const top = truncateToWidth(
      theme.fg("borderMuted", horizontalRule("┌─", label, width)),
      width,
      "",
    );
    const bottomHint = scrollable && visibleResult.total > this.options.bodyRows
      ? " Ctrl+Shift+O expand "
      : "";
    const bottomRuleWidth = Math.max(0, width - 2 - visibleWidth(bottomHint));
    const bottom = truncateToWidth(
      theme.fg("borderMuted", `└${"─".repeat(bottomRuleWidth)}${bottomHint}┘`),
      width,
      "",
    );
    const border = (text: string) => theme.fg("borderMuted", text);
    const body = visible.map((line) => {
      const padded = truncateToWidth(line, innerWidth, "", true);
      return `${border("│ ")}${padded}\x1b[0m${border(" │")}`;
    });

    return [top, ...body, bottom];
  }
}
