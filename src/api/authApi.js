import api from "./axios";

export const loginApi  = (body)  => api.post("/auth/login",  body);
export const logoutApi = ()      => api.post("/auth/logout");
export const getMeApi  = ()      => api.get ("/auth/me");
export const seedApi   = ()      => api.post("/auth/seed");   // dev only
