library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

plot <- ggplot(data, aes(x = gdp_per_capita, y = life_expectancy,
                         size = population, color = region)) +
  # stroke = 0 so the outline does not add to the area of small circles
  geom_point(alpha = 0.6, stroke = 0) +
  scale_size_area(max_size = 20) +
  guides(size = "none") +
  labs(x = "GDP per capita (thousand USD)", y = "Life expectancy (years)")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4.4, units = "in")
