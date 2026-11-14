// One command: capture, apply known front-end adapters, capture safe menus,
// and report any controls or assets that still need work. No AI is involved.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const source = process.argv[2];
const output = process.argv[3];
const quick = process.argv.includes('--quick');
if (!source || !output) {
  console.error('Usage: node tools/site-copier/run.cjs <public URL> <new output directory> [--quick]');
  process.exit(1);
}
let url;
try { url = new URL(source); if (!['https:', 'http:'].includes(url.protocol)) throw Error(); }
catch { console.error('Use a public HTTP or HTTPS URL.'); process.exit(1); }
const directory = path.resolve(output);
if (fs.existsSync(directory)) { console.error('Choose a new output directory:', directory); process.exit(1); }

const run = (script, args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(__dirname, script), ...args], { env, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(Error(`${script} exited with status ${code}`)));
});

(async () => {
  const env = { ...process.env, MAXP: process.env.MAXP || (quick ? '10' : '50') };
  if (quick) { env.MOTION_MS ||= '1000'; env.SHOT_LIMIT ||= '5'; }
  await run('copy.cjs', [url.href, directory], env);
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const adapters = [];
  if (url.hostname.endsWith('.base44.app') && html.includes('id="products"')) {
    try { await run('enhance-base44-shop.cjs', [url.href, directory]); adapters.push('storefront'); }
    catch (error) { console.error('Storefront adapter:', error.message); }
  }
  try { await run('capture-ui.cjs', [directory], env); }
  catch (error) { console.error('UI capture:', error.message); }
  await run('audit.cjs', [directory]);
  await run('add-backend.cjs', [directory]);
  await run('compare.cjs', [directory]);
  const audit = JSON.parse(fs.readFileSync(path.join(directory, 'front-end-audit.json'), 'utf8'));
  const visual = JSON.parse(fs.readFileSync(path.join(directory, 'visual-report.json'), 'utf8'));
  console.log(`Copied site: ${directory}`);
  console.log(`Adapters: ${adapters.join(', ') || 'none'}`);
  console.log(`Local Lottie animations: ${JSON.parse(fs.readFileSync(path.join(directory, 'copy-report.json'), 'utf8')).lottieAnimations || 0}`);
  console.log(`Front-end status: ${audit.status}; ${audit.issueCount} loading issues; ${audit.unverifiedControlCount} controls need review.`);
  console.log(`First-viewport similarity: ${visual.meanSimilarityPercent === null ? 'not measured' : visual.meanSimilarityPercent + '%'} (desktop and phone average).`);
  console.log(`All captured viewports: ${visual.meanScrollSimilarityPercent === null ? 'not measured' : visual.meanScrollSimilarityPercent + '%'} (desktop and phone average).`);
  console.log(`With back office: cd "${directory}" && node server.cjs   (then open /admin/)`);
  console.log(`Preview: node tools/site-copier/preview.cjs "${directory}"`);
})().catch(error => { console.error(error); process.exitCode = 1; });
