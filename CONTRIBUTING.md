# Contributing to GoFish

Thanks for considering contributing to GoFish!

## Your First Contribution

Here are some easy ways to help make the project better without having to understand the codebase first.

- **Open an issue with a chart you want to make** in GoFish but can't/don't know how to. Attach an image of what you want to make and describe what you've tried already.
- **Contribute to our documentation!** https://github.com/gofish-graphics/gofish-docs
- **Contribute to the project's infrastructure.** (Check for the "good first issue" tag for these.)

## Your First Codebase Contribution

If you want to start contributing to the codebase itself, **try the "good first codebase issue" tag.**

### Installations

[Ensure pnpm is installed](https://pnpm.io/installation), then build to setup the gofish-graphics package. The repo pins its pnpm version in the `packageManager` field of the root `package.json`. If your `pnpm` comes from corepack, you need corepack 0.34.5 or newer to run that version (`npm install -g corepack@latest`); older corepack releases fail with `Cannot find module .../bin/pnpm.cjs`.

```bash
pnpm build
```

Use pnpm storybook to run the local storybook examples, and pnpm docs:dev to run local docs.

```bash
pnpm storybook
```

```bash
pnpm docs:dev
```

## Larger Contributions

**Read our GitHub wiki** to learn more about the project's design philosophy. Major changes to the project (like adding a new intermediate representation or interaction/animation) will require a more back-and-forth conversation in the issues before we come to a consensus on what to do.

## Assessing Issues and Reviewing PRs

### Find a path to "yes"

We strive to help everyone who opens an issue or PR on the repo. They have some pain they are trying to address! But the best way to address that pain isn't necessarily writing code or merging a PR. It may mean directing someone to a different project or an existing example. Sometimes it means saying no to the request. But we always strive to find the underlying pain point and solve it the best way we know how from first-principles.
