#!/usr/bin/env node
// Direct patch for israeli-bank-scrapers max.js
// Fixes Max post-login URL change (they moved from /homepage/personal to /insurance/personal)
const fs = require('fs');

const filePath = '/app/node_modules/israeli-bank-scrapers/lib/scrapers/max.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add /insurance/personal to the list of success URLs
const before1 = "urls[_baseScraperWithBrowser.LoginResults.Success] = [SUCCESS_URL];";
const after1  = "urls[_baseScraperWithBrowser.LoginResults.Success] = [SUCCESS_URL, `${BASE_WELCOME_URL}/insurance/personal`];";

// 2. Make checkReadiness non-blocking so a missing selector doesn't abort the scrape
const before2 = "await (0, _elementsInteractions.waitUntilElementFound)(this.page, '.personal-area > a.go-to-personal-area', true);";
const after2  = "try { await (0, _elementsInteractions.waitUntilElementFound)(this.page, '.personal-area > a.go-to-personal-area', false); } catch(e) {}";

let patched = 0;
if (content.includes(before1)) { content = content.replace(before1, after1); patched++; }
if (content.includes(before2)) { content = content.replace(before2, after2); patched++; }

fs.writeFileSync(filePath, content);
console.log(`[patch-max] applied ${patched}/2 patches to max.js`);
if (patched < 2) process.exit(1);
