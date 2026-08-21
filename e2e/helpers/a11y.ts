import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']
): string {
  if (violations.length === 0) return ''
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.description}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `  - ${n.target.join(' ')}`)
          .join('\n')
    )
    .join('\n\n')
}

/** Run axe on the current page and fail when real accessibility violations exist. */
export async function expectNoA11yViolations(
  page: Page,
  options?: { disabledRules?: string[] }
) {
  await page.locator('body').waitFor({ state: 'visible' })

  let builder = new AxeBuilder({ page })
  if (options?.disabledRules?.length) {
    builder = builder.disableRules(options.disabledRules)
  }

  const results = await builder.analyze()
  expect(results.violations, formatViolations(results.violations)).toEqual([])
}
