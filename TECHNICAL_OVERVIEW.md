# SMS Calendar — Technical Overview for Development Team

## What This Prototype Does

SMS Calendar is a system that automatically converts text messages into Google Calendar events. When someone sends you an SMS like "Gym at 7pm tomorrow" or "Dentist appointment March 26th at 8am," the system intercepts that message, uses AI to extract the event details (title, date, time, location), and creates a Google Calendar event — all without any manual input.

The prototype has two modes of operation:
1. **Automated mode**: An Android phone running Tasker intercepts incoming SMS messages in real-time and forwards them to the server via HTTP. Events appear on Google Calendar within seconds of receiving the text.
2. **Manual mode**: Users can paste SMS text into the app's UI, review the AI-extracted events, edit them if needed, and then add them to Google Calendar with a tap.

There is also a built-in **Calendar view** that mirrors Google Calendar, showing all upcoming events in a monthly grid.

---

## System Architecture

```
┌─────────────────┐     HTTP POST      ┌──────────────────────────────────┐
│  Android Phone  │ ──────────────────> │  Express Backend (Replit)        │
│  (Tasker app)   │   /api/gateway/sms  │  Port 5000                       │
│                 │   with x-api-key    │                                  │
└─────────────────┘                     │  ┌───────────────────────────┐   │
                                        │  │ Gateway Auth Middleware    │   │
                                        │  │ (validates API key)       │   │
                                        │  └─────────┬─────────────────┘   │
                                        │            │                     │
                                        │            ▼                     │
                                        │  ┌───────────────────────────┐   │
                                        │  │ SMS Webhook Handler       │   │
                                        │  │ POST /api/sms-webhook     │   │
                                        │  └─────────┬─────────────────┘   │
                                        │            │                     │
                                        │            ▼                     │
                                        │  ┌───────────────────────────┐   │
                                        │  │ OpenAI (GPT-5.2)          │   │
                                        │  │ via Replit AI Integration  │   │
                                        │  │ Extracts: title, date,    │   │
                                        │  │ time, location, duration  │   │
                                        │  └─────────┬─────────────────┘   │
                                        │            │                     │
                                        │            ▼                     │
                                        │  ┌───────────────────────────┐   │
                                        │  │ Google Calendar API v3     │   │
                                        │  │ via Replit OAuth Connector │   │
                                        │  │ Creates calendar event     │   │
                                        │  └───────────────────────────┘   │
                                        └──────────────────────────────────┘
                                                     ▲
                                                     │ HTTP (React Query)
                                        ┌────────────┴─────────────────────┐
                                        │  Expo React Native App           │
                                        │  Port 8081                        │
                                        │  Tabs: Auto | Manual | Calendar  │
                                        │         | Gateway                 │
                                        └──────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Mobile App | Expo (React Native) with Expo Router | Cross-platform UI, file-based routing |
| Backend | Express 5 + TypeScript (tsx) | REST API, orchestration |
| AI | OpenAI GPT-5.2 via Replit AI Integrations | Natural language extraction of event data |
| Calendar | Google Calendar API v3 via `googleapis` | Read/write calendar events |
| Auth (Google) | Replit OAuth Connector | Manages Google OAuth tokens automatically |
| Auth (Gateway) | Custom API key (48-char hex) | Authenticates Tasker HTTP requests |
| State (client) | React Query + AsyncStorage | Server state caching + local event history |
| Persistence (server) | In-memory arrays + `.gateway-data.json` file | Webhook logs (volatile) + API keys (persistent) |

---

## The SMS-to-Calendar Pipeline (Detailed)

### Step 1: SMS Arrives on Android Phone

An SMS arrives on the user's Android device. The Tasker app (an Android automation tool) has a **Profile** configured to trigger on the event **Phone → Received Text**.

### Step 2: Tasker Fires an HTTP Request

When the Profile triggers, Tasker executes a **Task** containing an **HTTP Request** action:

**Tasker Configuration:**
- **Method**: POST
- **URL**: `https://<replit-app-domain>/api/gateway/sms`
- **Headers**:
  ```
  Content-Type: application/json
  x-api-key: <48-character-hex-api-key>
  ```
- **Body**:
  ```json
  {"text": "%SMSRB", "from": "%SMSRF"}
  ```
  Where `%SMSRB` is Tasker's built-in variable for the SMS body, and `%SMSRF` is the sender's phone number. On some Android versions, `%evtprm2` and `%evtprm1` may work instead (event parameters from the Received Text trigger).

