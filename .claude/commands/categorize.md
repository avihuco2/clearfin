# Categorize

Trigger AI categorization for all uncategorized transactions using Claude Haiku.

## Usage

```
/categorize [--account <bankAccountId>] [--since <YYYY-MM-DD>]
```

If no flags are given, categorizes all uncategorized transactions across all accounts.

## What This Skill Does

1. Queries `transactions` where `category_id IS NULL` (and optionally filtered by account/date)
2. Batches descriptions in groups of 50 to stay within token limits
3. Calls Claude Haiku via the `claude-api` skill with the system prompt and Hebrew category list
4. Parses the structured JSON response and upserts `category_id` onto each transaction
5. Reports: `N transactions categorized, M skipped (already categorized)`

## Claude Haiku Prompt

```
System:
You are a financial transaction categorizer for Israeli consumers.
Given transaction descriptions (often abbreviated Hebrew/English merchant names from Israeli bank systems),
return a JSON object mapping each description to one of the provided category IDs.
If unsure, use the "אחר" (other) category.

User:
Categories: { "<id>": "<name_he>", ... }
Transactions: ["שופרסל דיל", "10bis", "גז תחנה 23", ...]

Response format: { "description": "category_id", ... }
```

## Cost Estimate

- Model: `claude-3-haiku-20240307`
- ~200 transactions/month for a typical household
- Input: ~2,000 tokens/batch → ~$0.0005 per batch
- Total: under $0.01/month per user

## When This Runs Automatically

The `schedule` skill triggers categorization automatically after each successful scrape job completes (post-processing step in the scrape job handler).
