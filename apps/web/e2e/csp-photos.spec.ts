import { expect, test } from '@playwright/test'

// T3.3 (WF-10): under the CSP the backend emits in production
// (script-src 'self', img-src 'self' <PHOTOS_BASE_URL origin>), the SPA must
// still mount without relying on inline scripts and must load person photos
// served from the cross-origin photos base URL. This spec emulates that exact
// CSP on the document response and verifies both properties in a real browser.

const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self'",
  "img-src 'self' http://localhost:1996",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join('; ')

const PHOTOS_ORIGIN = 'http://localhost:1996'

// 1x1 transparent PNG fixture served for every cross-origin photo request
// (avoids Node-only globals so the spec typechecks in any TS context).
const ONE_PIXEL_PNG = 'e2e/fixtures/1x1.png'

const envelope = (message: unknown) => JSON.stringify({ error: false, message })

const PERSONS = {
  owner: 'Ana',
  persons: [{ name: 'Bryan', photoCount: 1 }]
}

const PHOTOS = [
  { filename: 'bryan.jpg', url: `${PHOTOS_ORIGIN}/photos/Bryan/bryan.jpg` }
]

const setupStatus = envelope({
  configured: true,
  configuredChatId: '51999999999@c.us',
  configuredSessionId: 'main',
  missing: [],
  session: null
})

test('SPA mounts under CSP and loads a cross-origin photo', async ({ page }) => {
  const cspViolations: string[] = []

  page.on('console', msg => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) {
      cspViolations.push(msg.text())
    }
  })
  page.on('pageerror', err => {
    if (/Content Security Policy/i.test(err.message)) {
      cspViolations.push(err.message)
    }
  })

  // Serve the document with the same CSP the backend emits in production.
  await page.route('http://localhost:4173/', async route => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      headers: { 'Content-Security-Policy': CSP_HEADER }
    })
  })

  await page.route('**/setup/openwa/status', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: setupStatus
    })
  })

  await page.route('**/admin/photos/persons', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope(PERSONS)
    })
  })

  await page.route('**/admin/photos/persons/Bryan/photos', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope(PHOTOS)
    })
  })

  await page.route('**/admin/photos/unidentified', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope([])
    })
  })

  // Serve the cross-origin photo itself as a valid image.
  await page.route(`${PHOTOS_ORIGIN}/**`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      path: ONE_PIXEL_PNG
    })
  })

  // 1. The setup view renders under script-src 'self' (no inline scripts).
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /DoorCloud OpenWA setup/ })
  ).toBeVisible()

  // 2. The document contains no inline scripts (only external module tags).
  expect(await page.locator('script:not([src])').count()).toBe(0)

  // 3. The admin view loads a person photo from the cross-origin base URL
  // and the browser must actually decode it (img-src allows the origin).
  await page.evaluate(() => {
    window.location.hash = '#/admin'
  })
  await expect(page.getByText('Known persons')).toBeVisible()
  await page.getByRole('button', { name: /Bryan/ }).click()

  const img = page.locator('.photo-item img')
  await expect(img).toBeVisible()
  await expect
    .poll(() =>
      img.evaluate(el => {
        const image = el as HTMLImageElement
        return image.complete && image.naturalWidth > 0
      })
    )
    .toBe(true)

  // 4. No CSP violation was reported by the browser.
  expect(cspViolations).toEqual([])
})