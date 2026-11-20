import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { DRILL_RETENTION_MONTHS } from "../../../shared/drill";
import { forgetRecent, useRecentDrills } from "../drill/recent";

const SPORT_LABEL = { hockey: "Ice Hockey" } as const;

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function visited(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return dateFmt.format(new Date(iso));
}

/** Header button + drawer listing the drills this browser has opened. */
export function RecentDrills() {
  const [open, setOpen] = useState(false);
  const drills = useRecentDrills();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        className="btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        History
      </button>
      {open &&
        // Portal: the sticky header's backdrop-filter would otherwise contain position:fixed.
        createPortal(
          <>
            <div className="drawer-backdrop" onClick={() => setOpen(false)} />
            <aside className="drawer drawer-top" aria-label="Your drills">
              <div className="drawer-head">
                <h2>Your drills</h2>
                <button
                  className="btn btn-small"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
              <p className="fine">
                Drills you've opened in this browser. Drills nobody opens for{" "}
                {DRILL_RETENTION_MONTHS} months are deleted.
              </p>
              {drills.length === 0 ? (
                <p className="fine">
                  Drills you open or create will show up here.
                </p>
              ) : (
                <ul>
                  {drills.map((d) => {
                    const url = `/${d.sport}/d/${d.id}`;
                    const current = pathname === url;
                    return (
                      <li key={d.id}>
                        <Link
                          to={url}
                          className="recent-link"
                          aria-current={current ? "page" : undefined}
                          onClick={() => setOpen(false)}
                        >
                          <strong>{d.name.trim() || "Untitled drill"}</strong>
                          <span className="fine">
                            {SPORT_LABEL[d.sport]} · {visited(d.visitedAt)}
                            {current && <span className="badge">Open</span>}
                          </span>
                        </Link>
                        <button
                          className="btn btn-small btn-ghost"
                          aria-label={`Remove ${d.name.trim() || "Untitled drill"} from history`}
                          title="Remove from history (the drill itself is kept)"
                          onClick={() => forgetRecent(d.id)}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
