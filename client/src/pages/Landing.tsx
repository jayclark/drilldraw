import { useId } from "react";
import type { DrillElement } from "../../../shared/drill";
import { Header } from "../components/Header";
import { RecentDrills } from "../components/RecentDrills";
import { useCreateDrill } from "../drill/createDrill";
import { ElementDefs, ElementView } from "../editor/ElementView";
import { Rink } from "../rink/Rink";

/** A static sample drill for the hero illustration. */
const SAMPLE: DrillElement[] = [
  {
    id: "d1",
    z: 1,
    type: "player",
    variant: "defense",
    label: "D1",
    x: 72,
    y: -30,
    rotation: 0,
  },
  {
    id: "d2",
    z: 1,
    type: "player",
    variant: "defense",
    label: "D2",
    x: 72,
    y: 30,
    rotation: 0,
  },
  {
    id: "f1",
    z: 1,
    type: "player",
    variant: "forward",
    label: "F1",
    x: 30,
    y: -26,
    rotation: 0,
  },
  {
    id: "f2",
    z: 1,
    type: "player",
    variant: "forward",
    label: "F2",
    x: 30,
    y: 26,
    rotation: 0,
  },
  {
    id: "c",
    z: 1,
    type: "player",
    variant: "coach",
    label: "C",
    x: 16,
    y: 10,
    rotation: 0,
  },
  {
    id: "s1",
    z: 2,
    type: "skateWithPuck",
    arrow: true,
    points: [
      [33, -24],
      [50, -18],
      [64, -8],
    ],
  },
  {
    id: "s2",
    z: 2,
    type: "skate",
    arrow: true,
    points: [
      [33, 24],
      [52, 22],
      [70, 10],
    ],
  },
  {
    id: "p1",
    z: 2,
    type: "pass",
    arrow: true,
    points: [
      [66, -7],
      [72, 7],
    ],
  },
  {
    id: "sh",
    z: 2,
    type: "shot",
    arrow: true,
    points: [
      [74, 9],
      [86, 2],
    ],
  },
  {
    id: "b1",
    z: 2,
    type: "backward",
    arrow: true,
    points: [
      [70, -32],
      [60, -24],
    ],
  },
  { id: "pk", z: 3, type: "puck", x: 34, y: -20, rotation: 0, label: "" },
  { id: "cn1", z: 3, type: "cone", x: 46, y: 0, rotation: 0, label: "" },
  { id: "n1", z: 3, type: "number", x: 50, y: -26, rotation: 0, label: "1" },
  { id: "n2", z: 3, type: "number", x: 76, y: -3, rotation: 0, label: "2" },
];

function HeroRink() {
  const pid = useId().replace(/:/g, "") + "h";
  return (
    <Rink
      view="full"
      className="hero-rink"
      role="img"
      aria-label="Example 2-on-2 rush drill on a hockey rink"
    >
      <ElementDefs id={pid} />
      {SAMPLE.map((el) => (
        <ElementView
          key={el.id}
          el={el}
          viewRotate={0}
          patternId={pid}
          selectable={false}
        />
      ))}
    </Rink>
  );
}

const SPORTS = [
  {
    id: "hockey",
    name: "Ice Hockey",
    emoji: "🏒",
    live: true,
    blurb: "Full, half, neutral and end-zone rinks.",
  },
  {
    id: "soccer",
    name: "Soccer",
    emoji: "⚽",
    live: false,
    blurb: "Coming soon",
  },
  {
    id: "football",
    name: "Football",
    emoji: "🏈",
    live: false,
    blurb: "Coming soon",
  },
] as const;

const FEATURES = [
  {
    title: "Real rink views",
    body: "Full ice, half ice, neutral zone and end zone, drawn to scale.",
  },
  {
    title: "Standard hockey symbols",
    body: "Skating, skating with the puck, backward skating, passes, shots, pucks, cones, nets and players.",
  },
  {
    title: "Edit together, live",
    body: "Everyone with the link sees changes as they happen, with live cursors.",
  },
  {
    title: "Nothing is lost",
    body: "Automatic version history lets you roll back any change.",
  },
  {
    title: "Print-ready exports",
    body: "Download a sharp PNG or a PDF with your description and coaching points.",
  },
  {
    title: "Built for the rink",
    body: "Works with a mouse or with touch on a tablet. No accounts, no installs.",
  },
];

export function Landing() {
  const { create, creating, error } = useCreateDrill();
  const createButton = (label: string, className = "btn btn-primary") => (
    <button
      className={className}
      onClick={() => create("hockey")}
      disabled={creating}
    >
      {creating ? "Creating…" : label}
    </button>
  );

  return (
    <div className="page">
      <Header>
        <RecentDrills />
        {createButton("Create drill")}
      </Header>
      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Free & open drill designer</p>
            <h1>Draw drills. Share one link. Coach together.</h1>
            <p className="lede">
              Sketch a drill on a real rink in seconds, then send the link to
              your staff. Anyone with the link can view and edit it with you,
              live. No accounts, no installs.
            </p>
            <div className="hero-actions">
              {createButton("Create a hockey drill", "btn btn-primary btn-lg")}
              <a className="btn btn-ghost btn-lg" href="#how">
                How it works
              </a>
            </div>
          </div>
          <div className="hero-art">
            <HeroRink />
          </div>
        </section>

        <section className="sports" aria-labelledby="sports-title">
          <h2 id="sports-title">Pick your sport</h2>
          <div className="sport-grid">
            {SPORTS.map((s) => (
              <div
                key={s.id}
                className={`sport-card ${s.live ? "" : "sport-card-soon"}`}
              >
                <span className="sport-emoji" aria-hidden="true">
                  {s.emoji}
                </span>
                <div>
                  <h3>
                    {s.name}
                    {!s.live && <span className="badge">Coming soon</span>}
                  </h3>
                  <p>{s.blurb}</p>
                </div>
                {s.live ? (
                  createButton("Create drill", "btn btn-primary")
                ) : (
                  <button className="btn" disabled>
                    Coming soon
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="how" aria-labelledby="how-title">
          <h2 id="how-title">How it works</h2>
          <ol className="steps">
            <li>
              <strong>Create</strong>
              <span>
                Click Create and you get a new drill with its own private link.
              </span>
            </li>
            <li>
              <strong>Draw</strong>
              <span>
                Pick a rink view and draw with hockey-standard skating, passing
                and shooting lines.
              </span>
            </li>
            <li>
              <strong>Share</strong>
              <span>
                Send the link. Your assistant coaches can view it and edit it
                with you in real time.
              </span>
            </li>
          </ol>
        </section>

        <section className="features" aria-label="Features">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </section>

        <section className="cta">
          <h2>Ready for your next practice?</h2>
          {createButton("Create a hockey drill", "btn btn-primary btn-lg")}
          <p className="fine">
            Anyone with a drill's link can edit it, so only share it with people
            you trust.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <span>drilldraw</span>
        <a href="https://github.com/jayclark/drilldraw">
          Open source on GitHub
        </a>
      </footer>
    </div>
  );
}
