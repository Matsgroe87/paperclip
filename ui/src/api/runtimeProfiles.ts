import type { RuntimeProfile } from "@paperclipai/shared";
import { api } from "./client";

export const runtimeProfilesApi = {
  list: (companyId: string) =>
    api.get<RuntimeProfile[]>(`/companies/${encodeURIComponent(companyId)}/runtime-profiles`),
  create: (
    companyId: string,
    input: Pick<RuntimeProfile, "name" | "description" | "adapterType" | "adapterConfig" | "runtimeConfig">,
  ) => api.post<RuntimeProfile>(`/companies/${encodeURIComponent(companyId)}/runtime-profiles`, input),
  update: (
    companyId: string,
    profileId: string,
    input: Partial<Pick<RuntimeProfile, "name" | "description" | "adapterType" | "adapterConfig" | "runtimeConfig">>,
  ) => api.patch<RuntimeProfile>(
    `/companies/${encodeURIComponent(companyId)}/runtime-profiles/${encodeURIComponent(profileId)}`,
    input,
  ),
  bind: (companyId: string, profileId: string, agentIds: string[]) =>
    api.post<{ ok: true; profileId: string; agentIds: string[] }>(
      `/companies/${encodeURIComponent(companyId)}/runtime-profiles/${encodeURIComponent(profileId)}/bind`,
      { agentIds },
    ),
  remove: (companyId: string, profileId: string) =>
    api.delete<{ ok: true }>(
      `/companies/${encodeURIComponent(companyId)}/runtime-profiles/${encodeURIComponent(profileId)}`,
    ),
};
