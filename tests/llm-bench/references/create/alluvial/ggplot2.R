library(ggplot2)
library(ggforce)
library(dplyr)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
steps <- c("class", "survival", "gender")
node_w <- 0.1   # node width, in column units
gap <- 40       # gap between nodes, in passengers

# ggforce's parallel sets merge the ribbons between each pair of axes and
# restack them inside each node, so a ribbon does not keep its slot through
# the middle column. The alluvial layout is computed here instead.
cats <- lapply(steps, function(s) unique(data[[s]]))
data$id <- seq_len(nrow(data))
ranks <- sapply(seq_along(steps), function(i) match(data[[steps[i]]], cats[[i]]))

# Nodes stacked top to bottom (y grows downward, flipped by the scale).
nodes <- do.call(rbind, lapply(seq_along(steps), function(i) {
  totals <- tapply(data$count, factor(data[[steps[i]]], levels = cats[[i]]), sum)
  top <- c(0, cumsum(totals + gap))[seq_along(totals)]
  data.frame(step = i, name = cats[[i]], top = top, bottom = top + totals)
}))

# Inside each node, the ribbons are stacked in the order of the other two
# steps' categories, so a ribbon keeps its slot through a middle node.
slot <- matrix(0, nrow(data), length(steps))
for (i in seq_along(steps)) {
  others <- setdiff(seq_along(steps), i)
  for (r in seq_len(nrow(nodes))) {
    if (nodes$step[r] != i) next
    rows <- which(data[[steps[i]]] == nodes$name[r])
    rows <- rows[order(ranks[rows, others[1]], ranks[rows, others[2]])]
    slot[rows, i] <- nodes$top[r] + c(0, cumsum(data$count[rows]))[seq_along(rows)]
  }
}

# One wide diagonal per ribbon per gap, from the right edge of one node to
# the left edge of the next, given by its four corners.
bands <- do.call(rbind, lapply(1:2, function(g) {
  do.call(rbind, lapply(seq_len(nrow(data)), function(r) {
    data.frame(
      x = c(g + node_w / 2, g + 1 - node_w / 2, g + 1 - node_w / 2, g + node_w / 2),
      y = c(slot[r, g], slot[r, g + 1], slot[r, g + 1] + data$count[r],
            slot[r, g] + data$count[r]),
      band = paste(g, r), class = data$class[r])
  }))
}))
bands$class <- factor(bands$class, levels = cats[[1]])

plot <- ggplot() +
  geom_diagonal_wide(data = bands, aes(x = x, y = y, group = band, fill = class),
                     alpha = 0.5) +
  geom_rect(data = nodes, aes(xmin = step - node_w / 2, xmax = step + node_w / 2,
                              ymin = top, ymax = bottom), fill = "#444444") +
  geom_text(data = nodes, aes(x = ifelse(step == 1, step - node_w / 2 - 0.03, step + node_w / 2 + 0.03),
                              y = (top + bottom) / 2, label = name,
                              hjust = ifelse(step == 1, 1, 0)), size = 3.5) +
  scale_x_continuous(breaks = seq_along(steps), labels = steps,
                     expand = expansion(add = 0.35)) +
  scale_y_reverse() +
  scale_fill_brewer(palette = "Set1") +
  labs(x = NULL, y = NULL) +
  theme_void() +
  theme(axis.text.x = element_text())

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4.2, units = "in")
