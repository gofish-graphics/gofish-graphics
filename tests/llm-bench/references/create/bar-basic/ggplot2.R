library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$lake <- factor(data$lake, levels = unique(data$lake))

plot <- ggplot(data, aes(x = lake, y = count)) +
  geom_col(fill = "steelblue")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
