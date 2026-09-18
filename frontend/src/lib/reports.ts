import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AI_SERVICE_URL } from "./supabase";
import type { Decision, MasterColourCode } from "../types/db";
import { supabase } from "./supabase";

async function summariseRecords(records: Decision[]): Promise<Record<string, string>> {
  if (records.length === 0) return {};
  try {
    const res = await fetch(`${AI_SERVICE_URL}/summarise`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decisions: records })
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const data = (await res.json()) as { summaries: { id: string; summary: string }[] };
    return Object.fromEntries(data.summaries.map((s) => [s.id, s.summary]));
  } catch {
    return Object.fromEntries(
      records.map((r) => [r.id, `${r.component_name}: ${r.colour_code ?? "-"} / ${r.material_reference ?? "-"}`])
    );
  }
}

async function loadColourMap(): Promise<Map<string, MasterColourCode>> {
  const { data } = await supabase.from("master_colour_codes").select("*");
  const map = new Map<string, MasterColourCode>();
  if (data) {
    (data as MasterColourCode[]).forEach(c => map.set(c.code, c));
  }
  return map;
}

async function loadProfileMap(): Promise<Map<string, string>> {
  const { data } = await supabase.from("profiles").select("id, full_name");
  const map = new Map<string, string>();
  if (data) {
    (data as { id: string; full_name: string }[]).forEach(p => map.set(p.id, p.full_name));
  }
  return map;
}

