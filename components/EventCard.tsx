import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

export interface ParsedEvent {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string | null;
  allDay: boolean;
}

interface EventCardProps {
  event: ParsedEvent;
  onAddToCalendar: (event: ParsedEvent) => void;
  isAdding: boolean;
  added: boolean;
  onEdit: (event: ParsedEvent) => void;
}

function formatDate(dateStr: string, allDay: boolean): string {
  try {
    const date = new Date(dateStr);
    if (allDay) {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function EventCard({
  event,
  onAddToCalendar,
  isAdding,
  added,
  onEdit,
}: EventCardProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editDescription, setEditDescription] = useState(event.description);
  const [editLocation, setEditLocation] = useState(event.location || "");

  const handleSaveEdit = () => {
    onEdit({
      ...event,
      title: editTitle,
      description: editDescription,
      location: editLocation || null,
    });
    setEditing(false);
  };

  const handleAdd = () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onAddToCalendar(event);
  };

  if (editing) {
    return (
      <View style={styles.card}>
        <View style={styles.editField}>
          <Text style={styles.editLabel}>Title</Text>
          <TextInput
            style={styles.editInput}
            value={editTitle}
            onChangeText={setEditTitle}
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={styles.editField}>
          <Text style={styles.editLabel}>Description</Text>
          <TextInput
            style={[styles.editInput, styles.editInputMultiline]}
            value={editDescription}
            onChangeText={setEditDescription}
            multiline
            numberOfLines={2}
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={styles.editField}>
          <Text style={styles.editLabel}>Location</Text>
          <TextInput
            style={styles.editInput}
            value={editLocation}
            onChangeText={setEditLocation}
            placeholder="No location"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={styles.editActions}>
          <Pressable
            onPress={() => setEditing(false)}
            style={styles.cancelEditButton}
          >
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
          <Pressable onPress={handleSaveEdit} style={styles.saveEditButton}>
            <Ionicons name="checkmark" size={20} color={Colors.white} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, added && styles.cardAdded]}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <View
            style={[styles.dot, added ? styles.dotAdded : styles.dotPending]}
          />
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
        </View>
        {!added && (
          <Pressable
            onPress={() => setEditing(true)}
            hitSlop={8}
          >
            <Ionicons name="create-outline" size={20} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {event.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {event.description}
        </Text>
      ) : null}

      <View style={styles.detailsRow}>
        <View style={styles.detail}>
          <Ionicons
            name="calendar-outline"
            size={14}
            color={Colors.primary}
          />
          <Text style={styles.detailText}>
            {formatDate(event.startDate, event.allDay)}
          </Text>
        </View>
        {event.location && (
          <View style={styles.detail}>
            <Ionicons
              name="location-outline"
              size={14}
              color={Colors.accent}
            />
            <Text style={styles.detailText} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}
      </View>

      {added ? (
        <View style={styles.addedBadge}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
          <Text style={styles.addedText}>Added to Calendar</Text>
        </View>
      ) : (
        <Pressable
          onPress={handleAdd}
          disabled={isAdding}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.addButtonPressed,
          ]}
        >
          {isAdding ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={18} color={Colors.white} />
              <Text style={styles.addButtonText}>Add to Calendar</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardAdded: {
    borderColor: Colors.success + "40",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotPending: {
    backgroundColor: Colors.accent,
  },
  dotAdded: {
    backgroundColor: Colors.success,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    flex: 1,
  },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
    marginLeft: 16,
  },
  detailsRow: {
    gap: 8,
    marginBottom: 14,
    marginLeft: 16,
  },
  detail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    flex: 1,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  addButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  addedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  addedText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.success,
  },
  editField: {
    marginBottom: 12,
  },
  editLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  editInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  editInputMultiline: {
    minHeight: 50,
    textAlignVertical: "top" as const,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelEditButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  saveEditButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
