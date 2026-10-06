library(ggplot2)
library(treemapify)
library(ggforce)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

# Lay the treemap out in units of about a pixel, so 1 unit is roughly 1 px.
cells <- treemapify(data, area = "gross", subgroup = "genre",
                    xlim = c(0, 600), ylim = c(0, 400))

plot <- ggplot(cells) +
  geom_rect(aes(xmin = xmin, xmax = xmax, ymin = ymin, ymax = ymax),
            fill = NA, color = "gray80", linewidth = 0.3) +
  geom_circle(aes(x0 = (xmin + xmax) / 2, y0 = (ymin + ymax) / 2,
                  r = pmin(xmax - xmin, ymax - ymin) / 2 - 1, fill = genre),
              color = NA) +
  coord_equal(expand = FALSE) +
  theme_void()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6, height = 4, units = "in")
