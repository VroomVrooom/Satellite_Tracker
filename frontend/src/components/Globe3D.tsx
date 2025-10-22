import Globe from "react-globe.gl";
import { useEffect, useRef } from "react";

const EARTH_RADIUS_KM = 6371;

export default function Globe3D({
  lat,
  lon,
  altKm = 0,
}: {
  lat: number;
  lon: number;
  altKm?: number;
}) {
  const globeEl = useRef<any>(null);

  useEffect(() => {
    if (globeEl.current) {
      globeEl.current.pointOfView({ lat, lng: lon, altitude: 1.5 }, 1000);
    }
  }, [lat, lon]);

  const points = [{ lat, lng: lon, altKm }];

  return (
    <div className="h-[400px] w-full">
      <Globe
        ref={globeEl}
        height={400}
        width={400}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        pointsData={points}
        pointAltitude={(d: any) => Math.max(0.002, (d.altKm ?? 0) / EARTH_RADIUS_KM)}
        pointColor={() => "red"}
        pointRadius={0.6}
      />
    </div>
  );
}
