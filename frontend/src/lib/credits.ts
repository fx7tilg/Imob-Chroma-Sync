import { supabase } from "./supabase";

export interface CreditCheckResult {
  allowed: boolean;
  remaining: number | null; // null means unlimited (admin)
}

/**
 * Checks if the current user has enough credits for the given feature.
 * If they do, consumes one credit and returns allowed: true.
 * If they don't, returns allowed: false.
 */
export async function checkAndUseCredit(featureKey: string): Promise<CreditCheckResult> {
  try {
    const { data, error } = await supabase.rpc("use_ai_credit", { p_feature_key: featureKey });
    
    if (error) {
      console.error("Credit check failed:", error);
      // Fail-open or fail-closed? In a hackathon, failing open on DB error might be safer, 
      // but let's fail-closed (false) for correct enforcement.
      return { allowed: false, remaining: 0 };
    }

    return data as CreditCheckResult;
  } catch (err) {
    console.error("Credit check exception:", err);
    return { allowed: false, remaining: 0 };
  }
}
