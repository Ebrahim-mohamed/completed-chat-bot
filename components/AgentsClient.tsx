"use client";

import { useEffect, useState, type FormEvent } from "react";

interface Agent {
  id: string;
  username: string;
  displayName: string;
  client_id: string;
}

export default function AgentsClient({
  defaultClientId,
}: {
  defaultClientId: string;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newClientId, setNewClientId] = useState(defaultClientId);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadAgents() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to load agents.");
      const data = await res.json();
      setAgents(data.agents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName,
          client_id: newClientId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to create agent.");
      setNewUsername("");
      setNewPassword("");
      setNewDisplayName("");
      setNewClientId(defaultClientId);
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(agent: Agent) {
    setEditingId(agent.id);
    setEditDisplayName(agent.displayName);
    setEditClientId(agent.client_id);
    setEditPassword("");
  }

  async function handleSaveEdit(id: string) {
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editDisplayName,
          client_id: editClientId,
          ...(editPassword ? { password: editPassword } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update agent.");
      setEditingId(null);
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this agent account?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete agent.");
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold text-textPrimary">
        Agent accounts
      </h1>
      <p className="mb-6 text-sm text-textMuted">
        Create, edit, and remove agent accounts. Agents can only use the
        chat.
      </p>

      <form
        onSubmit={handleCreate}
        className="mb-8 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-panel p-4 sm:grid-cols-2"
      >
        <div>
          <label className="mb-1 block text-xs text-textMuted">Username</label>
          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-textMuted">Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-textMuted">
            Display name
          </label>
          <input
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-textMuted">
            Client ID
          </label>
          <input
            value={newClientId}
            onChange={(e) => setNewClientId(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create agent"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-textMuted">Loading agents...</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-textMuted">No agent accounts yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-panelAlt text-textMuted">
              <tr>
                <th className="px-4 py-2 font-medium">Username</th>
                <th className="px-4 py-2 font-medium">Display name</th>
                <th className="px-4 py-2 font-medium">Client ID</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} className="border-t border-border">
                  <td className="px-4 py-2 text-textPrimary">
                    {agent.username}
                  </td>
                  <td className="px-4 py-2">
                    {editingId === agent.id ? (
                      <input
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="w-full rounded-lg border border-border bg-panelAlt px-2 py-1 text-sm text-textPrimary outline-none focus:border-accent"
                      />
                    ) : (
                      <span className="text-textPrimary">
                        {agent.displayName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {editingId === agent.id ? (
                      <input
                        value={editClientId}
                        onChange={(e) => setEditClientId(e.target.value)}
                        className="w-full rounded-lg border border-border bg-panelAlt px-2 py-1 text-sm text-textPrimary outline-none focus:border-accent"
                      />
                    ) : (
                      <span className="text-textMuted">
                        {agent.client_id}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {editingId === agent.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          placeholder="New password (optional)"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          className="w-36 rounded-lg border border-border bg-panelAlt px-2 py-1 text-xs text-textPrimary outline-none focus:border-accent"
                        />
                        <button
                          onClick={() => handleSaveEdit(agent.id)}
                          disabled={savingEdit}
                          className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accentHover disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs text-textPrimary hover:bg-panelAlt"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(agent)}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs text-textPrimary hover:bg-panelAlt"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(agent.id)}
                          className="rounded-lg border border-red-500/40 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
