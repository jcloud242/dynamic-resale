Situation
- We built a prototype that assumed programmatic access to accurate “sold items” via eBay APIs to compute historical average sale prices. Early integration tests revealed the Finding API either returned errors or required legacy AppID access; the Browse API only returns active listings. This exposed a critical assumption: sold-data might not be reliably accessible.

Task
- Decide whether to pause product development until partner API access is secured, use scraping (risky), or pivot to an active-listings-based estimator that provides immediate value with clear confidence signals.

Action
- Chose to pivot to an active-listings estimator and explicitly exclude scraping from production.
- Implemented server-side and client-side estimators that:
  - Aggregate active listings (Browse API), filter outliers and graded/collector listings, and produce optimistic/base/conservative sale estimates.
  - Subtract configurable fees and shipping assumptions to compute net expected proceeds and expected profit relative to a buy price.
  - Expose confidence based on sample size and variance.
- Added a server endpoint `/api/estimate/from-actives` and client-side estimator to keep the UI responsive without relying on sold-data API access.
- Deliberately removed any scraping fallback from the main branch to avoid ToS and legal risk; scraping remains an experimental option only in private branches with explicit gating.

Result
- The product regained momentum: thrift shoppers can still get actionable buy/sell guidance even without sold-data.
- The estimator provides transparent assumptions and confidence signals to reduce user confusion and risk.
- Operational risk from scraping was eliminated in the main branch, keeping the product safer for public deployment.

Why we didnt consider shipping a scraper to production
- Scraping public eBay pages can violate eBay's Terms of Service. Shipping scraping in production exposes the company to legal and account risks, including IP blocking, takedowns, or more severe enforcement. Additionally, scraped HTML is brittle and requires continuous maintenance. We made a deliberate product decision to avoid those risks and pursue safer, sustainable strategies (estimator + partner APIs or licensed data).

Lessons learned
- Explicitly identify and test the riskiest assumptions early (sold-data availability was our critical assumption). When a risky assumption fails, pivot quickly to a lower-risk approach that preserves core value while enabling future improvements.

Next steps
- Calibrate estimator with sold pairs when legally available or via licensed datasets.
- Surface confidence bands prominently in the UI and allow users to tweak fee/shipping assumptions.
- Continue conversations with eBay or licensed data providers to get authoritative sold history for high-confidence analytics.
