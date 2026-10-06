library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$genre <- factor(data$genre, levels = unique(data$genre))

# ggplot2 has no swarm layout, so the circles are placed here, in pixels.
# The panel gets a fixed size so that data units map to known pixels.
panel_w <- 480
panel_h <- 220
x_lim <- c(1930, 2025)
px_per_year <- panel_w / diff(x_lim)
r <- 6

# Place circles left to right, each at the offset from the center line
# nearest zero where it overlaps no circle already placed. The candidates
# are zero and the offsets that rest it against a neighbor.
data <- data[order(data$year), ]
cx <- (data$year - x_lim[1]) * px_per_year
dy <- numeric(nrow(data))
for (i in seq_len(nrow(data))) {
  near <- which(seq_len(nrow(data)) < i & abs(cx - cx[i]) < 2 * r)
  candidates <- 0
  for (j in near) {
    step <- sqrt((2 * r)^2 - (cx[j] - cx[i])^2)
    candidates <- c(candidates, dy[j] + step, dy[j] - step)
  }
  candidates <- candidates[order(abs(candidates))]
  fits <- vapply(candidates, function(c)
    all(sqrt((cx[near] - cx[i])^2 + (dy[near] - c)^2) >= 2 * r - 1e-6), logical(1))
  dy[i] <- candidates[fits][1]
}
data$dy <- dy

# A point of size s with no stroke has a radius of about 1.48 s px.
plot <- ggplot(data, aes(x = year, y = dy, color = genre)) +
  geom_point(size = r / 1.482, stroke = 0) +
  scale_x_continuous(limits = x_lim, expand = expansion(0)) +
  scale_y_continuous(limits = c(-panel_h / 2, panel_h / 2), expand = expansion(0)) +
  scale_color_brewer(palette = "Set1") +
  labs(x = "year", y = NULL) +
  theme_minimal() +
  theme(axis.text.y = element_blank(), panel.grid.major.y = element_blank(),
        panel.grid.minor.y = element_blank(),
        panel.widths = unit(panel_w / 100, "in"),
        panel.heights = unit(panel_h / 100, "in"))

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 3, units = "in")
