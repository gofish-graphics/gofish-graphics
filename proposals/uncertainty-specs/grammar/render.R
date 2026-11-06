# Render the images of the "One grammar" tab (#980). Run from the repo root:
#   Rscript proposals/uncertainty-specs/grammar/render.R
# Rendered with ggdist 3.3.3, ggdibbler 0.6.8.9000, distributional 0.9.0,
# ggplot2 4.0.1. Each chunk between "# ---- name ----" markers is the R code
# shown under the image of that name; the setup chunk is shared by all.

# ---- setup ----
library(ggplot2)
library(distributional)
library(dplyr)
library(sf)
library(ggdist)
library(ggdibbler)

data_dir <- "proposals/uncertainty-specs/ggdibbler-r/data"
img_dir <- "proposals/uncertainty-specs/grammar/img"
dir.create(img_dir, showWarnings = FALSE)
FILL <- "#3a6ea5"
theme_set(theme_minimal(base_size = 11) +
  theme(panel.grid.minor = element_blank()))
save <- function(plot, name, width = 4.2, height = 3) {
  ggsave(file.path(img_dir, paste0("gr-", name, ".png")), plot,
    width = width, height = height, dpi = 150, bg = "white"
  )
}

bars <- read.csv(file.path(data_dir, "bars.csv"))
tiles <- read.csv(file.path(data_dir, "tiles.csv"))
bar_y <- list(
  expand_limits(y = 0),
  coord_cartesian(ylim = c(0, 115), expand = c(FALSE, TRUE, FALSE, TRUE)),
  labs(y = "value")
)

# ---- bars-dodge ----
set.seed(1980)
p <- bars |>
  mutate(value = dist_normal(mean, se)) |>
  ggplot(aes(x = category, y = value)) +
  geom_col_sample(times = 20, fill = FILL) +
  bar_y
save(p, "bars-dodge")

# ---- bars-overlay ----
set.seed(1980)
p <- bars |>
  mutate(value = dist_normal(mean, se)) |>
  ggplot(aes(x = category, y = value)) +
  geom_col_sample(
    times = 50, fill = FILL, alpha = 0.05,
    position = "stack_identity"
  ) +
  bar_y
save(p, "bars-overlay")

# ---- bars-fade ----
p <- bars |>
  ggplot(aes(x = category, ydist = dist_normal(mean, se))) +
  stat_slab(
    aes(thickness = after_stat(1), slab_alpha = after_stat(1 - cdf)),
    side = "both", scale = 0.9, fill_type = "gradient", fill = FILL
  ) +
  scale_slab_alpha_continuous(range = c(0, 1), limits = c(0, 1), guide = "none") +
  bar_y
save(p, "bars-fade")

# ---- bars-ccdf ----
p <- bars |>
  ggplot(aes(x = category, ydist = dist_normal(mean, se))) +
  stat_ccdfinterval(
    scale = 0.9, fill = FILL, show_interval = FALSE, show_point = FALSE
  ) +
  bar_y
save(p, "bars-ccdf")

# ---- bars-sorted ----
set.seed(1980)
draws <- bars |>
  slice(rep(1:n(), each = 20)) |>
  mutate(value = rnorm(n(), mean, se)) |>
  group_by(category) |>
  mutate(rank = rank(value)) |>
  ungroup()
p <- ggplot(draws, aes(x = category, y = value, group = rank)) +
  geom_col(position = position_dodge(width = 0.9), width = 0.9, fill = FILL) +
  bar_y
save(p, "bars-sorted")

# ---- dots-setup ----
groups <- data.frame(
  group = c("a", "b", "c"),
  mean = c(5, 7, 8.5),
  sd = c(1, 1.5, 0.7)
)
dots_x <- list(coord_cartesian(xlim = c(1, 12), expand = c(TRUE, FALSE, TRUE, FALSE)), labs(x = "value"))

# ---- dots-20 ----
p <- groups |>
  ggplot(aes(y = group, xdist = dist_normal(mean, sd))) +
  stat_dots(quantiles = 20, fill = FILL, color = NA) +
  dots_x
