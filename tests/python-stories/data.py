"""Shared datasets mirroring packages/gofish-graphics/src/data/catch.ts."""

SEAFOOD = [
    {"lake": "Lake A", "species": "Bass", "count": 23},
    {"lake": "Lake A", "species": "Trout", "count": 31},
    {"lake": "Lake A", "species": "Catfish", "count": 29},
    {"lake": "Lake A", "species": "Perch", "count": 12},
    {"lake": "Lake A", "species": "Salmon", "count": 8},
    {"lake": "Lake B", "species": "Bass", "count": 25},
    {"lake": "Lake B", "species": "Trout", "count": 34},
    {"lake": "Lake B", "species": "Catfish", "count": 41},
    {"lake": "Lake B", "species": "Perch", "count": 21},
    {"lake": "Lake B", "species": "Salmon", "count": 16},
    {"lake": "Lake C", "species": "Bass", "count": 15},
    {"lake": "Lake C", "species": "Trout", "count": 25},
    {"lake": "Lake C", "species": "Catfish", "count": 31},
    {"lake": "Lake C", "species": "Perch", "count": 22},
    {"lake": "Lake C", "species": "Salmon", "count": 31},
    {"lake": "Lake D", "species": "Bass", "count": 12},
    {"lake": "Lake D", "species": "Trout", "count": 17},
    {"lake": "Lake D", "species": "Catfish", "count": 23},
    {"lake": "Lake D", "species": "Perch", "count": 23},
    {"lake": "Lake D", "species": "Salmon", "count": 41},
    {"lake": "Lake E", "species": "Bass", "count": 7},
    {"lake": "Lake E", "species": "Trout", "count": 9},
    {"lake": "Lake E", "species": "Catfish", "count": 13},
    {"lake": "Lake E", "species": "Perch", "count": 20},
    {"lake": "Lake E", "species": "Salmon", "count": 40},
    {"lake": "Lake F", "species": "Bass", "count": 4},
    {"lake": "Lake F", "species": "Trout", "count": 7},
    {"lake": "Lake F", "species": "Catfish", "count": 9},
    {"lake": "Lake F", "species": "Perch", "count": 21},
    {"lake": "Lake F", "species": "Salmon", "count": 47},
]

# Vega-Lite Simple Bar Chart data
SIMPLE_BAR_DATA = [
    {"a": "A", "b": 28},
    {"a": "B", "b": 55},
    {"a": "C", "b": 43},
    {"a": "D", "b": 91},
    {"a": "E", "b": 81},
    {"a": "F", "b": 53},
    {"a": "G", "b": 19},
    {"a": "H", "b": 87},
    {"a": "I", "b": 52},
]

# Vega-Lite Grouped Bar Chart data
GROUPED_BAR_DATA = [
    {"category": "A", "group": "x", "value": 0.1},
    {"category": "A", "group": "y", "value": 0.6},
    {"category": "A", "group": "z", "value": 0.9},
    {"category": "B", "group": "x", "value": 0.7},
    {"category": "B", "group": "y", "value": 0.2},
    {"category": "B", "group": "z", "value": 1.1},
    {"category": "C", "group": "x", "value": 0.6},
    {"category": "C", "group": "y", "value": 0.1},
    {"category": "C", "group": "z", "value": 0.2},
]

# Bar negative data
NEGATIVE_BAR_DATA = [
    {"category": "A", "value": -30},
    {"category": "B", "value": 80},
    {"category": "C", "value": 45},
    {"category": "D", "value": 60},
    {"category": "E", "value": 20},
]

# Scatter / Line Chart data
CATCH_LOCATIONS_ARRAY = [
    {"lake": "Lake A", "x": 5.26, "y": 22.64},
    {"lake": "Lake B", "x": 30.87, "y": 120.75},
    {"lake": "Lake C", "x": 50.01, "y": 60.94},
    {"lake": "Lake D", "x": 115.13, "y": 94.16},
    {"lake": "Lake E", "x": 133.05, "y": 50.44},
    {"lake": "Lake F", "x": 85.99, "y": 172.78},
]

