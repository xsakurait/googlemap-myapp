import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadHistory,
  loadSettings,
  loadUsage,
  loadUserData,
  addHistory,
  saveSettings,
  incrementUsage,
} from "../src/features/route-search/lib/user-data";

interface FakeResult {
  data?: unknown;
  error?: { message: string } | null;
}

interface RecordedCall {
  table: string;
  op: string;
  payload?: unknown;
  inValues?: unknown;
}

/** Supabase のクエリビルダーを模した疑似クライアント。結果は table:op で差し替える。 */
function fakeClient(results: Record<string, FakeResult>) {
  const calls: RecordedCall[] = [];
  const client = {
    calls,
    from(table: string) {
      let op = "select";
      let payload: unknown;
      const result = () => results[`${table}:${op}`] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.range = chain;
      builder.insert = (row: unknown) => {
        op = "insert";
        payload = row;
        return builder;
      };
      builder.upsert = (row: unknown) => {
        op = "upsert";
        payload = row;
        return builder;
      };
      builder.delete = () => {
        op = "delete";
        return builder;
      };
      builder.in = (_column: string, values: unknown) => {
        calls.push({ table, op, inValues: values });
        return builder;
      };
      builder.maybeSingle = async () => {
        calls.push({ table, op, payload });
        const r = result();
        return { data: r.data ?? null, error: r.error ?? null };
      };
      builder.then = (resolve: (value: FakeResult) => void) => {
        if (op !== "delete") calls.push({ table, op, payload });
        const r = result();
        resolve({ data: r.data ?? null, error: r.error ?? null });
      };
      return builder;
    },
  };
  return client as unknown as SupabaseClient & { calls: RecordedCall[] };
}

describe("loadHistory", () => {
  it("UT-150: 行を履歴形式へ変換する", async () => {
    const client = fakeClient({
      "search_history:select": {
        data: [{ origin_text: "品川駅", destination_text: "新宿駅" }],
        error: null,
      },
    });
    await expect(loadHistory(client)).resolves.toEqual([
      { origin: "品川駅", destination: "新宿駅" },
    ]);
  });

  it("UT-151: データが無ければ空配列、エラーは例外にする", async () => {
    await expect(loadHistory(fakeClient({}))).resolves.toEqual([]);
    const bad = fakeClient({ "search_history:select": { error: { message: "x" } } });
    await expect(loadHistory(bad)).rejects.toThrow("履歴の読み込みに失敗しました");
  });
});

describe("loadSettings", () => {
  it("UT-152: 行を設定形式へ変換する", async () => {
    const client = fakeClient({
      "user_settings:select": {
        data: { default_mode: "fare", warn_at: 7000, stop_at: 9000 },
        error: null,
      },
    });
    await expect(loadSettings(client)).resolves.toEqual({
      defaultMode: "fare",
      warnAt: 7000,
      stopAt: 9000,
    });
  });

  it("UT-153: 未保存なら null、エラーは例外にする", async () => {
    await expect(loadSettings(fakeClient({}))).resolves.toBeNull();
    const bad = fakeClient({ "user_settings:select": { error: { message: "x" } } });
    await expect(loadSettings(bad)).rejects.toThrow("設定の読み込みに失敗しました");
  });
});

describe("loadUsage", () => {
  it("UT-154: 行を年月キーへ変換する", async () => {
    const client = fakeClient({
      "usage_counters:select": {
        data: [
          { month: "2026-11", count: 3 },
          { month: "2026-10", count: 9 },
        ],
        error: null,
      },
    });
    await expect(loadUsage(client)).resolves.toEqual({ "2026-11": 3, "2026-10": 9 });
  });

  it("UT-155: データが無ければ空、エラーは例外にする", async () => {
    await expect(loadUsage(fakeClient({}))).resolves.toEqual({});
    const bad = fakeClient({ "usage_counters:select": { error: { message: "x" } } });
    await expect(loadUsage(bad)).rejects.toThrow("利用件数の読み込みに失敗しました");
  });
});

describe("loadUserData", () => {
  it("UT-156: 履歴・設定・利用件数をまとめて返す", async () => {
    const client = fakeClient({
      "search_history:select": { data: [], error: null },
      "user_settings:select": { data: null, error: null },
      "usage_counters:select": { data: [{ month: "2026-11", count: 1 }], error: null },
    });
    await expect(loadUserData(client)).resolves.toEqual({
      history: [],
      settings: null,
      usage: { "2026-11": 1 },
    });
  });
});