save(p, "dots-20")

# ---- dots-100 ----
p <- groups |>
  ggplot(aes(y = group, xdist = dist_normal(mean, sd))) +
  stat_dots(quantiles = 100, fill = FILL, color = NA) +
  dots_x
save(p, "dots-100")

# ---- dots-slab ----
p <- groups |>
  ggplot(aes(y = group, xdist = dist_normal(mean, sd))) +
  stat_slab(fill = FILL) +
  dots_x
save(p, "dots-slab")

# ---- dots-interval ----
p <- groups |>
  ggplot(aes(y = group, xdist = dist_normal(mean, sd))) +
  stat_pointinterval(color = FILL, .width = c(0.66, 0.95)) +
  dots_x
save(p, "dots-interval")

# ---- dots-overlay ----
set.seed(1980)
p <- groups |>
  mutate(value = dist_normal(mean, sd)) |>
  ggplot(aes(x = value, y = group)) +
  geom_point_sample(times = 50, alpha = 0.15, color = FILL, size = 2.5) +
  dots_x
save(p, "dots-overlay")

# ---- paths-setup ----
# 50 shared forecast paths: a random walk from 50 with steps ~ Normal(2, 2).
set.seed(1980)
paths <- expand.grid(h = 1:20, draw = 1:50) |>
  group_by(draw) |>
  mutate(value = 50 + cumsum(rnorm(20, 2, 2))) |>
  ungroup()
by_h <- paths |>
  group_by(h) |>
  summarise(mean = mean(value), sd = sd(value))
paths_y <- coord_cartesian(ylim = c(40, 110))

# ---- paths-dibbler ----
set.seed(1980)
p <- by_h |>
  mutate(value = dist_normal(mean, sd)) |>
  ggplot(aes(x = h, y = value)) +
  geom_line_sample(times = 50, alpha = 0.25, color = FILL) +
  paths_y
save(p, "paths-dibbler")

# ---- paths-shared ----
p <- ggplot(paths, aes(x = h, y = value, group = draw)) +
  geom_line(alpha = 0.25, color = FILL) +
  paths_y
save(p, "paths-shared")

# ---- paths-ribbon ----
p <- ggplot(paths, aes(x = h, y = value)) +
  stat_lineribbon(.width = c(0.5, 0.8, 0.95), color = "#1f3b5c") +
  scale_fill_manual(values = c("#c6d4e6", "#94b0d2", "#5f88bb")) +
  paths_y +
  theme(legend.position = "inside", legend.position.inside = c(0.15, 0.78))
save(p, "paths-ribbon")

# ---- paths-rank ----
ranked <- paths |>
  group_by(h) |>
  mutate(rank = rank(value)) |>
  ungroup()
p <- ggplot(ranked, aes(x = h, y = value, group = rank)) +
  geom_line(alpha = 0.25, color = FILL) +
  paths_y
save(p, "paths-rank")

# ---- map-setup ----
square <- function(col, row) {
  st_polygon(list(rbind(
    c(col, -row), c(col + 1, -row), c(col + 1, -row - 1),
    c(col, -row - 1), c(col, -row)
  )))
}
tiles_sf <- tiles |>
  mutate(geometry = st_sfc(mapply(square, col, row, SIMPLIFY = FALSE))) |>
  st_as_sf()
map_fill <- scale_fill_distiller(
  palette = "Blues", direction = 1, limits = c(25, 105),
  oob = scales::squish, guide = "none"
)
outline <- geom_sf(
  data = tiles_sf, aes(geometry = geometry),
  fill = NA, colour = "white", linewidth = 0.7
)

# ---- map-subdivide ----
set.seed(1980)
p <- tiles_sf |>
  mutate(value = dist_normal(mean, sd)) |>
  ggplot() +
  geom_sf_sample(aes(geometry = geometry, fill = value),
    times = 16, linewidth = 0
  ) +
  outline +
  map_fill +
  theme_void()
save(p, "map-subdivide")

