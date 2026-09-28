library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$country <- factor(data$country, levels = data$country)

# coord_radial runs clockwise from 12 o'clock; the inner radius leaves the
# empty circle in the middle, and the bars' lengths start from it.
plot <- ggplot(data, aes(x = country, y = exports, fill = country)) +
  geom_col(width = 0.9) +
  scale_y_continuous(limits = c(0, NA), expand = expansion(0)) +
  coord_radial(inner.radius = 0.3, expand = FALSE) +
  scale_fill_brewer(palette = "Set3", guide = "none") +
  theme_void() +
  theme(axis.text.theta = element_text(size = 9))

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.2, height = 5.2, units = "in")
