import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, User, UserCog, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import DateFilterDropdown from "../ui/DateFilterDropdown";
import { ROLE_LABELS } from "../../utils/permissions";
import styles from "./layout.module.css";
import { supabase } from "../../lib/supabase";
import AiGuideModal from "../AiGuideModal";
import WorkflowGuideModal from "../WorkflowGuideModal";
import RCReferenceModal from "../RCReferenceModal";
import AiDecisionIntelModal from "../AiDecisionIntelModal";
import SearchPalette from "../SearchPalette";

interface AppNotification {
  id: string;
  title: string;
  description: string;
  type: "info" | "warning" | "success" | "critical";
  link?: string;
  is_read: boolean;
  created_at: string;
}

const TYPE_COLORS: Record<AppNotification["type"], string> = {
  info: "var(--blue)",
  warning: "var(--amber)",
  success: "var(--green)",
  critical: "var(--red)"
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function initials(name?: string | null) {
  if (!name) return "??";
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Header() {
  const navigate = useNavigate();
  const { profile, role, session, signOut } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showAiGuide, setShowAiGuide] = useState(false);
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(false);
  const [showRCRef, setShowRCRef] = useState(false);
  const [showAiDecisionIntel, setShowAiDecisionIntel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadNotifications() {
      const dismissed = new Set<string>(JSON.parse(localStorage.getItem("chroma-notif-dismissed") || "[]"));
      const readIds = new Set<string>(JSON.parse(localStorage.getItem("chroma-notif-read") || "[]"));
      const { data } = await supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(100);
      if (data) {
        const mapped: AppNotification[] = data
          .filter(r => !dismissed.has(r.id.toString()))
          .map(r => {
          let title = `Record ${r.action}`;
          let description = `A record in ${r.table_name} was modified.`;
          let type: "info" | "warning" | "success" | "critical" = "info";
          let link = "/settings/audit-logs";

          if (r.table_name === "decisions") {
            if (r.action === "INSERT") {
              title = "New Decision Created";
              description = "A new decision draft was started.";
              type = "success";
            } else if (r.action === "UPDATE") {
              title = "Decision Updated";
              description = "Properties on a decision were modified.";
              type = "warning";
            }
            link = `/decisions/${r.row_id}`;
          } else if (r.table_name === "approvals") {
            title = "Approval Activity";
            description = "A team has voted on a decision.";
            type = "info";
          } else if (r.table_name === "conflicts") {
            title = "AI Conflict Alert";
            description = "The AI detected a conflict in the database.";
            type = "critical";
            link = "/decisions/conflicts";
          }

          return {
            id: r.id.toString(),
            title,
            description,
            type,
            link,
            is_read: readIds.has(r.id.toString()),
            created_at: r.changed_at
          };
        });
        setNotifications(mapped);
      }
    }
    loadNotifications();

    const channel = supabase.channel("notifications-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_log" }, () => loadNotifications())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const persistRead = (ids: string[]) => {
    const existing = new Set<string>(JSON.parse(localStorage.getItem("chroma-notif-read") || "[]"));
    ids.forEach((id) => existing.add(id));
    localStorage.setItem("chroma-notif-read", JSON.stringify([...existing]));
  };

  const handleNotifClick = (n: AppNotification) => {
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    persistRead([n.id]);
    setNotifOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    persistRead(notifications.map((n) => n.id));
  };

  const dismissNotification = (id: string) => {
    const dismissed = new Set<string>(JSON.parse(localStorage.getItem("chroma-notif-dismissed") || "[]"));
    dismissed.add(id);
    localStorage.setItem("chroma-notif-dismissed", JSON.stringify([...dismissed]));
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAllNotifications = () => {
    const dismissed = new Set<string>(JSON.parse(localStorage.getItem("chroma-notif-dismissed") || "[]"));
    notifications.forEach((n) => dismissed.add(n.id));
    localStorage.setItem("chroma-notif-dismissed", JSON.stringify([...dismissed]));
    setNotifications([]);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const displayName = profile?.full_name ?? session?.user?.email ?? "User";

  return (
    <div className={styles.topbar} style={{ width: "100%" }}>
      <div className={styles.topbarLeft}>
        <DateFilterDropdown />
      </div>

      <div className={styles.topbarCenter}>
        <button 
          className={styles.topbarLink} 
          onClick={() => setShowWorkflowGuide(true)} 
          title="Learn about the approval workflow & versioning"
        >
           Workflow Rules
        </button>

        <button 
          className={styles.topbarLink} 
          onClick={() => setShowAiGuide(true)} 
          title="Learn how the AI observer works"
        >
           How AI Works
        </button>

        <button 
          className={styles.topbarLink} 
          onClick={() => setShowRCRef(true)} 
          title="View all 6 Readiness Criteria and their thresholds"
        >
           RC Guide
        </button>

        <button 
          className={styles.topbarLink} 
          onClick={() => setShowAiDecisionIntel(true)} 
          title="Learn how AI protects every decision"
        >
           AI Decision Intel
        </button>
      </div>

      <div className={styles.topbarRight}>
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            className={styles.iconBtn}
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
          >
            <span style={{ fontSize: "18px", lineHeight: 1 }} aria-hidden="true">🔔</span>
            {unreadCount > 0 && <span className={styles.notifDot} />}
          </button>

          {notifOpen && (
            <div className={`${styles.dropdown} ${styles.dropdownWide}`}>
              <div className={styles.dropdownHeader}>
                <span className={styles.dropdownHeaderLabel}>Notifications</span>
                {unreadCount > 0 && <span className="badge badge-accent">{unreadCount} new</span>}
              </div>
              <div className={styles.notifList}>
                {notifications.length === 0 ? (
                  <div className={styles.notifEmpty}>You're all caught up.</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`${styles.notifItem} ${!n.is_read ? styles.unread : ""}`}
                      onClick={() => handleNotifClick(n)}
                    >
                      <div
                        className={styles.notifDotIndicator}
                        style={{ background: TYPE_COLORS[n.type] }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={`${styles.notifTitle} ${!n.is_read ? styles.unread : ""}`}>
                          {n.title}
                        </div>
                        <div className={styles.notifDesc}>{n.description}</div>
                        <div className={styles.notifTime}>{timeAgo(n.created_at)}</div>
                      </div>
                      <button
                        aria-label="Delete notification"
                        title="Delete"
                        onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-1)",
                          cursor: "pointer",
                          padding: "2px 4px",
                          fontSize: "14px",
                          lineHeight: 1,
                          flexShrink: 0,
                          alignSelf: "flex-start",
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className={styles.dropdownFooter}>
                <button className={styles.dropdownLink} onClick={markAllRead}>
                  Mark all read
                </button>
                {notifications.length > 0 && (
                  <button className={styles.dropdownLink} onClick={clearAllNotifications}>
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={profileRef} style={{ position: "relative" }}>
          <div className={styles.profileBlock} onClick={() => setProfileOpen((v) => !v)}>
            <div className={styles.avatar}>{initials(displayName)}</div>
            <div className={styles.profileMeta}>
              <span className={styles.profileName}>{displayName}</span>
              <span className={styles.profileRole}>{ROLE_LABELS[role]}</span>
            </div>
            <ChevronDown size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
          </div>

          {profileOpen && (
            <div className={styles.dropdown}>
              <Link
                to="/settings/profile"
                className={styles.dropdownItem}
                onClick={() => setProfileOpen(false)}
              >
                <User size={14} /> Profile & Settings
              </Link>
              <Link
                to="/settings/rbac"
                className={styles.dropdownItem}
                onClick={() => setProfileOpen(false)}
              >
                <UserCog size={14} /> Team & Roles
              </Link>
              <div className={styles.dropdownSep} />
              <button
                className={`${styles.dropdownItem} ${styles.danger}`}
                onClick={handleSignOut}
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <AiGuideModal isOpen={showAiGuide} onClose={() => setShowAiGuide(false)} />
      <WorkflowGuideModal isOpen={showWorkflowGuide} onClose={() => setShowWorkflowGuide(false)} />
      <RCReferenceModal isOpen={showRCRef} onClose={() => setShowRCRef(false)} />
      <AiDecisionIntelModal isOpen={showAiDecisionIntel} onClose={() => setShowAiDecisionIntel(false)} />
      <SearchPalette isOpen={showSearch} onClose={() => setShowSearch(false)} />
    </div>
  );
}
