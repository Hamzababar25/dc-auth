const { chromium } = require('playwright');

const N8N_WEBHOOK = process.env.N8N_WEBHOOK || 'https://n8n.hireme-not.com/webhook/update-cookies';
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 25 * 60 * 1000);
const DEALERCENTER_URL = 'https://app.dealercenter.net/apps/shell';
const SUPABASE_URL = 'https://caynyxdjaoksjewswwib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheW55eGRqYW9rc2pld3N3d2liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODcyNTQsImV4cCI6MjA5NDk2MzI1NH0.HYP0khfR-iDFYgvNdnKWOqANpaAS8k0S6N9sJc5RgMk';
let isRunning = false;

async function loadStorageStateFromSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/settings?key=eq.dc_session_state&select=value`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const rows = await res.json();
    if (rows && rows[0] && rows[0].value) {
      console.log('Loaded session state from Supabase.');
      return JSON.parse(rows[0].value);
    }
  } catch (e) {
    console.log('Could not load from Supabase, using env var fallback.');
  }
  return null;
}

async function saveStorageStateToSupabase(storageState) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ key: 'dc_session_state', value: JSON.stringify(storageState), updated_at: new Date().toISOString() })
    });
    console.log('Session state saved to Supabase.');
  } catch (e) {
    console.log('Could not save session state to Supabase:', e.message);
  }
}

function parseStorageStateFromEnv() {
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

  // Load session: Supabase first, then env var fallback
  let storageState = await loadStorageStateFromSupabase();
  if (!storageState) {
    storageState = parseStorageStateFromEnv();
    console.log('Using session from env var.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  try {
    await page.goto(DEALERCENTER_URL, { waitUntil: 'load', timeout: 60000 });

    if (page.url().includes('auth.dealercenter.net') || page.url().includes('/u/login')) {
      throw new Error('Session expired or MFA required. Update DC_SESSION_B64 in Railway.');
    }

    // Poll for XSRF-TOKEN — Angular sets it after JS execution (up to 30s)
    let xsrfToken = null;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(3000);
      const cookies = await context.cookies();
      xsrfToken = cookies.find(c => c.name === 'XSRF-TOKEN')?.value;
      if (xsrfToken) {
        console.log(`XSRF-TOKEN found after ${(i + 1) * 3}s`);
        break;
      }
      console.log(`Waiting for XSRF-TOKEN... (${(i + 1) * 3}s)`);
    }

    const cookies = await context.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    if (!xsrfToken) {
      // Log all cookie names to help debug
      console.log('Available cookies:', cookies.map(c => c.name).join(', '));
      throw new Error('XSRF-TOKEN not set after 36s. Session may be invalid.');
    }

    console.log('Cookies obtained. XSRF present:', Boolean(xsrfToken));

    // Save updated storageState to Supabase so restarts reuse fresh sessionid
    const updatedState = await context.storageState();
    await saveStorageStateToSupabase(updatedState);

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