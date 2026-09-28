library(ggplot2)
library(ggmosaic)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$region <- factor(data$region, levels = unique(data$region))
data$brand <- factor(data$brand, levels = unique(data$brand))

# Columns as wide as each region's units, split by the brands' shares.
plot <- ggplot(data) +
  geom_mosaic(aes(x = product(region), fill = brand, weight = units)) +
  labs(x = "region", y = "brand")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
