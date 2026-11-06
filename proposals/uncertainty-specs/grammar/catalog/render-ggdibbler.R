# Render every main ggdibbler example (#980 grammar catalog).
# Run from the worktree root:
#   Rscript proposals/uncertainty-specs/grammar/catalog/render-ggdibbler.R
# Selection rule: README plots, then every @examples plot of the exported
# geom_*_sample / stat_*_sample / position_* help pages (in Rd order), then
# every ggdibbler figure of the JCGS paper. Merges are listed in
# ggdibbler-summary.md. Writes img/ggdibbler-NN-<slug>.png and
# ggdibbler-r.json (the R half of ggdibbler.json).
suppressPackageStartupMessages({
  library(ggplot2)
  library(distributional)
  library(dplyr)
  library(sf)
  library(ggdibbler)
  library(patchwork)
  library(jsonlite)
})

out_dir <- "proposals/uncertainty-specs/grammar/catalog"
img_dir <- file.path(out_dir, "img")
dir.create(img_dir, showWarnings = FALSE, recursive = TRUE)

E <- list()
add <- function(slug, source, title, code, width = 3.4, height = 2.4,
                seed = 980, merged = character()) {
  E[[length(E) + 1]] <<- list(
    slug = slug, source = source, title = title, code = trimws(code),
    width = width, height = height, seed = seed, merged = merged
  )
}

# ---------------------------------------------------------------- README
add("readme-contour", "README", "Uncertain contours of faithfuld", r"---(
ggplot(uncertain_faithfuld, aes(waiting, eruptions, z = density0)) +
  geom_contour_sample(alpha = 0.2)
)---", seed = 1343)
add("raster-faithfuld", "README; Rd geom_raster_sample ex 1; paper Fig 5c",
  "Raster of faithfuld density, some error (identity_dodge)", r"---(
ggplot(uncertain_faithfuld, aes(waiting, eruptions)) +
  geom_raster_sample(aes(fill = density))
)---", seed = 1343, merged = c("Rd geom_raster_sample example 1 (no title/theme)", "paper Fig 5c (palette, title)"))
add("raster-faithfuld-more", "README; paper Fig 5d",
  "Raster of faithfuld density, more error", r"---(
ggplot(uncertain_faithfuld, aes(waiting, eruptions)) +
  geom_raster_sample(aes(fill = density2))
)---", seed = 1343, merged = c("paper Fig 5d (palette, title)"))
add("readme-stack-deterministic", "README",
  "geom_bar_sample stack on deterministic mpg", r"---(
ggplot(mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), position = "stack")
)---", seed = 1343)
add("stack-identity", "README; Rd position_stack_nested ex 3",
  "Uncertain mpg counts, stack_identity", r"---(
ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), alpha = 0.15, position = "stack_identity")
)---", seed = 1343, merged = c("Rd position_stack_nested example 3 (alpha 0.2 instead of 0.15)"))
add("stack-dodge", "README; Rd position_stack_nested ex 4",
  "Uncertain mpg counts, stack_dodge", r"---(
ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), position = "stack_dodge")
)---", seed = 1343, merged = c("Rd position_stack_nested example 4 (byte-identical plot code; README adds theme and title)"))
add("readme-sf-map", "README", "Iowa temperature map, subdivided, with borders", r"---(
toy_temp_dist |>
  ggplot() +
  geom_sf_sample(aes(geometry = county_geometry, fill = temp_dist),
    linewidth = 0, times = 50) +
  geom_sf(aes(geometry = county_geometry), fill = NA, linewidth = 0.7) +
  scale_fill_distiller(palette = "OrRd")
)---", seed = 1343)

