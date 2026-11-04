// clearance defaults to the padding
enclose({ shape, padding, avoiding, clearance }, members);
// convexity 0.5, connection 1, neck 1, holes false, separate false
Shape.blob({ convexity, connection, neck, holes, separate });
// radius defaults to the padding; neck 0.5, holes false
Shape.fillet({ radius, neck, holes });
// presets: the blob at convexity 0, 1 and 2
Shape.spine();
Shape.hull();
Shape.oval();
