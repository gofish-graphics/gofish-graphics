library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
# The first sub-category in the data goes at the top.
data$sub_category <- factor(data$sub_category, levels = rev(data$sub_category))
data$sign <- ifelse(data$profit_ratio < 0, "negative", "positive")

plot <- ggplot(data, aes(x = profit_ratio, y = sub_category, fill = sign)) +
  geom_col(width = 0.8) +
  scale_fill_manual(values = c(negative = "#d62728", positive = "#4e79a7"),
                    guide = "none") +
  labs(x = "profit ratio", y = NULL)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 4.8, units = "in")
