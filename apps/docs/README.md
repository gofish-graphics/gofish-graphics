# GoFish Graphics

A graphics library with interactive documentation featuring a live code sandbox.

## Features

- **Interactive Documentation**: Live code examples with real-time output
- **Code Sandbox**: Built-in code editor with debounced live execution
- **Vue 3 Components**: Modern component architecture
- **VitePress**: Fast documentation site

## Components

### CodeSandbox

A Vue component that provides a code editor with live output display. Features include:

- Live console output above the editor
- Debounced code execution (500ms delay)
- Auto-run toggle with manual run button
- Error handling and display
- Syntax highlighting with Sandpack
- Dark theme support

## Development

```bash
# Install dependencies
pnpm install

# Start documentation development server
pnpm docs:dev

# Build documentation
pnpm docs:build

# Preview built documentation
pnpm docs:preview
```

## Project Structure

```
├── components/          # Vue components
│   ├── CodeSandbox.vue  # Interactive code editor
│   └── README.md        # Component documentation
├── docs/                # VitePress documentation
│   ├── .vitepress/      # VitePress configuration
│   └── examples/        # Documentation examples
└── utils/               # Utility functions
```

## Dependencies

- `@codesandbox/sandpack-vue3`: Vue 3 wrapper for Sandpack
- `@codesandbox/sandpack-themes`: Theme collection for Sandpack
- `vue`: Vue 3 framework
- `vitepress`: Documentation framework