**Important Tasker Notes:**
- Tasker must have SMS permission enabled (Android Settings → Apps → Tasker → Permissions → SMS → Allow)
- On Android 10+, Tasker may need Notification Access permission (Settings → Special access → Notification access → Tasker)
- The Profile trigger must be specifically **Event → Phone → Received Text** (not other SMS-related triggers)

### Step 3: Gateway Authentication (server/gateway.ts)

The request hits `POST /api/gateway/sms` on the Express backend. Before reaching the handler, it passes through the `authenticateApiKey` middleware:

```typescript
function authenticateApiKey(req, res, next) {
  const key = (
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.query.apiKey
  ).trim();

  if (!key || key !== apiKey) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}
```

The middleware checks three locations for the API key (header, bearer token, query param) to accommodate different automation tools. The expected key is a 48-character hex string generated with `crypto.randomBytes(24).toString("hex")` and persisted to `.gateway-data.json` on disk so it survives server restarts.

### Step 4: Internal Forwarding to Webhook Handler

After authentication, the gateway handler normalizes the request body fields (different SMS sources use different field names like `text`, `message`, `body`, `smsText`) and internally forwards the request to the main SMS webhook handler:

```typescript
// Normalize fields
req.body.text = smsText;
req.body.from = from;
req.body.timezone = timezone;  // defaults to "America/Edmonton"

// Internal forward
req.url = "/api/sms-webhook";
req.method = "POST";
app.handle(req, res);
```

This means the authenticated gateway endpoint and the legacy unauthenticated endpoint (`POST /api/sms-webhook`) share the same processing logic.

### Step 5: AI Extraction (server/routes.ts → parseSmsWithAI)

The webhook handler calls `parseSmsWithAI()` which sends the SMS text to OpenAI GPT-5.2 with a structured system prompt:

**Key aspects of the AI prompt:**
- Provides the current date/time in the user's timezone (computed via `Intl.DateTimeFormat` with timezone parameter, not relying on the server's UTC clock)
- Instructs the model to return local time ISO strings WITHOUT timezone offsets (e.g., `"2026-03-09T19:00:00"` not `"2026-03-09T19:00:00Z"`)
- Explicitly maps common time references: "7pm" → 19:00:00, "noon" → 12:00:00
- Uses `response_format: { type: "json_object" }` to guarantee valid JSON output
- Returns a structured object with `events[]`, `confidence`, and `summary`

**Example AI input/output:**

Input SMS: `"Gym at 7pm tomorrow"`

Output:
```json
{
  "events": [{
    "title": "Gym",
    "description": "Gym session",
    "startDate": "2026-03-09T19:00:00",
    "endDate": "2026-03-09T20:00:00",
    "location": null,
    "allDay": false
  }],
  "confidence": 0.95,
  "summary": "Found 1 event: Gym tomorrow at 7:00 PM"
}
```

**OpenAI Connection:** The backend connects to OpenAI through Replit's AI Integrations proxy (`http://localhost:1106/modelfarm/openai`). This proxy handles API key management — no OpenAI API key is needed in environment variables. The environment variables `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` are automatically injected by Replit.

### Step 6: Google Calendar Event Creation (server/routes.ts → createCalendarEvent)

The extracted event data is passed to `createCalendarEvent()` which uses the Google Calendar API v3:

```typescript
const eventBody = {
  summary: event.title,
  description: event.description,
  location: event.location,
};

// Timed events use dateTime + timeZone
eventBody.start = { dateTime: "2026-03-09T19:00:00", timeZone: "America/Edmonton" };
eventBody.end = { dateTime: "2026-03-09T20:00:00", timeZone: "America/Edmonton" };

// All-day events use date (Google uses exclusive end dates)
eventBody.start = { date: "2026-03-09" };
eventBody.end = { date: "2026-03-10" };  // exclusive: event is only on March 9

await calendar.events.insert({ calendarId: "primary", requestBody: eventBody });
```

**Google Calendar OAuth Connection (server/google-calendar.ts):**

The Google Calendar API requires an OAuth2 access token. Instead of implementing OAuth flows manually, this prototype uses Replit's built-in Google Calendar Connector:

1. The user connects their Google account via Replit's integration UI (one-time setup)
2. Replit stores and manages the OAuth tokens (access + refresh)
3. At runtime, the server fetches a fresh access token from Replit's internal connector API:

