library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

# ggplot2 has no dendrogram layout, so it is computed here: leaves get
# x = 1, 2, ... in depth-first order, and every other node sits at the
# middle of its children.
children <- split(data$name, data$parent)
x <- c()
place <- function(node) {
  kids <- children[[node]]
  if (is.null(kids)) {
    x[[node]] <<- length(x) + 1
  } else {
    for (k in kids) place(k)
    x[[node]] <<- mean(unlist(x[kids]))
  }
}
root <- data$name[data$parent == ""]
place(root)
x <- unlist(x)
height <- setNames(data$height, data$name)

links <- data[data$parent != "", ]
# A vertical line from each child up to its parent's height, and a
# horizontal line at each parent's height across its children.
verticals <- data.frame(x = x[links$name], y = height[links$name],
                        yend = height[links$parent])
parents <- unique(links$parent)
horizontals <- data.frame(
  y = height[parents],
  x = sapply(parents, function(p) min(x[children[[p]]])),
  xend = sapply(parents, function(p) max(x[children[[p]]]))
)
leaves <- data[data$height == 0, ]
leaves$x <- x[leaves$name]

plot <- ggplot() +
  geom_segment(data = verticals, aes(x = x, xend = x, y = y, yend = yend)) +
  geom_segment(data = horizontals, aes(x = x, xend = xend, y = y, yend = y)) +
  geom_text(data = leaves, aes(x = x, y = 0, label = name), vjust = 1.5, size = 3.5) +
  scale_x_continuous(breaks = NULL, expand = expansion(add = 0.6)) +
  scale_y_continuous(expand = expansion(mult = c(0.08, 0.02))) +
  labs(x = NULL, y = "height") +
  theme_minimal()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
