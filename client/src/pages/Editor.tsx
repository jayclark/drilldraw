import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  DRILL_ID_PATTERN,
  isMarker,
  isPath,
  RINK_VIEWS,
  SPORTS,
  type Sport,
  type DrillElement,
  type RinkView,
} from "../../../shared/drill";
import { Header } from "../components/Header";
import { RecentDrills } from "../components/RecentDrills";
import { useCreateDrill } from "../drill/createDrill";
import { forgetRecent, recordVisit, renameRecent } from "../drill/recent";
import {
  useDrill,
  usePresence,
  type ConnectionStatus,
  type DrillSession,
} from "../drill/useDrill";
import { useYMapJSON, useYMapValues, useYText } from "../drill/yhooks";
import { DrillCanvas } from "../editor/DrillCanvas";
import { downloadPdf, downloadPng } from "../editor/export";
import { VersionsPanel } from "../editor/VersionsPanel";
import {
  clearAll,
  deleteElement,
  duplicateElement,
  setRinkView,
  updateElement,
  updateLabel,
} from "../editor/ops";
import { ACTION_ICONS, TOOLS, type ToolId } from "../editor/tools";
import { Rink } from "../rink/Rink";
import { VIEWS } from "../rink/views";
import { NotFound } from "./NotFound";

type Existence = "loading" | "ok" | "missing" | "error";

export function Editor() {
  const { id = "" } = useParams();
  // Remount per drill so "New drill" (same route, new id) starts from a clean session.
  return <DrillPage key={id} id={id} />;
}

function DrillPage({ id }: { id: string }) {
  const valid = DRILL_ID_PATTERN.test(id);
  const [exists, setExists] = useState<Existence>("loading");

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    fetch(`/api/drills/${id}`)
      .then(
        (r) =>
          !cancelled &&
          setExists(r.ok ? "ok" : r.status === 404 ? "missing" : "error"),
      )
      .catch(() => !cancelled && setExists("error"));
    return () => {
      cancelled = true;
    };
  }, [id, valid]);

  useEffect(() => {
    if (exists === "missing") forgetRecent(id);
  }, [exists, id]);

  if (!valid || exists === "missing") {
    return (
      <NotFound message="This drill doesn't exist. Check the link, or create a new drill." />
    );
  }
  if (exists === "error") {
    return (
      <NotFound message="We couldn't reach drilldraw. Check your connection and reload." />
    );
  }
  if (exists === "loading")
    return <div className="page loading">Loading drill…</div>;
  return <LiveEditor id={id} />;
}

function LiveEditor({ id }: { id: string }) {
  const { session, status, synced } = useDrill(id);
  if (!session) return <div className="page loading">Connecting…</div>;
  return (
    <EditorBody
      key={id}
      id={id}
      session={session}
      status={status}
      synced={synced}
    />
  );
}

function StatusDot({
  status,
  synced,
}: {
  status: ConnectionStatus;
  synced: boolean;
}) {
  const label =
    status === "connected" && synced
      ? "Saved & live"
      : status === "disconnected"
        ? "Offline: reconnecting"
        : "Connecting…";
  return (
    <span
      className={`status status-${status === "connected" && synced ? "ok" : status}`}
      role="status"
    >
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function useUndoState(undo: DrillSession["undo"]) {
  const [state, setState] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    const update = () =>
      setState({ canUndo: undo.canUndo(), canRedo: undo.canRedo() });
    update();
    undo.on("stack-item-added", update);
    undo.on("stack-item-popped", update);
    undo.on("stack-cleared", update);
    return () => {
      undo.off("stack-item-added", update);
      undo.off("stack-item-popped", update);
      undo.off("stack-cleared", update);
    };
  }, [undo]);
  return state;
}

