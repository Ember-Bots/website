# EmberBots Workflow Systems — Implementation Brief
**Document Type:** Internal Ops + AI Agent Reference  
**Version:** 1.0  
**Date:** April 7, 2026  
**Status:** Active — for engineer and Cinder/Computer agent use  

---

## Table of Contents

1. [System 1: Appointment Booking System](#system-1-appointment-booking-system)
2. [System 2: Reputation & Review Engine](#system-2-reputation--review-engine)
3. [System 3: Payment & Invoice Automation](#system-3-payment--invoice-automation)
4. [Implementation Sequencing](#implementation-sequencing)

---

---

# System 1: Appointment Booking System

## Quick Reference
- **Trigger:** New lead form submission (from Lead Capture Engine) or inbound inquiry via email/SMS
- **Core action:** Auto-select available slot, book appointment in Calendly/Cal.com, send confirmation + reminder sequence via Gmail and/or SMS
- **Branching:** No-show triggers automated rescheduling outreach; cancellation restores slot and fires re-engagement sequence
- **Output feeds into:** Follow-Up Assistant (marks lead as "appointment booked" or "no-show — re-engage")
- **Client touchpoint:** Team receives calendar invite + daily booking digest; all booking/reminder logic runs autonomously

---

## System Overview

### What Operational Problem It Solves
Most SMBs lose leads between the moment of interest and the moment of a booked appointment. The gap — which typically spans hours or days — is filled with manual back-and-forth on scheduling, missed follow-ups, and forgotten confirmations. No-shows compound the problem: without a recovery sequence, a no-show is a dead lead. This system closes that gap entirely by converting a lead signal into a confirmed, reminded, and recovered appointment without any human scheduling effort.

### Why It Matters for SMBs
For home service, professional service, and local businesses, the appointment *is* the sale funnel. A slow booking response (>30 minutes) drops conversion rates by over 80% in most service verticals. Automating the booking moment and the pre-appointment sequence means the business responds at the speed of software while the owner focuses on delivery.

### How It Connects to EmberBots' Existing Systems
- **Feeds from:** Lead Capture Engine — passes `lead_name`, `lead_email`, `lead_phone`, `service_requested`, `lead_source`, `lead_timestamp` to this system via a standardized lead payload
- **Feeds into:** Follow-Up Assistant — on appointment outcome (booked, confirmed, no-show, cancelled), passes `appointment_status`, `appointment_datetime`, and `follow_up_type` so the Follow-Up Assistant knows what sequence to run
- **Feeds into:** Ops Back Office — confirmed appointments populate the job queue; job type and service duration feed into scheduling and resource planning
- **Connected to:** AI Front Desk — if an inbound call or chat inquiry comes in, the AI Front Desk passes booking intent directly to this system

---

## Required Connectors

### Primary
| Connector | Role in This System |
|---|---|
| **Calendly or Cal.com** | Source of truth for available time slots; booking creation; cancellation and reschedule events; webhook delivery of booking lifecycle events |
| **Gmail with Calendar** | Send confirmation and reminder emails from client's business email address; create Google Calendar events for the client team; read calendar to detect scheduling conflicts |
| **Twilio / Sendblue (SMS)** | Send SMS confirmation immediately on booking; send 24-hour and 2-hour reminder SMS; send no-show recovery SMS; receive inbound SMS replies to rescheduling prompts |

### Optional
| Connector | Role |
|---|---|
| **Mailchimp / ActiveCampaign** | If client uses a marketing list, tag booked leads and suppress from cold outreach sequences during the appointment window |

---

## Trigger Events

### Real-Time Triggers
1. **New lead payload received** from Lead Capture Engine — `event_type: lead_captured`, contains `lead_email`, `lead_phone`, `service_requested`
2. **Inbound email with booking intent** — detected via Gmail label or keyword filter (configurable: e.g., subject contains "appointment", "schedule", "consult", "quote")
3. **Inbound SMS with booking intent** — Twilio inbound webhook fires when client's business SMS number receives a message; intent classification run on message body
4. **Calendly/Cal.com webhook: `invitee.created`** — new booking made (even self-booked via shared link)
5. **Calendly/Cal.com webhook: `invitee.canceled`** — booking cancelled by invitee or host
6. **Calendly/Cal.com webhook: `invitee.rescheduled`** — booking rescheduled

### Scheduled Triggers
| Schedule | Action |
|---|---|
| **Daily at `DIGEST_TIME` (config)** | Generate and email daily booking digest to `owner_email` listing all appointments for next 48 hours |
| **T-24 hours before each appointment** | Fire 24-hour reminder sequence (email + SMS) |
| **T-2 hours before each appointment** | Fire 2-hour reminder SMS |
| **T+15 minutes after scheduled appointment start** | Check booking attendance status; if no confirmation received, trigger no-show sequence |
| **Weekly Monday at `DIGEST_TIME`** | Send weekly booking summary report to `owner_email` |

---

## Workflow Logic (Step-by-Step)

### Branch A: Lead-Triggered Booking

**Step 1 — Receive Lead Payload**
- Input: `lead_name`, `lead_email`, `lead_phone`, `service_requested`, `lead_source`, `lead_timestamp`
- System reads `service_requested` and maps to `appointment_type` using config variable `SERVICE_TO_APPOINTMENT_MAP`
- System reads `BOOKING_MODE` config:
  - If `BOOKING_MODE = "auto_offer_link"` → proceed to Step 2
  - If `BOOKING_MODE = "auto_book_first_available"` → proceed to Step 3

**Step 2 — Send Booking Link (auto_offer_link mode)**
- Query Calendly/Cal.com API: `GET /event_types` filtered by `appointment_type` → retrieve scheduling URL
- Compose email using template `EMAIL_TEMPLATE_BOOKING_INVITE`:
  - Subject: `BOOKING_EMAIL_SUBJECT` (config)
  - Body: personalized with `lead_name`, `service_requested`, `business_name`, scheduling link
- Send via Gmail API from `sender_email` (config)
- Simultaneously send SMS via Twilio using template `SMS_TEMPLATE_BOOKING_INVITE`:
  - Body: personalized greeting + short scheduling link
- Write event to log: `{ event: "booking_link_sent", lead_email, timestamp }`
- Set `lead_status = "booking_link_sent"` in internal state store
- **Decision:** If no booking detected within `BOOKING_LINK_EXPIRY_HOURS` (config, default 48h) → trigger Follow-Up Assistant with `follow_up_type = "no_booking_response"`

**Step 3 — Auto-Book First Available Slot (auto_book_first_available mode)**
- Query Calendly/Cal.com API: `GET /availability` for the relevant event type, starting from `now + BOOKING_BUFFER_MINUTES` (config, default 60)
- Select first available slot that falls within `BUSINESS_HOURS_START` and `BUSINESS_HOURS_END` (config) and not on a day in `BLOCKED_DAYS` (config)
- Create booking via Calendly/Cal.com API: `POST /scheduled_events` with `invitee_email = lead_email`, `invitee_name = lead_name`
- Write to internal state: `appointment_id`, `appointment_datetime`, `appointment_type`, `lead_email`
- Proceed to Step 4

**Step 4 — Send Confirmation**
- Send confirmation email via Gmail using `EMAIL_TEMPLATE_CONFIRMATION`:
  - Include: appointment date/time, service type, business address (`BUSINESS_ADDRESS` config), what to bring/expect (`APPOINTMENT_PREP_NOTE` config), reschedule link
- Send confirmation SMS via Twilio using `SMS_TEMPLATE_CONFIRMATION`
- Create Google Calendar event via Calendar API:
  - Title: `[service_requested] — [lead_name]`
  - Attendees: `lead_email`, `owner_email`, `TEAM_CALENDAR_EMAIL` (if set in config)
  - Location: `BUSINESS_ADDRESS`
  - Description: lead source, service type, lead phone
- Set `lead_status = "appointment_confirmed"`
- Log: `{ event: "appointment_confirmed", appointment_id, appointment_datetime, lead_email }`

**Step 5 — 24-Hour Reminder**
- At T-24 hours: send email using `EMAIL_TEMPLATE_REMINDER_24H` + SMS using `SMS_TEMPLATE_REMINDER_24H`
- SMS message includes: date, time, address, "Reply CONFIRM to confirm or RESCHEDULE to change"
- **Decision on inbound SMS reply:**
  - Reply contains "CONFIRM" (case-insensitive) → set `attendance_confirmed = true`, log event, send brief "You're confirmed!" SMS reply
  - Reply contains "RESCHEDULE" → send reschedule link via SMS, set `lead_status = "reschedule_requested"`
  - No reply within 4 hours → no action (2-hour reminder still fires)

**Step 6 — 2-Hour Reminder**
- Send SMS using `SMS_TEMPLATE_REMINDER_2H`
- If `attendance_confirmed = false` and `REQUIRE_CONFIRMATION = true` (config): include softer confirmation prompt
- Log: `{ event: "reminder_2h_sent", appointment_id }`

**Step 7 — No-Show Detection**
- At T+15 minutes: check Calendly/Cal.com event status via `GET /scheduled_events/{uuid}`
- **Decision:**
  - If event status = `active` and `attendance_confirmed = false` and no cancellation webhook received → flag as probable no-show
  - Send alert to `owner_email` via Gmail: subject "Possible no-show: [lead_name] at [time]"
  - Send no-show recovery SMS to lead using `SMS_TEMPLATE_NOSHOW`:
    - Body: "Hi [name], we missed you today for your [service] appointment. Want to reschedule? [link]"
  - Set `lead_status = "no_show"`
  - Pass to Follow-Up Assistant: `{ follow_up_type: "no_show_recovery", lead_email, lead_phone, appointment_type }`

**Step 8 — Cancellation Handling**
- Triggered by Calendly/Cal.com `invitee.canceled` webhook
- If cancelled by invitee: send acknowledgment email + offer reschedule link
- Delete or decline Google Calendar event
- Set `lead_status = "cancelled"`
- **Decision based on `CANCELLATION_RE_ENGAGE` config (boolean):**
  - If `true` → pass to Follow-Up Assistant with `follow_up_type = "cancellation_re_engage"`
  - If `false` → log and end workflow

### Branch B: Inbound Email Booking Request
- Gmail webhook / polling detects email matching `BOOKING_INTENT_KEYWORDS` (config list, e.g., ["schedule", "appointment", "book", "consult", "quote"])
- Extract sender email, name (from email headers)
- Compose reply using `EMAIL_TEMPLATE_BOOKING_INVITE` with scheduling link
- Continue at Step 4 once booking is confirmed via Calendly webhook

### Branch C: Self-Booked via Shared Link
- Calendly `invitee.created` webhook fires
- Extract `invitee_email`, `invitee_name`, `event_start_time`, `event_type_name`
- Check if lead already exists in state store:
  - If yes → update `lead_status = "appointment_confirmed"`, skip duplicate confirmation email if sent within last 5 minutes
  - If no → create new lead record, proceed from Step 4
- Notify `owner_email` via Gmail: "New booking from [name] — [service] on [date/time]"

---

## Configuration Variables (Per Client)

### Workflow Logic Variables (affect branching and timing)
| Variable | Type | Description | Default |
|---|---|---|---|
| `BOOKING_MODE` | enum | `"auto_offer_link"` or `"auto_book_first_available"` | `"auto_offer_link"` |
| `BOOKING_BUFFER_MINUTES` | integer | Minimum lead time before first available slot can be offered | `60` |
| `BOOKING_LINK_EXPIRY_HOURS` | integer | Hours before no-booking response triggers Follow-Up Assistant | `48` |
| `BUSINESS_HOURS_START` | time (HH:MM) | Earliest bookable slot time | `"09:00"` |
| `BUSINESS_HOURS_END` | time (HH:MM) | Latest bookable slot time | `"17:00"` |
| `BUSINESS_TIMEZONE` | IANA timezone string | e.g., `"America/Chicago"` | required |
| `BLOCKED_DAYS` | array of dates or day-of-week | Days unavailable for booking | `[]` |
| `REQUIRE_CONFIRMATION` | boolean | Whether 2H reminder includes a confirmation prompt | `false` |
| `CANCELLATION_RE_ENGAGE` | boolean | Whether cancellations feed into re-engagement Follow-Up sequence | `true` |
| `SERVICE_TO_APPOINTMENT_MAP` | JSON object | Maps `service_requested` string to Calendly event type UUID | required |
| `BOOKING_INTENT_KEYWORDS` | array of strings | Keywords in email subject/body that signal booking intent | `["schedule","appointment","book","consult","quote"]` |

### Output Content Variables (affect messaging, not logic)
| Variable | Type | Description |
|---|---|---|
| `BUSINESS_NAME` | string | Used in all outbound messages |
| `BUSINESS_ADDRESS` | string | Included in confirmations and calendar events |
| `APPOINTMENT_PREP_NOTE` | string | What client should bring or expect; appended to confirmation email |
| `sender_email` | string | Gmail address used as "From" for all outbound email |
| `owner_email` | string | Receives alerts, digests, and no-show notifications |
| `TEAM_CALENDAR_EMAIL` | string (optional) | Secondary calendar invited on all bookings |
| `DIGEST_TIME` | time (HH:MM) | Time of day for daily and weekly digests |
| `EMAIL_TEMPLATE_BOOKING_INVITE` | string (template) | Booking invite email body; supports `{{lead_name}}`, `{{service_requested}}`, `{{scheduling_link}}` |
| `EMAIL_TEMPLATE_CONFIRMATION` | string (template) | Confirmation email body |
| `EMAIL_TEMPLATE_REMINDER_24H` | string (template) | 24H reminder email body |
| `SMS_TEMPLATE_BOOKING_INVITE` | string (template) | SMS booking invite; max 160 chars recommended |
| `SMS_TEMPLATE_CONFIRMATION` | string (template) | SMS confirmation |
| `SMS_TEMPLATE_REMINDER_24H` | string (template) | SMS 24H reminder |
| `SMS_TEMPLATE_REMINDER_2H` | string (template) | SMS 2H reminder |
| `SMS_TEMPLATE_NOSHOW` | string (template) | SMS no-show recovery message |
| `BOOKING_EMAIL_SUBJECT` | string | Subject line for booking invite email |

---

## What's Standardized vs. What's Configured

### Standardized (Workflow Engine — Same for Every Client)
- Webhook listener architecture for Calendly/Cal.com events
- Lead payload schema ingestion from Lead Capture Engine
- State machine logic: `lead_status` transitions and valid state paths
- Scheduling timer logic (T-24h, T-2h, T+15min)
- SMS reply parsing (CONFIRM / RESCHEDULE keyword detection)
- No-show detection algorithm
- Google Calendar event creation structure
- Handoff payload format to Follow-Up Assistant and Ops Back Office
- Error handling: retry logic on failed API calls (3 attempts, exponential backoff), dead-letter queue for failed events
- Logging schema: all events written to `appointment_events` log with `client_id`, `lead_id`, `event_type`, `timestamp`

### Configured Per Client
- All variables in the Configuration Variables table above
- Calendly/Cal.com account credentials and event type UUIDs
- Gmail OAuth credentials and sender identity
- Twilio phone number and account SID
- Message templates (all text content)
- Business hours, timezone, blocked days
- Service-to-appointment mapping

---

## Client Deliverables

### What the Client Gets
1. **Booking link** embedded in their website and shareable via their AI Front Desk or Lead Capture forms — pre-connected to their calendar
2. **Google Calendar integration** — every booking appears on their team calendar automatically
3. **Daily booking digest email** — next 48 hours of appointments, sent each morning to owner
4. **Weekly summary report** — total bookings, show rate, cancellation rate, no-show rate

### What the Client Sees and Interacts With
- Calendly/Cal.com booking page (styled to their brand during onboarding)
- Daily digest email in their inbox
- Alert emails for no-shows (immediate, requires their attention to decide whether to follow up manually or leave to the system)
- The Google Calendar events

### What Runs Without Their Involvement
- Lead-to-booking-link delivery (within 90 seconds of form submission)
- Confirmation emails and SMS
- 24H and 2H reminders
- No-show detection and recovery SMS
- Cancellation acknowledgment
- All logging and state tracking
- Calendar event creation and maintenance

---

## Monitoring & Reporting

### Metrics Tracked
| Metric | Description |
|---|---|
| `bookings_created` | Total bookings created per period |
| `bookings_confirmed` | Bookings where lead replied CONFIRM |
| `bookings_shown` | Appointments where client marked attended (or no cancel/no-show detected) |
| `no_shows` | Appointments flagged as no-show |
| `no_show_recovery_rate` | % of no-shows that rebook after recovery SMS |
| `cancellations` | Total cancellations |
| `cancellation_to_rebook_rate` | % of cancellations that rebook |
| `booking_link_click_rate` | If trackable via Calendly/Cal.com analytics |
| `avg_lead_to_booking_time_minutes` | Time from lead received to appointment confirmed |
| `reminder_delivery_success_rate` | % of SMS/email reminders delivered without error |

### Weekly Report (delivered Monday to `owner_email`)
- Subject: `[Business Name] Booking Summary — Week of [date]`
- Sections:
  1. This week's appointments (count, show rate)
  2. No-shows this week + recovery status
  3. Upcoming bookings next 7 days
  4. Trend: bookings vs. prior 4-week average

### Monthly Report
- Booking volume trend (4-week rolling)
- Show rate trend
- No-show recovery rate
- Average lead-to-booking time trend
- Top booking sources (by lead source field)

### Alerts
| Condition | Alert |
|---|---|
| No-show detected (T+15min) | Immediate email to `owner_email` |
| Booking confirmation email or SMS delivery failure | Immediate alert to `owner_email` |
| Zero bookings in last 72 hours (during business hours) | Alert to `owner_email` — may indicate broken booking link |
| Calendly/Cal.com API error | Immediate alert to `owner_email` + Ember system admin |

---

## Natural Upsell

**Immediate:** Follow-Up Assistant — once the client sees no-show recovery working, they immediately want a structured post-appointment follow-up sequence (review request, upsell, referral ask). This is the single most natural next conversation.

**Within 30 days:** Reputation & Review Engine — booked and completed appointments are the primary source of review requests. Client will want to automate the "job done → review requested" moment.

**Within 60 days:** Payment & Invoice Automation — once appointments are flowing and jobs are being completed, the invoicing pain surfaces. Client will ask "can we automate sending invoices after appointments too?"

---

---

# System 2: Reputation & Review Engine

## Quick Reference
- **Triggers:** New review posted on Google or Yelp; scheduled review request sequence after job close
- **Core action:** Auto-draft response for all reviews; alert team to 1-2 star reviews immediately; send review request via Gmail or SMS at configurable intervals post-job
- **Branching:** Negative reviews (≤ `NEGATIVE_REVIEW_THRESHOLD` stars) route to human-review queue before responding; positive reviews get auto-posted response
- **Output:** Increases review volume and average star rating; feeds lead volume data back to Ops context
- **Client touchpoint:** Owner approves negative review responses; positive responses post automatically

---

## System Overview

### What Operational Problem It Solves
Local and home service SMBs live and die by their Google star rating. The average SMB owner knows they should respond to reviews and ask for them — but neither happens consistently because both require time and a process they don't have. The result: negative reviews sit unanswered (damaging perception), positive reviews go unacknowledged, and satisfied customers who would leave a review never get asked. This system automates the entire review lifecycle from request to response.

### Why It Matters for SMBs
Google's local ranking algorithm weighs review volume and recency heavily. A business going from 3.8 stars to 4.4 stars with 2x the review count can double or triple organic map pack visibility and inbound calls without spending a dollar on ads. For home service businesses, this is the highest-leverage marketing lever available. Responding to reviews (including negative ones, professionally) is also a proven trust signal for prospects reading them.

### How It Connects to EmberBots' Existing Systems
- **Feeds from:** Ops Back Office — job close event triggers review request sequence; `job_id`, `client_name`, `client_email`, `client_phone`, `service_type` passed as payload
- **Feeds from:** Lead Capture Engine — can suppress review requests to leads who are still in early funnel stages (haven't converted yet)
- **Feeds into:** Lead Capture Engine — rising review count and star rating improves Google Business Profile visibility, which drives more organic leads
- **Feeds into:** AI Front Desk — negative review alerts can surface as context so the AI Front Desk handles related inbound calls with awareness of the issue

---

## Required Connectors

### Primary
| Connector | Role in This System |
|---|---|
| **Google Business Profile (Google My Business API)** | Poll for new reviews via `accounts.locations.reviews.list`; post review replies via `accounts.locations.reviews.reply`; read current star rating and review count |
| **Yelp Fusion API** | Poll for new Yelp reviews via `/businesses/{id}/reviews`; read star rating; (Note: Yelp API does not support posting replies — response drafts go to owner for manual posting) |
| **Gmail** | Send review request emails using client's business address; send negative review alert emails to owner; deliver weekly review digest |
| **Twilio / Sendblue (SMS)** | Send review request SMS post-job; send immediate SMS alert to owner for negative reviews |

### Optional
| Connector | Role |
|---|---|
| **Mailchimp / ActiveCampaign** | If review requestee is on a marketing list, suppress from cold outreach during review sequence window |

---

## Trigger Events

### Real-Time Triggers
1. **New Google Business Profile review detected** — polling on `REVIEW_POLL_INTERVAL_MINUTES` (config, default 30 min) via `accounts.locations.reviews.list` sorted by `updateTime`
2. **New Yelp review detected** — polling on `REVIEW_POLL_INTERVAL_MINUTES` via Yelp Fusion `/businesses/{id}/reviews`
3. **Job close event from Ops Back Office** — `event_type: job_closed`, payload: `job_id`, `client_name`, `client_email`, `client_phone`, `service_type`, `job_close_timestamp`

### Scheduled Triggers
| Schedule | Action |
|---|---|
| **Every `REVIEW_POLL_INTERVAL_MINUTES`** | Poll Google and Yelp for new reviews |
| **T+`REVIEW_REQUEST_DELAY_HOURS` after job close** (config, default 4h) | Send first review request |
| **T+`REVIEW_REQUEST_FOLLOWUP_HOURS` after job close** (config, default 72h), if no review detected | Send second review request (if `SEND_REVIEW_FOLLOWUP = true`) |
| **Weekly Monday at `DIGEST_TIME`** | Send review performance summary to `owner_email` |

---

## Workflow Logic (Step-by-Step)

### Branch A: New Review Detected

**Step 1 — Poll for New Reviews**
- Query Google Business Profile API: `GET accounts/{account}/locations/{location}/reviews?orderBy=updateTime desc&pageSize=10`
- Compare `reviewId` values against `processed_reviews` state store
- For each new `reviewId` not in state store: extract `reviewer_display_name`, `star_rating` (1-5), `comment`, `create_time`
- Mark as processed: write `reviewId` to state store with `processed_at` timestamp
- Repeat for Yelp: query `/businesses/{YELP_BUSINESS_ID}/reviews`, compare IDs

**Step 2 — Classify Review Sentiment**
- **Decision based on `star_rating`:**
  - `star_rating >= POSITIVE_REVIEW_THRESHOLD` (config, default 4) → `review_class = "positive"`
  - `star_rating <= NEGATIVE_REVIEW_THRESHOLD` (config, default 2) → `review_class = "negative"`
  - Otherwise → `review_class = "neutral"`
- If `comment` is empty string and `star_rating >= POSITIVE_REVIEW_THRESHOLD` → `review_class = "positive_no_comment"`

**Step 3 — Draft Response**
- Generate response draft using `RESPONSE_TEMPLATE_POSITIVE`, `RESPONSE_TEMPLATE_NEUTRAL`, or `RESPONSE_TEMPLATE_NEGATIVE` (config templates)
- Template variables: `{{reviewer_name}}`, `{{business_name}}`, `{{service_type}}` (if detectable from comment), `{{owner_first_name}}`
- For positive reviews: use a rotating set of `POSITIVE_RESPONSE_VARIANTS` (config, array of templates) to avoid duplicate responses
- For no-comment positive reviews: use `RESPONSE_TEMPLATE_POSITIVE_NO_COMMENT`

**Step 4 — Route by Classification**

*Positive and Neutral Reviews:*
- If platform = Google and `AUTO_POST_POSITIVE_RESPONSES = true` (config):
  - Post response immediately via Google Business Profile API: `PUT accounts/{account}/locations/{location}/reviews/{reviewId}/reply`
  - Log: `{ event: "review_response_posted", reviewId, star_rating, platform: "google", timestamp }`
  - Send digest-worthy note (accumulated into next weekly report, no immediate email unless `NOTIFY_ON_POSITIVE = true`)
- If platform = Yelp (cannot auto-post):
  - Send email to `owner_email` with drafted response and a link to Yelp business dashboard to post manually
  - Subject: `New [X]-star Yelp review from [reviewer_name] — response draft ready`

*Negative Reviews:*
- **Immediately** send SMS alert to `owner_phone` (config): "New [X]-star review on [platform] from [reviewer_name]. Tap to view: [REVIEW_URL]"
- Send email alert to `owner_email` with:
  - Review content
  - Drafted response
  - Two-option CTA: "Approve this response" / "Edit and resubmit"
- Set `review_status = "pending_approval"`
- **Decision:**
  - If owner approves via email reply containing "APPROVE" (or clicks approval link): post drafted response via Google API (or send to Yelp dashboard if Yelp)
  - If owner edits and resubmits: post edited version
  - If no response within `NEGATIVE_REVIEW_RESPONSE_SLA_HOURS` (config, default 24h): send escalation reminder to `owner_email` and `ESCALATION_EMAIL` (config, optional)

**Step 5 — Log and Track**
- Write to `review_events` log: `{ client_id, reviewId, platform, star_rating, review_class, response_posted, response_timestamp, auto_or_manual }`
- Update rolling metrics: `current_star_rating`, `total_review_count`, `reviews_this_week`, `avg_response_time_hours`

### Branch B: Job Close → Review Request Sequence

**Step 1 — Receive Job Close Payload**
- Input: `job_id`, `client_name`, `client_email`, `client_phone`, `service_type`, `job_close_timestamp`
- Check `review_request_suppression` list: if `client_email` is in `SUPPRESSION_LIST` (e.g., flagged difficult customer) → skip sequence, log suppression
- Check if this client has left a review within `REVIEW_LOOKBACK_DAYS` (config, default 180 days): if yes → skip, log as "already reviewed recently"

**Step 2 — Wait for Delay**
- Schedule first outreach at `job_close_timestamp + REVIEW_REQUEST_DELAY_HOURS`

**Step 3 — Send First Review Request**
- Send SMS via Twilio using `SMS_TEMPLATE_REVIEW_REQUEST`:
  - Include `GOOGLE_REVIEW_LINK` (short URL, config) and optionally `YELP_REVIEW_LINK` (config)
  - Personalized: `{{client_name}}`, `{{service_type}}`, `{{business_name}}`
- If `SEND_REVIEW_REQUEST_EMAIL = true` (config): also send email using `EMAIL_TEMPLATE_REVIEW_REQUEST`
- Log: `{ event: "review_request_sent_1", job_id, client_email, client_phone, timestamp }`
- Set `review_request_status = "request_1_sent"`

**Step 4 — Monitor for Review Submission**
- Run `REVIEW_POLL_INTERVAL_MINUTES` polling loop
- If new review from matching email or reviewer name detected within `REVIEW_DETECTION_WINDOW_HOURS` (config, default 96h):
  - Set `review_request_status = "review_received"`
  - Cancel any pending follow-up
  - Route to Branch A, Step 1

**Step 5 — Send Follow-Up Request (if enabled)**
- If `SEND_REVIEW_FOLLOWUP = true` and no review detected after `REVIEW_REQUEST_FOLLOWUP_HOURS`:
  - Send follow-up SMS using `SMS_TEMPLATE_REVIEW_FOLLOWUP`
  - This is the final outreach — do not send more than 2 review request messages per job
- Log: `{ event: "review_request_sent_2", job_id, client_email, client_phone, timestamp }`

---

## Configuration Variables (Per Client)

### Workflow Logic Variables
| Variable | Type | Description | Default |
|---|---|---|---|
| `POSITIVE_REVIEW_THRESHOLD` | integer (1-5) | Min stars to classify as positive | `4` |
| `NEGATIVE_REVIEW_THRESHOLD` | integer (1-5) | Max stars to classify as negative | `2` |
| `AUTO_POST_POSITIVE_RESPONSES` | boolean | Auto-post responses to positive Google reviews | `true` |
| `NOTIFY_ON_POSITIVE` | boolean | Send immediate email notification for positive reviews | `false` |
| `NEGATIVE_REVIEW_RESPONSE_SLA_HOURS` | integer | Hours before escalation reminder for unapproved negative response | `24` |
| `REVIEW_POLL_INTERVAL_MINUTES` | integer | How often to check for new reviews | `30` |
| `REVIEW_REQUEST_DELAY_HOURS` | integer | Hours after job close before first review request | `4` |
| `SEND_REVIEW_FOLLOWUP` | boolean | Whether to send a second review request | `true` |
| `REVIEW_REQUEST_FOLLOWUP_HOURS` | integer | Hours after first request before follow-up | `72` |
| `SEND_REVIEW_REQUEST_EMAIL` | boolean | Send email review request in addition to SMS | `false` |
| `REVIEW_LOOKBACK_DAYS` | integer | Days back to check if client already reviewed | `180` |
| `REVIEW_DETECTION_WINDOW_HOURS` | integer | Window after request to attribute a review to a job | `96` |
| `SUPPRESSION_LIST` | array of emails | Clients to exclude from review request sequences | `[]` |

### Output Content Variables
| Variable | Type | Description |
|---|---|---|
| `BUSINESS_NAME` | string | Used in all templates |
| `owner_email` | string | Receives negative review alerts and digest |
| `owner_phone` | string | Receives immediate SMS alerts for negative reviews |
| `ESCALATION_EMAIL` | string (optional) | Secondary recipient for unapproved negative review escalations |
| `owner_first_name` | string | Used in review response sign-offs |
| `GOOGLE_BUSINESS_LOCATION_ID` | string | Full resource name: `accounts/{accountId}/locations/{locationId}` |
| `YELP_BUSINESS_ID` | string | Yelp business alias or ID for Fusion API |
| `GOOGLE_REVIEW_LINK` | string (URL) | Short link directly to Google review submission |
| `YELP_REVIEW_LINK` | string (URL, optional) | Short link to Yelp review page |
| `RESPONSE_TEMPLATE_POSITIVE` | string (template) | Default positive review response |
| `POSITIVE_RESPONSE_VARIANTS` | array of strings | Rotating positive response templates (min 5 recommended) |
| `RESPONSE_TEMPLATE_POSITIVE_NO_COMMENT` | string (template) | Response for star-only positive reviews |
| `RESPONSE_TEMPLATE_NEUTRAL` | string (template) | Response for 3-star reviews |
| `RESPONSE_TEMPLATE_NEGATIVE` | string (template) | Draft for negative review response (human-approved before posting) |
| `SMS_TEMPLATE_REVIEW_REQUEST` | string (template) | First review request SMS |
| `SMS_TEMPLATE_REVIEW_FOLLOWUP` | string (template) | Follow-up review request SMS |
| `EMAIL_TEMPLATE_REVIEW_REQUEST` | string (template) | Review request email (if enabled) |
| `DIGEST_TIME` | time (HH:MM) | Time of day for weekly digest delivery |

---

## What's Standardized vs. What's Configured

### Standardized (Workflow Engine)
- Google Business Profile and Yelp polling loop with deduplication via state store
- Review classification logic (star rating thresholds applied to config values)
- Response rotation logic (prevents duplicate responses)
- Approval workflow: email-based APPROVE command parsing and API post trigger
- Escalation timer: SLA countdown for unapproved negative reviews
- Job close payload ingestion schema
- Review request sequencing (2-message max, cancellation on review detected)
- Suppression list checking
- Review attribution logic (matching new reviews to jobs within detection window)
- All logging and metrics calculation
- Report generation templates

### Configured Per Client
- All variables above
- Google Business Profile OAuth credentials
- Yelp Fusion API key and business ID
- All message and response templates
- Thresholds, delays, and boolean feature flags
- Suppression list

---

## Client Deliverables

### What the Client Gets
1. **Automated review monitoring** — every new Google and Yelp review tracked in real time
2. **Auto-posted responses on Google** for positive reviews (no client involvement required)
3. **Yelp response drafts** delivered ready to copy-paste (Yelp API limitation)
4. **Negative review alert** — SMS + email within minutes of posting, with a drafted response awaiting approval
5. **Review request automation** — every closed job triggers a timed, personalized review ask via SMS
6. **Weekly review performance digest**

### What the Client Sees and Interacts With
- Negative review alert emails and SMS (requires their approval action)
- Yelp response draft emails (requires manual posting)
- Weekly digest in their inbox
- Their rising review count and star rating on Google

### What Runs Without Their Involvement
- All Google review polling
- All positive/neutral Google response posting
- All review request SMS sequences after job close
- Follow-up review request (if enabled)
- All logging and metrics tracking
- Weekly report generation and delivery

---

## Monitoring & Reporting

### Metrics Tracked
| Metric | Description |
|---|---|
| `total_google_reviews` | Current total review count on Google |
| `current_google_star_rating` | Current average star rating |
| `total_yelp_reviews` | Current total review count on Yelp |
| `current_yelp_star_rating` | Current average star rating on Yelp |
| `reviews_received_this_week` | New reviews in last 7 days |
| `review_requests_sent_this_week` | Total review request SMS/emails sent |
| `review_conversion_rate` | Reviews received / review requests sent |
| `negative_reviews_this_week` | Count of ≤ threshold reviews |
| `avg_response_time_hours` | Average time from review posted to response posted |
| `responses_auto_posted` | Count of auto-posted positive responses |
| `responses_pending_approval` | Count of negative responses awaiting owner action |
| `escalated_responses` | Count that hit SLA escalation |

### Weekly Report (delivered Monday to `owner_email`)
- Subject: `[Business Name] Review Report — Week of [date]`
- Sections:
  1. Current ratings: Google [X.X] ⭐ ([N] reviews), Yelp [X.X] ⭐ ([N] reviews)
  2. New reviews this week (count, breakdown by star rating)
  3. Review requests sent vs. reviews received (conversion rate)
  4. Negative reviews this week + resolution status
  5. Trend: star rating over last 12 weeks

### Monthly Report
- Star rating trend (12-week rolling chart)
- Review volume trend
- Review conversion rate trend
- Response rate and average response time

### Alerts
| Condition | Alert |
|---|---|
| New review with rating ≤ `NEGATIVE_REVIEW_THRESHOLD` | Immediate SMS to `owner_phone` + email to `owner_email` |
| Negative review response not approved within `NEGATIVE_REVIEW_RESPONSE_SLA_HOURS` | Escalation email to `owner_email` and `ESCALATION_EMAIL` |
| Google Business Profile API authentication error | Alert to `owner_email` + Ember system admin |
| Star rating drops by 0.2 points or more week-over-week | Alert to `owner_email` |
| Zero review requests sent in last 7 days (when jobs are closing) | Alert to `owner_email` — possible job close event integration issue |

---

## Natural Upsell

**Immediate:** Payment & Invoice Automation — the same "job close" event that triggers review requests also needs to trigger invoicing. Client will ask: "Can we send the invoice and the review request at the same time?"

**Within 30 days:** Lead Capture Engine — as Google reviews increase and star rating rises, the client will see more inbound calls and form fills from map pack traffic and will want a system to capture and route those leads.

**Within 60 days:** Advertising (Google Ads + Google Analytics monitoring) — clients who see their organic reputation improving often want to amplify it with paid visibility. This is a natural bridge to performance tracking integrations.

---

---

# System 3: Payment & Invoice Automation

## Quick Reference
- **Trigger:** Job close event from Ops Back Office, or manual invoice creation
- **Core action:** Auto-generate invoice in Stripe or Square, send to client via email/SMS, fire payment reminder sequence for outstanding balances, sync all payments to QuickBooks
- **Branching:** Paid invoices sync to QuickBooks and close the job record; overdue invoices escalate through a reminder sequence and flag to owner; failed payments trigger retry and notification
- **Output feeds into:** Ops Back Office (job financial status); monthly revenue reports to owner
- **Client touchpoint:** Owner reviews overdue account flags; all standard billing flows run autonomously

---

## System Overview

### What Operational Problem It Solves
Most SMBs have a significant accounts receivable gap — work is completed but invoices are sent late, payment reminders are done manually (or not at all), and QuickBooks is updated in batches weeks after the fact. The result is cash flow lag, forgotten follow-ups on overdue balances, and financial records that don't reflect reality. This system makes the billing cycle invisible to the owner: invoice goes out on job close, reminders fire automatically, and QuickBooks stays current without manual entry.

### Why It Matters for SMBs
Cash flow is the number one operational risk for SMBs. Days Sales Outstanding (DSO) — the average time from invoice sent to cash received — directly impacts the owner's ability to pay staff and vendors on time. Automating reminders alone typically reduces DSO by 30-50% for service businesses. Syncing to QuickBooks eliminates the reconciliation backlog that causes tax season chaos.

### How It Connects to EmberBots' Existing Systems
- **Feeds from:** Ops Back Office — job close event with `job_id`, `client_name`, `client_email`, `client_phone`, `service_type`, `line_items` (array), `total_amount`, `job_close_timestamp`
- **Feeds into:** Ops Back Office — payment status (`paid`, `overdue`, `payment_failed`) written back to job record
- **Feeds into:** Reputation & Review Engine — once payment is confirmed, the "job truly closed" event can optionally trigger the review request sequence (config flag: `TRIGGER_REVIEW_ON_PAYMENT`)
- **Feeds into:** Follow-Up Assistant — overdue accounts can optionally be routed to a collections-tone follow-up sequence after `COLLECTIONS_ESCALATION_DAYS` (config)

---

## Required Connectors

### Primary
| Connector | Role in This System |
|---|---|
| **Stripe or Square** | Create and send invoices; process payments; receive payment webhook events (`payment_intent.succeeded`, `invoice.payment_failed`, `invoice.overdue`); issue refunds if needed |
| **QuickBooks** | Create invoice record in QuickBooks on creation; mark invoice as paid on payment; sync customer records; post payment to correct income account |
| **Gmail** | Send invoice notification email; send payment reminder emails; send overdue alert to owner; deliver weekly financial digest |
| **Twilio / Sendblue (SMS)** | Send invoice notification SMS with payment link; send payment reminder SMS; send overdue SMS to client (at owner's discretion via config) |

### Optional
| Connector | Role |
|---|---|
| **Mailchimp / ActiveCampaign** | Suppress invoiced clients from marketing sequences until payment clears |

---

## Trigger Events

### Real-Time Triggers
1. **Job close event from Ops Back Office** — `event_type: job_closed`, payload includes `line_items`, `total_amount`
2. **Manual invoice creation trigger** — owner initiates via EmberBots dashboard (provides `client_email`, `line_items`, `total_amount` manually)
3. **Stripe/Square webhook: `invoice.payment_succeeded`** — payment received
4. **Stripe/Square webhook: `invoice.payment_failed`** — payment attempt failed
5. **Stripe/Square webhook: `customer.subscription.deleted`** (if recurring billing enabled) — subscription cancelled
6. **QuickBooks webhook: `Invoice.Update`** (optional) — catch manual QuickBooks edits

### Scheduled Triggers
| Schedule | Action |
|---|---|
| **T+`PAYMENT_REMINDER_1_DAYS` days after invoice sent** (config, default 3 days) | Send Reminder 1 if unpaid |
| **T+`PAYMENT_REMINDER_2_DAYS` days after invoice sent** (config, default 7 days) | Send Reminder 2 if unpaid |
| **T+`PAYMENT_REMINDER_3_DAYS` days after invoice sent** (config, default 14 days) | Send Reminder 3 + owner overdue alert |
| **T+`COLLECTIONS_ESCALATION_DAYS` days after invoice sent** (config, default 30 days) | Flag as overdue, alert owner, optionally hand to Follow-Up Assistant |
| **Daily at `DIGEST_TIME`** | Check for newly overdue invoices and include in daily financial summary |
| **Weekly Monday at `DIGEST_TIME`** | Send weekly revenue and AR summary to `owner_email` |

---

## Workflow Logic (Step-by-Step)

### Branch A: Job Close → Invoice Creation and Delivery

**Step 1 — Receive Job Close Payload**
- Input: `job_id`, `client_name`, `client_email`, `client_phone`, `service_type`, `line_items[]` (each: `description`, `quantity`, `unit_price`), `total_amount`, `job_close_timestamp`
- Validate: confirm `total_amount > 0`, `client_email` is valid format
- Check `INVOICE_MODE` config:
  - `"auto"` → proceed immediately
  - `"review_required"` → send draft to `owner_email` for approval before sending to client; pause here until approval received

**Step 2 — Create Invoice in Stripe or Square**
- **If Stripe:**
  - Check if customer exists: `GET /v1/customers?email={client_email}`
  - If no match: `POST /v1/customers` with `email`, `name = client_name`, `phone = client_phone`, `metadata: { job_id, source: "emberbots" }`
  - Create invoice items: `POST /v1/invoiceitems` for each line item in `line_items[]`
  - Create invoice: `POST /v1/invoices` with `customer`, `collection_method = "send_invoice"`, `days_until_due = INVOICE_DUE_DAYS` (config), `metadata: { job_id, service_type }`
  - Finalize: `POST /v1/invoices/{id}/finalize`
  - Send: `POST /v1/invoices/{id}/send`
  - Store: `invoice_id`, `invoice_url`, `hosted_invoice_url`, `due_date`
- **If Square:**
  - Check/create customer via `POST /v2/customers`
  - Create order: `POST /v2/orders` with line items
  - Create invoice: `POST /v2/invoices` with `delivery_method = "EMAIL"`, `due_date = job_close_date + INVOICE_DUE_DAYS`
  - Publish invoice: `POST /v2/invoices/{id}/publish`
  - Store: `invoice_id`, `invoice_url`, `due_date`

**Step 3 — Sync Invoice to QuickBooks**
- Check/create customer in QuickBooks: `GET /v3/company/{realmId}/query?query=SELECT * FROM Customer WHERE PrimaryEmailAddr = '{client_email}'`
- If no match: `POST /v3/company/{realmId}/customer` with name, email, phone
- Create invoice in QuickBooks: `POST /v3/company/{realmId}/invoice` with:
  - `CustomerRef.value = QB_customer_id`
  - `Line[]` for each line item, mapped to `QUICKBOOKS_INCOME_ACCOUNT_ID` (config)
  - `DueDate = due_date`
  - `DocNumber = invoice_id` (using payment processor ID as reference)
- Log: `{ event: "invoice_created_qb", job_id, qb_invoice_id, stripe_or_square_invoice_id }`

**Step 4 — Send Invoice Notification**
- Send email via Gmail using `EMAIL_TEMPLATE_INVOICE`:
  - Include: invoice amount, due date, payment link (`hosted_invoice_url`), itemized summary, `INVOICE_FOOTER_NOTE` (config, e.g., payment terms, bank transfer info if applicable)
  - Subject: `INVOICE_EMAIL_SUBJECT` (config, default: "Invoice from [Business Name] — Due [due_date]")
- Send SMS via Twilio using `SMS_TEMPLATE_INVOICE_NOTIFICATION`:
  - Short form: "Hi [client_name], your invoice for [service_type] is ready. Total: $[amount]. Pay here: [short_payment_url]. Due [due_date]."
- Log: `{ event: "invoice_sent", invoice_id, client_email, total_amount, due_date, timestamp }`
- Set `invoice_status = "sent"`

**Step 5 — Payment Reminder Sequence**
- Schedule reminders at `PAYMENT_REMINDER_1_DAYS`, `PAYMENT_REMINDER_2_DAYS`, `PAYMENT_REMINDER_3_DAYS` after invoice sent
- Before each reminder fires: check current `invoice_status` from Stripe/Square:
  - If `paid` → cancel all remaining reminders, proceed to Step 6
  - If `void` or `uncollectible` → cancel all reminders, log
  - If `open` (still unpaid) → send reminder

*Reminder 1 (friendly):*
- Email: `EMAIL_TEMPLATE_REMINDER_1` — tone: friendly, subject "Reminder: Your invoice is due [date]"
- SMS: `SMS_TEMPLATE_REMINDER_1`

*Reminder 2 (firm):*
- Email: `EMAIL_TEMPLATE_REMINDER_2` — tone: direct, subject "Payment Due: [Business Name] Invoice"
- SMS: `SMS_TEMPLATE_REMINDER_2`

*Reminder 3 (urgent) + owner alert:*
- Email to client: `EMAIL_TEMPLATE_REMINDER_3` — tone: urgent, mentions potential late fee if `LATE_FEE_ENABLED = true` (config)
- SMS to client: `SMS_TEMPLATE_REMINDER_3`
- Email alert to `owner_email`: "Invoice overdue: [client_name] — $[amount] — [days] days past due"
- SMS alert to `owner_phone`: "Overdue invoice: [client_name] $[amount] — [days] days"

**Step 6 — Payment Received**
- Stripe/Square webhook fires `invoice.payment_succeeded`
- Extract: `invoice_id`, `amount_paid`, `payment_intent_id`, `payment_method_type`
- Update QuickBooks: `POST /v3/company/{realmId}/payment` with:
  - `CustomerRef.value = QB_customer_id`
  - `TotalAmt = amount_paid`
  - `Line[].LinkedTxn[].TxnId = qb_invoice_id` (marks invoice as paid)
  - `PaymentMethodRef` mapped from `QUICKBOOKS_PAYMENT_METHOD_MAP` (config: maps "card" → QB payment method ID, "ach" → QB payment method ID)
  - `DepositToAccountRef.value = QUICKBOOKS_DEPOSIT_ACCOUNT_ID` (config)
- Set `invoice_status = "paid"` in internal state
- Write back to Ops Back Office: `{ job_id, payment_status: "paid", amount_paid, payment_timestamp }`
- If `TRIGGER_REVIEW_ON_PAYMENT = true` (config): fire review request trigger to Reputation & Review Engine
- Cancel all pending reminder scheduled tasks for this invoice
- Send payment receipt email to `client_email` using `EMAIL_TEMPLATE_RECEIPT` (if `SEND_RECEIPT = true` config)
- Log: `{ event: "payment_received", invoice_id, amount_paid, payment_method_type, qb_sync_status: "success" }`

**Step 7 — Overdue Escalation**
- If `invoice_status = "open"` at `COLLECTIONS_ESCALATION_DAYS` after invoice sent:
  - Set `invoice_status = "overdue"` in state store and in QuickBooks (update invoice status)
  - Send escalation alert to `owner_email`: full account summary, days outstanding, link to invoice in Stripe/Square
  - If `ESCALATE_TO_FOLLOW_UP = true` (config): pass payload to Follow-Up Assistant with `follow_up_type = "collections"`, `client_email`, `client_phone`, `amount_due`, `invoice_url`
  - If `ESCALATE_TO_FOLLOW_UP = false`: no further automated outreach; owner handles manually

### Branch B: Payment Failure

**Step 1 — Payment Failure Webhook**
- Stripe/Square fires `invoice.payment_failed`
- Extract: `invoice_id`, `failure_reason` (e.g., `card_declined`, `insufficient_funds`, `expired_card`)

**Step 2 — Notify Client**
- Send email using `EMAIL_TEMPLATE_PAYMENT_FAILED`:
  - Include failure message (human-readable), link to update payment method or retry
  - Subject: "Payment unsuccessful — action required"
- Send SMS using `SMS_TEMPLATE_PAYMENT_FAILED`

**Step 3 — Notify Owner**
- Send alert to `owner_email`: "Payment failed for [client_name] — $[amount]. Reason: [failure_reason]"
- Log: `{ event: "payment_failed", invoice_id, failure_reason, timestamp }`

**Step 4 — Retry Logic**
- If `AUTO_RETRY_PAYMENT = true` (config) and failure_reason is NOT `card_declined` (to avoid repeated declines):
  - Schedule retry at T+`PAYMENT_RETRY_HOURS` hours (config, default 24h)
  - Maximum `MAX_PAYMENT_RETRIES` attempts (config, default 2)
  - If all retries fail: set `invoice_status = "payment_failed"`, escalate to owner, enter overdue sequence

---

## Configuration Variables (Per Client)

### Workflow Logic Variables
| Variable | Type | Description | Default |
|---|---|---|---|
| `PAYMENT_PROCESSOR` | enum | `"stripe"` or `"square"` | required |
| `INVOICE_MODE` | enum | `"auto"` or `"review_required"` | `"auto"` |
| `INVOICE_DUE_DAYS` | integer | Days from invoice creation to due date | `14` |
| `PAYMENT_REMINDER_1_DAYS` | integer | Days after send for Reminder 1 | `3` |
| `PAYMENT_REMINDER_2_DAYS` | integer | Days after send for Reminder 2 | `7` |
| `PAYMENT_REMINDER_3_DAYS` | integer | Days after send for Reminder 3 | `14` |
| `COLLECTIONS_ESCALATION_DAYS` | integer | Days after send before "overdue" flag | `30` |
| `ESCALATE_TO_FOLLOW_UP` | boolean | Route overdue accounts to Follow-Up Assistant | `false` |
| `LATE_FEE_ENABLED` | boolean | Mention late fee in Reminder 3 | `false` |
| `LATE_FEE_AMOUNT` | decimal | Dollar amount of late fee (if enabled) | `0` |
| `AUTO_RETRY_PAYMENT` | boolean | Auto-retry failed payments | `true` |
| `PAYMENT_RETRY_HOURS` | integer | Hours between payment retry attempts | `24` |
| `MAX_PAYMENT_RETRIES` | integer | Maximum auto-retry attempts | `2` |
| `SEND_RECEIPT` | boolean | Send payment receipt email on success | `true` |
| `TRIGGER_REVIEW_ON_PAYMENT` | boolean | Trigger review request when payment received | `false` |

### Output Content Variables
| Variable | Type | Description |
|---|---|---|
| `BUSINESS_NAME` | string | Used in all templates |
| `owner_email` | string | Receives overdue alerts and weekly digest |
| `owner_phone` | string | Receives SMS overdue alerts |
| `sender_email` | string | Gmail From address |
| `INVOICE_EMAIL_SUBJECT` | string | Subject line for initial invoice email |
| `INVOICE_FOOTER_NOTE` | string | Payment terms, late fee policy, bank transfer instructions |
| `QUICKBOOKS_INCOME_ACCOUNT_ID` | string | QB account ID for posting income line items |
| `QUICKBOOKS_DEPOSIT_ACCOUNT_ID` | string | QB account ID for deposit (typically checking account) |
| `QUICKBOOKS_PAYMENT_METHOD_MAP` | JSON object | Maps processor payment method types to QB payment method IDs |
| `STRIPE_SECRET_KEY` / `SQUARE_ACCESS_TOKEN` | string | Payment processor credentials (stored in secrets vault) |
| `QUICKBOOKS_REALM_ID` | string | QuickBooks company ID |
| `EMAIL_TEMPLATE_INVOICE` | string (template) | Initial invoice delivery email |
| `EMAIL_TEMPLATE_REMINDER_1` | string (template) | Reminder 1 email |
| `EMAIL_TEMPLATE_REMINDER_2` | string (template) | Reminder 2 email |
| `EMAIL_TEMPLATE_REMINDER_3` | string (template) | Reminder 3 email |
| `EMAIL_TEMPLATE_PAYMENT_FAILED` | string (template) | Payment failure email |
| `EMAIL_TEMPLATE_RECEIPT` | string (template) | Payment receipt email |
| `SMS_TEMPLATE_INVOICE_NOTIFICATION` | string (template) | Invoice notification SMS |
| `SMS_TEMPLATE_REMINDER_1` | string (template) | Reminder 1 SMS |
| `SMS_TEMPLATE_REMINDER_2` | string (template) | Reminder 2 SMS |
| `SMS_TEMPLATE_REMINDER_3` | string (template) | Reminder 3 SMS |
| `SMS_TEMPLATE_PAYMENT_FAILED` | string (template) | Payment failure SMS |
| `DIGEST_TIME` | time (HH:MM) | Time for daily/weekly report delivery |

---

## What's Standardized vs. What's Configured

### Standardized (Workflow Engine)
- Stripe and Square invoice creation, finalization, and send API calls
- Payment webhook receiver and event router (`payment_succeeded`, `payment_failed`)
- QuickBooks customer lookup/create logic and invoice sync
- QuickBooks payment posting with line-item linkage
- Reminder scheduler: interval logic, pre-fire status check, and auto-cancellation on payment
- Payment failure retry scheduler with maximum attempts enforcement
- Overdue escalation timer and status update
- All logging and state tracking
- `invoice_status` state machine and valid transitions
- Error handling: API retry logic (3 attempts, exponential backoff), QuickBooks sync failure dead-letter queue with retry
- Report generation

### Configured Per Client
- All variables in the Configuration Variables tables above
- Payment processor selection (Stripe vs. Square) and credentials
- QuickBooks credentials and account mappings
- Gmail OAuth and sender identity
- Twilio number and credentials
- All message templates and email subjects
- Invoice due days, reminder intervals, escalation thresholds
- Feature flags (LATE_FEE_ENABLED, SEND_RECEIPT, TRIGGER_REVIEW_ON_PAYMENT, etc.)

---

## Client Deliverables

### What the Client Gets
1. **Automatic invoice creation and delivery** on every job close — no manual invoicing
2. **Tiered payment reminder sequence** — 3 reminders before owner is alerted
3. **Real-time QuickBooks sync** — every invoice and payment posted automatically
4. **Overdue account dashboard** — flagged accounts listed in weekly digest
5. **Payment failure alerts** — immediate notification with client-facing resolution email auto-sent
6. **Weekly revenue and AR summary** delivered to owner inbox

### What the Client Sees and Interacts With
- Weekly financial digest email (AR summary, this week's revenue, overdue flags)
- Overdue account alerts (requires their decision: escalate, write off, or call client)
- `review_required` mode: invoice draft for approval before sending (if configured)
- Their QuickBooks account staying current without data entry

### What Runs Without Their Involvement
- Invoice creation and delivery (in `auto` mode)
- All payment reminder sequences (Reminders 1, 2, 3)
- QuickBooks sync on invoice creation and payment receipt
- Payment failure detection and client notification
- Payment retry scheduling
- Receipt delivery
- All logging and state tracking
- Report generation and delivery

---

## Monitoring & Reporting

### Metrics Tracked
| Metric | Description |
|---|---|
| `invoices_created_this_week` | Total invoices generated |
| `invoices_paid_this_week` | Invoices paid |
| `revenue_collected_this_week` | Dollar total of paid invoices |
| `invoices_outstanding` | Open invoices not yet due |
| `invoices_overdue` | Invoices past due date |
| `total_ar_balance` | Sum of all outstanding invoice amounts |
| `avg_days_to_payment` | Days from invoice sent to payment received |
| `payment_failure_rate` | % of payment attempts that failed |
| `reminder_effectiveness_rate` | % of unpaid invoices paid after Reminder 1 / 2 / 3 (tracked separately) |
| `qb_sync_success_rate` | % of invoices/payments successfully synced to QuickBooks |

### Weekly Report (delivered Monday to `owner_email`)
- Subject: `[Business Name] Financial Summary — Week of [date]`
- Sections:
  1. Revenue collected this week: $[amount] ([N] invoices)
  2. Outstanding invoices: $[total] across [N] invoices
  3. Overdue invoices: $[total] across [N] invoices (list with client name, days overdue, amount)
  4. Payment failures this week (if any)
  5. QuickBooks sync status
  6. Trend: weekly revenue over last 8 weeks

### Monthly Report
- Monthly revenue total and trend (12-month rolling if data available)
- DSO (Days Sales Outstanding) trend
- AR aging buckets: Current / 1-30 days / 31-60 days / 60+ days
- Overdue account list with recommended actions
- Payment method breakdown (card vs. ACH vs. other)

### Alerts
| Condition | Alert |
|---|---|
| Invoice payment fails | Immediate email + SMS to owner |
| Invoice reaches Reminder 3 threshold (14 days unpaid) | Email + SMS to owner |
| Invoice reaches `COLLECTIONS_ESCALATION_DAYS` | Escalation email to owner |
| QuickBooks sync failure | Alert to `owner_email` + Ember system admin; retry queued |
| Total AR balance exceeds `AR_ALERT_THRESHOLD` (config, optional) | Alert to `owner_email` |
| Stripe/Square API authentication error | Immediate alert to `owner_email` + Ember system admin |

---

## Natural Upsell

**Immediate:** Reputation & Review Engine — once the client sees that payment receipt confirmation is automated, they immediately ask "can we also send a review request right after they pay?" This is a single config flag toggle away, making it the easiest close in the EmberBots product line.

**Within 30 days:** AI Front Desk — with payments flowing and financial records clean, the owner surfaces their next bottleneck: inbound calls and inquiry handling. The financial clarity from this system also makes the ROI conversation for the AI Front Desk much easier.

**Within 60 days:** Lead Capture Engine + Google Ads monitoring — a client with clean financials who now sees revenue per job clearly will want to track which marketing channels are generating the best-paying customers. This is the entry point for the full EmberBots stack.

---

---

# Implementation Sequencing

## Core Principle
Deploy systems in the order that delivers visible, measurable value fastest — starting with the client's most painful bottleneck, not the most complex system.

## Which System to Deploy First for a New Client

**Default first system: Appointment Booking System**

Most new clients come to EmberBots because they're losing leads or spending hours on scheduling. The Appointment Booking System slots between the Lead Capture Engine (which new clients often already have some version of, even if manual) and the Follow-Up Assistant. It produces visible results within 48 hours of deployment — leads get immediate booking confirmations, the owner sees calendar events populating without any effort, and no-show recovery is visibly working within the first week.

**Exception — deploy Reputation & Review Engine first** if:
- Client's Google star rating is below 4.0 (organic lead flow is actively suppressed)
- Client has recent unanswered negative reviews causing visible reputation damage
- Client operates in a market where Yelp or Google Maps is the primary lead source

**Exception — deploy Payment & Invoice Automation first** if:
- Client reports significant AR problems (>30 days average DSO, multiple overdue accounts)
- Client is currently using paper invoices or spreadsheets
- Cash flow is a stated operational emergency

---

## 30-60-90 Day Rollout Plan (New Client, Full Stack)

### Pre-Onboarding (Days 0-3)
- **Day 0:** Kickoff call — establish `BUSINESS_TIMEZONE`, `owner_email`, `owner_phone`, `BUSINESS_HOURS_START/END`, `BUSINESS_NAME`, `BUSINESS_ADDRESS`
- **Day 1:** Collect credentials: Calendly/Cal.com account, Gmail OAuth, Twilio number, payment processor, QuickBooks, Google Business Profile, Yelp Fusion key
- **Day 2:** Configure and test AI Front Desk (if deploying) and Lead Capture Engine (if deploying) — these are prerequisites for Appointment Booking
- **Day 3:** Verify all connector authentications; confirm webhook endpoints active; test with a dummy lead payload end-to-end

---

### Days 1-30: Foundation Layer

**Week 1: Appointment Booking System**
- Configure all variables; set up Calendly event types and connect to system
- Deploy booking link in client's existing lead form and/or AI Front Desk
- Run end-to-end test: submit dummy lead → booking link sent → confirm booking → verify calendar event created → verify confirmation SMS/email sent
- Set `BOOKING_MODE = "auto_offer_link"` for first 2 weeks while client reviews results
- Deliver first daily digest after 24 hours

**Week 2: Appointment Booking — Tune and Monitor**
- Review first week's metrics with client: bookings created, show rate, no-show recovery rate
- Adjust `REVIEW_REQUEST_DELAY_HOURS`, `BUSINESS_HOURS`, `BLOCKED_DAYS` based on real schedule patterns
- If client is comfortable: switch `BOOKING_MODE = "auto_book_first_available"` for highest-intent leads
- Confirm Follow-Up Assistant is receiving handoff payloads correctly

**Weeks 3-4: AI Front Desk + Lead Capture Engine Polish**
- Ensure AI Front Desk is routing booking intent correctly to Appointment Booking System
- Confirm Lead Capture Engine → Appointment Booking handoff is reliable (check `avg_lead_to_booking_time_minutes` metric — target: < 5 minutes)
- First weekly booking summary report delivered at Day 7; review with client at Day 30 check-in

**Day 30 Deliverable:**
- Appointment Booking System fully operational
- First weekly report reviewed with client
- Show rate baseline established
- No-show recovery sequence confirmed active

---

### Days 31-60: Revenue & Reputation

**Week 5: Payment & Invoice Automation**
- Configure Stripe or Square + QuickBooks integration; map income accounts and payment methods
- Set `INVOICE_MODE = "review_required"` for first 10 invoices — owner approves each to build confidence
- Deploy end-to-end test: trigger job_closed event → invoice created → verify in Stripe/Square → verify QuickBooks sync → confirm email + SMS delivery
- Switch to `INVOICE_MODE = "auto"` after client approves 10 consecutive invoices without changes

**Week 6: Payment & Invoice — Activate Reminders**
- Confirm reminder sequence timing with client (adjust `PAYMENT_REMINDER_X_DAYS` to match their industry norms)
- Enable `TRIGGER_REVIEW_ON_PAYMENT = true` so payment confirmation doubles as the cleanest moment to request a review
- First weekly financial summary delivered; review AR snapshot with client

**Week 7: Reputation & Review Engine**
- Configure Google Business Profile and Yelp Fusion connections
- Set up 5+ `POSITIVE_RESPONSE_VARIANTS` — write these with client's voice
- Write `RESPONSE_TEMPLATE_NEGATIVE` — this requires client input on tone and escalation preference
- Deploy and test: manually leave a test review → confirm poll detects it → confirm draft is generated → confirm correct routing (positive auto-post vs. negative to approval queue)
- Activate review request SMS sequence; connect to `job_closed` event (same trigger as invoicing)

**Week 8: Reputation & Review Engine — Monitor First Results**
- Confirm first real review requests are being sent post-job close
- Verify negative review alert path with client (test with a low-star review if possible)
- Establish baseline: current Google star rating and review count on record

**Day 60 Deliverable:**
- All 3 new systems operational and generating data
- Payment & Invoice live with QuickBooks sync confirmed
- Review request sequence firing on job close
- Client receives three separate weekly reports (can optionally be consolidated into one digest — future enhancement)

---

### Days 61-90: Optimization and Full Stack Integration

**Week 9-10: Cross-System Integration Audit**
- Verify data flow across all 7 systems: Lead Capture → AI Front Desk → Appointment Booking → Ops Back Office → (Invoice Automation + Review Engine) → Follow-Up Assistant
- Check for any payload schema mismatches or dropped events between systems
- Review `avg_lead_to_booking_time_minutes`, `show_rate`, `DSO`, `current_google_star_rating` against Day 0 baselines
- Identify highest-volume drop-off point and address

**Week 11: Reporting Consolidation**
- Optionally consolidate three system reports into one unified weekly "EmberBots Performance Digest" covering: leads, bookings, revenue, AR, reviews
- This is the deliverable that demonstrates the full stack value to the client and is the primary retention/upsell tool

**Week 12: 90-Day Review and Next-Quarter Planning**
- Pull 90-day baseline metrics across all systems
- Present client with ROI summary: hours saved per week (scheduling, invoicing, review management), estimated revenue impact (no-show recovery, DSO reduction, review-driven lead increase)
- Identify next optimization opportunities: Google Ads integration (Search Console + Analytics), Mailchimp/ActiveCampaign for seasonal campaigns, or Follow-Up Assistant sequence expansion

**Day 90 Deliverable:**
- Full EmberBots stack operational
- 90-day performance baseline established
- Client has a consolidated weekly performance digest
- Documented ROI case study ready for EmberBots sales use

---

## System Dependency Map

```
Google Ads / Search Console (optional analytics layer)
          ↑
Lead Capture Engine  ──→  AI Front Desk
          ↓
Appointment Booking System
          ↓
Ops Back Office
     ↙         ↘
Invoice Auto.  Review Engine
     ↓               ↓
QuickBooks     Google Profile / Yelp
     
All systems → Follow-Up Assistant (recovery and re-engagement)
```

---

*Document maintained by EmberBots Ops Team. Update version number on any schema, logic, or connector changes. All Cinder/Computer agent implementations must reference this document for system behavior specifications.*
