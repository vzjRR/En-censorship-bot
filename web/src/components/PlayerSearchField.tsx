import { useState } from "react";
import { api } from "../lib/api";
import { Input, Field } from "./ui";

interface DiscordMemberResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SelectedPlayer {
  discordId: string;
  displayName: string;
}

/**
 * Search-assisted player identity lookup — resolves a name/ID from live
 * Discord data (the platform requirement) rather than relying purely on
 * free text. Manual entry below still exists as a fallback for players who
 * have already left the Discord server.
 */
export function PlayerSearchField({ onSelect }: { onSelect: (player: SelectedPlayer) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscordMemberResult[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get<{ results: DiscordMemberResult[] }>("/players/search-discord", { query: q });
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Field label="Search Discord Member (fills name + ID below — optional if the player already left the server)">
      <Input value={query} onChange={(e) => void search(e.target.value)} placeholder="e.g. username or Discord ID" />
      {searching && <div className="mt-1 text-xs text-slate-500">Searching…</div>}
      {results.length > 0 && (
        <div className="mt-1 max-h-40 divide-y divide-surface-border overflow-y-auto rounded-md border border-surface-border">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onSelect({ discordId: r.id, displayName: r.displayName });
                setQuery("");
                setResults([]);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-border/50"
            >
              <span className="font-medium text-slate-100">{r.displayName}</span>
              <span className="text-xs text-slate-500">@{r.username}</span>
              <span className="ml-auto text-xs text-slate-600">{r.id}</span>
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}
