import { useMemo, useState } from "react";
import type { StoredProjectSummary } from "../lib/project-storage";
import { formatRelativeTime } from "../lib/relative-time";

type SortKey = "name" | "videoName" | "cueCount" | "reviewedCount" | "savedAt";
type SortDir = "asc" | "desc";

interface Props {
  projects: StoredProjectSummary[];
  activeProjectId?: string;
  loading: boolean;
  busy: boolean;
  onOpen: (projectId: string) => void;
  onDelete: (project: StoredProjectSummary) => void;
}

function sortIndicator(active: boolean, dir: SortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ▲" : " ▼";
}

export function ProjectsTable({
  projects,
  activeProjectId,
  loading,
  busy,
  onOpen,
  onDelete,
}: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("savedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" || key === "videoName" ? "asc" : "desc");
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projects;
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.videoName.toLowerCase().includes(q),
      );
    }
    const mult = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return mult * av.localeCompare(bv, undefined, { sensitivity: "base" });
      }
      return mult * ((av as number) - (bv as number));
    });
  }, [projects, search, sortKey, sortDir]);

  const th = (key: SortKey, label: string) => (
    <th>
      <button
        type="button"
        className="projects-table-sort"
        onClick={() => toggleSort(key)}
      >
        {label}
        {sortIndicator(sortKey === key, sortDir)}
      </button>
    </th>
  );

  return (
    <section className="projects-table-section">
      <div className="projects-table-head">
        <h2>Your projects</h2>
        <input
          type="search"
          className="projects-table-search"
          placeholder="Search name or video…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search projects"
        />
      </div>

      {loading ? (
        <p className="hint projects-table-empty">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p className="hint projects-table-empty">
          No saved projects yet. Choose a video below to start one.
        </p>
      ) : rows.length === 0 ? (
        <p className="hint projects-table-empty">No projects match your search.</p>
      ) : (
        <div className="projects-table-wrap">
          <table className="projects-table">
            <thead>
              <tr>
                {th("name", "Name")}
                {th("videoName", "Video")}
                {th("cueCount", "Cues")}
                {th("reviewedCount", "Reviewed")}
                {th("savedAt", "Saved")}
                <th className="projects-table-actions-col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const isActive = p.id === activeProjectId;
                return (
                  <tr
                    key={p.id}
                    className={isActive ? "projects-table-row--active" : undefined}
                  >
                    <td className="projects-table-name">
                      {p.name}
                      {isActive && (
                        <span className="projects-table-badge">Last opened</span>
                      )}
                    </td>
                    <td className="projects-table-video">{p.videoName}</td>
                    <td>{p.cueCount}</td>
                    <td>
                      {p.reviewedCount}/{p.cueCount}
                    </td>
                    <td className="projects-table-saved">
                      {p.savedAt > 0
                        ? formatRelativeTime(p.savedAt)
                        : "—"}
                    </td>
                    <td className="projects-table-actions-col">
                      <div className="projects-table-row-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onOpen(p.id)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() => onDelete(p)}
                          aria-label={`Delete ${p.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
