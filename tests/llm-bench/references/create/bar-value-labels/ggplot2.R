library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$store <- factor(data$store, levels = data$store)

plot <- ggplot(data, aes(x = store, y = sales)) +
  geom_col(fill = "steelblue") +
  geom_text(aes(label = scales::comma(sales)), vjust = -0.5)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
