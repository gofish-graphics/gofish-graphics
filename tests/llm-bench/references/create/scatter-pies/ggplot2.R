library(ggplot2)
library(ggforce)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$species <- factor(data$species, levels = unique(data$species))

# Pie radii are in data units; with coord_equal, 8 units is about 20 px here.
plot <- ggplot(data) +
  geom_arc_bar(aes(x0 = x, y0 = y, r0 = 0, r = 8, amount = count, fill = species),
               stat = "pie", color = NA) +
  coord_equal() +
  labs(x = "x", y = "y")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 4.8, units = "in")
