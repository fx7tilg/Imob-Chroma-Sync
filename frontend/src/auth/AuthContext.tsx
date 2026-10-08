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
}

// Demo card-reader sign-in. It maps a PIN to a seeded account that shares a
// well-known password, so it is only ever enabled for local demos and is
// compiled out unless VITE_ENABLE_DEMO_LOGIN is explicitly set.
const DEMO_LOGIN_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true";

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
    // Skip the profile fetch until Supabase has issued a real session.
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
    signUp: async (email, password, fullName, team, _isProjectLead) => {
      // is_project_lead is deliberately NOT forwarded: handle_new_user() forces
      // it to false so a self-service signup cannot grant itself admin rights.
      // Elevation is done by an existing project lead via the admin screen.
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, team }
        }
      });
      if (error) throw error;
    },
    signInWithPKI: async (pin: string) => {
      if (!DEMO_LOGIN_ENABLED) throw new Error("PKI card sign-in is not available");
      const demoPassword = import.meta.env.VITE_DEMO_PASSWORD;
      if (!demoPassword) throw new Error("PKI card sign-in is not configured");
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
      const { error } = await supabase.auth.signInWithPassword({ email, password: demoPassword });
      if (error) throw new Error("PKI sign-in failed");
    },
    resetPassword: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
    },
    signOut: async () => {
      await supabase.auth.signOut();
    }
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
