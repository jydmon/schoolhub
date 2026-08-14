"use client";

// Reusable user avatar: shows the uploaded photo, or initials as a fallback.
// Used across the portal header, user directories, messaging and profiles so a
// person looks the same everywhere.
export default function Avatar({ name, src, size = 32, title }: { name?: string | null; src?: string | null; size?: number; title?: string }) {
  const initials = (name || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: Math.round(size * 0.42), fontWeight: 700, lineHeight: 1,
    background: "#e0e7ff", color: "#3730a3", border: "1px solid var(--line, #d7deea)",
    overflow: "hidden", verticalAlign: "middle",
  };
  if (src) return <img src={src} alt={name || "avatar"} title={title || name || undefined} style={{ ...base, objectFit: "cover" }} />;
  return <span style={base} title={title || name || undefined} aria-hidden>{initials}</span>;
}
