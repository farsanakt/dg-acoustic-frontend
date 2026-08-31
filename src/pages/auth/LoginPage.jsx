import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { Eye, EyeOff, Mail, Lock, ArrowRight, Waves } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { loginApi } from "@/api/authApi";

/* ─── Animated acoustic waveform (SVG) ─────────────────── */
const AcousticWave = () => (
  <svg viewBox="0 0 420 80" style={{ width: "100%", height: 80, overflow: "visible" }} aria-hidden>
    {[
      { d: "M0,40 C60,10 120,70 180,40 C240,10 300,70 360,40 C390,25 410,35 420,40", delay: 0,    op: 0.9 },
      { d: "M0,40 C70,18 130,62 190,40 C250,18 310,62 370,40 C400,28 415,36 420,40", delay: 0.4,  op: 0.5 },
      { d: "M0,40 C50,22 110,58 170,40 C230,22 290,58 350,40 C385,28 408,38 420,40", delay: 0.8,  op: 0.3 },
      { d: "M0,40 C80,30 140,50 200,40 C260,30 320,50 380,40 C400,33 412,39 420,40", delay: 1.2,  op: 0.15},
    ].map((w, i) => (
      <motion.path
        key={i}
        d={w.d}
        fill="none"
        stroke="#0E9F8E"
        strokeWidth={1.5}
        opacity={w.op}
        animate={{ d: [w.d,
          w.d.replace(/C(\d+),(\d+)/g, (_, a, b) => `C${a},${80 - parseInt(b)}`),
          w.d
        ]}}
        transition={{ duration: 3 + i * 0.6, repeat: Infinity, ease: "easeInOut", delay: w.delay }}
      />
    ))}
  </svg>
);

/* ─── Animated frequency bars (decorative) ─────────────── */
const FreqBars = () => {
  const bars = [28, 45, 70, 55, 85, 62, 40, 75, 50, 35, 65, 48];
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 72 }}>
      {bars.map((h, i) => (
        <motion.div
          key={i}
          style={{ width: 6, borderRadius: 3,
            background: `rgba(46,196,182,${0.3 + (i % 3) * 0.2})` }}
          animate={{ height: [h * 0.5, h, h * 0.65, h * 0.8, h] }}
          transition={{ duration: 1.2 + i * 0.15, repeat: Infinity,
            ease: "easeInOut", delay: i * 0.08 }}
        />
      ))}
    </div>
  );
};

/* ─── Floating stat chip ────────────────────────────────── */
const StatChip = ({ label, sub, delay }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.85 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    style={{
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 10, padding: "10px 16px",
      backdropFilter: "blur(8px)",
    }}
  >
    <div style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 800,
      fontFamily: "var(--font-display)" }}>{label}</div>
    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11,
      marginTop: 1 }}>{sub}</div>
  </motion.div>
);

/* ─── Input field ───────────────────────────────────────── */
const Field = ({ label, icon: Icon, error, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600,
        color: "var(--slate-700)", marginBottom: 6 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <Icon size={16} style={{
          position: "absolute", left: 13, top: "50%",
          transform: "translateY(-50%)",
          color: focused ? "var(--teal-500)" : "var(--slate-400)",
          transition: "color .2s", pointerEvents: "none",
        }} />
        <input
          {...props}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e)  => { setFocused(false); props.onBlur?.(e); }}
          style={{
            width: "100%", paddingLeft: 38, paddingRight: props.paddingRight || 14,
            paddingTop: 12, paddingBottom: 12,
            border: `1.5px solid ${error ? "var(--red-500)" : focused ? "var(--teal-500)" : "var(--border)"}`,
            borderRadius: "var(--r-md)",
            background: "#FFFFFF", color: "var(--text)",
            fontSize: 14, outline: "none",
            boxShadow: focused && !error ? "0 0 0 3px rgba(14,159,142,.12)" : "none",
            transition: "border-color .2s, box-shadow .2s",
          }}
        />
        {props.rightEl}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ color: "var(--red-500)", fontSize: 12, marginTop: 5 }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─── Role redirect map ─────────────────────────────────── */
const REDIRECT = { admin: "/admin", engineer: "/engineer", client: "/client" };

