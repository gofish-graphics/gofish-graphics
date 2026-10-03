library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$lake <- factor(data$lake, levels = data$lake[order(data$count, decreasing = TRUE)])

plot <- ggplot(data, aes(x = count, y = lake)) +
  geom_col(aes(fill = ifelse(lake == "Lake B", "#f58518", "steelblue"))) +
  scale_fill_identity() +
  scale_y_discrete(limits = rev)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
