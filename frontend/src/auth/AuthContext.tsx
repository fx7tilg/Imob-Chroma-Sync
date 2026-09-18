import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile, Team } from "../types/db";
import {
  ROLE_PERMISSIONS,
  roleFromProfile,
  type PermissionKey,
  type RoleKey
} from "../utils/permissions";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  role: RoleKey;
  loading: boolean;
  hasPermission: (perm: PermissionKey) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    team: Team | null,
    isProjectLead: boolean
  ) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithPKI: (pin: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  devBypassLogin: (role: RoleKey) => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    // Skip Supabase fetch for dev-bypass mock sessions.
    if (session.access_token === "mock-token") return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data as Profile | null));
  }, [session]);

  const role = useMemo(() => roleFromProfile(profile), [profile]);

  const hasPermission = useCallback(
    (perm: PermissionKey) => ROLE_PERMISSIONS[role].includes(perm),
    [role]
  );

  const value: AuthState = {
    session,
    profile,
    role,
    loading,
    hasPermission,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async (email, password, fullName, team, isProjectLead) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, team, is_project_lead: isProjectLead }
        }
      });
      if (error) throw error;
    },
    signInWithPKI: async (pin: string) => {
      // Demo PKI card auth: map the card PIN to a seeded account and perform a
      // real password sign-in (all demo users share the password "chroma-demo").
      const PKI_PIN_MAP: Record<string, string> = {
        "1001": "design.editor@chroma.test",
        "1002": "design.approver@chroma.test",
        "1003": "design.viewer@chroma.test",
        "1004": "engineering.editor@chroma.test",
        "1005": "engineering.approver@chroma.test",
        "1006": "engineering.viewer@chroma.test",
        "1007": "procurement.editor@chroma.test",
        "1008": "procurement.approver@chroma.test",
        "1009": "procurement.viewer@chroma.test",
        "1010": "quality.editor@chroma.test",
        "1011": "quality.approver@chroma.test",
        "1012": "quality.viewer@chroma.test",
        "9999": "admin@chroma.test",
        "0000": "viewer@chroma.test",
      };
      const email = PKI_PIN_MAP[pin.trim()];
      if (!email) throw new Error("Invalid PKI card PIN");
      const { error } = await supabase.auth.signInWithPassword({ email, password: "chroma-demo" });
      if (error) throw new Error("PKI sign-in failed: " + error.message);
    },
    resetPassword: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
    },
    signOut: async () => {
      if (session?.access_token === "mock-token") {
        setSession(null);
        setProfile(null);
        return;
      }
      await supabase.auth.signOut();
    },
    devBypassLogin: (roleKey: RoleKey) => {
      const mockId = "dev-" + Math.random().toString(36).substring(2, 11);
      const isLead = roleKey === "project_admin";
      let team: Team | null = null;
      let roleStr: any = "viewer";
      if (roleKey === "project_admin") {
        roleStr = "editor";
      } else if ((roleKey as string) !== "viewer") {
        const parts = roleKey.split("_");
        team = parts[0] as Team;
        roleStr = parts[1];
      }
      const mockSession = {
        user: { id: mockId, email: `${roleKey}@chroma.test` },
        access_token: "mock-token",
        token_type: "bearer"
      } as unknown as Session;
      setSession(mockSession);
      setProfile({
        id: mockId,
        email: `${roleKey}@chroma.test`,
        full_name: `Dev ${roleKey.charAt(0).toUpperCase() + roleKey.slice(1).replace("_", " ")}`,
        team,
        is_project_lead: isLead,
        role: roleStr,
        created_at: new Date().toISOString()
      });
    }
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
