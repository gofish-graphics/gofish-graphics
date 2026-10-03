library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

# 100 cells in reading order: row 1 is the top row, filled left to right.
# (waffle::geom_waffle always starts at the bottom-left.)
cells <- expand.grid(col = 1:10, row = 1:10)
cells$source <- factor(rep(data$source, data$percent), levels = data$source)

plot <- ggplot(cells, aes(x = col, y = row, fill = source)) +
  geom_tile(width = 0.9, height = 0.9) +
  scale_y_reverse() +
  coord_equal() +
  theme_void()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 4, units = "in")
