library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
# Largest sales at the top: the y axis runs from the bottom up.
data$region <- reorder(data$region, data$sales)

plot <- ggplot(data, aes(x = sales, y = region)) +
  geom_segment(aes(x = 0, xend = sales, yend = region), color = "#888888", linewidth = 0.8) +
  geom_point(color = "#4e79a7", size = 4) +
  scale_x_continuous(labels = scales::label_comma(), limits = c(0, NA),
                     expand = expansion(mult = c(0, 0.05))) +
  labs(x = "sales", y = NULL)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 3.2, units = "in")
