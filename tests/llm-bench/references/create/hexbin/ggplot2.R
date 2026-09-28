library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
radius <- 25 # px, center to corner

# geom_hex bins in data units, with binwidth c(bx, by): centers bx apart in
# a row, and hexagons bx wide and 2 by / sqrt(3) tall. A pointy-top hexagon
# of radius r px is sqrt(3) r wide and 2 r tall, so both are sqrt(3) r in
# pixels. Fixing the panel size and the axis limits fixes the data units per
# pixel, so the pixel radius converts exactly.
px_per_in <- 100 # the 6 x 4.5 in SVG is shown at 600 x 450 px
panel_w <- 4.2 # in
panel_h <- 3.6
xlim <- c(-50, 450) # room for the hexagons around the data
ylim <- c(1200, 4000)
per_px_x <- diff(xlim) / (panel_w * px_per_in)
per_px_y <- diff(ylim) / (panel_h * px_per_in)
binwidth <- sqrt(3) * radius * c(per_px_x, per_px_y)

plot <- ggplot(data, aes(x = budget, y = box_office)) +
  geom_hex(binwidth = binwidth, color = "white", linewidth = 0.2) +
  scale_x_continuous(limits = xlim, expand = c(0, 0), oob = scales::oob_keep) +
  scale_y_continuous(limits = ylim, expand = c(0, 0), oob = scales::oob_keep) +
  scale_fill_gradient(low = "#fdd0a2", high = "#7f2704", name = "Films") +
  labs(x = "Budget (millions)", y = "Box office (millions)") +
  theme(
    panel.widths = unit(panel_w, "in"),
    panel.heights = unit(panel_h, "in")
  )

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6, height = 4.5, units = "in")
