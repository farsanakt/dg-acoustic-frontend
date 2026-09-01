import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Search, Plus, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Topbar({ sidebarW, onNewProject, onMenuClick }) {
  const { user }    = useAuth();
  const [search, setSearch] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header style={{
      position:"fixed", top:0, right:0,
      left: sidebarW,
      height:64,
      background:"rgba(248,250,252,.95)",
      backdropFilter:"blur(12px)",
      borderBottom:"1px solid var(--slate-200)",
      display:"flex", alignItems:"center",
      justifyContent:"space-between",
      padding:"0 var(--page-pad)",
      zIndex:30,
      transition:"left .25s cubic-bezier(.4,0,.2,1)",
    }}>
      {/* Left */}
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {/* Mobile hamburger */}
        <button
          onClick={onMenuClick}
          className="mobile-menu-btn"
          style={{
            display:"none",
            width:36, height:36, borderRadius:9,
            border:"1.5px solid var(--slate-200)", background:"#fff",
            alignItems:"center", justifyContent:"center",
            color:"var(--slate-600)", cursor:"pointer",
          }}
        >
          <Menu size={18} />
        </button>

        <div className="greeting-block">
          <p style={{ color:"var(--slate-500)", fontSize:12, lineHeight:1 }}>
            {greeting},
          </p>
          <h2 style={{ fontFamily:"var(--font-display)", fontWeight:800,
            fontSize:17, color:"var(--slate-900)", lineHeight:1.3 }}>
            {user?.name?.split(" ")[0]} 👋
          </h2>
        </div>
      </div>

      {/* Right */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {/* Search — hidden on small mobile */}
        <div className="search-wrap" style={{ position:"relative" }}>
          <Search size={14} style={{
            position:"absolute", left:10, top:"50%",
            transform:"translateY(-50%)", color:"var(--slate-400)",
            pointerEvents:"none",
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            style={{
              paddingLeft:30, paddingRight:12,
              paddingTop:8, paddingBottom:8,
              width: searchFocus ? 200 : 160,
              border:`1.5px solid ${searchFocus ? "#0E9F8E":"var(--slate-200)"}`,
              borderRadius:var_full,
              background:"#fff", fontSize:13,
              color:"var(--text)", outline:"none",
              transition:"all .25s",
              boxShadow: searchFocus ? "0 0 0 3px rgba(14,159,142,.1)":"none",
              fontFamily:"var(--font-body)",
            }}
          />
        </div>

        {/* Bell */}
        <button style={{
          width:36, height:36, borderRadius:"50%",
          background:"#fff", border:"1.5px solid var(--slate-200)",
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"var(--slate-500)", position:"relative", cursor:"pointer",
          transition:"border-color .18s",
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor="#0E9F8E"}
          onMouseLeave={e => e.currentTarget.style.borderColor="var(--slate-200)"}
        >
          <Bell size={15} />
          <span style={{
            position:"absolute", top:7, right:7,
            width:7, height:7, borderRadius:"50%",
            background:"#0E9F8E", border:"1.5px solid var(--bg)",
          }} />
        </button>

        {/* New project button */}
        <motion.button
          onClick={onNewProject}
          whileHover={{ scale:1.03, y:-1 }}
          whileTap={{ scale:0.97 }}
          style={{
            display:"flex", alignItems:"center", gap:6,
            padding:"9px 16px",
            background:"linear-gradient(135deg,#0E9F8E,#0B8276)",
            color:"#fff", borderRadius:"var(--r-full)",
            fontSize:13, fontWeight:700,
            fontFamily:"var(--font-display)",
            boxShadow:"var(--shadow-teal)",
            whiteSpace:"nowrap", border:"none", cursor:"pointer",
          }}>
          <Plus size={15} strokeWidth={2.5} />
          <span className="btn-text">New Project</span>
        </motion.button>
      </div>

      <style>{`
        :root { --r-full-val: 9999px; }
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; }
          .greeting-block p { display: none; }
          .greeting-block h2 { font-size: 15px; }
          .search-wrap { display: none; }
          .btn-text { display: none; }
        }
        @media (max-width: 480px) {
          .greeting-block { display: none; }
        }
      `}</style>
    </header>
  );
}

// CSS variable workaround for inline style
const var_full = "9999px";