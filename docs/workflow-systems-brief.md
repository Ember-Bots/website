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
4. [System 4: Ad & Lead Gen Manager](#system-4-ad--lead-gen-manager)
5. [Implementation Sequencing](#implementation-sequencing)

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

# System 4: Ad & Lead Gen Manager

## Quick Reference
- **Trigger:** Scheduled weekly pull of Google Ads performance data + real-time cost-per-lead threshold breach detected during daily monitoring run; monthly ROI summary on first Monday of month
- **Core action:** Pull campaign/ad group/keyword performance from Google Ads API, join against lead volume data from Lead Capture Engine, calculate cost-per-lead per campaign, deliver digest via Gmail, flag or auto-pause underperforming campaigns
- **Branching:** CPL exceeds `CPL_ALERT_THRESHOLD` → immediate Gmail alert to owner; campaign crosses `AUTOPAUSE_CPL_THRESHOLD` with fewer than `AUTOPAUSE_MIN_LEADS` leads → campaign paused via Google Ads API with owner notification; organic visibility anomalies from Google Search Console → correlated against review volume changes and flagged in digest
- **Output feeds into:** Lead Capture Engine — campaign source, ad group, and keyword attribution tags appended to incoming leads; Reputation & Review Engine — organic visibility trend data surfaced alongside review volume context
- **Client touchpoint:** Owner receives weekly cost-per-lead digest every Monday, immediate alerts when CPL spikes, monthly ROI summary on first Monday; all data pulls, calculations, and campaign pauses run autonomously

---

## System Overview

### What Operational Problem It Solves
SMB owners running Google Ads face a fundamental visibility problem: they see what they spend but not what they get. Google Ads reports clicks and impressions. What it does not report is whether any of those clicks turned into a phone call, a form fill, a booked appointment, or a paying customer. Without closing that loop, ad spend is managed on vanity metrics — cost-per-click, impressions, CTR — that have no reliable relationship to actual business outcomes. Meanwhile, underperforming campaigns and ad groups bleed budget for weeks because nobody has the time to audit them. This system closes the loop between Google Ads spend and real lead outcomes tracked by EmberBots' Lead Capture Engine, gives the owner a plain-language weekly read on whether their ad dollars are working, and automatically removes or pauses campaigns that are burning budget without producing leads.

### Why It Matters for SMBs
For most SMB owners, Google Ads is either their largest or second-largest marketing cost — and the one they understand least. Industry average cost-per-lead for local home service businesses on Google Ads ranges from $30–$120 depending on vertical and market. Without attribution, a business can easily be paying $200+ per lead on specific campaigns while other campaigns deliver at $40, with no visibility into which is which. Identifying and pausing the worst performers alone typically recovers 20–40% of ad spend. For a client spending $2,000/month on Google Ads, that is $400–$800/month recovered — which more than justifies the EmberBots system cost. The weekly digest also gives the owner something they have never had before: a plain-English summary of what their advertising actually produced, without logging into Google Ads.

### How It Connects to EmberBots' Existing Systems
- **Feeds into:** Lead Capture Engine — when a lead arrives, this system ensures the lead record is tagged with `ad_campaign_id`, `ad_group_id`, `keyword`, and `gclid` (Google Click Identifier) from the URL parameters of the landing page; these tags are stored on the lead payload and used to calculate cost-per-lead at the campaign and ad group level
- **Feeds from:** Lead Capture Engine — lead volume data (count of leads by `ad_campaign_id` and `ad_group_id` per time window) is pulled from Lead Capture Engine's state store to calculate CPL per campaign; without this feed, only impression/click data is available
- **Feeds into:** Reputation & Review Engine — organic keyword visibility data from Google Search Console (impressions, clicks, average position for branded and non-branded terms) is included in the monthly ROI summary with a correlation note when review volume has changed significantly, surfacing the relationship between review activity and organic visibility
- **Connected to:** AI Front Desk — if the AI Front Desk uses a tracked phone number (via call tracking integration), inbound call attribution can be tied back to the originating Google Ads campaign by matching `gclid` or UTM parameters; this is an optional enhancement noted in the Configuration Variables

---

## Required Connectors

| Connector | Primary / Optional | Role in This System |
|---|---|---|
| **Google Ads** | Primary | Pull campaign performance data: spend, clicks, impressions, conversions; read campaign and ad group status; pause/enable campaigns and ad groups via mutate API; read keyword performance by ad group |
| **Google Analytics** | Primary | Pull session and goal/conversion data by source/medium/campaign to supplement lead volume where GA4 conversion events are configured; validate that ad traffic is landing on correct pages; pull bounce rate by campaign as a lead quality proxy |
| **Google Search Console** | Primary | Pull organic search impressions, clicks, CTR, and average position by query and page; track branded keyword visibility trend; surface organic performance in monthly ROI summary; flag significant ranking changes |
| **Gmail** | Primary | Deliver weekly cost-per-lead digest to `owner_email`; send real-time CPL alert emails; deliver monthly ROI summary; send campaign auto-pause notifications |
| **Twilio / Sendblue (SMS)** | Optional | Send immediate SMS alert to `owner_phone` when CPL exceeds `CPL_SMS_ALERT_THRESHOLD` (separate, higher threshold from email alert); send auto-pause notification via SMS if `SMS_ALERTS_ENABLED = true` |

---

## Trigger Events

### Real-Time Triggers

| Trigger | Source | Condition |
|---|---|---|
| **New lead payload with `gclid` or UTM source `google` / `cpc`** | Lead Capture Engine | On every new lead captured, system checks for `gclid`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` fields; if present, writes attribution record to `ad_attribution_log` |
| **Daily CPL monitoring run** | Internal scheduler | Runs once daily at `DAILY_MONITOR_TIME` (config); pulls last 7-day rolling spend and lead count per campaign; checks all active campaigns against `CPL_ALERT_THRESHOLD` and `AUTOPAUSE_CPL_THRESHOLD`; checks all active campaigns against `AUTOPAUSE_ZERO_LEADS_DAYS` |

### Scheduled Triggers

| Schedule | Action |
|---|---|
| **Daily at `DAILY_MONITOR_TIME`** (config, default `08:00`) | Pull Google Ads spend and performance data for last 7 days; pull lead count by campaign from Lead Capture Engine; calculate rolling CPL per campaign; check alert and auto-pause thresholds |
| **Weekly Monday at `DIGEST_TIME`** (config, default `07:30`) | Generate and deliver weekly cost-per-lead digest to `owner_email` covering the prior 7 days |
| **First Monday of month at `DIGEST_TIME`** | Generate and deliver monthly ROI summary to `owner_email` covering the prior full calendar month |
| **Hourly (when `REALTIME_SPEND_WATCH = true`)** | Optional: pull `metrics.cost_micros` for all enabled campaigns and alert if single-day spend exceeds `DAILY_BUDGET_ALERT_THRESHOLD` (config) |

---

## Workflow Logic (Step-by-Step)

### Branch A: Weekly Performance Digest

**Step 1 — Pull Google Ads Campaign Performance**
- Issue Google Ads API v18 `GoogleAdsService.SearchStream` request using GAQL query:
  ```sql
  SELECT
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.advertising_channel_type,
    ad_group.id,
    ad_group.name,
    ad_group.status,
    metrics.cost_micros,
    metrics.clicks,
    metrics.impressions,
    metrics.conversions,
    metrics.ctr,
    metrics.average_cpc,
    segments.date
  FROM ad_group
  WHERE segments.date DURING LAST_7_DAYS
    AND campaign.status != 'REMOVED'
    AND ad_group.status != 'REMOVED'
  ```
- Resource: `customers/{GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream`
- Convert `metrics.cost_micros` to dollars: `cost_dollars = metrics.cost_micros / 1_000_000`
- Aggregate by `campaign.id`: sum `cost_dollars`, sum `metrics.clicks`, sum `metrics.impressions`, sum `metrics.conversions`
- Store result set as `campaign_perf[]` in working memory; each record: `{ campaign_id, campaign_name, campaign_status, total_spend, total_clicks, total_impressions, total_conversions, ctr, avg_cpc }`

**Step 2 — Pull Keyword Performance**
- Issue second GAQL query for top keywords by spend:
  ```sql
  SELECT
    campaign.id,
    campaign.name,
    ad_group.id,
    ad_group.name,
    ad_group_criterion.keyword.text,
    ad_group_criterion.keyword.match_type,
    metrics.cost_micros,
    metrics.clicks,
    metrics.impressions,
    metrics.conversions
  FROM keyword_view
  WHERE segments.date DURING LAST_7_DAYS
    AND campaign.status != 'REMOVED'
    AND ad_group_criterion.status != 'REMOVED'
  ORDER BY metrics.cost_micros DESC
  LIMIT 50
  ```
- Store as `keyword_perf[]`: `{ campaign_id, ad_group_id, keyword_text, match_type, cost_dollars, clicks, impressions, conversions }`

**Step 3 — Pull Lead Volume from Lead Capture Engine**
- Query Lead Capture Engine state store for leads captured in last 7 days where `utm_source = "google"` AND (`utm_medium = "cpc"` OR `gclid IS NOT NULL`)
- Group by `utm_campaign` (maps to `campaign.name`) and `utm_content` (maps to `ad_group.name`)
- For leads with `gclid` but no UTM params: attempt campaign match via `ad_attribution_log` where `gclid` was recorded at lead capture time
- Result: `lead_counts_by_campaign[]` — `{ campaign_id_or_name, ad_group_id_or_name, lead_count, lead_ids[] }`
- **Decision:** If Lead Capture Engine returns zero attributed leads for all campaigns:
  - Check whether any leads came in with `utm_source = "google"` but missing `gclid` — if so, log attribution gap: `{ event: "attribution_gap_detected", missing_gclid_count, week_ending }`
  - Flag digest with note: "Some Google leads may be missing UTM parameters — review landing page URL configuration"

**Step 4 — Calculate Cost-Per-Lead per Campaign**
- For each entry in `campaign_perf[]`:
  - Match to `lead_counts_by_campaign[]` by `campaign.id` or `campaign.name`
  - `cpl = total_spend / lead_count` (where `lead_count > 0`)
  - If `lead_count = 0`: set `cpl = null`, flag `zero_leads = true`
  - Store: `{ campaign_id, campaign_name, total_spend, lead_count, cpl, zero_leads }`
- Compute aggregate totals: `total_ad_spend`, `total_attributed_leads`, `blended_cpl = total_ad_spend / total_attributed_leads`
- Compute top keyword CPL: for keywords in `keyword_perf[]`, cross-reference lead attribution records in `ad_attribution_log` where `utm_term` or keyword text matches; calculate `keyword_cpl` where attributable

**Step 5 — Pull Google Analytics Session Data (supplement)**
- GA4 Data API request: `POST https://analyticsdata.googleapis.com/v1beta/properties/{GA4_PROPERTY_ID}:runReport`
  - Dimensions: `sessionDefaultChannelGrouping`, `sessionCampaignName`, `sessionSource`, `sessionMedium`
  - Metrics: `sessions`, `conversions`, `bounceRate`, `averageSessionDuration`
  - DateRange: last 7 days
  - DimensionFilter: `sessionMedium = "cpc"` AND `sessionSource = "google"`
- Join to `campaign_perf[]` on `campaign.name` vs. `sessionCampaignName` (case-insensitive)
- Append `ga_sessions`, `ga_bounce_rate`, `ga_avg_session_duration` to each campaign record
- If `ga_bounce_rate > BOUNCE_RATE_ALERT_THRESHOLD` (config, default `0.75`) for a campaign: flag `high_bounce = true` on that campaign record

**Step 6 — Pull Google Search Console Organic Data**
- Request: `POST https://searchconsole.googleapis.com/webmasters/v3/sites/{SITE_URL}/searchAnalytics/query`
  - Body: `{ "startDate": "[7_days_ago]", "endDate": "[yesterday]", "dimensions": ["query", "page"], "rowLimit": 25 }`
- Extract top 10 queries by clicks; record `{ query, clicks, impressions, ctr, position }`
- Compare to prior 7-day baseline stored in `search_console_baseline` state store:
  - Flag any query where `position` has changed by more than `GSC_POSITION_CHANGE_ALERT` (config, default 5 positions) as a notable organic shift
- Store organic summary: `{ branded_impressions, branded_clicks, non_branded_impressions, non_branded_clicks, top_queries[] }`

**Step 7 — Check Alert and Auto-Pause Thresholds**
- For each campaign record with `cpl IS NOT NULL`:
  - If `cpl > CPL_ALERT_THRESHOLD` (config) AND `total_spend >= MIN_SPEND_FOR_ALERT` (config, default $50): set `alert_flag = true`
- For each campaign record with `zero_leads = true`:
  - If campaign has been running for more than `AUTOPAUSE_ZERO_LEADS_DAYS` (config) with spend > `AUTOPAUSE_MIN_SPEND` (config): set `autopause_candidate = true`
- For each campaign record where `cpl > AUTOPAUSE_CPL_THRESHOLD` (config) AND `lead_count < AUTOPAUSE_MIN_LEADS` (config):
  - Set `autopause_candidate = true`
- If any `alert_flag = true` records exist: trigger Branch B immediately (do not wait for digest)
- If any `autopause_candidate = true` records exist AND `AUTOPAUSE_ENABLED = true` (config): trigger Branch C immediately

**Step 8 — Compose and Send Weekly Digest**
- Compose email using `EMAIL_TEMPLATE_WEEKLY_DIGEST`:
  - **Subject:** `[BUSINESS_NAME] Ad Performance — Week of [week_start_date]`
  - **Section 1 — Summary:** Total spend this week: `$[total_ad_spend]` | Total attributed leads: `[total_attributed_leads]` | Blended CPL: `$[blended_cpl]` | vs. prior week: `+/-X%` (calculated from `digest_history` state store)
  - **Section 2 — Campaign Breakdown:** Table with columns: Campaign Name | Spend | Leads | CPL | Status | 7-Day Trend; rows sorted by spend descending; CPL colored in digest text as `GOOD` (≤ `CPL_TARGET`), `WARNING` (≤ `CPL_ALERT_THRESHOLD`), or `HIGH` (> `CPL_ALERT_THRESHOLD`) based on config thresholds
  - **Section 3 — Top Keywords by Leads:** Top 5 keywords ranked by `lead_count` with CPL per keyword where attributable
  - **Section 4 — Organic Snapshot:** Branded search impressions and clicks this week vs. last week; top 3 non-branded queries by clicks; any significant position changes flagged
  - **Section 5 — Flags:** Any campaigns paused this week (with reason), any attribution gaps detected, any campaigns with `high_bounce = true`
  - **Footer:** Link to Google Ads dashboard + link to GA4 report (static config URLs)
- Send via Gmail API from `sender_email` to `owner_email`
- Log: `{ event: "weekly_digest_sent", week_ending, total_spend, total_leads, blended_cpl, campaigns_flagged, campaigns_paused, timestamp }`
- Write this week's summary to `digest_history` state store for week-over-week comparison

---

### Branch B: Real-Time Cost-Per-Lead Alert

**Trigger:** Step 7 of Branch A sets `alert_flag = true` on one or more campaigns, OR daily monitoring run detects CPL breach mid-week.

**Step 1 — Evaluate Alert Severity**
- For each `alert_flag = true` campaign:
  - `cpl_overage_pct = ((cpl - CPL_ALERT_THRESHOLD) / CPL_ALERT_THRESHOLD) * 100`
  - If `cpl_overage_pct >= 50` (CPL is 1.5x the threshold): `alert_severity = "critical"`
  - If `cpl_overage_pct >= 20`: `alert_severity = "warning"`
  - Otherwise: `alert_severity = "info"`
- Check `alert_suppression` state: if an alert for this `campaign_id` was sent within `ALERT_SUPPRESSION_HOURS` (config, default 48h), skip email for that campaign to prevent alert fatigue; log suppression

**Step 2 — Send Email Alert**
- Compose using `EMAIL_TEMPLATE_CPL_ALERT`:
  - **Subject (critical):** `[BUSINESS_NAME] ALERT: High cost-per-lead on [campaign_name] — $[cpl] vs. $[CPL_ALERT_THRESHOLD] target`
  - **Subject (warning):** `[BUSINESS_NAME] Ad Alert: [campaign_name] CPL above target ($[cpl])`
  - **Body:** Campaign name | Current CPL | CPL target | Spend this period | Leads this period | Days running above threshold | Recommendation (auto-populated based on severity: "Review ad copy and audience targeting" / "Consider pausing this campaign")
  - Include direct deep-link to campaign in Google Ads UI: `https://ads.google.com/aw/campaigns?campaignId={campaign_id}` (where `{campaign_id}` = `campaign.id`)
- Send via Gmail API from `sender_email` to `owner_email`

**Step 3 — Send SMS Alert (if configured)**
- If `SMS_ALERTS_ENABLED = true` AND `alert_severity = "critical"` AND `cpl >= CPL_SMS_ALERT_THRESHOLD` (config, default: 2x `CPL_ALERT_THRESHOLD`):
  - Send via Twilio/Sendblue to `owner_phone`:
    - Body: `"EmberBots Alert: [campaign_name] CPL is $[cpl] (target $[CPL_ALERT_THRESHOLD]). Check your email for details."`
    - Max 160 characters; truncate `campaign_name` to 30 chars if necessary

**Step 4 — Log Alert**
- Write to `alert_log`: `{ event: "cpl_alert_sent", campaign_id, campaign_name, cpl, threshold: CPL_ALERT_THRESHOLD, severity, alert_sent_at, channels: ["email", "sms"] }`
- Write `campaign_id` and `alert_sent_at` to `alert_suppression` state to enforce suppression window

---

### Branch C: Underperforming Campaign Auto-Pause

**Trigger:** Step 7 of Branch A sets `autopause_candidate = true` on one or more campaigns AND `AUTOPAUSE_ENABLED = true`.

**Step 1 — Validate Auto-Pause Conditions**
- For each `autopause_candidate = true` campaign, re-verify the condition is still met at time of execution (in case a lead came in since Step 7):
  - Re-query Lead Capture Engine for leads attributed to `campaign_id` in the last `AUTOPAUSE_LOOKBACK_DAYS` (config, default 7)
  - Re-pull current spend via Google Ads API for the same window
  - Recalculate CPL; if condition no longer met → remove `autopause_candidate` flag, log: `{ event: "autopause_condition_cleared", campaign_id }`
- **Decision:**
  - If `AUTOPAUSE_SCOPE = "campaign"` (config): pause at the `campaign` level
  - If `AUTOPAUSE_SCOPE = "ad_group"` (config): pause at the `ad_group` level only (safer — leaves other ad groups in the campaign running)

**Step 2 — Execute Pause via Google Ads API**
- Google Ads API v18 mutate request:
  - For campaign-level pause:
    ```
    POST customers/{GOOGLE_ADS_CUSTOMER_ID}/campaigns:mutate
    Body: {
      "operations": [{
        "update": {
          "resourceName": "customers/{GOOGLE_ADS_CUSTOMER_ID}/campaigns/{campaign_id}",
          "status": "PAUSED"
        },
        "updateMask": "status"
      }]
    }
    ```
  - For ad group-level pause:
    ```
    POST customers/{GOOGLE_ADS_CUSTOMER_ID}/adGroups:mutate
    Body: {
      "operations": [{
        "update": {
          "resourceName": "customers/{GOOGLE_ADS_CUSTOMER_ID}/adGroups/{ad_group_id}",
          "status": "PAUSED"
        },
        "updateMask": "status"
      }]
    }
    ```
- On API success (HTTP 200 with no `partialFailureError`): record `pause_confirmed = true`
- On API failure: do NOT retry automatically; send alert to `owner_email` + Ember system admin: "Auto-pause failed for [campaign_name] — manual pause required"; log error; do NOT proceed to Step 3

**Step 3 — Notify Owner**
- Compose using `EMAIL_TEMPLATE_AUTOPAUSE_NOTIFICATION`:
  - **Subject:** `[BUSINESS_NAME] — Campaign paused automatically: [campaign_name]`
  - **Body:**
    - Reason for pause: zero leads in `[AUTOPAUSE_ZERO_LEADS_DAYS]` days / CPL of `$[cpl]` exceeded auto-pause threshold of `$[AUTOPAUSE_CPL_THRESHOLD]` with only `[lead_count]` lead(s)
    - Spend consumed before pause: `$[total_spend]`
    - Pause scope: campaign-level or ad group-level
    - Two CTAs: "Resume this campaign" (deep-link to Google Ads) | "Keep paused — I'll review it" (no action required)
    - Note: "This campaign will NOT be re-enabled automatically. You must resume it manually or contact your EmberBots account manager."
- Send via Gmail to `owner_email`
- If `SMS_ALERTS_ENABLED = true`: send SMS to `owner_phone`: `"EmberBots paused your ad campaign '[campaign_name]' — $[total_spend] spent, [lead_count] lead(s). Check email for details."`

**Step 4 — Log Auto-Pause Event**
- Write to `autopause_log`: `{ event: "campaign_auto_paused", campaign_id, campaign_name, ad_group_id (if applicable), pause_scope, reason, spend_at_pause, lead_count_at_pause, cpl_at_pause, pause_timestamp, paused_by: "system" }`
- Update `campaign_perf[]` record: set `campaign_status = "PAUSED_BY_SYSTEM"`
- Include pause event in next weekly digest under "Flags" section

---

### Branch D: Monthly ROI Summary

**Trigger:** First Monday of month at `DIGEST_TIME`.

**Step 1 — Pull Full Prior Month Google Ads Data**
- GAQL query with `segments.date DURING LAST_MONTH`:
  - All fields from Branch A Step 1 query
  - Also pull: `campaign.advertising_channel_type`, `campaign.bidding_strategy_type`, `metrics.search_impression_share`, `metrics.search_top_impression_share`
- Aggregate totals: `monthly_total_spend`, `monthly_total_clicks`, `monthly_total_impressions`
- Compute month-over-month delta vs. `monthly_history` state store entry for prior month

**Step 2 — Pull Monthly Lead Attribution**
- Query Lead Capture Engine state store for all leads in prior calendar month where `utm_source = "google"` AND (`utm_medium = "cpc"` OR `gclid IS NOT NULL`)
- Compute: `monthly_total_attributed_leads`, CPL per campaign for the month, CPL per ad group for the month
- Identify top 3 campaigns by lead count; identify bottom 3 campaigns by CPL efficiency (highest CPL with meaningful spend, defined as spend > `MIN_SPEND_FOR_REPORT`, config default $100)

**Step 3 — Pull Monthly Google Analytics Data**
- GA4 Data API with `dateRange` = prior full calendar month
- Pull: sessions, conversions, bounce rate by campaign; goal/event completions tagged as `LEAD_EVENT_NAME` (config, e.g., `"generate_lead"`, `"form_submit"`, `"phone_call"`)
- Cross-validate: compare GA4 goal completions against Lead Capture Engine lead count; log delta as `attribution_discrepancy` if >20% difference; include discrepancy note in report if present

**Step 4 — Pull Monthly Search Console Data**
- Query for prior calendar month
- Compute: total organic impressions, total organic clicks, average CTR, average position
- Separate branded vs. non-branded queries (branded = queries containing `BRAND_KEYWORDS[]` config array, e.g., `["[business name]", "[owner name]"]`)
- Compare to prior month baseline; compute month-over-month delta for branded impressions and non-branded impressions
- **Decision:** If `INCLUDE_REVIEW_CORRELATION = true` (config):
  - Pull review count added this month from Reputation & Review Engine state store
  - Include correlation note if `google_review_count_delta > 5` AND `branded_impressions_delta > 0`: "Branded search visibility increased [X]% this month — consistent with [N] new Google reviews added"

**Step 5 — Calculate ROI Summary Figures**
- `monthly_cpl_blended = monthly_total_spend / monthly_total_attributed_leads`
- `estimated_revenue_from_ad_leads = monthly_total_attributed_leads * AVG_JOB_VALUE` (config, default: client provides this; required field)
- `estimated_roas = estimated_revenue_from_ad_leads / monthly_total_spend` (Return on Ad Spend)
- `estimated_monthly_profit_from_ads = estimated_revenue_from_ad_leads - monthly_total_spend`
- Flag: if `estimated_roas < ROAS_ALERT_THRESHOLD` (config, default `2.0`): `roas_below_threshold = true`
- Compare `monthly_cpl_blended` to prior 3-month CPL average from `monthly_history`; flag improving or worsening trend

**Step 6 — Compose and Send Monthly ROI Summary**
- Compose using `EMAIL_TEMPLATE_MONTHLY_ROI`:
  - **Subject:** `[BUSINESS_NAME] Monthly Ad ROI Summary — [Month Year]`
  - **Section 1 — Headline Numbers:** Total ad spend | Total attributed leads | Blended CPL | Estimated ROAS | Estimated revenue from ad leads
  - **Section 2 — Campaign Performance Table:** Campaign name | Month spend | Leads | CPL | MoM CPL change | Status (Active / Paused / Paused-by-System)
  - **Section 3 — Top Performing Keywords:** Top 5 keywords by leads this month; CPL per keyword where attributable; match type
  - **Section 4 — Organic Search Summary:** Branded impressions | Non-branded impressions | Total organic clicks | Avg position | MoM deltas; review correlation note if applicable
  - **Section 5 — Budget Efficiency:** Spend on campaigns that produced 0 leads (waste estimate); spend on campaigns below CPL target (efficient spend); spend on campaigns above CPL target (at-risk spend)
  - **Section 6 — Recommendations:** Auto-generated from rule engine:
    - If any campaign has been paused for full month: "Consider reviewing or removing [campaign_name] — paused all month with no leads"
    - If `roas_below_threshold = true`: "Overall ROAS is [X] — below target of [ROAS_ALERT_THRESHOLD]x. Consider reducing budget on highest-CPL campaigns or reviewing ad copy"
    - If top keyword CPL < 50% of blended CPL: "Keyword '[keyword_text]' is delivering leads at $[cpl] — [X]% below your average. Consider increasing bids or budget allocation to this keyword"
  - **Section 7 — YTD Trend (if `YTD_REPORTING = true` config):** Monthly spend and CPL for each month since system start, displayed as table
  - **Footer:** Links to Google Ads, GA4, Search Console dashboards
- Send via Gmail to `owner_email`
- Write monthly summary to `monthly_history` state store: `{ month, total_spend, total_leads, blended_cpl, estimated_roas, campaigns_paused_count }`
- Log: `{ event: "monthly_roi_summary_sent", month, total_spend, total_leads, blended_cpl, timestamp }`

---

## Configuration Variables (Per Client)

### Workflow Logic Variables (affect branching and timing)

| Variable | Type | Description | Default |
|---|---|---|---|
| `CPL_TARGET` | decimal | Owner's target cost-per-lead; used for "GOOD / WARNING / HIGH" classification in digest | required |
| `CPL_ALERT_THRESHOLD` | decimal | CPL at which email alert fires; triggers Branch B | required |
| `CPL_SMS_ALERT_THRESHOLD` | decimal | CPL at which SMS alert fires (should be ≥ `CPL_ALERT_THRESHOLD`) | `2 × CPL_ALERT_THRESHOLD` |
| `AUTOPAUSE_ENABLED` | boolean | Whether system can pause campaigns/ad groups automatically | `false` |
| `AUTOPAUSE_SCOPE` | enum | `"campaign"` or `"ad_group"` — scope of auto-pause action | `"ad_group"` |
| `AUTOPAUSE_CPL_THRESHOLD` | decimal | CPL above which auto-pause is considered (must be set higher than `CPL_ALERT_THRESHOLD`) | `3 × CPL_TARGET` |
| `AUTOPAUSE_MIN_LEADS` | integer | If lead count is below this AND CPL above `AUTOPAUSE_CPL_THRESHOLD`, campaign is auto-pause candidate | `3` |
| `AUTOPAUSE_ZERO_LEADS_DAYS` | integer | Days a campaign can run with zero leads before becoming auto-pause candidate | `7` |
| `AUTOPAUSE_MIN_SPEND` | decimal | Minimum spend (dollars) before auto-pause is considered; prevents pausing $2 test campaigns | `50` |
| `AUTOPAUSE_LOOKBACK_DAYS` | integer | Rolling window for auto-pause evaluation | `7` |
| `ALERT_SUPPRESSION_HOURS` | integer | Hours before repeat alert fires for same campaign | `48` |
| `MIN_SPEND_FOR_ALERT` | decimal | Minimum campaign spend before CPL alert fires | `50` |
| `MIN_SPEND_FOR_REPORT` | decimal | Minimum monthly campaign spend to be included in bottom-3 efficiency ranking | `100` |
| `BOUNCE_RATE_ALERT_THRESHOLD` | decimal | GA4 bounce rate (0.0–1.0) above which `high_bounce` flag is set on campaign | `0.75` |
| `GSC_POSITION_CHANGE_ALERT` | integer | Position change (in ranking positions) that triggers organic shift flag | `5` |
| `ROAS_ALERT_THRESHOLD` | decimal | Return on ad spend below which monthly summary flags ROAS warning | `2.0` |
| `DAILY_MONITOR_TIME` | time (HH:MM) | Time of day for daily CPL monitoring run | `"08:00"` |
| `DIGEST_TIME` | time (HH:MM) | Time of day for weekly and monthly digest delivery | `"07:30"` |
| `BUSINESS_TIMEZONE` | IANA timezone string | e.g., `"America/Denver"` | required |
| `REALTIME_SPEND_WATCH` | boolean | Enable hourly spend monitoring | `false` |
| `DAILY_BUDGET_ALERT_THRESHOLD` | decimal | Single-day spend (dollars) above which immediate alert fires (requires `REALTIME_SPEND_WATCH = true`) | — |
| `SMS_ALERTS_ENABLED` | boolean | Enable SMS alerts for CPL breaches and auto-pauses | `false` |
| `INCLUDE_REVIEW_CORRELATION` | boolean | Include review volume correlation in monthly organic section | `true` |
| `YTD_REPORTING` | boolean | Include year-to-date spend and CPL trend table in monthly summary | `true` |
| `AVG_JOB_VALUE` | decimal | Average revenue per closed job; used to calculate estimated ROAS and monthly ROI | required |
| `LEAD_EVENT_NAME` | string | GA4 event name used as conversion (e.g., `"generate_lead"`, `"form_submit"`) | `"generate_lead"` |

### Output Content Variables

| Variable | Type | Description |
|---|---|---|
| `BUSINESS_NAME` | string | Used in all subject lines and message bodies |
| `owner_email` | string | Recipient for all digests, alerts, and summaries |
| `owner_phone` | string | Recipient for SMS alerts (requires `SMS_ALERTS_ENABLED = true`) |
| `sender_email` | string | Gmail `From` address for all outbound email |
| `GOOGLE_ADS_CUSTOMER_ID` | string | 10-digit Google Ads customer ID (no hyphens), e.g., `"1234567890"` |
| `GA4_PROPERTY_ID` | string | Google Analytics 4 property ID, e.g., `"properties/123456789"` |
| `SITE_URL` | string | Site URL registered in Google Search Console; URL-encoded, e.g., `"sc-domain:example.com"` |
| `BRAND_KEYWORDS` | array of strings | Branded search terms to separate from non-branded in Search Console reporting; e.g., `["acme plumbing", "acme hvac"]` |
| `EMAIL_TEMPLATE_WEEKLY_DIGEST` | string (template) | Weekly CPL digest email body; supports `{{total_spend}}`, `{{total_leads}}`, `{{blended_cpl}}`, `{{campaign_table}}`, `{{organic_snapshot}}`, `{{flags}}` |
| `EMAIL_TEMPLATE_CPL_ALERT` | string (template) | CPL alert email body; supports `{{campaign_name}}`, `{{cpl}}`, `{{CPL_ALERT_THRESHOLD}}`, `{{spend}}`, `{{lead_count}}`, `{{campaign_url}}` |
| `EMAIL_TEMPLATE_AUTOPAUSE_NOTIFICATION` | string (template) | Auto-pause notification email body; supports `{{campaign_name}}`, `{{reason}}`, `{{total_spend}}`, `{{lead_count}}`, `{{cpl}}`, `{{scope}}` |
| `EMAIL_TEMPLATE_MONTHLY_ROI` | string (template) | Monthly ROI summary email body; supports `{{month}}`, `{{total_spend}}`, `{{total_leads}}`, `{{blended_cpl}}`, `{{estimated_roas}}`, `{{campaign_table}}`, `{{organic_summary}}`, `{{recommendations}}` |
| `GOOGLE_ADS_DASHBOARD_URL` | string (URL) | Static deep-link to client's Google Ads campaign view; included in digest footer |
| `GA4_DASHBOARD_URL` | string (URL) | Static deep-link to client's GA4 reports; included in digest footer |
| `SEARCH_CONSOLE_DASHBOARD_URL` | string (URL) | Static deep-link to client's Search Console; included in monthly summary |

---

## What's Standardized vs. What's Configured

### Standardized (Workflow Engine — Same for Every Client)
- Google Ads API v18 GAQL query structure for campaign, ad group, and keyword performance pulls
- `metrics.cost_micros` to dollars conversion (`/ 1_000_000`)
- Lead attribution join logic: matching UTM parameters and `gclid` from Lead Capture Engine state store to Google Ads campaign and ad group IDs
- CPL calculation formula: `total_spend / lead_count` with null guard for zero-lead campaigns
- Alert severity classification logic (info / warning / critical based on CPL overage %)
- Alert suppression window enforcement via `alert_suppression` state
- Auto-pause eligibility evaluation: zero-lead days check, CPL-above-threshold-with-low-lead-count check, minimum spend guard
- Google Ads mutate API call structure for campaign and ad group status updates
- GA4 Data API query structure and session/conversion pull
- Google Search Console query structure and branded/non-branded separation
- Week-over-week and month-over-month delta calculations from state store history
- ROI estimation formula: `monthly_total_attributed_leads × AVG_JOB_VALUE`
- Monthly recommendations rule engine (3 canned rule types: paused campaigns, ROAS below threshold, high-performing keyword)
- Auto-pause irreversibility guarantee: system never re-enables a paused campaign; only the owner can re-enable
- Error handling: API retry logic (3 attempts, exponential backoff) for all Google API calls; dead-letter queue for failed digest delivery with retry at next hourly interval
- State store schema: `campaign_perf[]`, `digest_history`, `monthly_history`, `alert_log`, `alert_suppression`, `autopause_log`, `ad_attribution_log`, `search_console_baseline`
- Logging schema: all events written to `ad_events` log with `client_id`, `event_type`, `timestamp`, and relevant payload

### Configured Per Client
- All variables in the Configuration Variables tables above
- Google Ads OAuth credentials and customer ID
- GA4 OAuth credentials and property ID
- Google Search Console OAuth credentials and site URL
- Gmail OAuth credentials and sender identity
- Twilio phone number and account SID (if SMS enabled)
- CPL target and alert thresholds (set at onboarding, updated quarterly or on request)
- Auto-pause feature flag and scope (off by default; must be explicitly enabled by owner after understanding the behavior)
- `AVG_JOB_VALUE` — owner-provided; EmberBots does not assume this value
- `BRAND_KEYWORDS` array
- All email templates and subject lines
- UTM parameter convention used in landing page URLs (must be verified at onboarding)

---

## Client Deliverables

### What the Client Gets
1. **Weekly cost-per-lead digest** — delivered every Monday morning; plain-English breakdown of what each campaign spent and how many leads it produced, with a clear CPL per campaign and week-over-week comparison
2. **Real-time CPL alert emails** — triggered within hours of a threshold breach; includes direct link to the flagged campaign in Google Ads and a plain-language explanation of the issue
3. **Auto-pause notifications** — immediate email (and optional SMS) when a campaign is paused by the system, with full context: reason, spend consumed, leads produced, and instructions to resume if desired
4. **Monthly ROI summary** — delivered on the first Monday of each month; includes estimated ROAS, estimated revenue from ad leads, budget efficiency breakdown (waste vs. efficient spend), and 3 automated recommendations
5. **Organic search snapshot** — included in weekly digest and monthly summary; shows whether Google organic visibility is improving alongside paid activity, with review volume correlation where applicable

### What the Client Sees and Interacts With
- Weekly digest email in their inbox every Monday (no action required; read-only reporting)
- CPL alert emails when thresholds are breached (owner decides whether to act; system does not require a response)
- Auto-pause notifications (owner must manually re-enable campaigns in Google Ads if they disagree with the pause; system provides direct link)
- Monthly ROI summary with recommendations (owner decides which recommendations to act on)

### What Runs Without Their Involvement
- Daily Google Ads performance data pull and CPL calculation
- Lead attribution join from Lead Capture Engine records
- GA4 session and conversion data pull
- Google Search Console organic data pull and baseline comparison
- Alert threshold evaluation and alert suppression enforcement
- Auto-pause execution (when enabled) — campaign paused in Google Ads without owner action required at time of pause
- All state store writes: digest history, alert log, autopause log, attribution records
- Weekly digest generation and delivery
- Monthly ROI summary generation and delivery
- All logging

---

## Monitoring & Reporting

### Metrics Tracked

| Metric | Description |
|---|---|
| `weekly_total_ad_spend` | Sum of `metrics.cost_micros / 1_000_000` across all active campaigns for the last 7 days |
| `weekly_total_attributed_leads` | Leads from Lead Capture Engine with `utm_source = "google"` and `utm_medium = "cpc"` or `gclid` present, in last 7 days |
| `weekly_blended_cpl` | `weekly_total_ad_spend / weekly_total_attributed_leads` |
| `cpl_by_campaign` | CPL calculated per `campaign.id` for current reporting period |
| `cpl_by_ad_group` | CPL calculated per `ad_group.id` for current reporting period |
| `cpl_by_keyword` | CPL per keyword where lead attribution includes `utm_term` or matching keyword text |
| `campaigns_above_cpl_alert_threshold` | Count of active campaigns where `cpl > CPL_ALERT_THRESHOLD` |
| `campaigns_zero_leads` | Count of active campaigns with zero attributed leads in reporting period |
| `campaigns_auto_paused_this_period` | Count of campaigns paused by system this week or month |
| `total_spend_on_zero_lead_campaigns` | Dollar total wasted on campaigns with no lead attribution |
| `attribution_gap_count` | Leads arriving with `utm_source = "google"` but missing `gclid` and UTM campaign parameters |
| `weekly_organic_branded_impressions` | Google Search Console branded query impressions, last 7 days |
| `weekly_organic_non_branded_impressions` | Google Search Console non-branded query impressions, last 7 days |
| `monthly_estimated_roas` | `(monthly_attributed_leads × AVG_JOB_VALUE) / monthly_total_spend` |
| `monthly_estimated_revenue_from_ads` | `monthly_attributed_leads × AVG_JOB_VALUE` |
| `ga4_bounce_rate_by_campaign` | Bounce rate per campaign from GA4; high bounce campaigns flagged |
| `digest_delivery_success` | Boolean — whether each scheduled digest was delivered without error |

### Alert Conditions

| Condition | Alert Type | Recipient |
|---|---|---|
| `cpl > CPL_ALERT_THRESHOLD` AND `total_spend >= MIN_SPEND_FOR_ALERT` | Email (Branch B); SMS if `alert_severity = "critical"` AND `SMS_ALERTS_ENABLED = true` | `owner_email`, `owner_phone` |
| Campaign auto-paused by system | Email + optional SMS (Branch C) | `owner_email`, `owner_phone` |
| Auto-pause API call fails | Email alert | `owner_email` + Ember system admin |
| `ga4_bounce_rate > BOUNCE_RATE_ALERT_THRESHOLD` on any campaign | Flagged in weekly digest (not a standalone alert) | `owner_email` (via digest) |
| Attribution gap detected: leads with `utm_source = "google"` missing UTM/gclid params | Flagged in weekly digest under "Flags" section | `owner_email` (via digest) |
| `estimated_roas < ROAS_ALERT_THRESHOLD` in monthly summary | Flagged in monthly ROI summary recommendations section | `owner_email` (via monthly summary) |
| Any Google API authentication error (Ads, Analytics, Search Console) | Immediate email | `owner_email` + Ember system admin |
| Weekly digest delivery failure | Retry at next hourly interval; if 3 consecutive failures, alert to Ember system admin | Ember system admin |
| `REALTIME_SPEND_WATCH = true` AND single-day spend > `DAILY_BUDGET_ALERT_THRESHOLD` | Immediate email | `owner_email` |

---

## Natural Upsell

**Immediate:** Lead Capture Engine attribution hardening — at onboarding, this system will almost always surface `attribution_gap_count > 0` within the first week: leads arriving from Google without proper UTM parameters or `gclid`. The fix requires updating landing page URLs and confirming UTM conventions in the Lead Capture Engine. This is a natural, quick-win engagement that keeps the owner involved in the early rollout and demonstrates the system's value before the first weekly digest arrives.

**Within 30 days:** Follow-Up Assistant — once the owner sees which campaigns produce the most leads, they immediately ask what happens to those leads after capture. If Follow-Up Assistant is not already deployed, the weekly digest's lead volume data makes the ROI case concrete: "You got 18 leads from Google this week. Here's what happened to each of them." Clients who see their CPL drop with good campaign management quickly want to ensure those leads are being worked just as systematically as they're being generated.

**Within 60 days:** Full EmberBots Stack performance consolidation — by Month 2, the client has weekly data from Ad & Lead Gen Manager, Appointment Booking, Reputation & Review Engine, and Payment & Invoice Automation. The natural ask is a unified weekly performance report covering the full funnel: ad spend → leads captured → appointments booked → jobs closed → revenue collected → reviews earned. This consolidated digest is a high-retention artifact and the strongest demonstration of the full EmberBots stack value. It requires no new systems — only a reporting consolidation pass across existing state stores.

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

**Week 9-10: Cross-System Integration Audit + Ad & Lead Gen Manager**
- Deploy Ad & Lead Gen Manager (if client runs Google Ads): connect Google Ads, Analytics, and Search Console APIs; set CPL_TARGET and CPL_ALERT_THRESHOLD; run first weekly digest as dry run; verify UTM attribution
- Verify data flow across all 8 systems: Lead Capture → AI Front Desk → Appointment Booking → Ops Back Office → (Invoice Automation + Review Engine) → Follow-Up Assistant
- Check for any payload schema mismatches or dropped events between systems
- Review `avg_lead_to_booking_time_minutes`, `show_rate`, `DSO`, `current_google_star_rating` against Day 0 baselines
- Identify highest-volume drop-off point and address

**Week 11: Reporting Consolidation**
- Optionally consolidate three system reports into one unified weekly "EmberBots Performance Digest" covering: leads, bookings, revenue, AR, reviews
- This is the deliverable that demonstrates the full stack value to the client and is the primary retention/upsell tool

**Week 12: 90-Day Review and Next-Quarter Planning**
- Pull 90-day baseline metrics across all systems
- Present client with ROI summary: hours saved per week (scheduling, invoicing, review management), estimated revenue impact (no-show recovery, DSO reduction, review-driven lead increase)
- Identify next optimization opportunities: Ad & Lead Gen Manager optimization (if deployed — enable AUTOPAUSE_ENABLED after owner reviews first two weekly digests), Mailchimp/ActiveCampaign for seasonal campaigns, or Follow-Up Assistant sequence expansion

**Day 90 Deliverable:**
- Full EmberBots stack operational
- 90-day performance baseline established
- Client has a consolidated weekly performance digest
- Documented ROI case study ready for EmberBots sales use

---

## System Dependency Map

```
Google Ads / Search Console ──→ Ad & Lead Gen Manager
          ↑                           ↓
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
Ad & Lead Gen Manager → Lead Capture Engine (attribution tags)
Ad & Lead Gen Manager → Review Engine (organic visibility data)
```

---

*Document maintained by EmberBots Ops Team. Update version number on any schema, logic, or connector changes. All Cinder/Computer agent implementations must reference this document for system behavior specifications.*
