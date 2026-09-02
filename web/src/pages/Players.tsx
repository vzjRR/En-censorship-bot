import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Input, EmptyState, Spinner } from "../components/ui";
import type { Player } from "../lib/types";

export function Players() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[] | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ results: Player[] }>("/players/search", { query: q });
      setResults(res.results);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-100">Players</h1>
      <Input
        value={query}
        onChange={(e) => void search(e.target.value)}
        placeholder="Search by Discord ID, player name, or FiveM identifier…"
        className="max-w-md"
      />

      <Card>
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !results ? (
          <EmptyState message="Search for a player to view their moderation profile." />
        ) : results.length === 0 ? (
          <EmptyState message="No players found." />
        ) : (
          <ul className="divide-y divide-surface-border">
            {results.map((p) => (
              <li key={p.id}>
                <Link to={`/players/${p.id}`} className="flex items-center justify-between px-1 py-3 text-sm hover:bg-surface-border/30">
                  <div>
                    <div className="font-medium text-slate-100">{p.playerName}</div>
                    <div className="text-xs text-slate-500">
                      {p.discordUserId && <span className="mr-2">Discord: {p.discordUserId}</span>}
                      {p.fivemIdentifier && <span>FiveM: {p.fivemIdentifier}</span>}
                    </div>
                  </div>
                  <span className="text-accent">View →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
