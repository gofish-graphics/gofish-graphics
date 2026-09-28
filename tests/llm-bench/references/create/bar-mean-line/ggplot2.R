library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$month <- factor(data$month, levels = data$month)
mean_rain <- mean(data$rain_mm)

plot <- ggplot(data, aes(x = month, y = rain_mm)) +
  geom_col(fill = "steelblue") +
  geom_hline(yintercept = mean_rain, linetype = "dashed") +
  annotate("text", x = Inf, y = mean_rain, label = sprintf("Mean = %.1f", mean_rain),
           hjust = 1.1, vjust = -0.5)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
