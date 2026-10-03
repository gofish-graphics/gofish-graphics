library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
# The first month in the data goes at the top.
data$month <- factor(data$month, levels = rev(unique(data$month)))
data$sub_category <- factor(data$sub_category, levels = unique(data$sub_category))

plot <- ggplot(data, aes(x = sales, y = month, color = sub_category)) +
  geom_point(size = 3, alpha = 0.85) +
  scale_color_brewer(palette = "Set1", name = "sub-category") +
  scale_x_continuous(labels = scales::label_comma()) +
  labs(x = "sales", y = NULL)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 3.8, units = "in")
