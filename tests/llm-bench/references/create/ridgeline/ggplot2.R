library(ggplot2)
library(ggridges)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
# A discrete y axis runs bottom to top, so reverse the months to put Jan on top.
data$month <- factor(data$month, levels = rev(unique(data$month)))

# Rows are one unit apart; scale the tallest peak to 2 units.
plot <- ggplot(data, aes(x = temp_c, y = month, height = days)) +
  geom_ridgeline(scale = 2 / max(data$days), fill = "steelblue", color = "white") +
  labs(y = NULL)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 4.8, units = "in")
