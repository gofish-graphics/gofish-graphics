library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
img <- png::readPNG(file.path(Sys.getenv("ASSET_DIR"), "bottle.png"))  # rows x cols x RGBA

# The bottle in grayscale, and tinted: the tint's hue and saturation with the
# glass's own gray as the brightness.
gray <- 0.2126 * img[, , 1] + 0.7152 * img[, , 2] + 0.0722 * img[, , 3]
alpha <- img[, , 4]
tint <- rgb2hsv(col2rgb("#00c853"))
grayscale <- matrix(rgb(gray, gray, gray, alpha), nrow(gray))
tinted <- matrix(hsv(tint["h", ], tint["s", ], gray, alpha), nrow(gray))

# Units are pixels: the panel fills the 640 x 360 chart.
h <- 240
w <- h * ncol(img) / nrow(img)
base <- 60
data$x0 <- 80 + (seq_len(nrow(data)) - 1) * 140 - w / 2
data$level <- base + h * data$fill_pct / 100

bottle <- function(x0, fill_pct) {
  out <- grayscale
  liquid <- seq(round(nrow(img) * (1 - fill_pct / 100)) + 1, nrow(img))
  out[liquid, ] <- tinted[liquid, ]
  annotation_raster(out, xmin = x0, xmax = x0 + w, ymin = base, ymax = base + h,
                    interpolate = TRUE)
}

plot <- ggplot(data) +
  Map(bottle, data$x0, data$fill_pct) +
  geom_segment(aes(x = x0, xend = x0 + w, y = level, yend = level),
               color = "#666666", linewidth = 0.4) +
  geom_text(aes(x = x0 + w + 4, y = level, label = paste0(fill_pct, "%")),
            color = "#666666", hjust = 0, size = 3.5) +
  geom_text(aes(x = x0 + w / 2, y = base - 8, label = wine), vjust = 1, size = 3.2) +
  coord_cartesian(xlim = c(0, 640), ylim = c(0, 360), expand = FALSE) +
  theme_void() +
  theme(plot.background = element_rect(fill = "white", color = NA),
        plot.margin = margin(0, 0, 0, 0))

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 3.6, units = "in")
