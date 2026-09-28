library(ggplot2)
library(dplyr)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

# Each bar runs from the running total before it to the one after it;
# Begin starts at zero, and End runs from zero to the final total.
steps <- data |>
  mutate(end = cumsum(amount), start = end - amount,
         kind = case_when(row_number() == 1 ~ "total",
                          amount >= 0 ~ "increase",
                          TRUE ~ "decrease"))
bars <- bind_rows(steps, tibble(label = "End", start = 0, end = sum(data$amount),
                                kind = "total")) |>
  mutate(i = row_number())

plot <- ggplot(bars) +
  geom_rect(aes(xmin = i - 0.4, xmax = i + 0.4, ymin = start, ymax = end, fill = kind)) +
  scale_x_continuous(breaks = bars$i, labels = bars$label) +
  scale_y_continuous(limits = c(0, NA), expand = expansion(mult = c(0, 0.05))) +
  scale_fill_manual(values = c(total = "#4e79a7", increase = "#59a14f", decrease = "#e15759")) +
  labs(x = NULL, y = "amount", fill = NULL)

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 3.6, units = "in")
