import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { runReadinessCheck } from "../lib/ai";
import type { Decision, Material, DocumentMeta, MasterFinish, MasterDesignStatus, MasterUvRequirement, MasterChemicalResistance, Component } from "../types/db";
import MaterialContext from "../components/MaterialContext";
import SearchableSelect from "../components/ui/SearchableSelect";
import ColourPicker from "../components/ColourPicker";

export default function NewDecision() {
  const nav = useNavigate();
  const { session, profile } = useAuth();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [componentId, setComponentId] = useState("");
  const [colour, setColour] = useState("");
  const [material, setMaterial] = useState("");
  const [notes, setNotes] = useState("");
  const [finish, setFinish] = useState("");
  const [designStatus, setDesignStatus] = useState("wip");
  const [finishes, setFinishes] = useState<MasterFinish[]>([]);
  const [designStatuses, setDesignStatuses] = useState<MasterDesignStatus[]>([]);
  const [tempMin, setTempMin] = useState<string>("");
  const [tempMax, setTempMax] = useState<string>("");
  const [uvReq, setUvReq] = useState<string>("");
  const [chemReq, setChemReq] = useState<string>("");
  const [uvRequirements, setUvRequirements] = useState<MasterUvRequirement[]>([]);
  const [chemResistances, setChemResistances] = useState<MasterChemicalResistance[]>([]);
  const [files, setFiles] = useState<{ file: File; type: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("materials").select("*").then(({ data }) => {
      if (data) setMaterials(data as Material[]);
    });
    supabase.from("components").select("*").then(({ data }) => {
      if (data) setComponents(data as Component[]);
    });
    supabase.from("master_finishes").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setFinishes(data as MasterFinish[]);
    });
    supabase.from("master_design_statuses").select("*").eq("is_active", true).order("sort_order").then(({ data }) => {
      if (data) setDesignStatuses(data as MasterDesignStatus[]);
    });
    supabase.from("master_uv_requirements").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setUvRequirements(data as MasterUvRequirement[]);
    });
    supabase.from("master_chemical_resistances").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setChemResistances(data as MasterChemicalResistance[]);
    });
  }, []);

  const selectedComponent = useMemo(
    () => components.find((c) => c.id === componentId) ?? null,
    [components, componentId]
  );

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.code === material) ?? null,
    [materials, material]
  );

  // Determine colour category based on selected component's zone
  const colourCategory = useMemo(() => {
    if (!selectedComponent) return null;
    if (selectedComponent.zone.toLowerCase().includes("interior")) return "interior" as const;
    if (selectedComponent.zone.toLowerCase().includes("exterior")) return "exterior" as const;
    return null;
  }, [selectedComponent]);

  // Auto-fill colour when material has a linked colour code
  function handleMaterialChange(code: string) {
    setMaterial(code);
    const mat = materials.find(m => m.code === code);
    if (mat?.linked_colour_code && !colour) {
      setColour(mat.linked_colour_code);
    }
  }

  // Minimal Decision-shaped object for the live preview panel.
  const previewDecision = useMemo(
    () =>
      ({
        id: "preview",
        component_name: selectedComponent?.name || componentId || "New component",
        business_area: selectedComponent?.zone || "Select a component",
        colour_code: colour || null,
        material_reference: material || null,
        design_notes: notes || null,
        required_temp_min_c: tempMin ? parseInt(tempMin) : null,
        required_temp_max_c: tempMax ? parseInt(tempMax) : null,
        uv_weathering_required: uvReq || null,
        chemical_resistance_required: chemReq || null,
        feasibility_status: null,
        technical_constraints: null,
        supplier: null,
        lead_time_days: null,
        price_per_unit_cents: null,
        status: "draft",
        owner_team: "design",
        ai_rating: null,
        ai_reason: null,
        ai_flags: [],
        ai_last_checked_at: null,
        dima_material_reference: null,
        vred_render_url: null,
        reference_documents: [],
        created_by: session?.user?.id ?? "",
        submitted_by: null,
        submitted_at: null,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }) as any as Decision,
    [componentId, selectedComponent, colour, material, notes, session]
  );

  if (profile?.team !== "design" && !profile?.is_project_lead) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <p>Only Design can create new decisions.</p>
      </div>
    );
  }

  function canSubmitForReview(): boolean {
    return !!(componentId.trim() && colour && material && finish && tempMin !== "" && tempMax !== "" && uvReq && chemReq);
  }

  async function submit(targetStatus: "draft" | "submitted") {
    if (!session) return;
    if (targetStatus === "submitted" && !canSubmitForReview()) {
      setError("Please fill in all required fields (marked *) before submitting.");
      return;
    }

    setBusy(true);
    setError(null);

    const reference_documents: DocumentMeta[] = [];
    for (const f of files) {
      const fileName = `${Date.now()}_${f.file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("decision_documents")
        .upload(fileName, f.file);
      if (uploadErr) {
        setError(`Failed to upload ${f.file.name}: ${uploadErr.message}`);
        setBusy(false);
        return;
      }
      const { data: { publicUrl } } = supabase.storage
        .from("decision_documents")
        .getPublicUrl(fileName);
      reference_documents.push({ url: publicUrl, type: f.type, name: f.file.name });
    }

    const componentName = selectedComponent ? selectedComponent.name : componentId;
    const businessArea = selectedComponent ? selectedComponent.zone : "Unknown Zone";

    const { data, error } = await supabase
      .from("decisions")
      .insert({
        component_id: selectedComponent ? componentId : null,
        component_name: componentName,
        business_area: businessArea,
        colour_code: colour || null,
        material_reference: material || null,
        finish_surface: finish || null,
        design_status: designStatus || 'wip',
        design_notes: notes || null,
        required_temp_min_c: tempMin ? parseInt(tempMin) : null,
        required_temp_max_c: tempMax ? parseInt(tempMax) : null,
        uv_weathering_required: uvReq || null,
        chemical_resistance_required: chemReq || null,
        reference_documents,
        status: "draft",
        owner_team: "design",
        created_by: session.user.id
      })
      .select("id")
      .single();

    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }

    if (targetStatus === "submitted") {
      const { error: submitError } = await supabase
        .from("decisions")
        .update({
          status: "submitted",
          submitted_by: session.user.id,
          submitted_at: new Date().toISOString()
        })
        .eq("id", data!.id);
      if (submitError) {
        setBusy(false);
        setError(`Saved as draft, but submitting failed: ${submitError.message}`);
        nav(`/decisions/${data!.id}`);
        return;
      }
      void runReadinessCheck(data!.id);
    }

    setBusy(false);
    nav(`/decisions/${data!.id}`);
  }

  const requiredIncomplete = !canSubmitForReview();
  const isReadyForEngineering = designStatus === "ready_for_engineering";
  
  let submitTitle = "Submit for team review";
  if (requiredIncomplete) submitTitle = "Fill all required fields (marked *) first";
  else if (!isReadyForEngineering) submitTitle = `Blocked: Design Status must be "Ready for Engineering"`;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.5rem 0" }}>New Decision</h1>
          <p style={{ margin: 0 }}>Create a colour/material decision for your business area. Save as draft to keep editing, or submit to send it for team review.</p>
        </div>
      </div>

      <div
        style={{
          padding: "12px 16px",
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: "var(--r-md)",
          fontSize: "0.8125rem",
          color: "var(--text-1)",
          marginBottom: "1.25rem",
          display: "flex",
          gap: "0.625rem",
          alignItems: "flex-start"
        }}
      >
        <div style={{ color: "var(--blue)", flexShrink: 0, marginTop: 2 }}>ⓘ</div>
        <div>
          Fields marked <RequiredMarker /> are required to <strong>Submit</strong> for team review. You can <strong>Save as Draft</strong> with only a component name.
          {profile && (
            <span style={{ color: "var(--text-2)" }}>
              {" "}· Creating as <strong>{profile.full_name}</strong>
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", gap: "1.5rem", alignItems: "flex-start" }}>
        <form
          className="card"
          onSubmit={(e) => e.preventDefault()}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <FieldRow label="Component" required>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <SearchableSelect
                value={componentId}
                onChange={setComponentId}
                options={[
                  { value: "", label: "- Select Component -" },
                  ...components.map(c => ({
                    value: c.id,
                    label: `${c.id} - ${c.name} (${c.zone})`
                  }))
                ]}
              />
              
              {selectedComponent && (
                <div style={{ padding: "0.75rem", background: "var(--bg-1)", borderRadius: "var(--r-md)", border: "1px solid var(--border)", fontSize: "0.875rem" }}>
                  <div style={{ marginBottom: "0.25rem", color: "var(--text-2)", fontSize: "0.75rem", fontWeight: 600 }}>COMPONENT DETAILS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                    <div><span style={{ color: "var(--text-3)" }}>Name:</span> <strong>{selectedComponent.name}</strong></div>
                    <div><span style={{ color: "var(--text-3)" }}>Zone:</span> <strong>{selectedComponent.zone}</strong></div>
                    <div><span style={{ color: "var(--text-3)" }}>Program:</span> <strong>{selectedComponent.vehicle_program}</strong></div>
                  </div>
                </div>
              )}
            </div>
          </FieldRow>

          <FieldRow
            label="Colour code"
            required
            hint="Select from the OEM colour palette. Colours are filtered by your selected business area."
          >
            <ColourPicker
              value={colour}
              onChange={setColour}
              category={colourCategory}
            />
          </FieldRow>

          <FieldRow
            label="Material reference"
            required
            hint="Select a material from the DiMa catalogue. If a material is missing, it must be added by MDM engineering first."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <SearchableSelect
                value={material}
                onChange={handleMaterialChange}
                options={[
                  { value: "", label: "- Select Material -" },
                  ...materials.map((m) => ({
                    value: m.code,
                    label: `${m.code} - ${m.display_name}`,
                  })),
                ]}
              />

              {selectedMaterial && (
                <div style={{ padding: "0.75rem", background: "var(--bg-1)", borderRadius: "var(--r-md)", border: "1px solid var(--border)", fontSize: "0.875rem" }}>
                  <div style={{ marginBottom: "0.25rem", color: "var(--text-2)", fontSize: "0.75rem", fontWeight: 600 }}>MATERIAL DETAILS (DiMa)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div><span style={{ color: "var(--text-3)" }}>Name:</span> <strong>{selectedMaterial.display_name}</strong></div>
                    <div>
                      <span style={{ color: "var(--text-3)" }}>Lifecycle:</span> 
                      <span className={`badge ${selectedMaterial.lifecycle_status === 'active' ? 'badge-green' : 'badge-red'}`} style={{ marginLeft: "4px" }}>
                        {selectedMaterial.lifecycle_status || "Unknown"}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-3)" }}>Compliance:</span> 
                      <span className={`badge ${selectedMaterial.compliance_status === 'pass' ? 'badge-green' : selectedMaterial.compliance_status === 'fail' ? 'badge-red' : 'badge-gray'}`} style={{ marginLeft: "4px" }}>
                        {selectedMaterial.compliance_status || "Unknown"}
                      </span>
                    </div>
                    <div><span style={{ color: "var(--text-3)" }}>Lead Time:</span> <strong>{selectedMaterial.lead_time_weeks ? `${selectedMaterial.lead_time_weeks} weeks` : "Unknown"}</strong></div>
                    <div><span style={{ color: "var(--text-3)" }}>Substrate:</span> <strong>{selectedMaterial.substrate || "-"}</strong></div>
                  </div>
                </div>
              )}
            </div>
          </FieldRow>

          <FieldRow label="Finish / Surface" required hint="Select the surface treatment for this component.">
            <SearchableSelect
              value={finish}
              onChange={setFinish}
              options={[
                { value: "", label: "- Select Finish -" },
                ...finishes.map(f => ({ value: f.code, label: f.label }))
              ]}
            />
          </FieldRow>

          <FieldRow label="Design Status" hint="Where is this design in your internal process?">
            <SearchableSelect
              value={designStatus}
              onChange={setDesignStatus}
              options={designStatuses.map(s => ({ value: s.code, label: s.label }))}
            />
          </FieldRow>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", marginTop: "0.5rem" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-0)", marginBottom: "1rem" }}>
              Material & Environmental Requirements
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              <FieldRow label="Required Temp Min (°C)" required>
                <input
                  type="number"
                  className="input"
                  value={tempMin}
                  onChange={(e) => setTempMin(e.target.value)}
                  placeholder="e.g. -40"
                  required
                />
              </FieldRow>
              <FieldRow label="Required Temp Max (°C)" required>
                <input
                  type="number"
                  className="input"
                  value={tempMax}
                  onChange={(e) => setTempMax(e.target.value)}
                  placeholder="e.g. 120"
                  required
                />
              </FieldRow>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <FieldRow label="UV / Weathering Requirement" required>
                <SearchableSelect
                  value={uvReq}
                  onChange={setUvReq}
                  options={[
                    { value: "", label: "- Select UV requirement -" },
                    ...uvRequirements.map(u => ({ value: u.code, label: u.label }))
                  ]}
                />
              </FieldRow>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <FieldRow label="Chemical Resistance Requirement" required>
                <SearchableSelect
                  value={chemReq}
                  onChange={setChemReq}
                  options={[
                    { value: "", label: "- Select chemical resistance -" },
                    ...chemResistances.map(c => ({ value: c.code, label: c.label }))
                  ]}
                />
              </FieldRow>
            </div>
          </div>

          <FieldRow label="Design notes" hint="Anything reviewers should know upfront.">
            <textarea
              className="input"
              style={{ resize: "vertical" }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional context on why this colour/material was chosen."
            />
          </FieldRow>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-0)", marginBottom: "0.5rem" }}>
              Reference Documents{" "}
              <span style={{ fontSize: "0.6875rem", color: "var(--text-2)", fontWeight: 400 }}>
                (optional)
              </span>
            </div>

            {files.map((f, idx) => (
              <div key={idx} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-0)" }}>
                  {f.file.name}
                </span>
                <div style={{ width: 120 }}>
                  <SearchableSelect
                    value={f.type}
                    onChange={(val) => {
                      const next = [...files];
                      next[idx].type = val;
                      setFiles(next);
                    }}
                    options={[
                      { value: "Render", label: "3D Render (VRED)" },
                      { value: "Specification", label: "Material Specification" },
                      { value: "Datasheet", label: "Supplier Datasheet" },
                      { value: "Other", label: "Other" }
                    ]}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.375rem 0.625rem", fontSize: "0.75rem" }}
                  onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            ))}

            <input
              type="file"
              id="new-file-upload"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFiles([...files, { file: e.target.files[0], type: "Render" }]);
                  e.target.value = "";
                }
              }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: "0.75rem" }}
              onClick={() => document.getElementById("new-file-upload")?.click()}
            >
              + Add Document
            </button>
          </div>

          {error && (
            <div style={{
              padding: "8px 12px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "var(--r-sm)",
              color: "var(--red)",
              fontSize: "0.75rem"
            }}>
              {error}
            </div>
          )}

          <div style={{
            display: "flex",
            gap: "0.5rem",
            marginTop: "0.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border)",
            justifyContent: "flex-end"
          }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || !componentId.trim()}
              onClick={() => submit("draft")}
              title="Save the record without triggering team review"
            >
              {busy ? "Saving…" : "Save as Draft"}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              disabled={busy || requiredIncomplete || !isReadyForEngineering}
              onClick={() => submit("submitted")}
              title={submitTitle}
            >
              {busy ? "Submitting…" : "Submit for Review"}
            </button>
          </div>
        </form>

        {/* Live preview */}
        <div style={{ position: "sticky", top: "1rem" }}>
          {selectedMaterial ? (
            <MaterialContext material={selectedMaterial} decision={previewDecision} />
          ) : (
            <div className="card">
              <h3 style={{ marginBottom: "0.5rem" }}>Live Preview</h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-2)" }}>
                Select a material from the dropdown to see its DiMa properties, colour preview, and compatibility check here - as you fill the form.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RequiredMarker() {
  return <span style={{ color: "var(--red)", marginLeft: 2 }}>*</span>;
}

function FieldRow({
  label,
  required,
  hint,
  error,
  children
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-1)", marginBottom: "0.25rem", fontWeight: 500 }}>
        {label}
        {required && <RequiredMarker />}
      </label>
      {children}
      {hint && !error && (
        <div style={{ fontSize: "0.6875rem", marginTop: "0.25rem", color: "var(--text-3)" }}>{hint}</div>
      )}
      {error && (
        <div style={{ fontSize: "0.6875rem", marginTop: "0.25rem", color: "var(--red)" }}>{error}</div>
      )}
    </div>
  );
}
