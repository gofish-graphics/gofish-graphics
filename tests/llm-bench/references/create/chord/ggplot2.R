library(ggplot2)
library(ggforce)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))

# ggplot2 has no chord layout, so it is computed here, as d3.chord does:
# angles run clockwise from 12 o'clock, each channel's segment is as wide as
# its total count, and inside it each link's end is as wide as the link.
names <- unique(c(data$source, data$target))
n <- length(names)
m <- matrix(0, n, n, dimnames = list(names, names))
for (i in seq_len(nrow(data))) {
  m[data$source[i], data$target[i]] <- m[data$source[i], data$target[i]] + data$count[i]
  m[data$target[i], data$source[i]] <- m[data$target[i], data$source[i]] + data$count[i]
}
pad <- 0.05
k <- (2 * pi - pad * n) / sum(m)
inner <- 0.9
outer <- 1

groups <- data.frame(name = names, total = rowSums(m))
groups$start <- c(0, cumsum(groups$total * k + pad)[-n])
groups$end <- groups$start + groups$total * k
# Where the end of link (i, j) sits inside channel i's segment.
end_start <- m * 0
for (i in seq_len(n)) end_start[i, ] <- groups$start[i] + c(0, cumsum(m[i, ] * k)[-n])

arc <- function(a0, a1) {
  a <- seq(a0, a1, length.out = 30)
  data.frame(x = inner * sin(a), y = inner * cos(a))
}
# A quadratic curve through the center from one point to another.
through_center <- function(p, q) {
  t <- seq(0, 1, length.out = 30)
  data.frame(x = (1 - t)^2 * p$x + t^2 * q$x, y = (1 - t)^2 * p$y + t^2 * q$y)
}
ribbons <- do.call(rbind, lapply(seq_len(nrow(data)), function(r) {
  i <- match(data$source[r], names)
  j <- match(data$target[r], names)
  s <- arc(end_start[i, j], end_start[i, j] + m[i, j] * k)
  t <- arc(end_start[j, i], end_start[j, i] + m[j, i] * k)
  path <- rbind(s, through_center(s[nrow(s), ], t[1, ]), t,
                through_center(t[nrow(t), ], s[1, ]))
  path$link <- r
  path$source <- data$source[r]
  path
}))

plot <- ggplot() +
  geom_arc_bar(data = groups, aes(x0 = 0, y0 = 0, r0 = inner, r = outer,
                                  start = start, end = end, fill = name), color = NA) +
  geom_polygon(data = ribbons, aes(x = x, y = y, group = link, fill = source), alpha = 0.6) +
  geom_text(data = groups, aes(x = 1.1 * sin((start + end) / 2), y = 1.1 * cos((start + end) / 2),
                               label = name), size = 4.5) +
  scale_fill_brewer(palette = "Set1", guide = "none") +
  coord_fixed() +
  theme_void()

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 4.8, height = 4.8, units = "in")
