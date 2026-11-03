# Export per-draw counts of ggdibbler's uncertain_mpg (class by drv) for the
# GoFish "Today" render. Run from the repo root:
#   Rscript proposals/uncertainty-specs/ggdibbler-r/export-mpg.R
library(dplyr)
library(ggdibbler)

counts <- uncertain_mpg |>
  select(class, drv) |>
  sample_expand(times = 10, seed = 1980) |>
  count(draw = as.integer(as.character(drawID)), class, drv)

out <- "packages/gofish-graphics/stories/proposals/uncertainty/ggdibbler-mpg-counts.json"
writeLines(
  paste0(
    "[\n",
    paste0(
      sprintf(
        '  { "draw": %d, "class": "%s", "drv": "%s", "n": %d }',
        counts$draw, counts$class, counts$drv, counts$n
      ),
      collapse = ",\n"
    ),
    "\n]"
  ),
  out
)
