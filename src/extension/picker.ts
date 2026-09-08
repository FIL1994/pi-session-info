import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, SelectList, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { relativeTime, terminalText } from "../format";

export type SessionsTab = "Running" | "Recent";
export interface PageRow { id: string; project: string; name: string; meta: string; pinned?: boolean; savedAt?: string }
export interface SessionPage {
  tab: SessionsTab;
  summary: string;
  rows: PageRow[];
  actions: string[];
  coverage: string[];
  empty: string;
  updatedAt?: number;
  notice?: string;
  selectedId?: string;
  now: number;
  clock?: () => number;
}

export function selectionIndex(rows: PageRow[], id?: string): number {
  return Math.max(0, rows.findIndex((row) => row.id === id));
}

/** Narrow layouts give the session name space before adding secondary columns. */
export function rowColumns(row: PageRow, width: number): string {
  const clean = { project: terminalText(row.project), name: terminalText(row.name), meta: terminalText(row.meta) };
  const cell = (value: string, size: number) => {
    const clipped = truncateToWidth(value, Math.max(0, size), "…");
    return clipped + " ".repeat(Math.max(0, size - visibleWidth(clipped)));
  };
  const marker = row.pinned ? "★ " : "  ";
  if (width < 42) return truncateToWidth(marker + clean.name, width);
  const projectWidth = Math.min(20, Math.floor(width / 4));
  if (width < 76) return marker + cell(clean.project, projectWidth) + "  " + cell(clean.name, width - projectWidth - 4);
  const metaWidth = Math.min(30, Math.floor(width / 3));
  return marker + cell(clean.project, projectWidth) + "  " + cell(clean.name, width - projectWidth - metaWidth - 6) + "  " + cell(clean.meta, metaWidth);
}

type Factory = Parameters<ExtensionCommandContext["ui"]["custom"]>[0];
type Host = Parameters<Factory>;

function pageComponent(page: SessionPage, tui: Host[0], theme: Host[1], kb: Host[2], done: (choice: string | undefined) => void,
  onFocus: (id: string) => void, loading?: string) {
  let selected = selectionIndex(page.rows, page.selectedId);
  const focus = () => { const row = page.rows[selected]; if (row) onFocus(row.id); };
  let pageSize = 10;
  focus();
  return {
    render(width: number): string[] {
      const height = Math.max(5, Math.min(24, (tui.terminal?.rows ?? 24) - 2));
      const tabs = ["Running", "Recent"].map((name) => {
        const label = width < 16 ? name.slice(0, 3) : name;
        return name === page.tab ? theme.fg("accent", `[${label}]`) : label;
      }).join(width < 24 ? " " : "   ");
      const now = page.clock?.() ?? page.now;
      const stamp = page.updatedAt === undefined ? "Not loaded" : `Updated ${relativeTime(new Date(page.updatedAt).toISOString(), now)} · snapshot`;
      const status = loading ?? page.notice;
      const actionHints = loading ? "Esc cancel loading" : page.actions.map((action) => ({
        "Show more": "m More", "Pinned only": "p Pinned only", "All recent": "p All recent", "Refresh": "r Refresh", "Coverage details": "c Coverage", "Close": "Esc Close",
      })[action] ?? action).join(" · ");
      const header = [tabs, terminalText(page.summary), terminalText(height < 8 ? status ?? stamp : stamp)];
      if (status && height >= 8) header.push(terminalText(status));
      if (page.coverage.length && height >= 12) header.push(theme.fg("muted", `${page.coverage.length} coverage notes · c details`));
      const compactHints = loading ? "Esc cancel" : `${page.actions.includes("Show more") ? "m " : ""}${page.tab === "Recent" ? "p " : ""}r c Esc`;
      const footer = new Text(height < 10 ? compactHints : actionHints, 0, 0).render(width).slice(0, Math.max(1, height - header.length - 2)).map((line) => theme.fg("muted", line));
      if (height >= 10) footer.push(theme.fg("dim", "Tab / ← → tabs · ↑↓ navigate · Enter details"));
      if (width >= 76 && height >= 14) header.push(theme.fg("dim", "  " + rowColumns({ id: "", project: "Project", name: "Session", meta: page.tab === "Recent" ? "Last saved" : "Status · Model · PID" }, width - 4)));
      const capacity = Math.max(1, height - header.length - footer.length);
      pageSize = Math.max(1, capacity - 1); // SelectList may add one scroll-information line.
      let body: string[];
      if (!page.rows.length) body = [terminalText(loading ?? page.empty)];
      else {
        const list = new SelectList(page.rows.map((row) => ({ value: row.id, label: rowColumns(row.savedAt ? { ...row, meta: `saved ${relativeTime(row.savedAt, now)}` } : row, Math.max(0, width - 4)) })), pageSize, {
          selectedPrefix: (s) => theme.fg("accent", s), selectedText: (s) => theme.fg("accent", s),
          description: (s) => s, scrollInfo: (s) => theme.fg("dim", s), noMatch: (s) => s,
        });
        list.setSelectedIndex(selected);
        body = list.render(width).slice(0, capacity);
      }
      while (body.length < capacity) body.push("");
      return [...header, ...body, ...footer].map((line) => truncateToWidth(line, width));
    },
    invalidate() {},
    handleInput(data: string) {
      if (kb.matches(data, "tui.select.cancel")) { done(undefined); return; }
      if (loading) return;
      if ((["tab", "shift+tab", "left", "right"] as const).some((key) => matchesKey(data, key))) done(page.tab === "Running" ? "Recent" : "Running");
      else if (kb.matches(data, "tui.select.confirm")) { if (page.rows[selected]) done(page.rows[selected]!.id); }
      else if (data === "r") done("Refresh");
      else if (data === "c") done("Coverage details");
      else if (data === "m" && page.actions.includes("Show more")) done("Show more");
      else if (data === "p" && page.tab === "Recent") done(page.actions.includes("Pinned only") ? "Pinned only" : "All recent");
      else {
        if (kb.matches(data, "tui.select.up")) selected = Math.max(0, selected - 1);
        if (kb.matches(data, "tui.select.down")) selected = Math.min(page.rows.length - 1, selected + 1);
        if (kb.matches(data, "tui.select.pageUp")) selected = Math.max(0, selected - pageSize);
        if (kb.matches(data, "tui.select.pageDown")) selected = Math.min(page.rows.length - 1, selected + pageSize);
        focus();
      }
      tui.requestRender();
    },
  };
}

