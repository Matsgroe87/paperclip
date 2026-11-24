import type { agents, Db } from "@paperclipai/db";
import { describe, expect, it, vi } from "vitest";
import { normalizeExecutionGovernanceSettings } from "./instance-settings.js";
import { getProviderAdmissionBlock } from "./provider-execution-governance.js";
import { createHeartbeatTimerPolicy, parseHeartbeatPolicy } from "./heartbeat/timer-policy.js";

const agent = { id: "agent", companyId: "company", adapterType: "claude_local", runtimeConfig: {} } as typeof agents.$inferSelect;
const now = new Date("2026-11-24T12:00:00Z");

function database(results: unknown[][]) {
  const execute = vi.fn(async () => []);
  const select = vi.fn(() => {
    const rows = results.shift() ?? [];
    const query: Record<string, unknown> = {};
    for (const key of ["from", "innerJoin", "where", "orderBy", "limit"]) query[key] = () => query;
    query.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
    return query;
  });
  return { execute, select, db: { execute, select } as unknown as Db };
}

describe("preserved local provider controls", () => {
  it("holds a shared account at its configured concurrency limit under the transaction lock", async () => {
    const f = database([[{ count: 1 }]]);
    const settings = normalizeExecutionGovernanceSettings({ providerQuotaCircuitBreaker: false });
    expect(await getProviderAdmissionBlock(f.db, agent, now, settings)).toMatchObject({ reason: "provider_concurrency_limit", limit: 1 });
    expect(f.execute.mock.invocationCallOrder[0]).toBeLessThan(f.select.mock.invocationCallOrder[0]);
  });

  it("holds all local Claude work until a recorded provider reset", async () => {
    const reset = "2026-11-24T13:00:00Z";
    const f = database([[{ resultJson: { providerQuotaRetryNotBefore: reset }, contextSnapshot: {} }]]);
    expect(await getProviderAdmissionBlock(f.db, agent, now)).toMatchObject({ reason: "provider_quota_circuit_open", retryNotBefore: new Date(reset) });
  });

  it("enforces the configured subscription token limit even when monetary cost is zero", async () => {
    const f = database([[{ total: 3_000_000 }]]);
    const settings = normalizeExecutionGovernanceSettings({ providerConcurrency: {}, providerQuotaCircuitBreaker: false,
      providerDailyTokenLimits: { anthropic: 3_000_000 } });
    expect(await getProviderAdmissionBlock(f.db, agent, now, settings)).toMatchObject({ reason: "provider_daily_token_limit", observed: 3_000_000 });
  });

  it("honors the saved delay after a provider reset", async () => {
    const f = database([[{ resultJson: { providerQuotaRetryNotBefore: "2026-11-24T11:59:30Z" }, contextSnapshot: {} }]]);
    const settings = normalizeExecutionGovernanceSettings({ providerRetryJitterSec: 60 });
    expect(await getProviderAdmissionBlock(f.db, agent, now, settings)).toMatchObject({
      reason: "provider_quota_circuit_open", retryNotBefore: new Date("2026-11-24T12:00:30Z"),
    });
  });

  it("leaves unrelated providers outside the local Claude gate", async () => {
    const f = database([]);
    expect(await getProviderAdmissionBlock(f.db, { ...agent, adapterType: "codex_local" }, now)).toBeNull();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.select).not.toHaveBeenCalled();
  });

  it("enforces per-agent token limits through the new heartbeat policy module", async () => {
    const f = database([[{ total: 1000 }]]);
    const capped = { ...agent, runtimeConfig: { heartbeat: { maxDailyTokens: 1000 } } };
    const timer = createHeartbeatTimerPolicy(f.db);
    expect(await timer.getHeartbeatDailyCapBlock(capped, parseHeartbeatPolicy(capped), { now })).toEqual({
      reason: "heartbeat.daily_token_limit", observed: 1000, limit: 1000,
    });
    expect(await timer.readTimerHeartbeatSchedules([capped], now)).toBeUndefined();
  });
});
