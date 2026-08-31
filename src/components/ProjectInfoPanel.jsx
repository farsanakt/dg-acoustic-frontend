import { Building2, MapPin, Hash, Wrench, Tag,
  HardHat, Users, Calendar, FileText } from "lucide-react";

const PROJECT_TYPE_LABEL = {
  residential:"Residential", hotel:"Hotel", commercial:"Commercial",
  hospital:"Hospital", industrial:"Industrial", data_centre:"Data Centre",
  mixed_use:"Mixed Use", other:"Other",
};

const STATUS_STYLES = {
  draft:            { label:"Draft",             bg:"#F1F5F9", color:"#64748B" },
  in_progress:      { label:"In Progress",       bg:"#EFF6FF", color:"#3B82F6" },
  sent_to_client:   { label:"Sent to Client",    bg:"#FAF5FF", color:"#8B5CF6" },
  client_reviewing: { label:"Client Reviewing",  bg:"#FFFBEB", color:"#F59E0B" },
  revision_needed:  { label:"Revision Needed",   bg:"#FEF2F2", color:"#EF4444" },
  approved:         { label:"Approved",           bg:"#F0FDF4", color:"#22C55E" },
  completed:        { label:"Completed",          bg:"#E3F8F5", color:"#0E9F8E" },
};

function InfoRow({ icon: Icon, label, value, color="#64748B" }) {
  if (!value) return null;
  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:10,
      padding:"10px 0", borderBottom:"1px solid #F1F5F9" }}>
      <div style={{ width:30, height:30, borderRadius:8, background:"#F8FAFC",
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <Icon size={14} color={color} />
      </div>
      <div>
        <p style={{ fontSize:11, fontWeight:600, color:"#94A3B8",
          textTransform:"uppercase", letterSpacing:".04em",
          fontFamily:"Inter,sans-serif", margin:"0 0 2px" }}>
          {label}
        </p>
        <p style={{ fontSize:13.5, color:"#0F172A", fontFamily:"Inter,sans-serif",
          margin:0, lineHeight:1.5 }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function SectionHead({ title }) {
  return (
    <p style={{ fontSize:11, fontWeight:700, color:"#94A3B8",
      textTransform:"uppercase", letterSpacing:".06em",
      fontFamily:"Inter,sans-serif", margin:"18px 0 4px",
      paddingBottom:6, borderBottom:"1.5px solid #F1F5F9" }}>
      {title}
    </p>
  );
}

export default function ProjectInfoPanel({ project }) {
  const s = STATUS_STYLES[project.status] || STATUS_STYLES.draft;
  const typeLabel = PROJECT_TYPE_LABEL[project.projectType] || "";
  const equipList = (project.equipment || []).filter(e => e.type || e.tag);
  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" })
    : null;

  return (
    <div>
      {/* Status badge */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
        <span style={{ padding:"5px 13px", borderRadius:99,
          background:s.bg, color:s.color,
          fontSize:12, fontWeight:700, fontFamily:"Inter,sans-serif" }}>
          {s.label}
        </span>
        {typeLabel && (
          <span style={{ padding:"5px 13px", borderRadius:99,
            background:"#EFF6FF", color:"#3B82F6",
            fontSize:12, fontWeight:600, fontFamily:"Inter,sans-serif" }}>
            {typeLabel}
          </span>
        )}
      </div>

      {/* Project Identification */}
      <SectionHead title="Project Identification" />
      <InfoRow icon={Hash}     label="Job Number"    value={project.jobNumber} color="#0E9F8E" />
      <InfoRow icon={FileText} label="Project Name"  value={project.name}      color="#0E9F8E" />
      <InfoRow icon={MapPin}   label="Site Location" value={project.siteLocation} />

      {/* Parties */}
      <SectionHead title="Project Parties" />
      <InfoRow icon={Building2} label="Client"          value={project.clientName}    color="#3B82F6" />
      <InfoRow icon={HardHat}   label="Main Contractor" value={project.mainContractor} />
      <InfoRow icon={HardHat}   label="MEP Contractor"  value={project.mepContractor} />

      {/* Report Details */}
      <SectionHead title="Report / Calculation" />
      <InfoRow icon={Hash}     label="Report Number" value={
        [project.reportNumber, project.revision].filter(Boolean).join("  ·  Rev. ")
      } />
      <InfoRow icon={Calendar} label="Report Date"   value={fmtDate(project.reportDate)} />

      {/* Equipment */}
      {equipList.length > 0 && (
        <>
          <SectionHead title="Equipment" />
          {equipList.map((eq, i) => (
            <div key={i} style={{
              display:"flex", alignItems:"center", gap:10,
              padding:"9px 0", borderBottom:"1px solid #F1F5F9",
            }}>
              <div style={{ width:30, height:30, borderRadius:8, background:"#F8FAFC",
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Wrench size={14} color="#8B5CF6" />
              </div>
              <div>
                <p style={{ fontSize:13, fontWeight:600, color:"#0F172A",
                  fontFamily:"Inter,sans-serif", margin:"0 0 1px" }}>
                  {eq.type || "—"}
                </p>
                {eq.tag && (
                  <span style={{ display:"inline-flex", alignItems:"center", gap:4,
                    fontSize:11.5, color:"#8B5CF6", fontFamily:"Inter,sans-serif" }}>
                    <Tag size={11} /> {eq.tag}
                  </span>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Description */}
      {project.description && (
        <>
          <SectionHead title="Notes / Description" />
          <p style={{ fontSize:13.5, color:"#475569", fontFamily:"Inter,sans-serif",
            lineHeight:1.7, margin:"8px 0 0" }}>
            {project.description}
          </p>
        </>
      )}

      {/* Created by */}
      <SectionHead title="Created By" />
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0" }}>
        <div style={{ width:32, height:32, borderRadius:"50%",
          background:"linear-gradient(135deg,#0E9F8E,#1B6CA8)",
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ color:"#fff", fontWeight:700, fontSize:13 }}>
            {project.createdBy?.name?.[0]?.toUpperCase() || "?"}
          </span>
        </div>
        <div>
          <p style={{ fontSize:13.5, fontWeight:600, color:"#0F172A",
            fontFamily:"Inter,sans-serif", margin:0 }}>
            {project.createdBy?.name}
          </p>
          <p style={{ fontSize:12, color:"#94A3B8",
            fontFamily:"Inter,sans-serif", margin:0 }}>
            {project.createdBy?.email}
          </p>
        </div>
      </div>
    </div>
  );
}
