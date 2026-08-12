import React from "react";

// Stable colour per name — same name always gets the same colour.
const COLOURS = [
  "#0ea5e9", "#8b5cf6", "#14b8a6", "#f59e0b", "#ef4444",
  "#ec4899", "#10b981", "#6366f1", "#f97316", "#06b6d4",
];

const initialsFor = (name) => {
  const cleaned = String(name || "").replace(/\([^)]*\)/g, " ");
  const parts = cleaned.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const colourFor = (name) => {
  const s = String(name || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return COLOURS[Math.abs(hash) % COLOURS.length];
};

export default function Avatar({ name, photoUrl, className = "", style = {} }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || "Staff"}
        className={`object-cover ${className}`}
        style={style}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center font-semibold text-white select-none ${className}`}
      style={{ backgroundColor: colourFor(name), fontSize: "1.1rem", ...style }}
      aria-label={name || "Staff"}
    >
      <span className="leading-none">{initialsFor(name)}</span>
    </div>
  );
}