// Run: node save-session.js
const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  console.log('\nChromium install ho raha hai agar pehli baar hai...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://app.dealercenter.net', { timeout: 90000, waitUntil: 'domcontentloaded' });

  console.log('\n========================================');
  console.log('Browser khul gaya.');
  console.log('1. DealerCenter mein login karo');
  console.log('2. Gmail code bhi enter karo agar aaye');
  console.log('3. Dashboard dikhe tab yahan ENTER dabao');
  console.log('========================================\n');

  await new Promise(r => process.stdin.once('data', r));

  await context.storageState({ path: 'session.json' });

  const raw = fs.readFileSync('session.json', 'utf8');
  const b64 = Buffer.from(raw).toString('base64');

  console.log('\n=== RAILWAY mein DC_SESSION_B64 ke naam se ye paste karo ===\n');
  console.log(b64);
  console.log('\n=== END ===\n');
  console.log('session.json bhi save ho gaya is folder mein.\n');

  await browser.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
