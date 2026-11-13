// Compare the first viewport of each copied page with the source screenshot.
// This is a visual signal, not a guarantee that every interaction is copied.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createPreviewServer } = require('./server.cjs');

const directory = path.resolve(process.argv[2] || 'site');
const copy = JSON.parse(fs.readFileSync(path.join(directory, 'copy-report.json'), 'utf8'));
const views = { desktop: { viewport: { width: 1366, height: 900 } }, phone: devices['iPhone 13'] };

async function compareImages(page, original, clone) {
  return page.evaluate(async ([a, b]) => {
    const image = data => new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = 'data:image/png;base64,' + data;
    });
    const [first, second] = await Promise.all([image(a), image(b)]);
    const width = Math.min(first.width, second.width);
    const height = Math.min(first.height, second.height);
    const pixels = input => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(input, 0, 0);
      return context.getImageData(0, 0, width, height).data;
    };
    const left = pixels(first), right = pixels(second);
    let changed = 0;
    for (let i = 0; i < left.length; i += 4) {
      if (Math.abs(left[i] - right[i]) + Math.abs(left[i + 1] - right[i + 1]) + Math.abs(left[i + 2] - right[i + 2]) > 48) changed++;
    }
    return { changed, total: width * height };
  }, [original.toString('base64'), clone.toString('base64')]);
}

(async () => {
  const { server, url } = await createPreviewServer(directory);
  const browser = await chromium.launch();
  const pages = [];
  try {
    for (const slug of copy.pages || []) for (const [view, options] of Object.entries(views)) {
      const shotDirectory = path.join(directory, '_shots', slug.replace(/\//g, '__'), view);
      if (!fs.existsSync(shotDirectory)) continue;
      const indexes = fs.readdirSync(shotDirectory).filter(name => /^\d+\.png$/.test(name)).map(name => Number(name.slice(0, -4))).sort((a, b) => a - b);
      if (!indexes.length) continue;
      const context = await browser.newContext(options);
      const page = await context.newPage();
      try {
        const target = url + (view === 'phone' ? 'm/' : '') + (slug === 'index' ? '' : slug + '/');
        await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
        await page.goto(target, { waitUntil: 'load', timeout: 30000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(Number(process.env.COMPARE_WAIT_MS || 2500));
        const animation = await page.evaluate(() => window.__LOTTIE?.length === 1 && window.lottie?.getRegisteredAnimations().length === 1 ? window.lottie.getRegisteredAnimations()[0].totalFrames : null);
        const screens = [];
        for (const index of indexes) {
          if (index) {
            await page.evaluate(y => window.scrollTo(0, y), index * page.viewportSize().height);
            await page.waitForTimeout(500);
          }
          const original = fs.readFileSync(path.join(shotDirectory, index + '.png'));
          let best = { similarity: -1, frame: null, screenshot: null };
          const measure = async frame => {
            if (frame !== null) {
              await page.evaluate(value => window.lottie.getRegisteredAnimations()[0].goToAndStop(value, true), frame);
              await page.waitForTimeout(30);
            }
            const screenshot = await page.screenshot();
            const { changed, total } = await compareImages(page, original, screenshot);
            const similarity = Number((100 * (total - changed) / total).toFixed(2));
            if (similarity > best.similarity) best = { similarity, frame, screenshot };
          };
          if (index === 0 && animation) {
            const step = animation / 12;
            for (let candidate = 0; candidate < 12; candidate++) await measure(Math.round(candidate * step));
            const first = best.frame;
            for (const offset of [-step / 2, step / 2, -step / 4, step / 4]) await measure((first + Math.round(offset) + animation) % animation);
          } else await measure(null);
          const copyShot = path.join(shotDirectory, 'copy', index + '.png');
          fs.mkdirSync(path.dirname(copyShot), { recursive: true });
          fs.writeFileSync(copyShot, best.screenshot);
          screens.push({ index, similarityPercent: best.similarity, matchedAnimationFrame: best.frame });
        }
        pages.push({ slug, view, similarityPercent: screens[0].similarityPercent, matchedAnimationFrame: screens[0].matchedAnimationFrame, scrollScreens: screens });
        console.log(slug, view, 'first', screens[0].similarityPercent + '%', 'all screens', Number((screens.reduce((sum, screen) => sum + screen.similarityPercent, 0) / screens.length).toFixed(2)) + '%');
      } catch (error) {
        pages.push({ slug, view, error: error.message.split('\n')[0] });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  const measured = pages.filter(page => Number.isFinite(page.similarityPercent));
  const allScreens = measured.flatMap(page => page.scrollScreens);
  const report = { source: copy.source, comparison: 'captured scroll viewports per page and view; one local animation uses its closest frame on the first viewport', animatedContent: Boolean(copy.lottieAnimations), meanSimilarityPercent: measured.length ? Number((measured.reduce((sum, page) => sum + page.similarityPercent, 0) / measured.length).toFixed(2)) : null, meanScrollSimilarityPercent: allScreens.length ? Number((allScreens.reduce((sum, screen) => sum + screen.similarityPercent, 0) / allScreens.length).toFixed(2)) : null, pages };
  fs.writeFileSync(path.join(directory, 'visual-report.json'), JSON.stringify(report, null, 2));
  console.log('First-viewport similarity:', report.meanSimilarityPercent === null ? 'not measured' : report.meanSimilarityPercent + '%', 'all captured viewports:', report.meanScrollSimilarityPercent === null ? 'not measured' : report.meanScrollSimilarityPercent + '%');
})().catch(error => { console.error(error); process.exitCode = 1; });
