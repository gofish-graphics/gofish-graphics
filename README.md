<div align="center" style="display:flex;flex-direction:column;">
  <a href="https://gofish.graphics/">
    <img src="https://gofish.graphics/gofish-logo.png" alt="GoFish" width="20%">
  </a>
  <br />
  <b>GoFish:</b> JavaScript charts without the headache (TM)
</div>

## Installation

GoFish is moving fast and the stable release lags well behind active
development. While the library is pre-1.0, we recommend early adopters install
the **nightly** build (published whenever `main` changes):

```bash
npm install gofish-graphics@nightly
# or
pnpm add gofish-graphics@nightly
# or
yarn add gofish-graphics@nightly
```

For the last stable release, drop the `@nightly` tag:

```bash
npm install gofish-graphics
```

Using Python? `pip install --pre gofish-graphics` (see the
[docs](https://gofish.graphics/python/get-started)).

## Usage

```typescript
import /* your exported functions */ "gofish-graphics";

// Use the library functions here
```

## Development

This project uses [pnpm](https://pnpm.io) workspaces for monorepo management.

### Monorepo Structure

- `packages/gofish-graphics/` - Main library package
- `apps/docs/` - VitePress documentation site

### Getting Started

```bash
# Install all dependencies
pnpm install

# Start library development server
pnpm dev

# Build the library
pnpm build

# Start docs development server
pnpm docs:dev

# Build docs
pnpm docs:build

# Preview docs build
pnpm docs:preview

# Run Storybook
pnpm storybook

# Build Storybook
pnpm build-storybook
```

### Working with Individual Packages

You can also run commands in specific packages:

```bash
# Run commands in the library package
pnpm --filter gofish-graphics <command>

# Run commands in the docs app
pnpm --filter docs <command>
```

## Publish

```bash
# Navigate to the library package
cd packages/gofish-graphics

# Update version number
pnpm version patch

# Publish to npm
pnpm publish

# Push new version to github
git push
```

## License

MIT
