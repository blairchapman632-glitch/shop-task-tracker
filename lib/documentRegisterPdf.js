// QSPP Document Register PDF (replaces the Word Document Review Register). Layout: lib/registerPdf.
// Lists whatever /qspp → Library → List (the Document Register) is currently showing (its filters apply).
import { buildRegisterPdf } from "./registerPdf";

// Widths add up to the printable width (≈ 769)
const COLS = [
  { key: "folder", label: "Folder", w: 150 },
  { key: "title", label: "Title", w: 215 },
  { key: "version", label: "Version", w: 45 },
  { key: "updated", label: "Last updated", w: 70 },
  { key: "updatedBy", label: "Updated by", w: 85 },
  { key: "review", label: "Review date", w: 70 },
  { key: "status", label: "Status", w: 134 },
];

// input: { pharmacyName, generatedOn (YYYY-MM-DD), generatedBy, filterLabel,
//          rows: [{ folder, title, version, updated, updatedBy, review, reviewOverdue, status }] } (all display strings)
// -> { bytes, warnings }
export function buildDocumentRegisterPdf({ pharmacyName, generatedOn, generatedBy, filterLabel, rows }) {
  return buildRegisterPdf({
    heading: "Document Register", pharmacyName, generatedOn, generatedBy, filterLabel, itemWord: "document",
    columns: COLS,
    rows: rows.map((r) => ({ ...r, _red: r.reviewOverdue ? ["review"] : [] })),
  });
}
