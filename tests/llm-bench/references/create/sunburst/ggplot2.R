library(ggplot2)
library(dplyr)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$region <- factor(data$region, levels = unique(data$region))

# Lay both rings out along one angular axis in population units, then
# bend it into a circle: regions fill y 0 to 1 (a pie), subregions 1 to 2.
outer <- data |>
  arrange(region) |>
  mutate(xmax = cumsum(population), xmin = xmax - population)
inner <- outer |>
  group_by(region) |>
  summarise(xmin = min(xmin), xmax = max(xmax))

plot <- ggplot() +
  geom_rect(data = inner, aes(xmin = xmin, xmax = xmax, ymin = 0, ymax = 1, fill = region),
            color = "white") +
  geom_rect(data = outer, aes(xmin = xmin, xmax = xmax, ymin = 1, ymax = 2, fill = region),
            color = "white", alpha = 0.6) +
  geom_text(data = inner, aes(x = (xmin + xmax) / 2, y = 0.6, label = region), size = 3.5) +
  coord_radial(expand = FALSE) +
  scale_fill_brewer(palette = "Set2", guide = "none") +
  theme_void()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.2, height = 5.2, units = "in")
