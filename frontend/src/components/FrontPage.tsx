import { useEffect, useState } from "react";
import "../index.css";
import Orbit3D from "./Orbit3D";
import SatelliteCard from "./SatCard";
import OrbitalElementsCard from "./OrbitalElementsCard";
import Globe3D from "./Globe3D";
const API_BASE = import.meta.env.VITE_API_BASE;

type SatelliteData = {
  name: string;
  time_utc: string;
  subpoint: { lat: number; lon: number; alt_km: number };
};

type PassInfo = {
  aos_utc: string;
  tca_utc: string;
  los_utc: string;
  max_elev_deg: number;
  duration_s: number;
  visible: boolean;
};

type TrackPoint = {
  time_utc: string;
  lat: number;
  lon: number;
  alt_km: number;
};

const SATELLITES = [
  { code: "iss", shortName: "ISS", description: "International Space Station" },
  { code: "css", shortName: "CSS", description: "Chinese Space Station" },
  {
    code: "hubble",
    shortName: "Hubble",
    description: "Hubble Space Telescope",
  },
  { code: "noaa20", shortName: "NOAA-20", description: "Weather Satellite" },
];

export default function FrontPage() {
  const [data, setData] = useState<SatelliteData | null>(null);
  const [sat, setSat] = useState<string>("iss");

  // Satellite Pass
  const [nextPass, setNextPass] = useState<PassInfo | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState<TrackPoint[]>([]);

  const fetchPassesOnly = async (satName: string, lat: number, lon: number) => {
    try {
      const qs = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        hours: "24",
        min_elev_deg: "10",
        visible_only: "true",
      });
      const r = await fetch(
        `${API_BASE}/api/satellite/${satName}/passes?` + qs
      );
      if (!r.ok) throw new Error(`passes ${r.status}`);
      const j = (await r.json()) as { passes: PassInfo[] };
      setNextPass(j.passes?.[0] ?? null);
    } catch (e: any) {
      console.error(e);
      setNextPass(null);
    }
  };

  const fetchSat = async (name: string) => {
    setSat(name);
    setLoading(true);
    setError(null);
    setNextPass(null);
    const nowReq = fetch(`${API_BASE}/api/satellite/${name}/now`);
    const trackReq = fetch(
      `${API_BASE}/api/satellite/${name}/track?minutes=90&step_s=30`
    );
    const passReq =
      geo &&
      fetch(
        `${API_BASE}/api/satellite/${name}/passes?` +
          new URLSearchParams({
            lat: String(geo.lat),
            lon: String(geo.lon),
            hours: "24",
            min_elev_deg: "10",
            visible_only: "true",
          })
      );
    try {
      const [rNow, rPass, rTrack] = await Promise.all([
        nowReq,
        passReq ?? Promise.resolve(null as any),
        trackReq,
      ]);

      if (!rNow.ok) throw new Error(`now ${rNow.status}`);
      const jNow = (await rNow.json()) as SatelliteData;
      setData(jNow);

      if (rPass && rPass.ok) {
        const jPass = (await rPass.json()) as { passes: PassInfo[] };
        setNextPass(jPass.passes?.[0] ?? null);
      }

      if (rTrack.ok) {
        const jTrack = (await rTrack.json()) as { points: TrackPoint[] };
        setTrack(jTrack.points);
      } else {
        setTrack([]);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Fetch failed");
      setData(null);
      setTrack([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        console.warn("Geolocation error", err);
        // continue without location
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // load default satellite immediately
  useEffect(() => {
    fetchSat(sat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when location arrives, fetch passes for current satellite
  useEffect(() => {
    if (geo) fetchPassesOnly(sat, geo.lat, geo.lon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  //Time Render
  const toLocal = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      year: "numeric",
      month: "short",
      day: "2-digit",
    });

  const fmtDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  return (
    <div className="font-bold text-2xl">
      <div className="flex justify-center space-x-2 pb-2">
        <span className="text-5xl text-white">Satellite Tracker</span>
      </div>
      {/* Cards row */}
      <div className="flex flex-col space-x-5 pb-4">
        <div className="flex flex-wrap justify-center flex-row gap-5 pb-3">
          {SATELLITES.map((satellite) => (
            <SatelliteCard
              key={satellite.code}
              code={satellite.code}
              shortName={satellite.shortName}
              description={satellite.description}
              onSelect={fetchSat}
            />
          ))}
        </div>

        <div className="flex flex-row justify-center bg-gray-900 p-2 rounded-2xl shadow-lg gap-2">
          <div className="flex items-center justify-center bg-gray-950 rounded-2xl">
            <Globe3D
              lat={data?.subpoint.lat ?? 0}
              lon={data?.subpoint.lon ?? 0}
              altKm={data?.subpoint.alt_km ?? 0}
              satelliteCode={sat}
            />
          </div>
          {/* Text data */}
          {data && (
            <div className="shrink-0 basis-[340px] grid grid-rows-[auto,1fr] gap-3 text-center">
              <div className="space-y-3 grid grid-cols-2 gap-2">
                {/* Time */}
                <div className="rounded-xl border border-gray-600 bg-gray-800 h-full shadow-sm flex flex-col items-center justify-center">
                  <span className="text-sm font-bold text-gray-300">
                    Time (UTC)
                  </span>
                  <p className="text-[0.6em] font-semibold text-gray-200">
                    {new Date(data.time_utc).toLocaleString("en-AU", {
                      timeZone: "Australia/Sydney",
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </p>
                </div>
                {/* Latitude */}
                <div className="rounded-xl border border-gray-600 bg-gray-800 shadow-sm flex flex-col items-center justify-center h-full">
                  <span className="text-sm font-bold text-gray-300">
                    Latitude
                  </span>
                  <p className="text-[0.6em] font-semibold text-gray-200 mt-1">
                    {data.subpoint.lat.toFixed(2)}°
                  </p>
                </div>
                {/* Longitude */}
                <div className="rounded-xl border border-gray-600 bg-gray-800 shadow-sm flex flex-col items-center justify-center h-full">
                  <span className="text-sm font-bold text-gray-300">
                    Longitude
                  </span>
                  <p className="text-[0.6em] font-semibold text-gray-200 mt-1">
                    {data.subpoint.lon.toFixed(2)}°
                  </p>
                </div>
                {/* Altitude */}
                <div className="rounded-xl border border-gray-600 bg-gray-800 shadow-sm flex flex-col items-center justify-center h-full">
                  <span className="text-sm font-bold text-gray-300">
                    Altitude
                  </span>
                  <p className="text-[0.6em] font-semibold text-gray-200 mt-1">
                    {data.subpoint.alt_km.toFixed(1)} km
                  </p>
                </div>
              </div>
              {geo && (
                <div className="rounded-xl border border-gray-600 bg-gray-800 shadow-sm p-6 flex flex-col items-center text-center">
                  <span className="text-sm font-semibold text-gray-300">
                    Next Visible Pass at Your Location
                  </span>
                  {!nextPass && !loading && (
                    <p className="text-base text-gray-200 mt-2">
                      No visible pass in the next 24 hours.
                    </p>
                  )}
                  {nextPass && (
                    <div className="mt-3 grid grid-cols-1 md:grid-row-3 gap-4 w-full">
                      <div className="rounded-lg border border-gray-600 p-2">
                        <div className="text-sm text-gray-300">Rise (AOS)</div>
                        <div className="text-lg font-semibold text-gray-200">
                          {toLocal(nextPass.aos_utc)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-600 p-2">
                        <div className="text-sm text-gray-300">Peak (TCA)</div>
                        <div className="text-lg font-semibold text-gray-200">
                          {toLocal(nextPass.tca_utc)}
                        </div>
                        <div className="text-sm text-gray-300 mt-1">
                          Max elev: {nextPass.max_elev_deg.toFixed(0)}°
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-600 p-2">
                        <div className="text-sm text-gray-300">Set (LOS)</div>
                        <div className="text-lg font-semibold text-gray-200">
                          {toLocal(nextPass.los_utc)}
                        </div>
                        <div className="text-sm text-gray-300 mt-1">
                          Duration: {fmtDuration(nextPass.duration_s)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Next pass card */}
          <div className="">
            {sat && (
              <div
                className="rounded-xl border text-gray-200 border-gray-600 bg-gray-800 justify-center items-center
              h-full shadow-sm flex flex-col"
              >
                <OrbitalElementsCard satName={sat} />
              </div>
            )}
          </div>
        </div>
      </div>
      {/* 3D orbit viewer */}
      <Orbit3D satName={sat} />
    </div>
  );
}
