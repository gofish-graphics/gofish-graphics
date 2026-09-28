library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$channel <- factor(data$channel, levels = data$channel)

# The ring spans x from 1.5 to 2.5; starting the x limits at 0.5 leaves a hole
# of half the outer radius.
plot <- ggplot(data, aes(x = 2, y = visits, fill = channel)) +
  geom_col(width = 1) +
  coord_polar(theta = "y") +
  xlim(0.5, 2.5) +
  theme_void()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 4.8, height = 4, units = "in")
