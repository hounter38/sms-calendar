import { randomBytes, createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Express, Request, Response, NextFunction } from "express";

export interface GatewayDevice {
  id: string;
  name: string;
  lastSeen: string | null;
  registeredAt: string;
  smsCount: number;
}

const GATEWAY_DATA_PATH = resolve(process.cwd(), ".gateway-data.json");

interface GatewayData {
  apiKey: string;
  devices: Record<string, GatewayDevice>;
}

function loadGatewayData(): GatewayData {
  try {
    if (existsSync(GATEWAY_DATA_PATH)) {
      const raw = readFileSync(GATEWAY_DATA_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}
  return {
    apiKey: process.env.GATEWAY_API_KEY || randomBytes(24).toString("hex"),
    devices: {},
  };
}

function saveGatewayData() {
  try {
    const data: GatewayData = {
      apiKey,
      devices: Object.fromEntries(devices),
    };
    writeFileSync(GATEWAY_DATA_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

const gatewayData = loadGatewayData();
let apiKey: string = gatewayData.apiKey;
const devices: Map<string, GatewayDevice> = new Map(Object.entries(gatewayData.devices));
saveGatewayData();

function generateDeviceId(): string {
  return Date.now().toString(36) + randomBytes(6).toString("hex");
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••••••" + key.slice(-4);
}

function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const key = (
    req.headers["x-api-key"] as string ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.query.apiKey as string ||
    ""
  ).trim();

  console.log(`[Gateway Auth] Received key: "${key.slice(0, 6)}..." (${key.length} chars), Expected: "${apiKey.slice(0, 6)}..." (${apiKey.length} chars)`);

  if (!key || key !== apiKey) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}

export function requireSameOriginOrNative(req: Request, res: Response, next: NextFunction) {
  const origin = req.header("origin");
  const referer = req.header("referer");

  if (!origin && !referer) {
    return next();
  }

  const allowedDomains = new Set<string>();
  if (process.env.REPLIT_DEV_DOMAIN) {
    allowedDomains.add(process.env.REPLIT_DEV_DOMAIN);
  }
  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
      allowedDomains.add(d.trim());
    });
  }

  const isLocalhost =
    origin?.startsWith("http://localhost:") ||
    origin?.startsWith("http://127.0.0.1:");

  let isAllowed = false;

  if (isLocalhost) {
    isAllowed = true;
  } else if (origin) {
    try {
      const originHost = new URL(origin).hostname;
      isAllowed = allowedDomains.has(originHost);
    } catch {}
  } else if (referer) {
    try {
      const refHost = new URL(referer).hostname;
      isAllowed = allowedDomains.has(refHost);
    } catch {}
  }

  if (!isAllowed) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

export function registerGatewayRoutes(app: Express) {
  app.get("/api/gateway/config", requireSameOriginOrNative, (_req, res) => {
    res.json({
      apiKeyMasked: maskApiKey(apiKey),
      deviceCount: devices.size,
      devices: Array.from(devices.values()),
    });
  });

  app.post("/api/gateway/reveal-key", requireSameOriginOrNative, (_req, res) => {
    res.json({ apiKey });
  });

  app.post("/api/gateway/regenerate-key", requireSameOriginOrNative, (_req, res) => {
    apiKey = randomBytes(24).toString("hex");
    saveGatewayData();
    res.json({ apiKey });
  });

  app.post("/api/gateway/devices", requireSameOriginOrNative, (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Device name is required" });
    }

    const id = generateDeviceId();
    const device: GatewayDevice = {
      id,
      name: name.trim(),
      lastSeen: null,
      registeredAt: new Date().toISOString(),
      smsCount: 0,
    };

    devices.set(id, device);
    saveGatewayData();
    res.status(201).json(device);
  });

  app.get("/api/gateway/devices", requireSameOriginOrNative, (_req, res) => {
    res.json(Array.from(devices.values()));
  });

  app.delete("/api/gateway/devices/:id", requireSameOriginOrNative, (req, res) => {
    const { id } = req.params;
    if (!devices.has(id)) {
      return res.status(404).json({ error: "Device not found" });
    }
    devices.delete(id);
    saveGatewayData();
    res.json({ deleted: true });
  });

  app.post("/api/gateway/sms", authenticateApiKey, (req, res) => {
    const deviceId = req.headers["x-device-id"] as string || req.body.deviceId;
    const device = deviceId ? devices.get(deviceId) : null;

    if (device) {
      device.lastSeen = new Date().toISOString();
      device.smsCount += 1;
      saveGatewayData();
    }

    const smsText = req.body.text || req.body.message || req.body.body || req.body.smsText || "";
    const from = req.body.from || req.body.phoneNumber || req.body.sender || "Unknown";
    const receivedAt = req.body.receivedAt || req.body.receivedStamp || new Date().toISOString();
    const timezone = req.body.timezone || "America/Edmonton";

    if (!smsText) {
      return res.status(400).json({ error: "No SMS text provided" });
    }

    req.body.text = smsText;
    req.body.from = from;
    req.body.receivedAt = receivedAt;
    req.body.timezone = timezone;
    req.body._fromGateway = true;
    req.body._deviceId = deviceId;
    req.body._deviceName = device?.name;

    req.url = "/api/sms-webhook";
    req.method = "POST";

    res.locals._gatewayForward = true;

    app.handle(req, res);
  });

  app.get("/api/gateway/test", authenticateApiKey, (_req, res) => {
    res.json({ success: true, message: "API key is valid" });
  });
}
