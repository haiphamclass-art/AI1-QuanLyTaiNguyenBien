import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import { getLatestStationZones } from "../data/stationZonesApi";

const ringStyle = (feature) => {
  const ring = feature?.properties?.ring;

  if (ring === 1) {
    return {
      color: "#0d47a1",
      weight: 1,
      fillColor: "#0d47a1",
      fillOpacity: 0.85,
    };
  }

  if (ring === 2) {
    return {
      color: "#42a5f5",
      weight: 0.8,
      fillColor: "#42a5f5",
      fillOpacity: 0.55,
    };
  }

  return {
    color: "#bbdefb",
    weight: 0.6,
    fillColor: "#bbdefb",
    fillOpacity: 0.3,
  };
};

export default function StationZoneLayer() {
  const [geojson, setGeojson] = useState(null);

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const data = await getLatestStationZones();
        setGeojson(data);
      } catch (error) {
        console.error("Failed to load station zones:", error);
      }
    };

    fetchZones();
  }, []);

  if (!geojson) return null;

  return (
    <GeoJSON
      data={geojson}
      style={ringStyle}
      onEachFeature={(feature, layer) => {
        const props = feature.properties || {};
        layer.bindPopup(`
          <b>Mã trạm:</b> ${props.maHieu || ""}<br/>
          <b>Vị trí:</b> ${props.vitri || ""}<br/>
          <b>Vòng:</b> ${props.ring || ""}<br/>
          <b>Mức ảnh hưởng:</b> ${props.influence_label || ""}<br/>
          <b>Diện tích (km²):</b> ${props.area_km2 ? Number(props.area_km2).toFixed(2) : ""}
        `);
      }}
    />
  );
}