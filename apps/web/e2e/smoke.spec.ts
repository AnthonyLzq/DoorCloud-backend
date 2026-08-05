import { expect, test } from '@playwright/test'

// One smoke spec for the SPA (WF/PA wiring without a real backend): it stubs
// the /setup and /admin APIs with page.route() so the test never needs the
// backend, MQTT, models or WhatsApp. It asserts the setup page renders, the
// #/admin view lists stubbed persons, and clicking Add issues the create POST.

const envelope = (message: unknown) => JSON.stringify({ error: false, message })

const PERSONS = {
  owner: 'Ana',
  persons: [
    { name: 'Bryan', photoCount: 3 },
    { name: 'Henry', photoCount: 2 }
  ]
}

const setupStatus = envelope({
  configured: true,
  configuredChatId: '51999999999@c.us',
  configuredSessionId: 'main',
  missing: [],
  session: null
})

test('SPA loads setup, admin lists persons and create issues a POST', async ({
  page
}) => {
  let createPosted = false

  await page.route('**/setup/openwa/status', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: setupStatus
    })
  })

  await page.route('**/admin/photos/persons', async route => {
    const request = route.request()
    const method = request.method()

    if (method === 'POST') createPosted = true

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body:
        method === 'POST'
          ? envelope({ name: 'Diana', photoCount: 0 })
          : envelope(PERSONS)
    })
  })

  await page.route('**/admin/photos/unidentified', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope([])
    })
  })

  // 1. The SPA root serves the setup view (default hash route).
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /DoorCloud OpenWA setup/ })
  ).toBeVisible()

  // 2. Navigating to #/admin renders the stubbed person list. Set the hash
  // programmatically so the SPA's hashchange listener drives the route.
  await page.evaluate(() => {
    window.location.hash = '#/admin'
  })
  await expect(page.getByText('Known persons')).toBeVisible()
  await expect(page.getByText('Bryan')).toBeVisible()
  await expect(page.getByText('Henry')).toBeVisible()
  await expect(page.getByText('3 photos')).toBeVisible()

  // 3. Creating a person issues the POST and the row appears.
  await page.getByPlaceholder('New person name').fill('Diana')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('Diana')).toBeVisible()
  await expect.poll(() => createPosted).toBe(true)
})