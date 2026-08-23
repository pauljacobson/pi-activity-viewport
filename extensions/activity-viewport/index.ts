import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

import {
  ACTIVITY_OVERLAY_MAX_HEIGHT,
  ACTIVITY_OVERLAY_MIN_WIDTH,
  ACTIVITY_OVERLAY_WIDTH,
  ActivityOverlay,
} from "./activity-overlay";
import { ActivityViewport } from "./activity-viewport";
import { installActivityViewport } from "./pi-compat";

const WIDGET_KEY = "activity-viewport-probe";
const BODY_ROWS = 10;

class ProbeComponent implements Component {
  private queued = false;

  constructor(private readonly onReady: (probe: ProbeComponent) => void) {}

  render(): string[] {
    if (!this.queued) {
      this.queued = true;
      this.onReady(this);
    }
    return [];
  }

  invalidate(): void {
    this.queued = false;
  }
}

export default function activityViewportExtension(pi: ExtensionAPI): void {
  let enabled = true;
  let installed = false;
  let lastError: string | undefined;
  let disposePatch: (() => void) | undefined;
  let installGeneration = 0;
  let viewport: ActivityViewport | undefined;
  let activeTui: TUI | undefined;
  let overlayOpen = false;
  let closeOverlay: (() => void) | undefined;

  const runCleanup = (action: (() => void) | undefined): void => {
    try {
      action?.();
    } catch {
      // Cleanup is best-effort, but one failed step must not block the rest.
    }
  };

  const dispose = (): void => {
    installGeneration += 1;
    const close = closeOverlay;
    const patch = disposePatch;
    closeOverlay = undefined;
    disposePatch = undefined;
    viewport = undefined;
    activeTui = undefined;
    installed = false;

    runCleanup(close);
    runCleanup(patch);
  };

  const install = (ctx: ExtensionContext, tui: TUI, probe: Component): void => {
    if (!enabled || installed || ctx.mode !== "tui") return;
    const nextViewport = new ActivityViewport({
      bodyRows: BODY_ROWS,
      theme: () => ctx.ui.theme,
    });
    const result = installActivityViewport(tui, nextViewport, probe);
    if (!result.ok) {
      lastError = result.reason;
      ctx.ui.notify(`Activity viewport not installed: ${result.reason}`, "warning");
      return;
    }
    disposePatch = result.dispose;
    viewport = nextViewport;
    activeTui = tui;
    installed = true;
    lastError = undefined;
  };

  const render = (): void => activeTui?.requestRender(true);

  const showOverlay = async (ctx: ExtensionContext): Promise<void> => {
    if (overlayOpen) return;
    if (ctx.mode !== "tui" || !viewport || !activeTui) {
      ctx.ui.notify("Activity viewport is not available to expand.", "warning");
      return;
    }
    if (!viewport.hasActivity()) {
      ctx.ui.notify("There is no activity to expand yet.", "info");
      return;
    }

    overlayOpen = true;
    const tui = activeTui;
    const expandedViewport = viewport;
    expandedViewport.beginOverlay();
    try {
      await ctx.ui.custom<void>(
        (_overlayTui, _theme, keybindings, done) => {
          closeOverlay = () => done(undefined);
          return new ActivityOverlay(
            tui,
            () => ctx.ui.theme,
            keybindings,
            expandedViewport,
            closeOverlay,
          );
        },
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: ACTIVITY_OVERLAY_WIDTH,
            minWidth: ACTIVITY_OVERLAY_MIN_WIDTH,
            maxHeight: ACTIVITY_OVERLAY_MAX_HEIGHT,
            margin: 1,
          },
          onHandle: (handle) => handle.focus(),
        },
      );
    } catch {
      ctx.ui.notify("The activity overlay could not be opened safely.", "warning");
    } finally {
      closeOverlay = undefined;
      overlayOpen = false;
      expandedViewport.endOverlay();
      render();
    }
  };

  const queueInstall = (ctx: ExtensionContext, tui: TUI, probe: Component): void => {
    const generation = ++installGeneration;
    // Let other session_start UI extensions finish configuring the root first.
    queueMicrotask(() => queueMicrotask(() => {
      if (generation !== installGeneration) return;
      install(ctx, tui, probe);
    }));
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(
      WIDGET_KEY,
      (tui) => new ProbeComponent((probe) => queueInstall(ctx, tui, probe)),
      { placement: "aboveEditor" },
    );
  });

  pi.on("session_shutdown", (_event, ctx) => {
    dispose();
    if (ctx.mode === "tui") ctx.ui.setWidget(WIDGET_KEY, undefined);
  });

  pi.registerShortcut("ctrl+shift+o", {
    description: "Expand the latest activity viewport",
    handler: async (ctx) => showOverlay(ctx),
  });

  pi.registerCommand("activity-viewport", {
    description: "Enable, disable, inspect, scroll, or expand the activity viewport",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase() || "status";
      if (action === "off" || action === "disable") {
        enabled = false;
        dispose();
        if (ctx.mode === "tui") ctx.ui.setWidget(WIDGET_KEY, undefined);
        ctx.ui.notify("Activity viewport disabled; the full native transcript is visible.", "info");
        return;
      }
      if (action === "on" || action === "enable") {
        enabled = true;
        if (installed) {
          ctx.ui.notify("Activity viewport enabled.", "info");
          return;
        }
        if (ctx.mode !== "tui") {
          ctx.ui.notify("Activity viewport is only available in TUI mode.", "warning");
          return;
        }
        ctx.ui.setWidget(
          WIDGET_KEY,
          (tui) => new ProbeComponent((probe) => queueInstall(ctx, tui, probe)),
          { placement: "aboveEditor" },
        );
        ctx.ui.notify("Activity viewport enable queued.", "info");
        return;
      }
      if (action === "expand" || action === "open") {
        await showOverlay(ctx);
        return;
      }
      if (action === "up" || action === "back") {
        if (viewport?.scrollBy(1)) render();
        return;
      }
      if (action === "down" || action === "forward") {
        if (viewport?.scrollBy(-1)) render();
        return;
      }
      if (action === "latest" || action === "end") {
        if (viewport?.scrollToLatest()) render();
        return;
      }
      if (action !== "status") {
        ctx.ui.notify("Usage: /activity-viewport [on|off|status|expand|up|down|latest]", "warning");
        return;
      }
      const detail = installed
        ? `enabled · ${BODY_ROWS} activity rows`
        : enabled
          ? `not installed${lastError ? ` · ${lastError}` : ""}`
          : "disabled";
      ctx.ui.notify(`Activity viewport: ${detail}`, installed ? "info" : "warning");
    },
  });
}
