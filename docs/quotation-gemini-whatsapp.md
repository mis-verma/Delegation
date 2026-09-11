# Quotation — Gemini AI & WhatsApp (Meta + DoubleTick) Integration Costs

**Prepared for:** [Client name]
**Prepared by:** [Your company name]
**Date:** 2026-09-07
**Validity:** 30 days from date above (third-party rates change without notice)

## 1. What this covers

This ticketing system accepts incoming tickets from **two WhatsApp channels** and uses **Google Gemini** to auto-extract ticket details (title, context, assignee, department, due date, category) from the message text/voice note. This is a **running-cost quotation for the third-party services only** — no development/implementation labor is included.

| Service | Role in this project |
|---|---|
| Google Gemini API | Parses incoming WhatsApp text/voice messages into structured ticket fields |
| Meta WhatsApp Cloud API | Official WhatsApp Business channel — sends/receives messages directly via Meta |
| DoubleTick (WhatsApp BSP) | Second WhatsApp channel — official WhatsApp Business Solution Provider on top of Meta's API, adds shared team inbox, webhooks, media handling |

## 2. Cost breakdown

### 2.1 Google Gemini API (usage-based, pay-as-you-go)

| Model | Input | Output |
|---|---|---|
| Gemini Flash (current default in this project) | ~$0.10–$0.75 per 1M tokens | ~$0.40–$3.75 per 1M tokens |

- Each ticket extraction call uses a short prompt (well under 1,000 tokens in, ~200 tokens out) → **cost per ticket extraction is a fraction of a cent** at current Flash rates.
- Billed directly by Google Cloud based on actual usage; no fixed monthly fee.

### 2.2 Meta WhatsApp Cloud API (per-message, since Jul 2025 pricing model)

| Category | Approx. rate (India) | Notes |
|---|---|---|
| Service (customer-initiated reply, within 24h window) | **Free** | Covers normal two-way ticket conversation |
| Utility template | Paid unless inside free service window | Used for outbound notifications outside the 24h window |
| Marketing template | ~$0.0094+ per message (varies by country) | Not typically used for internal ticketing |

- No per-conversation platform fee from Meta directly; you only pay for template messages sent outside an open free window.

### 2.3 DoubleTick (WhatsApp BSP subscription)

| Plan | Monthly fee (approx.) | Includes |
|---|---|---|
| Starter | ~₹2,000/month + taxes | Shared inbox, up to 5 agents, basic chatbot |
| Pro | ~₹2,499/month + taxes | Higher throughput (up to 100 msgs/sec), all Starter features |

- Meta's per-message charges (2.2 above) are passed through in addition to this platform fee.

## 3. Estimated combined monthly cost (indicative)

| Item | Estimated cost |
|---|---|
| DoubleTick platform fee | ₹2,000 – ₹2,500 / month |
| Gemini API usage (assuming a few hundred tickets/month) | < ₹500 / month |
| Meta WhatsApp messaging | Largely free (service-window replies); template usage billed as incurred |
| **Estimated total** | **≈ ₹2,500 – ₹3,500 / month**, scaling with ticket volume and template usage |

## 4. Assumptions & notes

- Rates sourced from official Gemini and Meta WhatsApp Business Platform pricing pages and current DoubleTick published plans as of September 2026; **all three providers can change pricing without notice** — confirm on their pricing pages before final commitment.
- Estimate assumes normal ticket-support volume (not bulk marketing broadcast use).
- Costs above are third-party pass-through costs; this document does not include implementation, hosting, or maintenance charges.

---
*This is a cost estimate for planning purposes, not an invoice.*
