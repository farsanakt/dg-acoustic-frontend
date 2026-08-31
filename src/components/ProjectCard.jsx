import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Clock, MapPin, Trash2, Edit2, ArrowRight,
  GitBranch, Building2, Hash, Wrench,
} from "lucide-react";

const STATUS_STYLES = {
  draft:            { label: "Draft",            bg: "#F1F5F9", color: "#64748B" },
  in_progress:      { label: "In Progress",      bg: "#EFF6FF", color: "#3B82F6" },
  sent_to_client:   { label: "Sent to Client",   bg: "#FAF5FF", color: "#8B5CF6" },
  client_reviewing: { label: "Client Reviewing", bg: "#FFFBEB", color: "#F59E0B" },
  revision_needed:  { label: "Revision Needed",  bg: "#FEF2F2", color: "#EF4444" },
  approved:         { label: "Approved",          bg: "#F0FDF4", color: "#22C55E" },
  completed:        { label: "Completed",         bg: "#E3F8F5", color: "#0E9F8E" },
};

const PROJECT_TYPE_LABEL = {
  residential: "Residential", hotel: "Hotel", commercial: "Commercial",
  hospital: "Hospital", industrial: "Industrial", data_centre: "Data Centre",
  mixed_use: "Mixed Use", other: "Other",
};

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB",
    { day: "2-digit", month: "short", year: "numeric" }) : "—";

function Meta({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6,
      color: "#64748B", fontSize: 12.5 }}>
      <Icon size={12} style={{ flexShrink: 0, color: "#94A3B8" }} />
      {label && <span style={{ color: "#94A3B8" }}>{label}:</span>}
      <span style={{ color: "#334155", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default function ProjectCard({ project, index, onDelete, onEdit }) {
  const navigate   = useNavigate();
  const s          = STATUS_STYLES[project.status] || STATUS_STYLES.draft;
  const typeLabel  = PROJECT_TYPE_LABEL[project.projectType] || "";
  const equipCount = (project.equipment || []).filter(e => e.type || e.tag).length;
  const detailUrl  = `/engineer/projects/${project._id}`;

  const goToDetail = (e) => {
    if (e) e.stopPropagation();
    navigate(detailUrl);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: 16,
        display: "flex", flexDirection: "column",
        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        position: "relative", overflow: "hidden",
      }}
      whileHover={{ y: -4, boxShadow: "0 8px 32px rgba(0,0,0,.10)", borderColor: "#2EC4B6" }}
    >
      {/* ── Clickable top section ── */}
      <div
        onClick={goToDetail}
        style={{ cursor: "pointer", flex: 1 }}
      >
        {/* Accent bar */}
        <div style={{ height: 3, background: "linear-gradient(90deg,#0E9F8E,#1B6CA8)" }} />

        <div style={{ padding: "18px 20px 14px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {project.jobNumber && (
                <p style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600,
                  fontFamily: "Inter,sans-serif", margin: "0 0 3px",
                  letterSpacing: ".04em", textTransform: "uppercase" }}>
                  {project.jobNumber}
                </p>
              )}
              <h3 style={{
                fontFamily: "Plus Jakarta Sans,sans-serif", fontWeight: 700,
                fontSize: 14.5, color: "#0F172A", margin: 0,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {project.name}
              </h3>
              {typeLabel && (
                <span style={{
                  display: "inline-block", marginTop: 5,
                  fontSize: 11, fontWeight: 600, color: "#3B82F6",
                  background: "#EFF6FF", borderRadius: 99, padding: "2px 8px",
                  fontFamily: "Inter,sans-serif",
                }}>
                  {typeLabel}
                </span>
              )}
            </div>
            <span style={{
              padding: "4px 10px", borderRadius: 99, flexShrink: 0,
              background: s.bg, color: s.color,
              fontSize: 11, fontWeight: 700,
              fontFamily: "Inter,sans-serif", whiteSpace: "nowrap",
            }}>
              {s.label}
            </span>
          </div>

          {/* Meta */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Meta icon={Building2} label="Client" value={project.clientName} />
            <Meta icon={MapPin}    label={null}    value={project.siteLocation} />
            {project.reportNumber && (
              <Meta icon={Hash} label="Report"
                value={`${project.reportNumber}${project.revision ? "  Rev. " + project.revision : ""}`} />
            )}
            {equipCount > 0 && (
              <Meta icon={Wrench} label={null}
                value={`${equipCount} equipment item${equipCount !== 1 ? "s" : ""}`} />
            )}
            <Meta icon={Clock} label={null} value={`Updated ${fmt(project.updatedAt)}`} />
          </div>
        </div>
      </div>

      {/* ── Footer: version + action buttons ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px 16px",
        borderTop: "1px solid #F1F5F9",
      }}>
        <div onClick={goToDetail}
          style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <GitBranch size={12} color="#0E9F8E" />
          <span style={{ fontSize: 11.5, color: "#0E9F8E", fontWeight: 700,
            fontFamily: "Inter,sans-serif" }}>
            v{project.currentVersion || 1}
          </span>
          <span style={{ fontSize: 11.5, color: "#CBD5E1" }}>·</span>
          <span style={{ fontSize: 11.5, color: "#94A3B8", fontFamily: "Inter,sans-serif" }}>
            {project.versions?.length || 1} version{(project.versions?.length || 1) !== 1 ? "s" : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: 5 }}>
          {/* Edit */}
          <button
            onClick={e => { e.stopPropagation(); onEdit(project); }}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: "1px solid #E2E8F0", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#64748B", cursor: "pointer", transition: "all .18s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#0E9F8E"; e.currentTarget.style.color = "#0E9F8E"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}
          >
            <Edit2 size={13} />
          </button>

          {/* Delete */}
          <button
            onClick={e => { e.stopPropagation(); onDelete(project); }}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: "1px solid #E2E8F0", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#64748B", cursor: "pointer", transition: "all .18s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.background = "#FEF2F2"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; e.currentTarget.style.background = "#fff"; }}
          >
            <Trash2 size={13} />
          </button>

          {/* Open */}
          <button
            onClick={goToDetail}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: "1px solid #0E9F8E", background: "#E3F8F5",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#0E9F8E", cursor: "pointer", transition: "all .18s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#0E9F8E"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#E3F8F5"; e.currentTarget.style.color = "#0E9F8E"; }}
          >
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}