library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

plot <- ggplot(data, aes(x = horsepower, y = mpg)) +
  geom_point(color = "steelblue", size = 2) +
  labs(x = "Horsepower", y = "Miles per gallon")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
