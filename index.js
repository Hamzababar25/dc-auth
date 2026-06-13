const { chromium } = require('playwright');

const N8N_WEBHOOK = process.env.N8N_WEBHOOK || 'https://n8n.hireme-not.com/webhook/update-cookies';
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 25 * 60 * 1000);
const DEALERCENTER_URL = 'https://app.dealercenter.net/apps/shell';
let isRunning = false;

function parseStorageState() {
  if (process.env.DC_SESSION_B64) {
    const decoded = Buffer.from(process.env.DC_SESSION_B64, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }

  if (process.env.DC_SESSION) {
    return JSON.parse(process.env.DC_SESSION);
  }

  throw new Error('Missing DC_SESSION (or DC_SESSION_B64) environment variable.');
}

async function getFreshCookies() {
  if (isRunning) {
    console.log('Previous run still active, skipping this cycle.');
    return;
  }
  isRunning = true;
  console.log('Getting fresh cookies...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: parseStorageState() });
  const page = await context.newPage();

  try {
    await page.goto(DEALERCENTER_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('auth.dealercenter.net') || page.url().includes('/u/login')) {
      throw new Error('Session expired or MFA required. Recreate DC_SESSION manually.');
    }

    const cookies = await context.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const xsrfToken = cookies.find(c => c.name === 'XSRF-TOKEN')?.value;

    if (!cookieString || !xsrfToken) {
      throw new Error('Could not extract cookieString or XSRF token from session cookies.');
    }

    console.log('Cookies obtained. XSRF present:', Boolean(xsrfToken));

    const res = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: cookieString, xsrf: xsrfToken })
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Webhook failed (${res.status}): ${body}`);
    }

    console.log('Sent to n8n:', res.status);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    isRunning = false;
  }
}

getFreshCookies();

setInterval(getFreshCookies, REFRESH_INTERVAL_MS);