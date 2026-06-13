// Chrome se DealerCenter cookies extract karo
// Run: node extract-chrome-cookies.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Chrome cookie database paths (Linux)
const chromePaths = [
  path.join(os.homedir(), '.config/google-chrome/Default/Cookies'),
  path.join(os.homedir(), '.config/chromium/Default/Cookies'),
  path.join(os.homedir(), 'snap/chromium/current/.config/chromium/Default/Cookies'),
  path.join(os.homedir(), '.config/google-chrome/Profile 1/Cookies'),
];


let cookieDb = null;
for (const p of chromePaths) {
  if (fs.existsSync(p)) {
    cookieDb = p;
    console.log('Chrome cookies found at:', p);
    break;
  }
}

if (!cookieDb) {
  console.error('Chrome cookies database nahi mili!');
  console.error('Checked paths:', chromePaths);
  process.exit(1);
}

// Copy database (Chrome lock ke saath directly open nahi hota)
const tmpDb = '/tmp/chrome-cookies-copy.db';
fs.copyFileSync(cookieDb, tmpDb);

try {
  // sqlite3 se cookies read karo
  const result = execSync(
    `sqlite3 "${tmpDb}" "SELECT name, value, encrypted_value FROM cookies WHERE host_key LIKE '%dealercenter%' OR host_key LIKE '%dealercenterauth%';"`,
    { encoding: 'utf8' }
  );

  if (!result.trim()) {
    console.log('\nDealerCenter cookies nahi mili Chrome mein.');
    console.log('Make sure Chrome mein DealerCenter open hai aur logged in ho.\n');
    process.exit(1);
  }

  console.log('\n=== DealerCenter cookies (raw) ===');
  console.log(result);

  // Playwright session format mein convert karo
  const lines = result.trim().split('\n');
  const cookies = [];
  
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 2) {
      const name = parts[0];
      const value = parts[1]; // Note: encrypted cookies won't work directly
      if (name && value && !value.startsWith('\x00')) {
        cookies.push({ name, value });
      }
    }
  }

  console.log('\nCookie names found:', cookies.map(c => c.name).join(', '));
  console.log('\nNote: Chrome encrypts cookie values on Linux with keyring.');
  console.log('Agar values empty/garbage hain to alternative approach use karna hoga.\n');

} catch (err) {
  if (err.message.includes('sqlite3: not found')) {
    console.log('\nsqlite3 install nahi hai. Install karo:');
    console.log('sudo apt install sqlite3');
  } else {
    console.error('Error:', err.message);
  }
}
