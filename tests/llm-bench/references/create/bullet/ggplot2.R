library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
# The first category in the data goes at the top.
data$category <- factor(data$category, levels = rev(data$category))
data$row <- as.numeric(data$category)

# Bands nested from zero, widest (lightest) first, then the sales bar and
# the target line on top.
plot <- ggplot(data, aes(y = category)) +
  geom_col(aes(x = good), fill = "#dddddd", width = 0.6) +
  geom_col(aes(x = average), fill = "#bbbbbb", width = 0.6) +
  geom_col(aes(x = poor), fill = "#999999", width = 0.6) +
  geom_col(aes(x = sales), fill = "#1f3b5a", width = 0.2) +
  geom_segment(aes(x = target, xend = target, y = row - 0.18, yend = row + 0.18),
               color = "#d62728", linewidth = 1) +
  scale_x_continuous(labels = scales::label_comma(), expand = expansion(mult = c(0, 0.05))) +
  labs(x = "sales", y = NULL) +
  theme_minimal()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 3, units = "in")
