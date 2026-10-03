library(ggplot2)
library(dplyr)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

# Units are pixels: body 60 x 150, neck 20 x 50, bottles 120 apart.
bottles <- data |>
  mutate(cx = (row_number() - 1) * 120, level = fill_pct / 100 * 200)
outline <- bottles |>
  reframe(x = cx + c(-30, 30, 30, 10, 10, -10, -10, -30),
          y = c(0, 0, 150, 150, 200, 200, 150, 150), .by = wine)
neck <- filter(bottles, level > 150)

plot <- ggplot(bottles) +
  geom_rect(aes(xmin = cx - 30, xmax = cx + 30, ymin = 0, ymax = pmin(level, 150)),
            fill = "forestgreen") +
  geom_rect(data = neck, aes(xmin = cx - 10, xmax = cx + 10, ymin = 150, ymax = level),
            fill = "forestgreen") +
  geom_polygon(data = outline, aes(x = x, y = y, group = wine),
               fill = NA, color = "gray30", linewidth = 0.8) +
  geom_text(aes(x = cx, y = 212, label = paste0(fill_pct, "%"))) +
  geom_text(aes(x = cx, y = -14, label = wine)) +
  coord_equal() +
  theme_void()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 3.6, units = "in")
