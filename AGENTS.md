# Twinkle Image Agent Guide

## Shared Product Design

- Use the shared `anthropic-product-design` skill at `../.agents/skills/anthropic-product-design/SKILL.md` for all UI, UX, landing page, workspace, responsive, and theme changes.
- Preserve the existing CSS-token theme system and `ThemeToggle`; implement both light and dark modes semantically rather than as a color inversion.
- Reuse the existing workspace components and keep `/studio` as the functional workspace entry point when changing the public landing page.
- Check desktop, mobile, keyboard focus, and no-horizontal-overflow behavior for visual changes.

## Project Rules

- Read `README.md` and `README_ZH_CN.md` before changing product content or deployment files.
- Do not commit `.next/`, `out/`, `node_modules/`, logs, generated screenshots, local `.env` files, or build output.
- Validate frontend UI changes with `npm run lint` and `npm run test:run` from the repository root when practical.
