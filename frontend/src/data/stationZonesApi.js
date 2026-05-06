import api from "../axios";

export const getLatestStationZones = async () => {
  const res = await api.get("/station-zones/latest");
  return res.data;
};

export const rebuildStationZones = async () => {
  const res = await api.post("/station-zones/rebuild");
  return res.data;
};