import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen, FileText, Clock, CheckCircle2,
  LayoutGrid, List, RefreshCw, AlertCircle,
} from "lucide-react";
import Sidebar      from "../../components/Sidebar";
import Topbar       from "../../components/Topbar";
import StatCard     from "../../components/StatCard";
import ProjectCard  from "../../components/ProjectCard";
import ProjectModal from "../../components/ProjectModal";
import DeleteModal  from "../../components/DeleteModal";
import { getProjectsApi } from "@/api/projectApi";

const FILTERS = ["All","Draft","In Progress","Sent to Client","Approved","Completed"];
const STATUS_MAP = {
  "Draft":"draft","In Progress":"in_progress",
  "Sent to Client":"sent_to_client","Approved":"approved","Completed":"completed",
};

const EmptyState = ({ filter, onNew }) => (
  <motion.div initial={{ opacity:0,y:20 }} animate={{ opacity:1,y:0 }}
    style={{ gridColumn:"1/-1", textAlign:"center", padding:"72px 32px",
      background:"#fff", borderRadius:"var(--r-xl)",
      border:"1.5px dashed var(--slate-200)" }}>
    <div style={{ width:64,height:64,borderRadius:"50%",background:"var(--teal-50)",
      margin:"0 auto 18px",display:"flex",alignItems:"center",justifyContent:"center" }}>
      <FolderOpen size={28} color="var(--teal-500)" />
    </div>
    <h3 style={{ fontFamily:"var(--font-display)",fontSize:18,fontWeight:800,
      color:"var(--text)",marginBottom:8 }}>
      {filter==="All"?"No projects yet":`No "${filter}" projects`}
    </h3>
    <p style={{ color:"var(--text-muted)",fontSize:14,maxWidth:340,margin:"0 auto 24px" }}>
      {filter==="All"?"Create your first acoustic assessment project to get started."
        :"No projects match this filter."}
    </p>
    {filter==="All" && (
      <motion.button onClick={onNew} whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
        style={{ padding:"11px 28px",
          background:"linear-gradient(135deg,var(--teal-500),var(--teal-600))",
          color:"#fff",borderRadius:"var(--r-full)",fontSize:14,fontWeight:700,
          fontFamily:"var(--font-display)",boxShadow:"var(--shadow-teal)" }}>
        + Create First Project
      </motion.button>
    )}
  </motion.div>
);

