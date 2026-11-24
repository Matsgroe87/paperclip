import type { AgentAdapterType } from "../constants.js";

export interface RuntimeProfile {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  adapterType: AgentAdapterType;
  adapterConfig: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  agentCount: number;
  createdAt: Date;
  updatedAt: Date;
}