# Scatter (Connected) data — US vehicle miles vs gas prices 1956–2010
DRIVING_SHIFTS = [
    {"side": "left", "year": 1956, "miles": 3675, "gas": 2.38},
    {"side": "right", "year": 1957, "miles": 3706, "gas": 2.40},
    {"side": "bottom", "year": 1958, "miles": 3766, "gas": 2.26},
    {"side": "top", "year": 1959, "miles": 3905, "gas": 2.31},
    {"side": "right", "year": 1960, "miles": 3935, "gas": 2.27},
    {"side": "bottom", "year": 1961, "miles": 3977, "gas": 2.25},
    {"side": "right", "year": 1962, "miles": 4085, "gas": 2.22},
    {"side": "bottom", "year": 1963, "miles": 4218, "gas": 2.12},
    {"side": "bottom", "year": 1964, "miles": 4369, "gas": 2.11},
    {"side": "bottom", "year": 1965, "miles": 4538, "gas": 2.14},
    {"side": "top", "year": 1966, "miles": 4676, "gas": 2.14},
    {"side": "bottom", "year": 1967, "miles": 4827, "gas": 2.14},
    {"side": "right", "year": 1968, "miles": 5038, "gas": 2.13},
    {"side": "right", "year": 1969, "miles": 5207, "gas": 2.07},
    {"side": "right", "year": 1970, "miles": 5376, "gas": 2.01},
    {"side": "bottom", "year": 1971, "miles": 5617, "gas": 1.93},
    {"side": "bottom", "year": 1972, "miles": 5973, "gas": 1.87},
    {"side": "right", "year": 1973, "miles": 6154, "gas": 1.90},
    {"side": "left", "year": 1974, "miles": 5943, "gas": 2.34},
    {"side": "bottom", "year": 1975, "miles": 6111, "gas": 2.31},
    {"side": "bottom", "year": 1976, "miles": 6389, "gas": 2.32},
    {"side": "top", "year": 1977, "miles": 6630, "gas": 2.36},
    {"side": "bottom", "year": 1978, "miles": 6883, "gas": 2.23},
    {"side": "left", "year": 1979, "miles": 6744, "gas": 2.68},
    {"side": "left", "year": 1980, "miles": 6672, "gas": 3.30},
    {"side": "right", "year": 1981, "miles": 6732, "gas": 3.30},
    {"side": "right", "year": 1982, "miles": 6835, "gas": 2.92},
    {"side": "right", "year": 1983, "miles": 6943, "gas": 2.66},
    {"side": "right", "year": 1984, "miles": 7130, "gas": 2.48},
    {"side": "right", "year": 1985, "miles": 7323, "gas": 2.36},
    {"side": "left", "year": 1986, "miles": 7558, "gas": 1.76},
    {"side": "top", "year": 1987, "miles": 7770, "gas": 1.76},
    {"side": "bottom", "year": 1988, "miles": 8089, "gas": 1.68},
    {"side": "left", "year": 1989, "miles": 8397, "gas": 1.75},
    {"side": "top", "year": 1990, "miles": 8529, "gas": 1.88},
    {"side": "right", "year": 1991, "miles": 8535, "gas": 1.78},
    {"side": "right", "year": 1992, "miles": 8662, "gas": 1.69},
    {"side": "left", "year": 1993, "miles": 8855, "gas": 1.60},
    {"side": "bottom", "year": 1994, "miles": 8909, "gas": 1.59},
    {"side": "bottom", "year": 1995, "miles": 9150, "gas": 1.60},
    {"side": "top", "year": 1996, "miles": 9192, "gas": 1.67},
    {"side": "right", "year": 1997, "miles": 9416, "gas": 1.65},
    {"side": "bottom", "year": 1998, "miles": 9590, "gas": 1.39},
    {"side": "right", "year": 1999, "miles": 9687, "gas": 1.50},
    {"side": "top", "year": 2000, "miles": 9717, "gas": 1.89},
    {"side": "left", "year": 2001, "miles": 9699, "gas": 1.77},
    {"side": "bottom", "year": 2002, "miles": 9814, "gas": 1.64},
    {"side": "right", "year": 2003, "miles": 9868, "gas": 1.86},
    {"side": "left", "year": 2004, "miles": 9994, "gas": 2.14},
    {"side": "left", "year": 2005, "miles": 10067, "gas": 2.53},
    {"side": "right", "year": 2006, "miles": 10037, "gas": 2.79},
    {"side": "right", "year": 2007, "miles": 10025, "gas": 2.95},
    {"side": "left", "year": 2008, "miles": 9880, "gas": 3.31},
    {"side": "bottom", "year": 2009, "miles": 9657, "gas": 2.38},
    {"side": "left", "year": 2010, "miles": 9596, "gas": 2.61},
]

