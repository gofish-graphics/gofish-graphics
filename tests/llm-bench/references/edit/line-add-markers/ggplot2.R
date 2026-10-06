library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

plot <- ggplot(data, aes(x = year, y = wheat)) +
  geom_line() +
  geom_point() +
  labs(x = "Year", y = "Wheat price (shillings)")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