# ---- map-blend ----
# The limit of the blend: each region's color is the average (in sRGB) of
# the colors of 4000 of its draws, through the same palette as the others.
set.seed(1980)
avg_color <- function(mean, sd) {
  rgb_draws <- col2rgb(map_fill$map(rnorm(4000, mean, sd)))
  rgb(t(rowMeans(rgb_draws)), maxColorValue = 255)
}
p <- tiles_sf |>
  mutate(color = mapply(avg_color, mean, sd)) |>
  ggplot() +
  geom_sf(aes(geometry = geometry, fill = I(color)), colour = NA) +
  outline +
  theme_void()
save(p, "map-blend")

# ---- map-sorted ----
# 16 draws per region, sorted and laid into a 4 x 4 grid in reading order.
set.seed(1980)
cells <- tiles |>
  slice(rep(1:n(), each = 16)) |>
  mutate(value = rnorm(n(), mean, sd)) |>
  group_by(col, row) |>
  arrange(value, .by_group = TRUE) |>
  mutate(i = row_number() - 1) |>
  ungroup() |>
  mutate(
    x0 = col + (i %% 4) / 4,
    y0 = -row - (i %/% 4 + 1) / 4
  )
p <- ggplot(cells) +
  geom_rect(aes(
    xmin = x0, xmax = x0 + 0.25, ymin = y0, ymax = y0 + 0.25,
    fill = value
  )) +
  outline +
  map_fill +
  theme_void()
save(p, "map-sorted")

# ---- blur-setup ----
# 40 estimates, each with its own standard error, as in "Blur as a limit".
set.seed(1980)
estimates <- data.frame(
  estimate = exp(-0.3 + 0.6 * rnorm(40)),
  se = runif(40, 0.03, 0.2)
)
blur_x <- list(
  scale_x_continuous(limits = c(0, 4), expand = c(0, 0)),
  labs(x = "estimate")
)
blur_theme <- theme(
  axis.text.y = element_blank(), axis.title.y = element_blank(),
  panel.grid.major.y = element_blank()
)

# ---- blur-ggdist ----
p <- ggplot(estimates, aes(x = estimate, sd = se)) +
  geom_blur_dots(binwidth = 0.2, fill = FILL, color = NA, overflow = "keep") +
  blur_x +
  blur_theme
save(p, "blur-ggdist", height = 3.4)

# ---- blur-twolevel ----
# For each of 200 outer draws, draw every estimate from Normal(estimate, se),
# bin and stack that draw's dots with ggdist's own bin_dots(), and add each
# dot's coverage to a raster with weight 1/200 (a mean blend, not "over").
set.seed(1980)
n_outer <- 200
r <- 0.1 # dot radius: half the 0.2 bin
px <- 0.005 # raster cell size, in data units
grid_x <- seq(px / 2, 4, by = px)
grid_y <- seq(px / 2, 3, by = px)
coverage <- matrix(0, length(grid_y), length(grid_x))
for (d in seq_len(n_outer)) {
  x <- pmax(0, rnorm(nrow(estimates), estimates$estimate, estimates$se))
  dots <- bin_dots(x, 0, binwidth = 0.2)
  for (k in seq_len(nrow(dots))) {
    ix <- which(abs(grid_x - dots$x[k]) <= r)
    iy <- which(abs(grid_y - dots$y[k] - r) <= r)
    inside <- outer(grid_y[iy] - dots$y[k] - r, grid_x[ix] - dots$x[k],
      function(dy, dx) dx^2 + dy^2 <= r^2)
    coverage[iy, ix] <- coverage[iy, ix] + inside / n_outer
  }
}
raster <- expand.grid(y = grid_y, x = grid_x)
raster$coverage <- as.vector(coverage)
p <- ggplot(filter(raster, coverage > 0), aes(x, y, alpha = coverage)) +
  geom_raster(fill = FILL) +
  scale_alpha_identity() +
  coord_fixed(ylim = c(0, 3), expand = FALSE) +
  blur_x +
  blur_theme
save(p, "blur-twolevel", height = 3.4)
