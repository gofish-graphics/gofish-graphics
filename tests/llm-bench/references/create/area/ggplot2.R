library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$date <- as.Date(data$date)
data$category <- factor(data$category, levels = unique(data$category))

# position_stack puts the first level on top; reverse it so the first
# category is at the bottom.
plot <- ggplot(data, aes(x = date, y = sales, fill = category)) +
  geom_area(position = position_stack(reverse = TRUE)) +
  scale_y_continuous(labels = scales::label_comma(), expand = expansion(mult = c(0, 0.05))) +
  scale_fill_brewer(palette = "Set2", guide = guide_legend(reverse = TRUE)) +
  labs(x = "date", y = "sales")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
