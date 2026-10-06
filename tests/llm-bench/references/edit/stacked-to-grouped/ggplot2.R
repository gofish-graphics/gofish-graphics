library(ggplot2)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
# A discrete y axis runs bottom to top, so reverse the levels to put the first question on top.
data$question <- factor(data$question, levels = rev(unique(data$question)))
data$answer <- factor(data$answer, levels = unique(data$answer))

plot <- ggplot(data, aes(x = count, y = question, fill = answer)) +
  geom_col(position = position_dodge(reverse = TRUE))

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
