import { motion } from "framer-motion";

export default function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }) {
  const colors = {
    teal:   { bg: "var(--teal-50)",   icon: "var(--teal-500)",  border: "rgba(14,159,142,.15)"  },
    blue:   { bg: "#EFF6FF",          icon: "#3B82F6",           border: "rgba(59,130,246,.15)"  },
    amber:  { bg: "#FFFBEB",          icon: "var(--amber-500)",  border: "rgba(245,158,11,.15)"  },
    green:  { bg: "#F0FDF4",          icon: "var(--green-500)",  border: "rgba(34,197,94,.15)"   },
    purple: { bg: "#FAF5FF",          icon: "#8B5CF6",           border: "rgba(139,92,246,.15)"  },
  };
  const c = colors[color] || colors.teal;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: "var(--surface)",
        border: `1px solid ${c.border}`,
        borderRadius: "var(--r-lg)",
        padding: "22px 24px",
        display: "flex", alignItems: "flex-start", gap: 16,
        boxShadow: "var(--shadow-sm)",
        cursor: "default",
        transition: "box-shadow .2s, transform .2s",
      }}
      whileHover={{ y: -3, boxShadow: "var(--shadow-md)" }}
    >
      <div style={{
        width: 46, height: 46, borderRadius: "var(--r-md)",
        background: c.bg, display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={22} color={c.icon} strokeWidth={2} />
      </div>
      <div>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)",
          fontWeight: 500, marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 26, fontWeight: 800, color: "var(--text)",
          fontFamily: "var(--font-display)", lineHeight: 1 }}>{value}</p>
        {sub && (
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>{sub}</p>
        )}
      </div>
    </motion.div>
  );
}
