library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
peak <- data[which.max(data$visitors), ]

plot <- ggplot(data, aes(x = year, y = visitors)) +
  geom_line(color = "steelblue", linewidth = 1) +
  geom_point(data = peak, color = "firebrick", size = 3.5) +
  geom_text(data = peak, aes(label = sprintf("Peak: %s in %d", scales::comma(visitors), year)),
            hjust = 1.1) +
  labs(x = "Year", y = "Visitors (thousands)")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
