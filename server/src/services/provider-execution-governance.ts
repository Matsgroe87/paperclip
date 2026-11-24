import { agents, companies, costEvents, heartbeatRuns, type Db } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { parseObject } from "../adapters/utils.js";
import { normalizeExecutionGovernanceSettings } from "./instance-settings.js";

const PROVIDER_ADMISSION_ADAPTER_TYPES = { anthropic: ["claude_local"] as const } as const;
const PROVIDER_ADMISSION_LOCK_PREFIX = "paperclip:provider-admission:";

function providerForAdapterType(adapterType: string) {
  for (const [provider, adapterTypes] of Object.entries(PROVIDER_ADMISSION_ADAPTER_TYPES)) {
    if (adapterTypes.includes(adapterType as never)) {
      return { provider, adapterTypes };
    }
  }
  return null;
}

function readProviderRetryNotBefore(value: unknown) {
  const parsed = new Date(
    typeof value === "string" || typeof value === "number" || value instanceof Date
      ? value
      : Number.NaN,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function getProviderAdmissionBlock(
  client: Pick<Db, "select" | "execute">,
  agent: typeof agents.$inferSelect,
  now: Date,
  governance = normalizeExecutionGovernanceSettings(undefined),
) {
  const provider = providerForAdapterType(agent.adapterType);
  if (!provider) return null;

  await client.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${PROVIDER_ADMISSION_LOCK_PREFIX}${provider.provider}`}))`,
  );

  if (governance.providerQuotaCircuitBreaker) {
    const rows = await client
      .select({
        resultJson: heartbeatRuns.resultJson,
        contextSnapshot: heartbeatRuns.contextSnapshot,
      })
      .from(heartbeatRuns)
      .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
      .innerJoin(companies, eq(heartbeatRuns.companyId, companies.id))
      .where(and(
        eq(heartbeatRuns.errorCode, "provider_quota"),
        inArray(agents.adapterType, [...provider.adapterTypes]),
        eq(companies.status, "active"),
      ))
      .orderBy(desc(heartbeatRuns.createdAt))
      .limit(50);

    let latestReset: Date | null = null;
    for (const row of rows) {
      const result = parseObject(row.resultJson);
      const context = parseObject(row.contextSnapshot);
      const retryAt =
        readProviderRetryNotBefore(result.providerQuotaRetryNotBefore) ??
        readProviderRetryNotBefore(result.retryNotBefore) ??
        readProviderRetryNotBefore(context.providerQuotaRetryNotBefore) ??
        readProviderRetryNotBefore(context.transientRetryNotBefore);
      const delayedReset = retryAt ? new Date(retryAt.getTime() + governance.providerRetryJitterSec * 1000) : null;
      if (delayedReset && delayedReset > now && (!latestReset || delayedReset > latestReset)) latestReset = delayedReset;
    }
    if (latestReset) {
      return { provider: provider.provider, reason: "provider_quota_circuit_open", retryNotBefore: latestReset };
    }
  }

  const concurrencyLimit = governance.providerConcurrency[provider.provider];
  if (concurrencyLimit !== undefined) {
    const [{ count }] = await client
      .select({ count: sql<number>`count(*)` })
      .from(heartbeatRuns)
      .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
      .innerJoin(companies, eq(heartbeatRuns.companyId, companies.id))
      .where(and(
        eq(heartbeatRuns.status, "running"),
        inArray(agents.adapterType, [...provider.adapterTypes]),
        eq(companies.status, "active"),
      ));
    if (Number(count ?? 0) >= concurrencyLimit) {
      return {
        provider: provider.provider,
        reason: "provider_concurrency_limit",
        runningCount: Number(count ?? 0),
        limit: concurrencyLimit,
      };
    }
  }

  const dailyLimit = governance.providerDailyTokenLimits[provider.provider];
  if (dailyLimit && dailyLimit > 0) {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const [{ total }] = await client
      .select({
        total: sql<number>`coalesce(sum(${costEvents.inputTokens} + ${costEvents.outputTokens})::bigint, 0)`,
      })
      .from(costEvents)
      .where(and(
        eq(costEvents.provider, provider.provider),
        gte(costEvents.occurredAt, start),
        lt(costEvents.occurredAt, new Date(start.getTime() + 24 * 60 * 60 * 1000)),
      ));
    if (Number(total ?? 0) >= dailyLimit) {
      return {
        provider: provider.provider,
        reason: "provider_daily_token_limit",
        observed: Number(total ?? 0),
        limit: dailyLimit,
      };
    }
  }

  return null;
}
