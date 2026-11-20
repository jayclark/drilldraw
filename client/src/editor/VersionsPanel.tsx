import { useEffect, useState } from "react";

interface Version {
  versionId: string;
  createdAt: string;
}

const fmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function relative(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmt.format(new Date(iso));
}

/** Saved versions of a drill, with restore. Restores apply live for everyone. */
export function VersionsPanel({
  drillId,
  onClose,
}: {
  drillId: string;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/drills/${drillId}/versions`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then(
        (b: { versions: Version[] }) => !cancelled && setVersions(b.versions),
      )
      .catch(() => !cancelled && setError("Couldn't load versions."));
    return () => {
      cancelled = true;
    };
  }, [drillId, reload]);

  const restore = async (versionId: string) => {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/drills/${drillId}/versions/${versionId}/restore`,
        { method: "POST" },
      );
      if (!r.ok) throw new Error();
      setConfirming(null);
      setReload((n) => n + 1);
    } catch {
      setError("Restore failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="drawer" aria-label="Drill versions">
      <div className="drawer-head">
        <h2>Drill versions</h2>
        <button className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="fine">
        Versions are saved automatically every few minutes while people edit.
        Restoring keeps the current drill as a version too.
      </p>
      {error && <p className="banner banner-error">{error}</p>}
      {!versions && !error && <p className="fine">Loading…</p>}
      {versions?.length === 0 && <p className="fine">No saved versions yet.</p>}
      <ul>
        {versions?.map((v, i) => (
          <li key={v.versionId}>
            <span title={fmt.format(new Date(v.createdAt))}>
              {relative(v.createdAt)}
              {i === 0 && <span className="badge">Latest</span>}
            </span>
            {confirming === v.versionId ? (
              <span className="drawer-actions">
                <button
                  className="btn btn-small btn-primary"
                  disabled={busy}
                  onClick={() => restore(v.versionId)}
                >
                  Restore
                </button>
                <button
                  className="btn btn-small"
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                className="btn btn-small"
                onClick={() => setConfirming(v.versionId)}
              >
                Restore…
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
