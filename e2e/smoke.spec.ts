import { test, expect } from '@playwright/test'

test('abre home e encontra header', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('header')).toBeVisible()
})
