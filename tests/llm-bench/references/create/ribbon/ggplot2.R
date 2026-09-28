library(ggplot2)
library(dplyr)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
years <- unique(data$year)
bar_width <- 0.6

segments <- data |>
  mutate(channel = factor(channel, levels = c("Retail", "Online", "Wholesale", "Partner")),
         x = match(year, years)) |>
  arrange(x, channel) |>
  group_by(x) |>
  mutate(ymax = cumsum(revenue), ymin = ymax - revenue) |>
  ungroup()

# Each channel's band runs through both edges of every bar, so between
# two bars it joins the channel's segment in one to its segment in the next.
band <- bind_rows(mutate(segments, x = x - bar_width / 2),
                  mutate(segments, x = x + bar_width / 2))

plot <- ggplot(segments) +
  geom_ribbon(data = band, aes(x = x, ymin = ymin, ymax = ymax, fill = channel),
              alpha = 0.4) +
  geom_rect(aes(xmin = x - bar_width / 2, xmax = x + bar_width / 2,
                ymin = ymin, ymax = ymax, fill = channel)) +
  scale_x_continuous(breaks = seq_along(years), labels = years) +
  labs(x = "year", y = "revenue")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 6.4, height = 4, units = "in")
