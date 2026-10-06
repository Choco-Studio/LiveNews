#!/usr/bin/env python3
"""The offline WORLD WEATHER heat map: a real temperature field for the demo desk (no network).

Reads the ERA-Interim 2 m temperature (ECMWF reanalysis, monthly means of 2005, 0.7 degrees) that NCAR
publishes in its GeoCAT example data, takes one month and writes it as a 1-degree grid to
config/fixtures/weather-field.json (int8, half degrees Celsius, base64). The live channel does not use it: it
samples the day's highs at ~1000 places from Open-Meteo (server/weatherfield.js).

  pip install netCDF4
  curl -O https://raw.githubusercontent.com/NCAR/GeoCAT-datafiles/main/netcdf_files/T2M_ERAINT_rectilinear_grid_2D.nc
  python3 tools/weather/make-demo-field.py T2M_ERAINT_rectilinear_grid_2D.nc --month 10
"""
import argparse, base64, json, os
import numpy as np
import netCDF4

ap = argparse.ArgumentParser()
ap.add_argument('file')
ap.add_argument('--month', type=int, default=10)
ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'fixtures', 'weather-field.json'))
a = ap.parse_args()

d = netCDF4.Dataset(a.file)
lat = np.asarray(d.variables['lat'][:], dtype=float)  # north to south
lon = np.asarray(d.variables['lon'][:], dtype=float)  # 0 .. 359.3
T = np.asarray(d.variables['T2M'][a.month - 1], dtype=float) - 273.15
if lat[0] < lat[-1]:
    lat, T = lat[::-1], T[::-1]

# bilinear onto the 1-degree grid: rows 89.5 .. -89.5, columns -179.5 .. 179.5
glat = 89.5 - np.arange(180)
glon = -179.5 + np.arange(360)
out = np.zeros((180, 360))
for i, la in enumerate(glat):
    k = np.searchsorted(-lat, -la)  # lat is descending
    k0, k1 = max(0, k - 1), min(len(lat) - 1, k)
    f = 0 if k0 == k1 else (lat[k0] - la) / (lat[k0] - lat[k1])
    row = T[k0] * (1 - f) + T[k1] * f
    x = (glon % 360) / (lon[1] - lon[0])
    j0 = np.floor(x).astype(int) % len(lon)
    j1 = (j0 + 1) % len(lon)
    fx = x - np.floor(x)
    out[i] = row[j0] * (1 - fx) + row[j1] * fx

q = np.clip(np.round(out * 2), -127, 127).astype(np.int8)
doc = {
    '_note': 'Real 2 m air temperature for the offline WORLD WEATHER map (ERA-Interim, ECMWF reanalysis), monthly mean; made by tools/weather/make-demo-field.py from NCAR GeoCAT-datafiles. Values: int8, half degrees C, rows north to south from 89.5, columns west to east from -179.5.',
    'source': 'ERA-INTERIM (ECMWF)',
    'period': f'2005-{a.month:02d}',
    'kind': 'monthly-mean',
    'w': 360, 'h': 180, 'lat0': 89.5, 'lon0': -179.5, 'step': 1, 'scale': 0.5,
    'data': base64.b64encode(q.tobytes()).decode('ascii'),
}
with open(a.out, 'w') as f:
    json.dump(doc, f)
print(f'{a.out}: {q.size} cells, {out.min():.1f}..{out.max():.1f} C')
