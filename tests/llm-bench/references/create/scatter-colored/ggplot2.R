library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

plot <- ggplot(data, aes(x = bill_length_mm, y = flipper_length_mm, color = species)) +
  geom_point(size = 2)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