export default function EngineerDashboard() {
  const [collapsed,     setCollapsed]     = useState(false);
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(false);
  const [filter,        setFilter]        = useState("All");
  const [viewMode,      setViewMode]      = useState("grid");
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editProject,   setEditProject]   = useState(null);
  const [deleteProject, setDeleteProject] = useState(null);

  const sidebarW = collapsed ? 68 : 232;

  const fetchProjects = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const { data } = await getProjectsApi();
      setProjects(data.projects || []);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const stats = {
    total:      projects.length,
    inProgress: projects.filter(p => p.status === "in_progress").length,
    pending:    projects.filter(p => ["draft","revision_needed"].includes(p.status)).length,
    completed:  projects.filter(p => ["approved","completed"].includes(p.status)).length,
  };

  const filtered = filter === "All"
    ? projects
    : projects.filter(p => p.status === STATUS_MAP[filter]);

  const openNew  = () => { setEditProject(null); setModalOpen(true); };
  const openEdit = (p) => { setEditProject(p);   setModalOpen(true); };

  return (
    <div style={{ display:"flex",minHeight:"100vh",background:"var(--bg)",
      fontFamily:"var(--font-body)" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div style={{ flex:1,marginLeft:sidebarW,
        transition:"margin-left .25s cubic-bezier(.4,0,.2,1)" }}>
        <Topbar sidebarW={sidebarW} onNewProject={openNew} />
        <main style={{ padding:"88px 32px 48px",maxWidth:1320,margin:"0 auto" }}>

          {/* Stats */}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",
            gap:18,marginBottom:32 }}>
            <StatCard icon={FolderOpen}   label="Total Projects" value={stats.total}      color="teal"  delay={0}    />
            <StatCard icon={Clock}        label="In Progress"     value={stats.inProgress} color="blue"  delay={0.07} />
            <StatCard icon={FileText}     label="Draft / Pending" value={stats.pending}    color="amber" delay={0.14} />
            <StatCard icon={CheckCircle2} label="Completed"       value={stats.completed}  color="green" delay={0.21} />
          </div>

          {/* Toolbar */}
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",
            marginBottom:22,flexWrap:"wrap",gap:12 }}>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding:"6px 14px",borderRadius:"var(--r-full)",fontSize:13,fontWeight:600,
                  background: filter===f ? "var(--teal-500)" : "#fff",
                  color:      filter===f ? "#fff"            : "var(--slate-600)",
                  border:     filter===f ? "1.5px solid var(--teal-500)" : "1.5px solid var(--border)",
                  transition:"all .18s",cursor:"pointer",
                }}>
                  {f}
                  {f!=="All" && STATUS_MAP[f] && (
                    <span style={{ marginLeft:6,fontSize:11,borderRadius:99,padding:"1px 6px",
                      background: filter===f ? "rgba(255,255,255,.25)" : "var(--slate-100)" }}>
                      {projects.filter(p => p.status===STATUS_MAP[f]).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ display:"flex",gap:8,alignItems:"center" }}>
              <span style={{ fontSize:13,color:"var(--text-muted)" }}>
                {filtered.length} project{filtered.length!==1?"s":""}
              </span>
              {[{mode:"grid",Icon:LayoutGrid},{mode:"list",Icon:List}].map(({mode,Icon}) => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{
                  width:34,height:34,borderRadius:"var(--r-md)",
                  border:`1.5px solid ${viewMode===mode?"var(--teal-500)":"var(--border)"}`,
                  background: viewMode===mode ? "var(--teal-50)" : "#fff",
                  color:      viewMode===mode ? "var(--teal-500)":"var(--slate-500)",
                  display:"flex",alignItems:"center",justifyContent:"center",transition:"all .18s",
                }}>
                  <Icon size={15} />
                </button>
              ))}
              <button onClick={fetchProjects} style={{
                width:34,height:34,borderRadius:"var(--r-md)",
                border:"1.5px solid var(--border)",background:"#fff",color:"var(--slate-500)",
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                <RefreshCw size={14} style={{ animation:loading?"spin .8s linear infinite":"none" }} />
              </button>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div style={{ display:"grid",
              gridTemplateColumns:viewMode==="grid"?"repeat(auto-fill,minmax(300px,1fr))":"1fr",
              gap:18 }}>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} style={{ height:200,borderRadius:"var(--r-lg)",
                  background:"#f1f5f9",animation:"pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          ) : error ? (
            <div style={{ textAlign:"center",padding:"60px 32px" }}>
              <AlertCircle size={40} color="var(--red-500)" style={{ margin:"0 auto 14px" }} />
              <p style={{ color:"var(--text-muted)",marginBottom:16 }}>Failed to load projects.</p>
              <button onClick={fetchProjects} style={{
                padding:"9px 20px",borderRadius:"var(--r-md)",
                border:"1.5px solid var(--border)",fontSize:13,fontWeight:600 }}>
                Try again
              </button>
            </div>
          ) : (
            <div style={{ display:"grid",
              gridTemplateColumns:viewMode==="grid"?"repeat(auto-fill,minmax(300px,1fr))":"1fr",
              gap:18 }}>
              {filtered.length===0
                ? <EmptyState filter={filter} onNew={openNew} />
                : filtered.map((p,i) => (
                    <ProjectCard key={p._id} project={p} index={i}
                      onEdit={openEdit} onDelete={setDeleteProject} />
                  ))
              }
            </div>
          )}
        </main>
      </div>

      <ProjectModal open={modalOpen} onClose={() => setModalOpen(false)}
        onSaved={fetchProjects} project={editProject} />
      <DeleteModal project={deleteProject} onClose={() => setDeleteProject(null)}
        onDeleted={fetchProjects} />

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}
