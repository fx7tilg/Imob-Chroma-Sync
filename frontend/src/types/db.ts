export type Team = "design" | "engineering" | "procurement" | "quality";
export type DecisionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type AiRating = "green" | "yellow" | "red";
export type ProfileRole = "editor" | "approver" | "viewer";
export type MaterialLifecycle = "active" | "deprecated";
export type MaterialCompliance = "pass" | "pending" | "fail";
export type MaterialFinish = "gloss" | "matte" | "satin" | "grained" | "brushed";
export type MaterialType =
  | "leather"
  | "tpo_plastic"
  | "fabric"
  | "chrome"
  | "veneer"
  | "alcantara"
  | "woven_fabric"
  | "wood_veneer";
export type VredRenderStatus = "rendered" | "pending";
export type VredVisualMatch = "match" | "mismatch";
export type RiskAssessmentStatus = "running" | "completed" | "failed";

export type RiskAssessment = {
  id: string;
  created_at: string;
  created_by: string;
  snapshot_hash: string;
  decisions_snapshot: any; // Type as needed, jsonb in db
  deterministic_signals: any;
  top_5_risks: any;
  executive_summary: string | null;
  all_risks: any;
  cross_team_impact: any;
  status: RiskAssessmentStatus;
  error_message: string | null;
};

export type DecisionDeepAnalysis = {
  id: string;
  decision_id: string;
  decision_version: number;
  created_at: string;
  created_by: string;
  snapshot_hash: string;
  content: any; // The deeply structured JSON analysis
  status: RiskAssessmentStatus;
  error_message: string | null;
};

export type ComprehensiveAudit = {
  id: string;
  created_at: string;
  created_by: string;
  snapshot_hash: string;
  content: any; // The deeply structured JSON analysis
  status: RiskAssessmentStatus;
  error_message: string | null;
};

export type EnterpriseReportType = "meldeliste" | "colour_mix" | "ai_readiness" | "supply_chain" | "compliance";

export type EnterpriseReport = {
  id: string;
  created_at: string;
  created_by: string;
  report_type: EnterpriseReportType;
  snapshot_hash: string;
  content: any; // The structured JSON analysis
  status: RiskAssessmentStatus;
  error_message: string | null;
};

export type DocumentMeta = {
  url: string;
  type: string;
  name: string;
};

// NOTE: these are `type` aliases, not `interface`s. Interfaces do not get
// TypeScript's implicit index signature, so they fail the `Record<string,
// unknown>` structural check that postgrest-js's `GenericTable` constraint
// requires - which silently collapses every Supabase query to `never`.
export type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  team: Team | null;
  is_project_lead: boolean;
  role: ProfileRole;
  created_at: string;
};

export type Material = {
  code: string;
  display_name: string;
  gloss: number | null;
  substrate: string | null;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  compatibility_notes: string | null;
  vred_render_url: string | null;
  linked_colour_code: string | null;
  lifecycle_status: MaterialLifecycle | null;
  compliance_status: MaterialCompliance | null;
  lead_time_weeks: number | null;
  finish: MaterialFinish | null;
  ral_code: string | null;
  hex_colour: string | null;
  material_type: MaterialType | null;
  supplier_code: string | null;
};

export type Component = {
  id: string;
  name: string;
  zone: string;
  vehicle_program: string;
  created_at: string;
};

export type VredVisualization = {
  id: string;
  component_id: string;
  material_code: string;
  scene_reference: string | null;
  render_status: VredRenderStatus;
  last_rendered: string | null;
  visual_match: VredVisualMatch | null;
  created_at: string;
};

export type RatingCriterion = {
  id: string;
  dimension: string;
  green_rule: string;
  yellow_rule: string | null;
  red_rule: string;
  weight_percent: number;
  created_at: string;
};

