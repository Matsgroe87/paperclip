# Local fork maintenance

Last synchronized: 2026-11-24, upstream master `28aa32e7d7ba72d8f83c03ffd45625c096813e6b`.

This fork keeps the local runtime profiles because the existing instance has
three profiles assigned to fifteen agents. Profile writes now use the current
agent lifecycle configuration path, and the profile page remains under company
settings. Migration `0505_runtime_profiles` is generated from the current schema
and safely replays over profiles and assignments created by older fork migrations.

The fork also keeps Windows build and workspace-link helpers, the Windows local
service launcher, local Codex command discovery, and Claude skill materialization.
The test wrapper invokes Vitest through Node so Windows does not need to spawn a
`pnpm` shell shim.

Provider admission settings remain in instance General settings. The saved local
Anthropic concurrency limit, quota reset delay, circuit breaker, and daily token
limit continue to apply. Provider checks run under the claim transaction's advisory
lock. Per-agent daily token limits use the current heartbeat timer-policy module.

The old fork migration-history heuristic is retired in favor of upstream's
migration reconciliation. Old Reflection Coach defaults and the ancestor-evidence
authorization exception are retired; current upstream agent configuration and
evidence authorization remain authoritative.

Local recovery branches preserve both previous histories:

- `codex/backup-before-sync-2026-11-24`: the previous local checkout.
- `codex/backup-fork-master-2026-11-24`: the previous fork master.

The existing stash is retained separately. Synchronizing source and installing
dependencies does not itself migrate or start the personal instance database.
