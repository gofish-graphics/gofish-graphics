from ..helper import initialize_container
from gofish_python import Chart, circle, palette, treemap
from gofish_python.data.titanic_passengers import titanic_passengers


def story_default():

    return Chart(titanic_passengers, color=palette(["#2b8cbe", "#ff8408"])) \
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
        .mark(circle(fill="survived", stroke="#ccc", strokeWidth=1)) \
        .render(container, w=1000, h=320)