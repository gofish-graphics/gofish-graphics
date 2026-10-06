library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$age_range <- factor(data$age_range, levels = unique(data$age_range))
# The first savings answer goes at the top.
data$savings <- factor(data$savings, levels = rev(unique(data$savings)))

plot <- ggplot(data, aes(x = age_range, y = savings, fill = response_rate)) +
  geom_tile(width = 0.96, height = 0.96) +
  scale_fill_gradient(low = "#eff3ff", high = "#08306b", name = "response rate (%)") +
  labs(x = "age range", y = NULL) +
  theme_minimal() +
  theme(panel.grid = element_blank())

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 7.2, height = 4.2, units = "in")