function EditorBody({
  id,
  session,
  status,
  synced,
}: {
  id: string;
  session: DrillSession;
  status: ConnectionStatus;
  synced: boolean;
}) {
  const { parts, provider, undo, me } = session;
  const meta = useYMapJSON(parts.meta);
  const view = (RINK_VIEWS as string[]).includes(meta.rinkView as string)
    ? (meta.rinkView as RinkView)
    : "full";
  const [name, setName] = useYText(parts.name);
  // Remember this drill in the browser's History; keep its name current as people type.
  useEffect(() => {
    recordVisit({
      id,
      sport: SPORTS.includes(meta.sport as Sport)
        ? (meta.sport as Sport)
        : "hockey",
      name: parts.name.toString(),
    });
    // Only on open; renames are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => renameRecent(id, name), [id, name]);
  const [description, setDescription] = useYText(parts.description);
  const [coachingPoints, setCoachingPoints] = useYText(parts.coachingPoints);
  const elements = useYMapValues(parts.elements);
  const presence = usePresence(provider);
  const { canUndo, canRedo } = useUndoState(undo);

  const [tool, setTool] = useState<ToolId>("skate");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const newDrill = useCreateDrill();
  const [nameTouched, setNameTouched] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const focusLabel = useRef(false);

  const selected = useMemo(
    () => elements.find((e) => e.id === selectedId) ?? null,
    [elements, selectedId],
  );
  const peers = useMemo(
    () =>
      [...presence.entries()].filter(
        ([clientId]) => clientId !== provider.awareness.clientID,
      ),
    [presence, provider],
  );

  // Briefly show messages (copy link, limits, export errors).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Focus the label field right after placing a text marker.
  useEffect(() => {
    if (!focusLabel.current || !selected) return;
    focusLabel.current = false;
    // Wait a frame: the click that placed the marker would otherwise move focus back to the page.
    const frame = requestAnimationFrame(() => {
      labelRef.current?.focus();
      labelRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  const deleteSelected = () => {
    if (!selectedId) return;
    deleteElement(parts, selectedId);
    setSelectedId(null);
  };
  const duplicateSelected = () => {
    if (!selectedId) return;
    try {
      const copy = duplicateElement(parts, selectedId);
      if (copy) setSelectedId(copy.id);
    } catch (err) {
      setToast((err as Error).message);
    }
  };

  // Keyboard shortcuts (ignored while typing in a field).
  const shortcuts = useRef({ deleteSelected, duplicateSelected });
  useEffect(() => {
    shortcuts.current = { deleteSelected, duplicateSelected };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) undo.redo();
        else undo.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        undo.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        shortcuts.current.duplicateSelected();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        shortcuts.current.deleteSelected();
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if (!mod && !e.altKey) {
        const match = TOOLS.find(
          (tl) => tl.shortcut?.toLowerCase() === e.key.toLowerCase(),
        );
        if (match) setTool(match.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const info = { name, description, coachingPoints };
  const exportAs = async (kind: "png" | "pdf") => {
    if (!svgRef.current) return;
    if (!name.trim()) setNameTouched(true);
    try {
      await (kind === "png" ? downloadPng : downloadPdf)(svgRef.current, info);
    } catch (err) {
      console.error(err);
      setToast(`Couldn't create the ${kind.toUpperCase()}.`);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setToast("Link copied. Anyone with it can view and edit this drill.");
    } catch {
      setToast("Copy the address bar to share this drill.");
    }
  };

  const chooseTool = (t: ToolId) => {
    setTool(t);
    if (t !== "select") setSelectedId(null);
  };

  const people = [
    me,
    ...peers
      .map(([, s]) => s.user)
      .filter((u): u is NonNullable<typeof u> => !!u),
  ];

  return (
    <div className="page editor-page">
      <Header>
        <StatusDot status={status} synced={synced} />
        <div
          className="people"
          aria-label={`${people.length} ${people.length === 1 ? "person" : "people"} editing`}
        >
          {people.slice(0, 5).map((u, i) => (
            <span
              key={i}
              className="avatar"
              style={{ background: u.color }}
              title={i === 0 ? `${u.name} (you)` : u.name}
            >
              {u.name
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </span>
          ))}
          {people.length > 5 && (
            <span className="avatar avatar-more">+{people.length - 5}</span>
          )}
        </div>
        <button className="btn" onClick={() => setVersionsOpen((o) => !o)}>
          Drill Versions
        </button>
        <RecentDrills />
        <button className="btn btn-primary" onClick={copyLink}>
          Share link
        </button>
        <button
          className="btn"
          onClick={async () => {
            const err = await newDrill.create("hockey");
            if (err) setToast(err);
          }}
          disabled={newDrill.creating}
        >
          {newDrill.creating ? "Creating…" : "+ New drill"}
        </button>
      </Header>

      <main className="editor">
        <h1 className="editor-title">Ice Hockey Drill</h1>

        <label className="field">
          <span className="field-label">
            Drill name <span className="required">*</span>
          </span>
          <input
            className="input"
            value={name}
            maxLength={120}
            required
            placeholder="e.g. 2-on-1 rush with backcheck"
            aria-invalid={nameTouched && !name.trim()}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
          />
          {nameTouched && !name.trim() && (
            <span className="field-error">Give the drill a name.</span>
          )}
        </label>

        <section className="panel">
          <button
            className="panel-head"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((o) => !o)}
          >
            <span className="panel-toggle" aria-hidden="true">
              {panelOpen ? "−" : "+"}
            </span>
            Draw a drill
          </button>

          {panelOpen && (
            <div className="panel-body">
              <div className="views" role="radiogroup" aria-label="Rink view">
                {Object.values(VIEWS).map((v) => (
                  <button
                    key={v.id}
                    role="radio"
                    aria-checked={view === v.id}
                    className={`view-thumb ${view === v.id ? "active" : ""}`}
                    onClick={() => setRinkView(parts, v.id)}
                    title={v.label}
                  >
                    <Rink view={v.id} aria-hidden="true" />
                    <span>{v.label}</span>
                  </button>
                ))}
              </div>

              <div className="canvas-wrap">
                <DrillCanvas
                  ref={svgRef}
                  parts={parts}
                  view={view}
                  tool={tool}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onCreated={(el: DrillElement) => {
                    if (el.type === "text") {
                      setTool("select");
                      setSelectedId(el.id);
                      focusLabel.current = true;
                    }
                  }}
                  onError={setToast}
                  peers={peers}
                  onCursor={(c) =>
                    provider.awareness.setLocalStateField("cursor", c)
                  }
                />
              </div>

              <div
                className="toolbar"
                role="toolbar"
                aria-label="Drawing tools"
              >
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    className={`tool ${tool === t.id ? "active" : ""}`}
                    aria-pressed={tool === t.id}
                    aria-label={t.label}
                    title={t.shortcut ? `${t.label} (${t.shortcut})` : t.label}
                    onClick={() => chooseTool(t.id)}
                  >
                    {t.icon}
                  </button>
                ))}
                <span className="toolbar-sep" aria-hidden="true" />
                <button
                  className="tool"
                  aria-label="Undo"
                  title="Undo (Ctrl/⌘ Z)"
                  disabled={!canUndo}
                  onClick={() => undo.undo()}
                >
                  {ACTION_ICONS.undo}
                </button>
                <button
                  className="tool"
                  aria-label="Redo"
                  title="Redo (Shift Ctrl/⌘ Z)"
                  disabled={!canRedo}
                  onClick={() => undo.redo()}
                >
                  {ACTION_ICONS.redo}
                </button>
                <button
                  className="tool"
                  aria-label="Duplicate selected"
                  title="Duplicate selected (Ctrl/⌘ D)"
                  disabled={!selected}
                  onClick={duplicateSelected}
                >
                  {ACTION_ICONS.duplicate}
                </button>
                <button
                  className="tool"
                  aria-label={selected ? "Delete selected" : "Clear drill"}
                  title={selected ? "Delete selected (Del)" : "Clear drill"}
                  disabled={!selected && elements.length === 0}
                  onClick={() =>
                    selected ? deleteSelected() : setConfirmClear(true)
                  }
                >
                  {ACTION_ICONS.trash}
                </button>
              </div>

              {confirmClear && (
                <div
                  className="inline-confirm"
                  role="alertdialog"
                  aria-label="Clear drill"
                >
                  <span>Clear everything on the rink? You can undo this.</span>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => {
                      clearAll(parts);
                      setConfirmClear(false);
                    }}
                  >
                    Clear drill
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {selected && (
                <div className="selection-bar" aria-label="Selected item">
                  {isMarker(selected) &&
                    ["player", "number", "text"].includes(selected.type) && (
                      <label className="selection-label">
                        Label
                        <input
                          ref={labelRef}
                          className="input input-small"
                          value={selected.label}
                          maxLength={selected.type === "text" ? 60 : 4}
                          onChange={(e) =>
                            updateLabel(parts, selected.id, e.target.value)
                          }
                        />
                      </label>
                    )}
                  {isMarker(selected) &&
                    ["net", "text"].includes(selected.type) && (
                      <button
                        className="btn btn-small"
                        onClick={() =>
                          updateElement(parts, selected.id, {
                            rotation:
                              (selected.rotation +
                                (selected.type === "net" ? 90 : 15)) %
                              360,
                          })
                        }
                      >
                        {ACTION_ICONS.rotate} Rotate
                      </button>
                    )}
                  {isPath(selected) && selected.type !== "freehand" && (
                    <label className="selection-label">
                      <input
                        type="checkbox"
                        checked={selected.arrow}
                        onChange={(e) =>
                          updateElement(parts, selected.id, {
                            arrow: e.target.checked,
                          })
                        }
                      />
                      Arrowhead
                    </label>
                  )}
                  <button className="btn btn-small" onClick={duplicateSelected}>
                    Duplicate
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={deleteSelected}
                  >
                    Delete
                  </button>
                </div>
              )}

              <div className="downloads">
                <button className="btn btn-red" onClick={() => exportAs("png")}>
                  Download PNG
                </button>
                <button className="btn btn-red" onClick={() => exportAs("pdf")}>
                  Download PDF
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="details">
          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              className="input"
              rows={5}
              maxLength={4000}
              placeholder="Set-up, how the drill runs, rotations…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Coaching points</span>
            <textarea
              className="input"
              rows={5}
              maxLength={2000}
              placeholder={
                "One point per line, e.g.\nHead up, eyes on the puck carrier\nStick on the ice for the pass"
              }
              value={coachingPoints}
              onChange={(e) => setCoachingPoints(e.target.value)}
            />
          </label>
        </div>
      </main>

      {versionsOpen && (
        <VersionsPanel drillId={id} onClose={() => setVersionsOpen(false)} />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
