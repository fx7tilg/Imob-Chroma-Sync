import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Zap,
  Shield,
  BarChart3,
  FileText,
  Activity,
  Loader2,
  Printer,
  TrendingUp,
  ChevronRight,
  Search,
  XCircle,
} from "lucide-react";
import LogoMark from "../components/LogoMark";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis
} from "recharts";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { useGlobalFilter } from "../contexts/FilterContext";
import { ROLE_LABELS } from "../utils/permissions";
import type { Decision, Conflict, Approval } from "../types/db";

/* ── Badge Maps ── */
const STATUS_BADGE: Record<string, string> = {
  draft: "badge-purple",
  submitted: "badge-blue",
  under_review: "badge-amber",
  approved: "badge-green",
  rejected: "badge-red"
};

const RATING_BADGE: Record<string, string> = {
  green: "badge-green",
  yellow: "badge-amber",
  red: "badge-red"
};

/* ── Recharts Theme ── */
const CHART_COLORS = {
  green: "#34d399",
  amber: "#fbbf24",
  red: "#f87171",
  accent: "#00EFD4",
  accentLight: "#5ff5e4",
  surface: "rgba(0, 39, 51, 0.15)",
  grid: "rgba(255,255,255,0.04)",
  text: "#6b7d99",
};

/* ── RC Matrix ── */
const RC_LABELS: Record<string, { short: string; full: string; icon: string }> = {
  rc1_lifecycle: { short: "RC-1", full: "Material Lifecycle", icon: "🔄" },
  rc2_compliance: { short: "RC-2", full: "Compliance Status", icon: "📋" },
  rc3_lead_time: { short: "RC-3", full: "Supply Chain Lead Time", icon: "📦" },
  rc4_visual: { short: "RC-4", full: "Visual Validation (VRED)", icon: "🎨" },
  rc5_approval_rbac: { short: "RC-5", full: "Approval & RBAC", icon: "🔐" },
  rc6_conflict: { short: "RC-6", full: "Cross-Area Conflict", icon: "⚡" },
};
const RC_KEYS = Object.keys(RC_LABELS) as (keyof typeof RC_LABELS)[];

