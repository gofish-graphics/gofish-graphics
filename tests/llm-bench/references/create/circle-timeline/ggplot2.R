library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$date <- as.Date(data$date)
# The first category in the data goes at the top.
data$category <- factor(data$category, levels = rev(unique(data$category)))

# scale_size_area makes the area proportional to sales from zero; a point
# of size 12 has a radius of about 18 px.
plot <- ggplot(data, aes(x = date, y = category, size = sales, color = category)) +
  geom_point(alpha = 0.8) +
  scale_size_area(max_size = 12, guide = "none") +
  scale_color_brewer(palette = "Set1", guide = "none") +
  labs(x = "date", y = NULL)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 3, units = "in")
