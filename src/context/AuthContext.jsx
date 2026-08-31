import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getMeApi, logoutApi } from "@/api/authApi";

const Ctx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem("dg_user")) || null; }
    catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // Re-validate token on mount
  useEffect(() => {
    const check = async () => {
      if (!localStorage.getItem("dg_token")) { setLoading(false); return; }
      try {
        const { data } = await getMeApi();
        setUser(data.user);
        localStorage.setItem("dg_user", JSON.stringify(data.user));
      } catch {
        localStorage.removeItem("dg_token");
        localStorage.removeItem("dg_user");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, []);

  const login = useCallback((userData, token) => {
    setUser(userData);
    localStorage.setItem("dg_user",  JSON.stringify(userData));
    localStorage.setItem("dg_token", token);
  }, []);

  const logout = useCallback(async () => {
    try { await logoutApi(); } catch { /* ignore */ }
    setUser(null);
    localStorage.removeItem("dg_user");
    localStorage.removeItem("dg_token");
  }, []);

  return (
    <Ctx.Provider value={{ user, login, logout, loading, isAuth: !!user }}>
      {children}
    </Ctx.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};
