library(ggplot2)
library(dplyr)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
totals <- data |>
  group_by(site) |>
  summarise(yield = sum(yield))

# reorder() puts the smallest total first, at the bottom of the y axis.
plot <- ggplot(totals, aes(x = yield, y = reorder(site, yield))) +
  geom_col(fill = "steelblue") +
  labs(y = "site")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