async function loadMaterialMap(): Promise<Map<string, any>> {
  const { data } = await supabase.from("materials").select("*");
  const map = new Map<string, any>();
  if (data) {
    (data as any[]).forEach(m => map.set(m.code, m));
  }
  return map;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

// ============================================================
// MELDELISTE - Professional VW-style Excel
// ============================================================

export async function exportMeldeliste(records: Decision[]) {
  const [summaries, colourMap, profileMap, materialMap] = await Promise.all([
    summariseRecords(records),
    loadColourMap(),
    loadProfileMap(),
    loadMaterialMap()
  ]);

  const kw = getCurrentWeek();
  const dateStr = new Date().toLocaleDateString("en-GB");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Chroma Sync";
  wb.created = new Date();
  const ws = wb.addWorksheet("Meldeliste", {
    properties: { defaultColWidth: 16 }
  });

  // ── Header rows ──
  ws.mergeCells("A1:W1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `Volkswagen Group - Meldeliste - Colour & Trim Decisions - KW ${kw} / ${new Date().getFullYear()}`;
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A2E" } };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(1).height = 32;

  ws.mergeCells("A2:W2");
  const subCell = ws.getCell("A2");
  subCell.value = `Generated: ${dateStr} · Approved decisions only · Chroma Sync MVP`;
  subCell.font = { size: 9, italic: true, color: { argb: "FF888888" } };
  subCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(2).height = 20;

  // ── Column definitions ──
  ws.columns = [
    { key: "nr", width: 7 },
    { key: "component", width: 28 },
    { key: "area", width: 24 },
    { key: "colourCode", width: 12 },
    { key: "colourName", width: 26 },
    { key: "finish", width: 12 },
    { key: "materialRef", width: 14 },
    { key: "materialName", width: 24 },
    { key: "substrate", width: 12 },
    { key: "gloss", width: 8 },
    { key: "supplier", width: 24 },
    { key: "leadTime", width: 12 },
    { key: "unitPrice", width: 12 },
    { key: "approvedBy", width: 18 },
    { key: "aiRating", width: 10 },
    { key: "rc1", width: 8 },
    { key: "rc2", width: 8 },
    { key: "rc3", width: 8 },
    { key: "rc4", width: 8 },
    { key: "rc5", width: 8 },
    { key: "rc6", width: 8 },
    { key: "summary", width: 50 },
    { key: "version", width: 8 },
  ];

  // ── Header row ──
  const headerRow = ws.addRow({
    nr: "Lfd. Nr.",
    component: "Bauteil / Component",
    area: "Geschäftsbereich / Area",
    colourCode: "Farb-Code",
    colourName: "Farbname / Colour Name",
    finish: "Oberfläche",
    materialRef: "Material-Ref.",
    materialName: "Material-Name",
    substrate: "Substrat",
    gloss: "Glanz",
    supplier: "Lieferant / Supplier",
    leadTime: "Vorlaufzeit",
    unitPrice: "Stückpreis (€)",
    approvedBy: "Freigabe / Approved",
    aiRating: "AI Rating",
    rc1: "RC-1 Lifecycle",
    rc2: "RC-2 Compliance",
    rc3: "RC-3 Lead time",
    rc4: "RC-4 Visual",
    rc5: "RC-5 RBAC",
    rc6: "RC-6 Conflict",
    summary: "AI Zusammenfassung",
    version: "Version",
  });
  headerRow.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D2D44" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.height = 28;

  // ── Data rows ──
  records.forEach((r, idx) => {
    const colour = r.colour_code ? colourMap.get(r.colour_code) : null;
    const approver = r.submitted_by ? profileMap.get(r.submitted_by) : null;
    const material = r.material_reference ? materialMap.get(r.material_reference) : null;

    const row = ws.addRow({
      nr: idx + 1,
      component: r.component_name,
      area: r.business_area,
      colourCode: r.colour_code ?? "",
      colourName: colour?.name ?? "",
      finish: colour?.finish ?? "",
      materialRef: r.material_reference ?? "",
      materialName: material?.display_name ?? "",
      substrate: material?.substrate ?? "",
      gloss: material?.gloss ?? "",
      supplier: r.supplier ?? "",
      leadTime: r.lead_time_days ? `${r.lead_time_days} days` : "",
      unitPrice: r.price_per_unit_cents ? (r.price_per_unit_cents / 100).toFixed(2) : "",
      approvedBy: approver ?? "",
      aiRating: r.ai_rating ?? "",
      rc1: r.rc1_lifecycle ?? "",
      rc2: r.rc2_compliance ?? "",
      rc3: r.rc3_lead_time ?? "",
      rc4: r.rc4_visual ?? "",
      rc5: r.rc5_approval_rbac ?? "",
      rc6: r.rc6_conflict ?? "",
      summary: summaries[r.id] ?? "",
      version: `v${r.version ?? 1}`,
    });

    // Alternate row colours
    if (idx % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F8FA" } };
    }

    // Colour-code AI rating cells
    const aiCell = row.getCell("aiRating");
    if (r.ai_rating === "green") {
      aiCell.font = { color: { argb: "FF16A34A" }, bold: true };
    } else if (r.ai_rating === "yellow") {
      aiCell.font = { color: { argb: "FFFBBF24" }, bold: true };
    } else if (r.ai_rating === "red") {
      aiCell.font = { color: { argb: "FFEF4444" }, bold: true };
    }

    // Colour-code per-criterion cells (RC-1 … RC-6) the same way.
    for (const key of ["rc1", "rc2", "rc3", "rc4", "rc5", "rc6"] as const) {
      const cell = row.getCell(key);
      const v = cell.value as string | undefined;
      if (v === "green") cell.font = { color: { argb: "FF16A34A" }, bold: true };
      else if (v === "yellow") cell.font = { color: { argb: "FFFBBF24" }, bold: true };
      else if (v === "red") cell.font = { color: { argb: "FFEF4444" }, bold: true };
    }

    // Add colour swatch-like fill to colourCode cell if we have a hex
    if (colour?.hex_preview) {
      const hex = colour.hex_preview.replace("#", "FF");
      row.getCell("colourCode").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: hex }
      };
      // Ensure text is readable
      const isLight = parseInt(hex.substring(2, 4), 16) * 0.299 +
                       parseInt(hex.substring(4, 6), 16) * 0.587 +
                       parseInt(hex.substring(6, 8), 16) * 0.114 > 186;
      row.getCell("colourCode").font = {
        color: { argb: isLight ? "FF000000" : "FFFFFFFF" },
        bold: true,
        size: 10
      };
    }

    row.alignment = { vertical: "middle", wrapText: true };
    row.height = 22;
  });

  // ── Borders ──
  const lastRow = ws.lastRow?.number ?? 3;
  for (let r = 3; r <= lastRow; r++) {
    for (let c = 1; c <= 23; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        left: { style: "thin", color: { argb: "FFE0E0E0" } },
        right: { style: "thin", color: { argb: "FFE0E0E0" } },
      };
    }
  }

  // ── Freeze panes ──
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 3, activeCell: "A4" }];

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf]), `meldeliste-KW${kw}-${new Date().toISOString().slice(0, 10)}.xlsx`);

  // Log download
  const { data: { session } } = await supabase.auth.getSession();
  await supabase.from("audit_log").insert({
    table_name: "decisions",
    row_id: "00000000-0000-0000-0000-000000000000",
    action: "DOWNLOAD" as any,
    changed_by: session?.user?.id || null,
    new_values: { report: "Meldeliste", count: records.length, kw }
  });
}


