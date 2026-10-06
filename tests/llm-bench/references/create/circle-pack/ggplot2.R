library(ggplot2)
library(dplyr)
library(packcircles)
library(ggforce)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

# Pack each genre's films around the origin, circle areas proportional to gross.
films <- data |>
  group_by(genre) |>
  group_modify(~ cbind(.x, circleProgressiveLayout(.x$gross, sizetype = "area"))) |>
  ungroup()
# Each genre's circle encloses its films; then pack the genre circles.
genres <- films |>
  group_by(genre) |>
  summarise(r = 1.03 * max(sqrt(x^2 + y^2) + radius))
placed <- circleProgressiveLayout(genres$r, sizetype = "radius")
genres <- mutate(genres, gx = placed$x, gy = placed$y)
films <- films |>
  left_join(genres, by = "genre") |>
  mutate(x = x + gx, y = y + gy)

plot <- ggplot() +
  geom_circle(data = genres, aes(x0 = gx, y0 = gy, r = r), fill = "gray95", color = "gray60") +
  geom_circle(data = films, aes(x0 = x, y0 = y, r = radius, fill = genre), color = NA) +
  geom_text(data = genres, aes(x = gx, y = gy + r, label = genre), vjust = -0.3) +
  coord_equal() +
  guides(fill = "none") +
  theme_void()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.2, height = 5.2, units = "in")
