import Globe from "react-globe.gl";
import {useEffect, useRef, useState} from "react";

const EARTH_RADIUS_KM = 6371;
const API_BASE = import.meta.env.VITE_API_BASE as string;

type TrackPoint = { lat: number; lon: number; alt_km?: number };
type OrbitPoint = { lat: number; lon: number; alt_km: number; time_utc?: string };

export default function Globe3D({
  lat,
  lon,
  altKm = 0,
  satelliteCode,
}: {
  lat: number;
  lon: number;
  altKm?: number;
  satelliteCode?: string;
}) {
  const globeEl = useRef<any>(null);
  const [orbitPath, setOrbitPath] = useState<OrbitPoint[]>([]);

  useEffect(() => {
    if (globeEl.current) {
      globeEl.current.pointOfView({ lat, lng: lon, altitude: 1.5 }, 800);
    }
  }, [lat, lon]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const r = await fetch(
          `${API_BASE}/api/satellite/${satelliteCode}/orbit_path?steps=300&periods=1.2`,
          { signal: controller.signal }
        );
        const data = await r.json();
        setOrbitPath(Array.isArray(data.points) ? data.points : []);
      } catch {
        setOrbitPath([]);
      }
    })();
    return () => controller.abort();
  }, [satelliteCode]);

  const points = [{ lat, lng: lon, altKm }];

  return (
    <div className="h-[400px] w-full">
      <Globe
        ref={globeEl}
        height={400}
        width={400}

        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere={true}

        pathsData={orbitPath.length ? [{ id: "orbit", pts: orbitPath }] : []}
        pathPoints="pts"
        pathPointLat={(p: OrbitPoint) => p.lat}
        pathPointLng={(p: OrbitPoint) => p.lon}
        pathPointAlt={(p: OrbitPoint) =>
          Math.max(0.002, (p.alt_km ?? 0) / EARTH_RADIUS_KM)
        }
        pathColor={() => "rgba(0,200,255,0.95)"}
        pathStroke={1.8}
        pathDashLength={0.0025}
        pathDashGap={0.002}
        pathDashAnimateTime={100000}

        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={(d: any) => Math.max(0.002, (d.altKm ?? 0) / EARTH_RADIUS_KM)}
        pointColor={() => "red"}
        pointRadius={0.6}
      />
    </div>
  );
}
