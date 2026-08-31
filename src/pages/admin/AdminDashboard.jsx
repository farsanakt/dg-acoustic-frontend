import { Navigate } from "react-router-dom";
// Admin dashboard will be built in a later step
export default function AdminDashboard() {
  return <Navigate to="/engineer" replace />;
}
