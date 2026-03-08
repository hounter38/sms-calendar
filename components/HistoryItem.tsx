import React from "react";
import { View, Text, Pressable, StyleSheet, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import type { SavedEvent } from "@/lib/storage";

interface HistoryItemProps {
  event: SavedEvent;
  onDelete: (id: string) => void;
}

function formatShortDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
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

export default function HistoryItem({ event, onDelete }: HistoryItemProps) {
  const handleOpen = () => {
    if (event.googleLink) {
      Linking.openURL(event.googleLink);
    }
  };

  const handleDelete = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onDelete(event.id);
  };

  return (
    <View style={styles.container}>
      <View style={styles.dateColumn}>
        <Text style={styles.dateText}>{formatShortDate(event.startDate)}</Text>
        {!event.allDay && (
          <Text style={styles.timeText}>{formatTime(event.startDate)}</Text>
        )}
      </View>
      <View style={styles.divider} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>
        {event.location && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.locationText} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        {event.googleLink && (
          <Pressable onPress={handleOpen} hitSlop={8}>
            <Ionicons name="open-outline" size={18} color={Colors.primary} />
          </Pressable>
        )}
        <Pressable onPress={handleDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  dateColumn: {
    width: 48,
    alignItems: "center",
  },
  dateText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  timeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.cardBorder,
    marginHorizontal: 12,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: 14,
    marginLeft: 8,
  },
});
