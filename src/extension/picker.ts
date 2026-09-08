import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, SelectList, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { relativeTime, terminalText } from "../format";
import { discoveryText } from "./discovery";

export type SessionsTab = "Running" | "Recent";
export interface PageRow { id: string; project: string; name: string; meta: string; pid?: string; pinned?: boolean; savedAt?: string }
export interface SessionPage {
  tab: SessionsTab;
  summary: string;
  rows: PageRow[];
  actions: string[];
  warnings: string[];
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

/** Size columns once for the whole page, leaving unused space at the right. */
function columnWidths(rows: PageRow[], width: number) {
  const widest = (key: "project" | "name" | "meta" | "pid") => rows.reduce((max, row) => Math.max(max, visibleWidth(terminalText(row[key] ?? ""))), 0);
  const pid = widest("pid");
  const project = Math.min(20, Math.floor(width / 4), widest("project"));
  const available = Math.max(0, width - project - 6 - (pid ? pid + 2 : 0));
  const meta = width >= 76 ? Math.min(widest("meta"), Math.max(0, available - Math.min(24, widest("name")))) : 0;
  const name = Math.min(48, widest("name"), Math.max(0, available - meta + (width < 76 ? 2 : 0)));
  return { project, name, meta, pid };
}

/** Narrow layouts omit secondary metadata; the PID has its own reserved column. */
export function rowColumns(row: PageRow, width: number, columns = columnWidths([row], width)): string {
  const clean = { project: terminalText(row.project), name: terminalText(row.name), meta: terminalText(row.meta) };
  const cell = (value: string, size: number) => {
    const clipped = truncateToWidth(value, Math.max(0, size), "…");
    return clipped + " ".repeat(Math.max(0, size - visibleWidth(clipped)));
  };
  const marker = row.pinned ? "★ " : "  ";
  if (width < 42) return truncateToWidth(marker + clean.name, width);
  const cells = [cell(clean.project, columns.project), cell(clean.name, columns.name)];
  if (width >= 76) cells.push(cell(clean.meta, columns.meta));
  if (columns.pid) cells.push(cell(terminalText(row.pid ?? ""), columns.pid));
  return marker + cells.join("  ");
}

function rowMetadata(row: PageRow): string {
  return [row.meta, row.pid].filter(Boolean).join(" · ");
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
      const rows = page.rows.map((row) => row.savedAt ? { ...row, meta: `saved ${relativeTime(row.savedAt, now)}` } : row);
      const columnHeader: PageRow = { id: "", project: "Project", name: "Session", meta: page.tab === "Recent" ? "Last saved" : "Status · Model", ...(page.tab === "Running" ? { pid: "PID" } : {}) };
      const rowWidth = Math.max(0, width - 4); // SelectList prefix and safety margin.
      const columns = columnWidths([columnHeader, ...rows], rowWidth);
      const stamp = page.updatedAt === undefined ? "Not loaded" : `Updated ${relativeTime(new Date(page.updatedAt).toISOString(), now)} · snapshot`;
      const status = loading ?? page.notice;
      const actionHints = loading ? "Tab / ← → switch tabs · ↑↓ navigate · Esc cancel loading" : page.actions.map((action) => ({
        "Show more": "m More", "Pinned only": "p Pinned only", "All recent": "p All recent", "Refresh": "r Refresh", "Discovery details": "c Discovery details", "Close": "Esc Close",
      })[action] ?? action).join(" · ");
      const header = [tabs, terminalText(page.summary), terminalText(height < 8 ? status ?? stamp : stamp)];
      if (status && height >= 8) header.push(terminalText(status));
      if (page.warnings.length && height >= 12) header.push(theme.fg("warning", `${page.warnings.length} scan warning${page.warnings.length === 1 ? "" : "s"}${loading ? "" : " · c details"}`));
      const compactHints = loading ? "Tab switch · Esc cancel" : `${page.actions.includes("Show more") ? "m " : ""}${page.tab === "Recent" ? "p " : ""}r c Esc`;
      const footer = new Text(height < 10 ? compactHints : actionHints, 0, 0).render(width).slice(0, Math.max(1, height - header.length - 2)).map((line) => theme.fg("muted", line));
      if (height >= 10 && !loading) footer.push(theme.fg("dim", "Tab / ← → tabs · ↑↓ navigate · Enter details"));
      if (rowWidth >= 76 && height >= 14) header.push(theme.fg("dim", "  " + rowColumns(columnHeader, rowWidth, columns)));
      const capacity = Math.max(1, height - header.length - footer.length);
      pageSize = Math.max(1, capacity - 1); // SelectList may add one scroll-information line.
      let body: string[];
      if (!page.rows.length) body = [terminalText(loading ?? page.empty)];
      else {
        const list = new SelectList(rows.map((row) => ({ value: row.id, label: rowColumns(row, rowWidth, columns) })), pageSize, {
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
      if ((["tab", "shift+tab", "left", "right"] as const).some((key) => matchesKey(data, key))) done(page.tab === "Running" ? "Recent" : "Running");
      else if (!loading && kb.matches(data, "tui.select.confirm")) { if (page.rows[selected]) done(page.rows[selected]!.id); }
      else if (!loading && data === "r") done("Refresh");
      else if (!loading && data === "c") done("Discovery details");
      else if (!loading && data === "m" && page.actions.includes("Show more")) done("Show more");
      else if (!loading && data === "p" && page.tab === "Recent") done(page.actions.includes("Pinned only") ? "Pinned only" : "All recent");
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
  const labels = page.rows.map((row, i) => terminalText(`${i + 1}. ${row.pinned ? "★ " : ""}${row.project} · ${row.name} · ${rowMetadata(row)}`));
  const choice = await ctx.ui.select([
    page.tab === "Running" ? "[Running]  Recent" : "Running  [Recent]", page.summary,
    page.updatedAt === undefined ? "Not loaded" : `Updated ${relativeTime(new Date(page.updatedAt).toISOString(), page.now)} · snapshot`,
    ...(page.notice ? [page.notice] : []),
    ...(page.warnings.length ? [`${page.warnings.length} scan warning${page.warnings.length === 1 ? "" : "s"} · Discovery details`] : []),
    ...(labels.length ? [] : [page.empty]),
  ].map(terminalText).join("\n"), [...labels, ...page.actions, page.tab === "Running" ? "Recent" : "Running"]);
  const row = page.rows[labels.indexOf(choice ?? "")];
  if (row) { onFocus(row.id); return row.id; }
  return choice;
}

export type LoadResult<T> = { status: "ok"; value: T } | { status: "cancelled" } | { status: "error" } | { status: "navigate"; tab: SessionsTab };

/** Keep the prior page visible. Cancellation invalidates late results and closes I/O cooperatively. */
export async function loadSessionPage<T>(ctx: ExtensionCommandContext, page: SessionPage, label: string, work: (signal: AbortSignal) => Promise<T>, onFocus: (id: string) => void = () => {}): Promise<LoadResult<T>> {
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
        const component = pageComponent(page, tui, theme, kb, (choice) => {
          controller.abort();
          finish(choice === "Running" || choice === "Recent" ? { status: "navigate", tab: choice } : { status: "cancelled" });
        }, onFocus, label);
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
    const title = [label, page.summary, ...page.rows.map((row) => `${row.project} · ${row.name} · ${rowMetadata(row)}`)].map(terminalText).join("\n");
    const prompt = ctx.ui.select(title, ["Cancel loading"], { signal: controller.signal });
    try { return await Promise.race([run(), prompt.then((): LoadResult<T> => ({ status: "cancelled" }))]); }
    finally { controller.abort(); }
  }
  // Injected/headless hosts without a terminal mode still use the same data path.
  return run();
}

export async function showDiscoveryDetails(ctx: ExtensionCommandContext, page: SessionPage): Promise<void> {
  const title = `${page.tab} · Discovery details`;
  const text = discoveryText(page);
  if (ctx.mode !== "tui") { await ctx.ui.select(`${title}\n\n${text}`, ["Back"]); return; }
  await ctx.ui.custom<void>((tui, theme, kb, done) => {
    let offset = 0;
    let maximum = 0;
    let capacity = 1;
    return {
      render(width) {
        capacity = Math.max(1, (tui.terminal?.rows ?? 24) - 6);
        const lines = new Text(text, 0, 0).render(width);
        maximum = Math.max(0, lines.length - capacity); offset = Math.min(offset, maximum);
        const position = maximum ? ` · ${offset + 1}-${Math.min(offset + capacity, lines.length)}/${lines.length}` : "";
        const headings = ["Scan results", "Latest attempt", "What to do", `How ${page.tab} works`];
        const body = lines.slice(offset, offset + capacity).map((line) => headings.includes(line.trim()) ? theme.fg("accent", line) : line);
        return [theme.fg("accent", title), ...body, `Esc / Enter back · ↑↓ scroll${position}`].map((line) => truncateToWidth(line, width));
      },
      invalidate() {},
      handleInput(data) {
        if (kb.matches(data, "tui.select.cancel") || kb.matches(data, "tui.select.confirm")) { done(); return; }
        if (kb.matches(data, "tui.select.up")) offset = Math.max(0, offset - 1);
        if (kb.matches(data, "tui.select.down")) offset = Math.min(maximum, offset + 1);
        if (kb.matches(data, "tui.select.pageUp")) offset = Math.max(0, offset - capacity);
        if (kb.matches(data, "tui.select.pageDown")) offset = Math.min(maximum, offset + capacity);
        tui.requestRender();
      },
    };
  });
}
