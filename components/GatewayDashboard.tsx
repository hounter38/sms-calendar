import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface Device {
  id: string;
  name: string;
  lastSeen: string | null;
  registeredAt: string;
  smsCount: number;
}

interface GatewayConfig {
  apiKeyMasked: string;
  deviceCount: number;
  devices: Device[];
}

export default function GatewayDashboard() {
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [addingDevice, setAddingDevice] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiRequest("GET", "/api/gateway/config");
      const data = await res.json();
      setConfig(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const copyToClipboard = async (text: string, field: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedField(field);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setTimeout(() => setCopiedField(null), 2000);
  };

  const revealApiKey = async () => {
    if (revealedApiKey) {
      setShowApiKey(!showApiKey);
      return;
    }
    try {
      const res = await apiRequest("POST", "/api/gateway/reveal-key");
      const data = await res.json();
      setRevealedApiKey(data.apiKey);
      setShowApiKey(true);
    } catch {
    }
  };

  const regenerateKey = async () => {
    setRegenerating(true);
    try {
      const res = await apiRequest("POST", "/api/gateway/regenerate-key");
      const data = await res.json();
      setRevealedApiKey(data.apiKey);
      setConfig((prev) => (prev ? { ...prev, apiKeyMasked: data.apiKey.slice(0, 4) + "••••••••••••" + data.apiKey.slice(-4) } : prev));
      setShowApiKey(true);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
    } finally {
      setRegenerating(false);
    }
  };

  const addDevice = async () => {
    if (!newDeviceName.trim()) return;
    setAddingDevice(true);
    try {
      const res = await apiRequest("POST", "/api/gateway/devices", {
        name: newDeviceName.trim(),
      });
      await res.json();
      setNewDeviceName("");
      setShowAddDevice(false);
      await loadConfig();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
    } finally {
      setAddingDevice(false);
    }
  };

  const removeDevice = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/gateway/devices/${id}`);
      await loadConfig();
    } catch {
    }
  };

  const webhookUrl = (() => {
    try {
      const base = getApiUrl();
      return new URL("/api/gateway/sms", base).toString();
    } catch {
      return "https://your-app.replit.app/api/gateway/sms";
    }
  })();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(300)} style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconBg}>
            <Ionicons name="key" size={18} color={Colors.primary} />
          </View>
          <Text style={styles.sectionTitle}>API Key</Text>
        </View>
        <View style={styles.keyRow}>
          <View style={styles.keyBox}>
            <Text style={styles.keyText} selectable>
              {showApiKey && revealedApiKey ? revealedApiKey : (config?.apiKeyMasked || "••••••••••••••••••••••••")}
            </Text>
          </View>
          <Pressable
            onPress={revealApiKey}
            style={styles.iconBtn}
          >
            <Ionicons
              name={showApiKey ? "eye-off" : "eye"}
              size={20}
              color={Colors.textMuted}
            />
          </Pressable>
          <Pressable
            onPress={() => {
              if (revealedApiKey) {
                copyToClipboard(revealedApiKey, "apiKey");
              } else {
                apiRequest("POST", "/api/gateway/reveal-key")
                  .then(r => r.json())
                  .then(data => {
                    setRevealedApiKey(data.apiKey);
                    copyToClipboard(data.apiKey, "apiKey");
                  })
                  .catch(() => {});
              }
            }}
            style={styles.iconBtn}
          >
            <Ionicons
              name={copiedField === "apiKey" ? "checkmark" : "copy"}
              size={20}
              color={
                copiedField === "apiKey" ? Colors.success : Colors.textMuted
              }
            />
          </Pressable>
        </View>
        <Pressable
          onPress={regenerateKey}
          disabled={regenerating}
          style={({ pressed }) => [
            styles.smallBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          {regenerating ? (
            <ActivityIndicator size="small" color={Colors.warning} />
          ) : (
            <>
              <Ionicons name="refresh" size={14} color={Colors.warning} />
              <Text style={styles.smallBtnText}>Regenerate</Text>
            </>
          )}
        </Pressable>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(100).duration(300)}
        style={styles.section}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.iconBg}>
            <Ionicons name="link" size={18} color={Colors.primary} />
          </View>
          <Text style={styles.sectionTitle}>Gateway URL</Text>
        </View>
        <Pressable
          onPress={() => copyToClipboard(webhookUrl, "url")}
          style={styles.urlBox}
        >
          <Text style={styles.urlText} numberOfLines={2}>
            {webhookUrl}
          </Text>
          <Ionicons
            name={copiedField === "url" ? "checkmark" : "copy"}
            size={18}
            color={copiedField === "url" ? Colors.success : Colors.textMuted}
          />
        </Pressable>
        <Text style={styles.hint}>
          POST SMS data to this URL with your API key in the x-api-key header.
        </Text>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(200).duration(300)}
        style={styles.section}
      >
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBg}>
              <Ionicons
                name="phone-portrait"
                size={18}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.sectionTitle}>
              Devices ({config?.devices.length || 0})
            </Text>
          </View>
          <Pressable
            onPress={() => setShowAddDevice(!showAddDevice)}
            style={styles.addBtn}
          >
            <Ionicons
              name={showAddDevice ? "close" : "add"}
              size={20}
              color={Colors.primary}
            />
          </Pressable>
        </View>

        {showAddDevice && (
          <View style={styles.addDeviceRow}>
            <TextInput
              style={styles.deviceInput}
              placeholder="Device name (e.g. My Galaxy S24)"
              placeholderTextColor={Colors.textMuted}
              value={newDeviceName}
              onChangeText={setNewDeviceName}
              onSubmitEditing={addDevice}
            />
            <Pressable
              onPress={addDevice}
              disabled={addingDevice || !newDeviceName.trim()}
              style={({ pressed }) => [
                styles.addDeviceBtn,
                pressed && { opacity: 0.7 },
                (!newDeviceName.trim() || addingDevice) && { opacity: 0.4 },
              ]}
            >
              {addingDevice ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.addDeviceBtnText}>Add</Text>
              )}
            </Pressable>
          </View>
        )}

        {config?.devices && config.devices.length > 0 ? (
          <View style={styles.deviceList}>
            {config.devices.map((device) => (
              <View key={device.id} style={styles.deviceCard}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceMeta}>
                    {device.smsCount} SMS received
                    {device.lastSeen
                      ? ` · Last seen ${new Date(device.lastSeen).toLocaleString()}`
                      : " · Never connected"}
                  </Text>
                </View>
                <View style={styles.deviceActions}>
                  <Pressable
                    onPress={() => copyToClipboard(device.id, device.id)}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name={
                        copiedField === device.id ? "checkmark" : "copy"
                      }
                      size={16}
                      color={
                        copiedField === device.id
                          ? Colors.success
                          : Colors.textMuted
                      }
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => removeDevice(device.id)}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="trash" size={16} color={Colors.error} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyDevices}>
            No devices registered yet. Add a device to track SMS forwarding.
          </Text>
        )}
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(300).duration(300)}
      >
        <Pressable
          onPress={() => setShowSetupGuide(!showSetupGuide)}
          style={styles.section}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeader}>
              <View style={styles.iconBg}>
                <Ionicons name="book" size={18} color={Colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Setup Guide</Text>
            </View>
            <Ionicons
              name={showSetupGuide ? "chevron-up" : "chevron-down"}
              size={18}
              color={Colors.textMuted}
            />
          </View>

          {showSetupGuide && (
            <View style={styles.guideContent}>
              <Text style={styles.guideHeading}>
                Option 1: Tasker (Android)
              </Text>
              <Text style={styles.guideStep}>
                1. Install Tasker from the Play Store{"\n"}
                2. Create a new Profile → Event → Phone → Received Text{"\n"}
                3. Add a Task → Net → HTTP Request{"\n"}
                4. Method: POST{"\n"}
                5. URL: your Gateway URL above{"\n"}
                6. Headers: x-api-key: your API key{"\n"}
                7. Body: {`{"text":"%SMSRB","from":"%SMSRF"}`}
              </Text>

              <Text style={styles.guideHeading}>
                Option 2: MacroDroid (Android)
              </Text>
              <Text style={styles.guideStep}>
                1. Install MacroDroid from the Play Store{"\n"}
                2. Trigger: SMS Received{"\n"}
                3. Action: HTTP Request (POST){"\n"}
                4. URL: your Gateway URL above{"\n"}
                5. Header: x-api-key: your API key{"\n"}
                6. JSON Body: {`{"text":"[sms_text]","from":"[sms_number]"}`}
              </Text>

              <Text style={styles.guideHeading}>
                Option 3: Zapier + Twilio
              </Text>
              <Text style={styles.guideStep}>
                1. Create a Zap with Twilio "New SMS" trigger{"\n"}
                2. Add "Webhooks by Zapier" POST action{"\n"}
                3. URL: your Gateway URL above{"\n"}
                4. Payload Type: JSON{"\n"}
                5. Headers: x-api-key: your API key{"\n"}
                6. Data: text → SMS Body, from → From Number
              </Text>

              <Text style={styles.guideHeading}>
                Option 4: cURL (Testing)
              </Text>
              <Pressable
                onPress={() =>
                  copyToClipboard(
                    `curl -X POST "${webhookUrl}" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${revealedApiKey || "YOUR_API_KEY"}" \\\n  -d '{"text":"Meeting tomorrow at 3pm at the office","from":"+1234567890"}'`,
                    "curl"
                  )
                }
                style={styles.codeBox}
              >
                <Text style={styles.codeText}>
                  {`curl -X POST "${webhookUrl}" \\`}
                  {"\n"}
                  {`  -H "Content-Type: application/json" \\`}
                  {"\n"}
                  {`  -H "x-api-key: ${showApiKey && revealedApiKey ? revealedApiKey : "YOUR_API_KEY"}" \\`}
                  {"\n"}
                  {`  -d '{"text":"Meeting tomorrow at 3pm","from":"+1234567890"}'`}
                </Text>
                <View style={styles.copyBadge}>
                  <Ionicons
                    name={copiedField === "curl" ? "checkmark" : "copy"}
                    size={14}
                    color={
                      copiedField === "curl" ? Colors.success : Colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.copyBadgeText,
                      copiedField === "curl" && { color: Colors.success },
                    ]}
                  >
                    {copiedField === "curl" ? "Copied" : "Copy"}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  section: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBg: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  keyBox: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  keyText: {
    fontSize: 13,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    color: Colors.primary,
  },
  iconBtn: {
    padding: 8,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.warning + "15",
  },
  smallBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.warning,
  },
  urlBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    marginTop: 12,
    gap: 8,
  },
  urlText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    color: Colors.primary,
    lineHeight: 18,
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 8,
    lineHeight: 17,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  addDeviceRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  deviceInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  addDeviceBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addDeviceBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  deviceList: {
    marginTop: 12,
    gap: 8,
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  deviceMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  deviceActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  emptyDevices: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 12,
    textAlign: "center",
    paddingVertical: 16,
  },
  guideContent: {
    marginTop: 14,
    gap: 12,
  },
  guideHeading: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  guideStep: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  codeBox: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  codeText: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  copyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-end",
    marginTop: 8,
  },
  copyBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
});