# ---------------------------------------------------------------- Rd
add("abline-intercept", "Rd geom_abline_sample", "Random intercept reference line over points", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg)) + geom_point_sample(alpha = 0.3) +
  geom_abline_sample(intercept = dist_normal(20, 1), alpha = 0.3)
)---")
add("vline", "Rd geom_abline_sample", "Random vertical reference line", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg)) + geom_point_sample(alpha = 0.3) +
  geom_vline_sample(xintercept = dist_normal(5, 0.1), alpha = 0.3)
)---")
add("hline", "Rd geom_abline_sample", "Random horizontal reference line", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg)) + geom_point_sample(alpha = 0.3) +
  geom_hline_sample(yintercept = dist_normal(20, 1), alpha = 0.3)
)---")
add("abline-coef", "Rd geom_abline_sample; paper Fig 10a",
  "Regression line with random slope and intercept", r"---(
ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  geom_abline_sample(intercept = dist_normal(37, 1.8),
    slope = dist_normal(-5, 0.56), times = 30, alpha = 0.3)
)---", merged = c("paper Fig 10a (line colour only)"))
add("bar-count", "Rd geom_bar_sample", "Uncertain class counts (stack_dodge default)", r"---(
ggplot(uncertain_mpg, aes(class)) + geom_bar_sample()
)---")
add("bar-count-identity", "Rd geom_bar_sample", "Uncertain class counts, identity_identity", r"---(
ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(position = "identity_identity", alpha = 0.1)
)---")
add("col", "Rd geom_bar_sample", "Uncertain bar heights (geom_col_sample)", r"---(
uncertain_df <- data.frame(trt = c("a", "b", "c"),
  outcome = dist_normal(mean = c(2.3, 1.9, 3.2), sd = c(0.5, 0.8, 0.7)))
ggplot(uncertain_df, aes(x = trt, y = outcome)) + geom_col_sample()
)---")
add("bar-horizontal-reverse", "Rd geom_bar_sample",
  "Horizontal stacked counts, stack_dodge(reverse)", r"---(
ggplot(uncertain_mpg, aes(y = class)) +
  geom_bar_sample(aes(fill = drv), alpha = 1,
    position = position_stack_dodge(reverse = TRUE)) +
  theme(legend.position = "top")
)---")
add("bin2d", "Rd geom_bin_2d_sample", "2D bin counts, 100 draws dodged", r"---(
ggplot(smaller_uncertain_diamonds, aes(x, y)) + geom_bin_2d_sample(times = 100)
)---")
add("bin2d-identity", "Rd geom_bin_2d_sample", "2D bin counts, draws overlaid", r"---(
ggplot(smaller_uncertain_diamonds, aes(x, y)) +
  geom_bin_2d_sample(position = "identity", alpha = 0.1)
)---")
add("bin2d-10", "Rd geom_bin_2d_sample", "2D bin counts, 10 bins", r"---(
ggplot(smaller_uncertain_diamonds, aes(x, y)) + geom_bin_2d_sample(bins = 10)
)---")
add("boxplot", "Rd geom_boxplot_sample", "Uncertain boxplots", r"---(
ggplot(uncertain_mpg, aes(class, hwy)) + geom_boxplot_sample(alpha = 0.1)
)---")
add("boxplot-varwidth", "Rd geom_boxplot_sample", "Uncertain boxplots, varwidth", r"---(
ggplot(uncertain_mpg, aes(class, hwy)) +
  geom_boxplot_sample(alpha = 0.1, varwidth = TRUE)
)---")
add("boxplot-dodge-identity", "Rd geom_boxplot_sample", "Boxplots by drv, dodge_identity", r"---(
ggplot(uncertain_mpg, aes(class, hwy)) +
  geom_boxplot_sample(aes(colour = drv), alpha = 0.05, position = "dodge_identity")
)---")
add("contour", "Rd geom_contour_sample", "Contours of a filtered faithfuld", r"---(
ggplot(uncertain_faithfuld |> filter(waiting > 80) |> filter(eruptions > 3),
  aes(waiting, eruptions, z = density)) + geom_contour_sample()
)---")
add("contour-filled", "Rd geom_contour_sample", "Filled contours", r"---(
ggplot(uncertain_faithfuld |> filter(waiting > 80) |> filter(eruptions > 3),
  aes(waiting, eruptions, z = density)) + geom_contour_filled_sample()
)---")
add("point-cty-hwy", "Rd geom_count_sample", "Overplotted uncertain points", r"---(
ggplot(uncertain_mpg, aes(cty, hwy)) + geom_point_sample()
)---")
add("count", "Rd geom_count_sample; paper Fig 14a; paper Fig 10e",
  "geom_count bubbles, draws overlaid", r"---(
ggplot(uncertain_mpg, aes(cty, hwy)) + geom_count_sample(alpha = 0.15)
)---", merged = c("paper Fig 14a (same help-file example, theme)", "paper Fig 10e (colour/shape only; reconstructed match)"))
add("count-size-area", "Rd geom_count_sample", "geom_count with scale_size_area", r"---(
ggplot(uncertain_mpg, aes(cty, hwy)) + geom_count_sample(alpha = 0.15) +
  scale_size_area()
)---")
add("density2d", "Rd geom_density_2d_sample", "2D density contours over points", r"---(
ggplot(uncertain_faithful, aes(x = eruptions, y = waiting)) +
  geom_point_sample(size = 2/10) +
  scale_x_continuous_distribution(limits = c(0.5, 6)) +
  scale_y_continuous_distribution(limits = c(40, 110)) +
  geom_density_2d_sample(linewidth = 2/10, alpha = 0.5)
)---")
add("density2d-filled", "Rd geom_density_2d_sample", "2D density bands", r"---(
ggplot(uncertain_faithful, aes(x = eruptions, y = waiting)) +
  geom_point_sample(size = 2/10) +
  scale_x_continuous_distribution(limits = c(0.5, 6)) +
  scale_y_continuous_distribution(limits = c(40, 110)) +
  geom_density_2d_filled_sample(alpha = 0.1)
)---")
add("density", "Rd geom_density_sample", "Density of carat, one curve per draw", r"---(
ggplot(smaller_uncertain_diamonds, aes(carat)) + geom_density_sample(alpha = 0.5)
)---")
add("density-by-cut", "Rd geom_density_sample", "Densities of depth by cut", r"---(
ggplot(smaller_uncertain_diamonds, aes(depth, fill = cut)) +
  geom_density_sample(aes(colour = after_stat(fill)), alpha = 0.1) +
  scale_x_continuous_distribution(limits = c(55, 70))
)---")
add("dotplot", "Rd geom_dotplot_sample; paper Fig 14 (middle)", "Dot plot of mpg, draws overlaid", r"---(
ggplot(uncertain_mtcars, aes(x = mpg)) + geom_dotplot_sample(alpha = 0.2)
)---", merged = c("paper Fig 14 middle panel (same help-file example)"))
add("dotplot-binwidth", "Rd geom_dotplot_sample", "Dot plot, binwidth 1.5", r"---(
ggplot(uncertain_mtcars, aes(x = mpg)) +
  geom_dotplot_sample(binwidth = 1.5, alpha = 0.2)
)---")
add("dotplot-histodot", "Rd geom_dotplot_sample", "Dot plot, fixed-width bins (histodot)", r"---(
ggplot(uncertain_mtcars, aes(x = mpg)) +
  geom_dotplot_sample(method = "histodot", binwidth = 1.5, alpha = 0.2)
)---")
add("hex", "Rd geom_hex_sample", "Hex bins of carat and price", r"---(
ggplot(smaller_uncertain_diamonds, aes(carat, price)) + geom_hex_sample(alpha = 0.15)
)---")
add("hex-10", "Rd geom_hex_sample", "Hex bins, 10 bins", r"---(
ggplot(smaller_uncertain_diamonds, aes(carat, price)) +
  geom_hex_sample(bins = 10, alpha = 0.15)
)---")
add("histogram", "Rd geom_histogram_sample", "Histogram of carat (stack_dodge default)", r"---(
ggplot(smaller_uncertain_diamonds, aes(carat)) + geom_histogram_sample()
)---")
add("histogram-identity", "Rd geom_histogram_sample", "Histogram, identity_identity", r"---(
ggplot(smaller_uncertain_diamonds, aes(carat)) +
  geom_histogram_sample(position = "identity_identity", alpha = 0.15)
)---")
add("freqpoly", "Rd geom_histogram_sample", "Frequency polygons of price by cut", r"---(
ggplot(smaller_uncertain_diamonds, aes(price, colour = cut)) +
  geom_freqpoly_sample(binwidth = 500)
)---")
add("histogram-fill", "Rd geom_histogram_sample", "Histogram of price filled by cut", r"---(
ggplot(smaller_uncertain_diamonds, aes(price, fill = cut)) +
  geom_histogram_sample(binwidth = 500)
)---")
add("point-cyl-hwy", "Rd geom_jitter_sample", "Points of cyl and hwy", r"---(
ggplot(uncertain_mpg, aes(cyl, hwy)) + geom_point_sample(times = 10)
)---")
add("jitter", "Rd geom_jitter_sample", "Jittered uncertain points", r"---(
ggplot(uncertain_mpg, aes(cyl, hwy)) + geom_jitter_sample(times = 10)
)---")
add("jitter-deterministic", "Rd geom_jitter_sample", "geom_jitter_sample on deterministic mpg", r"---(
ggplot(mpg, aes(cyl, hwy)) + geom_jitter_sample(aes(colour = class))
)---")
interval_prep <- r"---(
df <- data.frame(trt = factor(c(1, 1, 2, 2)), resp = c(1, 5, 3, 4),
  group = factor(c(1, 2, 1, 2)), upper = c(1.1, 5.3, 3.3, 4.2),
  lower = c(0.8, 4.6, 2.4, 3.6))