describe("addHistory", () => {
  it("UT-157: 追加だけ行い、超過が無ければ削除しない", async () => {
    const client = fakeClient({});
    await addHistory(client, "u1", "品川駅", "新宿駅");
    expect(client.calls.find((c) => c.op === "insert")?.payload).toEqual({
      user_id: "u1",
      origin_text: "品川駅",
      destination_text: "新宿駅",
    });
    expect(client.calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("UT-158: 超過した古い履歴を削除する", async () => {
    const client = fakeClient({
      "search_history:select": { data: [{ id: "old-1" }, { id: "old-2" }], error: null },
    });
    await addHistory(client, "u1", "a", "b");
    expect(client.calls.find((c) => c.op === "delete")?.inValues).toEqual(["old-1", "old-2"]);
  });

  it("UT-159: 追加エラーは例外にする", async () => {
    const bad = fakeClient({ "search_history:insert": { error: { message: "x" } } });
    await expect(addHistory(bad, "u1", "a", "b")).rejects.toThrow("履歴の追加に失敗しました");
  });

  it("UT-160: 整理用取得のエラーは例外にする", async () => {
    const bad = fakeClient({ "search_history:select": { error: { message: "x" } } });
    await expect(addHistory(bad, "u1", "a", "b")).rejects.toThrow("履歴の整理に失敗しました");
  });

  it("UT-161: 削除エラーは例外にする", async () => {
    const bad = fakeClient({
      "search_history:select": { data: [{ id: "old-1" }], error: null },
      "search_history:delete": { error: { message: "x" } },
    });
    await expect(addHistory(bad, "u1", "a", "b")).rejects.toThrow("履歴の削除に失敗しました");
  });
});

describe("saveSettings", () => {
  it("UT-162: upsert で保存する", async () => {
    const client = fakeClient({});
    await saveSettings(client, "u1", { defaultMode: "fare", warnAt: 7000, stopAt: 9000 });
    expect(client.calls.find((c) => c.op === "upsert")?.payload).toEqual({
      user_id: "u1",
      default_mode: "fare",
      warn_at: 7000,
      stop_at: 9000,
    });
  });

  it("UT-163: エラーは例外にする", async () => {
    const bad = fakeClient({ "user_settings:upsert": { error: { message: "x" } } });
    await expect(
      saveSettings(bad, "u1", { defaultMode: "fare", warnAt: 1, stopAt: 2 }),
    ).rejects.toThrow("設定の保存に失敗しました");
  });
});

describe("incrementUsage", () => {
  it("UT-164: 既存件数に 1 を足して保存し、新しい件数を返す", async () => {
    const client = fakeClient({
      "usage_counters:select": { data: { count: 4 }, error: null },
    });
    await expect(incrementUsage(client, "u1", "2026-11")).resolves.toBe(5);
    expect(client.calls.find((c) => c.op === "upsert")?.payload).toEqual({
      user_id: "u1",
      month: "2026-11",
      count: 5,
    });
  });

  it("UT-165: 行が無ければ 1 から始める", async () => {
    const client = fakeClient({});
    await expect(incrementUsage(client, "u1", "2026-11")).resolves.toBe(1);
  });

  it("UT-166: 確認エラーは例外にする", async () => {
    const bad = fakeClient({ "usage_counters:select": { error: { message: "x" } } });
    await expect(incrementUsage(bad, "u1", "2026-11")).rejects.toThrow(
      "利用件数の確認に失敗しました",
    );
  });

  it("UT-167: 保存エラーは例外にする", async () => {
    const bad = fakeClient({
      "usage_counters:select": { data: { count: 0 }, error: null },
      "usage_counters:upsert": { error: { message: "x" } },
    });
    await expect(incrementUsage(bad, "u1", "2026-11")).rejects.toThrow(
      "利用件数の保存に失敗しました",
    );
  });
});

describe("incrementUsage 追加分岐", () => {
  it("UT-168: 行はあるが件数が無ければ 1 から始める", async () => {
    const client = fakeClient({
      "usage_counters:select": { data: {}, error: null },
    });
    await expect(incrementUsage(client, "u1", "2026-11")).resolves.toBe(1);
  });
});
