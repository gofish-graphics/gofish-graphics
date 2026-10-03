library(ggplot2)
library(waffle)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$lake <- factor(data$lake, levels = data$lake)

# One panel per lake: 5 squares per row, filled from the bottom up.
plot <- ggplot(data, aes(fill = lake, values = count)) +
  geom_waffle(n_rows = 5, flip = TRUE, color = "white", size = 0.5) +
  facet_wrap(~lake, nrow = 1, strip.position = "bottom") +
  coord_equal() +
  guides(fill = "none") +
  theme_void()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 4, units = "in")
