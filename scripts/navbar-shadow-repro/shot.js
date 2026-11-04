/* Screenshot both repro variants and measure the shadow band below the header. */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } }); // Android phone size

  for (const variant of ['before', 'after']) {
    await page.goto(`file:///home/z/my-project/scripts/navbar-shadow-repro/${variant}.html`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/navbar-repro/${variant}.png` });

    // Measure: sample a vertical strip at x=206 (center) from the header border down 14px
    const samples = await page.evaluate(() => {
      const hdr = document.getElementById('hdr');
      const r = hdr.getBoundingClientRect();
      const out = [];
      // canvas over the region below the header
      const cv = document.createElement('canvas');
      cv.width = 1; cv.height = 14;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 1, 14);
      // draw the page region: use html2canvas-free approach — read pixels via a screenshot instead.
      // Simpler: report geometry only; pixel analysis is done externally on the PNG.
      return { headerBottom: Math.round(r.bottom), headerHasRelative: getComputedStyle(hdr).position };
    });
    console.log(variant, JSON.stringify(samples));
  }

  await browser.close();
})();
