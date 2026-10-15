"""Bird migration paths and the world basemap, for the bird migration stories.

These two datasets are about 1 MB of JSON, so they sit in a module of their own
rather than in data.py: only a story that reads them pays to parse them.
"""

from python_stories.data import _load_json

# Bird migration paths (72 species x 365 days) and the world basemap (one row
# per polygon ring), mirroring packages/gofish-graphics/src/data/birds.ts and
# world110m.ts (dumped from them). birds.json keeps the JS module's packed
# form, [day, lon, lat, species index] rows with the species names interned in
# bird_species.json, and is decoded into records here as the JS module decodes
# it.
_BIRD_SPECIES = _load_json("bird_species")
_BIRD_ROWS = _load_json("birds")
BIRDS = [
    {"day": day, "lon": lon, "lat": lat, "species": _BIRD_SPECIES[s]}
    for day, lon, lat, s in _BIRD_ROWS
]
WORLD_110M = _load_json("world110m")