export type Decision = {
  id: string;
  component_name: string;
  component_id: string | null;
  business_area: string;
  // Design fields
  model_year: string | null;
  colour_code: string | null;
  material_reference: string | null;
  design_notes: string | null;
  finish_surface: string | null;
  design_status: string | null;
  // Design requirement fields (design specifies, engineering validates)
  required_temp_min_c: number | null;
  required_temp_max_c: number | null;
  uv_weathering_required: string | null;
  chemical_resistance_required: string | null;
  // Engineering fields
  feasibility_status: string | null;
  technical_constraints: string | null;
  engineering_part_number: string | null;
  material_specification: string | null;
  manufacturing_process: string | null;
  engineering_notes: string | null;
  engineering_decision: string | null;
  engineering_owner_id: string | null;
  // Engineering validation of design requirements
  temp_validation_status: string | null;
  temp_validation_notes: string | null;
  uv_validation_status: string | null;
  uv_validation_notes: string | null;
  chemical_validation_status: string | null;
  chemical_validation_notes: string | null;
  // Procurement fields
  supplier: string | null;
  lead_time_days: number | null;
  price_per_unit_cents: number | null;
  currency: string | null;
  moq: number | null;
  rfq_reference: string | null;
  supplier_status: string | null;
  procurement_notes: string | null;
  procurement_decision: string | null;
  procurement_owner_id: string | null;
  // Quality fields
  quality_status: string | null;
  inspection_required: boolean | null;
  inspection_result: string | null;
  pass_fail: string | null;
  defect_issue: string | null;
  quality_notes: string | null;
  quality_decision: string | null;
  quality_owner_id: string | null;
  // Workflow
  status: DecisionStatus;
  owner_team: Team;
  // AI
  ai_rating: AiRating | null;
  ai_reason: string | null;
  ai_flags: unknown[];
  ai_last_checked_at: string | null;
  // Per-criterion ratings (RC-1 … RC-6). All null until AI has run.
  rc1_lifecycle: AiRating | null;
  rc2_compliance: AiRating | null;
  rc3_lead_time: AiRating | null;
  rc4_visual: AiRating | null;
  rc5_approval_rbac: AiRating | null;
  rc6_conflict: AiRating | null;
  rc_flags: Record<string, unknown>;
  // External refs
  dima_material_reference: string | null;
  vred_render_url: string | null;
  reference_documents: DocumentMeta[];
  // Metadata
  created_by: string;
  submitted_by: string | null;
  submitted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type Approval = {
  id: string;
  decision_id: string;
  team: Team;
  status: ApprovalStatus;
  approved_by: string | null;
  notes: string | null;
  decided_at: string | null;
  version: number;
  created_at: string;
};

export type ApprovalEvent = {
  id: string;
  decision_id: string;
  version: number;
  team: Team;
  action: string;
  actor_id: string | null;
  notes: string | null;
  created_at: string;
};

export type ConflictResolutionType = 'colour_changed' | 'deviation_accepted' | 'spec_updated' | 'duplicate_removed' | 'other';

export type Conflict = {
  id: string;
  decision_a_id: string;
  decision_b_id: string;
  conflict_type: string;
  explanation: string;
  detected_at: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  assigned_team: Team | null;
  resolution_notes: string | null;
  resolution_type: ConflictResolutionType | null;
};

export type MasterFeasibilityStatus = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterTechnicalConstraint = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterSupplier = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export type MasterBusinessArea = {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type MasterColourCode = {
  code: string;
  name: string;
  hex_preview: string;
  finish: 'solid' | 'metallic' | 'pearl' | 'matte';
  category: 'exterior' | 'interior' | 'universal';
  is_active: boolean;
  created_at: string;
};

export type DecisionSnapshot = {
  id: string;
  decision_id: string;
  version: number;
  status: string;
  snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export type MasterFinish = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterDesignStatus = {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type MasterManufacturingProcess = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterEngineeringDecision = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterProcurementDecision = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterQualityDecision = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterCurrency = {
  code: string;
  label: string;
  symbol: string;
  is_active: boolean;
  created_at: string;
};

export type MasterSupplierStatus = {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type MasterQualityStatus = {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type MasterPassFail = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterUvRequirement = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterChemicalResistance = {
  code: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type MasterValidationStatus = {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

// Minimal shape used by the typed supabase client.
// `Relationships`, `Views`, and `Functions` are required by postgrest-js's
// `GenericSchema`/`GenericTable` constraints - omitting them makes every
// query resolve to `never` instead of the actual row types.
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile>; Relationships: [] };
      materials: { Row: Material; Insert: Partial<Material>; Update: Partial<Material>; Relationships: [] };
      components: { Row: Component; Insert: Partial<Component>; Update: Partial<Component>; Relationships: [] };
      vred_visualizations: { Row: VredVisualization; Insert: Partial<VredVisualization>; Update: Partial<VredVisualization>; Relationships: [] };
      rating_criteria: { Row: RatingCriterion; Insert: Partial<RatingCriterion>; Update: Partial<RatingCriterion>; Relationships: [] };
      decisions: { Row: Decision; Insert: Partial<Decision>; Update: Partial<Decision>; Relationships: [] };
      approvals: { Row: Approval; Insert: Partial<Approval>; Update: Partial<Approval>; Relationships: [] };
      conflicts: { Row: Conflict; Insert: Partial<Conflict>; Update: Partial<Conflict>; Relationships: [] };
      master_feasibility_statuses: { Row: MasterFeasibilityStatus; Insert: Partial<MasterFeasibilityStatus>; Update: Partial<MasterFeasibilityStatus>; Relationships: [] };
      master_technical_constraints: { Row: MasterTechnicalConstraint; Insert: Partial<MasterTechnicalConstraint>; Update: Partial<MasterTechnicalConstraint>; Relationships: [] };
      master_suppliers: { Row: MasterSupplier; Insert: Partial<MasterSupplier>; Update: Partial<MasterSupplier>; Relationships: [] };
      master_business_areas: { Row: MasterBusinessArea; Insert: Partial<MasterBusinessArea>; Update: Partial<MasterBusinessArea>; Relationships: [] };
      master_colour_codes: { Row: MasterColourCode; Insert: Partial<MasterColourCode>; Update: Partial<MasterColourCode>; Relationships: [] };
      master_finishes: { Row: MasterFinish; Insert: Partial<MasterFinish>; Update: Partial<MasterFinish>; Relationships: [] };
      master_design_statuses: { Row: MasterDesignStatus; Insert: Partial<MasterDesignStatus>; Update: Partial<MasterDesignStatus>; Relationships: [] };
      master_manufacturing_processes: { Row: MasterManufacturingProcess; Insert: Partial<MasterManufacturingProcess>; Update: Partial<MasterManufacturingProcess>; Relationships: [] };
      master_engineering_decisions: { Row: MasterEngineeringDecision; Insert: Partial<MasterEngineeringDecision>; Update: Partial<MasterEngineeringDecision>; Relationships: [] };
      master_currencies: { Row: MasterCurrency; Insert: Partial<MasterCurrency>; Update: Partial<MasterCurrency>; Relationships: [] };
      master_supplier_statuses: { Row: MasterSupplierStatus; Insert: Partial<MasterSupplierStatus>; Update: Partial<MasterSupplierStatus>; Relationships: [] };
      master_quality_statuses: { Row: MasterQualityStatus; Insert: Partial<MasterQualityStatus>; Update: Partial<MasterQualityStatus>; Relationships: [] };
      master_pass_fail: { Row: MasterPassFail; Insert: Partial<MasterPassFail>; Update: Partial<MasterPassFail>; Relationships: [] };
      master_uv_requirements: { Row: MasterUvRequirement; Insert: Partial<MasterUvRequirement>; Update: Partial<MasterUvRequirement>; Relationships: [] };
      master_chemical_resistances: { Row: MasterChemicalResistance; Insert: Partial<MasterChemicalResistance>; Update: Partial<MasterChemicalResistance>; Relationships: [] };
      master_validation_statuses: { Row: MasterValidationStatus; Insert: Partial<MasterValidationStatus>; Update: Partial<MasterValidationStatus>; Relationships: [] };
      decision_snapshots: { Row: DecisionSnapshot; Insert: Partial<DecisionSnapshot>; Update: Partial<DecisionSnapshot>; Relationships: [] };
      approval_events: { Row: ApprovalEvent; Insert: Partial<ApprovalEvent>; Update: Partial<ApprovalEvent>; Relationships: [] };
      audit_log: {
        Row: {
          id: number;
          table_name: string;
          row_id: string;
          action: "INSERT" | "UPDATE" | "DELETE" | "DOWNLOAD" | "ROLE_CHANGE";
          changed_by: string | null;
          changed_at: string;
          old_values: any;
          new_values: any;
        };
        Insert: any;
        Update: any;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_ai_readiness: {
        Args: {
          p_decision_id: string;
          p_rating: AiRating;
          p_reason: string;
          p_flags?: unknown;
          // Extended 11-arg overload - supplied together for the 6-criterion scorer.
          p_rc1_lifecycle?: AiRating;
          p_rc2_compliance?: AiRating;
          p_rc3_lead_time?: AiRating;
          p_rc4_visual?: AiRating;
          p_rc5_approval_rbac?: AiRating;
          p_rc6_conflict?: AiRating;
          p_rc_flags?: unknown;
        };
        Returns: void;
      };
      use_ai_credit: {
        Args: {
          p_feature_key: string;
        };
        Returns: { allowed: boolean; remaining: number | null };
      };
    };
  };
};
