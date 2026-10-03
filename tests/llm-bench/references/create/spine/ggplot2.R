library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
# The first nationality in the data goes at the top.
data$nationality <- factor(data$nationality, levels = rev(unique(data$nationality)))
data$gender <- factor(data$gender, levels = c("Women", "Men"))
# Women extend left of the center line, Men right.
data$signed <- ifelse(data$gender == "Women", -data$percent, data$percent)

plot <- ggplot(data, aes(x = signed, y = nationality, fill = gender)) +
  geom_col(width = 0.7) +
  geom_vline(xintercept = 0, color = "#333333") +
  scale_x_continuous(labels = function(x) paste0(abs(x), "%")) +
  scale_fill_manual(values = c(Women = "#e15759", Men = "#4e79a7")) +
  labs(x = "percent", y = NULL, fill = NULL) +
  theme(legend.position = "top")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 4.2, units = "in")
