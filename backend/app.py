from datetime import datetime, timezone, timedelta
from typing import Dict, List, Tuple

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from skyfield.api import EarthSatellite, load, wgs84
import math

MU_EARTH = 398600.4418
R_EARTH = 6378.137

# ---------------------------
# FastAPI setup + CORS (dev)
# ---------------------------
app = FastAPI(title="Satellite Tracker (SGP4/Skyfield)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ts = load.timescale()

# Registry of satellites you want to support (name → NORAD ID + source list)
SATELLITES: Dict[str, Dict[str, object]] = {
    "iss": {"id": 25544, "tle_url": "https://celestrak.org/NORAD/elements/stations.txt"},
    "css": {"id": 48274, "tle_url": "https://celestrak.org/NORAD/elements/stations.txt"},
    "hubble": {"id": 20580, "tle_url": "https://celestrak.org/NORAD/elements/science.txt"},
    "noaa20": {"id": 43013, "tle_url": "https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle"},
}

eph = load("de421.bsp")
earth, sun = eph["earth"], eph["sun"]

# Cache: (norad_id, url) -> (EarthSatellite, last_refresh_utc)
_sat_cache: Dict[Tuple[int, str], Tuple[EarthSatellite, datetime]] = {}

CACHE_MAX_AGE_HOURS = 6

def _passes_for_observer(
    sat: EarthSatellite,
    lat: float,
    lon: float,
    hours: int = 24,
    step_s: int = 10,
    min_elev_deg: float = 10.0,
    visible_only: bool = False,
) -> List[Dict]:
    """Vectorized scan for AOS/TCA/LOS segments."""
    t0 = datetime.now(timezone.utc)
    # Build a vector Time object instead of many scalar times
    dts = [t0 + timedelta(seconds=i) for i in range(0, hours * 3600 + 1, step_s)]
    tvec = ts.from_datetimes(dts)

    observer = wgs84.latlon(latitude_degrees=lat, longitude_degrees=lon)

    # Vectorized topocentric alt/az over all times
    topo = (sat - observer).at(tvec)
    alt, az, _rng = topo.altaz()
    elevs = alt.degrees  # numpy array

    # Vectorized Sun altitude at the observer
    sun_alt = (earth + observer).at(tvec).observe(sun).apparent().altaz()[0].degrees

    # Vectorized sunlight flag for the satellite
    lit = sat.at(tvec).is_sunlit(eph)  # numpy bool array

    # Pass segments where elevation >= threshold
    above = elevs >= min_elev_deg
    passes: List[Dict] = []
    if not above.any():
        return passes

    # Find start/end indices of True runs in 'above'
    # transitions: False->True (start), True->False (end)
    import numpy as np

    idx = np.arange(above.size)
    # pad with False at both ends to catch edges cleanly
    padded = np.r_[False, above, False]
    starts = np.where(~padded[:-1] & padded[1:])[0]
    ends   = np.where(padded[:-1] & ~padded[1:])[0] - 1  # inclusive

    for s, e in zip(starts, ends):
        # Visible criteria: darkest sun altitude during the segment < -6 and lit at any point
        visible = (sun_alt[s:e+1].max() < -6.0) and (lit[s:e+1].any())
        if visible_only and not visible:
            continue

        seg_elevs = elevs[s:e+1]
        peak_rel = int(np.argmax(seg_elevs))
        peak = s + peak_rel

        passes.append({
            "aos_utc": tvec[s].utc_iso(),
            "tca_utc": tvec[peak].utc_iso(),
            "los_utc": tvec[e].utc_iso(),
            "max_elev_deg": float(elevs[peak]),
            "duration_s": int((e - s) * step_s),
            "visible": bool(visible),
        })

    return passes

def _find_tle_by_norad(norad_id: int, text: str) -> Tuple[str, str]:
    """
    Search a Celestrak-style text list for the given NORAD ID and return (L1, L2).
    Works whether the file is 3-line format (name\nL1\nL2) or line-paired (L1\nL2 repeated).
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    # We look for any "1 <catid>" line; the next line must be "2 ..."
    target = str(norad_id)
    for i, ln in enumerate(lines):
        if ln.startswith("1 "):
            parts = ln.split()
            if len(parts) >= 2 and parts[1].startswith(target):
                if i + 1 < len(lines) and lines[i + 1].startswith("2 "):
                    return ln, lines[i + 1]
    # Fallback: handle 3-line blocks where name precedes L1/L2
    for i, ln in enumerate(lines):
        if ln.upper().startswith("ISS") or ln.upper().startswith("CSS") or ln.upper().startswith("HUBBLE"):
            # try to read subsequent L1/L2
            if i + 2 < len(lines) and lines[i + 1].startswith("1 ") and lines[i + 2].startswith("2 "):
                parts = lines[i + 1].split()
                if len(parts) >= 2 and parts[1].startswith(target):
                    return lines[i + 1], lines[i + 2]
    raise ValueError(f"NORAD {norad_id} not found in TLE list.")


def fetch_satellite(norad_id: int, tle_url: str) -> EarthSatellite:
    """
    Get a fresh (or cached) EarthSatellite for the given NORAD ID from the given URL.
    Caches for CACHE_MAX_AGE_HOURS to avoid re-downloading every request.
    """
    key = (norad_id, tle_url)
    now = datetime.now(timezone.utc)

    sat_cached = _sat_cache.get(key)
    if sat_cached:
        sat, last_refresh = sat_cached
        if now - last_refresh < timedelta(hours=CACHE_MAX_AGE_HOURS):
            return sat

    try:
        resp = requests.get(tle_url, timeout=15)
        resp.raise_for_status()
        l1, l2 = _find_tle_by_norad(norad_id, resp.text)
        sat = EarthSatellite(l1, l2, f"SAT-{norad_id}", ts)
        _sat_cache[key] = (sat, now)
        return sat
    except Exception as e:
        # If we have a stale cache, fall back to it instead of total failure
        if sat_cached:
            return sat_cached[0]
        raise HTTPException(status_code=502, detail=f"Failed to fetch TLE for {norad_id}: {e}")


def _now_payload(sat: EarthSatellite, name: str, norad_id: int) -> dict:
    """Compute current ECI vectors and subpoint for a satellite and return JSON payload."""
    t = ts.from_datetime(datetime.now(timezone.utc))
    geo = sat.at(t)

    # ECI-like vectors (ICRF in Skyfield)
    r = geo.position.km
    v = geo.velocity.km_per_s

    # Geodetic subpoint
    sp = wgs84.subpoint(geo)
    return {
        "name": name,
        "norad_id": norad_id,
        "time_utc": t.utc_iso(),
        "eci_km": {"x": r[0], "y": r[1], "z": r[2]},
        "eci_vel_km_s": {"x": v[0], "y": v[1], "z": v[2]},
        "subpoint": {
            "lat": sp.latitude.degrees,
            "lon": sp.longitude.degrees,
            "alt_km": sp.elevation.km,
        },
    }

def get_tle_elements(sat):
    inclo = sat.model.inclo      # inclination [rad]
    raan = sat.model.nodeo       # RAAN [rad]
    ecc = sat.model.ecco         # eccentricity [unitless]
    argpo = sat.model.argpo      # argument of perigee [rad]
    mo = sat.model.mo            # mean anomaly [rad]
    no_kozai = sat.model.no_kozai  # mean motion [rad/min]

    i_deg = math.degrees(inclo)
    raan_deg = math.degrees(raan)
    argpo_deg = math.degrees(argpo)
    mo_deg = math.degrees(mo)

    n_rad_s = no_kozai / 60.0
    rev_per_day = no_kozai * (60 * 24) / (2 * math.pi)

    # 4. Derived orbital parameters
    period_sec = 2 * math.pi / n_rad_s
    period_min = period_sec / 60.0

    # Semi-major axis (a) from Kepler’s third law
    a_km = (MU_EARTH / (n_rad_s**2))**(1/3)

    # Perigee and apogee radii
    rp_km = a_km * (1 - ecc)
    ra_km = a_km * (1 + ecc)

    # Altitudes above Earth's surface
    hp_km = rp_km - R_EARTH
    ha_km = ra_km - R_EARTH

    # 5. Package nicely
    return {
        "inclination_deg": i_deg,
        "raan_deg": raan_deg,
        "eccentricity": ecc,
        "argument_of_perigee_deg": argpo_deg,
        "mean_anomaly_deg": mo_deg,
        "mean_motion_rev_per_day": rev_per_day,
        "period_min": period_min,
        "semi_major_axis_km": a_km,
        "perigee_alt_km": hp_km,
        "apogee_alt_km": ha_km
    }

# ---------------------------
# Routes
# ---------------------------

@app.get("/api/satellite/{name}/elements")
def satellite_elements(name: str):
    key = name.lower()
    if key not in SATELLITES:
        raise HTTPException(status_code=404, detail=f"Satellite '{name}' not supported.")
    info = SATELLITES[key]
    sat = fetch_satellite(info["id"], info["tle_url"])
    elems = get_tle_elements(sat)
    epoch_iso = sat.epoch.utc_strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "satellite": key,
        "norad_id": info["id"],
        "epoch_utc": epoch_iso,
        "elements": elems,
        "source": "SGP4 (no_kozai)"
    }


@app.get("/api/ping")
def ping():
    return {"ok": True}


@app.get("/api/satellite/{name}/now")
def satellite_now(name: str):
    """
    Dynamic satellite endpoint.
    Supported names (by default): iss, css, hubble, noaa20, starlink
    """
    key = name.lower()
    if key not in SATELLITES:
        raise HTTPException(status_code=404, detail=f"Satellite '{name}' not supported.")
    info = SATELLITES[key]
    sat = fetch_satellite(info["id"], info["tle_url"])
    return _now_payload(sat, key, info["id"])


# --- Compatibility alias: /now returns ISS (ZARYA) ---
@app.get("/api/now")
def now_iss():
    info = SATELLITES["iss"]
    sat = fetch_satellite(info["id"], info["tle_url"])
    return _now_payload(sat, "iss", info["id"])


# --- Simple ISS ground track, useful for the basic map ---
@app.get("/api/track")
def track(minutes: int = 90, step_s: int = 30):
    """
    Ground track for ISS for the next N minutes (default 90) sampled every step_s seconds.
    """
    info = SATELLITES["iss"]
    sat = fetch_satellite(info["id"], info["tle_url"])

    t0 = datetime.now(timezone.utc)
    times = [ts.from_datetime(t0 + timedelta(seconds=i)) for i in range(0, minutes * 60 + 1, step_s)]

    points = []
    for tt in times:
        geo = sat.at(tt)
        sp = wgs84.subpoint(geo)
        points.append(
            {
                "time_utc": tt.utc_iso(),
                "lat": sp.latitude.degrees,
                "lon": sp.longitude.degrees,
                "alt_km": sp.elevation.km,
            }
        )
    return {"points": points}

@app.get("/api/satellite/{name}/track")
def satellite_track(name: str, minutes: int = 90, step_s: int = 30):
    key = name.lower()
    if key not in SATELLITES:
        raise HTTPException(status_code=404, detail=f"Satellite '{name}' not supported.")
    info = SATELLITES[key]
    sat = fetch_satellite(info["id"], info["tle_url"])

    t0 = datetime.now(timezone.utc)
    times = [ts.from_datetime(t0 + timedelta(seconds=i)) for i in range(0, minutes * 60 + 1, step_s)]

    points = []
    for tt in times:
        geo = sat.at(tt)
        sp = wgs84.subpoint(geo)
        points.append(
            {
                "time_utc": tt.utc_iso(),
                "lat": sp.latitude.degrees,
                "lon": sp.longitude.degrees,
                "alt_km": sp.elevation.km,
            }
        )
    return {"points": points}

@app.get("/api/satellite/{name}/passes")
def satellite_passes(
    name: str,
    lat: float = Query(..., description="Observer latitude (deg)"),
    lon: float = Query(..., description="Observer longitude (deg)"),
    hours: int = Query(24, ge=1, le=72),
    step_s: int = Query(10, ge=1, le=60),
    min_elev_deg: float = Query(10.0, ge=0.0, le=90.0),
    visible_only: bool = Query(False),
):
    key = name.lower()
    if key not in SATELLITES:
        raise HTTPException(status_code=404, detail=f"Satellite '{name}' not supported.")
    info = SATELLITES[key]
    sat = fetch_satellite(info["id"], info["tle_url"])

    passes = _passes_for_observer(
        sat=sat,
        lat=lat,
        lon=lon,
        hours=hours,
        step_s=step_s,
        min_elev_deg=min_elev_deg,
        visible_only=visible_only,
    )
    return {
        "satellite": key,
        "norad_id": info["id"],
        "params": {
            "lat": lat, "lon": lon, "hours": hours,
            "step_s": step_s, "min_elev_deg": min_elev_deg,
            "visible_only": visible_only,
        },
        "count": len(passes),
        "passes": passes,
    }


# --- 3D orbital path (variable altitude) ------------------------
def _orbit_path_points(sat: EarthSatellite, steps: int = 240, periods: float = 1.0):
    """
    Sample the satellite's position for 'periods' orbital periods into the future,
    returning points with lat, lon, and altitude (km). Use this for a 3D orbit path.
    """
    # Use your existing element math to get period (min)
    elems = get_tle_elements(sat)  # already defined in your file
    period_min = elems["period_min"] if elems and "period_min" in elems else 90.0
    period_s = period_min * 60.0
    total_s = max(steps - 1, 1) * (period_s * periods) / max(steps - 1, 1)

    t0 = datetime.now(timezone.utc)
    # Build equally spaced times across the requested span
    times = [ts.from_datetime(t0 + timedelta(seconds=i * total_s / (steps - 1)))
             for i in range(steps)]

    pts = []
    for tt in times:
        geo = sat.at(tt)
        sp = wgs84.subpoint(geo)  # gives the nadir lat/lon and the satellite altitude above ellipsoid
        pts.append({
            "time_utc": tt.utc_iso(),
            "lat": sp.latitude.degrees,
            "lon": sp.longitude.degrees,
            "alt_km": sp.elevation.km,  # altitude above WGS-84 ellipsoid
        })
    return pts

@app.get("/api/satellite/{name}/orbit_path")
def satellite_orbit_path(
    name: str,
    steps: int = 240,
    periods: float = 1.0
):
    """
    3D orbital path with varying altitude (shows eccentricity).
    'steps' controls smoothness; 'periods' lets you draw >1 orbit.
    """
    key = name.lower()
    if key not in SATELLITES:
        raise HTTPException(status_code=404, detail=f"Satellite '{name}' not supported.")
    info = SATELLITES[key]
    sat = fetch_satellite(info["id"], info["tle_url"])

    points = _orbit_path_points(sat, steps=steps, periods=periods)
    return {
        "satellite": key,
        "norad_id": info["id"],
        "steps": steps,
        "periods": periods,
        "points": points
    }
