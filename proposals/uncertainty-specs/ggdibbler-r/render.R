# Render the ggdibbler column of the "ggdibbler" tab (#980) with real
# ggdibbler code. Run from the repo root, after export-estimates.ts:
#   Rscript proposals/uncertainty-specs/ggdibbler-r/render.R
# Rendered with ggdibbler 0.6.8.9000 (GitHub main, 6bca10a) and
# distributional 0.9.0.
library(ggplot2)
library(distributional)
library(dplyr)
library(sf)
library(ggdibbler)

data_dir <- "proposals/uncertainty-specs/ggdibbler-r/data"
img_dir <- "proposals/uncertainty-specs/img"
save <- function(plot, name, width = 5.2, height = 3.2) {
  ggsave(file.path(img_dir, name), plot,
    width = width, height = height, dpi = 150, bg = "white"
  )
}

bars <- read.csv(file.path(data_dir, "bars.csv"))
points <- read.csv(file.path(data_dir, "points.csv"))
forecast <- read.csv(file.path(data_dir, "forecast.csv"))
tiles <- read.csv(file.path(data_dir, "tiles.csv"))

# 1. Uncertain bar chart, dodged draws
set.seed(1980)
p <- bars |>
  mutate(value = dist_normal(mean, se)) |>
  ggplot(aes(x = category, y = value)) +
  geom_col_sample(times = 20)
save(p, "ggd-bar-dodge.png")

# 2. Uncertain counts, stack_dodge (README)
set.seed(1980)
p <- ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), position = "stack_dodge")
save(p, "ggd-mpg-stack-dodge.png", width = 6.4)

# 3. Uncertain counts, stack_identity (README)
set.seed(1980)
p <- ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), alpha = 0.15, position = "stack_identity")
save(p, "ggd-mpg-stack-identity.png", width = 6.4)

# 4. Uncertain scatter
set.seed(1980)
p <- points |>
  mutate(x = dist_normal(x, xSe), y = dist_normal(y, ySe)) |>
  ggplot(aes(x = x, y = y, colour = group)) +
  geom_point_sample(times = 30, alpha = 0.3)
save(p, "ggd-scatter.png", width = 4.6, height = 3.6)

# 5. Uncertain forecast line
set.seed(1980)
p <- forecast |>
  mutate(value = dist_normal(mean, sd)) |>
  ggplot(aes(x = h, y = value)) +
  geom_line_sample(times = 30, alpha = 0.3)
save(p, "ggd-forecast-lines.png")

# 6. Uncertain map, subdivided (pixel map)
square <- function(col, row) {
  st_polygon(list(rbind(
    c(col, -row), c(col + 1, -row), c(col + 1, -row - 1),
    c(col, -row - 1), c(col, -row)
  )))
}
tiles_sf <- tiles |>
  mutate(geometry = st_sfc(mapply(square, col, row, SIMPLIFY = FALSE))) |>
  st_as_sf()

set.seed(1980)
p <- tiles_sf |>
  mutate(value = dist_normal(mean, sd)) |>
  ggplot() +
  geom_sf_sample(aes(geometry = geometry, fill = value),
    times = 16, linewidth = 0
  ) +
  geom_sf(aes(geometry = geometry), fill = NA, colour = "white", linewidth = 0.7) +
  scale_fill_distiller(palette = "Blues", direction = 1) +
  theme_void()
save(p, "ggd-map-subdivide.png", width = 4.6, height = 3.2)

# 7. Issue #49: draws of a date. dist_normal() does not take a Date, so each
# milestone holds a sample of dates (dist_sample), the same draws as the
# GoFish story. The axis shows day numbers, not dates.
milestones <- read.csv(file.path(data_dir, "milestones.csv")) |>
  mutate(date = as.Date(date)) |>
  group_by(milestone) |>
  summarise(date = dist_sample(list(date))) |>
  mutate(milestone = factor(milestone,
    levels = c("Review", "Launch", "Pilot", "Prototype", "Design")
  ))

set.seed(1980)
p <- ggplot(milestones, aes(x = date, y = milestone)) +
  geom_point_sample(times = 30, alpha = 0.25)
save(p, "ggd-milestone-dates.png", height = 2.4)
