import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents, runtimeProfiles } from "@paperclipai/db";
import {
  createRuntimeProfileSchema,
  updateRuntimeProfileSchema,
} from "@paperclipai/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { notFound, unprocessable } from "../errors.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { logActivity } from "../services/activity-log.js";

const bindRuntimeProfileSchema = z.object({
  agentIds: z.array(z.string().uuid()).min(1).max(100),
});

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function profileResponse(profile: typeof runtimeProfiles.$inferSelect, agentCount: number) {
  return { ...profile, agentCount };
}

export function runtimeProfileRoutes(db: Db) {
  const router = Router();

  async function requireProfile(companyId: string, profileId: string) {
    const profile = await db
      .select()
      .from(runtimeProfiles)
      .where(and(eq(runtimeProfiles.id, profileId), eq(runtimeProfiles.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!profile) throw notFound("Runtime profile not found");
    return profile;
  }

  async function getAgentCounts(companyId: string) {
    const rows = await db
      .select({
        runtimeProfileId: agents.runtimeProfileId,
        count: sql<number>`count(*)::int`,
      })
      .from(agents)
      .where(eq(agents.companyId, companyId))
      .groupBy(agents.runtimeProfileId);
    return new Map(
      rows
        .filter((row): row is typeof row & { runtimeProfileId: string } => Boolean(row.runtimeProfileId))
        .map((row) => [row.runtimeProfileId, Number(row.count)]),
    );
  }

  async function applyProfileToAgents(
    profile: typeof runtimeProfiles.$inferSelect,
    agentIds: string[],
  ) {
    const rows = await db
      .select()
      .from(agents)
      .where(and(eq(agents.companyId, profile.companyId), inArray(agents.id, agentIds)));
    if (rows.length !== agentIds.length) {
      throw unprocessable("Every selected agent must belong to this company");
    }

    await db.transaction(async (tx) => {
      for (const agent of rows) {
        const adapterConfig = {
          ...asRecord(agent.adapterConfig),
          ...asRecord(profile.adapterConfig),
        };
        const runtimeConfig = {
          ...asRecord(agent.runtimeConfig),
          ...asRecord(profile.runtimeConfig),
        };
        await tx
          .update(agents)
          .set({
            runtimeProfileId: profile.id,
            adapterType: profile.adapterType,
            adapterConfig,
            runtimeConfig,
            updatedAt: new Date(),
          })
          .where(eq(agents.id, agent.id));
      }
    });
  }

  router.get("/companies/:companyId/runtime-profiles", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const [profiles, counts] = await Promise.all([
      db.select().from(runtimeProfiles).where(eq(runtimeProfiles.companyId, companyId)),
      getAgentCounts(companyId),
    ]);
    res.json(profiles.map((profile) => profileResponse(profile, counts.get(profile.id) ?? 0)));
  });

  router.post("/companies/:companyId/runtime-profiles", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const input = createRuntimeProfileSchema.parse(req.body);
    const profile = await db
      .insert(runtimeProfiles)
      .values({ ...input, companyId, description: input.description ?? null })
      .returning()
      .then((rows) => rows[0]!);
    await logActivity(db, {
      companyId,
      ...getActorInfo(req),
      action: "runtime_profile.created",
      entityType: "runtime_profile",
      entityId: profile.id,
      details: { name: profile.name, adapterType: profile.adapterType },
    });
    res.status(201).json(profileResponse(profile, 0));
  });

  router.patch("/companies/:companyId/runtime-profiles/:profileId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const profileId = req.params.profileId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const input = updateRuntimeProfileSchema.parse(req.body);
    const current = await requireProfile(companyId, profileId);
    const next = await db
      .update(runtimeProfiles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(runtimeProfiles.id, current.id))
      .returning()
      .then((rows) => rows[0]!);
    const linkedAgentIds = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), eq(agents.runtimeProfileId, next.id)));
    if (linkedAgentIds.length > 0) {
      await applyProfileToAgents(next, linkedAgentIds.map((agent) => agent.id));
    }
    await logActivity(db, {
      companyId,
      ...getActorInfo(req),
      action: "runtime_profile.updated",
      entityType: "runtime_profile",
      entityId: next.id,
      details: { name: next.name, adapterType: next.adapterType, propagatedAgentCount: linkedAgentIds.length },
    });
    res.json(profileResponse(next, linkedAgentIds.length));
  });

  router.post("/companies/:companyId/runtime-profiles/:profileId/bind", async (req, res) => {
    const companyId = req.params.companyId as string;
    const profileId = req.params.profileId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const { agentIds } = bindRuntimeProfileSchema.parse(req.body);
    const profile = await requireProfile(companyId, profileId);
    await applyProfileToAgents(profile, agentIds);
    await logActivity(db, {
      companyId,
      ...getActorInfo(req),
      action: "runtime_profile.bound",
      entityType: "runtime_profile",
      entityId: profile.id,
      details: { agentIds, adapterType: profile.adapterType },
    });
    res.json({ ok: true, profileId: profile.id, agentIds });
  });

  router.delete("/companies/:companyId/runtime-profiles/:profileId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const profileId = req.params.profileId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const profile = await requireProfile(companyId, profileId);
    await db.delete(runtimeProfiles).where(eq(runtimeProfiles.id, profile.id));
    await logActivity(db, {
      companyId,
      ...getActorInfo(req),
      action: "runtime_profile.deleted",
      entityType: "runtime_profile",
      entityId: profile.id,
      details: { name: profile.name },
    });
    res.json({ ok: true });
  });

  return router;
}
