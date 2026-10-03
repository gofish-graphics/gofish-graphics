library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

plot <- ggplot(data, aes(x = flipper_length_mm)) +
  geom_histogram(breaks = seq(170, 240, by = 10), closed = "left",
                 fill = "steelblue", color = "white")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
