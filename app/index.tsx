import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  RefreshControl,
  Clipboard,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInUp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import SMSInput from "@/components/SMSInput";
import EventCard, { type ParsedEvent } from "@/components/EventCard";
import HistoryItem from "@/components/HistoryItem";
import WebhookLogItem from "@/components/WebhookStatus";
import GatewayDashboard from "@/components/GatewayDashboard";
import CalendarView from "@/components/CalendarView";
import {
  getSavedEvents,
  saveEvent,
  deleteEvent,
  type SavedEvent,
} from "@/lib/storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";

type Tab = "auto" | "manual" | "calendar" | "gateway";
type ViewMode = "input" | "results";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("auto");
  const [viewMode, setViewMode] = useState<ViewMode>("input");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedEvents, setParsedEvents] = useState<ParsedEvent[]>([]);
  const [addingIndex, setAddingIndex] = useState<number | null>(null);
  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set());
  const [summary, setSummary] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [currentSmsText, setCurrentSmsText] = useState("");
  const [history, setHistory] = useState<SavedEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [showWebhookUrl, setShowWebhookUrl] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    const events = await getSavedEvents();
    setHistory(events);
  }, []);

  const loadWebhookLogs = useCallback(async () => {
    try {
      const res = await apiRequest("GET", "/api/webhook-logs");
      const data = await res.json();
      setWebhookLogs(data);
    } catch {
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadWebhookLogs();
  }, [loadHistory, loadWebhookLogs]);

  useEffect(() => {
    if (tab === "auto") {
      pollRef.current = setInterval(loadWebhookLogs, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tab, loadWebhookLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (tab === "auto") {
      await loadWebhookLogs();
    } else {
      await loadHistory();
    }
    setRefreshing(false);
  }, [tab, loadHistory, loadWebhookLogs]);

  const handleParseSMS = async (text: string) => {
    setIsParsing(true);
    setParseError(null);
    setCurrentSmsText(text);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await apiRequest("POST", "/api/parse-sms", { smsText: text, timezone });
      const data = await res.json();

      if (data.events && data.events.length > 0) {
        setParsedEvents(data.events);
        setSummary(data.summary || "");
        setConfidence(data.confidence || 0);
        setAddedIndices(new Set());
        setViewMode("results");
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        setParseError(
          data.summary || "No events found in this message."
        );
      }
    } catch {
      setParseError("Failed to parse SMS. Please try again.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleAddToCalendar = async (event: ParsedEvent, index: number) => {
    setAddingIndex(index);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await apiRequest("POST", "/api/create-event", {
        ...event,
        timezone,
      });
      const data = await res.json();

      if (data.success) {
        setAddedIndices((prev) => new Set(prev).add(index));

        const savedEvent: SavedEvent = {
          id:
            Date.now().toString() +
            Math.random().toString(36).substr(2, 9),
          ...event,
          googleEventId: data.eventId,
          googleLink: data.htmlLink,
          createdAt: new Date().toISOString(),
          smsText: currentSmsText,
        };
        await saveEvent(savedEvent);
        await loadHistory();

        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setAddingIndex(null);
    }
  };

  const handleEditEvent = (event: ParsedEvent, index: number) => {
    const updated = [...parsedEvents];
    updated[index] = event;
    setParsedEvents(updated);
  };

  const handleDeleteHistory = async (id: string) => {
    await deleteEvent(id);
    await loadHistory();
  };

  const handleBack = () => {
    setViewMode("input");
    setParsedEvents([]);
    setSummary("");
    setConfidence(0);
    setParseError(null);
  };

  const webhookUrl = (() => {
    try {
      const base = getApiUrl();
      return new URL("/api/sms-webhook", base).toString();
    } catch {
      return "https://your-app.replit.app/api/sms-webhook";
    }
  })();

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <StatusBar style="light" />

      <View style={styles.header}>
        {viewMode === "results" ? (
          <Pressable onPress={handleBack} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <View style={styles.headerCenter}>
          <Ionicons name="calendar" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>SMS Calendar</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {viewMode === "input" && (
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setTab("auto")}
            style={[styles.tabItem, tab === "auto" && styles.tabItemActive]}
          >
            <Ionicons
              name="flash"
              size={16}
              color={tab === "auto" ? Colors.primary : Colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                tab === "auto" && styles.tabTextActive,
              ]}
            >
              Auto
            </Text>
            {webhookLogs.filter((l) => l.status === "success").length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {webhookLogs.filter((l) => l.status === "success").length}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => setTab("manual")}
            style={[styles.tabItem, tab === "manual" && styles.tabItemActive]}
          >
            <Ionicons
              name="create"
              size={16}
              color={tab === "manual" ? Colors.primary : Colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                tab === "manual" && styles.tabTextActive,
              ]}
            >
              Manual
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("calendar")}
            style={[styles.tabItem, tab === "calendar" && styles.tabItemActive]}
          >
            <Ionicons
              name="calendar-outline"
              size={16}
              color={tab === "calendar" ? Colors.primary : Colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                tab === "calendar" && styles.tabTextActive,
              ]}
            >
              Calendar
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("gateway")}
            style={[styles.tabItem, tab === "gateway" && styles.tabItemActive]}
          >
            <Ionicons
              name="server"
              size={16}
              color={tab === "gateway" ? Colors.primary : Colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                tab === "gateway" && styles.tabTextActive,
              ]}
            >
              Gateway
            </Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + webBottomInset + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {viewMode === "input" && tab === "auto" ? (
          <>
            <Pressable
              onPress={() => setShowWebhookUrl(!showWebhookUrl)}
              style={styles.setupCard}
            >
              <View style={styles.setupHeader}>
                <View style={styles.setupIconRow}>
                  <View style={styles.setupIconBg}>
                    <Ionicons name="link" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.setupTextCol}>
                    <Text style={styles.setupTitle}>Webhook Setup</Text>
                    <Text style={styles.setupSubtitle}>
                      Tap to {showWebhookUrl ? "hide" : "show"} your webhook URL
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={showWebhookUrl ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={Colors.textMuted}
                />
              </View>
              {showWebhookUrl && (
                <View style={styles.webhookDetails}>
                  <Text style={styles.webhookLabel}>
                    Set this URL in the Android SMS Gateway app:
                  </Text>
                  <View style={styles.webhookUrlBox}>
                    <Text style={styles.webhookUrl} selectable>
                      {webhookUrl}
                    </Text>
                  </View>
                  <Text style={styles.webhookHint}>
                    Long-press to copy. SMS messages forwarded here will be
                    automatically parsed and added to Google Calendar.
                  </Text>
                </View>
              )}
            </Pressable>

            <View style={styles.autoStatusRow}>
              <View style={styles.statusIndicator}>
                <View style={styles.pulseDot} />
                <Text style={styles.statusText}>Listening for SMS</Text>
              </View>
              <Pressable
                onPress={loadWebhookLogs}
                hitSlop={8}
              >
                <Ionicons name="refresh" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>

            {webhookLogs.length > 0 ? (
              <View style={styles.logsList}>
                {webhookLogs.map((log, i) => (
                  <Animated.View
                    key={log.id}
                    entering={i < 3 ? FadeInDown.delay(i * 80).duration(300) : undefined}
                  >
                    <WebhookLogItem log={log} />
                  </Animated.View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons
                  name="radio-outline"
                  size={40}
                  color={Colors.textMuted}
                />
                <Text style={styles.emptyTitle}>Waiting for messages</Text>
                <Text style={styles.emptySubtitle}>
                  Set up the Android SMS Gateway app to forward texts here
                  automatically
                </Text>
              </View>
            )}
          </>
        ) : viewMode === "input" && tab === "manual" ? (
          <>
            <View style={styles.heroSection}>
              <Text style={styles.heroTitle}>Paste a message</Text>
              <Text style={styles.heroSubtitle}>
                Paste an SMS and AI will extract event details and add them to
                your Google Calendar
              </Text>
            </View>

            <SMSInput onSubmit={handleParseSMS} isLoading={isParsing} />

            {parseError && (
              <Animated.View
                entering={FadeInDown.duration(300)}
                style={styles.errorCard}
              >
                <Ionicons
                  name="information-circle"
                  size={18}
                  color={Colors.warning}
                />
                <Text style={styles.errorText}>{parseError}</Text>
              </Animated.View>
            )}

            {history.length > 0 && (
              <Animated.View entering={FadeIn.duration(300)}>
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={Colors.textMuted}
                  />
                  <Text style={styles.sectionTitle}>Recent Events</Text>
                </View>
                <View style={styles.historyList}>
                  {history.slice(0, 10).map((item) => (
                    <HistoryItem
                      key={item.id}
                      event={item}
                      onDelete={handleDeleteHistory}
                    />
                  ))}
                </View>
              </Animated.View>
            )}

            {history.length === 0 && !isParsing && !parseError && (
              <View style={styles.emptyState}>
                <Ionicons
                  name="mail-outline"
                  size={40}
                  color={Colors.textMuted}
                />
                <Text style={styles.emptyTitle}>No events yet</Text>
                <Text style={styles.emptySubtitle}>
                  Paste an SMS message above to get started
                </Text>
              </View>
            )}
          </>
        ) : viewMode === "input" && tab === "calendar" ? (
          <CalendarView />
        ) : viewMode === "input" && tab === "gateway" ? (
          <GatewayDashboard />
        ) : (
          <>
            <Animated.View
              entering={FadeInDown.duration(300)}
              style={styles.resultsSummary}
            >
              <View style={styles.confidenceRow}>
                <View
                  style={[
                    styles.confidenceBadge,
                    confidence >= 0.7
                      ? styles.confidenceHigh
                      : confidence >= 0.4
                      ? styles.confidenceMedium
                      : styles.confidenceLow,
                  ]}
                >
                  <Text style={styles.confidenceText}>
                    {Math.round(confidence * 100)}% confidence
                  </Text>
                </View>
                <Text style={styles.eventCount}>
                  {parsedEvents.length} event
                  {parsedEvents.length !== 1 ? "s" : ""} found
                </Text>
              </View>
              {summary ? (
                <Text style={styles.summaryText}>{summary}</Text>
              ) : null}
            </Animated.View>

            <View style={styles.eventsList}>
              {parsedEvents.map((event, index) => (
                <Animated.View
                  key={index}
                  entering={SlideInUp.delay(index * 100).duration(400)}
                >
                  <EventCard
                    event={event}
                    onAddToCalendar={(e) => handleAddToCalendar(e, index)}
                    isAdding={addingIndex === index}
                    added={addedIndices.has(index)}
                    onEdit={(e) => handleEditEvent(e, index)}
                  />
                </Animated.View>
              ))}
            </View>

            {parsedEvents.length > 1 &&
              !parsedEvents.every((_, i) => addedIndices.has(i)) && (
                <Pressable
                  onPress={async () => {
                    for (let i = 0; i < parsedEvents.length; i++) {
                      if (!addedIndices.has(i)) {
                        await handleAddToCalendar(parsedEvents[i], i);
                      }
                    }
                  }}
                  style={({ pressed }) => [
                    styles.addAllButton,
                    pressed && styles.addAllButtonPressed,
                  ]}
                >
                  <Ionicons
                    name="checkmark-done"
                    size={20}
                    color={Colors.white}
                  />
                  <Text style={styles.addAllText}>Add All to Calendar</Text>
                </Pressable>
              )}

            {parsedEvents.every((_, i) => addedIndices.has(i)) && (
              <Animated.View entering={FadeInDown.duration(300)}>
                <Pressable
                  onPress={handleBack}
                  style={({ pressed }) => [
                    styles.doneButton,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={Colors.primary}
                  />
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: Colors.backgroundLight,
    borderRadius: 12,
    padding: 3,
    marginBottom: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: Colors.card,
  },
  tabText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
    paddingTop: 12,
  },
  setupCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  setupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  setupIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  setupIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  setupTextCol: {
    flex: 1,
  },
  setupTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  setupSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  webhookDetails: {
    marginTop: 14,
    gap: 8,
  },
  webhookLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  webhookUrlBox: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  webhookUrl: {
    fontSize: 13,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    color: Colors.primary,
    lineHeight: 18,
  },
  webhookHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    lineHeight: 17,
  },
  autoStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  statusText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  logsList: {
    gap: 10,
  },
  heroSection: {
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 34,
  },
  heroSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Colors.warning + "15",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning + "30",
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.warning,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  historyList: {
    gap: 8,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  resultsSummary: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  confidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceHigh: {
    backgroundColor: Colors.success + "20",
  },
  confidenceMedium: {
    backgroundColor: Colors.warning + "20",
  },
  confidenceLow: {
    backgroundColor: Colors.error + "20",
  },
  confidenceText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  eventCount: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  summaryText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  eventsList: {
    gap: 12,
  },
  addAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 14,
  },
  addAllButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  addAllText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.card,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + "40",
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
});
