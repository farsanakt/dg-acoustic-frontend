import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider }    from "@/context/AuthContext";
import ProtectedRoute      from "@/components/ProtectedRoute";
import LoginPage           from "@/pages/auth/LoginPage";
import EngineerDashboard   from "@/pages/engineer/EngineerDashboard";
import ProjectDetailPage   from "@/pages/engineer/ProjectDetailPage";
import AdminDashboard      from "@/pages/admin/AdminDashboard";
import ClientPortal        from "@/pages/client/ClientPortal";
import "@/styles/globals.css";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute roles={["engineer", "admin"]} />}>
            <Route path="/engineer"              element={<EngineerDashboard />} />
            <Route path="/engineer/projects/:id" element={<ProjectDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>

          <Route element={<ProtectedRoute roles={["client"]} />}>
            <Route path="/client" element={<ClientPortal />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            fontFamily: "Inter, sans-serif", fontSize: 14,
            borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,.12)",
          },
          success: { iconTheme: { primary: "#0E9F8E", secondary: "#fff" } },
        }}
      />
    </AuthProvider>
  );
}