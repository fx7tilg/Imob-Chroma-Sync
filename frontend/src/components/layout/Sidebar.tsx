import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Palette,
  Inbox,
  History,
  AlertTriangle,
  FileText,
  BarChart3,
  User,
  UserCog,
  Database,
  Sun,
  Moon,
  Shield,
  Package,
  ClipboardCheck
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { PermissionKey } from "../../utils/permissions";
import { supabase } from "../../lib/supabase";
import LogoMark from "../../components/LogoMark";
import styles from "./layout.module.css";

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  requiredPermission?: PermissionKey;
  /** Only show for these teams. Empty = show for all. */
  teamFilter?: string[];
  /** Live badge count key */
  badgeKey?: string;
  /** Hide for these specific profile roles */
  hideForRole?: string[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, requiredPermission: "dashboard.view" }
    ]
  },
  {
    label: "Decisions",
    items: [
      { name: "All Decisions", href: "/decisions", icon: Palette, requiredPermission: "decision.read" },
      { name: "Conflicts", href: "/decisions/conflicts", icon: AlertTriangle, requiredPermission: "decision.read", badgeKey: "conflicts" }
    ]
  },
  {
    label: "My Work",
    items: [
      { name: "Open Pool", href: "/decisions/pool", icon: Database, requiredPermission: "approval.submit", teamFilter: ["engineering", "procurement", "quality"], badgeKey: "pool", hideForRole: ["approver"] },
      { name: "My Queue", href: "/decisions/queue", icon: Inbox, requiredPermission: "approval.submit", teamFilter: ["engineering", "procurement", "quality"], badgeKey: "queue", hideForRole: ["approver"] },
      { name: "My History", href: "/decisions/history", icon: History, requiredPermission: "approval.submit" }
    ]
  },
  {
    label: "Reports",
    items: [
      { name: "Meldeliste", href: "/reports/meldeliste", icon: FileText, requiredPermission: "reports.view" },
      { name: "Colour-Mix-Chart", href: "/reports/colour-mix", icon: BarChart3, requiredPermission: "reports.view" },
      { name: "AI Readiness", href: "/reports/ai-readiness", icon: Shield, requiredPermission: "reports.view" },
      { name: "Supply Chain", href: "/reports/supply-chain", icon: Package, requiredPermission: "reports.view" },
      { name: "Compliance Audit", href: "/reports/compliance", icon: ClipboardCheck, requiredPermission: "reports.view" }
    ]
  },
  {
    label: "Settings",
    items: [
      { name: "Profile", href: "/settings/profile", icon: User },
      { name: "Team & Roles", href: "/settings/rbac", icon: UserCog, requiredPermission: "users.manage" },
      { name: "Master Data", href: "/settings/mdm", icon: Database, requiredPermission: "settings.manage" },
      { name: "Activity Log", href: "/settings/audit-logs", icon: FileText, requiredPermission: "audit.read" }
    ]
  }
];