```typescript
async function getAccessToken() {
  // Check if cached token is still valid
  if (connectionSettings?.settings?.expires_at > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  // Fetch fresh token from Replit's connector service
  const response = await fetch(
    `https://${REPLIT_CONNECTORS_HOSTNAME}/api/v2/connection?include_secrets=true&connector_names=google-calendar`,
    { headers: { 'X-Replit-Token': replitIdentityToken } }
  );

  return response.settings.access_token;
}
```

This means:
- No client ID, client secret, or redirect URIs are needed
- Token refresh is handled automatically by Replit
- The access token is fetched on every API call (with caching for unexpired tokens)

**For production**: You would replace this with a standard OAuth2 flow using Google Cloud Console credentials, a refresh token stored in a database, and proper token refresh logic.

### Step 7: Response and Logging

After creating the calendar event, the webhook handler updates its in-memory log entry with the status, Google Calendar event link, and any errors. The Expo app polls `GET /api/webhook-logs` every 5 seconds on the Auto tab to display processed messages.

---

## API Endpoints Reference

### SMS Processing
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/gateway/sms` | API Key (`x-api-key` header) | Authenticated SMS intake from Tasker/automation tools |
| `POST` | `/api/sms-webhook` | None | Legacy/unauthenticated SMS intake |
| `POST` | `/api/parse-sms` | Same-origin | Manual SMS parsing (returns events without creating them) |
| `POST` | `/api/create-event` | Same-origin | Create a single Google Calendar event |

### Webhook Logs
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/webhook-logs` | None | Get processing history (last 100 entries, in-memory) |
| `DELETE` | `/api/webhook-logs` | None | Clear all webhook logs |

### Calendar
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/calendar-events` | Same-origin | Fetch Google Calendar events for a date range |
| `GET` | `/api/calendars` | None | List user's Google Calendar list |

### Gateway Management
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/gateway/config` | Same-origin | Get gateway config (masked API key, devices) |
| `POST` | `/api/gateway/reveal-key` | Same-origin | Reveal full API key |
| `POST` | `/api/gateway/regenerate-key` | Same-origin | Generate new API key |
| `POST` | `/api/gateway/devices` | Same-origin | Register a named device |
| `GET` | `/api/gateway/devices` | Same-origin | List registered devices |
| `DELETE` | `/api/gateway/devices/:id` | Same-origin | Remove a device |
| `GET` | `/api/gateway/test` | API Key | Validate API key |

**"Same-origin" auth** means the `requireSameOriginOrNative` middleware, which:
- Allows requests with no `Origin`/`Referer` header (native mobile apps, server-to-server)
- Allows requests from `localhost` (development)
- Allows requests from the Replit app domain (production)
- Blocks cross-origin browser requests from other domains

---

## Frontend Architecture

### App Structure
Single-screen app (`app/index.tsx`) with four tabs managed by local state (not router-based tabs):

- **Auto tab**: Real-time feed of SMS messages received via webhook/gateway. Polls the server every 5 seconds. Shows processing status (pending, success, error) and links to created Google Calendar events.
- **Manual tab**: Text input for pasting SMS content. Shows AI parsing results as editable event cards. One-tap or bulk "Add to Calendar" actions.
- **Calendar tab**: Monthly calendar grid fetched from Google Calendar API. Day selection shows events for that day. Tapping an event opens it in Google Calendar.
- **Gateway tab**: Dashboard for managing the SMS gateway. Shows API key (reveal/copy/regenerate), registered devices, and setup guides for Tasker, MacroDroid, Zapier+Twilio, and cURL.

### Data Flow
```
User Action → apiRequest() → Express API → Response
                  ↓
          React Query cache
                  ↓
            Component re-render
