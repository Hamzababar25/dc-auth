const { chromium } = require('playwright');

const N8N_WEBHOOK = 'https://n8n.hireme-not.com/webhook/update-cookies';
const DC_USERNAME = process.env.DC_USERNAME;
const DC_PASSWORD = process.env.DC_PASSWORD;

async function getFreshCookies() {
  console.log('Getting fresh cookies...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://app.dealercenter.net');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Email/username field
    await page.fill('input[type="email"], input[name="email"], input[name="username"], #username', DC_USERNAME);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Password field
    await page.fill('input[type="password"], #password', DC_PASSWORD);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');

    // Wait for dashboard
    await page.waitForURL('**/apps/**', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Get cookies
    const cookies = await context.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const xsrfToken = cookies.find(c => c.name === 'XSRF-TOKEN')?.value;

    console.log('Cookies obtained! XSRF:', xsrfToken);

    // Send to n8n
    const res = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: cookieString, xsrf: xsrfToken })
    });

    console.log('Sent to n8n:', res.status);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

// Run immediately
getFreshCookies();

// Every 25 minutes
setInterval(getFreshCookies, 25 * 60 * 1000);