# Area (Layered) / Streamgraph demo data
STREAMGRAPH_DATA = [
    {"x": 0, "y": 28, "c": 0}, {"x": 0, "y": 20, "c": 1},
    {"x": 1, "y": 43, "c": 0}, {"x": 1, "y": 25, "c": 1},
    {"x": 2, "y": 81, "c": 0}, {"x": 2, "y": 10, "c": 1},
    {"x": 3, "y": 19, "c": 0}, {"x": 3, "y": 15, "c": 1},
    {"x": 4, "y": 52, "c": 0}, {"x": 4, "y": 48, "c": 1},
    {"x": 5, "y": 24, "c": 0}, {"x": 5, "y": 28, "c": 1},
    {"x": 6, "y": 87, "c": 0}, {"x": 6, "y": 66, "c": 1},
    {"x": 7, "y": 17, "c": 0}, {"x": 7, "y": 27, "c": 1},
    {"x": 8, "y": 68, "c": 0}, {"x": 8, "y": 16, "c": 1},
    {"x": 9, "y": 49, "c": 0}, {"x": 9, "y": 25, "c": 1},
    {"x": 0, "y": 34, "c": 2}, {"x": 1, "y": 22, "c": 2},
    {"x": 2, "y": 77, "c": 2}, {"x": 3, "y": 12, "c": 2},
    {"x": 4, "y": 19, "c": 2}, {"x": 5, "y": 31, "c": 2},
    {"x": 6, "y": 40, "c": 2}, {"x": 7, "y": 21, "c": 2},
    {"x": 8, "y": 59, "c": 2}, {"x": 9, "y": 33, "c": 2},
    {"x": 0, "y": 18, "c": 3}, {"x": 1, "y": 41, "c": 3},
    {"x": 2, "y": 90, "c": 3}, {"x": 3, "y": 25, "c": 3},
    {"x": 4, "y": 60, "c": 3}, {"x": 5, "y": 19, "c": 3},
    {"x": 6, "y": 20, "c": 3}, {"x": 7, "y": 31, "c": 3},
    {"x": 8, "y": 72, "c": 3}, {"x": 9, "y": 20, "c": 3},
    {"x": 0, "y": 23, "c": 4}, {"x": 1, "y": 30, "c": 4},
    {"x": 2, "y": 67, "c": 4}, {"x": 3, "y": 18, "c": 4},
    {"x": 4, "y": 43, "c": 4}, {"x": 5, "y": 26, "c": 4},
    {"x": 6, "y": 76, "c": 4}, {"x": 7, "y": 29, "c": 4},
    {"x": 8, "y": 64, "c": 4}, {"x": 9, "y": 27, "c": 4},
]

# Color Scales — numeric scores for gradient demos
SCORES_DATA = [
    {"label": "A", "value": 4},
    {"label": "B", "value": 12},
    {"label": "C", "value": 28},
    {"label": "D", "value": 47},
    {"label": "E", "value": 63},
    {"label": "F", "value": 81},
    {"label": "G", "value": 90},
    {"label": "H", "value": 100},
]

# Color Scales — paired warm/cold bars
PAIRED_BARS_DATA = [
    {"pair": "P1", "type": "warm", "value": 20},
    {"pair": "P1", "type": "cold", "value": 20},
    {"pair": "P2", "type": "warm", "value": 45},
    {"pair": "P2", "type": "cold", "value": 45},
    {"pair": "P3", "type": "warm", "value": 70},
    {"pair": "P3", "type": "cold", "value": 70},
    {"pair": "P4", "type": "warm", "value": 90},
    {"pair": "P4", "type": "cold", "value": 90},
]