export default function Sidebar() {
  const { hasPermission, profile } = useAuth();
  const location = useLocation();
  const [pinned, setPinned] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [badges, setBadges] = useState<Record<string, number>>({});

  const userTeam = profile?.team ?? null;
  const isLead = profile?.is_project_lead ?? false;

  useEffect(() => {
    const savedTheme = (localStorage.getItem("chroma-theme") as "dark" | "light") || "light";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
    setPinned(localStorage.getItem("chroma-sidebar-pinned") === "true");
  }, []);

  // Live badge counts
  useEffect(() => {
    if (!userTeam && !isLead) return;

    async function loadBadges() {
      const counts: Record<string, number> = {};

      // Queue count and Pool count
      if (userTeam && profile?.id) {
        const ownerColumn = userTeam === "engineering" ? "engineering_owner_id" : 
                            userTeam === "procurement" ? "procurement_owner_id" : 
                            userTeam === "quality" ? "quality_owner_id" : null;

        if (ownerColumn) {
          // My Queue (owned by me)
          const { data: queueData } = await supabase
            .from("approvals")
            .select(`decision_id, decisions!inner(status, ${ownerColumn})`)
            .eq("team", userTeam)
            .eq("status", "pending")
            .eq(`decisions.${ownerColumn}`, profile.id)
            .in("decisions.status" as any, ["submitted", "under_review"]);
          counts.queue = queueData?.length ?? 0;

          // Open Pool (no owner yet)
          const { data: poolData } = await supabase
            .from("approvals")
            .select(`decision_id, decisions!inner(status, ${ownerColumn})`)
            .eq("team", userTeam)
            .eq("status", "pending")
            .is(`decisions.${ownerColumn}`, null)
            .in("decisions.status" as any, ["submitted", "under_review"]);
          counts.pool = poolData?.length ?? 0;
        }
      }

      // Conflicts count
      const { data: conflictsData } = await supabase
        .from("conflicts")
        .select("decision_a_id, decision_b_id")
        .eq("resolved", false);
      
      if (conflictsData) {
        const uniquePairs = new Set(conflictsData.map(c => [c.decision_a_id, c.decision_b_id].sort().join('::'))).size;
        counts.conflicts = uniquePairs;
      } else {
        counts.conflicts = 0;
      }

      setBadges(counts);
    }

    loadBadges();

    const channel = supabase
      .channel("sidebar-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => loadBadges())
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => loadBadges())
      .on("postgres_changes", { event: "*", schema: "public", table: "conflicts" }, () => loadBadges())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userTeam, isLead]);

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    localStorage.setItem("chroma-sidebar-pinned", String(next));
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("chroma-theme", next);
  };

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + "/");

  return (
    <aside className={`${styles.sidebar} ${pinned ? styles.pinned : ""}`}>
      <div className={styles.sidebarHeader}>
        <Link to="/dashboard" className={styles.sidebarLogo}>
          <div className={styles.logoMark} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogoMark size={22} />
          </div>
          <div className={styles.logoTextWrapper}>
            <span className={styles.logoText}>Chroma Sync</span>
            <span className={styles.logoSub}>A Group Product</span>
          </div>
        </Link>
        <button
          className={`${styles.pinBtn} ${pinned ? styles.active : ""}`}
          onClick={togglePin}
          aria-label={pinned ? "Unpin sidebar" : "Pin sidebar"}
          title={pinned ? "Unpin sidebar" : "Pin sidebar"}
        >
          {pinned ? <span style={{ fontSize: "14px", lineHeight: 1 }} aria-hidden="true">📍</span> : <span style={{ fontSize: "14px", lineHeight: 1 }} aria-hidden="true">📌</span>}
        </button>
      </div>

      <nav className={styles.sidebarNav}>
        {SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => {
            // Permission check
            if (item.requiredPermission && !hasPermission(item.requiredPermission)) return false;
            // Role hide check
            if (item.hideForRole && profile?.role && item.hideForRole.includes(profile.role)) return false;
            // Team filter: strictly enforce. Admins don't bypass this if they don't belong to the team.
            if (item.teamFilter && item.teamFilter.length > 0) {
              if (!userTeam || !item.teamFilter.includes(userTeam)) return false;
            }
            return true;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label} className={styles.section}>
              <div className={styles.sectionLabel}>{section.label}</div>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`${styles.navLink} ${active ? styles.active : ""}`}
                  >
                    <span className={styles.navIcon}>
                      <Icon size={16} />
                    </span>
                    <span className={styles.navLinkLabel}>
                      {item.name}
                      {badgeCount > 0 && (
                        <span style={{
                          marginLeft: "0.375rem",
                          background: item.badgeKey === "conflicts" ? "var(--red)" : "var(--amber)",
                          color: "#fff",
                          fontSize: "0.5625rem",
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: "var(--r-full)",
                          minWidth: 16,
                          textAlign: "center",
                          display: "inline-block"
                        }}>
                          {badgeCount}
                        </span>
                      )}
                    </span>
                    <span className={styles.tooltip}>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className={styles.sidebarFooter}>
        <button
          onClick={toggleTheme}
          className={styles.navLink}
          aria-label="Toggle theme"
        >
          <span className={styles.navIcon}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </span>
          <span className={styles.navLinkLabel}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </span>
          <span className={styles.tooltip}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </span>
        </button>
      </div>
    </aside>
  );
}
