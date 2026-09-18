import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ColourSwatch } from "./ColourPicker";
import type { Decision, Material, MasterColourCode } from "../types/db";

interface Props {
  material: Material | null;
  decision: Decision;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: "0.8125rem", color: "var(--text-0)", marginTop: "0.125rem", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

const SUBSTRATE_PATTERN: Record<string, string> = {
  Leather: "repeating-linear-gradient(135deg, transparent 0px, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
  Textile: "repeating-linear-gradient(45deg, transparent 0px, transparent 1px, rgba(255,255,255,0.04) 1px, rgba(255,255,255,0.04) 3px)",
  Al: "repeating-linear-gradient(90deg, transparent 0px, transparent 1px, rgba(255,255,255,0.06) 1px, rgba(255,255,255,0.06) 2px)",
  Cr: "repeating-linear-gradient(90deg, transparent 0px, transparent 1px, rgba(255,255,255,0.08) 1px, rgba(255,255,255,0.08) 2px)",
  ABS: "none",
  PP: "none",
  PC: "none",
  Paint: "none",
};

export default function MaterialContext({ material, decision }: Props) {
  const [colour, setColour] = useState<MasterColourCode | null>(null);
  const [linkedColour, setLinkedColour] = useState<MasterColourCode | null>(null);

  // Resolve the selected colour code
  useEffect(() => {
    if (!decision.colour_code) {
      setColour(null);
      return;
    }
    supabase
      .from("master_colour_codes")
      .select("*")
      .eq("code", decision.colour_code)
      .single()
      .then(({ data }) => setColour((data as MasterColourCode) ?? null));
  }, [decision.colour_code]);

  // Resolve the material's linked colour for mismatch detection
  useEffect(() => {
    if (!material?.linked_colour_code) {
      setLinkedColour(null);
      return;
    }
    supabase
      .from("master_colour_codes")
      .select("*")
      .eq("code", material.linked_colour_code)
      .single()
      .then(({ data }) => setLinkedColour((data as MasterColourCode) ?? null));
  }, [material?.linked_colour_code]);

  if (!material) {
    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Material context</h3>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-2)" }}>
          No material reference set on this decision. Add one (design) to pull properties from DiMa.
        </p>
      </div>
    );
  }

  // Mismatch detection
  const hasMismatch =
    material.linked_colour_code &&
    decision.colour_code &&
    material.linked_colour_code !== decision.colour_code;

  const glossLabel =
    material.gloss !== null
      ? material.gloss >= 80
        ? "High Gloss"
        : material.gloss >= 40
          ? "Semi-Gloss"
          : material.gloss >= 15
            ? "Satin"
            : "Matte"
      : null;

  const textureOverlay = material.substrate ? SUBSTRATE_PATTERN[material.substrate] || "none" : "none";
  const displayHex = colour?.hex_preview || "#2A2A30";

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginBottom: "1rem" }}>Material context (DiMa)</h3>

      {/* Mismatch Warning */}
      {hasMismatch && linkedColour && colour && (
        <div
          style={{
            background: "rgba(251, 191, 36, 0.08)",
            border: "1px solid rgba(251, 191, 36, 0.3)",
            borderRadius: "var(--r-sm)",
            padding: "0.625rem 0.75rem",
            marginBottom: "1rem",
            fontSize: "0.75rem",
            color: "var(--amber)",
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: "1rem", lineHeight: 1 }}>⚠️</span>
          <div>
            <strong>Colour-Material Mismatch:</strong> The material "{material.display_name}" is linked to{" "}
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <ColourSwatch hex={linkedColour.hex_preview} size={10} />
              <strong>{linkedColour.code}</strong> ({linkedColour.name})
            </span>
            , but Design has selected{" "}
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <ColourSwatch hex={colour.hex_preview} size={10} />
              <strong>{colour.code}</strong> ({colour.name})
            </span>
            . This may cause production issues.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
        <Field label="Code" value={material.code} />
        <Field label="Name" value={material.display_name} />
        <Field label="Substrate" value={material.substrate ?? "-"} />
        <Field
          label="Gloss"
          value={
            material.gloss != null ? (
              <span>
                {material.gloss}
                {glossLabel && <span style={{ color: "var(--text-2)", fontSize: "0.6875rem" }}> ({glossLabel})</span>}
              </span>
            ) : (
              "-"
            )
          }
        />
        <Field
          label="Temp range"
          value={`${material.temperature_min_c ?? "-"} to ${material.temperature_max_c ?? "-"} °C`}
        />
        {material.linked_colour_code && linkedColour && (
          <Field
            label="Linked colour"
            value={
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
                <ColourSwatch hex={linkedColour.hex_preview} size={12} />
                {linkedColour.code} - {linkedColour.name}
              </span>
            }
          />
        )}
      </div>
      {material.compatibility_notes && (
        <p style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: "1rem", fontStyle: "italic" }}>
          {material.compatibility_notes}
        </p>
      )}

      {/* Dynamic Colour Swatch Card - replaces VRED placeholder */}
      <div style={{ marginTop: "1.25rem" }}>
        <div
          style={{
            fontSize: "0.6875rem",
            color: "var(--text-2)",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
            letterSpacing: "0.04em",
          }}
        >
          Colour Preview
        </div>
        <div
          style={{
            borderRadius: "var(--r-md)",
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          {/* Large colour swatch / VRED Render */}
          <div
            style={{
              height: 140,
              background: displayHex,
              backgroundImage: textureOverlay,
              position: "relative",
              display: "flex",
              alignItems: "flex-end",
              padding: "0.75rem",
            }}
          >
            {material.vred_render_url ? (
              <img 
                src={material.vred_render_url} 
                alt="VRED 3D Render Preview" 
                style={{ 
                  position: "absolute", top: 0, left: 0, width: "100%", height: "100%", 
                  objectFit: "cover", zIndex: 1 
                }} 
              />
            ) : (
              /* Gloss highlight effect for metallic/pearl (Fallback) */
              colour && (colour.finish === "metallic" || colour.finish === "pearl") && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "60%",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)",
                    pointerEvents: "none",
                  }}
                />
              )
            )}
            <div
              style={{
                position: "absolute",
                top: "0.5rem",
                right: "0.5rem",
                background: "rgba(0,0,0,0.5)",
                color: "white",
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "0.5625rem",
                backdropFilter: "blur(4px)",
                zIndex: 2,
              }}
            >
              {material.vred_render_url ? "VRED 2D Render" : "MVP - AI Colour Preview"}
            </div>
          </div>

          {/* Metadata bar */}
          <div
            style={{
              background: "var(--bg-0)",
              padding: "0.625rem 0.75rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {colour && <ColourSwatch hex={colour.hex_preview} size={20} />}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--text-0)" }}>
                  {colour ? `${colour.code} - ${colour.name}` : decision.colour_code || "No colour selected"}
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-2)" }}>
                  {colour ? `${colour.finish} · ${colour.category}` : ""} · {material.display_name} ·{" "}
                  {glossLabel ? `Gloss ${material.gloss}` : ""}
                </div>
              </div>
            </div>
            {colour && (
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.6875rem",
                  color: "var(--text-2)",
                  background: "var(--bg-2)",
                  padding: "2px 6px",
                  borderRadius: "var(--r-sm)",
                }}
              >
                {colour.hex_preview}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
