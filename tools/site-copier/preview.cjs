const { createPreviewServer } = require('./server.cjs');

const directory = process.argv[2] || 'site';
const port = Number(process.argv[3] || 8812);
createPreviewServer(directory, port)
  .then(({ url }) => console.log(`Preview: ${url}`))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
