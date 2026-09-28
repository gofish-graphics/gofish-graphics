library(ggplot2)
library(dplyr)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
sx <- 100   # budget between neighboring centers in a row
sy <- 1000  # box office between rows of the same lattice

# geom_hex anchors its lattice at the data range rounded to the bin width,
# so it cannot put the centers where the task asks. The bins are computed
# here: each film goes to the nearest center of the two offset lattices.
ax <- round(data$budget / sx) * sx
ay <- round(data$box_office / sy) * sy
bx <- (round(data$budget / sx - 0.5) + 0.5) * sx
by <- (round(data$box_office / sy - 0.5) + 0.5) * sy
dist <- function(cx, cy) ((data$budget - cx) / sx)^2 + 3 * ((data$box_office - cy) / sy)^2
use_a <- dist(ax, ay) <= dist(bx, by)
bins <- data.frame(cx = ifelse(use_a, ax, bx), cy = ifelse(use_a, ay, by)) |>
  count(cx, cy, name = "films") |>
  mutate(bin = row_number())

# Pointy-top hexagon corners around each center, in data units.
corner_x <- c(0, sx / 2, sx / 2, 0, -sx / 2, -sx / 2)
corner_y <- c(sy / 3, sy / 6, -sy / 6, -sy / 3, -sy / 6, sy / 6)
hexagons <- bins[rep(seq_len(nrow(bins)), each = 6), ] |>
  mutate(x = cx + rep(corner_x, nrow(bins)), y = cy + rep(corner_y, nrow(bins)))

plot <- ggplot(hexagons, aes(x = x, y = y, group = bin, fill = films)) +
  geom_polygon(color = "white", linewidth = 0.2) +
  scale_fill_gradient(low = "#fdd0a2", high = "#7f2704", name = "Films") +
  labs(x = "Budget (millions)", y = "Box office (millions)")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6, height = 4.5, units = "in")
