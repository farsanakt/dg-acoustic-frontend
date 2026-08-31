import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Search, Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Topbar({ sidebarW, onNewProject }) {
  const { user } = useAuth();
  const [searchFocus, setSearchFocus] = useState(false);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header style={{
      position: "fixed", top: 0, right: 0,
      left: sidebarW, height: 64,
      background: "rgba(248,250,252,0.92)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--slate-200)",
      display: "flex", alignItems: "center",
      justifyContent: "space-between",
      padding: "0 28px", zIndex: 30,
      transition: "left .25s cubic-bezier(.4,0,.2,1)",
    }}>
      {/* Left — greeting */}
      <div>
        <p style={{ color: "var(--slate-500)", fontSize: 12.5, lineHeight: 1 }}>
          {greeting},
        </p>
        <h2 style={{
          fontFamily: "var(--font-display)", fontWeight: 800,
          fontSize: 17, color: "var(--slate-900)", lineHeight: 1.3,
        }}>
          {user?.name?.split(" ")[0]} 👋
        </h2>
      </div>

      {/* Right — search + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search size={15} style={{
            position: "absolute", left: 11, top: "50%",
            transform: "translateY(-50%)", color: "var(--slate-400)",
            pointerEvents: "none",
          }} />
          <input
            placeholder="Search projects…"
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            style={{
              paddingLeft: 34, paddingRight: 14,
              paddingTop: 8, paddingBottom: 8,
              width: searchFocus ? 220 : 170,
              border: `1.5px solid ${searchFocus ? "var(--teal-500)" : "var(--slate-200)"}`,
              borderRadius: "var(--r-full)",
              background: "#fff", fontSize: 13,
              color: "var(--text)", outline: "none",
              transition: "all .25s",
              boxShadow: searchFocus ? "0 0 0 3px rgba(14,159,142,.1)" : "none",
            }}
          />
        </div>

        {/* Bell */}
        <button style={{
          width: 38, height: 38, borderRadius: "50%",
          background: "#fff", border: "1.5px solid var(--slate-200)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--slate-500)", position: "relative",
          transition: "all .18s",
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--teal-500)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--slate-200)"}
        >
          <Bell size={16} />
          <span style={{
            position: "absolute", top: 7, right: 7,
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--teal-500)",
            border: "1.5px solid var(--bg)",
          }} />
        </button>

        {/* New project */}
        <motion.button
          onClick={onNewProject}
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.97 }}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 18px",
            background: "linear-gradient(135deg, var(--teal-500), var(--teal-600))",
            color: "#fff", borderRadius: "var(--r-full)",
            fontSize: 13.5, fontWeight: 700,
            fontFamily: "var(--font-display)",
            boxShadow: "var(--shadow-teal)",
            whiteSpace: "nowrap",
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
          New Project
        </motion.button>
      </div>
    </header>
  );
}
