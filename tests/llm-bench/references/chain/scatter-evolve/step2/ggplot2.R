library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

plot <- ggplot(data, aes(x = mpg, y = horsepower)) +
  geom_point(color = "steelblue", size = 2) +
  labs(x = "Fuel economy (mpg)", y = "Engine power (hp)")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
