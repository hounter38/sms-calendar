# SMS Calendar

## Overview
An Expo React Native app that extracts calendar events from SMS messages using AI and adds them directly to Google Calendar. Supports both automated webhook-based SMS forwarding and manual paste input.

## Architecture
- **Frontend**: Expo Router (file-based routing), React Native
- **Backend**: Express server on port 5000
- **AI**: OpenAI via Replit AI Integrations (no API key needed) for SMS parsing
- **Calendar**: Google Calendar API via Replit Integration (OAuth)
- **Storage**: AsyncStorage for local event history
- **SMS Ingestion**: Webhook endpoint for Android SMS Gateway app

## Key Files
- `app/index.tsx` - Main screen with Auto/Manual/Calendar/Gateway tabs
- `server/routes.ts` - API endpoints (sms-webhook, parse-sms, create-event, webhook-logs)
- `server/google-calendar.ts` - Google Calendar client with token refresh
- `lib/storage.ts` - AsyncStorage helpers for event history
- `lib/query-client.ts` - React Query client with API helpers
- `components/SMSInput.tsx` - SMS text input component
- `components/EventCard.tsx` - Parsed event preview card with edit/add
- `components/HistoryItem.tsx` - History list item
- `components/WebhookStatus.tsx` - Auto-processed SMS log item

## API Endpoints
- `POST /api/sms-webhook` - Receives forwarded SMS, auto-parses and creates calendar events
- `GET /api/webhook-logs` - Returns processing history for webhook-received SMS
- `DELETE /api/webhook-logs` - Clears webhook log history
- `POST /api/parse-sms` - Manual SMS text parsing with AI
- `POST /api/create-event` - Create Google Calendar event
- `GET /api/calendars` - List user's Google Calendars
- `GET /api/gateway/config` - Get gateway config (API key, devices)
- `POST /api/gateway/regenerate-key` - Regenerate API key
- `POST /api/gateway/devices` - Register a device
- `GET /api/gateway/devices` - List registered devices
- `DELETE /api/gateway/devices/:id` - Remove a device
- `POST /api/gateway/sms` - Authenticated SMS gateway endpoint (requires x-api-key header)
- `GET /api/gateway/test` - Test API key validity

## SMS Gateway
Built-in SMS gateway with API key authentication. The Gateway tab in the app provides:
- API key generation and management
- Device registration for tracking SMS sources
- Gateway URL with copy-to-clipboard
- Setup guides for Tasker, MacroDroid, Zapier+Twilio, and cURL testing
- The authenticated endpoint is `/api/gateway/sms` (requires x-api-key header)
- The legacy endpoint `/api/sms-webhook` still works without authentication

## Key Files
### Gateway
- `server/gateway.ts` - Gateway routes (API key auth, device management, SMS forwarding)
- `components/GatewayDashboard.tsx` - Gateway management UI (API key, devices, setup guides)

## Integrations
- Replit AI Integrations (OpenAI - no API key required)
- Google Calendar (OAuth via Replit connector)

## Theme
- Dark navy background (#0F172A)
- Teal primary (#14B8A6)
- Orange accent (#F97316)
- Inter font family
