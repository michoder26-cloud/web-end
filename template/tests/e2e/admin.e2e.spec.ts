import { test, expect } from '@playwright/test'
import { login } from '../helpers/login'
import { adminToken, testAdmin } from '../helpers/seedUser'

test.describe('Admin panel', () => {
  test.beforeEach(async ({ page }) => {
    await adminToken()
    await login({ page, user: testAdmin })
  })

  test('opens the dashboard', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('span[title="Dashboard"]').first()).toBeVisible()
  })

  test('opens the user list', async ({ page }) => {
    await page.goto('/admin/collections/users')
    await expect(page.locator('h1', { hasText: 'Users' }).first()).toBeVisible()
  })

  test('opens the new user form', async ({ page }) => {
    await page.goto('/admin/collections/users/create')
    await expect(page.locator('input[name="email"]')).toBeVisible()
  })
})
