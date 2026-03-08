import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { getUncachableGoogleCalendarClient } from "./google-calendar";
import { registerGatewayRoutes, requireSameOriginOrNative } from "./gateway";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface WebhookLog {
  id: string;
  from: string;
  smsText: string;
  receivedAt: string;
  status: "processing" | "success" | "no_events" | "error";
  events: any[];
  summary: string;
  error?: string;
  googleLinks: string[];
}

const webhookLogs: WebhookLog[] = [];
const MAX_LOGS = 100;

function getCurrentTimeInTimezone(tz: string): { date: string; time: string; dayOfWeek: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'long',
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}:${get('second')}`;
  const dayOfWeek = get('weekday');
  return { date, time, dayOfWeek };
}

async function parseSmsWithAI(smsText: string, timezone?: string) {
  const tz = timezone || "America/Edmonton";
  const currentTime = getCurrentTimeInTimezone(tz);

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      {
        role: "system",
        content: `You are an expert at extracting calendar event information from SMS messages. Analyze the SMS text and extract any event details. Return a JSON object with:
- "events": an array of event objects, each with:
  - "title": string (concise event title)
  - "description": string (brief description from the SMS)
  - "startDate": string (LOCAL time in ISO 8601 format WITHOUT timezone offset, e.g. "2026-03-15T14:00:00" for 2:00 PM local time)
  - "endDate": string (LOCAL time in ISO 8601 format WITHOUT timezone offset, default to 1 hour after start if not specified)
  - "location": string or null (if a location is mentioned)
  - "allDay": boolean (true if it's an all-day event)
- "confidence": number between 0 and 1 (how confident you are about the extraction)
- "summary": string (a brief human-readable summary of what you found)

CRITICAL TIME RULES:
- The current date and time in the user's timezone (${tz}) is: ${currentTime.dayOfWeek}, ${currentTime.date} at ${currentTime.time}
- All times in startDate and endDate must be LOCAL times in the ${tz} timezone
- Do NOT add "Z" or any timezone offset to the dates — just use plain local time like "2026-03-09T19:00:00"
- "7pm" means 19:00:00, "7am" means 07:00:00, "noon" means 12:00:00, "midnight" means 00:00:00
- "tomorrow" means ${currentTime.date} + 1 day
- If no specific time is mentioned, make it an all-day event

If no event information is found, return events as an empty array with a summary explaining that.
Always respond with valid JSON.`,
      },
      { role: "user", content: smsText },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  return JSON.parse(response.choices[0]?.message?.content || "{}");
}

async function createCalendarEvent(event: any, timezone: string) {
  const calendar = await getUncachableGoogleCalendarClient();

  const eventBody: any = {
    summary: event.title,
    description: event.description || "",
    location: event.location || undefined,
  };

  if (event.allDay) {
    const startDateStr = event.startDate.split("T")[0];
    let endDateStr = (event.endDate || event.startDate).split("T")[0];
    if (endDateStr <= startDateStr) {
      const nextDay = new Date(startDateStr + "T00:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      endDateStr = `${nextDay.getFullYear()}-${(nextDay.getMonth() + 1).toString().padStart(2, '0')}-${nextDay.getDate().toString().padStart(2, '0')}`;
    }
    eventBody.start = { date: startDateStr };
    eventBody.end = { date: endDateStr };
  } else {
    let startDateTime = event.startDate.replace(/Z$/, '');
    let endDateTime = event.endDate ? event.endDate.replace(/Z$/, '') : null;

    if (!endDateTime) {
      const match = startDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
      if (match) {
        const [, yr, mo, dy, hr, mn, sc] = match;
        const d = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(dy), parseInt(hr) + 1, parseInt(mn), parseInt(sc));
        endDateTime = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}T${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
      } else {
        endDateTime = startDateTime;
      }
    }

    eventBody.start = { dateTime: startDateTime, timeZone: timezone };
    eventBody.end = { dateTime: endDateTime, timeZone: timezone };
  }

  const result = await calendar.events.insert({
    calendarId: "primary",
    requestBody: eventBody,
  });

  return {
    eventId: result.data.id,
    htmlLink: result.data.htmlLink,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerGatewayRoutes(app);

  app.post("/api/sms-webhook", async (req, res) => {
    const logEntry: WebhookLog = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      from: req.body.from || req.body.phoneNumber || req.body.sender || "Unknown",
      smsText: req.body.text || req.body.message || req.body.body || "",
      receivedAt: req.body.receivedStamp || req.body.receivedAt || new Date().toISOString(),
      status: "processing",
      events: [],
      summary: "",
      googleLinks: [],
    };

    if (!logEntry.smsText) {
      logEntry.status = "error";
      logEntry.error = "No SMS text received";
      webhookLogs.unshift(logEntry);
      if (webhookLogs.length > MAX_LOGS) webhookLogs.pop();
      return res.status(400).json({ error: "No SMS text in request body" });
    }

    webhookLogs.unshift(logEntry);
    if (webhookLogs.length > MAX_LOGS) webhookLogs.pop();

    console.log(`[SMS Webhook] Received from ${logEntry.from}: "${logEntry.smsText.substring(0, 80)}..."`);

    res.status(200).json({ received: true, id: logEntry.id });

    try {
      const timezone = req.body.timezone || "America/Edmonton";
      const parsed = await parseSmsWithAI(logEntry.smsText, timezone);
      console.log(`[SMS Webhook] AI parsed result:`, JSON.stringify(parsed, null, 2));
      logEntry.summary = parsed.summary || "";

      if (parsed.events && parsed.events.length > 0) {
        logEntry.events = parsed.events;

        for (const event of parsed.events) {
          try {
            const result = await createCalendarEvent(event, timezone);
            logEntry.googleLinks.push(result.htmlLink || "");
            console.log(`[SMS Webhook] Created event: "${event.title}" → ${result.htmlLink}`);
          } catch (calErr: any) {
            console.error(`[SMS Webhook] Failed to create event "${event.title}":`, calErr.message);
            logEntry.error = (logEntry.error || "") + `Failed to create "${event.title}". `;
          }
        }

        logEntry.status = logEntry.error ? "error" : "success";
      } else {
        logEntry.status = "no_events";
        console.log(`[SMS Webhook] No events found in SMS from ${logEntry.from}`);
      }
    } catch (err: any) {
      logEntry.status = "error";
      logEntry.error = err.message || "Failed to process SMS";
      console.error("[SMS Webhook] Processing error:", err.message, err.status ? `(status: ${err.status})` : "", err.response?.data ? JSON.stringify(err.response.data) : "");
    }
  });

  app.get("/api/webhook-logs", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("ETag", Date.now().toString());
    res.json(webhookLogs);
  });

  app.delete("/api/webhook-logs", (_req, res) => {
    webhookLogs.length = 0;
    res.json({ cleared: true });
  });

  app.post("/api/parse-sms", async (req, res) => {
    try {
      const { smsText, timezone } = req.body;
      if (!smsText || typeof smsText !== "string") {
        return res.status(400).json({ error: "SMS text is required" });
      }
      const parsed = await parseSmsWithAI(smsText, timezone);
      res.json(parsed);
    } catch (error: any) {
      console.error("Error parsing SMS:", error);
      res.status(500).json({ error: "Failed to parse SMS text" });
    }
  });

  app.post("/api/create-event", async (req, res) => {
    try {
      const { title, description, startDate, endDate, location, allDay, timezone } = req.body;
      if (!title || !startDate) {
        return res.status(400).json({ error: "Title and start date are required" });
      }
      const userTimezone = timezone || "America/Edmonton";
      const result = await createCalendarEvent(
        { title, description, startDate, endDate, location, allDay },
        userTimezone
      );
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  app.get("/api/calendar-events", requireSameOriginOrNative, async (req, res) => {
    try {
      const calendar = await getUncachableGoogleCalendarClient();
      const timeMin = (req.query.timeMin as string) || new Date().toISOString();
      const timeMax = (req.query.timeMax as string) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 100,
      });
      const events = (result.data.items || []).map((e: any) => ({
        id: e.id,
        title: e.summary || "(No title)",
        description: e.description || "",
        startDate: e.start?.dateTime || e.start?.date || "",
        endDate: e.end?.dateTime || e.end?.date || "",
        allDay: !e.start?.dateTime,
        location: e.location || null,
        htmlLink: e.htmlLink || "",
        color: e.colorId || null,
      }));
      res.json(events);
    } catch (error: any) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.get("/api/calendars", async (_req, res) => {
    try {
      const calendar = await getUncachableGoogleCalendarClient();
      const list = await calendar.calendarList.list();
      res.json(list.data.items || []);
    } catch (error: any) {
      console.error("Error fetching calendars:", error);
      res.status(500).json({ error: "Failed to fetch calendars" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
