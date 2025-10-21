export interface NowResponse {
  time_utc: string
  eci_km: { x: number; y: number; z: number }
  eci_vel_km_s: { x: number; y: number; z: number }
  subpoint: { lat: number; lon: number; alt_km: number }
}

export async function getPing() {
  const r = await fetch('/api/ping')
  if (!r.ok) throw new Error('ping failed')
  return (await r.json()) as { ok: boolean }
}

export async function getNow() {
  const r = await fetch('/api/now')
  if (!r.ok) throw new Error('/now failed')
  return (await r.json()) as NowResponse
}
