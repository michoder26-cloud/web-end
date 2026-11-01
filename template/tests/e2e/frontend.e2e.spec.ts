import { test, expect } from '@playwright/test'

test.describe('Public site', () => {
  test('home page loads with a title, one heading and no browser errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await page.goto('/')

    await expect(page).toHaveTitle(/\S/)
    await expect(page.locator('h1')).toHaveCount(1)
    expect(errors).toEqual([])
  })

  test('home page fits the screen without sideways scrolling', async ({ page }) => {
    await page.goto('/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
