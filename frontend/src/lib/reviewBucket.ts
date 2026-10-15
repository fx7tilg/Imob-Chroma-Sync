import type { Approval, Decision, Team } from "../types/db";

export type ReviewBucket = "queue" | "pool";

const OWNER_COLUMN = {
  engineering: "engineering_owner_id",
  procurement: "procurement_owner_id",
  quality: "quality_owner_id"
} as const;

type OwnerTeam = keyof typeof OWNER_COLUMN;

type ApprovalState = Pick<Approval, "team" | "status">;

// One definition shared by the Open Pool page, the My Queue page and the
// sidebar badges, so a badge can never count rows a page would not list.
export function reviewBucket(
  decision: Pick<Decision, "status" | OwnerColumn>,
  approvals: ApprovalState[],
  team: Team | null,
  userId: string | undefined
): ReviewBucket | null {
  if (!team || !userId || !(team in OWNER_COLUMN)) return null;
  if (decision.status !== "submitted" && decision.status !== "under_review") return null;

  const approved = (t: Team) => approvals.find((a) => a.team === t)?.status === "approved";

  // The chain is Design -> Engineering and Procurement -> Quality.
  if ((team === "engineering" || team === "procurement") && !approved("design")) return null;
  if (team === "quality" && !(approved("engineering") && approved("procurement"))) return null;

  if (approvals.find((a) => a.team === team)?.status !== "pending") return null;

  const owner = decision[OWNER_COLUMN[team as OwnerTeam]];
  if (!owner) return "pool";
  return owner === userId ? "queue" : null;
}

type OwnerColumn = (typeof OWNER_COLUMN)[OwnerTeam];
