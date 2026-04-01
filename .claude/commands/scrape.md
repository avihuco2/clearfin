# Scrape

Trigger a manual bank scrape for a specific account.

## Usage

```
/scrape [bankAccountId]
```

If `bankAccountId` is omitted, list the user's accounts and prompt for selection.

## What This Skill Does

1. Calls `POST /api/scrape/trigger` with the specified `bankAccountId`
2. Opens a real-time status view showing scrape progress stages:
   - `INITIALIZING` → `LOGGING_IN` → `LOGIN_SUCCESS` → `END_SCRAPING`
3. If the scraper emits `awaiting_otp`, displays an OTP input modal
4. On completion, shows how many transactions were added
5. On error, displays the `errorType` with a Hebrew-language explanation

## OTP Flow

If the bank requires 2FA during scraping:
1. A modal appears with the prompt: **"הכנס את הקוד שקיבלת ב-SMS"**
2. The user enters the 6-digit OTP
3. The code is submitted to `POST /api/scrape/otp` which writes it to Redis
4. The worker picks it up within 5 seconds and continues the login
5. Timeout after 120 seconds → job marked as error with type `OTP_TIMEOUT`

## Supported Companies

All `CompanyTypes` from `israeli-bank-scrapers`:
- Bank Hapoalim (`hapoalim`)
- Bank Leumi (`leumi`)
- Discount Bank (`discount`)
- Mizrahi Bank (`mizrahi`)
- Mercantile Bank (`mercantile`)
- Isracard (`isracard`)
- Amex (`amex`)
- Visa Cal (`visaCal`)
- Max (`max`)
- And more — see `israeli-bank-scrapers` `CompanyTypes` enum
