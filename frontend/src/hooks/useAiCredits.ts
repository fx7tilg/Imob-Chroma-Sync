import { useCallback, useEffect, useState } from "react";
import {
  getCachedAiCredits,
  onAiCreditsChanged,
  refreshAiCredits,
  type AiCredits
} from "../lib/aiCredits";

/**
 * Subscribes to the shared AI credit balance.
 *
 * The balance is refreshed from the database on mount and then kept current by
 * the credit headers the AI service returns on every call, so no polling.
 */
export function useAiCredits(): { credits: AiCredits | null; loading: boolean; refresh: () => void } {
  const [credits, setCredits] = useState<AiCredits | null>(getCachedAiCredits);
  const [loading, setLoading] = useState(getCachedAiCredits() === null);

  const refresh = useCallback(() => {
    let active = true;
    setLoading(true);
    refreshAiCredits().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAiCreditsChanged(() => setCredits(getCachedAiCredits()));
    const cancel = refresh();
    return () => {
      unsubscribe();
      cancel();
    };
  }, [refresh]);

  return { credits, loading, refresh };
}
