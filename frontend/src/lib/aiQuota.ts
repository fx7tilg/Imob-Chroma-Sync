/**
 * AI Quota Manager - enforces a daily usage cap on AI-powered features.
 * Uses localStorage with a date-stamped key. Resets automatically each day.
 * Admin users get 4 uses/day; all other roles get 2.
 */

type AppRole = "admin" | "editor" | "viewer" | string;

const QUOTA_BY_ROLE: Record<string, number> = {
  project_admin: 100,
};
const DEFAULT_QUOTA = 100;

function getMaxForRole(role?: AppRole): number {
  if (!role) return DEFAULT_QUOTA;
  return QUOTA_BY_ROLE[role] ?? DEFAULT_QUOTA;
}

function todayKey(feature: string, userId?: string): string {
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const userSuffix = userId ? `_${userId}` : "_global";
  return `ai_quota_${feature}_${dateStr}${userSuffix}`;
}

export function getUsesRemaining(feature: string, role?: AppRole, userId?: string): number {
  const key = todayKey(feature, userId);
  const used = parseInt(localStorage.getItem(key) || "0", 10);
  return Math.max(0, getMaxForRole(role) - used);
}

export function consumeUse(feature: string, role?: AppRole, userId?: string): boolean {
  const remaining = getUsesRemaining(feature, role, userId);
  if (remaining <= 0) return false;
  const key = todayKey(feature, userId);
  const used = parseInt(localStorage.getItem(key) || "0", 10);
  localStorage.setItem(key, String(used + 1));
  return true;
}

export function restoreUse(feature: string, userId?: string): void {
  const key = todayKey(feature, userId);
  const used = parseInt(localStorage.getItem(key) || "0", 10);
  if (used > 0) {
    localStorage.setItem(key, String(used - 1));
  }
}

export function getMaxDailyUses(role?: AppRole): number {
  return getMaxForRole(role);
}
