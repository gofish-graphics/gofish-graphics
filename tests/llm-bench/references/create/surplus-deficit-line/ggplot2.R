library(ggplot2)
library(dplyr)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$date <- as.Date(data$date)

# Add a point wherever the line crosses zero, so each colored area ends
# exactly where the line changes sign.
crossings <- data |>
  mutate(next_date = lead(date), next_balance = lead(balance)) |>
  filter(!is.na(next_balance), sign(balance) * sign(next_balance) < 0) |>
  mutate(date = date + (next_date - date) * balance / (balance - next_balance),
         balance = 0) |>
  select(date, balance)
area <- bind_rows(data, crossings) |> arrange(date)

plot <- ggplot(area, aes(x = date)) +
  geom_ribbon(aes(ymin = 0, ymax = pmax(balance, 0)), fill = "#2a9d8f") +
  geom_ribbon(aes(ymin = pmin(balance, 0), ymax = 0), fill = "#e76f51") +
  geom_line(data = data, aes(y = balance), color = "#222222", linewidth = 0.6) +
  scale_x_date(date_breaks = "1 year", date_labels = "%Y") +
  expand_limits(y = 0) +
  labs(x = "date", y = "balance")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
