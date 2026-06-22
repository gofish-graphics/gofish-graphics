# `gofish-python` is deprecated — use [`gofish-graphics`](https://pypi.org/project/gofish-graphics/)

The GoFish Python package is now published as **`gofish-graphics`**. The
`gofish-python` name is deprecated and will receive no further updates.

This release of `gofish-python` contains no code of its own — it only depends
on `gofish-graphics`, so installing it pulls in the canonical package. The
import name is unchanged (`import gofish`).

## Migrate

```bash
pip uninstall gofish-python
pip install gofish-graphics
```

Your code does not change — it was already `import gofish` either way:

```python
from gofish import chart, spread, stack, rect
```

See the project on GitHub: https://github.com/gofish-graphics/gofish-graphics
