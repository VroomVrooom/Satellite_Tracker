import { useEffect, useState } from "react"
const API_BASE = import.meta.env.VITE_API_BASE;

type OrbitalElements = {
  inclination_deg: number
  raan_deg: number
  eccentricity: number
  argument_of_perigee_deg: number
  mean_anomaly_deg: number
  mean_motion_rev_per_day: number
  period_min: number
  semi_major_axis_km: number
  perigee_alt_km: number
  apogee_alt_km: number
}

type Props = {
  satName: string
}

export default function OrbitalElementsCard({ satName }: Props) {
  const [elements, setElements] = useState<OrbitalElements | null>(null)
  const [epoch, setEpoch] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchElements() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/api/satellite/${satName}/elements`)
        if (!res.ok) throw new Error(`Failed: ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setElements(data.elements)
          setEpoch(data.epoch_utc)
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchElements()
    return () => { cancelled = true }
  }, [satName])

  if (loading) return <div className="p-4 text-sm text-center">Loading orbital elements…</div>
  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>
  if (!elements) return null

  return (
    <div className="rounded-xl  bg-gray-800 p-6">
      <h3 className="text-lg font-semibold mb-2">
        Orbital Elements
      </h3>
      {epoch && (
        <p className="text-sm text-gray-500 mb-4">
          TLE Epoch: {new Date(epoch).toLocaleString()}
        </p>
      )}

      <div className="grid grid-cols-2 gap-y-2 text-sm">
        <span className="text-gray-200">Inclination</span>
        <span>{elements.inclination_deg.toFixed(2)}°</span>

        <span className="text-gray-200">RAAN</span>
        <span>{elements.raan_deg.toFixed(2)}°</span>

        <span className="text-gray-200">Eccentricity</span>
        <span>{elements.eccentricity.toExponential(4)}</span>

        <span className="text-gray-200">Arg. of Perigee</span>
        <span>{elements.argument_of_perigee_deg.toFixed(2)}°</span>

        <span className="text-gray-200">Mean Anomaly</span>
        <span>{elements.mean_anomaly_deg.toFixed(2)}°</span>

        <span className="text-gray-200">Mean Motion</span>
        <span>{elements.mean_motion_rev_per_day.toFixed(4)} rev/day</span>

        <span className="text-gray-200">Period</span>
        <span>{elements.period_min.toFixed(2)} min</span>

        <span className="text-gray-200">Semi-Major Axis</span>
        <span>{elements.semi_major_axis_km.toFixed(1)} km</span>

        <span className="text-gray-200">Perigee Altitude</span>
        <span>{elements.perigee_alt_km.toFixed(1)} km</span>

        <span className="text-gray-200">Apogee Altitude</span>
        <span>{elements.apogee_alt_km.toFixed(1)} km</span>
      </div>
    </div>
  )
}
