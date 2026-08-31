import api from "./axios";

export const getProjectsApi   = ()          => api.get("/projects");
export const getProjectApi    = (id)        => api.get(`/projects/${id}`);
export const createProjectApi = (data)      => api.post("/projects", data);
export const updateProjectApi = (id, data)  => api.put(`/projects/${id}`, data);
export const deleteProjectApi = (id)        => api.delete(`/projects/${id}`);
export const saveVersionApi   = (id, data)  => api.post(`/projects/${id}/versions`, data);
