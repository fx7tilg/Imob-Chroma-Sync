export type MockRating = "Green" | "Yellow" | "Red";
export type MockStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected";

export interface MockDecision {
  id: string;
  code: string;
  component_name: string;
  business_area: string;
  colour_code: string;
  material_reference: string;
  supplier: string | null;
  lead_time_days: number | null;
  status: MockStatus;
  owner_team: "design" | "engineering" | "procurement" | "quality";
  ai_rating: MockRating;
  ai_reason: string;
  updated_at: string;
  created_by: string;
}

export interface MockConflict {
  id: string;
  decision_a: string;
  decision_b: string;
  business_area: string;
  conflict_type: string;
  explanation: string;
  detected_at: string;
  resolved: boolean;
}

export const MOCK_DECISIONS: MockDecision[] = [
  {
    id: "d-101", code: "CS-101", component_name: "Door Panel A",
    business_area: "Interior Trim", colour_code: "RAL 9005", material_reference: "PP-TD20",
    supplier: "BASF", lead_time_days: 42,
    status: "approved", owner_team: "quality",
    ai_rating: "Green", ai_reason: "All constraints met, substrate compatible.",
    updated_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    created_by: "design@chroma.test"
  },
  {
    id: "d-102", code: "CS-102", component_name: "Steering Column Trim",
    business_area: "Interior Trim", colour_code: "RAL 7016", material_reference: "ABS-HG",
    supplier: "Covestro", lead_time_days: 28,
    status: "under_review", owner_team: "engineering",
    ai_rating: "Yellow", ai_reason: "Gloss level near supplier tolerance boundary.",
    updated_at: new Date(Date.now() - 15 * 60_000).toISOString(),
    created_by: "design@chroma.test"
  },
  {
    id: "d-103", code: "CS-103", component_name: "B-Pillar Trim",
    business_area: "Exterior Trim", colour_code: "RAL 7016", material_reference: "PC-ABS",
    supplier: null, lead_time_days: null,
    status: "submitted", owner_team: "engineering",
    ai_rating: "Red", ai_reason: "Colour code conflicts with 2 other Exterior Trim decisions.",
    updated_at: new Date(Date.now() - 42 * 60_000).toISOString(),
    created_by: "design@chroma.test"
  },
  {
    id: "d-104", code: "CS-104", component_name: "Instrument Cluster Bezel",
    business_area: "Cockpit", colour_code: "RAL 9017", material_reference: "PMMA",
    supplier: "Arkema", lead_time_days: 21,
    status: "approved", owner_team: "quality",
    ai_rating: "Green", ai_reason: "Meets all criteria.",
    updated_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    created_by: "design@chroma.test"
  },
  {
    id: "d-105", code: "CS-105", component_name: "Air Vent Ring",
    business_area: "Cockpit", colour_code: "RAL 9006", material_reference: "PC",
    supplier: "Sabic", lead_time_days: 35,
    status: "under_review", owner_team: "procurement",
    ai_rating: "Yellow", ai_reason: "Supplier lead time exceeds programme target by 5 days.",
    updated_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
    created_by: "design@chroma.test"
  },
  {
    id: "d-106", code: "CS-106", component_name: "Door Handle Insert",
    business_area: "Exterior Trim", colour_code: "RAL 7016", material_reference: "PA6-GF",
    supplier: "LANXESS", lead_time_days: 30,
    status: "submitted", owner_team: "engineering",
    ai_rating: "Red", ai_reason: "Colour code conflicts with 2 other Exterior Trim decisions.",
    updated_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
    created_by: "design@chroma.test"
  },
  {
    id: "d-107", code: "CS-107", component_name: "Roof Rail Cover",
    business_area: "Exterior Trim", colour_code: "RAL 7016", material_reference: "TPO",
    supplier: null, lead_time_days: null,
    status: "draft", owner_team: "design",
    ai_rating: "Yellow", ai_reason: "Awaiting substrate confirmation.",
    updated_at: new Date(Date.now() - 8 * 3600_000).toISOString(),
    created_by: "design@chroma.test"
  },
  {
    id: "d-108", code: "CS-108", component_name: "Rear Bumper Trim",
    business_area: "Exterior Trim", colour_code: "RAL 5013", material_reference: "PP-EPDM",
    supplier: "Borealis", lead_time_days: 40,
    status: "rejected", owner_team: "design",
    ai_rating: "Red", ai_reason: "Colour reference does not match RAL sample from supplier.",
    updated_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
    created_by: "design@chroma.test"
  },
  {
    id: "d-109", code: "CS-109", component_name: "Sun Visor Clip",
    business_area: "Interior Trim", colour_code: "RAL 9010", material_reference: "POM",
    supplier: "DuPont", lead_time_days: 24,
    status: "approved", owner_team: "quality",
    ai_rating: "Green", ai_reason: "All criteria met.",
    updated_at: new Date(Date.now() - 30 * 3600_000).toISOString(),
    created_by: "design@chroma.test"
  },
  {
    id: "d-110", code: "CS-110", component_name: "Grab Handle",
    business_area: "Interior Trim", colour_code: "RAL 9005", material_reference: "TPE",
    supplier: "Kraiburg", lead_time_days: 32,
    status: "approved", owner_team: "quality",
    ai_rating: "Green", ai_reason: "All criteria met.",
    updated_at: new Date(Date.now() - 48 * 3600_000).toISOString(),
    created_by: "design@chroma.test"
  }
];

export const MOCK_CONFLICTS: MockConflict[] = [
  {
    id: "c-1", decision_a: "CS-103", decision_b: "CS-106",
    business_area: "Exterior Trim", conflict_type: "colour_code_duplicate",
    explanation: "Both decisions use RAL 7016 in the same business area with overlapping substrates.",
    detected_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    resolved: false
  },
  {
    id: "c-2", decision_a: "CS-107", decision_b: "CS-103",
    business_area: "Exterior Trim", conflict_type: "colour_code_duplicate",
    explanation: "Both share RAL 7016 with unresolved substrate spec.",
    detected_at: new Date(Date.now() - 90 * 60_000).toISOString(),
    resolved: false
  },
  {
    id: "c-3", decision_a: "CS-101", decision_b: "CS-110",
    business_area: "Interior Trim", conflict_type: "supplier_capacity",
    explanation: "BASF and Kraiburg lead times overlap production window - potential delivery conflict.",
    detected_at: new Date(Date.now() - 8 * 3600_000).toISOString(),
    resolved: true
  }
];

export const RATING_BADGE: Record<MockRating, string> = {
  Green: "badge-green",
  Yellow: "badge-amber",
  Red: "badge-red"
};

export const STATUS_BADGE: Record<MockStatus, string> = {
  draft: "badge-purple",
  submitted: "badge-blue",
  under_review: "badge-amber",
  approved: "badge-green",
  rejected: "badge-red"
};

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
