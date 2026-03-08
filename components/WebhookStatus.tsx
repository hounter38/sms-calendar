import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

interface WebhookLogEntry {
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

interface WebhookLogItemProps {
  log: WebhookLogEntry;
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

const statusConfig = {
  processing: { icon: "sync-outline" as const, color: Colors.warning, label: "Processing" },
  success: { icon: "checkmark-circle" as const, color: Colors.success, label: "Added" },
  no_events: { icon: "remove-circle-outline" as const, color: Colors.textMuted, label: "No events" },
  error: { icon: "alert-circle" as const, color: Colors.error, label: "Error" },
};

export default function WebhookLogItem({ log }: WebhookLogItemProps) {
  const config = statusConfig[log.status];

  const handleOpenLink = (link: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Linking.openURL(link);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.statusDot}>
          <Ionicons name={config.icon} size={16} color={config.color} />
        </View>
        <View style={styles.info}>
          <View style={styles.senderRow}>
            <Text style={styles.sender} numberOfLines={1}>{log.from}</Text>
            <Text style={styles.time}>
              {formatDate(log.receivedAt)} {formatTime(log.receivedAt)}
            </Text>
          </View>
          <Text style={styles.smsPreview} numberOfLines={2}>
            {log.smsText}
          </Text>
        </View>
      </View>

      {log.status === "success" && log.events.length > 0 && (
        <View style={styles.eventsCreated}>
          {log.events.map((event: any, i: number) => (
            <View key={i} style={styles.createdEvent}>
              <Ionicons name="calendar" size={13} color={Colors.success} />
              <Text style={styles.createdEventTitle} numberOfLines={1}>
                {event.title}
              </Text>
              {log.googleLinks[i] ? (
                <Pressable
                  onPress={() => handleOpenLink(log.googleLinks[i])}
                  hitSlop={6}
                >
                  <Ionicons name="open-outline" size={14} color={Colors.primary} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {log.status === "no_events" && log.summary ? (
        <Text style={styles.noEventsSummary}>{log.summary}</Text>
      ) : null}

      {log.status === "error" && log.error ? (
        <Text style={styles.errorText}>{log.error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  statusDot: {
    marginTop: 2,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  senderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sender: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    flex: 1,
  },
  time: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginLeft: 8,
  },
  smsPreview: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  eventsCreated: {
    marginLeft: 26,
    gap: 6,
  },
  createdEvent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.success + "12",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  createdEventTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    flex: 1,
  },
  noEventsSummary: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginLeft: 26,
    lineHeight: 17,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.error,
    marginLeft: 26,
  },
});