# Nightingale rose chart data (Crimean War casualties)
NIGHTINGALE = [
    {"Month": "Jan", "Type": "Other", "Death": 324},
    {"Month": "Jan", "Type": "Wounds", "Death": 83},
    {"Month": "Jan", "Type": "Disease", "Death": 2761},
    {"Month": "Feb", "Type": "Other", "Death": 361},
    {"Month": "Feb", "Type": "Wounds", "Death": 42},
    {"Month": "Feb", "Type": "Disease", "Death": 2120},
    {"Month": "Mar", "Type": "Other", "Death": 172},
    {"Month": "Mar", "Type": "Wounds", "Death": 32},
    {"Month": "Mar", "Type": "Disease", "Death": 1205},
    {"Month": "Apr", "Type": "Other", "Death": 57},
    {"Month": "Apr", "Type": "Wounds", "Death": 48},
    {"Month": "Apr", "Type": "Disease", "Death": 477},
    {"Month": "May", "Type": "Other", "Death": 37},
    {"Month": "May", "Type": "Wounds", "Death": 49},
    {"Month": "May", "Type": "Disease", "Death": 508},
    {"Month": "Jun", "Type": "Other", "Death": 31},
    {"Month": "Jun", "Type": "Wounds", "Death": 209},
    {"Month": "Jun", "Type": "Disease", "Death": 802},
    {"Month": "Jul", "Type": "Other", "Death": 33},
    {"Month": "Jul", "Type": "Wounds", "Death": 134},
    {"Month": "Jul", "Type": "Disease", "Death": 382},
    {"Month": "Aug", "Type": "Other", "Death": 25},
    {"Month": "Aug", "Type": "Wounds", "Death": 164},
    {"Month": "Aug", "Type": "Disease", "Death": 483},
    {"Month": "Sep", "Type": "Other", "Death": 20},
    {"Month": "Sep", "Type": "Wounds", "Death": 276},
    {"Month": "Sep", "Type": "Disease", "Death": 189},
    {"Month": "Oct", "Type": "Other", "Death": 18},
    {"Month": "Oct", "Type": "Wounds", "Death": 53},
    {"Month": "Oct", "Type": "Disease", "Death": 128},
    {"Month": "Nov", "Type": "Other", "Death": 32},
    {"Month": "Nov", "Type": "Wounds", "Death": 33},
    {"Month": "Nov", "Type": "Disease", "Death": 178},
    {"Month": "Dec", "Type": "Other", "Death": 28},
    {"Month": "Dec", "Type": "Wounds", "Death": 18},
    {"Month": "Dec", "Type": "Disease", "Death": 91},
]

# Mosaic Chart data
MOSAIC_DATA = [
    {"origin": "Europe", "cylinders": "4", "count": 66},
    {"origin": "Europe", "cylinders": "5", "count": 3},
    {"origin": "Europe", "cylinders": "6", "count": 4},
    {"origin": "Japan", "cylinders": "3", "count": 4},
    {"origin": "Japan", "cylinders": "4", "count": 69},
    {"origin": "Japan", "cylinders": "6", "count": 6},
    {"origin": "USA", "cylinders": "4", "count": 72},
    {"origin": "USA", "cylinders": "6", "count": 74},
    {"origin": "USA", "cylinders": "8", "count": 108},
]

# Heatmap data — day × hour grid mirroring Heatmap.stories.tsx.
_HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
_HEATMAP_HOURS = ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm"]
_HEATMAP_RAW = [
    10, 45, 72, 38, 90, 55, 20, 66, 30,
    25, 60, 85, 42, 77, 33, 58, 14, 80,
    50, 22, 95, 68, 11, 74, 39, 47, 62,
    18, 83, 41, 57, 29, 93, 64, 76, 15,
    70, 35, 52, 88, 23, 46, 81, 67, 44,
]
HEATMAP_DATA = [
    {"day": day, "hour": hour, "value": _HEATMAP_RAW[di * len(_HEATMAP_HOURS) + hi]}
    for di, day in enumerate(_HEATMAP_DAYS)
    for hi, hour in enumerate(_HEATMAP_HOURS)
]
