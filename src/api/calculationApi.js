import api from "./axios";

const base = (pid) => `/projects/${pid}/calculations`;

export const getCalculationsApi   = (pid)       => api.get(base(pid));
export const getCalculationApi    = (pid, id)   => api.get(`${base(pid)}/${id}`);
export const createCalculationApi = (pid, data) => api.post(base(pid), data);
export const updateCalculationApi = (pid, id, data) => api.put(`${base(pid)}/${id}`, data);
export const deleteCalculationApi = (pid, id)   => api.delete(`${base(pid)}/${id}`);
export const runCalculationApi    = (pid, data) => api.post(`${base(pid)}/run`, data);