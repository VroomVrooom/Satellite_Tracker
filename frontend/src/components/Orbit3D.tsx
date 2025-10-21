// src/components/Orbit3D.tsx
import { useEffect, useRef, useState } from "react"
import * as Cesium from "cesium"
// If you haven't imported this CSS anywhere else, keep this line.
// Otherwise move it to your root (e.g., main.tsx) to avoid duplicates.
import "cesium/Build/Cesium/Widgets/widgets.css"

type TrackPoint = { time_utc: string; lat: number; lon: number; alt_km: number }

export default function Orbit3D({ satName = "iss" }: { satName?: string }) {
  const mountEl = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const [isPlaying, setIsPlaying] = useState(true)

  // 1) Create the Cesium Viewer once
  useEffect(() => {
    if (!mountEl.current) return
    if (viewerRef.current) return

    Cesium.Ion.defaultAccessToken = import.meta.env
      .VITE_CESIUM_ION_TOKEN as string

    const viewer = new Cesium.Viewer(mountEl.current, {
      animation: false,          // we'll control play/pause ourselves
      timeline: true,
      shouldAnimate: true,
      baseLayerPicker: false,
      geocoder: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      homeButton: false,
      terrain: Cesium.Terrain.fromWorldTerrain(),
    })

    // Day/night lighting on the globe
    viewer.scene.globe.enableLighting = true

    viewerRef.current = viewer
    return () => {
      viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  // 2) Load/refresh entities whenever the satellite selection changes
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !satName) return

    let liveTimer: number | undefined

    async function loadSat() {
      try {
        // Clear old entities/intervals
        viewer.entities.removeAll()
        if (liveTimer) window.clearInterval(liveTimer)

        // --- fetch ground track ---
        const res = await fetch(
          `/api/satellite/${satName}/track?minutes=90&step_s=30`
        )
        if (!res.ok) throw new Error(`track fetch failed: ${res.status}`)
        const { points } = (await res.json()) as { points: TrackPoint[] }
        if (!Array.isArray(points) || points.length === 0) return

        // --- draw ground track (projected on Earth) ---
        const groundPositions = points.flatMap((p) => [p.lon, p.lat])
        viewer.entities.add({
          name: `${satName} ground track`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(groundPositions),
            width: 2,
          },
        })

        // --- create time-sampled position for animation ---
        const position = new Cesium.SampledPositionProperty()
        const start = Cesium.JulianDate.fromIso8601(points[0].time_utc)
        const stop = Cesium.JulianDate.fromIso8601(
          points[points.length - 1].time_utc
        )

        for (const p of points) {
          const t = Cesium.JulianDate.fromIso8601(p.time_utc)
          const pos = Cesium.Cartesian3.fromDegrees(
            p.lon,
            p.lat,
            p.alt_km * 1000
          )
          position.addSample(t, pos)
        }

        // --- configure the clock/timeline ---
        viewer.clock.startTime = start.clone()
        viewer.clock.stopTime = stop.clone()
        viewer.clock.currentTime = start.clone()
        viewer.clock.clockRange = Cesium.ClockRange.CLAMPED
        viewer.clock.multiplier = 60 // 60x realtime
        viewer.clock.shouldAnimate = isPlaying
        viewer.timeline.zoomTo(start, stop)

        // --- satellite "dot" + label + trail ---
        const labelText = (satName ?? "sat").toUpperCase()
        const entity = viewer.entities.add({
          name: labelText,
          position,
          point: { pixelSize: 10 },
          label: {
            text: labelText,
            font: "14px sans-serif",
            pixelOffset: new Cesium.Cartesian2(0, -18),
            showBackground: true,
          },
          path: {
            trailTime: 60 * 60, // show last hour of path
            width: 2,
          },
        })

        viewer.trackedEntity = entity

        // --- append live samples every 5s so it stays fresh ---
        async function appendLive() {
          try {
            const r = await fetch(`/api/satellite/${satName}/now`)
            if (!r.ok) return
            const d = await r.json()
            if (!d?.subpoint) return
            position.addSample(
              Cesium.JulianDate.fromIso8601(d.time_utc),
              Cesium.Cartesian3.fromDegrees(
                d.subpoint.lon,
                d.subpoint.lat,
                d.subpoint.alt_km * 1000
              )
            )
          } catch {
            // ignore transient errors
          }
        }
        appendLive()
        liveTimer = window.setInterval(appendLive, 5000)
      } catch (e) {
        console.error("Orbit3D load error:", e)
      }
    }

    loadSat()
    return () => {
      if (liveTimer) window.clearInterval(liveTimer)
    }
  }, [satName, isPlaying])

  // 3) play/pause + speed controls
  const togglePlay = () => {
    const viewer = viewerRef.current
    if (!viewer) return
    const next = !viewer.clock.shouldAnimate
    viewer.clock.shouldAnimate = next
    setIsPlaying(next)
  }

  const setSpeed = (mult: number) => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.clock.multiplier = mult
  }

  // 4) JSX container for the viewer + simple controls
  return (
    <div className="space-y-3 w-full h-full">
      <div className="flex items-center gap-2">
        <button onClick={togglePlay} className="px-3 py-1 rounded border">
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span className="text-sm">Speed:</span>
        <button onClick={() => setSpeed(1)} className="px-2 py-1 rounded border">
          1x
        </button>
        <button onClick={() => setSpeed(30)} className="px-2 py-1 rounded border">
          30x
        </button>
        <button onClick={() => setSpeed(60)} className="px-2 py-1 rounded border">
          60x
        </button>
        <button onClick={() => setSpeed(120)} className="px-2 py-1 rounded border">
          120x
        </button>
        <span className="ml-3 text-sm opacity-70">
          Viewing: {(satName ?? "sat").toUpperCase()}
        </span>
      </div>

      <div ref={mountEl} className="h-[70vh] w-full rounded-xl overflow-hidden" />
    </div>
  )
}
