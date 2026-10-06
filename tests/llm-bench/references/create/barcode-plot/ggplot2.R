library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
subs <- unique(data$sub_category)
# Row 1 (the first sub-category in the data) goes at the top.
data$row <- length(subs) + 1 - match(data$sub_category, subs)

# Each tick is a short vertical segment centered on its row's line.
plot <- ggplot(data) +
  geom_segment(aes(x = avg_sales, xend = avg_sales, y = row - 0.12, yend = row + 0.12),
               color = "#4e79a7", linewidth = 0.6) +
  scale_x_continuous(limits = c(0, NA)) +
  scale_y_continuous(breaks = seq_along(subs), labels = rev(subs)) +
  labs(x = "average sales", y = NULL)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 3, units = "in")
