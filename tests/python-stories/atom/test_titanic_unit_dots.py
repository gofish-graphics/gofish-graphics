from gofish import Chart, circle, palette, treemap
import pandas as pd
import os


def story_default():
    data_filepath = os.path.join(os.getcwd(), '../../packages/gofish-graphics/src/data/titanicPassengers.json')
    titanic_passengers = pd.read_json('packages/gofish-graphics/src/data/titanicPassengers.json')
    return (Chart(titanic_passengers, color=palette(["#2b8cbe", "#ff8408"])) \
        .facet(by="pclass", dir="x") \
        .flow(
            treemap(
                h="fare",
                valueField="fare",
                paddingInner=0,
                tile="squarifyCircle",
                sort="desc",
                flipY=True,
            )
        ) \
        .mark(circle(fill="survived", stroke="#ccc", strokeWidth=1)),
        {"w" : 1000, "h": 320})