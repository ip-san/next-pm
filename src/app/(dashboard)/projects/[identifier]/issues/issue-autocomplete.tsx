"use client";

import { useEffect, useRef, useState } from "react";

interface IssueMatch {
  id: string;
  subject: string;
}

/**
 * Search-by-subject picker for issue-id fields (parent issue, relation target) — replaces
 * pasting a raw UUID, which is impractical since issue ids are only shown truncated
 * elsewhere in the UI. Mirrors Redmine's auto_complete.json-backed pickers.
 */
export function IssueAutocomplete({
  projectIdentifier,
  inputId,
  inputName,
  initialLabel,
  onSelect,
}: {
  projectIdentifier: string;
  inputId: string;
  inputName: string;
  initialLabel?: string;
  onSelect: (issueId: string) => void;
}) {
  const [query, setQuery] = useState(initialLabel ?? "");
  const [matches, setMatches] = useState<IssueMatch[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (selectedId || query.trim().length === 0) {
      return;
    }
    const requestId = ++requestIdRef.current;
    const timeout = setTimeout(async () => {
      const response = await fetch(`/api/v1/projects/${projectIdentifier}/issues/autocomplete?q=${encodeURIComponent(query)}`);
      if (!response.ok || requestId !== requestIdRef.current) return;
      const data = (await response.json()) as { results: IssueMatch[] };
      setMatches(data.results);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, selectedId, projectIdentifier]);

  return (
    <div className="relative">
      <input type="hidden" id={inputId} name={inputName} value={selectedId} />
      <input
        type="text"
        placeholder="件名で検索"
        value={query}
        onChange={(event) => {
          setSelectedId("");
          setOpen(false);
          onSelect("");
          setQuery(event.target.value);
        }}
        onFocus={() => matches.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="border rounded px-3 py-2 w-full"
      />
      {open && matches.length > 0 ? (
        <ul className="absolute z-10 bg-white border rounded mt-1 w-full max-h-48 overflow-y-auto text-sm shadow">
          {matches.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-gray-100"
                onClick={() => {
                  setSelectedId(match.id);
                  setQuery(`#${match.id.slice(0, 8)} ${match.subject}`);
                  setOpen(false);
                  onSelect(match.id);
                }}
              >
                #{match.id.slice(0, 8)} {match.subject}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
