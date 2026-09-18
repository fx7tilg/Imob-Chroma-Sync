import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, AlertTriangle, Shield, CheckCircle2, TrendingUp, Download, Play } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthContext";
import LogoMark from "../../components/LogoMark";
import type { Decision } from "../../types/db";
import { checkAndUseCredit } from "../../lib/credits";

const AI_API = import.meta.env.VITE_AI_API_URL || "http://localhost:8000";

interface MySummaryData {
  overall_summary: string;
  best_decision: {
    component: string;
    explanation: string;
  } | null;
  worst_decision: {
    component: string;
    explanation: string;
  } | null;
  recommendations: string[];
}

export default function MySummaryReport() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [report, setReport] = useState<MySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDecisions() {
      if (!profile?.id) return;
      const { data } = await supabase.from("decisions").select("*").neq("status", "draft").order("updated_at", { ascending: false });
      if (data) {
        // filter down to my history
        const history: Decision[] = [];
        const { data: apps } = await supabase.from("approvals").select("*");
        for (const d of data) {
          let ownerId = null;
          if (role.startsWith("engineering")) ownerId = d.engineering_owner_id;
          if (role.startsWith("procurement")) ownerId = d.procurement_owner_id;
          if (role.startsWith("quality")) ownerId = d.quality_owner_id;

          const teamApproval = apps?.find(a => a.decision_id === d.id && role.startsWith(a.team));
          const hasSubmitted = teamApproval && teamApproval.status !== "pending";

          if (hasSubmitted && ownerId === profile.id) history.push(d as Decision);
          else if (ownerId === profile.id) history.push(d as Decision); // Include my queue in my performance too? 
          // Wait, the previous MyHistory was showing submissions. Let's just use what they are owners of or submitted.
        }
        
        // Actually, let's just get everything where created_by or submitted_by is me, or I'm owner.
        // To be safe, just use the same logic as MyHistory:
        const mySubmissions = data.filter(d => {
            let ownerId = null;
            if (role.startsWith("engineering")) ownerId = d.engineering_owner_id;
            if (role.startsWith("procurement")) ownerId = d.procurement_owner_id;
            if (role.startsWith("quality")) ownerId = d.quality_owner_id;
            
            const teamApproval = apps?.find(a => a.decision_id === d.id && role.startsWith(a.team));
            const hasSubmitted = teamApproval && teamApproval.status !== "pending";
            return hasSubmitted && ownerId === profile.id;
        });
        setDecisions(mySubmissions as Decision[]);
      }
      setLoading(false);
    }
    loadDecisions();
  }, [profile, role]);

  async function handleRunNew() {
    if (decisions.length === 0) return;
    
    const { allowed } = await checkAndUseCredit("my_summary");
    if (!allowed) {
      setError(`You have exhausted your credits for this feature today.`);
      return;
    }

    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${AI_API}/my-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      
      if (!res.ok) throw new Error("Failed to generate summary");
      
      const data = await res.json();
      setReport(data.summary_json);
    } catch (e: any) {
      setError(e.message || "Failed to generate report.");
    } finally {
      setRunning(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="risk-assessment-page" style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "4rem" }}>
      <div className="no-print" style={{ marginBottom: "2rem" }}>
        <button 
          onClick={() => navigate(-1)} 
          className="btn btn-ghost" 
          style={{ display: "inline-flex", gap: "0.5rem", color: "var(--text-2)", paddingLeft: 0 }}
        >
          <ArrowLeft size={16} /> Back to Decisions
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: 0 }}>
            <Sparkles className="text-accent" size={28} /> My Performance Summary
          </h1>
          <p style={{ margin: "0.5rem 0 0 0", color: "var(--text-1)" }}>
            AI Analysis of your decision history and workflow patterns.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }} className="no-print">
          <button className="btn btn-secondary" onClick={handlePrint} disabled={!report || running}>
            <Download size={14} /> Download PDF
          </button>
          <button className="btn btn-accent" onClick={handleRunNew} disabled={running || decisions.length === 0}>
            {running ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Play size={14} />}
            Generate Analysis
          </button>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "var(--red-light)", color: "var(--red)", marginBottom: "2rem" }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {running && (
        <div style={{ 
          background: "var(--bg-1)", padding: "3rem", borderRadius: "var(--r-lg)", 
          border: "1px solid var(--border)", textAlign: "center", marginBottom: "2rem" 
        }}>
          <div className="ai-core-loader" style={{ margin: "0 auto 1.5rem auto" }}>
            <div className="ai-core-ring" />
            <div className="ai-core-ring-inner" />
            <div className="ai-core-icon"><LogoMark size={32} /></div>
          </div>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-0)" }}>Generating AI Performance Snapshot...</h3>
          <p style={{ margin: 0, color: "var(--text-2)", fontSize: "0.875rem" }}>
            Analyzing {decisions.length} decisions → Formatting intelligence
          </p>
        </div>
      )}

      {!report && !running ? (
        <div style={{ 
          background: "var(--bg-1)", padding: "4rem 2rem", borderRadius: "var(--r-lg)", 
          border: "1px dashed var(--border)", textAlign: "center" 
        }}>
          <Sparkles size={48} style={{ color: "var(--text-3)", margin: "0 auto 1rem auto" }} />
          <h3>No Summary Generated</h3>
          <p style={{ color: "var(--text-2)", maxWidth: 500, margin: "0 auto 1.5rem auto" }}>
            Run the generator to receive an elite AI analysis of your workflow.
          </p>
          <button className="btn btn-accent" onClick={handleRunNew} disabled={decisions.length === 0}>
            Generate Now
          </button>
        </div>
      ) : report && !running ? (
        <div className="report-content" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          <div className="card" style={{ padding: "2rem", borderTop: "4px solid var(--accent)" }}>
            <h2 style={{ fontSize: "1.25rem", margin: "0 0 1rem 0", color: "var(--text-0)" }}>Overall Summary</h2>
            <div className="prose" style={{ color: "var(--text-1)", fontSize: "0.9375rem" }}>
              <ReactMarkdown>{report.overall_summary}</ReactMarkdown>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <div className="card" style={{ padding: "2rem", borderTop: "4px solid var(--green)" }}>
              <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem 0", color: "var(--green)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={18} /> Best Decision
              </h2>
              {report.best_decision ? (
                <>
                  <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-0)", marginBottom: "1rem" }}>
                    {report.best_decision.component}
                  </div>
                  <div className="prose" style={{ color: "var(--text-1)", fontSize: "0.875rem" }}>
                    <ReactMarkdown>{report.best_decision.explanation}</ReactMarkdown>
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--text-3)", fontSize: "0.875rem", fontStyle: "italic" }}>No best decision identified.</div>
              )}
            </div>

            <div className="card" style={{ padding: "2rem", borderTop: "4px solid var(--red)" }}>
              <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem 0", color: "var(--red)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={18} /> Worst Decision
              </h2>
              {report.worst_decision ? (
                <>
                  <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-0)", marginBottom: "1rem" }}>
                    {report.worst_decision.component}
                  </div>
                  <div className="prose" style={{ color: "var(--text-1)", fontSize: "0.875rem" }}>
                    <ReactMarkdown>{report.worst_decision.explanation}</ReactMarkdown>
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--text-3)", fontSize: "0.875rem", fontStyle: "italic" }}>No worst decision identified.</div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: "2rem" }}>
            <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem 0", color: "var(--text-0)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TrendingUp size={18} style={{ color: "var(--accent)" }} /> Recommendations
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {(report.recommendations || []).map((rec, i) => (
                <div key={i} style={{ 
                  display: "flex", gap: "1rem", padding: "1.25rem", 
                  background: "var(--surface)", borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)"
                }}>
                  <div style={{ 
                    width: 24, height: 24, borderRadius: "50%", 
                    background: "rgba(77,166,255,0.1)", color: "var(--accent)", 
                    display: "flex", alignItems: "center", justifyContent: "center", 
                    fontSize: "0.75rem", fontWeight: 700, flexShrink: 0
                  }}>
                    {i + 1}
                  </div>
                  <div className="prose" style={{ color: "var(--text-1)", fontSize: "0.9375rem", marginTop: "0.125rem" }}>
                    <ReactMarkdown>{rec}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {(!report.recommendations || report.recommendations.length === 0) && (
                <div style={{ color: "var(--text-3)", fontSize: "0.875rem", fontStyle: "italic" }}>
                  No recommendations provided.
                </div>
              )}
            </div>
          </div>

        </div>
      ) : null}
    </div>
  );
}
