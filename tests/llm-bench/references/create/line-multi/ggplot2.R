library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

plot <- ggplot(data, aes(x = year, y = life_expect, color = country)) +
  geom_line()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
