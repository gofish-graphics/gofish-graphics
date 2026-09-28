library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$category <- factor(data$category, levels = data$category)

plot <- ggplot(data, aes(x = "", y = amount, fill = category)) +
  geom_col(width = 1) +
  coord_polar(theta = "y") +
  theme_void()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 4.8, height = 4, units = "in")
