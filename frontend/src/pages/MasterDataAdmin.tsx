import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import type { MasterFeasibilityStatus, MasterTechnicalConstraint, MasterSupplier, MasterBusinessArea } from "../types/db";

export default function MasterDataAdmin() {
  const { profile } = useAuth();
  
  const [statuses, setStatuses] = useState<MasterFeasibilityStatus[]>([]);
  const [constraints, setConstraints] = useState<MasterTechnicalConstraint[]>([]);
  const [suppliers, setSuppliers] = useState<MasterSupplier[]>([]);
  const [businessAreas, setBusinessAreas] = useState<MasterBusinessArea[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [vreds, setVreds] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newStatusCode, setNewStatusCode] = useState("");
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newConstraintCode, setNewConstraintCode] = useState("");
  const [newConstraintLabel, setNewConstraintLabel] = useState("");

  const [newSupplierCode, setNewSupplierCode] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");

  const [newAreaCode, setNewAreaCode] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaParent, setNewAreaParent] = useState("");

  const [newComponentId, setNewComponentId] = useState("");
  const [newComponentName, setNewComponentName] = useState("");
  const [newComponentZone, setNewComponentZone] = useState("");
  const [newComponentProgram, setNewComponentProgram] = useState("");

  const [materials, setMaterials] = useState<any[]>([]);
  const [newMaterialCode, setNewMaterialCode] = useState("");
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialSubstrate, setNewMaterialSubstrate] = useState("");
  const [newMaterialLifecycle, setNewMaterialLifecycle] = useState("active");
  const [newMaterialCompliance, setNewMaterialCompliance] = useState("pending");
  const [newMaterialLeadTime, setNewMaterialLeadTime] = useState("");

  const [newVredId, setNewVredId] = useState("");
  const [newVredComponent, setNewVredComponent] = useState("");
  const [newVredMaterial, setNewVredMaterial] = useState("");
  const [newVredStatus, setNewVredStatus] = useState("rendered");
  const [newVredMatch, setNewVredMatch] = useState("match");

  const isLead = profile?.is_project_lead ?? false;

  async function loadData() {
    setLoading(true);
    const [statusRes, constraintRes, supplierRes, areaRes, materialRes, componentsRes, vredRes] = await Promise.all([
      supabase.from("master_feasibility_statuses").select("*").order("code"),
      supabase.from("master_technical_constraints").select("*").order("code"),
      supabase.from("master_suppliers").select("*").order("code"),
      supabase.from("master_business_areas").select("*").order("code"),
      supabase.from("materials").select("*").order("code"),
      supabase.from("components").select("*").order("id"),
      supabase.from("vred_visualizations").select("*").order("created_at", { ascending: false })
    ]);

    if (statusRes.error) setError(statusRes.error.message);
    else setStatuses(statusRes.data as MasterFeasibilityStatus[]);

    if (constraintRes.error) setError(constraintRes.error.message);
    else setConstraints(constraintRes.data as MasterTechnicalConstraint[]);

    if (supplierRes.error) setError(supplierRes.error.message);
    else setSuppliers(supplierRes.data as MasterSupplier[]);

    if (areaRes.error) setError(areaRes.error.message);
    else setBusinessAreas(areaRes.data as MasterBusinessArea[]);
    
    if (materialRes.error) setError(materialRes.error.message);
    else setMaterials(materialRes.data || []);

    if (componentsRes.error) setError(componentsRes.error.message);
    else setComponents(componentsRes.data || []);

    if (vredRes.error) setError(vredRes.error.message);
    else setVreds(vredRes.data || []);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // Helper to format business areas hierarchically
  const formattedBusinessAreas = useMemo(() => {
    const map = new Map<string, MasterBusinessArea>();
    businessAreas.forEach(a => map.set(a.id, a));

    const getPath = (area: MasterBusinessArea): string => {
      if (!area.parent_id || !map.has(area.parent_id)) return area.name;
      return `${getPath(map.get(area.parent_id)!)} > ${area.name}`;
    };

    return businessAreas.map(a => ({
      ...a,
      path: getPath(a)
    })).sort((a, b) => a.path.localeCompare(b.path));
  }, [businessAreas]);

  async function toggleStatus(code: string, isActive: boolean) {
    const { error } = await supabase.from("master_feasibility_statuses").update({ is_active: !isActive }).eq("code", code);
    if (!error) loadData(); else setError(error.message);
  }

  async function toggleConstraint(code: string, isActive: boolean) {
    const { error } = await supabase.from("master_technical_constraints").update({ is_active: !isActive }).eq("code", code);
    if (!error) loadData(); else setError(error.message);
  }

  async function toggleSupplier(code: string, isActive: boolean) {
    const { error } = await supabase.from("master_suppliers").update({ is_active: !isActive }).eq("code", code);
    if (!error) loadData(); else setError(error.message);
  }

  async function toggleArea(code: string, isActive: boolean) {
    const { error } = await supabase.from("master_business_areas").update({ is_active: !isActive }).eq("code", code);
    if (!error) loadData(); else setError(error.message);
  }

  async function addStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!newStatusCode || !newStatusLabel) return;
    const { error } = await supabase.from("master_feasibility_statuses").insert({ code: newStatusCode, label: newStatusLabel });
    if (error) setError(error.message);
    else { setNewStatusCode(""); setNewStatusLabel(""); loadData(); }
  }

  async function addConstraint(e: React.FormEvent) {
    e.preventDefault();
    if (!newConstraintCode || !newConstraintLabel) return;
    const { error } = await supabase.from("master_technical_constraints").insert({ code: newConstraintCode, label: newConstraintLabel });
    if (error) setError(error.message);
    else { setNewConstraintCode(""); setNewConstraintLabel(""); loadData(); }
  }

  async function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!newSupplierCode || !newSupplierName) return;
    const { error } = await supabase.from("master_suppliers").insert({ code: newSupplierCode, name: newSupplierName });
    if (error) setError(error.message);
    else { setNewSupplierCode(""); setNewSupplierName(""); loadData(); }
  }

  async function addArea(e: React.FormEvent) {
    e.preventDefault();
    if (!newAreaCode || !newAreaName) return;
    const { error } = await supabase.from("master_business_areas").insert({ 
      code: newAreaCode, 
      name: newAreaName,
      parent_id: newAreaParent || null
    });
    if (error) setError(error.message);
    else { setNewAreaCode(""); setNewAreaName(""); setNewAreaParent(""); loadData(); }
  }

  async function addComponent(e: React.FormEvent) {
    e.preventDefault();
    if (!newComponentId || !newComponentName || !newComponentZone || !newComponentProgram) return;
    const { error } = await supabase.from("components").insert({ 
      id: newComponentId, 
      name: newComponentName,
      zone: newComponentZone,
      vehicle_program: newComponentProgram
    });
    if (error) setError(error.message);
    else { 
      setNewComponentId(""); 
      setNewComponentName(""); 
      setNewComponentZone("");
      setNewComponentProgram("");
      loadData(); 
    }
  }

  async function addMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!newMaterialCode || !newMaterialName) return;
    const { error } = await supabase.from("materials").insert({ 
      code: newMaterialCode, 
      display_name: newMaterialName,
      substrate: newMaterialSubstrate || null,
      lifecycle_status: newMaterialLifecycle as any,
      compliance_status: newMaterialCompliance as any,
      lead_time_weeks: newMaterialLeadTime ? parseInt(newMaterialLeadTime) : null
    });
    if (error) setError(error.message);
    else { 
      setNewMaterialCode(""); 
      setNewMaterialName(""); 
      setNewMaterialSubstrate(""); 
      setNewMaterialLifecycle("active");
      setNewMaterialCompliance("pending");
      setNewMaterialLeadTime("");
      loadData(); 
    }
  }

  async function deleteMaterial(code: string) {
    const { error } = await supabase.from("materials").delete().eq("code", code);
    if (error) setError(error.message);
    else loadData();
  }

  async function updateMaterialHackathonFields(code: string, field: string, value: any) {
    const { error } = await supabase.from("materials").update({ [field]: value } as any).eq("code", code);
    if (error) setError(error.message);
    else loadData();
  }

  async function addVred(e: React.FormEvent) {
    e.preventDefault();
    if (!newVredId || !newVredComponent || !newVredMaterial) return;
    const { error } = await supabase.from("vred_visualizations").insert({
      id: newVredId,
      component_id: newVredComponent,
      material_code: newVredMaterial,
      render_status: newVredStatus as any,
      visual_match: newVredMatch as any,
      last_rendered: newVredStatus === 'rendered' ? new Date().toISOString() : null
    });
    if (error) setError(error.message);
    else {
      setNewVredId("");
      setNewVredComponent("");
      setNewVredMaterial("");
      setNewVredStatus("rendered");
      setNewVredMatch("match");
      loadData();
    }
  }

  async function deleteVred(id: string) {
    const { error } = await supabase.from("vred_visualizations").delete().eq("id", id);
    if (error) setError(error.message);
    else loadData();
  }

  if (!isLead) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--red)" }}>
        Access Denied. Only Project Leads can manage Master Data.
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Master Data Management</h1>
      
      {error && (
        <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.1)", color: "var(--red)", borderRadius: "var(--r-md)", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-2)" }}>Loading...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          <div className="card">
            <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Business Areas (Product Tree)</h2>
            
            <form onSubmit={addArea} style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Code (e.g. INT-NEW)</label>
                <input className="input" value={newAreaCode} onChange={e => setNewAreaCode(e.target.value)} required />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Name</label>
                <input className="input" value={newAreaName} onChange={e => setNewAreaName(e.target.value)} required />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Parent Area</label>
                <select className="input" value={newAreaParent} onChange={e => setNewAreaParent(e.target.value)}>
                  <option value="">-- Root Level --</option>
                  {formattedBusinessAreas.map(a => (
                    <option key={a.id} value={a.id}>{a.path}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-accent" style={{ height: "40px" }}>Add Area</button>
            </form>

            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-2)", fontSize: "0.75rem" }}>
                  <th style={{ padding: "0.5rem" }}>Code</th>
                  <th style={{ padding: "0.5rem" }}>Path</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {formattedBusinessAreas.map(s => (
                  <tr key={s.code} style={{ borderBottom: "1px solid var(--bg-1)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>{s.code}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{s.path}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <span className={`badge ${s.is_active ? "badge-green" : "badge-red"}`}>
                        {s.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                      <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => toggleArea(s.code, s.is_active)}>
                        {s.is_active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Components</h2>
            
            <form onSubmit={addComponent} style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>ID (e.g. CMP-01)</label>
                <input className="input" value={newComponentId} onChange={e => setNewComponentId(e.target.value)} required />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Name</label>
                <input className="input" value={newComponentName} onChange={e => setNewComponentName(e.target.value)} required />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Zone</label>
                <input className="input" value={newComponentZone} onChange={e => setNewComponentZone(e.target.value)} required />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Vehicle Program</label>
                <input className="input" value={newComponentProgram} onChange={e => setNewComponentProgram(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-accent" style={{ height: "40px" }}>Add Component</button>
            </form>

            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-2)", fontSize: "0.75rem" }}>
                  <th style={{ padding: "0.5rem" }}>ID</th>
                  <th style={{ padding: "0.5rem" }}>Name</th>
                  <th style={{ padding: "0.5rem" }}>Zone</th>
                  <th style={{ padding: "0.5rem" }}>Program</th>
                </tr>
              </thead>
              <tbody>
                {components.map(c => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--bg-1)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>{c.id}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{c.name}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{c.zone}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{c.vehicle_program}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Suppliers (Vendor Master)</h2>
            
            <form onSubmit={addSupplier} style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Vendor ID (e.g. V-001)</label>
                <input className="input" value={newSupplierCode} onChange={e => setNewSupplierCode(e.target.value)} required />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Vendor Name</label>
                <input className="input" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-accent" style={{ height: "40px" }}>Add Supplier</button>
            </form>

            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-2)", fontSize: "0.75rem" }}>
                  <th style={{ padding: "0.5rem" }}>Vendor ID</th>
                  <th style={{ padding: "0.5rem" }}>Name</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.code} style={{ borderBottom: "1px solid var(--bg-1)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>{s.code}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{s.name}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <span className={`badge ${s.is_active ? "badge-green" : "badge-red"}`}>
                        {s.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                      <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => toggleSupplier(s.code, s.is_active)}>
                        {s.is_active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Feasibility Statuses</h2>
            
            <form onSubmit={addStatus} style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Code (e.g. FEASIBLE_NEW)</label>
                <input className="input" value={newStatusCode} onChange={e => setNewStatusCode(e.target.value)} required />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Label</label>
                <input className="input" value={newStatusLabel} onChange={e => setNewStatusLabel(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-accent" style={{ height: "40px" }}>Add Status</button>
            </form>

            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-2)", fontSize: "0.75rem" }}>
                  <th style={{ padding: "0.5rem" }}>Code</th>
                  <th style={{ padding: "0.5rem" }}>Label</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {statuses.map(s => (
                  <tr key={s.code} style={{ borderBottom: "1px solid var(--bg-1)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>{s.code}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{s.label}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <span className={`badge ${s.is_active ? "badge-green" : "badge-red"}`}>
                        {s.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                      <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => toggleStatus(s.code, s.is_active)}>
                        {s.is_active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Technical Constraints</h2>
            
            <form onSubmit={addConstraint} style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Code (e.g. ERR_NEW)</label>
                <input className="input" value={newConstraintCode} onChange={e => setNewConstraintCode(e.target.value)} required />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Label</label>
                <input className="input" value={newConstraintLabel} onChange={e => setNewConstraintLabel(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-accent" style={{ height: "40px" }}>Add Constraint</button>
            </form>

            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-2)", fontSize: "0.75rem" }}>
                  <th style={{ padding: "0.5rem" }}>Code</th>
                  <th style={{ padding: "0.5rem" }}>Label</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {constraints.map(c => (
                  <tr key={c.code} style={{ borderBottom: "1px solid var(--bg-1)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>{c.code}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{c.label}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <span className={`badge ${c.is_active ? "badge-green" : "badge-red"}`}>
                        {c.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                      <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => toggleConstraint(c.code, c.is_active)}>
                        {c.is_active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>Materials (DiMa Catalogue)</h2>
            <p style={{ fontSize: "0.875rem", color: "var(--text-2)", marginBottom: "1rem" }}>
              In a true enterprise setup, this data syncs automatically from an external PLM system via API. For this standalone SaaS tier, you can manage it manually here.
            </p>
            
            <form onSubmit={addMaterial} style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Code (e.g. MAT-2001)</label>
                <input className="input" value={newMaterialCode} onChange={e => setNewMaterialCode(e.target.value)} required />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Name</label>
                <input className="input" value={newMaterialName} onChange={e => setNewMaterialName(e.target.value)} required />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Lifecycle</label>
                <select className="input" value={newMaterialLifecycle} onChange={e => setNewMaterialLifecycle(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="deprecated">Deprecated</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Compliance</label>
                <select className="input" value={newMaterialCompliance} onChange={e => setNewMaterialCompliance(e.target.value)}>
                  <option value="pass">Pass</option>
                  <option value="pending">Pending</option>
                  <option value="fail">Fail</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: "100px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Lead (wks)</label>
                <input type="number" className="input" value={newMaterialLeadTime} onChange={e => setNewMaterialLeadTime(e.target.value)} placeholder="e.g. 4" />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Substrate</label>
                <input className="input" value={newMaterialSubstrate} onChange={e => setNewMaterialSubstrate(e.target.value)} placeholder="(Optional) e.g. ABS" />
              </div>
              <button type="submit" className="btn btn-accent" style={{ height: "40px" }}>Add Material</button>
            </form>

            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-2)", fontSize: "0.75rem" }}>
                  <th style={{ padding: "0.5rem" }}>Code</th>
                  <th style={{ padding: "0.5rem" }}>Display Name</th>
                  <th style={{ padding: "0.5rem" }}>Lifecycle</th>
                  <th style={{ padding: "0.5rem" }}>Compliance</th>
                  <th style={{ padding: "0.5rem" }}>Lead Time</th>
                  <th style={{ padding: "0.5rem" }}>Substrate</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {materials.map(s => (
                  <tr key={s.code} style={{ borderBottom: "1px solid var(--bg-1)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>{s.code}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{s.display_name}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <select 
                        value={s.lifecycle_status || ""} 
                        onChange={(e) => updateMaterialHackathonFields(s.code, "lifecycle_status", e.target.value)}
                        style={{ padding: "4px", fontSize: "12px", border: "1px solid var(--border)", borderRadius: "4px" }}
                      >
                        <option value="">-- Set --</option>
                        <option value="active">Active</option>
                        <option value="deprecated">Deprecated</option>
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <select 
                        value={s.compliance_status || ""} 
                        onChange={(e) => updateMaterialHackathonFields(s.code, "compliance_status", e.target.value)}
                        style={{ padding: "4px", fontSize: "12px", border: "1px solid var(--border)", borderRadius: "4px" }}
                      >
                        <option value="">-- Set --</option>
                        <option value="pass">Pass</option>
                        <option value="pending">Pending</option>
                        <option value="fail">Fail</option>
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <input 
                        type="number" 
                        value={s.lead_time_weeks || ""} 
                        onChange={(e) => updateMaterialHackathonFields(s.code, "lead_time_weeks", parseInt(e.target.value))}
                        style={{ width: "60px", padding: "4px", fontSize: "12px", border: "1px solid var(--border)", borderRadius: "4px" }} 
                      /> wks
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{s.substrate || "-"}</td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                      <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", color: "var(--red)" }} onClick={() => deleteMaterial(s.code)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {materials.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "1rem", textAlign: "center", color: "var(--text-3)" }}>No materials defined.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem" }}>VRED Visualizations</h2>
            <p style={{ fontSize: "0.875rem", color: "var(--text-2)", marginBottom: "1rem" }}>
              Manage render statuses and visual match results for Component-Material pairings.
            </p>
            
            <form onSubmit={addVred} style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>VRED ID (e.g. VRD-020)</label>
                <input className="input" value={newVredId} onChange={e => setNewVredId(e.target.value)} required />
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Component</label>
                <select className="input" value={newVredComponent} onChange={e => setNewVredComponent(e.target.value)} required>
                  <option value="">-- Select --</option>
                  {components.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Material</label>
                <select className="input" value={newVredMaterial} onChange={e => setNewVredMaterial(e.target.value)} required>
                  <option value="">-- Select --</option>
                  {materials.map(m => <option key={m.code} value={m.code}>{m.code}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Render Status</label>
                <select className="input" value={newVredStatus} onChange={e => setNewVredStatus(e.target.value)}>
                  <option value="rendered">Rendered</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Visual Match</label>
                <select className="input" value={newVredMatch} onChange={e => setNewVredMatch(e.target.value)}>
                  <option value="match">Match</option>
                  <option value="mismatch">Mismatch</option>
                </select>
              </div>
              <button type="submit" className="btn btn-accent" style={{ height: "40px" }}>Add Render</button>
            </form>

            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-2)", fontSize: "0.75rem" }}>
                  <th style={{ padding: "0.5rem" }}>ID</th>
                  <th style={{ padding: "0.5rem" }}>Component</th>
                  <th style={{ padding: "0.5rem" }}>Material</th>
                  <th style={{ padding: "0.5rem" }}>Render Status</th>
                  <th style={{ padding: "0.5rem" }}>Visual Match</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vreds.map(v => (
                  <tr key={v.id} style={{ borderBottom: "1px solid var(--bg-1)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>{v.id}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{v.component_id}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{v.material_code}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <span className={`badge ${v.render_status === "rendered" ? "badge-green" : "badge-gray"}`}>
                        {v.render_status}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <span className={`badge ${v.visual_match === "match" ? "badge-green" : "badge-red"}`}>
                        {v.visual_match}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                      <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", color: "var(--red)" }} onClick={() => deleteVred(v.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {vreds.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "1rem", textAlign: "center", color: "var(--text-3)" }}>No VRED renders found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