/* ═══════════════════════════════════════════════════════════ */
export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuth, user, login } = useAuth();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [errors,   setErrors]   = useState({});
  const [loading,  setLoading]  = useState(false);

  // Already logged in
  if (isAuth && user) return <Navigate to={REDIRECT[user.role] ?? "/engineer"} replace />;

  const validate = () => {
    const e = {};
    if (!email)    e.email    = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email";
    if (!password) e.password = "Password is required";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});
    try {
      const { data } = await loginApi({ email, password });
      login(data.user, data.token);
      toast.success(`Welcome, ${data.user.name.split(" ")[0]}!`);
      navigate(REDIRECT[data.user.role] ?? "/engineer", { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || "Login failed. Try again.";
      setErrors({ api: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ── Render ── */
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: "1.05fr 0.95fr",
      fontFamily: "var(--font-body)",
    }}>

      {/* ════ LEFT — Brand panel ════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, x: -32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: "linear-gradient(145deg, #0D2137 0%, #1A3352 55%, #0B4D44 100%)",
          display: "flex", flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 52px",
          position: "relative", overflow: "hidden",
        }}
      >
        {/* Background circles */}
        {[
          { size: 420, x: -120, y: -100, color: "rgba(14,159,142,0.12)" },
          { size: 300, x: 180,  y: 300,  color: "rgba(27,108,168,0.10)" },
        ].map((c, i) => (
          <div key={i} style={{
            position: "absolute", width: c.size, height: c.size,
            borderRadius: "50%", background: c.color,
            left: c.x, top: c.y, pointerEvents: "none",
          }} />
        ))}

        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: "var(--teal-500)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(14,159,142,.4)",
          }}>
            <Waves size={20} color="white" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ color: "#FFF", fontFamily: "var(--font-display)",
              fontWeight: 800, fontSize: 17, lineHeight: 1 }}>
              DG-SARIA
            </div>
            <div style={{ color: "rgba(255,255,255,.45)", fontSize: 11, marginTop: 2 }}>
              AAPL Consultants
            </div>
          </div>
        </motion.div>

        {/* Hero text */}
        <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "relative" }}>

          {/* Live badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(14,159,142,.15)",
            border: "1px solid rgba(14,159,142,.3)",
            borderRadius: 999, padding: "5px 13px", marginBottom: 22,
          }}>
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--teal-400)" }}
            />
            <span style={{ color: "var(--teal-400)", fontSize: 11.5, fontWeight: 600,
              letterSpacing: ".04em" }}>
              Assessment Platform
            </span>
          </div>

          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800,
            fontSize: 38, color: "#FFFFFF", lineHeight: 1.18, marginBottom: 16,
          }}>
            Diesel Generator<br />
            <span style={{ color: "var(--teal-400)" }}>Acoustic</span> Reports<br />
            <span style={{ color: "rgba(255,255,255,.35)", fontSize: 26 }}>made simple.</span>
          </h1>

          <p style={{ color: "rgba(255,255,255,.55)", fontSize: 14.5, lineHeight: 1.7,
            maxWidth: 360, marginBottom: 36 }}>
            Calculate octave-band noise levels, generate NC/NR assessments,
            and deliver professional PDF reports — all in one place.
          </p>

          {/* Waveform */}
          <div style={{ marginBottom: 20, opacity: 0.8 }}>
            <AcousticWave />
          </div>

          {/* Freq bars */}
          <FreqBars />
          <p style={{ marginTop: 8, color: "rgba(255,255,255,.25)", fontSize: 10.5,
            letterSpacing: ".08em", textTransform: "uppercase" }}>
            Octave-Band Spectrum Analyser
          </p>
        </motion.div>

        {/* Stats row */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          style={{ display: "flex", gap: 10, position: "relative" }}>
          <StatChip label="3 Roles"  sub="Admin · Engineer · Client" delay={0.6} />
          <StatChip label="PDF"      sub="One-click reports"          delay={0.7} />
          <StatChip label="Versions" sub="Full history tracking"      delay={0.8} />
        </motion.div>
      </motion.div>

      {/* ════ RIGHT — Login form ════════════════════════════ */}
      <div style={{
        background: "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "48px 60px",
      }}>
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: "100%", maxWidth: 390 }}
        >
          {/* Header */}
          <div style={{ marginBottom: 34 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800,
              fontSize: 28, color: "var(--text)", marginBottom: 7 }}>
              Sign in
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14.5 }}>
              Enter your credentials to access the platform
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            <Field
              label="Email address"
              icon={Mail}
              type="email"
              autoComplete="email"
              placeholder="you@aaplconsultants.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
            />

            <Field
              label="Password"
              icon={Lock}
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              paddingRight={42}
              rightEl={
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-label="Toggle password"
                  style={{
                    position: "absolute", right: 12, top: "50%",
                    transform: "translateY(-50%)", color: "var(--slate-400)",
                    padding: 3, transition: "color .2s",
                  }}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            {/* API error banner */}
            <AnimatePresence>
              {errors.api && (
                <motion.div
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0,  height: "auto" }}
                  exit={  { opacity: 0, y: -6,  height: 0 }}
                  style={{
                    overflow: "hidden", marginBottom: 18,
                    padding: "11px 14px",
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: "var(--r-md)",
                    color: "var(--red-500)",
                    fontSize: 13,
                    display: "flex", gap: 8, alignItems: "flex-start",
                  }}
                >
                  <span style={{ fontSize: 15, lineHeight: 1.4 }}>⚠</span>
                  {errors.api}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={!loading ? { scale: 1.015, y: -1 } : {}}
              whileTap={!loading  ? { scale: 0.985 }         : {}}
              style={{
                width: "100%", padding: "13px 20px",
                background: loading
                  ? "var(--slate-300)"
                  : "linear-gradient(135deg, var(--teal-500) 0%, var(--teal-600) 100%)",
                color: "#FFFFFF", borderRadius: "var(--r-md)",
                fontSize: 15, fontWeight: 700,
                fontFamily: "var(--font-display)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: loading ? "none" : "var(--shadow-teal)",
                transition: "background .2s, box-shadow .2s",
                cursor: loading ? "not-allowed" : "pointer",
                marginBottom: 10,
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 18, height: 18,
                    border: "2.5px solid rgba(255,255,255,.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin .7s linear infinite",
                  }} />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={17} />
                </>
              )}
            </motion.button>
          </form>

          {/* Dev credentials card */}
          <motion.details
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            style={{
              marginTop: 28,
              background: "var(--slate-100)",
              border: "1px dashed var(--slate-300)",
              borderRadius: "var(--r-md)",
              overflow: "hidden",
            }}
          >
            <summary style={{
              padding: "11px 14px", cursor: "pointer",
              fontSize: 12, fontWeight: 600, color: "var(--slate-500)",
              letterSpacing: ".04em", textTransform: "uppercase",
              userSelect: "none",
            }}>
              Dev — test accounts (click to show)
            </summary>
            <div style={{ padding: "2px 14px 14px", borderTop: "1px dashed var(--slate-300)" }}>
              {[
                { role: "Admin",    email: "admin@aaplconsultants.com",    pwd: "Admin@123"    },
                { role: "Engineer", email: "engineer@aaplconsultants.com", pwd: "Engineer@123" },
                { role: "Client",   email: "client@aaplconsultants.com",   pwd: "Client@123"   },
              ].map((a) => (
                <div key={a.role} style={{
                  marginTop: 10, fontSize: 12,
                  color: "var(--slate-600)",
                  fontFamily: "monospace",
                  display: "grid", gridTemplateColumns: "68px 1fr",
                  gap: 4,
                }}>
                  <span style={{ color: "var(--teal-500)", fontWeight: 700 }}>{a.role}</span>
                  <span>{a.email}  /  {a.pwd}</span>
                </div>
              ))}
              <p style={{ marginTop: 10, fontSize: 11, color: "var(--slate-400)" }}>
                Run: <code style={{ background: "var(--slate-200)", padding: "1px 5px",
                  borderRadius: 4 }}>POST /api/auth/seed</code> to create accounts
              </p>
            </div>
          </motion.details>

          <p style={{
            marginTop: 24, textAlign: "center",
            color: "var(--slate-400)", fontSize: 11.5,
          }}>
            © 2026 AAPL Consultants · DG-SARIA Platform
          </p>
        </motion.div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
