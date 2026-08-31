import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FolderOpen, FileText,
  History, LogOut, Waves, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

const NAV = [
  { to: "/engineer", icon: LayoutDashboard, label: "Dashboard",
    match: (path) => path === "/engineer" || path.startsWith("/engineer/projects") },
  { to: "/engineer", icon: FolderOpen,      label: "Projects",
    match: (path) => path === "/engineer" || path.startsWith("/engineer/projects") },
  { to: "/engineer", icon: FileText,        label: "Reports",
    match: (path) => false },
  { to: "/engineer", icon: History,         label: "History",
    match: (path) => false },
];

export default function Sidebar({ collapsed, setCollapsed }) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    navigate("/login");
  };

  const W = collapsed ? 68 : 232;

  return (
    <motion.aside
      animate={{ width: W }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      style={{
        width: W, minHeight: "100vh",
        background: "#0D2137",
        display: "flex", flexDirection: "column",
        position: "fixed", left: 0, top: 0, bottom: 0,
        zIndex: 40, overflow: "hidden",
        boxShadow: "4px 0 24px rgba(0,0,0,.18)",
      }}
    >
      {/* ── Logo ── */}
      <div style={{
        height: 64, display: "flex", alignItems: "center",
        padding: collapsed ? "0 14px" : "0 20px",
        borderBottom: "1px solid rgba(255,255,255,.07)",
        gap: 12, flexShrink: 0,
      }}>
        <div style={{
          width: 36, height: 36, background: "#0E9F8E",
          borderRadius: 10, display: "flex", alignItems: "center",
          justifyContent: "center", flexShrink: 0,
          boxShadow: "0 4px 12px rgba(14,159,142,.4)",
        }}>
          <Waves size={18} color="white" strokeWidth={2.5} />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
              <div style={{ color: "#fff", fontFamily: "var(--font-display)",
                fontWeight: 800, fontSize: 15, lineHeight: 1 }}>DG-SARIA</div>
              <div style={{ color: "rgba(255,255,255,.35)", fontSize: 10.5, marginTop: 2 }}>
                AAPL Consultants
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Nav ── */}
      <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {[
          { to: "/engineer", icon: LayoutDashboard, label: "Dashboard" },
          { to: "/engineer", icon: FolderOpen,      label: "Projects"  },
          { to: "/engineer", icon: FileText,         label: "Reports"   },
          { to: "/engineer", icon: History,          label: "History"   },
        ].map(({ to, icon: Icon, label }, i) => {
          const isActive = i === 0
            ? location.pathname.startsWith("/engineer")
            : false;

          return (
            <button
              key={label}
              onClick={() => navigate("/engineer")}
              style={{
                display: "flex", alignItems: "center",
                gap: 12, padding: "11px 14px",
                borderRadius: 10, border: "none",
                background: isActive && i === 0
                  ? "rgba(14,159,142,.18)" : "transparent",
                color: isActive && i === 0
                  ? "#2EC4B6" : "rgba(255,255,255,.55)",
                fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500,
                transition: "all .18s", position: "relative",
                justifyContent: collapsed ? "center" : "flex-start",
                cursor: "pointer", width: "100%", textAlign: "left",
              }}
              onMouseEnter={e => {
                if (!(isActive && i === 0)) {
                  e.currentTarget.style.background = "rgba(255,255,255,.07)";
                  e.currentTarget.style.color = "rgba(255,255,255,.85)";
                }
              }}
              onMouseLeave={e => {
                if (!(isActive && i === 0)) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255,255,255,.55)";
                }
              }}
            >
              {isActive && i === 0 && (
                <motion.div layoutId="nav-pill"
                  style={{
                    position: "absolute", left: 0, top: 6, bottom: 6,
                    width: 3, borderRadius: 99, background: "#0E9F8E",
                  }}
                />
              )}
              <Icon size={18} strokeWidth={isActive && i === 0 ? 2.5 : 2} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      {/* ── User + Logout ── */}
      <div style={{
        padding: "12px 10px",
        borderTop: "1px solid rgba(255,255,255,.07)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: collapsed ? "10px 13px" : "10px 12px",
          borderRadius: 10,
          background: "rgba(255,255,255,.05)",
          marginBottom: 6,
          justifyContent: collapsed ? "center" : "flex-start",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg,#0E9F8E,#1B6CA8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0,
          }}>
            {user?.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                style={{ overflow: "hidden" }}>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600,
                  whiteSpace: "nowrap" }}>{user?.name}</div>
                <div style={{ color: "rgba(255,255,255,.35)", fontSize: 11,
                  textTransform: "capitalize" }}>{user?.role}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button onClick={handleLogout}
          style={{
            width: "100%", display: "flex", alignItems: "center",
            gap: 10, padding: collapsed ? "10px 14px" : "10px 14px",
            borderRadius: 10, color: "rgba(255,255,255,.4)",
            fontSize: 13, fontWeight: 500, transition: "all .18s",
            justifyContent: collapsed ? "center" : "flex-start",
            cursor: "pointer", border: "none", background: "transparent",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,.15)"; e.currentTarget.style.color = "#F87171"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,.4)"; }}
        >
          <LogOut size={17} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}>Logout</motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* ── Collapse toggle ── */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: "absolute", top: "50%", right: -12,
          transform: "translateY(-50%)",
          width: 24, height: 24, borderRadius: "50%",
          background: "#1A3352", border: "1.5px solid rgba(255,255,255,.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,.5)", cursor: "pointer",
          transition: "all .2s", zIndex: 10,
        }}
      >
        <motion.div animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.25 }}>
          <ChevronRight size={13} />
        </motion.div>
      </button>
    </motion.aside>
  );
}