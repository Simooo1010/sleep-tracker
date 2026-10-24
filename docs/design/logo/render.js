const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const sizes = { 'app-icon-1024.png':1024, 'apple-touch-icon.png':180, 'icon-512.png':512, 'icon-192.png':192, 'favicon-32.png':32 };
  const svg = fs.readFileSync('app-icon.svg','utf8');
  for (const [name, px] of Object.entries(sizes)) {
    const p = await b.newPage({ viewport:{width:px,height:px}, deviceScaleFactor:1 });
    await p.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${px}" height="${px}" style="display:block"></body>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path:name, omitBackground:false });
    await p.close();
  }
  const m = fs.readFileSync('mark.svg','utf8');
  const p = await b.newPage({ viewport:{width:1024,height:1024} });
  await p.setContent(`<body style="margin:0;background:#161a22"><img src="data:image/svg+xml;base64,${Buffer.from(m).toString('base64')}" width="1024" height="1024"></body>`);
  await p.screenshot({ path:'preview-mark-dark.png' });
  await b.close();
})();
