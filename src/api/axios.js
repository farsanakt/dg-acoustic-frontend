import axios from "axios";

// During dev: Vite proxy forwards /api → backend
// In production: set VITE_API_URL in your hosting platform's env vars
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

const api = axios.create({
  baseURL:         BASE_URL,
  withCredentials: true,
  headers:         { "Content-Type": "application/json" },
});

// Attach token if stored
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dg_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("dg_token");
      localStorage.removeItem("dg_user");
      if (!window.location.pathname.includes("/login")) {
        window.location.replace("/login");
      }
    }
    return Promise.reject(err);
  }
);

export default api;