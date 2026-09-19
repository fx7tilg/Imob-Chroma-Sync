import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Reveal from "../components/Reveal";
import { useCountUp } from "../components/useCountUp";
import { useLandingFx } from "../components/useLandingFx";
import FluidBackdrop from "../components/FluidBackdrop";
import LogoMark from "../components/LogoMark";
import AiGuideModal from "../components/AiGuideModal";
import WorkflowGuideModal from "../components/WorkflowGuideModal";
import RCReferenceModal from "../components/RCReferenceModal";
import AiDecisionIntelModal from "../components/AiDecisionIntelModal";
import "../landing.css";

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  useLandingFx();
  useEffect(() => {
    let ticking = false;
    const on = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8);
        ticking = false;
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="cs-scope">
      <Nav scrolled={scrolled} />
      <Hero />
      <Storyline />
      <Problem />
      <Model />
      <Hierarchy />
      <HowItWorks />
      <Record />
      <CrossBrandVisibility />
      <Autonomy />
      <Roles />
      <AI />
      <CrossBrandConflict />
      <Material />
      <RealTime />
      <Audit />
      <Reporting />
      <Outcomes />
      <Governance />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Nav + brand mark                                             */
/* ------------------------------------------------------------ */

function Brand() {
  return (
    <span className="cs-brand">
      <LogoMark />
      CHROMA SYNC
    </span>
  );
}

function Nav({ scrolled }: { scrolled: boolean }) {
  const [showAiGuide, setShowAiGuide] = useState(false);
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(false);
  const [showRCRef, setShowRCRef] = useState(false);
  const [showAiDecisionIntel, setShowAiDecisionIntel] = useState(false);

  return (
    <>
      <nav className={`cs-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="cs-container cs-nav-inner">
          <Link to="/">
            <Brand />
          </Link>
          <div className="cs-nav-center">
            <div className="cs-nav-item">
              <button type="button" className="cs-nav-trigger">
                Platform <span className="cs-nav-caret" aria-hidden="true">▾</span>
              </button>
              <div className="cs-nav-menu">
                <a href="#platform">Platform</a>
                <a href="#how">How it works</a>
                <a href="#group">Group visibility</a>
                <a href="#ai">AI intelligence</a>
                <a href="#governance">Governance</a>
              </div>
            </div>
            <div className="cs-nav-item">
              <button type="button" className="cs-nav-trigger">
                Product <span className="cs-nav-caret" aria-hidden="true">▾</span>
              </button>
              <div className="cs-nav-menu">
                <a href="#reporting">Reporting</a>
                <a href="#audit">Audit</a>
                <a href="#conflict">Conflict detection</a>
              </div>
            </div>
            <div className="cs-nav-guides">
              <button type="button" className="cs-nav-guide workflow" onClick={() => setShowWorkflowGuide(true)}>
                Workflow Rules
              </button>
              <button type="button" className="cs-nav-guide ai" onClick={() => setShowAiGuide(true)}>
                How AI Works
              </button>
              <button type="button" className="cs-nav-guide ai" onClick={() => setShowRCRef(true)}>
                RC Guide
              </button>
              <button type="button" className="cs-nav-guide ai" onClick={() => setShowAiDecisionIntel(true)}>
                AI Decision Intel
              </button>
            </div>
          </div>
          <div className="cs-nav-right">
            <Link to="/login" className="cs-btn ghost">
              Sign In
            </Link>
            <Link to="/login" className="cs-btn primary">
              Try the demo <span className="cs-btn-arrow">→</span>
            </Link>
          </div>
        </div>
      </nav>
      <AiGuideModal isOpen={showAiGuide} onClose={() => setShowAiGuide(false)} />
      <WorkflowGuideModal isOpen={showWorkflowGuide} onClose={() => setShowWorkflowGuide(false)} />
      <RCReferenceModal isOpen={showRCRef} onClose={() => setShowRCRef(false)} />
      <AiDecisionIntelModal isOpen={showAiDecisionIntel} onClose={() => setShowAiDecisionIntel(false)} />
    </>
  );
}

/* ------------------------------------------------------------ */
/* Storyline carousel                                          */
/* ------------------------------------------------------------ */

const STORY_SLIDES = [
  {
    img: "/story/str1.png",
    meta: "The situation",
    h: "Every department shapes the same decision",
    p: "Design, engineering, procurement and quality all track colour and material choices for the same part - each from their own side of the process.",
  },
  {
    img: "/story/str2.png",
    meta: "The problem",
    h: "But there's no single source of truth",
    p: "With choices scattered across spreadsheets and inboxes, decisions get overwritten, rolled back or quietly ignored - and nobody notices until it's already a problem.",
  },
  {
    img: "/story/str3.png",
    meta: "The shift",
    h: "Chroma Sync holds one shared record",
    p: "One record per component, with AI tracking every change and surfacing readiness, conflicts and insights as the decision evolves.",
  },
  {
    img: "/story/str4.png",
    meta: "The outcome",
    h: "Teams align and move faster",
    p: "Everyone works from the same truth, approvals flow, and the work that used to stall now gets done - faster, and with confidence.",
  },
];

function Storyline() {
  const [index, setIndex] = useState(0);
  const count = STORY_SLIDES.length;

  useEffect(() => {
    const id = window.setInterval(() => setIndex((v) => (v + 1) % count), 4500);
    return () => window.clearInterval(id);
  }, [count]);

  const go = (delta: number) => setIndex((v) => (v + delta + count) % count);

  return (
    <section className="cs-story">
      <div className="cs-container">
        <Reveal className="cs-section-head center">
          <div className="cs-meta">How it plays out</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            From scattered calls to one shared record.
          </h2>
        </Reveal>
        <Reveal>
          <div
            className="cs-story-carousel"
            role="group"
            aria-roledescription="carousel"
            aria-label="Chroma Sync storyline"
          >
            <div className="cs-story-viewport">
              <div className="cs-story-track" style={{ transform: `translateX(-${index * 100}%)` }}>
                {STORY_SLIDES.map((s, i) => (
                  <div className="cs-story-slide" key={s.img} aria-hidden={i !== index}>
                    <div className="cs-story-media">
                      <img src={s.img} alt={s.h} loading="lazy" />
                    </div>
                    <div className="cs-story-copy">
                      <div className="cs-story-index">
                        0{i + 1} <span>/ 0{count}</span>
                      </div>
                      <div className="cs-meta">{s.meta}</div>
                      <h3 className="cs-h3">{s.h}</h3>
                      <p className="cs-body">{s.p}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button className="cs-story-arrow prev" onClick={() => go(-1)} aria-label="Previous slide">
              ‹
            </button>
            <button className="cs-story-arrow next" onClick={() => go(1)} aria-label="Next slide">
              ›
            </button>
          </div>
        </Reveal>

        <div className="cs-story-dots" role="tablist" aria-label="Storyline slides">
          {STORY_SLIDES.map((s, i) => (
            <button
              key={s.img}
              className={`cs-story-dot ${i === index ? "active" : ""}`}
              onClick={() => setIndex(i)}
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Hero                                                         */
/* ------------------------------------------------------------ */

function Hero() {
  return (
    <section className="cs-hero">
      <div className="cs-container">
        <Reveal>
          <div className="cs-meta">Cross-department colour &amp; material decision intelligence</div>
          <h1 className="cs-display cs-hero-headline" style={{ marginTop: 20 }}>
            One Group.
            <br />
            One source of truth.
          </h1>
        </Reveal>
        <div className="cs-hero-grid">
          <Reveal>
            <p className="cs-lead">
              Design, engineering, procurement and quality each decide part of
              every component&apos;s colour and material. Those decisions overlap -
              Chroma Sync is the one place that holds the record, no matter which
              team owns it.
            </p>
            <div className="cs-hero-ctas">
              <Link to="/signup" className="cs-btn primary">
                Try the live demo <span className="cs-btn-arrow">→</span>
              </Link>
              <a href="#how" className="cs-btn ghost">
                See how it works
              </a>
            </div>
            <div className="cs-hero-meta">
              <HeroStat target={4} label="Departments" />
              <HeroStat target={5} label="Business areas" />
              <HeroStat target={480} label="Components" />
              <HeroStat target={2.1} decimals={1} suffix="k" label="Decisions" />
            </div>
          </Reveal>

          <Reveal>
            <HeroMock />
          </Reveal>
        </div>
      </div>
    </section>
  );
}


function HeroStat({
  target,
  suffix = "",
  decimals = 0,
  label
}: {
  target: number;
  suffix?: string;
  decimals?: number;
  label: string;
}) {
  const { ref, value } = useCountUp(target);
  return (
    <div>
      <span className="num" ref={ref}>
        {value.toFixed(decimals)}
        {suffix}
      </span>
      {label}
    </div>
  );
}

const MOCK_SPEC: [string, string, string][] = [
  ["Colour", "CS-114", "cs-mono"],
  ["Material", "MAT-7892", "cs-mono"],
  ["Substrate", "ABS", ""],
  ["Gloss", "45", ""]
];

const MOCK_DEPTS = [
  {
    key: "Design",
    crumb: "Design",
    sub: "Created 14:32 · Design",
    status: "Design Approved",
    statusClass: "ok",
    readiness: "Readiness · Green",
    note: "Design has locked colour CS-114 and material MAT-7892. Ready for engineering feasibility."
  },
  {
    key: "Engineering",
    crumb: "Engineering",
    sub: "Reviewed 15:10 · Engineering",
    status: "Engineering Approved",
    statusClass: "ok",
    readiness: "Readiness · Green",
    note: "Engineering confirmed CS-114 on MAT-7892 is manufacturable. Passed to procurement."
  },
  {
    key: "Procurement",
    crumb: "Procurement",
    sub: "Sourcing 16:05 · Procurement",
    status: "Procurement Approved",
    statusClass: "ok",
    readiness: "Readiness · Green",
    note: "Procurement secured the supplier for MAT-7892 with confirmed Q3 availability. Awaiting quality sign-off."
  },
  {
    key: "Quality",
    crumb: "Quality",
    sub: "Audited 16:40 · Quality",
    status: "Quality Approved",
    statusClass: "ok",
    readiness: "Readiness · Green",
    note: "Quality validated all durability tests for CS-114 / MAT-7892. Decision is fully approved and released."
  }
];

function HeroMock() {
  const [active, setActive] = useState(0);
  const dept = MOCK_DEPTS[active];

  return (
    <div className="cs-mock">
      <div className="cs-mock-top">
        <div className="cs-mock-top-left">
          <span className="cs-mock-top-dot" />
          chroma-sync / decisions
        </div>
        <div className="cs-mock-tabs" role="tablist" aria-label="Department view">
          {MOCK_DEPTS.map((d, i) => (
            <button
              key={d.key}
              type="button"
              className={i === active ? "active" : ""}
              onClick={() => setActive(i)}
              role="tab"
              aria-selected={i === active}
            >
              {d.key}
            </button>
          ))}
        </div>
      </div>
      <div className="cs-mock-body">
        <div className="cs-mock-crumb">
          <span className="cs-crumb">
            <span>Group</span>
            <span className="sep">/</span>
            <span>Program 27</span>
            <span className="sep">/</span>
            <span>Interior</span>
            <span className="sep">/</span>
            <span>Door Panel A</span>
            <span className="sep">/</span>
            <span className="last">{dept.crumb}</span>
          </span>
        </div>
        <div className="cs-mock-titlebar">
          <div>
            <div className="cs-mock-title">Decision 0428 · Door Panel A</div>
            <div className="cs-mock-sub">{dept.sub}</div>
          </div>
          <span className={`cs-mock-status ${dept.statusClass}`}>{dept.status}</span>
        </div>
        <div className="cs-mock-cols">
          <div className="cs-mock-col">
            {MOCK_SPEC.map(([k, v, cls]) => (
              <div className="cs-mock-row" key={k}>
                <span className="k">{k}</span>
                <span className={`v ${cls}`}>{v}</span>
              </div>
            ))}
          </div>
          <div className="cs-mock-col">
            {MOCK_DEPTS.map((d, i) => (
              <div className="cs-mock-row" key={d.key}>
                <span className="k">{d.key}</span>
                <span className={`v ${i <= active ? "ok" : "dim"}`}>
                  {i <= active ? "Approved" : "Waiting"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="cs-ai-panel">
          <div className="h">
            <span className="t">{dept.readiness}</span>
            <span className="tag">AI · advisory</span>
          </div>
          <p>{dept.note}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* How it works                                                 */
/* ------------------------------------------------------------ */

function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Create the decision",
      body: "A component gets one record. Design opens it with the colour code and material reference - the single object every team will work from."
    },
    {
      num: "02",
      title: "Each team fills their part, in order",
      body: "Design marks the record 'Ready for Engineering' to unlock review. Engineering, then Procurement, then Quality each edit only the fields they own - approvals move strictly in that sequence."
    },
    {
      num: "03",
      title: "AI checks it in the background",
      body: "On submit and on every change, the AI service scores readiness green, yellow or red and flags conflicts with other records - advisory only, it never approves anything itself."
    },
    {
      num: "04",
      title: "Approve, and the report writes itself",
      body: "Quality signs off, the audit trail captures who changed what, and the Meldeliste and Colour-Mix-Chart generate straight from approved records."
    }
  ];
  return (
    <section className="cs-section" id="how">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">How it works</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            What we built, in four steps.
          </h2>
          <p className="cs-lead">
            Chroma Sync is a shared workspace for colour &amp; material decisions.
            This is the full loop a single component runs through - from first
            draft to a report that&apos;s never a version behind.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-roles">
            {steps.map((s, i) => (
              <Reveal className="cs-role" key={s.num} delay={i * 90}>
                <div className="num">{s.num}</div>
                <h4>{s.title}</h4>
                <p className="cs-body" style={{ marginTop: 8 }}>{s.body}</p>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Problem                                                      */
/* ------------------------------------------------------------ */

function Problem() {
  const cols = [
    { dept: "Design", tool: "Spreadsheet · shared drive", note: "Colour codes and material references." },
    { dept: "Engineering", tool: "PDM export · email", note: "Feasibility and technical spec." },
    { dept: "Procurement", tool: "Supplier portal · spreadsheet", note: "Prices, lead times, supply risk." },
    { dept: "Quality", tool: "Checklist · shared drive", note: "Sign-off nobody else can see." }
  ];
  return (
    <section className="cs-section">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">The current state</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            Every department tracks it a bit differently.
            <br />
            The decisions still overlap.
          </h2>
          <p className="cs-lead">
            Different tools, different spreadsheets, different habits per team.
            None of that is wrong on its own - it just means nobody outside the
            team actually knows what&apos;s been decided until it&apos;s already a problem.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-frag">
            {cols.map((c, i) => (
              <div className="cs-frag-col" key={c.dept}>
                <div className="cs-frag-top">
                  <span className="brand">Department</span>
                  <span className="cs-frag-num">0{i + 1}</span>
                </div>
                <h4>{c.dept}</h4>
                <p>{c.tool}</p>
                <p className="dim">{c.note}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Chroma Sync model (dark)                                     */
/* ------------------------------------------------------------ */

function Model() {
  const stages = [
    { num: "01", name: "Design", body: "Chooses the colour code and material for the component." },
    { num: "02", name: "Engineering", body: "Confirms the choice is feasible to build." },
    { num: "03", name: "Procurement", body: "Locks in supplier, price and lead time." },
    { num: "04", name: "Quality", body: "Reviews the record and gives final sign-off." }
  ];
  const aiLayer = [
    { k: "Insights", v: "Colour & material matches surfaced in context" },
    { k: "Recommendations", v: "Readiness rating on every change" },
    { k: "Decision tracking", v: "Every edit logged - who and when" },
    { k: "Impact analysis", v: "Conflicts flagged across components" }
  ];
  return (
    <section className="cs-section" id="platform">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">The decision flow</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            One decision, from concept to approval.
          </h2>
          <p className="cs-lead">
            The same record moves through every department in order - and an AI
            intelligence layer runs underneath the whole way, supporting each
            team without ever making the call for them.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-model">
            <div className="cs-flow">
              <div className="cs-flow-stages">
                {stages.map((s, i) => (
                  <div className="cs-flow-stage" key={s.name}>
                    <div className="cs-flow-num">{s.num}</div>
                    <h4>{s.name}</h4>
                    <p>{s.body}</p>
                    {i < stages.length - 1 && <span className="cs-flow-arrow" aria-hidden="true">→</span>}
                  </div>
                ))}
              </div>
              <div className="cs-flow-ai">
                <div className="cs-flow-ai-head">
                  <span className="badge">AI intelligence layer</span>
                  <span className="sub">Continuous · supports every stage</span>
                </div>
                <div className="cs-flow-ai-grid">
                  {aiLayer.map((a) => (
                    <div className="cs-flow-ai-item" key={a.k}>
                      <div className="k">{a.k}</div>
                      <div className="v">{a.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Hierarchy                                                    */
/* ------------------------------------------------------------ */

function Hierarchy() {
  const levels = [
    { sub: "01", label: "Program", desc: "Next-gen SUV" },
    { sub: "02", label: "Business area", desc: "Interior" },
    { sub: "03", label: "Component", desc: "Door Panel A" },
    { sub: "04", label: "Decision", desc: "Colour + material", active: true }
  ];
  return (
    <section className="cs-section tight">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Where a decision lives</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            Every colour &amp; material decision has one clear address.
          </h2>
          <p className="cs-lead">
            A decision is never floating on its own. It sits inside a program, in
            a business area, on a specific component - so Design, Engineering,
            Procurement and Quality all point to the exact same part when they
            work on its colour and material.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-hier" role="list" aria-label="Decision address">
            {levels.map((l, i) => (
              <div className="cs-hier-node-wrap" key={l.label} role="listitem">
                <div className={`cs-hier-node ${l.active ? "active" : ""}`}>
                  <span className="idx">{l.sub}</span>
                  <span className="lbl">{l.label}</span>
                  <span className="desc">{l.desc}</span>
                </div>
                {i < levels.length - 1 && <span className="cs-hier-sep" aria-hidden="true">›</span>}
              </div>
            ))}
          </div>
          <div className="cs-hier-decision">
            <span className="k">Decision on Door Panel A</span>
            <span className="v cs-mono">CS-114</span>
            <span className="v cs-mono">MAT-7892</span>
            <span className="v">Gloss 45</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* One record showcase                                          */
/* ------------------------------------------------------------ */

function Record() {
  return (
    <section className="cs-section">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">One record</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>One component, one record, every team on it.</h2>
          <p className="cs-lead">
            Design fills in colour and material. Engineering checks feasibility.
            Procurement locks in the supplier. Quality signs off. It&apos;s the same
            record the whole way through - nobody's copying it into their own file.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-record-grid">
            <div className="cs-record-main">
              <span className="cs-crumb">
                <span>Group</span>
                <span className="sep">/</span>
                <span>Program 27</span>
                <span className="sep">/</span>
                <span className="last">Interior</span>
              </span>
              <div className="cs-record-title">Door Panel A</div>
              <div className="cs-record-fields">
                <div className="cs-record-field">
                  <div className="k">Colour</div>
                  <div className="v">CS-114</div>
                </div>
                <div className="cs-record-field">
                  <div className="k">Material</div>
                  <div className="v">MAT-7892</div>
                </div>
                <div className="cs-record-field">
                  <div className="k">Supplier</div>
                  <div className="v">PolySource GmbH</div>
                </div>
                <div className="cs-record-field">
                  <div className="k">Lead time</div>
                  <div className="v">42 days</div>
                </div>
                <div className="cs-record-field">
                  <div className="k">Feasibility</div>
                  <div className="v">Confirmed</div>
                </div>
                <div className="cs-record-field">
                  <div className="k">Status</div>
                  <div className="v">Under Review</div>
                </div>
              </div>
              <div className="cs-record-links">
                <a href="#audit">Decision history →</a>
                <a href="#conflict">Related conflicts (1) →</a>
              </div>
            </div>
            <div className="cs-record-side">
              <div className="cs-approval-block">
                <h4>Team approvals</h4>
                <div className="cs-approval-row">
                  <span>Design</span>
                  <span className="status ok">Approved</span>
                </div>
                <div className="cs-approval-row">
                  <span>Engineering</span>
                  <span className="status ok">Approved</span>
                </div>
                <div className="cs-approval-row">
                  <span>Procurement</span>
                  <span className="status pend">Pending</span>
                </div>
                <div className="cs-approval-row">
                  <span>Quality</span>
                  <span className="status wait">Waiting</span>
                </div>
              </div>
              <div className="cs-ai-panel" style={{ marginTop: 28 }}>
                <div className="h">
                  <span className="t">Readiness · Yellow</span>
                  <span className="tag">AI · advisory</span>
                </div>
                <p>Everything is aligned except procurement confirmation.</p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Cross-brand visibility (metrics + matrix)                    */
/* ------------------------------------------------------------ */

function CrossBrandVisibility() {
  const rows = [
    { area: "Interior", components: 132, decisions: 612, conflicts: 5, approval: 71 },
    { area: "Exterior", components: 104, decisions: 428, conflicts: 3, approval: 76 },
    { area: "Cockpit", components: 88, decisions: 356, conflicts: 2, approval: 80 },
    { area: "Seating", components: 74, decisions: 284, conflicts: 1, approval: 83 },
    { area: "Lighting", components: 82, decisions: 390, conflicts: 4, approval: 74 }
  ];
  return (
    <section className="cs-section" id="group">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Group visibility</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            From individual decisions
            <br />
            to Group-level patterns.
          </h2>
          <p className="cs-lead">
            The same records the teams work from also roll up into one Group view
            - so leadership sees health, conflicts and throughput across every
            department without a separate report. Figures below are illustrative
            demo data.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-metrics">
            <div className="cs-metric">
              <div className="k">Components</div>
              <div className="v">480</div>
              <div className="d">Across 5 business areas</div>
            </div>
            <div className="cs-metric">
              <div className="k">Active decisions</div>
              <div className="v">2,070</div>
              <div className="d ok">+38 this week</div>
            </div>
            <div className="cs-metric">
              <div className="k">Approved</div>
              <div className="v">76%</div>
              <div className="d">1,569 records</div>
            </div>
            <div className="cs-metric">
              <div className="k">Open conflicts</div>
              <div className="v">15</div>
              <div className="d warn">4 across programs</div>
            </div>
            <div className="cs-metric">
              <div className="k">Cycle time</div>
              <div className="v">4.2d</div>
              <div className="d">Draft → approved</div>
            </div>
          </div>
          <div className="cs-matrix">
            <table>
              <thead>
                <tr>
                  <th>Business area</th>
                  <th>Components</th>
                  <th>Decisions</th>
                  <th>Conflicts</th>
                  <th>Approval</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.area}>
                    <td>{r.area}</td>
                    <td className="val">{r.components}</td>
                    <td className="val">{r.decisions.toLocaleString()}</td>
                    <td className="val">{r.conflicts}</td>
                    <td className="val">
                      <span className="bar" style={{ width: `${r.approval}px` }} />
                      {r.approval}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Brand autonomy                                               */
/* ------------------------------------------------------------ */

function Autonomy() {
  return (
    <section className="cs-section">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Team autonomy</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            We standardise the parts that need it.
            <br />
            Everything else stays with the team.
          </h2>
          <p className="cs-lead">
            Terminology, approval rules, material standards - each team keeps all
            of that. What&apos;s shared across the Group is just the underlying
            structure of a decision, not how each department runs its own process.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-split">
            <div className="cs-split-col">
              <h4>Group standard</h4>
              <ul>
                <li>Decision object &amp; states</li>
                <li>Audit model</li>
                <li>Row-level security</li>
                <li>AI evaluation framework</li>
                <li>Reporting primitives</li>
                <li>Core approval concept</li>
              </ul>
            </div>
            <div className="cs-split-col">
              <h4>Team context</h4>
              <ul>
                <li>Programs &amp; component taxonomy</li>
                <li>Material and colour catalogues</li>
                <li>Design terminology</li>
                <li>Approval rules and thresholds</li>
                <li>Team-specific fields</li>
                <li>Supplier network</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Roles                                                        */
/* ------------------------------------------------------------ */

function Roles() {
  const roles = [
    { num: "01", name: "Design", items: ["Colour code & material", "Finish / surface", "Temp, UV & chemical needs", "Creates & submits the record"] },
    { num: "02", name: "Engineering", items: ["Feasibility & part number", "Manufacturing process", "Validates temp / UV / chemical", "Technical constraints"] },
    { num: "03", name: "Procurement", items: ["Supplier & supplier status", "Price & currency", "Lead time & MOQ", "RFQ reference"] },
    { num: "04", name: "Quality", items: ["Inspection & pass / fail", "Quality status", "Final approve or reject", "Only team that releases"] }
  ];
  return (
    <section className="cs-section">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Ownership</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            Anyone can see a decision.
            <br />
            Only the owning team can change it.
          </h2>
          <p className="cs-lead">
            Approvals move in a fixed order: Design signs off first and marks the
            record ready for engineering, then Engineering, then Procurement, and
            Quality releases it last. If any team rejects, the record returns to
            Design, every approval resets, and the cycle restarts on a new
            version. Within each team people hold one of three access levels -
            Editors create and edit their fields, Approvers approve, reject and
            resolve conflicts, and Viewers have read-only access - while a
            Project Admin manages users, roles and master data. None of that is a
            UI setting someone can toggle off; it&apos;s enforced in the database
            itself, so it holds even if a request skips the interface.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-roles">
            {roles.map((r, i) => (
              <Reveal className="cs-role" key={r.name} delay={i * 90}>
                <div className="num">{r.num}</div>
                <h4>{r.name}</h4>
                <ul>
                  {r.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* AI (dark)                                                    */
/* ------------------------------------------------------------ */

function AI() {
  return (
    <section className="cs-section on-dark" id="ai">
      <FluidBackdrop />
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Intelligence layer</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            A second set of eyes on every decision.
          </h2>
          <p className="cs-lead">
            Every decision is scored against six readiness criteria - material
            lifecycle compliance, supplier feasibility, design maturity,
            quality-gate status, approval &amp; RBAC integrity, and cross-decision
            conflicts. The scoring is deterministic and reproducible; a language
            model only writes the plain-English reason. The result is Ready,
            Caution or Blocked - advisory only. It never approves anything; that
            part is still yours.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-ai-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="cs-ai-card">
              <div className="k">01 · On Submission Scan</div>
              <h4>Trigger</h4>
              <div className="cs-ai-result">
                When a Designer clicks "Submit Decision", the AI immediately performs a full 6-point Readiness Criteria (RC) scan before the decision enters the review pipeline. If any RC evaluates to Red, the submission is automatically rejected.
              </div>
            </div>
            <div className="cs-ai-card">
              <div className="k">02 · AI Rating Assignment</div>
              <h4>Green / Yellow / Red</h4>
              <div className="cs-ai-result">
                <strong>Green:</strong> All 6 Readiness Criteria satisfied.<br/>
                <strong>Yellow:</strong> No critical blockers, but warnings present (e.g., missing data).<br/>
                <strong>Red:</strong> Critical failure requiring immediate attention.
              </div>
            </div>
            <div className="cs-ai-card">
              <div className="k">03 · Conflict and Duplicate Detection</div>
              <h4>Same Component & Lifecycle Checks</h4>
              <div className="cs-ai-result">
                Flags conflicts if two decisions target the same component with different specs, or if one uses an Active material and another a Deprecated one to prevent supply chain disruption.
              </div>
            </div>
            <div className="cs-ai-card">
              <div className="k">04 · Version Delta Validation</div>
              <h4>On Resubmission</h4>
              <div className="cs-ai-result">
                When a rejected decision is resubmitted, the AI compares exact field changes to verify if they resolve the original rejection reason. If not, it blocks Quality approval.
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: "2rem", padding: "1.5rem", background: "rgba(255,255,255,0.03)", borderRadius: "var(--r-md)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="k" style={{ color: "#fff", marginBottom: "1rem" }}>Data Sources Used by the AI</div>
            <div className="cs-ai-docs">
              <div><strong>DiMa Master List:</strong> Lifecycle status and supplier info</div>
              <div><strong>VRED Visual Validation:</strong> 3D render comparison for surface finish</div>
              <div><strong>Approval Chain:</strong> RBAC-verified history</div>
              <div><strong>Audit Log:</strong> Immutable field changes and timestamped transitions</div>
              <div><strong>Conflict Graph:</strong> Real-time cross-reference of all decisions</div>
            </div>
          </div>

          <p className="cs-ai-statement" style={{ marginTop: "3rem" }}>
            AI flags it. <span>People still decide.</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Cross-brand conflict                                         */
/* ------------------------------------------------------------ */

function CrossBrandConflict() {
  return (
    <section className="cs-section" id="conflict">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Conflict detection</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            Conflicts don&apos;t stop at department lines.
          </h2>
          <p className="cs-lead">
            Imagine Team A is making the doors, and Team B is making the seats. If Team A uses a shiny black plastic and Team B uses a matte black plastic, nobody notices until the car is built. 
            <br/><br/>
            In Chroma Sync, we built a robotic security guard using AI. Every 30 minutes, it automatically wakes up and reads every single decision made across the entire company. When it finds a clash, it immediately flags it as a Conflict on the dashboard—silently, in the background, 24/7.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-conflict">
            <div className="cs-conflict-card">
              <div className="cs-crumb crumb">
                <span>Program 27</span>
                <span className="sep">/</span>
                <span>Interior</span>
                <span className="sep">/</span>
                <span className="last">Door Panel A</span>
              </div>
              <div className="title">Colour CS-114 · Gloss 45</div>
              <div className="row">
                <span className="k">Material</span>
                <span>MAT-7892</span>
              </div>
              <div className="row">
                <span className="k">Substrate</span>
                <span>ABS</span>
              </div>
              <div className="row">
                <span className="k">Owner</span>
                <span>Design</span>
              </div>
            </div>
            <div className="cs-conflict-vs">
              <div className="line" />
              <span className="badge">Conflict</span>
              <div className="line" />
            </div>
            <div className="cs-conflict-card">
              <div className="cs-crumb crumb">
                <span>Program 27</span>
                <span className="sep">/</span>
                <span>Interior</span>
                <span className="sep">/</span>
                <span className="last">B-Pillar</span>
              </div>
              <div className="title">Colour CS-114 · Gloss 60</div>
              <div className="row">
                <span className="k">Material</span>
                <span>MAT-1003</span>
              </div>
              <div className="row">
                <span className="k">Substrate</span>
                <span>ABS</span>
              </div>
              <div className="row">
                <span className="k">Owner</span>
                <span>Engineering</span>
              </div>
            </div>
          </div>
          <p className="cs-conflict-note">
            Detected 09:14 · Same colour code, adjacent components, incompatible
            gloss. Both records are flagged and an owning team is assigned. Until
            it&apos;s resolved, Quality can&apos;t release either decision.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Material context                                             */
/* ------------------------------------------------------------ */

function Material() {
  return (
    <section className="cs-section">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Material intelligence</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>The decision arrives with its context.</h2>
          <p className="cs-lead">
            Material properties and render preview are pulled directly from
            DiMa and VRED. The decision record carries them from creation to
            approval.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-material">
            <div className="cs-material-side">
              <div className="code">DIMA · MAT-7892</div>
              <div className="name">Paint · Deep Sapphire</div>
              <div className="cs-material-fields">
                <div>
                  <div className="k">Gloss level</div>
                  <div className="v">45</div>
                </div>
                <div>
                  <div className="k">Substrate</div>
                  <div className="v">ABS</div>
                </div>
                <div>
                  <div className="k">Temperature</div>
                  <div className="v">−30°C → 85°C</div>
                </div>
                <div>
                  <div className="k">Compatibility</div>
                  <div className="v ok">✓ Confirmed</div>
                </div>
              </div>
            </div>
            <div className="cs-material-render">
              <div className="head">
                <span>VRED preview</span>
                <span>Frame · 01</span>
              </div>
              <div className="foot">Reflectance model · matte to satin</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Real-time                                                    */
/* ------------------------------------------------------------ */

function RealTime() {
  const steps = [
    { who: "Design", what: "updated colour", when: "14:32", live: false },
    { who: "Engineering", what: "approved feasibility", when: "14:47", live: false },
    { who: "AI", what: "readiness updated", when: "15:14", live: false },
    { who: "Procurement", what: "added supplier", when: "15:21", live: false },
    { who: "Quality", what: "review pending", when: "15:30", live: true }
  ];
  return (
    <section className="cs-section">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Real-time</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>Nobody's working off an old copy.</h2>
          <p className="cs-lead">
            The moment someone changes a field, everyone else looking at that
            record sees it. No refresh, no “can you resend the latest version”.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-rt">
            {steps.map((s) => (
              <div className={`cs-rt-step ${s.live ? "live" : ""}`} key={s.who}>
                <div className="who">{s.who}</div>
                <div className="what">{s.what}</div>
                <div className="when">{s.when}</div>
              </div>
            ))}
          </div>
          <div className="cs-live-label">Live · single decision record</div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Audit                                                        */
/* ------------------------------------------------------------ */

function Audit() {
  const events = [
    ["14:32", "Design created decision", "Dana · Design"],
    ["14:47", "Design submitted", "Dana · Design"],
    ["15:02", "Engineering approved", "Evan · Engineering"],
    ["15:14", "AI generated readiness · Yellow", "System · AI"],
    ["15:21", "Procurement updated supplier", "Priya · Procurement"],
    ["15:25", "Procurement approved", "Priya · Procurement"],
    ["15:30", "Quality review opened", "Quinn · Quality"]
  ];
  return (
    <section className="cs-section" id="audit">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Auditability</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>You can always answer “who changed this, and when?”</h2>
          <p className="cs-lead">
            Every change gets logged by a database trigger, not by someone
            remembering to write it down. If it happened, it&apos;s in here.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-timeline">
            {events.map(([t, d, w], i) => (
              <div className="cs-tl-item" key={t + d} style={{ ["--i" as string]: i } as React.CSSProperties}>
                <div className="cs-tl-card">
                  <div className="time">{t}</div>
                  <div className="txt">{d}</div>
                  <div className="who">{w}</div>
                </div>
                <span className="cs-tl-dot" />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Reporting                                                    */
/* ------------------------------------------------------------ */

function Reporting() {
  return (
    <section className="cs-section" id="reporting">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Reporting</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            The report is just a view of what&apos;s already there.
          </h2>
          <p className="cs-lead">
            Meldeliste, Colour-Mix-Chart, AI Readiness, Supply Chain and
            Compliance Audit all pull straight from live records - nobody's
            rebuilding them by hand every reporting cycle, and they're never a
            version behind.
          </p>
        </Reveal>
        <Reveal>
          <div className="cs-reports">
            <div className="cs-report">
              <div className="kind">MELDELISTE.XLSX</div>
              <h4>Meldeliste</h4>
              <table className="cs-report-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Part no.</th>
                    <th>Colour</th>
                    <th>Material</th>
                    <th>Supplier</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Door Panel A</td>
                    <td>DP-A-114</td>
                    <td>CS-114</td>
                    <td>MAT-7892</td>
                    <td>PolySource</td>
                    <td>Approved</td>
                  </tr>
                  <tr>
                    <td>Dashboard trim</td>
                    <td>DT-101</td>
                    <td>CS-101</td>
                    <td>MAT-7892</td>
                    <td>PolySource</td>
                    <td>Approved</td>
                  </tr>
                </tbody>
              </table>
              <Link to="/signup" className="cs-btn">
                Generate →
              </Link>
            </div>
            <div className="cs-report">
              <div className="kind">COLOUR-MIX-CHART.PDF</div>
              <h4>Colour-Mix-Chart</h4>
              <div className="cs-mix">
                {Array.from({ length: 40 }).map((_, i) => {
                  const cls = i % 5 === 0 ? "on" : i % 7 === 0 ? "warn" : "";
                  return <span key={i} className={cls} />;
                })}
              </div>
              <Link to="/signup" className="cs-btn">
                Generate →
              </Link>
            </div>
            <div className="cs-report">
              <div className="kind">ANALYTICS</div>
              <h4>Readiness, supply &amp; compliance</h4>
              <div className="cs-ai-docs">
                <div>AI Readiness Report - portfolio health across all six criteria</div>
                <div>Supply Chain Report - lead-time and supplier risk</div>
                <div>Compliance Audit Report - inspection results and pass / fail</div>
              </div>
              <Link to="/signup" className="cs-btn">
                Open →
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Outcomes                                                     */
/* ------------------------------------------------------------ */

function Outcomes() {
  const outcomes = [
    {
      k: "One record",
      v: "instead of 4 spreadsheets",
      d: "Design, engineering, procurement and quality work from the same object - no copies to reconcile."
    },
    {
      k: "Conflicts caught early",
      v: "before Quality, not weeks later",
      d: "The AI service flags clashing decisions as they happen, while they're still cheap to fix."
    },
    {
      k: "Reports on demand",
      v: "seconds, not hours",
      d: "Meldeliste and Colour-Mix-Chart build straight from approved records - never rebuilt by hand, never stale."
    }
  ];
  return (
    <section className="cs-section">
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Why it matters</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            What changes when the whole Group shares one record.
          </h2>
        </Reveal>
        <Reveal>
          <div className="cs-outcomes">
            {outcomes.map((o, i) => (
              <Reveal className="cs-role" key={o.k} delay={i * 90}>
                <div className="num">0{i + 1}</div>
                <h4>{o.k}</h4>
                <p className="cs-body" style={{ marginTop: 8 }}>
                  <strong>{o.v}.</strong> {o.d}
                </p>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Governance (dark)                                            */
/* ------------------------------------------------------------ */

function Governance() {
  return (
    <section className="cs-section on-dark" id="governance">
      <FluidBackdrop />
      <div className="cs-container">
        <Reveal className="cs-section-head">
          <div className="cs-meta">Security &amp; governance</div>
          <h2 className="cs-h2" style={{ marginTop: 12 }}>
            Built for the kind of organisation
            <br />
            where “trust me” isn&apos;t good enough.
          </h2>
        </Reveal>
        <Reveal>
          <div className="cs-gov">
            <div className="cs-gov-card">
              <div className="k">Governance</div>
              <h4>Permissions in the database.</h4>
              <p>
                Row-level security decides which records a team can change, and a
                column-guard trigger goes further - controlling the individual
                fields each team may edit. A request that bypasses the UI is
                still refused.
              </p>
            </div>
            <div className="cs-gov-card">
              <div className="k">Access control</div>
              <h4>Thirteen roles, one Project Admin.</h4>
              <p>
                Editor, Approver and Viewer across the four teams, plus a Project
                Admin for users, roles and master data, define exactly what each
                person can do. A Project Lead can override when needed, and every
                override is logged.
              </p>
            </div>
            <div className="cs-gov-card">
              <div className="k">Traceability</div>
              <h4>Every change is recorded.</h4>
              <p>
                Audit triggers write old and new values on every insert, update
                and delete to decisions and approvals. The application never has
                to remember to log.
              </p>
            </div>
            <div className="cs-gov-card">
              <div className="k">Transparency</div>
              <h4>AI is separated from approval.</h4>
              <p>
                AI can only write to its own reserved columns. Its output is
                labelled and time-stamped, and human approval is a separate
                signal on the record. The two never overwrite each other.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Final CTA                                                    */
/* ------------------------------------------------------------ */

function FinalCta() {
  return (
    <section className="cs-final">
      <div className="cs-container">
        <Reveal>
          <div className="cs-meta" style={{ marginBottom: 24 }}>CHROMA SYNC</div>
          <h2 className="cs-display">
            One Group.
            <br />
            One decision layer.
          </h2>
          <p className="cs-lead">
            One shared place for the decisions behind every component -
            whichever programme, whichever component, whichever team is looking at it.
          </p>
          <div className="cs-final-ctas">
            <Link to="/signup" className="cs-btn primary on-dark">
              Try the live demo →
            </Link>
            <Link to="/login" className="cs-btn ghost on-dark">
              Sign In
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ */
/* Footer                                                       */
/* ------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="cs-footer">
      <div className="cs-container">
        <div className="cs-footer-inner">
          <div className="cs-footer-brand">
            <Brand />
            <h4>Colour &amp; Material Decision Intelligence</h4>
            <p>Group platform for synchronised colour and material decisions across departments.</p>
          </div>
          <div className="cs-footer-col">
            <h5>Platform</h5>
            <a href="#platform">Platform</a>
            <a href="#how">How it works</a>
            <a href="#group">Group visibility</a>
            <a href="#ai">AI intelligence</a>
            <a href="#governance">Governance</a>
          </div>
          <div className="cs-footer-col">
            <h5>Product</h5>
            <a href="#reporting">Reporting</a>
            <a href="#audit">Audit</a>
            <a href="#conflict">Conflict detection</a>
          </div>
          <div className="cs-footer-col">
            <h5>Access</h5>
            <Link to="/login">Sign In</Link>
            <Link to="/login">Try the demo</Link>
          </div>
        </div>
        <div className="cs-footer-bottom">
          <span>A Group product · © 2026 Chroma Sync</span>
          <span>
            <span className="dot">●</span>&nbsp; Systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}
