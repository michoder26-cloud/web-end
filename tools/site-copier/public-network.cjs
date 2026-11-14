// The public copy runner never lets a page request local or private network resources.
// This is defense in depth for untrusted URLs on an isolated CI runner.
const dns = require('node:dns').promises;
const net = require('node:net');

function privateAddress(address) {
  if (net.isIP(address) === 6) return /^(::1$|::$|f[cd]|fe[89ab]|ff|::ffff:|2001:db8:)/i.test(address);
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 0 || b === 168) || a === 198 && (b === 18 || b === 19 || b === 51) || a === 203 && b === 0 || a >= 224;
}
async function publicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return false;
  try {
    const addresses = await dns.lookup(url.hostname, { all: true });
    return addresses.length > 0 && addresses.every(({ address }) => !privateAddress(address));
  } catch { return false; }
}
async function guardContext(context) {
  if (process.env.COPY_PUBLIC_BETA !== '1') return;
  await context.route('**/*', async route => {
    if (await publicUrl(route.request().url())) await route.continue().catch(() => {});
    else await route.abort().catch(() => {});
  });
}
module.exports = { publicUrl, guardContext };
