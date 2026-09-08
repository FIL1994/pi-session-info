import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHistory, type HistoryProgress } from "../src/history/reader";

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pi-history-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const header = (id = "fixture") =>
  JSON.stringify({ type: "session", version: 3, id, cwd: "/synthetic/project" }) + "\n";
const info = (name: string) => JSON.stringify({ type: "session_info", name }) + "\n";
const read = (root: string) => readHistory({ agentDir: root, directories: [root] });

describe("readHistory", () => {
  test("extracts bounded parent metadata and preserves unknown ancestry", async () => {
    const root = await fixture();
    const values = ["/synthetic/parent.jsonl", null, undefined, 42, "x".repeat(4097)];
    for (const [i, parentSession] of values.entries()) {
      await writeFile(
        join(root, `${i}.jsonl`),
        JSON.stringify({
          type: "session",
          version: 3,
          id: String(i),
          cwd: "/synthetic",
          parentSession,
        }) + "\n",
      );
    }
    const result = await read(root);
    expect(result.sessions).toHaveLength(5);
    for (const row of result.sessions) {
      expect(row.parentSessionFile).toBe(row.sessionId === "0" ? "/synthetic/parent.jsonl" : null);
    }
  });
  test("reports actual bounded metadata progress without paths or contents", async () => {
    const root = await fixture();
    await writeFile(join(root, "one.jsonl"), header("one") + info("PRIVATE NAME"));
    await writeFile(join(root, "two.jsonl"), header("two"));
    await writeFile(join(root, "bad.jsonl"), "PRIVATE CONTENT\n");
    const updates: HistoryProgress[] = [];
    const result = await readHistory({
      agentDir: root,
      directories: [root],
      onProgress: (progress) => updates.push(progress),
    });
    expect(updates[0]).toEqual({ phase: "scanning", directories: 0, files: 0, sessions: 0 });
    expect(updates.at(-1)).toEqual({ phase: "sorting", directories: 2, files: 3, sessions: 2 });
    expect(result.sessions).toHaveLength(2);
    expect(JSON.stringify(updates)).not.toContain(root);
    expect(JSON.stringify(updates)).not.toContain("PRIVATE");
    expect(updates.every((p, i) => i === 0 || p.files >= updates[i - 1]!.files)).toBe(true);
    const cancelled = new AbortController();
    const stopped: HistoryProgress[] = [];
    await expect(
      readHistory({
        agentDir: root,
        directories: [root],
        signal: cancelled.signal,
        onProgress: (progress) => {
          stopped.push(progress);
          if (progress.files === 1) cancelled.abort();
        },
      }),
    ).rejects.toThrow();
    expect(stopped.at(-1)?.files).toBe(1);
    expect(stopped.some((p) => p.phase === "sorting")).toBe(false);
  });
  test("large metadata windows yield to UI and honor cancellation during parsing", async () => {
    const root = await fixture();
    await writeFile(join(root, "session.jsonl"), header() + info("Saved").repeat(1000));
    const controller = new AbortController();
    let yields = 0;
    await expect(
      readHistory({
        agentDir: root,
        directories: [root],
        signal: controller.signal,
        yieldToUI: async () => {
          yields++;
          controller.abort();
        },
      }),
    ).rejects.toThrow();
    expect(yields).toBe(1);
    expect((await read(root)).sessions[0]?.name).toBe("Saved");
  });
  test("pre-aborted and in-flight scans reject rather than publishing partial snapshots", async () => {
    const root = await fixture();
    await writeFile(join(root, "session.jsonl"), header());
    const stopped = new AbortController();
    stopped.abort();
    await expect(readHistory({ agentDir: root, signal: stopped.signal })).rejects.toThrow();
    const active = new AbortController();
    const reading = readHistory({ agentDir: root, directories: [root], signal: active.signal });
    active.abort();
    await expect(reading).rejects.toThrow();
    expect((await read(root)).sessions).toHaveLength(1);
  });
  test("reads bounded session metadata and orders by file mtime", async () => {
    const root = await fixture();
    const project = join(root, "--project--");
    await Bun.write(join(root, "ignore.txt"), "x");
    await mkdir(project, { recursive: true });
    const old = join(project, "old.jsonl");
    const newer = join(project, "new.jsonl");
    await writeFile(
      old,
      JSON.stringify({ type: "session", version: 3, id: "old", cwd: "/p" }) + "\n",
    );
    await writeFile(
      newer,
      [
        JSON.stringify({ type: "session", version: 3, id: "new", cwd: "/p" }),
        JSON.stringify({ type: "session_info", name: "first" }),
        JSON.stringify({ type: "session_info", name: "latest" }),
      ].join("\n") + "\n",
    );
    const now = new Date("2026-01-01T00:00:00Z");
    await utimes(old, new Date(now.getTime() - 2000), new Date(now.getTime() - 2000));
    await utimes(newer, now, now);
    const result = await readHistory({ agentDir: root, directories: [root] });
    expect(result.sessions.map((s) => s.sessionId)).toEqual(["new", "old"]);
    expect(result.sessions[0]?.name).toBe("latest");
    expect(result.sessions[0]?.modifiedAt).toBe(now.toISOString());
  });

  test("deduplicates duplicate session IDs by newest file", async () => {
    const root = await fixture();
    const a = join(root, "a.jsonl");
    const b = join(root, "b.jsonl");
    const line = JSON.stringify({ type: "session", version: 3, id: "same", cwd: "/p" });
    await writeFile(a, line + "\n");
    await writeFile(b, line + "\n");
    const result = await readHistory({ agentDir: root, directories: [root] });
    expect(result.sessions).toHaveLength(1);
  });

  test("missing roots are valid; non-directories and malformed headers are reported", async () => {
    const root = await fixture();
    expect(await readHistory({ agentDir: join(root, "missing") })).toEqual({
      sessions: [],
      warnings: [],
    });
    for (const [i, content] of [
      "SECRET invalid",
      header().trimEnd(),
      header().replace('"version":3', '"version":99'),
      header().replace('"cwd":"/synthetic/project"', '"cwd":null'),
    ].entries()) {
      await writeFile(join(root, `${i}.jsonl`), content);
    }
    const result = await read(root);
    expect(result.sessions).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  test("partial final records are ignored, including valid JSON without LF", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "session.jsonl"),
      header() + info("Persisted") + info("Not complete").trimEnd(),
    );
    const result = await read(root);
    expect(result.sessions[0]?.name).toBe("Persisted");
    expect(result.warnings.join(" ")).toContain("incomplete final");
  });

  test("malformed lines do not leak contents or falsely retain an earlier name", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "session.jsonl"),
      header() + info("Before") + "SECRET invalid record\n",
    );
    const result = await read(root);
    expect(result.sessions[0]?.name).toBeNull();
    expect(result.warnings.join(" ")).toContain("malformed complete");
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  test("large image-bearing records use a bounded tail and support renamed/cleared names", async () => {
    const root = await fixture();
    const path = join(root, "large.jsonl");
    const content =
      header() +
      info("Old") +
      JSON.stringify({ type: "message", message: { content: "X".repeat(400_000) } }) +
      "\n";
    await writeFile(path, content + info("Latest"));
    const result = await read(root);
    expect(result.sessions[0]?.name).toBe("Latest");
    expect(result.warnings.join(" ")).toContain("head/tail");
    expect(JSON.stringify(result)).not.toContain("XXXX");
    await writeFile(path, content + info("Latest") + info(""));
    expect((await read(root)).sessions[0]?.name).toBeNull();
    await writeFile(path, content);
    expect((await read(root)).sessions[0]?.name).toBeNull();
  });

  test("symlinks and FIFO files are never followed or blocked on", async () => {
    const root = await fixture();
    const outside = await fixture();
    await writeFile(join(outside, "private.jsonl"), header("outside"));
    await symlink(join(outside, "private.jsonl"), join(root, "linked.jsonl"));
    await symlink(outside, join(root, "alias"));
    if (process.platform === "linux") execFileSync("mkfifo", [join(root, "pipe.jsonl")]);
    const result = await read(root);
    expect(result.sessions).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(
      (await readHistory({ agentDir: root, directories: [join(root, "alias")] })).sessions,
    ).toEqual([]);
  });

  test("normalized duplicate directories are scanned once", async () => {
    const root = await fixture();
    const project = join(root, "sessions", "project");
    await mkdir(project, { recursive: true });
    await writeFile(join(project, "one.jsonl"), header() + "malformed\n");
    const result = await readHistory({
      agentDir: root,
      directories: [project, `${project}/../project`],
    });
    expect(result.sessions).toHaveLength(1);
    expect(result.warnings).toEqual([
      "History: 1 files with malformed complete records (metadata may be incomplete).",
    ]);
  });

  test("file cap is global across projects and warns of incomplete newest coverage", async () => {
    const root = await fixture();
    for (const project of ["a", "b"]) {
      const dir = join(root, project);
      await mkdir(dir);
      for (let i = 0; i < 1001; i++)
        await writeFile(join(dir, `${i}.jsonl`), header(`${project}-${i}`));
    }
    const result = await read(root);
    expect(result.sessions).toHaveLength(2000);
    expect(result.warnings.join(" ")).toContain("limit reached");
  });

  test("directory overrides and explicit supplementation use only synthetic roots", async () => {
    const root = await fixture();
    const custom = await fixture();
    const extra = await fixture();
    const normal = join(root, "sessions", "project");
    await mkdir(normal, { recursive: true });
    await writeFile(join(normal, "normal.jsonl"), header("normal"));
    await writeFile(join(custom, "custom.jsonl"), header("custom"));
    await writeFile(join(extra, "extra.jsonl"), header("extra"));
    const previousAgent = process.env.PI_CODING_AGENT_DIR;
    const previousSession = process.env.PI_CODING_AGENT_SESSION_DIR;
    try {
      process.env.PI_CODING_AGENT_DIR = root;
      delete process.env.PI_CODING_AGENT_SESSION_DIR;
      expect((await readHistory()).sessions.map((s) => s.sessionId)).toEqual(["normal"]);
      process.env.PI_CODING_AGENT_SESSION_DIR = custom;
      expect(
        (await readHistory({ directories: [extra] })).sessions.map((s) => s.sessionId).sort(),
      ).toEqual(["custom", "extra"]);
      expect((await readHistory({ agentDir: root })).sessions.map((s) => s.sessionId)).toEqual([
        "normal",
      ]);
    } finally {
      if (previousAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgent;
      if (previousSession === undefined) delete process.env.PI_CODING_AGENT_SESSION_DIR;
      else process.env.PI_CODING_AGENT_SESSION_DIR = previousSession;
    }
  });
});
