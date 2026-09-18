import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { FilterProvider } from "./contexts/FilterContext";
import AppShell from "./components/layout/AppShell";
import ToastContainer from "./components/ui/Toast";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import DashboardHome from "./pages/DashboardHome";
import Dashboard from "./pages/Dashboard";
import DecisionDetail from "./pages/DecisionDetail";
import NewDecision from "./pages/NewDecision";
import OpenPool from "./pages/decisions/OpenPool";
import MyQueue from "./pages/decisions/MyQueue";
import MyHistory from "./pages/decisions/MyHistory";
import MySummaryReport from "./pages/decisions/MySummaryReport";
import Conflicts from "./pages/decisions/Conflicts";
import Meldeliste from "./pages/reports/Meldeliste";
import ColourMixChart from "./pages/reports/ColourMixChart";
import AIReadinessReport from "./pages/reports/AIReadinessReport";
import SupplyChainReport from "./pages/reports/SupplyChainReport";
import ComplianceAuditReport from "./pages/reports/ComplianceAuditReport";
import Profile from "./pages/settings/Profile";
import Rbac from "./pages/settings/Rbac";
import AuditLogs from "./pages/settings/AuditLogs";
import MasterDataAdmin from "./pages/MasterDataAdmin";
import RiskAssessment from "./pages/RiskAssessment";
import DecisionDeepAnalysis from "./pages/DecisionDeepAnalysis";
import ComprehensiveAudit from "./pages/ComprehensiveAudit";

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-0)",
          color: "var(--text-2)"
        }}
      >
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <ToastContainer />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <FilterProvider>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardHome />} />

            {/* My Work */}
            <Route path="/decisions/pool"         element={<OpenPool />} />
            <Route path="/decisions/queue"        element={<MyQueue />} />
            <Route path="/decisions/history"      element={<MyHistory />} />
            <Route path="/decisions/my-summary"   element={<MySummaryReport />} />
            
            {/* Legacy redirects */}
            <Route path="/decisions/mine"         element={<Navigate to="/decisions/history" replace />} />
            <Route path="/decisions/my-approvals" element={<Navigate to="/decisions/history" replace />} />

            {/* Decisions */}
            <Route path="/decisions"              element={<Dashboard />} />
            <Route path="/decisions/conflicts"    element={<Conflicts />} />
            <Route path="/decisions/new"          element={<NewDecision />} />
            <Route path="/decisions/:id"          element={<DecisionDetail />} />
            <Route path="/decisions/:id/deep-analysis" element={<DecisionDeepAnalysis />} />

            {/* Legacy redirects */}
            <Route path="/decisions/review" element={<Navigate to="/decisions/queue" replace />} />

            {/* Reports */}
            <Route path="/reports/meldeliste"  element={<Meldeliste />} />
            <Route path="/reports/colour-mix"  element={<ColourMixChart />} />
            <Route path="/reports/ai-readiness" element={<AIReadinessReport />} />
            <Route path="/reports/supply-chain" element={<SupplyChainReport />} />
            <Route path="/reports/compliance"   element={<ComplianceAuditReport />} />
            <Route path="/reports/risk-assessment" element={<RiskAssessment />} />
            <Route path="/reports/comprehensive-audit" element={<ComprehensiveAudit />} />

            {/* Settings */}
            <Route path="/settings/profile"    element={<Profile />} />
            <Route path="/settings/rbac"       element={<Rbac />} />
            <Route path="/settings/audit-logs" element={<AuditLogs />} />
            <Route path="/settings/mdm"        element={<MasterDataAdmin />} />


            {/* Legacy alias */}
            <Route path="/new" element={<Navigate to="/decisions/new" replace />} />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </FilterProvider>
    </>
  );
}