```

All API communication uses `apiRequest()` from `lib/query-client.ts`, which constructs URLs using `EXPO_PUBLIC_DOMAIN` (injected at build time) and handles JSON serialization.

---

## Timezone Handling

This was a critical challenge. The server runs in UTC, but users send messages with local time references ("7pm tomorrow"). The solution:

1. **Tasker sends the SMS body as-is** (no timezone info needed from the phone)
2. **Server defaults to `America/Edmonton`** (configurable via `timezone` field in the request body)
3. **AI prompt receives the current local time** computed on the server using `Intl.DateTimeFormat` with the user's timezone:
   ```
   Current date/time in America/Edmonton: Saturday, 2026-03-08 at 17:45:30
   ```
4. **AI outputs local time strings** without timezone offsets: `"2026-03-09T19:00:00"`
5. **Google Calendar API receives** the local time + timezone name:
   ```json
   { "dateTime": "2026-03-09T19:00:00", "timeZone": "America/Edmonton" }
   ```
   Google handles DST transitions and UTC conversion internally.

---

## Security Model (Prototype)

| Surface | Protection |
|---------|-----------|
| SMS intake (Tasker) | 48-char hex API key in `x-api-key` header |
| Gateway management | Same-origin check (blocks external browsers) |
| Calendar data | Same-origin check |
| Google OAuth tokens | Managed by Replit (never exposed to client) |
| AI proxy | Internal localhost only (not exposed externally) |

**Production considerations:**
- Add per-user authentication (the prototype is single-user)
- Move API keys to a database with hashing
- Add rate limiting on SMS intake
- Implement proper session management
- Replace in-memory webhook logs with a database
- Add encryption for stored SMS content

---

## File Structure

```
├── app/
│   ├── _layout.tsx                # Root layout with providers (fonts, React Query, SafeArea)
│   └── index.tsx                  # Main screen with 4 tabs (Auto/Manual/Calendar/Gateway)
├── components/
│   ├── CalendarView.tsx           # Monthly calendar grid with event dots and day detail
│   ├── EventCard.tsx              # Editable event card for manual parsing results
│   ├── GatewayDashboard.tsx       # Gateway management UI (API key, devices, setup guides)
│   ├── HistoryItem.tsx            # History list item for manually added events
│   ├── SMSInput.tsx               # SMS text input component
│   └── WebhookStatus.tsx          # Auto-processed SMS log item with status indicators
├── server/
│   ├── index.ts                   # Express app setup (CORS, body parsing, logging, Expo routing)
│   ├── routes.ts                  # All API endpoints + AI parsing + calendar event creation
│   ├── gateway.ts                 # Gateway routes, API key auth, device management
│   ├── google-calendar.ts         # Google Calendar OAuth client via Replit Connector
│   └── templates/
│       └── landing-page.html      # Static landing page served on port 5000
├── lib/
│   ├── query-client.ts            # React Query client + apiRequest helper + getApiUrl
│   └── storage.ts                 # AsyncStorage helpers for local event history
├── constants/
│   └── colors.ts                  # Theme colors (dark navy, teal, orange)
├── .gateway-data.json             # Persisted API key + registered devices (runtime file)
├── package.json                   # Dependencies and scripts
└── replit.md                      # Project documentation
```

---

## How to Reproduce the Tasker Setup

### Prerequisites
- Android phone with Tasker installed ($3.49 on Google Play)
- The Replit app URL (e.g., `https://your-app.replit.app`)
- The 48-character API key from the Gateway tab in the app

### Step-by-step Tasker Configuration

**1. Create a Profile (trigger):**
- Open Tasker → Profiles tab → "+" button
- Select **Event** → **Phone** → **Received Text**
- Leave Sender and Content fields empty (matches all SMS)
- Tap the back arrow to confirm

**2. Create a Task (action):**
- When prompted to create a task, name it (e.g., "Forward SMS")
- Tap "+" to add an action
- Select **Net** → **HTTP Request**

**3. Configure the HTTP Request:**
- **Method**: POST
- **URL**: `https://your-app.replit.app/api/gateway/sms`
- **Headers**:
  ```
  Content-Type: application/json
  x-api-key: <paste your 48-char API key here>
  ```
- **Body**: `{"text":"%SMSRB","from":"%SMSRF"}`

**4. Variable alternatives (if %SMSRB is empty):**
On some Android versions/ROMs, the standard SMS variables may not populate. Try these body alternatives in order:
```
{"text":"%evtprm2","from":"%evtprm1"}
{"text":"%evtprm(2)","from":"%evtprm(1)"}
{"text":"%smsrb","from":"%smsrf"}
```

**5. Enable the profile** and send yourself a test SMS.

---

## What Would Need to Change for Production

1. **SMS Ingestion**: Replace Tasker with a proper SMS gateway service (Twilio, Vonage, or a custom Android app with a background service). Tasker is consumer-grade and can be killed by Android battery optimization.

2. **Authentication**: Add user accounts with JWT/session auth. Currently single-user.

3. **Database**: Replace in-memory arrays and `.gateway-data.json` with PostgreSQL or similar. Webhook logs are lost on server restart.

4. **Google OAuth**: Implement standard OAuth2 with Google Cloud Console credentials, refresh token storage, and proper consent flows. The Replit connector is development-only.

5. **AI Provider**: Consider self-hosting or using a dedicated OpenAI account with proper rate limiting and cost controls. The Replit AI proxy is for development.

6. **Timezone**: Detect timezone from the phone's location or let users set it in preferences. Currently hardcoded to America/Edmonton.

7. **Multi-calendar support**: Allow users to choose which Google Calendar to add events to (currently hardcoded to "primary").

8. **Error handling**: Add retry logic for transient failures, dead letter queues for failed messages, and user notifications when events fail to create.

9. **Hosting**: Deploy to a proper cloud provider with uptime guarantees. Replit deployments are suitable for prototyping.
