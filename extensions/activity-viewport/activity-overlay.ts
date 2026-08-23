import type {
  KeybindingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";

import { ActivityViewport } from "./activity-viewport";

export const ACTIVITY_OVERLAY_WIDTH = "70%" as const;
export const ACTIVITY_OVERLAY_MIN_WIDTH = 48;
export const ACTIVITY_OVERLAY_MAX_HEIGHT = "70%" as const;
const ACTIVITY_OVERLAY_RATIO = 0.7;
const MINIMIZE_LABEL = "[ Esc minimize ]";

export class ActivityOverlay implements Component {
  private bodyRows = 1;

  constructor(
    private readonly tui: TUI,
    private readonly getTheme: () => Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly viewport: ActivityViewport,
    private readonly onMinimize: () => void,
  ) {}

  handleInput(data: string): void {
    if (
      this.keybindings.matches(data, "tui.select.cancel")
      || this.keybindings.matches(data, "app.interrupt")
      || matchesKey(data, "m")
      || matchesKey(data, "q")
    ) {
      this.onMinimize();
      return;
    }

    let changed = false;
    if (this.keybindings.matches(data, "tui.select.up") || matchesKey(data, "k")) {
      changed = this.viewport.scrollBy(1, "overlay");
    } else if (this.keybindings.matches(data, "tui.select.down") || matchesKey(data, "j")) {
      changed = this.viewport.scrollBy(-1, "overlay");
    } else if (this.keybindings.matches(data, "tui.select.pageUp") || matchesKey(data, Key.ctrl("u"))) {
      changed = this.viewport.scrollPage(1, this.bodyRows, "overlay");
    } else if (this.keybindings.matches(data, "tui.select.pageDown") || matchesKey(data, Key.ctrl("d"))) {
      changed = this.viewport.scrollPage(-1, this.bodyRows, "overlay");
    } else if (matchesKey(data, Key.home) || matchesKey(data, "g")) {
      changed = this.viewport.scrollBy(Number.MAX_SAFE_INTEGER, "overlay");
    } else if (matchesKey(data, Key.end) || matchesKey(data, "shift+g")) {
      changed = this.viewport.scrollToLatest("overlay");
    }

    if (changed) this.tui.requestRender();
  }

  render(width: number): string[] {
    const theme = this.getTheme();
    const targetHeight = Math.max(5, Math.floor(this.tui.terminal.rows * ACTIVITY_OVERLAY_RATIO));
    this.bodyRows = Math.max(1, targetHeight - 4);
    const innerWidth = Math.max(1, width - 2);
    const contentWidth = Math.max(1, width - 4);
    const border = (text: string) => theme.fg("borderAccent", text);
    const pad = (text: string) => truncateToWidth(text, innerWidth, "", true);
    const lines: string[] = [];

    const title = " Activity ";
    const titleWidth = visibleWidth(title);
    const leftRule = "─".repeat(Math.max(0, Math.floor((innerWidth - titleWidth) / 2)));
    const rightRule = "─".repeat(Math.max(0, innerWidth - titleWidth - leftRule.length));
    lines.push(border(`╭${leftRule}`) + theme.fg("accent", theme.bold(title)) + border(`${rightRule}╮`));

    // Render activity first so the status line can reuse the same navigation
    // calculation instead of rendering the full activity history twice.
    const activity = this.viewport.renderExpanded(width, this.bodyRows);
    const status = this.viewport.getScrollStatus(width, this.bodyRows);
    lines.push(border("│") + pad(` ${theme.fg("dim", status)}`) + border("│"));
    const emptyRows = this.bodyRows - activity.length;
    for (let index = 0; index < emptyRows; index += 1) {
      lines.push(border("│") + pad("") + border("│"));
    }
    for (const line of activity) {
      lines.push(border("│") + pad(` ${truncateToWidth(line, contentWidth, "")}`) + border("│"));
    }

    const help = this.navigationHelp(innerWidth);
    const availableGap = Math.max(1, innerWidth - visibleWidth(help) - visibleWidth(MINIMIZE_LABEL) - 1);
    const footerContent = `${theme.fg("dim", help)}${" ".repeat(availableGap)}${theme.fg("accent", MINIMIZE_LABEL)}`;
    lines.push(border("│") + pad(footerContent) + border("│"));
    lines.push(border(`╰${"─".repeat(innerWidth)}╯`));

    return lines;
  }

  invalidate(): void {}

  private navigationHelp(width: number): string {
    const up = this.bindingLabel("tui.select.up", "↑");
    const down = this.bindingLabel("tui.select.down", "↓");
    const pageUp = this.bindingLabel("tui.select.pageUp", "PgUp");
    const pageDown = this.bindingLabel("tui.select.pageDown", "PgDn");
    const cancel = this.bindingLabel("tui.select.cancel", "Esc");
    if (width < 66) return ` ${up}/${down} scroll · ${cancel} close `;
    return ` ${up}/${down} or j/k scroll · ${pageUp}/${pageDown} page · g/G ends · ${cancel} close `;
  }

  private bindingLabel(
    binding: "tui.select.up" | "tui.select.down" | "tui.select.pageUp" | "tui.select.pageDown" | "tui.select.cancel",
    fallback: string,
  ): string {
    const key = this.keybindings.getKeys(binding)[0];
    if (!key) return fallback;
    return key
      .replace("pageUp", "PgUp")
      .replace("pageDown", "PgDn")
      .replace("escape", "Esc")
      .replace("ctrl+", "Ctrl+")
      .replace("shift+", "Shift+")
      .replace("alt+", "Alt+")
      .replace("up", "↑")
      .replace("down", "↓");
  }
}
