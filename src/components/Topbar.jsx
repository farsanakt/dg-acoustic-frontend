import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Search, Plus, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function Topbar({ sidebarW, onNewProject, onMenuClick }) {
  const { user }       = useAuth();
  const isMobile       = useIsMobile();
  const [search, setSearch]           = useState("");
  const [searchFocus, setSearchFocus] = useState(false);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header style={{
      position:"fixed", top:0, right:0,
      left: sidebarW,
      height:64,
      background:"rgba(248,250,252,.96)",
      backdropFilter:"blur(12px)",
      borderBottom:"1px solid #E2E8F0",
      display:"flex", alignItems:"center",
      justifyContent:"space-between",
      padding: isMobile ? "0 12px" : "0 28px",
      zIndex:30,
      transition:"left .25s cubic-bezier(.4,0,.2,1)",
    }}>
      {/* Left */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {/* Hamburger — mobile only */}
        {isMobile && (
          <button onClick={onMenuClick} style={{
            width:36, height:36, borderRadius:9,
            border:"1.5px solid #E2E8F0", background:"#fff",
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#475569", cursor:"pointer",
          }}>
            <Menu size={18} />
          </button>
        )}

        {!isMobile && (
          <div>
            <p style={{ color:"#64748B", fontSize:12, lineHeight:1,
              fontFamily:"var(--font-body)" }}>
              {greeting},
            </p>
            <h2 style={{ fontFamily:"var(--font-display)", fontWeight:800,
              fontSize:17, color:"#0F172A", lineHeight:1.3 }}>
              {user?.name?.split(" ")[0]} 👋
            </h2>
          </div>
        )}

        {isMobile && (
          <h2 style={{ fontFamily:"var(--font-display)", fontWeight:800,
            fontSize:15, color:"#0F172A" }}>
            {user?.name?.split(" ")[0]}
          </h2>
        )}
      </div>

      {/* Right */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        {/* Search — desktop only */}
        {!isMobile && (
          <div style={{ position:"relative" }}>
            <Search size={14} style={{
              position:"absolute", left:10, top:"50%",
              transform:"translateY(-50%)", color:"#94A3B8",
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
                border:`1.5px solid ${searchFocus ? "#0E9F8E":"#E2E8F0"}`,
                borderRadius:9999,
                background:"#fff", fontSize:13,
                color:"#0F172A", outline:"none",
                fontFamily:"var(--font-body)",
                transition:"all .25s",
                boxShadow: searchFocus ? "0 0 0 3px rgba(14,159,142,.1)":"none",
              }}
            />
          </div>
        )}

        {/* Bell */}
        <button style={{
          width:36, height:36, borderRadius:"50%",
          background:"#fff", border:"1.5px solid #E2E8F0",
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"#64748B", position:"relative", cursor:"pointer",
          transition:"border-color .18s",
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor="#0E9F8E"}
          onMouseLeave={e => e.currentTarget.style.borderColor="#E2E8F0"}
        >
          <Bell size={15} />
          <span style={{
            position:"absolute", top:7, right:7,
            width:7, height:7, borderRadius:"50%",
            background:"#0E9F8E", border:"1.5px solid #F8FAFC",
          }} />
        </button>

        {/* New project */}
        <motion.button
          onClick={onNewProject}
          whileHover={{ scale:1.03, y:-1 }}
          whileTap={{ scale:0.97 }}
          style={{
            display:"flex", alignItems:"center",
            gap: isMobile ? 0 : 6,
            padding: isMobile ? "9px 10px" : "9px 16px",
            background:"linear-gradient(135deg,#0E9F8E,#0B8276)",
            color:"#fff", borderRadius:9999,
            fontSize:13, fontWeight:700,
            fontFamily:"var(--font-display)",
            boxShadow:"0 6px 24px rgba(14,159,142,.28)",
            border:"none", cursor:"pointer", whiteSpace:"nowrap",
          }}>
          <Plus size={15} strokeWidth={2.5} />
          {!isMobile && "New Project"}
        </motion.button>
      </div>
    </header>
  );
}