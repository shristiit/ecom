# Selenium end-to-end tests

## Setup
- Ensure Google Chrome is installed and on PATH. Chromedriver is included as a dev dependency.
- Install deps: from repo root run `pnpm --filter e2e install`.

## Running
- Start the web app you want to test (e.g., `pnpm --filter admin dev` in another terminal).
- In this folder run `pnpm --filter e2e test`.
- Override the target URL with `BASE_URL=http://localhost:3000 pnpm --filter e2e test` if needed.

## Notes
- Tests use Mocha + TypeScript + Selenium WebDriver.
- Update `tests/home.spec.ts` with real selectors and titles (replace `"Your App Title"` and `[data-testid='hero-cta']`).
