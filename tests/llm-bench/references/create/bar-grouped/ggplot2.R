library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$lake <- factor(data$lake, levels = unique(data$lake))
data$species <- factor(data$species, levels = c("Bass", "Trout", "Catfish", "Perch", "Salmon"))

plot <- ggplot(data, aes(x = lake, y = count, fill = species)) +
  geom_col(position = "dodge")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
