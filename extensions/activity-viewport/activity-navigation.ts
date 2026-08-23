export type ActivityVisibleRange = {
  total: number;
  start: number;
  end: number;
  newLines: number;
};

/** Owns scroll/follow state for one activity surface. */
export class ActivityNavigation {
  private scrollOffset = 0;
  private lastTotal: number | undefined;
  private pendingNewLines = 0;
  private lastVisibleRange: ActivityVisibleRange | undefined;
  private currentWidth: number;
  private currentBodyRows: number;

  constructor(width: number, bodyRows: number) {
    this.currentWidth = width;
    this.currentBodyRows = bodyRows;
  }

  get width(): number {
    return this.currentWidth;
  }

  get bodyRows(): number {
    return this.currentBodyRows;
  }

  get newLines(): number {
    return this.pendingNewLines;
  }

  get visible(): ActivityVisibleRange | undefined {
    return this.lastVisibleRange ? { ...this.lastVisibleRange } : undefined;
  }

  setViewport(width: number, bodyRows: number): void {
    this.currentWidth = width;
    this.currentBodyRows = bodyRows;
  }

  reset(): void {
    this.scrollOffset = 0;
    this.lastTotal = undefined;
    this.pendingNewLines = 0;
    this.lastVisibleRange = undefined;
  }

  scrollBy(delta: number, total: number): boolean {
    this.reconcileTotal(total);
    const maxOffset = Math.max(0, total - this.currentBodyRows);
    const next = Math.max(0, Math.min(maxOffset, this.scrollOffset + delta));
    if (next === this.scrollOffset) return false;
    this.scrollOffset = next;
    if (next === 0) this.pendingNewLines = 0;
    return true;
  }

  scrollPage(direction: -1 | 1, total: number, rows = this.currentBodyRows): boolean {
    return this.scrollBy(direction * Math.max(1, rows - 1), total);
  }

  scrollToLatest(): boolean {
    if (this.scrollOffset === 0) return false;
    this.scrollOffset = 0;
    this.pendingNewLines = 0;
    return true;
  }

  visibleRange(total: number, bodyRows = this.currentBodyRows): ActivityVisibleRange {
    this.currentBodyRows = bodyRows;
    this.reconcileTotal(total);
    const maxOffset = Math.max(0, total - bodyRows);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    if (this.scrollOffset === 0) this.pendingNewLines = 0;
    const end = Math.max(0, total - this.scrollOffset);
    const start = Math.max(0, end - bodyRows);
    this.lastVisibleRange = { total, start, end, newLines: this.pendingNewLines };
    return { ...this.lastVisibleRange };
  }

  private reconcileTotal(total: number): void {
    if (this.lastTotal !== undefined && total > this.lastTotal && this.scrollOffset > 0) {
      const added = total - this.lastTotal;
      // Keep the same historical lines in view while activity arrives below.
      this.scrollOffset += added;
      this.pendingNewLines += added;
    }
    this.lastTotal = total;
    const maxOffset = Math.max(0, total - this.currentBodyRows);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    if (this.scrollOffset === 0) this.pendingNewLines = 0;
  }
}
