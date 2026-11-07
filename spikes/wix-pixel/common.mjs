// SPIKE: shared browser setup so the original and the frozen copy are shot the same way.
export const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
export const mobileUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36'

export async function preparePage(page, width) {
  const mobile = width < 600
  if (mobile) await page.setUserAgent(mobileUA)
  await page.setViewport({ width, height: mobile ? 844 : 800, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
  // Same motion setting on both sides; entrance animations are a separate, known loss.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Scroll the whole page so lazy images and reveal-on-scroll sections load, then return to the top. */
export async function settle(page) {
  let last = 0
  for (let i = 0; i < 80; i++) {
    const { y, h, vh } = await page.evaluate(() => ({ y: scrollY, h: document.documentElement.scrollHeight, vh: innerHeight }))
    if (y + vh >= h && h === last) break
    last = h
    await page.evaluate((step) => scrollBy(0, step), Math.round(vh * 0.8))
    await sleep(350)
  }
  await page.evaluate(() => scrollTo(0, 0))
  await sleep(1500)
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 30000 }).catch(() => {})
  await page.evaluate(() => document.fonts.ready)
}
