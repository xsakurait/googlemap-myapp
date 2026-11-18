import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  readSupabaseEnv,
  createSupabaseClient,
  ensureAnonymousSession,
} from "../src/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ tag: "fake-client" })),
}));

const mockedCreate = vi.mocked(createClient);

describe("readSupabaseEnv", () => {
  it("UT-130: URL とキーがそろえば設定を返す", () => {
    expect(
      readSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toEqual({ url: "https://example.supabase.co", anonKey: "anon-key" });
  });

  it("UT-131: URL が無ければ null", () => {
    expect(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" })).toBeNull();
  });

  it("UT-132: キーが無ければ null、空文字も未設定として扱う", () => {
    expect(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toBeNull();
    expect(
      readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }),
    ).toBeNull();
  });
});

describe("createSupabaseClient", () => {
  beforeEach(() => mockedCreate.mockClear());

  it("UT-133: 未設定なら null で createClient を呼ばない", () => {
    expect(createSupabaseClient({})).toBeNull();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("UT-134: 設定があれば createClient の結果を返す", () => {
    const client = createSupabaseClient({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    expect(client).toEqual({ tag: "fake-client" });
    expect(mockedCreate).toHaveBeenCalledWith("https://example.supabase.co", "anon-key");
  });
});

describe("getSupabaseClient", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("UT-135: 初回だけ生成し、2 回目は同じものを返す", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const mod = await import("../src/lib/supabase");
    const first = mod.getSupabaseClient();
    const second = mod.getSupabaseClient();
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it("UT-136: 未設定なら null を返し続ける", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const mod = await import("../src/lib/supabase");
    expect(mod.getSupabaseClient()).toBeNull();
    expect(mod.getSupabaseClient()).toBeNull();
  });
});

/** ensureAnonymousSession 用の疑似クライアントを作る。 */
function fakeAuthClient(options: {
  session: { user: { id: string } } | null;
  signInData?: { user: { id: string } | null };
  signInError?: { message: string } | null;
}) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: options.session } })),
      signInAnonymously: vi.fn(async () => ({
        data: options.signInData ?? { user: { id: "anon-1" } },
        error: options.signInError ?? null,
      })),
    },
  } as unknown as SupabaseClient & {
    auth: { signInAnonymously: ReturnType<typeof vi.fn> };
  };
}

describe("ensureAnonymousSession", () => {
  it("UT-137: 既存セッションがあればそのユーザー ID を返し、サインインしない", async () => {
    const client = fakeAuthClient({ session: { user: { id: "user-9" } } });
    await expect(ensureAnonymousSession(client)).resolves.toBe("user-9");
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("UT-138: セッションが無ければ匿名サインインして ID を返す", async () => {
    const client = fakeAuthClient({ session: null });
    await expect(ensureAnonymousSession(client)).resolves.toBe("anon-1");
  });

  it("UT-139: サインインエラーは例外にする", async () => {
    const client = fakeAuthClient({ session: null, signInError: { message: "disabled" } });
    await expect(ensureAnonymousSession(client)).rejects.toThrow("匿名サインインに失敗しました");
  });

  it("UT-140: サインイン結果にユーザーが無ければ例外にする", async () => {
    const client = fakeAuthClient({ session: null, signInData: { user: null } });
    await expect(ensureAnonymousSession(client)).rejects.toThrow("匿名サインインに失敗しました");
  });
});
