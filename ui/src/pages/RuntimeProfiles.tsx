import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plus, Trash2 } from "lucide-react";
import type { RuntimeProfile } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { agentsApi } from "@/api/agents";
import { runtimeProfilesApi } from "@/api/runtimeProfiles";
import { queryKeys } from "@/lib/queryKeys";

const COMMON_ADAPTERS = [
  "codex_local",
  "claude_local",
  "opencode_local",
  "gemini_local",
  "cursor",
  "process",
];

function parseConfig(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Advanced config must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function RuntimeProfiles() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [adapterType, setAdapterType] = useState("codex_local");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [advancedConfig, setAdvancedConfig] = useState("{}");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [selectedByProfile, setSelectedByProfile] = useState<Record<string, Set<string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const { data: profiles = [] } = useQuery({
    queryKey: queryKeys.runtimeProfiles.list(selectedCompanyId!),
    queryFn: () => runtimeProfilesApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const adapterOptions = useMemo(
    () => Array.from(new Set([...COMMON_ADAPTERS, ...agents.map((agent) => agent.adapterType)])).sort(),
    [agents],
  );

  const invalidate = async () => {
    if (!selectedCompanyId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.runtimeProfiles.list(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.org(selectedCompanyId) }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const extra = parseConfig(advancedConfig);
      const input = {
        name: name.trim(),
        description: null,
        adapterType,
        adapterConfig: {
          ...extra,
          ...(model.trim() ? { model: model.trim() } : {}),
          ...(command.trim() ? { command: command.trim() } : {}),
        },
        runtimeConfig: {},
      };
      return editingProfileId
        ? runtimeProfilesApi.update(selectedCompanyId!, editingProfileId, input)
        : runtimeProfilesApi.create(selectedCompanyId!, input);
    },
    onSuccess: async () => {
      setName("");
      setModel("");
      setCommand("");
      setAdvancedConfig("{}");
      setEditingProfileId(null);
      setFormError(null);
      await invalidate();
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Failed to create profile."),
  });

  const bindMutation = useMutation({
    mutationFn: ({ profileId, agentIds }: { profileId: string; agentIds: string[] }) =>
      runtimeProfilesApi.bind(selectedCompanyId!, profileId, agentIds),
    onSuccess: async () => {
      setSelectedByProfile({});
      await invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (profileId: string) => runtimeProfilesApi.remove(selectedCompanyId!, profileId),
    onSuccess: invalidate,
  });

  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">Select a company to manage runtime profiles.</p>;
  }

  const toggleAgent = (profileId: string, agentId: string) => {
    setSelectedByProfile((current) => {
      const next = new Set(current[profileId] ?? []);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return { ...current, [profileId]: next };
    });
  };

  const startEditing = (profile: RuntimeProfile) => {
    const { model: profileModel, command: profileCommand, ...extraConfig } = profile.adapterConfig;
    setEditingProfileId(profile.id);
    setName(profile.name);
    setAdapterType(profile.adapterType);
    setModel(typeof profileModel === "string" ? profileModel : "");
    setCommand(typeof profileCommand === "string" ? profileCommand : "");
    setAdvancedConfig(JSON.stringify(extraConfig, null, 2));
    setFormError(null);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Runtime Profiles</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Share adapter, model, command, and runtime settings across related agents.
        </p>
      </div>

      <div className="space-y-3 rounded-md border border-border p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Profile name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Developer"
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 outline-none"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Adapter</span>
            <select
              value={adapterType}
              onChange={(event) => setAdapterType(event.target.value)}
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 outline-none"
            >
              {adapterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Model</span>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gpt-5.6-terra"
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 outline-none"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Startup command</span>
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="codex"
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 outline-none"
            />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Advanced adapter config (JSON)</span>
          <textarea
            value={advancedConfig}
            onChange={(event) => setAdvancedConfig(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none"
          />
        </label>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <Button
          size="sm"
          disabled={!name.trim() || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {saveMutation.isPending
            ? (editingProfileId ? "Saving..." : "Creating...")
            : (editingProfileId ? "Save profile" : "Create profile")}
        </Button>
        {editingProfileId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditingProfileId(null);
              setName("");
              setModel("");
              setCommand("");
              setAdvancedConfig("{}");
              setFormError(null);
            }}
          >
            Cancel
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            agents={agents}
            selectedAgentIds={selectedByProfile[profile.id] ?? new Set()}
            binding={bindMutation.isPending && bindMutation.variables?.profileId === profile.id}
            deleting={deleteMutation.isPending && deleteMutation.variables === profile.id}
            onToggleAgent={(agentId) => toggleAgent(profile.id, agentId)}
            onBind={() => bindMutation.mutate({
              profileId: profile.id,
              agentIds: Array.from(selectedByProfile[profile.id] ?? []),
            })}
            onDelete={() => {
              if (window.confirm(`Delete runtime profile "${profile.name}"? Bound agents keep their last applied configuration.`)) {
                deleteMutation.mutate(profile.id);
              }
            }}
            onEdit={() => startEditing(profile)}
          />
        ))}
        {profiles.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            Create a profile, then bind the developers that should share it.
          </p>
        )}
      </div>
    </div>
  );
}

function ProfileCard({
  profile,
  agents,
  selectedAgentIds,
  binding,
  deleting,
  onToggleAgent,
  onBind,
  onDelete,
  onEdit,
}: {
  profile: RuntimeProfile;
  agents: Awaited<ReturnType<typeof agentsApi.list>>;
  selectedAgentIds: Set<string>;
  binding: boolean;
  deleting: boolean;
  onToggleAgent: (agentId: string) => void;
  onBind: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const model = typeof profile.adapterConfig.model === "string" ? profile.adapterConfig.model : null;
  const command = typeof profile.adapterConfig.command === "string" ? profile.adapterConfig.command : null;
  return (
    <section className="rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{profile.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile.adapterType}{model ? ` · ${model}` : ""}{command ? ` · ${command}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Bound to {profile.agentCount} agent{profile.agentCount === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="ghost" disabled={deleting} onClick={onDelete} title="Delete profile">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {agents.filter((agent) => agent.status !== "terminated").map((agent) => (
          <label key={agent.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedAgentIds.has(agent.id)}
              onChange={() => onToggleAgent(agent.id)}
            />
            <span>{agent.name}</span>
            {agent.runtimeProfile?.id === profile.id && (
              <span className="text-xs text-primary">Bound</span>
            )}
          </label>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="mt-4"
        disabled={selectedAgentIds.size === 0 || binding}
        onClick={onBind}
      >
        {binding ? "Applying..." : `Apply to ${selectedAgentIds.size || ""} agent${selectedAgentIds.size === 1 ? "" : "s"}`}
      </Button>
    </section>
  );
}
