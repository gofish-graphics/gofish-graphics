library(ggplot2)
library(ggmosaic)

data <- jsonlite::fromJSON(Sys.getenv("DATA_PATH"))
data$class <- factor(data$class, levels = c("First", "Second", "Third", "Crew"))
data$sex <- factor(data$sex, levels = c("Female", "Male"))
data$survived <- factor(data$survived, levels = c("Yes", "No"))

# Split by class along y, then sex along x, then survived along y.
plot <- ggplot(data) +
  geom_mosaic(aes(x = product(survived, sex, class), fill = survived, weight = count),
              divider = c("vspine", "hspine", "vspine"), offset = 0,
              color = "white", linewidth = 0.3) +
  labs(x = "sex", y = "class")

ggsave(Sys.getenv("OUT_PATH"), plot, device = svglite::svglite,
       width = 5.6, height = 4.4, units = "in")
