import { Children, useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import type {
  Decision, Team, Material, DocumentMeta, Approval,
  MasterFeasibilityStatus, MasterTechnicalConstraint, MasterSupplier,
  MasterFinish, MasterDesignStatus, MasterManufacturingProcess,
  MasterCurrency, MasterSupplierStatus,
  MasterQualityStatus, MasterPassFail,
  MasterUvRequirement, MasterChemicalResistance, MasterValidationStatus
} from "../types/db";
import SearchableSelect from "./ui/SearchableSelect";
import ColourPicker from "./ColourPicker";
import { PenTool, Settings, ShoppingCart, ShieldCheck, Edit2, Lock, Unlock } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getGateStatus } from "./ApprovalPanel";

const DesignSchema = z.object({
  colour_code: z.string().trim().min(1, "Colour Code is mandatory before submitting."),
  material_reference: z.string().trim().min(1, "Material Reference is mandatory before submitting."),
  finish_surface: z.string().trim().min(1, "Finish / Surface is mandatory before submitting."),
});

const EngineeringSchema = z.object({
  engineering_notes: z.string().trim()
    .min(1, "Engineering notes are mandatory before submitting.")
    .max(500, "Engineering notes must be less than 500 characters."),
});

const ProcurementSchema = z.object({
  procurement_notes: z.string().trim()
    .min(1, "Procurement notes are mandatory before submitting.")
    .max(500, "Procurement notes must be less than 500 characters."),
});

const QualitySchema = z.object({
  quality_notes: z.string().trim()
    .min(1, "Quality notes are mandatory before submitting.")
    .max(500, "Quality notes must be less than 500 characters."),
});



function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  const parts = Children.toArray(children);
  const labelText = parts.shift();

  return (
    <label className="decision-field-label">
      <span className="decision-field-label__text">
        {labelText}
        {required && <span className="decision-field-label__required" aria-hidden="true">*</span>}
      </span>
      {parts}
    </label>
  );
}