// ============================================================
// COLOUR-MIX-CHART - Professional VW-style PDF
// ============================================================

export async function exportColourMixChart(records: Decision[]) {
  const colourMap = await loadColourMap();
  const kw = getCurrentWeek();
  const dateStr = new Date().toLocaleDateString("en-GB");

  const doc = new jsPDF({ orientation: "landscape" });

  // ── Header ──
  doc.setFillColor(26, 26, 46);
  doc.rect(0, 0, 297, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Volkswagen Group - Colour-Mix-Chart", 14, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`KW ${kw} / ${new Date().getFullYear()} · Generated ${dateStr} · Chroma Sync MVP`, 14, 19);

  // ── Group by business area ──
  const grouped = new Map<string, Decision[]>();
  for (const r of records) {
    const area = r.business_area || "Other";
    if (!grouped.has(area)) grouped.set(area, []);
    grouped.get(area)!.push(r);
  }

  let startY = 30;

  for (const [area, decisions] of grouped) {
    // Area header
    if (startY > 170) {
      doc.addPage();
      startY = 16;
    }

    doc.setTextColor(26, 26, 46);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(area, 14, startY);
    startY += 2;

    const rows = decisions.map((r) => {
      const colour = r.colour_code ? colourMap.get(r.colour_code) : null;
      return [
        "", // Swatch column (drawn manually)
        r.colour_code ?? "-",
        colour?.name ?? "-",
        colour?.finish ?? "-",
        r.component_name,
        r.material_reference ?? "-",
        r.status.replace("_", " "),
        r.ai_rating ?? "-",
        `v${r.version ?? 1}`,
      ];
    });

    autoTable(doc, {
      head: [["", "Code", "Colour Name", "Finish", "Component", "Material", "Status", "AI", "Ver."]],
      body: rows,
      startY: startY,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [45, 45, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 18, fontStyle: "bold" },
        2: { cellWidth: 40 },
        3: { cellWidth: 22 },
        4: { cellWidth: 50 },
        5: { cellWidth: 28 },
        6: { cellWidth: 22 },
        7: { cellWidth: 14 },
        8: { cellWidth: 12 },
      },
      didDrawCell: (data: any) => {
        // Draw colour swatch in column 0 (body rows only)
        if (data.section === "body" && data.column.index === 0) {
          const decision = decisions[data.row.index];
          if (decision) {
            const colour = decision.colour_code ? colourMap.get(decision.colour_code) : null;
            if (colour) {
              const hex = colour.hex_preview;
              const r = parseInt(hex.substring(1, 3), 16);
              const g = parseInt(hex.substring(3, 5), 16);
              const b = parseInt(hex.substring(5, 7), 16);
              doc.setFillColor(r, g, b);
              doc.roundedRect(data.cell.x + 2, data.cell.y + 2, 8, data.cell.height - 4, 1, 1, "F");
            }
          }
        }
        // Color-code AI column
        if (data.section === "body" && data.column.index === 7) {
          const val = data.cell.text?.[0];
          if (val === "green") doc.setTextColor(22, 163, 74);
          else if (val === "yellow") doc.setTextColor(202, 138, 4);
          else if (val === "red") doc.setTextColor(220, 38, 38);
        }
      },
      didParseCell: (data: any) => {
        // Reset text colour after AI column
        if (data.section === "body" && data.column.index !== 7) {
          data.cell.styles.textColor = [30, 30, 30];
        }
      },
    });

    startY = (doc as any).lastAutoTable?.finalY + 8 || startY + 40;
  }

  // ── Footer on each page ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Chroma Sync - Colour-Mix-Chart - Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
    doc.text(
      `Generated: ${new Date().toISOString()}`,
      doc.internal.pageSize.getWidth() - 80,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  doc.save(`colour-mix-chart-KW${kw}-${new Date().toISOString().slice(0, 10)}.pdf`);

  // Log download
  const { data: { session } } = await supabase.auth.getSession();
  await supabase.from("audit_log").insert({
    table_name: "decisions",
    row_id: "00000000-0000-0000-0000-000000000000",
    action: "DOWNLOAD" as any,
    changed_by: session?.user?.id || null,
    new_values: { report: "Colour-Mix-Chart", count: records.length, kw }
  });
}
