import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const Spinner = () => (
  <div style={{
    minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", background: "#F8FAFC",
    flexDirection: "column", gap: 14,
  }}>
    <div style={{
      width: 38, height: 38,
      border: "3px solid #E2E8F0",
      borderTopColor: "#0E9F8E",
      borderRadius: "50%",
      animation: "spin 0.75s linear infinite",
    }} />
    <p style={{ color: "#94A3B8", fontSize: 13, fontFamily: "Inter, sans-serif" }}>
      Verifying session…
    </p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const ROLE_HOME = { admin: "/admin", engineer: "/engineer", client: "/client" };

const ProtectedRoute = ({ roles }) => {
  const { isAuth, user, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!isAuth) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role))
    return <Navigate to={ROLE_HOME[user?.role] ?? "/login"} replace />;

  return <Outlet />;
};

export default ProtectedRoute;