function Section({ 
  title, icon: Icon, color, children, onEdit, canEdit, isRejected,
  ownerId, currentUserId, ownerName, onTakeOver, onRelease, gateActable, hasAlreadySubmitted, isEditor, isLead
}: {
  title: string; icon: React.ElementType; color: string;
  isRejected?: boolean; canEdit?: boolean; onEdit?: () => void; children: React.ReactNode;
  ownerId?: string | null; currentUserId?: string; ownerName?: string;
  onTakeOver?: () => void; onRelease?: () => void; gateActable?: boolean; hasAlreadySubmitted?: boolean;
  isEditor?: boolean; isLead?: boolean;
}) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, var(--section-tint), transparent 72%), var(--bg-1)",
        border: "1px solid color-mix(in srgb, var(--section-color) 28%, var(--border))",
        borderTop: `3px solid ${color}`,
        borderRadius: "var(--r-lg)",
        padding: "1.25rem 1.5rem",
        marginBottom: "1.5rem",
        boxShadow: "var(--shadow-sm)",
        position: "relative",
        transition: "transform 200ms var(--ease), box-shadow 200ms var(--ease)",
      }}
      className={`interactive-card decision-section decision-section--${title.toLowerCase()}`}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        overflow: "hidden", borderRadius: "var(--r-lg)", pointerEvents: "none"
      }}>
        <div style={{
          position: "absolute", top: -15, right: -15, 
          padding: "1rem", opacity: 0.04, color
        }}>
          <Icon size={140} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <div style={{ 
            background: "var(--bg-2)", color, 
            padding: "0.375rem", borderRadius: "var(--r-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid var(--border)",
            boxShadow: `0 0 12px ${color}20`
          }}>
            <Icon size={16} />
          </div>
          <div style={{ fontSize: "0.875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-0)" }}>
            {title}
          </div>
        </div>
        
        {(isRejected || isLead) && onEdit && !canEdit && (
          <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: "0.75rem", display: "flex", gap: "4px", color: "var(--text-1)" }} onClick={onEdit}>
            <Edit2 size={12} /> Unlock to Fix
          </button>
        )}
        
        {gateActable && title !== "Design" && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {ownerId === currentUserId ? (
              <>
                <span className="badge badge-accent" style={{ fontSize: "0.625rem" }}>Taken over by you</span>
                {!hasAlreadySubmitted && (
                  <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: "0.75rem", display: "flex", gap: "4px", color: "var(--text-2)" }} onClick={onRelease}>
                    <Unlock size={12} /> Release
                  </button>
                )}
              </>
            ) : (
              <>
                {ownerId && (
                  <span className="badge badge-neutral" style={{ fontSize: "0.625rem", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Lock size={10} /> Locked by {ownerName || "another user"}
                  </span>
                )}
                {isEditor && (
                  <button className="btn btn-accent" style={{ padding: "4px 12px", fontSize: "0.75rem", display: "flex", gap: "4px" }} onClick={onTakeOver}>
                    <Lock size={12} /> Take Over
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div style={{ position: "relative", zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginBottom: "0.125rem" }}>{label}</div>
      <div style={{ fontSize: "0.8125rem", color: value ? "var(--text-0)" : "var(--text-3)", fontStyle: value ? "normal" : "italic" }}>
        {value || "Not provided"}
      </div>
    </div>
  );
}

export interface Props {
  decision: Decision;
  approvals: Approval[];
  userTeam: Team | null;
  userRole?: string | null;
  isLead: boolean;
  onSaved: (d: Decision) => void;
  onApprovalsChanged: (a: Approval[]) => void;
  onRunAI?: () => void;
  aiBusy?: boolean;
}

export default function DecisionFields({ decision, approvals, userTeam, userRole, isLead, onSaved, onApprovalsChanged, onRunAI, aiBusy }: Props) {
  const { session, profile } = useAuth();
  const currentUserId = session?.user?.id;
  const [ownerProfiles, setOwnerProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadOwners() {
      const ids = [decision.engineering_owner_id, decision.procurement_owner_id, decision.quality_owner_id].filter(Boolean) as string[];
      if (ids.length === 0) return;
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(p => map[p.id] = p.full_name);
        setOwnerProfiles(map);
      }
    }
    loadOwners();

    if (decision.component_id) {
      supabase.from("components").select("*").eq("id", decision.component_id).single()
        .then(({ data }) => {
          if (data) setComponent(data);
        });
    }
  }, [decision.engineering_owner_id, decision.procurement_owner_id, decision.quality_owner_id, decision.component_id]);

  async function takeOver(team: string) {
    if (!currentUserId) return;
    const update = { [team + "_owner_id"]: currentUserId } as any;
    const { data, error } = await supabase.from("decisions").update(update).eq("id", decision.id).select("*").single();
    if (!error && data) {
      onSaved(data as Decision);
    }
  }

  async function release(team: string) {
    const update = { [team + "_owner_id"]: null } as any;
    const { data, error } = await supabase.from("decisions").update(update).eq("id", decision.id).select("*").single();
    if (!error && data) {
      onSaved(data as Decision);
    }
  }
  const [draft, setDraft] = useState<Decision>(decision);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [feasibilityStatuses, setFeasibilityStatuses] = useState<MasterFeasibilityStatus[]>([]);
  const [technicalConstraints, setTechnicalConstraints] = useState<MasterTechnicalConstraint[]>([]);
  const [suppliers, setSuppliers] = useState<MasterSupplier[]>([]);
  const [finishes, setFinishes] = useState<MasterFinish[]>([]);
  const [designStatuses, setDesignStatuses] = useState<MasterDesignStatus[]>([]);
  const [mfgProcesses, setMfgProcesses] = useState<MasterManufacturingProcess[]>([]);

  const [currencies, setCurrencies] = useState<MasterCurrency[]>([]);
  const [supplierStatuses, setSupplierStatuses] = useState<MasterSupplierStatus[]>([]);
  const [qualityStatuses, setQualityStatuses] = useState<MasterQualityStatus[]>([]);
  const [passFailOptions, setPassFailOptions] = useState<MasterPassFail[]>([]);
  const [uvRequirements, setUvRequirements] = useState<MasterUvRequirement[]>([]);
  const [chemResistances, setChemResistances] = useState<MasterChemicalResistance[]>([]);
  const [validationStatuses, setValidationStatuses] = useState<MasterValidationStatus[]>([]);
  const [component, setComponent] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditingOverride, setIsEditingOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // GAP-3/4 FIX: Track the version at which this editor last submitted
  const [editorSubmittedVersion, setEditorSubmittedVersion] = useState<number | null>(null);

  useEffect(() => { setDraft(decision); }, [decision]);

  const isRejected = decision.status === "rejected";
  const isFinalised = decision.status === "approved";
  const gate = userTeam ? getGateStatus(userTeam, approvals, decision.design_status) : { canAct: false };

  // GAP-3/4 FIX: Check if editor has submitted for this version (local tracking)
  const editorHasSubmittedThisVersion = editorSubmittedVersion !== null && editorSubmittedVersion >= decision.version;
  // Also keep the old approval-based check for approvers
  const myApproval = userTeam ? approvals.find(a => a.team === userTeam) : null;
  const approverHasActed = myApproval
    ? myApproval.status !== "pending" && myApproval.version >= decision.version
    : false;
  const hasAlreadySubmitted = editorHasSubmittedThisVersion || approverHasActed;

  // GAP-8 FIX: Is the decision in an active review state where onBlur should be blocked?
  const isActiveReview = decision.status === "submitted" || decision.status === "under_review";

  // Permission logic: who can edit what
  const isEditor = userRole === "editor" || userRole === "approver" || isLead;

  const canDesign = (isLead && (decision.status === "draft" || isEditingOverride)) || (isEditor && (userTeam === "design" && (
    decision.status === "draft" || 
    (isRejected && isEditingOverride)
  )));
  
  const canEng = (isLead && (decision.status === "draft" || isEditingOverride)) || (isEditor && (userTeam === "engineering" && decision.engineering_owner_id === currentUserId && (
    (!hasAlreadySubmitted && decision.status !== "draft" && gate.canAct) || 
    (isRejected && isEditingOverride)
  )));
  
  const canProc = (isLead && (decision.status === "draft" || isEditingOverride)) || (isEditor && (userTeam === "procurement" && decision.procurement_owner_id === currentUserId && (
    (!hasAlreadySubmitted && decision.status !== "draft" && gate.canAct) || 
    (isRejected && isEditingOverride)
  )));
  
  const canQual = (isLead && (decision.status === "draft" || isEditingOverride)) || (isEditor && (userTeam === "quality" && decision.quality_owner_id === currentUserId && (
    (!hasAlreadySubmitted && decision.status !== "draft" && gate.canAct) || 
    (isRejected && isEditingOverride)
  )));

  async function triggerSubmitUpdates() {
    if (submitting) return; // Double-submit protection
    setError(null);
    setSubmitting(true);
    
    try {
      // ── STEP 0: Flush current draft to DB ──
      // This guarantees the AI reads the latest field values, even if the user
      // edited a field and immediately clicked submit (before onBlur fired).
      {
        const fieldsToFlush: Partial<Decision> = {};
        if (userTeam === "design") {
          fieldsToFlush.model_year = draft.model_year;
          fieldsToFlush.colour_code = draft.colour_code;
          fieldsToFlush.material_reference = draft.material_reference;
          fieldsToFlush.finish_surface = draft.finish_surface;
          fieldsToFlush.design_status = draft.design_status;
          fieldsToFlush.required_temp_min_c = draft.required_temp_min_c;
          fieldsToFlush.required_temp_max_c = draft.required_temp_max_c;
          fieldsToFlush.uv_weathering_required = draft.uv_weathering_required;
          fieldsToFlush.chemical_resistance_required = draft.chemical_resistance_required;
          fieldsToFlush.design_notes = draft.design_notes;
        } else if (userTeam === "engineering") {
          fieldsToFlush.engineering_notes = draft.engineering_notes;
          fieldsToFlush.feasibility_status = draft.feasibility_status;
          fieldsToFlush.manufacturing_process = draft.manufacturing_process;
          fieldsToFlush.engineering_part_number = draft.engineering_part_number;
          fieldsToFlush.material_specification = draft.material_specification;
          fieldsToFlush.technical_constraints = draft.technical_constraints;
          fieldsToFlush.temp_validation_status = draft.temp_validation_status;
          fieldsToFlush.temp_validation_notes = draft.temp_validation_notes;
          fieldsToFlush.uv_validation_status = draft.uv_validation_status;
          fieldsToFlush.uv_validation_notes = draft.uv_validation_notes;
          fieldsToFlush.chemical_validation_status = draft.chemical_validation_status;
          fieldsToFlush.chemical_validation_notes = draft.chemical_validation_notes;
        } else if (userTeam === "procurement") {
          fieldsToFlush.procurement_notes = draft.procurement_notes;
          fieldsToFlush.supplier = draft.supplier;
          fieldsToFlush.lead_time_days = draft.lead_time_days;
          fieldsToFlush.price_per_unit_cents = draft.price_per_unit_cents;
          fieldsToFlush.currency = draft.currency;
          fieldsToFlush.moq = draft.moq;
          fieldsToFlush.rfq_reference = draft.rfq_reference;
          fieldsToFlush.supplier_status = draft.supplier_status;
        } else if (userTeam === "quality") {
          fieldsToFlush.quality_notes = draft.quality_notes;
          fieldsToFlush.quality_status = draft.quality_status;
          fieldsToFlush.inspection_required = draft.inspection_required;
          fieldsToFlush.inspection_result = draft.inspection_result;
          fieldsToFlush.pass_fail = draft.pass_fail;
          fieldsToFlush.defect_issue = draft.defect_issue;
        } else if (userTeam === "design") {
          fieldsToFlush.colour_code = draft.colour_code;
          fieldsToFlush.material_reference = draft.material_reference;
          fieldsToFlush.design_notes = draft.design_notes;
          fieldsToFlush.finish_surface = draft.finish_surface;
          fieldsToFlush.design_status = draft.design_status;
          fieldsToFlush.dima_material_reference = draft.dima_material_reference;
          fieldsToFlush.required_temp_min_c = draft.required_temp_min_c;
          fieldsToFlush.required_temp_max_c = draft.required_temp_max_c;
          fieldsToFlush.uv_weathering_required = draft.uv_weathering_required;
          fieldsToFlush.chemical_resistance_required = draft.chemical_resistance_required;
        }
        
        // Remove null/undefined keys to avoid overwriting with null
        const cleanFlush: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fieldsToFlush)) {
          if (v !== undefined) cleanFlush[k] = v;
        }
        
        if (Object.keys(cleanFlush).length > 0) {
          const { error: flushErr } = await supabase
            .from("decisions")
            .update(cleanFlush as any)
            .eq("id", decision.id);
          if (flushErr) {
            setError(`Failed to save fields: ${flushErr.message}`);
            return;
          }
        }
      }

      // ── STEP 1: Mandatory Validation (ZOD) ──
      let validationResult;
      
      if (userTeam === "design") {
        validationResult = DesignSchema.safeParse(draft);
      } else if (userTeam === "engineering") {
        validationResult = EngineeringSchema.safeParse(draft);
      } else if (userTeam === "procurement") {
        validationResult = ProcurementSchema.safeParse(draft);
      } else if (userTeam === "quality") {
        validationResult = QualitySchema.safeParse(draft);
      }

      if (validationResult && !validationResult.success) {
        // Collect all error messages and show them in the top banner
        const errorMessages = validationResult.error.issues.map(issue => issue.message).join(" • ");
        setError(`Validation Failed: ${errorMessages}`);
        setSubmitting(false);
        return;
      }

      // ── STEP 2: Handle Data Invalidation & Version Bump ──
      // ANY time an editor modifies data, we must bump the version and wipe out
      // downstream approvals so they are forced to re-evaluate the new data.
      let newVersion = decision.version;
      const teamsToReset: Team[] = [];
      
      if (userTeam === "design") {
        teamsToReset.push("engineering", "procurement", "quality");
      } else if (userTeam === "engineering") {
        teamsToReset.push("procurement", "quality");
      } else if (userTeam === "procurement") {
        teamsToReset.push("quality");
      }
      
      newVersion = decision.version + 1;

      // Determine which forms the admin fixed (if they are editing via God-Mode)
      let adminFixedForms: string[] = [];
      if (isLead && (decision.status === "draft" || isEditingOverride)) {
        if (
          draft.finish_surface !== decision.finish_surface ||
          draft.colour_code !== decision.colour_code ||
          draft.material_reference !== decision.material_reference ||
          draft.design_notes !== decision.design_notes
        ) adminFixedForms.push("Design");

        if (
          draft.feasibility_status !== decision.feasibility_status ||
          draft.engineering_part_number !== decision.engineering_part_number ||
          draft.manufacturing_process !== decision.manufacturing_process ||
          draft.temp_validation_status !== decision.temp_validation_status ||
          draft.uv_validation_status !== decision.uv_validation_status ||
          draft.chemical_validation_status !== decision.chemical_validation_status
        ) adminFixedForms.push("Engineering");

        if (
          draft.supplier !== decision.supplier ||
          draft.price_per_unit_cents !== decision.price_per_unit_cents ||
          draft.currency !== decision.currency ||
          draft.lead_time_days !== decision.lead_time_days
        ) adminFixedForms.push("Procurement");

        if (
          draft.quality_status !== decision.quality_status ||
          draft.inspection_required !== decision.inspection_required ||
          draft.pass_fail !== decision.pass_fail
        ) adminFixedForms.push("Quality");
      }

      // Roll back the decision status depending on who edited it (or if admin, depending on what they edited)
      let rollbackStatus = decision.status;
      if (adminFixedForms.length > 0) {
        if (adminFixedForms.includes("Design") || adminFixedForms.includes("Engineering")) {
          rollbackStatus = "submitted";
        } else {
          rollbackStatus = "under_review";
        }
      } else if (userTeam === "design" || userTeam === "engineering") {
        rollbackStatus = "submitted";
      } else if (userTeam === "procurement" || userTeam === "quality") {
        rollbackStatus = "under_review";
      }

      // Normal workflow: reset downstream approvals
      // If admin edited, we reset teams downstream of whatever they touched.
      let finalTeamsToReset = [...teamsToReset];
      if (adminFixedForms.includes("Design")) {
        finalTeamsToReset = ["engineering", "procurement", "quality"];
      } else if (adminFixedForms.includes("Engineering") && finalTeamsToReset.length === 0) {
        finalTeamsToReset = ["procurement", "quality"];
      } else if (adminFixedForms.includes("Procurement") && finalTeamsToReset.length === 0) {
        finalTeamsToReset = ["quality"];
      }

      for (const teamToReset of new Set(finalTeamsToReset)) {
        await supabase.from("approvals").upsert({
          decision_id: decision.id,
          team: teamToReset as Team,
          status: "pending",
          approved_by: null,
          notes: null,
          decided_at: null,
          version: newVersion,
        }, { onConflict: "decision_id,team" });
      }

      // Update rc_flags to show what the admin fixed
      let newFlags = Array.isArray(decision.rc_flags) ? (decision.rc_flags as Array<{flag: string, detail?: string}>) : [];
      if (adminFixedForms.length > 0) {
        const adminName = profile?.full_name ?? session?.user?.email ?? "Admin";
        newFlags = [
          ...newFlags.filter(f => f.flag !== "admin_override"),
          { flag: "admin_override", detail: `${adminName} - Fixed: ${adminFixedForms.join(", ")}` }
        ];
      }

      // CRITICAL: Change status and bump version
      const updatePayload: any = { 
        status: rollbackStatus,
        version: newVersion,
        submitted_at: rollbackStatus === "submitted" ? new Date().toISOString() : decision.submitted_at,
      };
      if (adminFixedForms.length > 0) updatePayload.rc_flags = newFlags;

      const { data: resubData, error: resubErr } = await supabase.from("decisions")
        .update(updatePayload)
        .eq("id", decision.id)
        .select("*")
        .single();
      
      if (resubErr) {
        setError(`Failed to resubmit: ${resubErr.message}`);
        return;
      }
      if (resubData) {
        setDraft(resubData as Decision);
        onSaved(resubData as Decision);
      }


      // ── STEP 4: Re-fetch approvals to update parent ──
      const { data: freshApprovals } = await supabase.from("approvals")
        .select("*")
        .eq("decision_id", decision.id);
      if (freshApprovals && onApprovalsChanged) {
        onApprovalsChanged(freshApprovals as Approval[]);
      }

      // Re-fetch decision to get latest state
      const { data: freshDecision } = await supabase.from("decisions")
        .select("*")
        .eq("id", decision.id)
        .single();
      if (freshDecision) {
        setDraft(freshDecision as Decision);
        onSaved(freshDecision as Decision);
      }

      setIsEditingOverride(false);
      // GAP-3/4 FIX: Track that this editor has submitted for the new version
      setEditorSubmittedVersion(newVersion);

      // ── STEP 5: Run AI LAST - after all DB writes are committed ──
      if (onRunAI) onRunAI();
    } finally {
      setSubmitting(false);
    }
  }

  // Load all master data
  useEffect(() => {
    Promise.all([
      supabase.from("materials").select("*"),
      supabase.from("master_feasibility_statuses").select("*").eq("is_active", true),
      supabase.from("master_technical_constraints").select("*").eq("is_active", true),
      supabase.from("master_suppliers").select("*").eq("is_active", true),
      supabase.from("master_finishes").select("*").eq("is_active", true),
      supabase.from("master_design_statuses").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("master_manufacturing_processes").select("*").eq("is_active", true),
      supabase.from("master_engineering_decisions").select("*").eq("is_active", true),
      supabase.from("master_procurement_decisions").select("*").eq("is_active", true),
      supabase.from("master_quality_decisions").select("*").eq("is_active", true),
      supabase.from("master_currencies").select("*").eq("is_active", true),
      supabase.from("master_supplier_statuses").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("master_quality_statuses").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("master_pass_fail").select("*").eq("is_active", true),
      supabase.from("master_uv_requirements").select("*").eq("is_active", true),
      supabase.from("master_chemical_resistances").select("*").eq("is_active", true),
      supabase.from("master_validation_statuses").select("*").eq("is_active", true).order("sort_order"),
    ]).then(([mat, feas, tech, supp, fin, ds, mfg, _eng, _proc, _qual, cur, ss, qs, pf, uv, chem, vs]) => {
      if (mat.data) setMaterials(mat.data as Material[]);
      if (feas.data) setFeasibilityStatuses(feas.data as MasterFeasibilityStatus[]);
      if (tech.data) setTechnicalConstraints(tech.data as MasterTechnicalConstraint[]);
      if (supp.data) setSuppliers(supp.data as MasterSupplier[]);
      if (fin.data) setFinishes(fin.data as MasterFinish[]);
      if (ds.data) setDesignStatuses(ds.data as MasterDesignStatus[]);
      if (mfg.data) setMfgProcesses(mfg.data as MasterManufacturingProcess[]);

      if (cur.data) setCurrencies(cur.data as MasterCurrency[]);
      if (ss.data) setSupplierStatuses(ss.data as MasterSupplierStatus[]);
      if (qs.data) setQualityStatuses(qs.data as MasterQualityStatus[]);
      if (pf.data) setPassFailOptions(pf.data as MasterPassFail[]);
      if (uv.data) setUvRequirements(uv.data as MasterUvRequirement[]);
      if (chem.data) setChemResistances(chem.data as MasterChemicalResistance[]);
      if (vs.data) setValidationStatuses(vs.data as MasterValidationStatus[]);
    });
  }, []);

  async function save(next: Partial<Decision>) {
    // GAP-8 FIX: Block onBlur auto-saves for non-design teams when decision is
    // in active review (submitted/under_review). This prevents silent data changes
    // that bypass the version bump mechanism. Edits must go through "Submit Updates".
    if (isActiveReview && userTeam !== "design" && !isLead) {
      // Don't auto-save; edits are buffered in draft and flushed on "Submit Updates"
      return;
    }
    setError(null);
    setSaving(true);
    const { data, error } = await supabase
      .from("decisions")
      .update(next as any)
      .eq("id", decision.id)
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      if (error.message.includes("only design")) setError("Only the Design team can edit these fields.");
      else if (error.message.includes("only engineering")) setError("Only the Engineering team can edit these fields.");
      else if (error.message.includes("only procurement")) setError("Only the Procurement team can edit these fields.");
      else if (error.message.includes("only quality")) setError("Only the Quality team can edit these fields.");
      else if (error.message.includes("AI-owned")) setError("AI fields cannot be edited manually.");
      else setError(error.message);
      return;
    }
    setDraft(data as Decision);
    onSaved(data as Decision);
  }

  function validateNumber(val: string, field: string): number | null {
    if (val === "") return null;
    const num = Number(val);
    if (isNaN(num)) { setError(`${field} must be a valid number.`); return null; }
    if (num < 0) { setError(`${field} cannot be negative.`); return null; }
    setError(null);
    return num;
  }
  
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setUploading(true); setError(null);
    const fileName = `${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("decision_documents").upload(fileName, file);
    if (uploadErr) { setError(`Failed to upload ${file.name}: ${uploadErr.message}`); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("decision_documents").getPublicUrl(fileName);
    const newDoc: DocumentMeta = { url: publicUrl, type: "Render", name: file.name };
    const nextDocs = [...(draft.reference_documents || []), newDoc];
    await save({ reference_documents: nextDocs });
    setUploading(false);
  }

  async function removeDocument(idx: number) {
    const nextDocs = [...(draft.reference_documents || [])];
    nextDocs.splice(idx, 1);
    await save({ reference_documents: nextDocs });
  }

  async function updateDocumentType(idx: number, newType: string) {
    const nextDocs = [...(draft.reference_documents || [])];
    nextDocs[idx].type = newType;
    await save({ reference_documents: nextDocs });
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.875rem" }}>
        <h3 style={{ margin: 0 }}>Fields</h3>
        {saving && <span style={{ fontSize: "0.6875rem", color: "var(--accent)" }}>Saving…</span>}
        {isFinalised && (
          <span className={`badge ${decision.status === "approved" ? "badge-green" : "badge-red"}`} style={{ fontSize: "0.5625rem" }}>
            {decision.status === "approved" ? "Locked - Approved" : "Locked - Rejected"}
          </span>
        )}
      </div>
      {error && <div style={{ color: "var(--red)", fontSize: "0.75rem", marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(239, 68, 68, 0.08)", borderRadius: "var(--r-sm)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>{error}</div>}

      {Array.isArray(decision?.rc_flags) && (decision.rc_flags as any[]).some(f => f.flag === "admin_override") && (
        <div style={{
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid var(--amber)",
          borderLeft: "4px solid var(--amber)",
          borderRadius: "var(--r-md)",
          padding: "1rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          color: "var(--text-0)"
        }}>
          <span style={{ fontSize: "1.25rem" }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.25rem" }}>
              Administrative Override
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-1)" }}>
              Fields last modified or reverted by Project Lead: <strong>{((decision.rc_flags as any[]).find(f => f.flag === "admin_override")?.detail) ?? "Admin"}</strong>.
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DESIGN SECTION ═══════ */}
      <Section 
        title="Design" 
        icon={PenTool} 
        color="var(--purple)"
        isRejected={isRejected}
        canEdit={canDesign}
        onEdit={() => setIsEditingOverride(true)}
      >
        {component && (
          <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "var(--bg-1)", borderRadius: "var(--r-md)", border: "1px solid var(--border)", fontSize: "0.875rem" }}>
            <div style={{ marginBottom: "0.25rem", color: "var(--text-2)", fontSize: "0.75rem", fontWeight: 600 }}>COMPONENT DETAILS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
              <div><span style={{ color: "var(--text-3)" }}>Name:</span> <strong>{component.name}</strong></div>
              <div><span style={{ color: "var(--text-3)" }}>Zone:</span> <strong>{component.zone}</strong></div>
              <div><span style={{ color: "var(--text-3)" }}>Program:</span> <strong>{component.vehicle_program}</strong></div>
            </div>
          </div>
        )}

        <FieldLabel required>
          Model Year
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect
              disabled={!canDesign}
              value={draft.model_year ?? ""}
              onChange={(val) => { setDraft({ ...draft, model_year: val }); save({ model_year: val }); }}
              options={[
                { value: "", label: "-- Select Model Year --" },
                { value: "MY25", label: "MY25 (2025)" },
                { value: "MY26", label: "MY26 (2026)" },
                { value: "MY27", label: "MY27 (2027)" },
                { value: "MY28", label: "MY28 (2028)" },
                { value: "MY29", label: "MY29 (2029)" },
                { value: "MY30", label: "MY30 (2030)" }
              ]}
            />
          </div>
        </FieldLabel>

        <FieldLabel required>
          Colour code
          <div style={{ marginTop: "0.25rem" }}>
            <ColourPicker
              value={draft.colour_code ?? ""}
              onChange={(val) => { setDraft({ ...draft, colour_code: val }); save({ colour_code: val }); }}
              disabled={!canDesign}
              category={draft.business_area?.startsWith("INT") ? "interior" : draft.business_area?.startsWith("EXT") ? "exterior" : null}
            />
          </div>
        </FieldLabel>
        
        <FieldLabel required>
          Material reference
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect 
              disabled={!canDesign}
              value={draft.material_reference ?? ""}
              onChange={(val) => { setDraft({ ...draft, material_reference: val }); save({ material_reference: val }); }}
              options={[
                { value: "", label: "-- Select material --" },
                ...materials.map(m => ({ value: m.code, label: `${m.code} - ${m.display_name}` }))
              ]}
            />
          </div>
          <div style={{ fontSize: "0.65rem", marginTop: "0.25rem", color: "var(--text-3)" }}>
            If a material is missing, it must be added by MDM engineering first.
          </div>
          {draft.material_reference && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--bg-1)", borderRadius: "var(--r-md)", border: "1px solid var(--border)", fontSize: "0.875rem" }}>
              <div style={{ marginBottom: "0.25rem", color: "var(--text-2)", fontSize: "0.75rem", fontWeight: 600 }}>MATERIAL DETAILS (DiMa)</div>
              {(() => {
                const m = materials.find(x => x.code === draft.material_reference);
                if (!m) return <div style={{ color: "var(--text-3)" }}>Loading...</div>;
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div><span style={{ color: "var(--text-3)" }}>Name:</span> <strong>{m.display_name}</strong></div>
                    <div><span style={{ color: "var(--text-3)" }}>Lifecycle:</span> <strong>{m.lifecycle_status}</strong></div>
                    <div><span style={{ color: "var(--text-3)" }}>Compliance:</span> <strong>{m.compliance_status}</strong></div>
                    <div><span style={{ color: "var(--text-3)" }}>Lead Time:</span> <strong>{m.lead_time_weeks} weeks</strong></div>
                    <div><span style={{ color: "var(--text-3)" }}>Substrate:</span> <strong>{m.substrate}</strong></div>
                  </div>
                );
              })()}
            </div>
          )}
        </FieldLabel>

        <FieldLabel required>
          Finish / Surface
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect
              disabled={!canDesign}
              value={draft.finish_surface ?? ""}
              onChange={(val) => { setDraft({ ...draft, finish_surface: val }); save({ finish_surface: val }); }}
              options={[
                { value: "", label: "-- Select finish --" },
                ...finishes.map(f => ({ value: f.code, label: f.label }))
              ]}
            />
          </div>
        </FieldLabel>

        <FieldLabel>
          Design Status
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect
              disabled={!canDesign}
              value={draft.design_status ?? ""}
              onChange={(val) => { setDraft({ ...draft, design_status: val }); save({ design_status: val }); }}
              options={[
                { value: "", label: "-- Select status --" },
                ...designStatuses.map(s => ({ value: s.code, label: s.label }))
              ]}
            />
          </div>
        </FieldLabel>
        
        {/* Design Requirements - Engineering validates these */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.875rem", marginTop: "0.5rem" }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-2)", marginBottom: "0.625rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Material & Environmental Requirements
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
            <FieldLabel required>
              Required Temp Min (°C)
              <input className="input" style={{ marginTop: "0.25rem" }} disabled={!canDesign} type="number"
                placeholder="e.g. -40"
                value={draft.required_temp_min_c ?? ""}
                onChange={(e) => { const val = e.target.value === "" ? null : parseInt(e.target.value); setDraft({ ...draft, required_temp_min_c: val }); }}
                onBlur={() => save({ required_temp_min_c: draft.required_temp_min_c })}
              />
            </FieldLabel>
            <FieldLabel required>
              Required Temp Max (°C)
              <input className="input" style={{ marginTop: "0.25rem" }} disabled={!canDesign} type="number"
                placeholder="e.g. 120"
                value={draft.required_temp_max_c ?? ""}
                onChange={(e) => { const val = e.target.value === "" ? null : parseInt(e.target.value); setDraft({ ...draft, required_temp_max_c: val }); }}
                onBlur={() => save({ required_temp_max_c: draft.required_temp_max_c })}
              />
            </FieldLabel>
          </div>
          <FieldLabel required>
            UV / Weathering Requirement
            <div style={{ marginTop: "0.25rem" }}>
              <SearchableSelect disabled={!canDesign} value={draft.uv_weathering_required ?? ""}
                onChange={(val) => { setDraft({ ...draft, uv_weathering_required: val }); save({ uv_weathering_required: val }); }}
                options={[
                  { value: "", label: "-- Select UV requirement --" },
                  ...uvRequirements.map(u => ({ value: u.code, label: u.label }))
                ]}
              />
            </div>
          </FieldLabel>
          <FieldLabel required>
            Chemical Resistance Requirement
            <div style={{ marginTop: "0.25rem" }}>
              <SearchableSelect disabled={!canDesign} value={draft.chemical_resistance_required ?? ""}
                onChange={(val) => { setDraft({ ...draft, chemical_resistance_required: val }); save({ chemical_resistance_required: val }); }}
                options={[
                  { value: "", label: "-- Select chemical resistance --" },
                  ...chemResistances.map(c => ({ value: c.code, label: c.label }))
                ]}
              />
            </div>
          </FieldLabel>
        </div>

        <FieldLabel>
          Design notes
          <textarea
            className="input"
            style={{ marginTop: "0.25rem", resize: "vertical" }}
            disabled={!canDesign}
            rows={2}
            placeholder="Context on colour/material choice..."
            value={draft.design_notes ?? ""}
            onChange={(e) => setDraft({ ...draft, design_notes: e.target.value })}
            onBlur={() => save({ design_notes: draft.design_notes })}
          />
        </FieldLabel>
        
        {/* Reference Documents */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.875rem", marginTop: "0.5rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-2)", marginBottom: "0.5rem" }}>Reference Documents</div>
          {(draft.reference_documents || []).map((doc, idx) => (
            <div key={idx} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
              <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontSize: "0.75rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--accent)" }}>{doc.name}</a>
              <div style={{ width: "120px" }}>
                <SearchableSelect disabled={!canDesign} value={doc.type}
                  onChange={(val) => updateDocumentType(idx, val)}
                  options={[{ value: "Render", label: "Render" }, { value: "Spec", label: "Spec" }, { value: "CAD", label: "CAD" }, { value: "Quote", label: "Quote" }, { value: "Other", label: "Other" }]}
                />
              </div>
              {canDesign && <button type="button" className="btn" style={{ padding: "0.25rem 0.5rem" }} onClick={() => removeDocument(idx)}>X</button>}
            </div>
          ))}
          {canDesign && (
            <>
              <input type="file" id="edit-file-upload" style={{ display: "none" }} onChange={handleFileUpload} />
              <button type="button" className="btn" disabled={uploading} onClick={() => document.getElementById("edit-file-upload")?.click()}>
                {uploading ? "Uploading..." : "+ Add Document"}
              </button>
            </>
          )}
        </div>
        {/* Submit Updates button for Design */}
        {canDesign && onRunAI && (
          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
            <button 
              className="btn btn-accent" 
              onClick={triggerSubmitUpdates}
              disabled={aiBusy || submitting}
            >
              {submitting ? "Submitting…" : aiBusy ? "Running AI..." : "Submit Updates & Run AI"}
            </button>
          </div>
        )}
      </Section>

      {/* ═══════ ENGINEERING SECTION ═══════ */}
      <Section 
        title="Engineering" 
        icon={Settings} 
        color="var(--blue)"
        isRejected={isRejected}
        canEdit={canEng}
        onEdit={() => setIsEditingOverride(true)}
        ownerId={decision.engineering_owner_id}
        currentUserId={currentUserId}
        ownerName={decision.engineering_owner_id ? ownerProfiles[decision.engineering_owner_id] : ""}
        onTakeOver={() => takeOver("engineering")}
        onRelease={() => release("engineering")}
        gateActable={userTeam === "engineering" && gate.canAct && !isFinalised}
        hasAlreadySubmitted={hasAlreadySubmitted && userTeam === "engineering"}
        isEditor={isEditor}
      >
        <FieldLabel required>
          Engineering Part Number
          <input
            className="input"
            style={{ marginTop: "0.25rem" }}
            disabled={!canEng}
            placeholder="e.g. ENG-IP-2026-001"
            value={draft.engineering_part_number ?? ""}
            onChange={(e) => setDraft({ ...draft, engineering_part_number: e.target.value })}
            onBlur={() => save({ engineering_part_number: draft.engineering_part_number })}
          />
        </FieldLabel>
        <FieldLabel required>
          Feasibility status
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect disabled={!canEng} value={draft.feasibility_status ?? ""}
              onChange={(val) => { setDraft({ ...draft, feasibility_status: val }); save({ feasibility_status: val }); }}
              options={[
                { value: "", label: "-- Select Status --" },
                ...feasibilityStatuses.map(s => ({ value: s.code, label: s.label })),
                ...(draft.feasibility_status && !feasibilityStatuses.find(s => s.code === draft.feasibility_status) ? [{ value: draft.feasibility_status, label: `${draft.feasibility_status} (Legacy)` }] : [])
              ]}
            />
          </div>
        </FieldLabel>
        <FieldLabel required>
          Manufacturing Process
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect disabled={!canEng} value={draft.manufacturing_process ?? ""}
              onChange={(val) => { setDraft({ ...draft, manufacturing_process: val }); save({ manufacturing_process: val }); }}
              options={[
                { value: "", label: "-- Select Process --" },
                ...mfgProcesses.map(p => ({ value: p.code, label: p.label }))
              ]}
            />
          </div>
        </FieldLabel>
        <FieldLabel>
          Material Specification
          <textarea className="input" style={{ marginTop: "0.25rem", resize: "vertical" }} disabled={!canEng} rows={2}
            placeholder="Material grade, spec number, requirements..."
            value={draft.material_specification ?? ""}
            onChange={(e) => setDraft({ ...draft, material_specification: e.target.value })}
            onBlur={() => save({ material_specification: draft.material_specification })}
          />
        </FieldLabel>
        <FieldLabel>
          Technical constraints
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect disabled={!canEng} value={draft.technical_constraints ?? ""}
              onChange={(val) => { setDraft({ ...draft, technical_constraints: val }); save({ technical_constraints: val }); }}
              options={[
                { value: "", label: "-- Select Constraint --" },
                ...technicalConstraints.map(c => ({ value: c.code, label: c.label })),
                ...(draft.technical_constraints && !technicalConstraints.find(c => c.code === draft.technical_constraints) ? [{ value: draft.technical_constraints, label: `${draft.technical_constraints} (Legacy)` }] : [])
              ]}
            />
          </div>
        </FieldLabel>
        <FieldLabel required>
          Engineering Notes
          <textarea className="input" style={{ marginTop: "0.25rem", resize: "vertical" }} disabled={!canEng} rows={2}
            placeholder="Material validation details, test results..."
            value={draft.engineering_notes ?? ""}
            onChange={(e) => setDraft({ ...draft, engineering_notes: e.target.value })}
            onBlur={() => save({ engineering_notes: draft.engineering_notes })}
            maxLength={500}
          />
        </FieldLabel>

        {/* Engineering Validation of Design Requirements */}
        {(draft.required_temp_min_c != null || draft.required_temp_max_c != null || draft.uv_weathering_required || draft.chemical_resistance_required) && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.875rem", marginTop: "0.5rem" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-2)", marginBottom: "0.625rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Design Requirement Validation
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginBottom: "0.75rem", lineHeight: 1.5, padding: "0.5rem 0.75rem", background: "rgba(59,130,246,0.05)", borderRadius: "var(--r-sm)", border: "1px solid rgba(59,130,246,0.12)" }}>
              Design has specified the requirements below. Engineering must validate each against the selected material and manufacturing process.
            </div>

            {/* Temperature Validation */}
            {(draft.required_temp_min_c != null || draft.required_temp_max_c != null) && (
              <div style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "var(--bg-0)", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginBottom: "0.375rem" }}>
                  Design requires: <strong style={{ color: "var(--text-1)" }}>{draft.required_temp_min_c ?? "-"}°C to {draft.required_temp_max_c ?? "-"}°C</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
                  <FieldLabel>
                    Temperature Validation
                    <div style={{ marginTop: "0.25rem" }}>
                      <SearchableSelect disabled={!canEng} value={draft.temp_validation_status ?? "pending"}
                        onChange={(val) => { setDraft({ ...draft, temp_validation_status: val }); save({ temp_validation_status: val }); }}
                        options={validationStatuses.map(s => ({ value: s.code, label: s.label }))}
                      />
                    </div>
                  </FieldLabel>
                  <FieldLabel>
                    Notes
                    <input className="input" style={{ marginTop: "0.25rem" }} disabled={!canEng}
                      placeholder="Validation notes..."
                      value={draft.temp_validation_notes ?? ""}
                      onChange={(e) => setDraft({ ...draft, temp_validation_notes: e.target.value })}
                      onBlur={() => save({ temp_validation_notes: draft.temp_validation_notes })}
                    />
                  </FieldLabel>
                </div>
              </div>
            )}

            {/* UV Validation */}
            {draft.uv_weathering_required && (
              <div style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "var(--bg-0)", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginBottom: "0.375rem" }}>
                  Design requires UV: <strong style={{ color: "var(--text-1)" }}>{uvRequirements.find(u => u.code === draft.uv_weathering_required)?.label || draft.uv_weathering_required}</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
                  <FieldLabel>
                    UV Validation
                    <div style={{ marginTop: "0.25rem" }}>
                      <SearchableSelect disabled={!canEng} value={draft.uv_validation_status ?? "pending"}
                        onChange={(val) => { setDraft({ ...draft, uv_validation_status: val }); save({ uv_validation_status: val }); }}
                        options={validationStatuses.map(s => ({ value: s.code, label: s.label }))}
                      />
                    </div>
                  </FieldLabel>
                  <FieldLabel>
                    Notes
                    <input className="input" style={{ marginTop: "0.25rem" }} disabled={!canEng}
                      placeholder="UV validation notes..."
                      value={draft.uv_validation_notes ?? ""}
                      onChange={(e) => setDraft({ ...draft, uv_validation_notes: e.target.value })}
                      onBlur={() => save({ uv_validation_notes: draft.uv_validation_notes })}
                    />
                  </FieldLabel>
                </div>
              </div>
            )}

            {/* Chemical Resistance Validation */}
            {draft.chemical_resistance_required && (
              <div style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "var(--bg-0)", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginBottom: "0.375rem" }}>
                  Design requires: <strong style={{ color: "var(--text-1)" }}>{chemResistances.find(c => c.code === draft.chemical_resistance_required)?.label || draft.chemical_resistance_required}</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
                  <FieldLabel>
                    Chemical Validation
                    <div style={{ marginTop: "0.25rem" }}>
                      <SearchableSelect disabled={!canEng} value={draft.chemical_validation_status ?? "pending"}
                        onChange={(val) => { setDraft({ ...draft, chemical_validation_status: val }); save({ chemical_validation_status: val }); }}
                        options={validationStatuses.map(s => ({ value: s.code, label: s.label }))}
                      />
                    </div>
                  </FieldLabel>
                  <FieldLabel>
                    Notes
                    <input className="input" style={{ marginTop: "0.25rem" }} disabled={!canEng}
                      placeholder="Chemical validation notes..."
                      value={draft.chemical_validation_notes ?? ""}
                      onChange={(e) => setDraft({ ...draft, chemical_validation_notes: e.target.value })}
                      onBlur={() => save({ chemical_validation_notes: draft.chemical_validation_notes })}
                    />
                  </FieldLabel>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Submit Updates button for Engineering */}
        {canEng && onRunAI && (
          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
            <button 
              className="btn btn-accent" 
              onClick={triggerSubmitUpdates}
              disabled={aiBusy || submitting}
            >
              {submitting ? "Submitting…" : aiBusy ? "Running AI..." : "Submit Updates & Run AI"}
            </button>
          </div>
        )}
        {hasAlreadySubmitted && userTeam === "engineering" && (
          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem" }}>
            <span className="badge badge-green" style={{ fontSize: "0.75rem" }}>✓ Submitted (v{myApproval?.version})</span>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>Your review has been recorded. Editing is locked.</span>
          </div>
        )}
      </Section>

      {/* ═══════ PROCUREMENT SECTION ═══════ */}
      <Section 
        title="Procurement" 
        icon={ShoppingCart} 
        color="var(--amber)"
        isRejected={isRejected}
        canEdit={canProc}
        onEdit={() => setIsEditingOverride(true)}
        ownerId={decision.procurement_owner_id}
        currentUserId={currentUserId}
        ownerName={decision.procurement_owner_id ? ownerProfiles[decision.procurement_owner_id] : ""}
        onTakeOver={() => takeOver("procurement")}
        onRelease={() => release("procurement")}
        gateActable={userTeam === "procurement" && gate.canAct && !isFinalised}
        hasAlreadySubmitted={hasAlreadySubmitted && userTeam === "procurement"}
        isEditor={isEditor}
      >
        <FieldLabel required>
          Supplier
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect disabled={!canProc} value={draft.supplier ?? ""}
              onChange={(val) => { setDraft({ ...draft, supplier: val }); save({ supplier: val }); }}
              options={[
                { value: "", label: "-- Select Supplier --" },
                ...suppliers.map(s => ({ value: s.code, label: `${s.name} (${s.code})` })),
                ...(draft.supplier && !suppliers.find(s => s.code === draft.supplier) ? [{ value: draft.supplier, label: `${draft.supplier} (Legacy)` }] : [])
              ]}
            />
          </div>
        </FieldLabel>
        <FieldLabel>
          Supplier Status
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect disabled={!canProc} value={draft.supplier_status ?? ""}
              onChange={(val) => { setDraft({ ...draft, supplier_status: val }); save({ supplier_status: val }); }}
              options={[
                { value: "", label: "-- Select Status --" },
                ...supplierStatuses.map(s => ({ value: s.code, label: s.label }))
              ]}
            />
          </div>
        </FieldLabel>
        <FieldLabel>
          RFQ / Quotation Reference
          <input className="input" style={{ marginTop: "0.25rem" }} disabled={!canProc}
            placeholder="e.g. RFQ-2026-0891"
            value={draft.rfq_reference ?? ""}
            onChange={(e) => setDraft({ ...draft, rfq_reference: e.target.value })}
            onBlur={() => save({ rfq_reference: draft.rfq_reference })}
          />
        </FieldLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
          <FieldLabel required>
            Lead time (days)
            <input className="input" style={{ marginTop: "0.25rem" }} disabled={!canProc} type="number" min={0}
              value={draft.lead_time_days ?? ""} placeholder="e.g. 45"
              onChange={(e) => { const val = validateNumber(e.target.value, "Lead time"); setDraft({ ...draft, lead_time_days: val }); }}
              onBlur={() => { if (draft.lead_time_days !== null && draft.lead_time_days < 0) return; save({ lead_time_days: draft.lead_time_days }); }}
            />
          </FieldLabel>
          <FieldLabel required>
            MOQ (Min Order Qty)
            <input className="input" style={{ marginTop: "0.25rem" }} disabled={!canProc} type="number" min={1}
              value={draft.moq ?? ""} placeholder="e.g. 500"
              onChange={(e) => { const val = validateNumber(e.target.value, "MOQ"); setDraft({ ...draft, moq: val }); }}
              onBlur={() => { if (draft.moq !== null && draft.moq < 0) return; save({ moq: draft.moq }); }}
            />
          </FieldLabel>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
          <FieldLabel required>
            Price per unit (cents)
            <input className="input" style={{ marginTop: "0.25rem" }} disabled={!canProc} type="number" min={0}
              value={draft.price_per_unit_cents ?? ""} placeholder="e.g. 4500"
              onChange={(e) => { const val = validateNumber(e.target.value, "Price"); setDraft({ ...draft, price_per_unit_cents: val }); }}
              onBlur={() => { if (draft.price_per_unit_cents !== null && draft.price_per_unit_cents < 0) return; save({ price_per_unit_cents: draft.price_per_unit_cents }); }}
            />
          </FieldLabel>
          <FieldLabel>
            Currency
            <div style={{ marginTop: "0.25rem" }}>
              <SearchableSelect disabled={!canProc} value={draft.currency ?? "EUR"}
                onChange={(val) => { setDraft({ ...draft, currency: val }); save({ currency: val }); }}
                options={currencies.map(c => ({ value: c.code, label: `${c.symbol} ${c.label}` }))}
              />
            </div>
          </FieldLabel>
        </div>
        <FieldLabel required>
          Procurement Notes
          <textarea className="input" style={{ marginTop: "0.25rem", resize: "vertical" }} disabled={!canProc} rows={2}
            placeholder="Supplier feedback, negotiation notes..."
            value={draft.procurement_notes ?? ""}
            onChange={(e) => setDraft({ ...draft, procurement_notes: e.target.value })}
            onBlur={() => save({ procurement_notes: draft.procurement_notes })}
            maxLength={500}
          />
        </FieldLabel>
        {/* Submit Updates button for Procurement */}
        {canProc && onRunAI && (
          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
            <button 
              className="btn btn-accent" 
              onClick={triggerSubmitUpdates}
              disabled={aiBusy || submitting}
            >
              {submitting ? "Submitting…" : aiBusy ? "Running AI..." : "Submit Updates & Run AI"}
            </button>
          </div>
        )}
        {hasAlreadySubmitted && userTeam === "procurement" && (
          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem" }}>
            <span className="badge badge-green" style={{ fontSize: "0.75rem" }}>✓ Submitted (v{myApproval?.version})</span>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>Your review has been recorded. Editing is locked.</span>
          </div>
        )}
      </Section>

      {/* ═══════ QUALITY SECTION ═══════ */}
      <Section 
        title="Quality" 
        icon={ShieldCheck} 
        color="var(--green)"
        isRejected={isRejected}
        canEdit={canQual}
        onEdit={() => setIsEditingOverride(true)}
        ownerId={decision.quality_owner_id}
        currentUserId={currentUserId}
        ownerName={decision.quality_owner_id ? ownerProfiles[decision.quality_owner_id] : ""}
        onTakeOver={() => takeOver("quality")}
        onRelease={() => release("quality")}
        gateActable={userTeam === "quality" && gate.canAct && !isFinalised}
        hasAlreadySubmitted={hasAlreadySubmitted && userTeam === "quality"}
        isEditor={isEditor}
      >
        <FieldLabel>
          Quality Status
          <div style={{ marginTop: "0.25rem" }}>
            <SearchableSelect disabled={!canQual} value={draft.quality_status ?? "pending"}
              onChange={(val) => { setDraft({ ...draft, quality_status: val }); save({ quality_status: val }); }}
              options={qualityStatuses.map(s => ({ value: s.code, label: s.label }))}
            />
          </div>
        </FieldLabel>

        <FieldLabel>
          Inspection Required?
          <div style={{ marginTop: "0.375rem", display: "flex", gap: "1rem" }}>
            {[{ val: true, label: "Yes" }, { val: false, label: "No" }].map(opt => (
              <label key={String(opt.val)} style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: canQual ? "pointer" : "default", fontSize: "0.8125rem", color: "var(--text-1)" }}>
                <input type="radio" name="inspection_required" disabled={!canQual}
                  checked={draft.inspection_required === opt.val}
                  onChange={() => { setDraft({ ...draft, inspection_required: opt.val }); save({ inspection_required: opt.val }); }}
                  style={{ accentColor: "var(--accent)" }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </FieldLabel>

        {draft.inspection_required && (
          <>
            <FieldLabel>
              Inspection Result
              <textarea className="input" style={{ marginTop: "0.25rem", resize: "vertical" }} disabled={!canQual} rows={2}
                placeholder="Inspection observations, measurements..."
                value={draft.inspection_result ?? ""}
                onChange={(e) => setDraft({ ...draft, inspection_result: e.target.value })}
                onBlur={() => save({ inspection_result: draft.inspection_result })}
              />
            </FieldLabel>
            <FieldLabel>
              Pass / Fail
              <div style={{ marginTop: "0.25rem" }}>
                <SearchableSelect disabled={!canQual} value={draft.pass_fail ?? ""}
                  onChange={(val) => { setDraft({ ...draft, pass_fail: val }); save({ pass_fail: val }); }}
                  options={[
                    { value: "", label: "-- Select Result --" },
                    ...passFailOptions.map(p => ({ value: p.code, label: p.label }))
                  ]}
                />
              </div>
            </FieldLabel>
          </>
        )}

        {draft.pass_fail === "FAIL" && (
          <FieldLabel required>
            Defect / Issue Description
            <textarea className="input" style={{ marginTop: "0.25rem", resize: "vertical" }} disabled={!canQual} rows={2}
              placeholder="Describe the defect or failure..."
              value={draft.defect_issue ?? ""}
              onChange={(e) => setDraft({ ...draft, defect_issue: e.target.value })}
              onBlur={() => save({ defect_issue: draft.defect_issue })}
            />
          </FieldLabel>
        )}

        <FieldLabel required>
          Quality Notes
          <textarea className="input" style={{ marginTop: "0.25rem", resize: "vertical" }} disabled={!canQual} rows={2}
            placeholder="Testing deviations, certification details..."
            value={draft.quality_notes ?? ""}
            onChange={(e) => setDraft({ ...draft, quality_notes: e.target.value })}
            onBlur={() => save({ quality_notes: draft.quality_notes })}
            maxLength={500}
          />
        </FieldLabel>

        {/* Completeness overview */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 1rem" }}>
            <ReadOnlyField label="Colour Code" value={draft.colour_code} />
            <ReadOnlyField label="Material" value={draft.material_reference} />
            <ReadOnlyField label="Finish" value={draft.finish_surface} />
            <ReadOnlyField label="Feasibility" value={draft.feasibility_status} />
            <ReadOnlyField label="Mfg Process" value={draft.manufacturing_process} />
            <ReadOnlyField label="Supplier" value={draft.supplier} />
            <ReadOnlyField label="Supplier Status" value={draft.supplier_status} />
            <ReadOnlyField label="Lead Time" value={draft.lead_time_days != null ? `${draft.lead_time_days} days` : null} />
            <ReadOnlyField label="Unit Price" value={draft.price_per_unit_cents != null ? `${(draft.price_per_unit_cents / 100).toFixed(2)} ${draft.currency ?? "EUR"}` : null} />
            {(draft.required_temp_min_c != null || draft.required_temp_max_c != null) && (
              <ReadOnlyField label="Temp Validation" value={draft.temp_validation_status && draft.temp_validation_status !== "pending" ? draft.temp_validation_status : null} />
            )}
            {draft.uv_weathering_required && (
              <ReadOnlyField label="UV Validation" value={draft.uv_validation_status && draft.uv_validation_status !== "pending" ? draft.uv_validation_status : null} />
            )}
            {draft.chemical_resistance_required && (
              <ReadOnlyField label="Chemical Validation" value={draft.chemical_validation_status && draft.chemical_validation_status !== "pending" ? draft.chemical_validation_status : null} />
            )}
          </div>
          {/* Completeness bar */}
          {(() => {
            const filled = [
              draft.colour_code, draft.material_reference, draft.finish_surface,
              draft.required_temp_min_c != null ? "y" : null, draft.required_temp_max_c != null ? "y" : null,
              draft.uv_weathering_required, draft.chemical_resistance_required,
              draft.engineering_part_number, draft.feasibility_status, draft.manufacturing_process,
              draft.temp_validation_status && draft.temp_validation_status !== "pending" ? "y" : null,
              draft.uv_validation_status && draft.uv_validation_status !== "pending" ? "y" : null,
              draft.chemical_validation_status && draft.chemical_validation_status !== "pending" ? "y" : null,
              draft.supplier, draft.lead_time_days != null ? "y" : null, draft.price_per_unit_cents != null ? "y" : null,
            ].filter(Boolean).length;
            const total = 16;
            const pct = Math.round((filled / total) * 100);
            const color = pct === 100 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)";
            return (
              <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-2)" }}>Cross-Team Field Completeness</span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color }}>{filled}/{total} ({pct}%)</span>
                </div>
                <div style={{ height: 4, background: "var(--bg-2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 300ms ease" }} />
                </div>
              </div>
            );
          })()}
          
          {/* Submit Updates button for Quality */}
          {canQual && onRunAI && (
            <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
              <button 
                className="btn btn-accent" 
                onClick={triggerSubmitUpdates}
                disabled={aiBusy || submitting}
              >
                {submitting ? "Submitting…" : aiBusy ? "Running AI..." : "Submit Updates & Run AI"}
              </button>
            </div>
          )}
          {hasAlreadySubmitted && userTeam === "quality" && (
            <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem" }}>
              <span className="badge badge-green" style={{ fontSize: "0.75rem" }}>✓ Submitted (v{myApproval?.version})</span>
              <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>Your review has been recorded. Editing is locked.</span>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