export async function selectSessionPage(ctx: ExtensionCommandContext, page: SessionPage, onFocus: (id: string) => void): Promise<string | undefined> {
  if (ctx.mode === "tui") {
    let tick: ReturnType<typeof setInterval> | undefined;
    try { return await ctx.ui.custom<string | undefined>((tui, theme, kb, done) => {
      tick = setInterval(() => tui.requestRender(), 15_000); tick.unref();
      return pageComponent(page, tui, theme, kb, done, onFocus);
    }); } finally { if (tick) clearInterval(tick); }
  }
  const labels = page.rows.map((row, i) => terminalText(`${i + 1}. ${row.pinned ? "★ " : ""}${row.project} · ${row.name} · ${row.meta}`));
  const choice = await ctx.ui.select([
    page.tab === "Running" ? "[Running]  Recent" : "Running  [Recent]", page.summary,
    page.updatedAt === undefined ? "Not loaded" : `Updated ${relativeTime(new Date(page.updatedAt).toISOString(), page.now)} · snapshot`,
    ...(page.notice ? [page.notice] : []),
    ...(page.coverage.length ? [`${page.coverage.length} coverage notes · Coverage details`] : []),
    ...(labels.length ? [] : [page.empty]),
  ].map(terminalText).join("\n"), [...labels, ...page.actions, page.tab === "Running" ? "Recent" : "Running"]);
  const row = page.rows[labels.indexOf(choice ?? "")];
  if (row) { onFocus(row.id); return row.id; }
  return choice;
}

export type LoadResult<T> = { status: "ok"; value: T } | { status: "cancelled" } | { status: "error" };

/** Keep the prior page visible. Cancellation invalidates late results and closes I/O cooperatively. */
export async function loadSessionPage<T>(ctx: ExtensionCommandContext, page: SessionPage, label: string, work: (signal: AbortSignal) => Promise<T>): Promise<LoadResult<T>> {
  const controller = new AbortController();
  const run = async (): Promise<LoadResult<T>> => {
    try { const value = await work(controller.signal); return controller.signal.aborted ? { status: "cancelled" } : { status: "ok", value }; }
    catch { return controller.signal.aborted ? { status: "cancelled" } : { status: "error" }; }
  };
  if (ctx.mode === "tui") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ended = false;
    try {
      return await ctx.ui.custom<LoadResult<T>>((tui, theme, kb, done) => {
        const finish = (result: LoadResult<T>) => { if (!ended) { ended = true; done(result); } };
        const component = pageComponent(page, tui, theme, kb, () => { controller.abort(); finish({ status: "cancelled" }); }, () => {}, label);
        return { ...component, render(width) {
          const lines = component.render(width);
          // Start only after the first frame has been produced, never in the UI factory.
          if (!timer && !ended) timer = setTimeout(() => { void run().then(finish); }, 0);
          return lines;
        } };
      }) ?? { status: "cancelled" };
    } finally { ended = true; if (timer) clearTimeout(timer); controller.abort(); }
  }
  if (ctx.mode === "rpc") {
    const title = [label, page.summary, ...page.rows.map((row) => `${row.project} · ${row.name} · ${row.meta}`)].map(terminalText).join("\n");
    const prompt = ctx.ui.select(title, ["Cancel loading"], { signal: controller.signal });
    try { return await Promise.race([run(), prompt.then((): LoadResult<T> => ({ status: "cancelled" }))]); }
    finally { controller.abort(); }
  }
  // Injected/headless hosts without a terminal mode still use the same data path.
  return run();
}

export async function showCoverage(ctx: ExtensionCommandContext, notes: string[]): Promise<void> {
  const text = ["Coverage details", ...notes.map(terminalText), "Use /resume for search, Current Folder / All, and resuming."].join("\n\n");
  if (ctx.mode !== "tui") { await ctx.ui.select(text, ["Back"]); return; }
  await ctx.ui.custom<void>((tui, theme, kb, done) => {
    let offset = 0;
    let maximum = 0;
    return {
      render(width) {
        const capacity = Math.max(1, (tui.terminal?.rows ?? 24) - 6);
        const lines = new Text(text, 0, 0).render(width);
        maximum = Math.max(0, lines.length - capacity); offset = Math.min(offset, maximum);
        return [theme.fg("accent", "Coverage"), ...lines.slice(offset, offset + capacity), "↑↓ scroll · Esc / Enter back"].map((line) => truncateToWidth(line, width));
      },
      invalidate() {},
      handleInput(data) {
        if (kb.matches(data, "tui.select.cancel") || kb.matches(data, "tui.select.confirm")) done();
        if (kb.matches(data, "tui.select.up")) offset = Math.max(0, offset - 1);
        if (kb.matches(data, "tui.select.down")) offset = Math.min(maximum, offset + 1);
        tui.requestRender();
      },
    };
  });
}
