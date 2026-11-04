// left: pieces may overlap (the default)
penguinStory(Shape.blob({ convexity: 2, connection: 0.5 }));
// right: each piece is cut out of its set's other pieces
penguinStory(Shape.blob({ convexity: 2, connection: 0.5, separate: true }));