/* ── Utilities ── */
function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function formatSyncTime(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "Just now";
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diff < 86400) return `Synced ${timeStr}`;
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Synced ${dateStr}, ${timeStr}`;
}

function formatAuditTime(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) +
    ", " + date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type JoinedConflict = Conflict & {
  decision_a: { component_name: string; business_area: string };
  decision_b: { component_name: string };
};

/* ── Custom Premium Tooltip ── */
const PremiumTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{
        background: "rgba(0, 30, 80, 0.8)",
        border: "1px solid rgba(77, 166, 255, 0.3)",
        borderRadius: "12px",
        backdropFilter: "blur(16px)",
        padding: "12px 16px",
        boxShadow: "0 12px 40px rgba(0, 20, 60, 0.6)",
        color: "#fff",
        fontFamily: "var(--font-inter)",
        zIndex: 1000
      }}>
        {data.fullLabel ? (
          <div style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "6px" }}>
            {data.icon} {data.fullLabel}
          </div>
        ) : (
          <div style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "6px" }}>
            {data.name || payload[0].name}
          </div>
        )}
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", marginTop: "4px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color || entry.fill }} />
            <span style={{ color: "rgba(255,255,255,0.7)" }}>{entry.name}:</span>
            <span style={{ fontWeight: 600 }}>{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

/* ══════════════════════════════════════════════════════════
   Severity Badge
   ══════════════════════════════════════════════════════════ */
function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    critical: { label: "Critical", cls: "badge-red" },
    attention: { label: "Attention", cls: "badge-amber" },
    on_track: { label: "On Track", cls: "badge-green" },
  };
  const c = config[severity] || config.attention;
  return <span className={`badge ${c.cls}`} style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{c.label}</span>;
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD HOME - Executive Command Centre
   ══════════════════════════════════════════════════════════ */

export default function DashboardHome() {
  const { profile, role } = useAuth();
  const { filterRange } = useGlobalFilter();
  const navigate = useNavigate();

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<JoinedConflict[]>([]);
  const [lastFetched, setLastFetched] = useState(new Date().toISOString());
  const [activeTab, setActiveTab] = useState<"pool" | "queue" | "history">("pool");
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let decQuery = supabase.from("decisions").select("*").neq("status", "draft").order("updated_at", { ascending: false });
      let appQuery = supabase.from("approvals").select("*");
      let confQuery = supabase.from("conflicts")
        .select(`*, decision_a:decision_a_id(component_name, business_area), decision_b:decision_b_id(component_name)`)
        .eq("resolved", false);
      if (filterRange) {
        decQuery = decQuery.gte("updated_at", filterRange.start).lte("updated_at", filterRange.end);
        confQuery = confQuery.gte("detected_at", filterRange.start).lte("detected_at", filterRange.end);
      }
      const [decRes, appRes, confRes] = await Promise.all([decQuery, appQuery, confQuery]);
      if (!cancelled) {
        if (decRes.data) setDecisions(decRes.data as Decision[]);
        if (appRes.data) setApprovals(appRes.data as Approval[]);
        if (confRes.data) setConflicts(confRes.data as JoinedConflict[]);
        setLastFetched(new Date().toISOString());
      }
    }
    load();
    const channel = supabase
      .channel("dashboard-home-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conflicts" }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [filterRange]);

  const groupedConflicts = useMemo(() => {
    const map = new Map<string, JoinedConflict[]>();
    for (const c of conflicts) {
      const [a, b] = [c.decision_a_id, c.decision_b_id].sort();
      const key = `${a}::${b}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.values());
  }, [conflicts]);

  /* ── Computed ── */
  const stats = useMemo(() => {
    const total = decisions.length;
    const pending = decisions.filter((d) => d.status === "under_review" || d.status === "submitted").length;
    const approved = decisions.filter((d) => d.status === "approved").length;
    const rejected = decisions.filter((d) => d.status === "rejected").length;
    const drafts = decisions.filter((d) => d.status === "draft").length;
    return { total, pending, approved, rejected, drafts, conflicts: groupedConflicts.length };
  }, [decisions, groupedConflicts]);

  const readiness = useMemo(() => {
    const green = decisions.filter((d) => d.ai_rating === "green").length;
    const yellow = decisions.filter((d) => d.ai_rating === "yellow").length;
    const red = decisions.filter((d) => d.ai_rating === "red").length;
    const noRating = decisions.filter((d) => !d.ai_rating).length;
    return { green, yellow, red, noRating, total: green + yellow + red };
  }, [decisions]);

  const scored = useMemo(() => decisions.filter(d => d.ai_rating), [decisions]);

  const healthScore = useMemo(() => {
    if (scored.length === 0) return 0;
    let total = 0;
    for (const d of scored) {
      if (d.ai_rating === "green") total += 100;
      else if (d.ai_rating === "yellow") total += 50;
    }
    return Math.round(total / scored.length);
  }, [scored]);

  const rcBreakdown = useMemo(() => {
    return RC_KEYS.map(key => {
      let green = 0, yellow = 0, red = 0, unscored = 0;
      for (const d of decisions) {
        const val = (d as any)[key];
        if (val === "green") green++;
        else if (val === "yellow") yellow++;
        else if (val === "red") red++;
        else unscored++;
      }
      return {
        key,
        label: RC_LABELS[key].short,
        fullLabel: RC_LABELS[key].full,
        icon: RC_LABELS[key].icon,
        green, yellow, red, unscored,
        total: decisions.length,
        passRate: decisions.length > 0 ? Math.round((green / decisions.length) * 100) : 0,
      };
    });
  }, [decisions]);

  const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;

  // Decision status distribution for donut chart
  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of decisions) map[d.status] = (map[d.status] ?? 0) + 1;
    const meta: Record<string, { label: string; color: string }> = {
      approved: { label: "Approved", color: CHART_COLORS.green },
      under_review: { label: "Under Review", color: CHART_COLORS.amber },
      submitted: { label: "Submitted", color: CHART_COLORS.accent },
      rejected: { label: "Rejected", color: CHART_COLORS.red },
      draft: { label: "Draft", color: "#3d506b" },
    };
    return Object.entries(map)
      .map(([status, value]) => ({ name: meta[status]?.label ?? status, value, fill: meta[status]?.color ?? "#3d506b" }))
      .filter(d => d.value > 0);
  }, [decisions]);

  // Decisions grouped by business area for bar chart
  const areaData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of decisions) {
      const area = d.business_area || "Unassigned";
      map[area] = (map[area] ?? 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [decisions]);

  const displayedDecisions = useMemo(() => {
    if (role.startsWith("design")) return decisions.slice(0, 5);

    const currentUserId = profile?.id;
    if (!currentUserId) return [];

    let pool: Decision[] = [];
    let queue: Decision[] = [];
    let history: Decision[] = [];

    for (const d of decisions) {
      if (d.status === "draft") continue;

      let ownerId = null;
      if (role.startsWith("engineering")) ownerId = d.engineering_owner_id;
      if (role.startsWith("procurement")) ownerId = d.procurement_owner_id;
      if (role.startsWith("quality")) ownerId = d.quality_owner_id;

      const teamApproval = approvals.find(a => a.decision_id === d.id && role.startsWith(a.team));
      const hasSubmitted = teamApproval && teamApproval.status !== "pending";

      if (hasSubmitted) {
        if (ownerId === currentUserId) history.push(d);
      } else if (ownerId === currentUserId) {
        queue.push(d);
      } else if (!ownerId) {
        pool.push(d);
      }
    }

    if (activeTab === "pool") return pool.slice(0, 5);
    if (activeTab === "queue") return queue.slice(0, 5);
    if (activeTab === "history") return history.slice(0, 5);
    return [];
  }, [decisions, role, activeTab, profile?.id, approvals]);



  // Standardized chart header style so titles align across chart columns
  const chartHeaderStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    marginBottom: "0.75rem",
    fontSize: "0.6875rem",
    fontWeight: 700,
    color: "var(--text-2)",
    textTransform: "uppercase",
    letterSpacing: "0.06em"
  };

  /* ═══ RENDER ═══ */
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>



      {/* ── Hero Header ── */}
      <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
            <h1 style={{ margin: 0 }}>Dashboard</h1>
            <span className="badge badge-accent" style={{ fontSize: "0.5625rem", padding: "2px 8px" }}>{ROLE_LABELS[role]}</span>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--text-2)", margin: 0 }}>
            Welcome back, <span style={{ color: "var(--text-0)", fontWeight: 500 }}>{profile?.full_name ?? "there"}</span>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-3)", fontSize: "0.6875rem" }}>
          <span className="live-dot" />
          <span>{formatSyncTime(lastFetched)}</span>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid4" style={{ marginBottom: "1.5rem" }}>
        <KPICard
          label="Total Decisions"
          value={stats.total}
          icon={<BarChart3 size={15} />}
          accentColor="var(--accent)"
        />
        <KPICard
          label="Pending Review"
          value={stats.pending}
          icon={<Clock size={15} />}
          accentColor="var(--amber)"
          subtitle={stats.pending > 0 ? "Awaiting action" : undefined}
        />
        <KPICard
          label="Approved"
          value={stats.approved}
          icon={<CheckCircle2 size={15} />}
          accentColor="var(--green)"
          subtitle={stats.total > 0 ? `${approvalRate}% rate` : undefined}
        />
        <KPICard
          label="Open Conflicts"
          value={stats.conflicts}
          icon={<AlertTriangle size={15} />}
          accentColor="var(--red)"
          urgent={stats.conflicts > 0}
        />
      </div>

      {/* ── Project Health Charts (always visible) ── */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div className="charts-strip">
          {/* Health Gauge */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={chartHeaderStyle}>
              <Shield size={13} style={{ color: "var(--text-3)" }} />
              <span>Pipeline Health</span>
            </div>
            <div style={{ width: 140, height: 140, position: "relative", marginBottom: "0.5rem" }}>
              <ResponsiveContainer width="100%" height="100%">
                {/* Full circle with fixed 0-100 scale so the arc reflects the percentage */}
                <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270}
                  barSize={12}
                  data={[{ name: "Health", value: healthScore, fill: healthScore >= 70 ? CHART_COLORS.green : healthScore >= 40 ? CHART_COLORS.amber : CHART_COLORS.red }]}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background={{ fill: "rgba(0,0,0,0.06)" }} dataKey="value" cornerRadius={999} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                <div style={{
                  fontSize: "2rem", fontWeight: 800, fontFamily: "var(--font-outfit)",
                  color: healthScore >= 70 ? CHART_COLORS.green : healthScore >= 40 ? CHART_COLORS.amber : CHART_COLORS.red,
                }}>{healthScore}</div>
                <div style={{ fontSize: "0.5625rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>of 100</div>
              </div>
            </div>
            <Link to="/reports/ai-readiness" style={{ fontSize: "0.6875rem", color: "var(--accent)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem", textDecoration: "none" }}>
              View Full Scorecard <ArrowRight size={10} />
            </Link>
          </div>

          {/* Readiness Distribution Pie Chart */}
          <div>
            <div style={chartHeaderStyle}>
              <Activity size={13} style={{ color: "var(--text-3)" }} />
              <span>Readiness Distribution</span>
            </div>
            <div style={{ height: 160, position: "relative" }}>
              {readiness.total === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "0.8125rem" }}>No data</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Ready", value: readiness.green, fill: CHART_COLORS.green },
                          { name: "Caution", value: readiness.yellow, fill: CHART_COLORS.amber },
                          { name: "Blocked", value: readiness.red, fill: CHART_COLORS.red },
                          { name: "Pending", value: readiness.noRating, fill: "#3d506b" }
                        ].filter(d => d.value > 0)}
                        cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={4} dataKey="value" stroke="none"
                      >
                        {[
                          { value: readiness.green, fill: CHART_COLORS.green },
                          { value: readiness.yellow, fill: CHART_COLORS.amber },
                          { value: readiness.red, fill: CHART_COLORS.red },
                          { value: readiness.noRating, fill: "#3d506b" },
                        ].filter(d => d.value > 0).map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<PremiumTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-0)", lineHeight: 1, fontFamily: "var(--font-outfit)" }}>{readiness.total}</div>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
              {[
                { label: "Ready", value: readiness.green, color: CHART_COLORS.green },
                { label: "Caution", value: readiness.yellow, color: CHART_COLORS.amber },
                { label: "Blocked", value: readiness.red, color: CHART_COLORS.red },
                { label: "Pending", value: readiness.noRating, color: "#3d506b" },
              ].filter(i => i.value > 0).map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.color }} />
                  <span style={{ fontSize: "0.625rem", color: "var(--text-2)", fontWeight: 500 }}>{item.label}</span>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-0)" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RC-1 → RC-6 Breakdown Chart */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={chartHeaderStyle}>
              <TrendingUp size={13} style={{ color: "var(--text-3)" }} />
              <span>Readiness Criteria Breakdown</span>
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rcBreakdown.map(rc => ({
                    name: rc.label,
                    fullLabel: rc.fullLabel,
                    icon: rc.icon,
                    Green: rc.green, Yellow: rc.yellow, Red: rc.red, Unscored: rc.unscored,
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "var(--text-2)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-0)", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={48} />
                  <RechartsTooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} content={<PremiumTooltip />} />
                  <Bar dataKey="Green" stackId="a" fill={CHART_COLORS.green} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Yellow" stackId="a" fill={CHART_COLORS.amber} />
                  <Bar dataKey="Red" stackId="a" fill={CHART_COLORS.red} />
                  <Bar dataKey="Unscored" stackId="a" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Second row: Decision Status + Business Area */}
        <div className="charts-strip" style={{ marginTop: "1.75rem", gridTemplateColumns: "1fr 2fr" }}>
          {/* Decision Status Donut */}
          <div>
            <div style={chartHeaderStyle}>
              <FileText size={13} style={{ color: "var(--text-3)" }} />
              <span>Decision Status</span>
            </div>
            <div style={{ height: 180, position: "relative" }}>
              {statusData.length === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "0.8125rem" }}>No data</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={4} dataKey="value" stroke="none">
                        {statusData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<PremiumTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-0)", lineHeight: 1, fontFamily: "var(--font-outfit)" }}>{stats.total}</div>
                    <div style={{ fontSize: "0.5625rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Total</div>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
              {statusData.map(item => (
                <div key={item.name} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.fill }} />
                  <span style={{ fontSize: "0.625rem", color: "var(--text-2)", fontWeight: 500 }}>{item.name}</span>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-0)" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Decisions by Business Area */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={chartHeaderStyle}>
              <BarChart3 size={13} style={{ color: "var(--text-3)" }} />
              <span>Decisions by Business Area</span>
            </div>
            <div style={{ height: 260 }}>
              {areaData.length === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "0.8125rem" }}>No data</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={areaData} margin={{ top: 4, right: 24, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "var(--text-2)", fontSize: 8 }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={70} />
                    <YAxis tick={{ fill: "var(--text-2)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <RechartsTooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} content={<PremiumTooltip />} />
                    <Bar dataKey="value" name="Decisions" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
         ENTERPRISE REPORTS
         ══════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.0625rem", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Shield size={16} style={{ color: "var(--accent)" }} /> Enterprise AI Reports
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
          <Link to="/reports/comprehensive-audit" className="card" style={{ textDecoration: "none", marginBottom: 0, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", transition: "transform 200ms", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent)" }}><Search size={16} /> <span style={{ fontWeight: 600 }}>Comprehensive Audit</span></div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>Full SaaS platform health and decision-quality review.</div>
          </Link>
          <Link to="/reports/meldeliste" className="card" style={{ textDecoration: "none", marginBottom: 0, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", transition: "transform 200ms", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#4da6ff" }}><FileText size={16} /> <span style={{ fontWeight: 600 }}>Meldeliste</span></div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>Release readiness, data completeness, and approval portfolio.</div>
          </Link>
          <Link to="/reports/colour-mix" className="card" style={{ textDecoration: "none", marginBottom: 0, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", transition: "transform 200ms", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#34d399" }}><Activity size={16} /> <span style={{ fontWeight: 600 }}>Colour-Mix-Chart</span></div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>Visual harmony, clash detection, and aesthetic validation.</div>
          </Link>
          <Link to="/reports/ai-readiness" className="card" style={{ textDecoration: "none", marginBottom: 0, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", transition: "transform 200ms", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#8b5cf6" }}><Shield size={16} /> <span style={{ fontWeight: 600 }}>AI Readiness</span></div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>Pipeline velocity and deterministic scoring metrics.</div>
          </Link>
          <Link to="/reports/supply-chain" className="card" style={{ textDecoration: "none", marginBottom: 0, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", transition: "transform 200ms", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#2dd4bf" }}><TrendingUp size={16} /> <span style={{ fontWeight: 600 }}>Supply Chain</span></div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>Material compliance, risk matrix, and lead times.</div>
          </Link>
          <Link to="/reports/compliance" className="card" style={{ textDecoration: "none", marginBottom: 0, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", transition: "transform 200ms", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#fb923c" }}><FileText size={16} /> <span style={{ fontWeight: 600 }}>Compliance & Audit</span></div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>Full lifecycle traceability and RBAC compliance.</div>
          </Link>
        </div>
      </div>

      {/* ── Two-Column: Recent Decisions + Conflicts ── */}
      <div style={{ display: "grid", gridTemplateColumns: groupedConflicts.length > 0 ? "1.6fr 1fr" : "1fr", gap: "1rem", marginBottom: "1.5rem" }}>

        {/* Recent Decisions */}
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <FileText size={13} style={{ color: "var(--text-3)" }} />
              {role.startsWith("design") ? (
                <h2 style={{ fontSize: "0.8125rem", margin: 0 }}>Recent Decisions</h2>
              ) : (
                <div style={{ display: "flex", gap: "1rem" }}>
                  <button onClick={() => setActiveTab("pool")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.8125rem", fontWeight: activeTab === "pool" ? 700 : 500, color: activeTab === "pool" ? "var(--text-0)" : "var(--text-3)" }}>Open Pool</button>
                  <button onClick={() => setActiveTab("queue")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.8125rem", fontWeight: activeTab === "queue" ? 700 : 500, color: activeTab === "queue" ? "var(--text-0)" : "var(--text-3)" }}>My Queue</button>
                  <button onClick={() => setActiveTab("history")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.8125rem", fontWeight: activeTab === "history" ? 700 : 500, color: activeTab === "history" ? "var(--text-0)" : "var(--text-3)" }}>My History</button>
                </div>
              )}
            </div>
            <Link to="/decisions" style={{ fontSize: "0.6875rem", color: "var(--accent)", display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 500 }}>
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Area</th>
                <th>Status</th>
                <th>AI</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {displayedDecisions.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/decisions/${d.id}`)}
                  style={{ cursor: "pointer", transition: "background 150ms" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(77,166,255,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ color: "var(--text-0)", fontWeight: 500 }}>{d.component_name}</td>
                  <td>{d.business_area}</td>
                  <td><span className={`badge ${STATUS_BADGE[d.status] || "badge-neutral"}`}>{d.status.replace(/_/g, " ")}</span></td>
                  <td>
                    {d.ai_rating ? (
                      <span className={`badge ${RATING_BADGE[d.ai_rating] || "badge-neutral"}`} title={d.ai_reason || undefined}>
                        {d.ai_rating === "green" ? "ready" : d.ai_rating === "yellow" ? "caution" : "blocked"}
                      </span>
                    ) : (
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>-</span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-2)", fontSize: "0.75rem" }}>{timeAgo(d.updated_at)}</td>
                </tr>
              ))}
              {displayedDecisions.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-3)" }}>
                    {!role.startsWith("design") && activeTab === "pool" ? "No open decisions right now." :
                      !role.startsWith("design") && activeTab === "queue" ? "Your queue is empty." :
                        !role.startsWith("design") && activeTab === "history" ? "You haven't completed any decisions." :
                          "No decisions found. Create one to get started."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Conflicts Panel */}
        {groupedConflicts.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <AlertTriangle size={13} style={{ color: "var(--red)" }} />
                <h2 style={{ fontSize: "0.8125rem", margin: 0 }}>Conflict Alerts</h2>
                <span className="badge badge-red" style={{ marginLeft: "0.25rem" }}>{stats.conflicts}</span>
              </div>
              <Link to="/decisions/conflicts" style={{ fontSize: "0.6875rem", color: "var(--accent)", display: "flex", alignItems: "center", gap: "0.25rem", fontWeight: 500 }}>
                Resolve <ArrowRight size={11} />
              </Link>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {groupedConflicts.map((group) => {
                const c = group[0];
                return (
                  <div
                    key={c.id}
                    style={{
                      padding: "0.875rem 1.25rem",
                      borderBottom: "1px solid var(--border)",
                      transition: "background 150ms",
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(248,113,113,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.375rem", flexWrap: "wrap" }}>
                      {group.map(gc => (
                        <span key={gc.id} className="badge badge-red" style={{ fontSize: "0.5625rem" }}>{gc.conflict_type.replace(/_/g, " ")}</span>
                      ))}
                      <span style={{ fontSize: "0.625rem", color: "var(--text-3)", marginLeft: "auto" }}>{timeAgo(c.detected_at)}</span>
                    </div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-0)", marginBottom: "0.25rem" }}>
                      {c.decision_a?.component_name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-2)", lineHeight: 1.4 }}>
                      {group.length} conflicting attribute(s) detected.
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Quick Actions ── */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "1rem" }}>
          <Zap size={13} style={{ color: "var(--text-3)" }} />
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Quick Actions</span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link to="/decisions/new" className="btn btn-accent" style={{ textDecoration: "none" }}>New Decision</Link>
          <Link to="/reports/meldeliste" className="btn btn-ghost" style={{ textDecoration: "none" }}>Meldeliste Report</Link>
          <Link to="/reports/colour-mix" className="btn btn-ghost" style={{ textDecoration: "none" }}>Colour-Mix-Chart</Link>
          <Link to="/settings/audit-logs" className="btn btn-ghost" style={{ textDecoration: "none" }}>Activity Log</Link>
        </div>
      </div>
    </div >
  );
}

/* ══════════════════════════════════════════════════════════
   KPI Card - Premium stat display
   ══════════════════════════════════════════════════════════ */

function KPICard({ label, value, icon, accentColor, subtitle, urgent }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accentColor: string;
  subtitle?: string;
  urgent?: boolean;
}) {
  return (
    <div className="card" style={{ marginBottom: 0, padding: "1.125rem 1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "0.6875rem", fontWeight: 500, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
        <div style={{
          width: 28, height: 28, borderRadius: "var(--r-md)",
          background: urgent ? "rgba(248,113,113,0.10)" : "rgba(77,166,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: urgent ? "var(--red)" : "var(--text-3)",
        }}>
          {icon}
        </div>
      </div>
      <div style={{ fontFamily: "var(--font-outfit)", fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.04em", color: accentColor, lineHeight: 1 }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginTop: "0.375rem" }}>{subtitle}</div>
      )}
    </div>
  );
}