uncertain_df <- df |> group_by(trt, group) |>
  mutate(resp = dist_normal(resp, runif(1, 0, 0.2)),
    upper = dist_normal(upper, runif(1, 0, 0.2)),
    lower = dist_normal(lower, runif(1, 0, 0.2)))
)---"
add("linerange", "Rd geom_linerange_sample", "Uncertain line ranges", paste0(interval_prep, r"---(
ggplot(uncertain_df, aes(trt, resp, colour = group)) +
  geom_linerange_sample(aes(ymin = lower, ymax = upper), linewidth = 4)
)---"))
add("pointrange", "Rd geom_linerange_sample", "Uncertain point ranges", paste0(interval_prep, r"---(
ggplot(uncertain_df, aes(trt, resp, colour = group)) +
  geom_pointrange_sample(aes(ymin = lower, ymax = upper))
)---"))
add("crossbar", "Rd geom_linerange_sample", "Uncertain crossbars", paste0(interval_prep, r"---(
ggplot(uncertain_df, aes(trt, resp, colour = group)) +
  geom_crossbar_sample(aes(ymin = lower, ymax = upper), width = 0.2)
)---"))
add("errorbar", "Rd geom_linerange_sample", "Uncertain error bars", paste0(interval_prep, r"---(
ggplot(uncertain_df, aes(trt, resp, colour = group)) +
  geom_errorbar_sample(aes(ymin = lower, ymax = upper), width = 0.2)
)---"))
add("line-economics", "Rd geom_path_sample", "Unemployment over time, one line per draw", r"---(
ggplot(uncertain_economics, aes(date, unemploy)) + geom_line_sample(alpha = 0.1)
)---")
add("step", "Rd geom_path_sample", "Step lines since 2013", r"---(
uncertain_recent <- uncertain_economics[uncertain_economics$date > as.Date("2013-01-01"), ]
ggplot(uncertain_recent, aes(date, unemploy)) + geom_step_sample(alpha = 0.5)
)---")
add("path", "Rd geom_path_sample", "Connected scatter of unemploy and psavert, coloured by date", r"---(
ggplot(uncertain_economics, aes(unemploy, psavert)) +
  geom_path_sample(aes(colour = as.numeric(date)), alpha = 0.15)
)---")
add("line-na", "Rd geom_path_sample", "Points and lines with a missing value, shared seed", r"---(
df <- data.frame(x = 1:5, y = c(1, 2, NA, 4, 5))
uncertain_df <- df |> mutate(y = dist_normal(y, 0.3))
ggplot(uncertain_df, aes(x, y)) +
  geom_point_sample(seed = 33) + geom_line_sample(seed = 33)
)---")
add("point-mtcars", "Rd geom_point_sample", "Scatter of wt and mpg, 50 draws", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg)) + geom_point_sample(times = 50, alpha = 0.5)
)---")
add("point-colour", "Rd geom_point_sample", "Scatter coloured by a random category", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg)) +
  geom_point_sample(aes(colour = dist_transformed(cyl, factor, as.numeric))) +
  labs(colour = "factor(cyl)")
)---")
add("point-shape", "Rd geom_point_sample", "Scatter with a random shape", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg)) +
  geom_point_sample(aes(shape = dist_transformed(cyl, factor, as.numeric))) +
  labs(shape = "factor(cyl)")
)---")
add("bubble", "Rd geom_point_sample", "Bubble chart with random size", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg)) + geom_point_sample(aes(size = qsec), alpha = 0.15)
)---")
poly_prep <- r"---(
ids <- factor(c("1.1", "2.1", "1.2", "2.2", "1.3", "2.3"))
positions <- data.frame(id = rep(ids, each = 4),
  x = c(2, 1, 1.1, 2.2, 1, 0, 0.3, 1.1, 2.2, 1.1, 1.2, 2.5, 1.1, 0.3,
        0.5, 1.2, 2.5, 1.2, 1.3, 2.7, 1.2, 0.5, 0.6, 1.3),
  y = c(-0.5, 0, 1, 0.5, 0, 0.5, 1.5, 1, 0.5, 1, 2.1, 1.7, 1, 1.5,
        2.2, 2.1, 1.7, 2.1, 3.2, 2.8, 2.1, 2.2, 3.3, 3.2))
)---"
add("polygon", "Rd geom_polygon_sample", "Polygons with random vertices and fill", paste0(poly_prep, r"---(
values <- data.frame(id = ids, value = c(3, 3.1, 3.1, 3.2, 3.15, 3.5))
datapoly <- merge(values, positions, by = c("id"))
uncertain_datapoly <- datapoly |>
  mutate(x = dist_uniform(x - 0.1, x + 0.1), y = dist_uniform(y - 0.1, y + 0.1),
    value = dist_uniform(value - 0.5, value + 0.5))
ggplot(uncertain_datapoly, aes(x = x, y = y)) +
  geom_polygon_sample(aes(fill = value, group = id), alpha = 0.15)
)---"))
add("qq-t", "Rd geom_qq_sample", "QQ plot of uncertain t draws", r"---(
uncertain_df <- data.frame(y = dist_normal(rt(200, df = 5), runif(200)))
ggplot(uncertain_df, aes(sample = y)) + stat_qq_sample() + stat_qq_line_sample()
)---")
add("qq-mtcars", "Rd geom_qq_sample", "QQ plot of mpg", r"---(
ggplot(uncertain_mtcars, aes(sample = mpg)) + stat_qq_sample() + stat_qq_line_sample()
)---")
add("quantile-reg", "Rd geom_quantile_sample", "Quantile regression lines", r"---(
ggplot(uncertain_mpg, aes(displ, hwy)) + geom_point_sample(alpha = 0.3) +
  geom_quantile_sample(alpha = 0.3)
)---")
add("quantile-reg-median", "Rd geom_quantile_sample", "Median regression line", r"---(
ggplot(uncertain_mpg, aes(displ, hwy)) + geom_point_sample(alpha = 0.3) +
  geom_quantile_sample(quantiles = 0.5, alpha = 0.3)
)---")
huron_prep <- r"---(
huron <- data.frame(year = 1875:1972, level = as.vector(LakeHuron))
uncertain_huron <- huron |> group_by(year) |>
  mutate(level = dist_normal(level, runif(1, 0, 2)))
)---"
add("ribbon-area", "Rd geom_ribbon_sample", "Area from 0 to Lake Huron level", paste0(huron_prep, r"---(
ggplot(uncertain_huron, aes(year)) +
  geom_ribbon_sample(aes(ymin = 0, ymax = level), alpha = 0.15)
)---"))
add("ribbon-band-line", "Rd geom_ribbon_sample", "Band of level +/- 1 with a line, shared seed", paste0(huron_prep, r"---(
ggplot(uncertain_huron, aes(year)) +
  geom_ribbon_sample(aes(ymin = level - 1, ymax = level + 1),
    fill = "grey70", seed = 4, alpha = 0.15) +
  geom_line_sample(aes(y = level), seed = 4, alpha = 0.15)
)---"))
add("area-facet", "Rd geom_ribbon_sample", "Faceted areas with random x and y, points share the seed", r"---(
df <- data.frame(g = c("a", "a", "a", "b", "b", "b"), x = c(1, 3, 5, 2, 4, 6),
  y = c(2, 5, 1, 3, 6, 7))
uncertain_df <- df |> mutate(x = dist_normal(x, 0.8), y = dist_normal(y, 0.8))
ggplot(uncertain_df, aes(x, y, fill = g)) +
  geom_area_sample(seed = 100, alpha = 0.15) + geom_point_sample(seed = 100) +
  facet_grid(g ~ .)
)---")
add("rug", "Rd geom_rug_sample", "Rug in the margins, shared seed", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg)) + geom_point_sample(seed = 4) +
  geom_rug_sample(seed = 4, alpha = 0.5)
)---")
add("segment-curve", "Rd geom_segment_sample", "A random segment and curve over points", r"---(
uncertain_df <- data.frame(x1 = dist_normal(2.62, 0.1), x2 = dist_normal(3.57, 0.1),
  y1 = dist_normal(21.0, 0.1), y2 = dist_normal(15.0, 0.1))
ggplot(uncertain_mtcars, aes(wt, mpg)) + geom_point_sample(seed = 77, alpha = 0.5) +
  geom_curve_sample(aes(x = x1, y = y1, xend = x2, yend = y2, colour = "curve"),
    data = uncertain_df, seed = 77, alpha = 0.5) +
  geom_segment_sample(aes(x = x1, y = y1, xend = x2, yend = y2, colour = "segment"),
    data = uncertain_df, seed = 77, alpha = 0.5)
)---")
add("sf-subdivide", "Rd geom_sf_sample", "Three counties subdivided into 100 draws", r"---(
toy_temp_dist |>
  filter(county_name %in% c("Pottawattamie County", "Mills County", "Cass County")) |>
  ggplot() +
  geom_sf_sample(times = 100, linewidth = 0, aes(geometry = county_geometry, fill = temp_dist))
)---")
add("sf-subdivide-border", "Rd geom_sf_sample", "Three counties subdivided, with borders", r"---(
toy_temp_dist |>
  filter(county_name %in% c("Pottawattamie County", "Mills County", "Cass County")) |>
  ggplot() +
  geom_sf_sample(aes(geometry = county_geometry, fill = temp_dist), linewidth = 0, times = 100) +
  geom_sf(aes(geometry = county_geometry), fill = NA, linewidth = 1)
)---")
add("smooth", "Rd geom_smooth_sample; paper Fig 7b", "Loess smooth per draw, with points", r"---(
ggplot(uncertain_mpg, aes(displ, hwy)) +
  geom_point_sample(alpha = 0.5, size = 0.2, seed = 22) +
  geom_smooth_sample(linewidth = 0.2, alpha = 0.1, seed = 22)
)---", merged = c("paper Fig 7b (same chart; paper code not given, reconstructed match)"))
add("smooth-lm-class", "Rd geom_smooth_sample", "Linear fits per class per draw", r"---(
ggplot(uncertain_mpg, aes(displ, hwy, colour = class)) +
  geom_point_sample(alpha = 0.5, size = 0.2, seed = 22) +
  geom_smooth_sample(linewidth = 0.2, alpha = 0.1, se = FALSE, method = lm, seed = 22)
)---")
add("spoke", "Rd geom_spoke_sample", "Vector field with random angle and speed", r"---(
set.seed(1)
df <- expand.grid(x = 1:10, y = 1:10)
df$angle <- runif(100, 0, 2 * pi)
df$speed <- runif(100, 0, sqrt(0.1 * df$x))
uncertain_df <- df |> group_by(x, y) |>
  mutate(angle = dist_normal(angle, runif(1, 0, 0.5)),
    speed = dist_normal(speed, runif(1, 0, 0.1))) |> ungroup()
ggplot(uncertain_df, aes(x, y)) + geom_point_sample() +
  geom_spoke_sample(aes(angle = angle, radius = speed), alpha = 0.3)
)---")
add("text", "Rd geom_text_sample", "Car names at random positions", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg, label = rownames(uncertain_mtcars))) +
  geom_text_sample(times = 3, alpha = 0.5)
)---")
add("label", "Rd geom_text_sample", "Car labels with background", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg, label = rownames(uncertain_mtcars))) +
  geom_label_sample(times = 3, alpha = 0.5)
)---")
add("text-random-label", "Rd geom_text_sample", "Random text at a fixed position", r"---(
ggplot(uncertain_mtcars, aes(mean(wt), mean(mpg), lab = cyl)) +
  geom_text_sample(aes(label = after_stat(lab)), size = 6, alpha = 0.3)
)---")
add("raster-grid", "Rd geom_raster_sample", "6 x 6 raster of random fill", r"---(
df <- expand.grid(x = 0:5, y = 0:5)
set.seed(1)
df$z <- runif(nrow(df))
uncertain_df <- df |> group_by(x, y) |>
  mutate(z = dist_normal(z, runif(1, 0, 0.1))) |> ungroup()
ggplot(uncertain_df, aes(x, y, fill = z)) + geom_raster_sample()
)---")
tile_prep <- r"---(
tile_df <- data.frame(x = rep(c(2, 5, 7, 9, 12), 2), y = rep(c(1, 2), each = 5),
  z = factor(rep(1:5, each = 2)), w = rep(diff(c(0, 4, 6, 8, 10, 14)), 2))
)---"
add("tile-categorical", "Rd geom_raster_sample", "Tiles of varying width with a random category, identity_dodge", paste0(tile_prep, r"---(
uncertain_tile_df <- tile_df
uncertain_tile_df$z <- dist_transformed((1 + dist_binomial(rep(1:5, each = 2), 0.5)),
  factor, as.numeric)
ggplot(uncertain_tile_df, aes(x, y)) +
  geom_tile_sample(aes(fill = z), position = "identity_dodge") +
  geom_tile(fill = NA, colour = "grey50", linewidth = 1) +
  labs(fill = "z")
)---"))
add("rect", "Rd geom_raster_sample", "Rectangles with four random edges", paste0(tile_prep, r"---(
rect_df <- tile_df |> mutate(xmin = x - w / 2, xmax = x + w / 2, ymin = y, ymax = y + 1)
uncertain_rect <- rect_df |>
  mutate(xmin = dist_normal(xmin, 0.5), xmax = dist_normal(xmax, 0.5),
    ymin = dist_normal(ymin, 0.5), ymax = dist_normal(ymax, 0.5))
ggplot(data = uncertain_rect,
  aes(xmin = xmin, xmax = xmax, ymin = ymin, ymax = ymax, f = z)) +
  geom_rect_sample(aes(fill = as.factor(after_stat(f))), colour = "grey50", alpha = 0.2) +
  labs(fill = "z")
)---"))
add("violin", "Rd geom_violin_sample", "Violins of mpg by a random cyl", r"---(
ggplot(uncertain_mtcars, aes(dist_transformed(cyl, factor, as.numeric), mpg)) +
  geom_violin_sample(alpha = 0.1)
)---")
add("violin-untrimmed", "Rd geom_violin_sample", "Violins, untrimmed", r"---(
ggplot(uncertain_mtcars, aes(dist_transformed(cyl, factor, as.numeric), mpg)) +
  geom_violin_sample(trim = FALSE, alpha = 0.1)
)---")
add("dodge", "Rd position_dodge_nested", "Plain dodge of groups and draws", r"---(
ggplot(uncertain_mpg, aes(class)) + geom_bar_sample(aes(fill = drv), position = "dodge")
)---")
add("dodge-identity", "Rd position_dodge_nested", "dodge_identity", r"---(
ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), position = "dodge_identity", alpha = 0.2)
)---")
add("dodge-dodge", "Rd position_dodge_nested", "dodge_dodge", r"---(
ggplot(uncertain_mpg, aes(class)) + geom_bar_sample(aes(fill = drv), position = "dodge_dodge")
)---")
add("identity-dodge", "Rd position_dodge_nested", "identity_dodge", r"---(
ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), position = "identity_dodge", alpha = 0.7)
)---")
add("identity-fill", "Rd position_identity_identity", "Counts by drv overlaid, position identity", r"---(
ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), position = "identity", alpha = 0.1)
)---")
add("identity-identity-fill", "Rd position_identity_identity", "Counts by drv overlaid, identity_identity", r"---(
ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), position = "identity_identity", alpha = 0.1)
)---")
add("nest-stack-dodge", "Rd position_nest", "position_nest(\"stack_dodge\")", r"---(
ggplot(uncertain_mpg, aes(class)) +
  geom_bar_sample(aes(fill = drv), alpha = 0.9, position = position_nest("stack_dodge"))
)---")
add("stack-uncertain", "Rd position_stack_nested; paper Fig 8b (horizontal)",
  "Plain stack of groups and draws", r"---(
ggplot(uncertain_mpg, aes(class)) + geom_bar_sample(aes(fill = drv), position = "stack")
)---")
add("subdivide-polygon", "Rd position_subdivide", "Polygons subdivided into 50 draws", paste0(poly_prep, r"---(
values <- data.frame(id = ids, value = c(1, 2, 3, 4, 5, 6))
datapoly <- merge(values, positions, by = c("id"))
uncertain_datapoly <- datapoly |> mutate(value = dist_uniform(value, value + 0.8))
ggplot(uncertain_datapoly, aes(x = x, y = y)) +
  geom_polygon_sample(aes(fill = value, group = id), times = 50, position = "subdivide")
)---"))
add("connect", "Rd stat_connect_sample", "Custom connection shapes between points", r"---(
x <- seq(0, 1, length.out = 20)[-1]
smooth <- cbind(x, scales::rescale(1 / (1 + exp(-(x * 10 - 5)))))
zigzag <- cbind(c(0.4, 0.6, 1), c(0.75, 0.25, 1))
ggplot(head(uncertain_economics, 10), aes(date, unemploy)) +
  stat_connect_sample(aes(colour = "zigzag"), connection = zigzag, seed = 64) +
  stat_connect_sample(aes(colour = "smooth"), connection = smooth, seed = 64) +
  geom_point_sample(seed = 64)
)---")
ecdf_prep <- r"---(
set.seed(44)
df <- data.frame(x = c(rnorm(100, 0, 3), rnorm(100, 0, 10)), g = gl(2, 100))
uncertain_df <- df |> group_by(x) |>
  mutate(x = dist_normal(x, runif(1, 0, 5)),
    g_pred = dist_bernoulli(0.9 - 0.8 * (2 - as.numeric(g))))
)---"
add("ecdf", "Rd stat_ecdf_sample", "ECDF step, one per draw", paste0(ecdf_prep, r"---(
ggplot(uncertain_df, aes(x)) + stat_ecdf_sample(geom = "step", alpha = 0.3)
)---"))
add("ecdf-groups", "Rd stat_ecdf_sample", "ECDFs of two groups", paste0(ecdf_prep, r"---(
ggplot(uncertain_df, aes(x, colour = g)) + stat_ecdf_sample(alpha = 0.3)
)---"))
add("ellipse", "Rd stat_ellipse_sample", "Normal data ellipse per draw", r"---(
ggplot(uncertain_faithful, aes(waiting, eruptions)) +
  geom_point_sample() + stat_ellipse_sample()
)---")
add("ellipse-t-groups", "Rd stat_ellipse_sample", "t ellipses by a random group", r"---(
ggplot(uncertain_faithful, aes(waiting, eruptions,
    color = dist_transformed(eruptions, function(x) x > 3, identity))) +
  geom_point_sample() + stat_ellipse_sample(type = "t") +
  labs(colour = "eruptions > 3")
)---")
add("ellipse-polygon", "Rd stat_ellipse_sample", "Filled ellipses by a random group", r"---(
ggplot(uncertain_faithful, aes(waiting, eruptions,
    fill = dist_transformed(eruptions, function(x) x > 3, identity))) +
  stat_ellipse_sample(geom = "polygon", alpha = 0.1) +
  labs(fill = "eruptions > 3")
)---")
add("identity-drawid", "Rd stat_identity_sample", "Points coloured by draw ID", r"---(
ggplot(uncertain_mtcars, aes(wt, mpg)) +
  stat_identity_sample(aes(colour = after_stat(drawID)))
)---")
manual_prep <- r"---(
make_hull <- function(data) {
  hull <- chull(x = data$x, y = data$y)
  data.frame(x = data$x[hull], y = data$y[hull])
}
q <- ggplot(uncertain_mtcars,
  aes(disp, mpg, colour = dist_transformed(cyl, factor, as.numeric))) +
  labs(colour = "factor(cyl)") + geom_point_sample()
)---"
add("manual-hull", "Rd stat_manual_sample", "Convex hull per group per draw", paste0(manual_prep, r"---(
q + stat_manual_sample(geom = "polygon", fun = make_hull, fill = NA)
)---"))
add("manual-segment", "Rd stat_manual_sample", "Segments to the group mean per draw", paste0(manual_prep, r"---(
q + stat_manual_sample(geom = "segment", fun = transform,
  args = list(xend = quote(mean(x)), yend = quote(mean(y))))
)---"))
add("manual-centroid", "Rd stat_manual_sample", "Group centroids per draw", paste0(manual_prep, r"---(
q + stat_manual_sample(size = 10, shape = 21, fun = dplyr::summarise,
  args = vars(x = mean(x), y = mean(y)))
)---"))
add("summary-2d", "Rd stat_summary_2d_sample", "Mean price in 2D bins", r"---(
ggplot(smaller_uncertain_diamonds, aes(carat, depth, z = price)) + stat_summary_2d_sample()
)---")
add("summary-hex", "Rd stat_summary_2d_sample", "Sum of squared price in hex bins", r"---(
ggplot(smaller_uncertain_diamonds, aes(carat, depth, z = price)) +
  stat_summary_hex_sample(fun = ~ sum(.x^2), alpha = 0.3)
)---")
add("summary-median", "Rd stat_summary_sample", "Median mpg per cyl", r"---(
ggplot(uncertain_mtcars, aes(cyl, mpg)) + geom_point_sample(seed = 4) +
  stat_summary_sample(fun = "median", colour = "red", geom = "point")
)---")
add("summary-mean-line", "Rd stat_summary_sample", "Mean mpg per cyl as a line, by a random vs", r"---(
ggplot(uncertain_mtcars, aes(cyl, mpg)) + geom_point_sample(seed = 4) +
  aes(colour = dist_transformed(vs, factor, as.numeric)) +
  stat_summary_sample(fun = mean, geom = "line", seed = 4) +
  labs(colour = "factor(vs)")
)---")
add("unique-overplot", "Rd stat_unique_sample", "Binary vs and am, heavy overplotting", r"---(
ggplot(uncertain_mtcars, aes(vs, am)) + geom_point_sample(alpha = 0.01)
)---")
add("unique", "Rd stat_unique_sample", "Binary vs and am, unique per draw", r"---(
ggplot(uncertain_mtcars, aes(vs, am)) +
  geom_point_sample(alpha = 0.01, stat = "unique_sample")
)---")

# ---------------------------------------------------------------- Paper
heights_prep <- r"---(
# reconstructed: 15 heights with measurement error (paper Section 2)
set.seed(15)
heights <- data.frame(x = round(rnorm(15, 165, 7)), sigma = runif(15, 5, 20))
)---"
add("paper-fig1c-density", "paper Fig 1c (reconstructed)", "Density of 15 uncertain heights", paste0(heights_prep, r"---(
heights |> mutate(height = dist_normal(x, sigma)) |>
  ggplot(aes(height)) + geom_density_sample(times = 100, alpha = 0.3)
)---"))
add("paper-fig3-convergence", "paper Fig 3 top row (reconstructed)",
  "Density plot as the measurement error shrinks", paste0(heights_prep, r"---(
panel <- function(k) heights |> mutate(height = dist_normal(x, sigma * k)) |>
  ggplot(aes(height)) + geom_density_sample(times = 100, alpha = 0.3) +
  ggtitle(paste0("sd x ", k)) + theme_void() + theme(plot.title = element_text(size = 8))
panel(1) | panel(0.3) | panel(0.05) | panel(0)
)---"), width = 6.8)
fig6_prep <- r"---(
# reconstructed: paper Fig 6. Lines y = a + b x, coloured by the marginal
# quantile of the intercept. ggdibbler draws (b) and (d); (a) and (c) are the
# paper's quantile contrast, drawn here with ggplot2.
set.seed(6)
qcol <- scale_colour_viridis_c(option = "magma", guide = "none")
)---"
add("paper-fig6a-quantile-intercept", "paper Fig 6a (reconstructed; quantile contrast panel)",
  "Lines at quantiles of a random intercept", paste0(fig6_prep, r"---(
p <- ppoints(50)
ggplot(data.frame(a = qnorm(p), p = p)) +
  geom_abline(aes(intercept = a, slope = 1, colour = p), alpha = 0.6) + qcol +
  xlim(-2, 2) + ylim(-2, 2)
)---"))
add("paper-fig6b-sample-intercept", "paper Fig 6b (reconstructed)",
  "Lines at draws of a random intercept", paste0(fig6_prep, r"---(
d <- data.frame(a = rnorm(50))
d$p <- rank(d$a) / 51
ggplot(d) + geom_abline(aes(intercept = a, slope = 1, colour = p), alpha = 0.6) + qcol +
  xlim(-2, 2) + ylim(-2, 2)
)---"))
add("paper-fig6c-quantile-joint", "paper Fig 6c (reconstructed; quantile contrast panel)",
  "Lines at paired marginal quantiles of a joint intercept and slope", paste0(fig6_prep, r"---(
p <- ppoints(50)
ggplot(data.frame(a = qnorm(p), b = qnorm(p), p = p)) +
  geom_abline(aes(intercept = a, slope = b, colour = p), alpha = 0.6) + qcol +
  xlim(-2, 2) + ylim(-2, 2)
)---"))
add("paper-fig6d-sample-joint", "paper Fig 6d (reconstructed)",
  "Lines at draws of a joint intercept and slope", paste0(fig6_prep, r"---(
ab <- generate(dist_multivariate_normal(list(c(0, 0)),
  list(matrix(c(1, -0.8, -0.8, 1), 2))), 50)[[1]]
d <- data.frame(a = ab[, 1], b = ab[, 2])
d$p <- rank(d$a) / 51
ggplot(d) + geom_abline(aes(intercept = a, slope = b, colour = p), alpha = 0.6) + qcol +
  xlim(-2, 2) + ylim(-2, 2)
)---"))
add("paper-fig7a-smooth-pooled", "paper Fig 7a (reconstructed)",
  "One smooth over all draws pooled (group without draw)", r"---(
draws <- sample_expand(uncertain_mpg, times = 10)
ggplot(draws, aes(displ, hwy)) + geom_point(alpha = 0.05, size = 0.2) + geom_smooth()
)---")
add("paper-fig8b-stack-stack", "paper Fig 8b (reconstructed)", "Horizontal stack_stack", r"---(
ggplot(uncertain_mpg, aes(y = class)) + geom_bar_sample(aes(fill = drv), position = "stack")
)---")
add("paper-fig8c-stack-dodge", "paper Fig 8c (reconstructed)", "Horizontal stack_dodge", r"---(
ggplot(uncertain_mpg, aes(y = class)) +
  geom_bar_sample(aes(fill = drv), position = "stack_dodge")
)---")
add("paper-fig8d-stack-identity", "paper Fig 8d (reconstructed)", "Horizontal stack_identity", r"---(
ggplot(uncertain_mpg, aes(y = class)) +
  geom_bar_sample(aes(fill = drv), position = "stack_identity", alpha = 0.15)
)---")
fig9_prep <- r"---(
# reconstructed: a 5 x 5 grid of cells, each with a random category and a
# random value (paper Fig 9)
set.seed(9)
grid <- expand.grid(col = 1:5, row = 1:5)
grid$mode <- dist_categorical(lapply(seq_len(25), function(i) {
  p <- runif(3)^3; p / sum(p) }), list(c("Bus", "Cycle", "Drive")))
grid$value <- dist_normal(runif(25, 0, 10), runif(25, 0.2, 3))
)---"
add("paper-fig9a-text-transparency", "paper Fig 9a (reconstructed)", "Random category as text, overlaid", paste0(fig9_prep, r"---(
ggplot(grid, aes(col, row, lab = mode)) +
  geom_text_sample(aes(label = after_stat(lab)), alpha = 0.2, position = "identity", size = 2.5) + theme_void()
)---"))
add("paper-fig9b-text-jitter", "paper Fig 9b (reconstructed)", "Random category as text, jittered", paste0(fig9_prep, r"---(
ggplot(grid, aes(col, row, lab = mode)) +
  geom_text_sample(aes(label = after_stat(lab)), position = position_jitter(0.3, 0.3), size = 2.5) + theme_void()
)---"))
add("paper-fig9c-colour-dodge", "paper Fig 9c (reconstructed)", "Random value as tile colour, dodged", paste0(fig9_prep, r"---(
ggplot(grid, aes(col, row, fill = value)) +
  geom_tile_sample(position = "identity_dodge") + theme_void()
)---"))
add("paper-fig9d-colour-transparency", "paper Fig 9d (reconstructed)", "Random value as tile colour, overlaid", paste0(fig9_prep, r"---(
ggplot(grid, aes(col, row, fill = value)) +
  geom_tile_sample(position = "identity", alpha = 0.15) + theme_void()
)---"))
add("paper-fig10b-pie", "paper Fig 10b (reconstructed)", "Pie chart of a random class, blended", r"---(
ggplot(uncertain_mpg, aes(x = "", fill = class)) +
  geom_bar_sample(width = 1, position = "stack_identity", alpha = 0.15) +
  coord_polar(theta = "y") + theme_void()
)---")
add("paper-fig10c-histogram", "paper Fig 10c (reconstructed)", "Histogram of carat filled by cut, overlaid", r"---(
ggplot(smaller_uncertain_diamonds, aes(carat, fill = cut)) +
  geom_histogram_sample(position = "stack_identity", alpha = 0.15)
)---")
add("paper-fig10d-map", "paper Fig 10d (reconstructed; Iowa counties stand in for Australia)",
  "Choropleth with subdivided regions", r"---(
ggplot(toy_temp_dist) +
  geom_sf_sample(aes(geometry = county_geometry, fill = temp_dist), linewidth = 0, times = 25) +
  scale_fill_viridis_c(option = "magma") + theme_void()
)---")
add("paper-fig10f-network", "paper Fig 10f (reconstructed)", "Network with uncertain edges", r"---(
nodes <- data.frame(id = 1:5, x = c(0, 1.2, 1, 2, 0.7), y = c(0, 1, -1, 0.2, 0.3))
edges <- data.frame(from = c(1, 1, 2, 2, 3, 3, 5, 5), to = c(2, 5, 4, 5, 4, 5, 4, 1),
  p = c(0.2, 0.9, 0.6, 0.8, 0.3, 0.95, 0.7, 0.4))
edges <- edges |> mutate(x = nodes$x[from], y = nodes$y[from],
  xend = nodes$x[to], yend = nodes$y[to], present = dist_bernoulli(p))
ggplot() +
  geom_segment_sample(data = edges, aes(x, y, xend = xend, yend = yend,
    alpha = present), colour = "firebrick", linewidth = 1, times = 30) +
  scale_alpha_continuous(range = c(0, 0.08), guide = "none") +
  geom_point(data = nodes, aes(x, y)) + theme_void()
)---")
add("paper-fig11b-pie", "paper Fig 11b", "Pie chart of clarity (stack_dodge default)", r"---(
ggplot(smaller_uncertain_diamonds, aes(x = "", fill = clarity)) +
  geom_bar_sample(width = 1) +
  coord_polar(theta = "y")
)---")
add("paper-fig13-times", "paper Fig 13 (reconstructed)", "Scatter of mpg and wt as times grows", r"---(
panel <- function(n) ggplot(uncertain_mtcars,
    aes(mpg, wt, colour = dist_transformed(cyl, factor, as.numeric))) +
  geom_point_sample(times = n, alpha = 0.3, size = 0.6) +
  ggtitle(paste("times =", n)) + theme(legend.position = "none",
    plot.title = element_text(size = 8))
panel(10) | panel(100) | panel(1000)
)---", width = 6.8)

# ---------------------------------------------------------------- render
meta <- list()
for (i in seq_along(E)) {
  e <- E[[i]]
  id <- sprintf("ggdibbler-%02d", i)
  file <- sprintf("%s-%s.png", id, e$slug)
  status <- "rendered"
  res <- tryCatch({
    set.seed(e$seed)
    env <- new.env()
    p <- eval(parse(text = e$code), envir = env)
    suppressMessages(suppressWarnings(ggsave(file.path(img_dir, file), p,
      width = e$width, height = e$height, dpi = 110, bg = "white")))
    "ok"
  }, error = function(err) conditionMessage(err))
  if (!identical(res, "ok")) status <- paste("not rendered:", res)
  cat(id, e$slug, status, "\n")
  meta[[i]] <- list(id = id, slug = e$slug, source = e$source, title = e$title,
    r_code = e$code, img = if (status == "rendered") file.path("img", file) else NULL,
    render = status, merged = e$merged)
}
write_json(meta, file.path(out_dir, "ggdibbler-r.json"), auto_unbox = TRUE, pretty = TRUE)
