import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string;
  color: string | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const EVENT_COLORS = [
  Colors.primary,
  "#8B5CF6",
  "#EC4899",
  "#F97316",
  "#3B82F6",
  "#22C55E",
  "#EAB308",
  "#06B6D4",
];

function getEventColor(index: number, colorId: string | null): string {
  if (colorId) {
    const id = parseInt(colorId, 10);
    if (!isNaN(id) && id >= 0 && id < EVENT_COLORS.length) return EVENT_COLORS[id];
  }
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}${minutes > 0 ? `:${minutes.toString().padStart(2, "0")}` : ""} ${ampm}`;
}

function formatTimeRange(start: string, end: string, allDay: boolean): string {
  if (allDay) return "All day";
  const s = formatTime(start);
  const e = formatTime(end);
  if (!s) return "";
  if (!e || s === e) return s;
  return `${s} – ${e}`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export default function CalendarView() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(
    dateKey(today.getFullYear(), today.getMonth(), today.getDate())
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (year: number, month: number) => {
    setLoading(true);
    setError(null);
    try {
      const timeMin = new Date(year, month, 1).toISOString();
      const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const res = await apiRequest("GET", `/api/calendar-events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
      } else {
        setError("Could not load events");
      }
    } catch {
      setError("Failed to connect to calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(currentYear, currentMonth);
  }, [currentYear, currentMonth, fetchEvents]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      const start = new Date(ev.startDate);
      if (isNaN(start.getTime())) continue;

      if (ev.allDay) {
        const end = new Date(ev.endDate);
        const cursor = new Date(start);
        while (cursor < end) {
          const key = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
          if (!map[key]) map[key] = [];
          map[key].push(ev);
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        const key = dateKey(start.getFullYear(), start.getMonth(), start.getDate());
        if (!map[key]) map[key] = [];
        map[key].push(ev);
      }
    }
    return map;
  }, [events]);

  const selectedEvents = useMemo(() => {
    return eventsByDate[selectedDate] || [];
  }, [eventsByDate, selectedDate]);

  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    const t = new Date();
    setCurrentYear(t.getFullYear());
    setCurrentMonth(t.getMonth());
    setSelectedDate(dateKey(t.getFullYear(), t.getMonth(), t.getDate()));
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const isCurrentMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }
  while (weeks.length > 0 && weeks[weeks.length - 1].length < 7) {
    weeks[weeks.length - 1].push(null);
  }

  const selectedParts = selectedDate.split("-");
  const selectedDay = parseInt(selectedParts[2], 10);
  const selectedMonthNum = parseInt(selectedParts[1], 10) - 1;
  const selectedYearNum = parseInt(selectedParts[0], 10);
  const selectedDateObj = new Date(selectedYearNum, selectedMonthNum, selectedDay);
  const selectedLabel = `${DAYS[selectedDateObj.getDay()]}, ${MONTHS[selectedMonthNum]} ${selectedDay}`;

  return (
    <View style={styles.container}>
      <View style={styles.monthHeader}>
        <Pressable onPress={goToPrevMonth} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Pressable onPress={goToToday} style={styles.monthTitleWrap}>
          <Text style={styles.monthTitle}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
          {!isCurrentMonth && (
            <Text style={styles.todayLink}>Today</Text>
          )}
        </Pressable>
        <Pressable onPress={goToNextMonth} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </Pressable>
      </View>

      <View style={styles.daysHeader}>
        {DAYS.map((d) => (
          <View key={d} style={styles.dayHeaderCell}>
            <Text style={[styles.dayHeaderText, (d === "Sun" || d === "Sat") && styles.weekendText]}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => {
              if (day === null) {
                return <View key={di} style={styles.dayCell} />;
              }
              const key = dateKey(currentYear, currentMonth, day);
              const isToday = key === todayKey;
              const isSelected = key === selectedDate;
              const hasEvents = !!eventsByDate[key];
              const dayEvents = eventsByDate[key] || [];
              const dotCount = Math.min(dayEvents.length, 3);

              return (
                <Pressable
                  key={di}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() => setSelectedDate(key)}
                >
                  <View style={[
                    styles.dayCircle,
                    isToday && !isSelected && styles.dayCircleToday,
                    isSelected && styles.dayCircleSelected,
                  ]}>
                    <Text style={[
                      styles.dayText,
                      isToday && !isSelected && styles.dayTextToday,
                      isSelected && styles.dayTextSelected,
                    ]}>
                      {day}
                    </Text>
                  </View>
                  <View style={styles.dotRow}>
                    {Array.from({ length: dotCount }).map((_, i) => (
                      <View
                        key={i}
                        style={[styles.eventDot, { backgroundColor: getEventColor(i, dayEvents[i]?.color) }]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      <View style={styles.eventsSection}>
        <Text style={styles.eventsSectionTitle}>{selectedLabel}</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={24} color={Colors.textMuted} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => fetchEvents(currentYear, currentMonth)} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : selectedEvents.length === 0 ? (
          <View style={styles.noEvents}>
            <Text style={styles.noEventsText}>No events</Text>
          </View>
        ) : (
          <ScrollView style={styles.eventsList} showsVerticalScrollIndicator={false}>
            {selectedEvents.map((ev, i) => (
              <Animated.View key={ev.id + i} entering={FadeInDown.delay(i * 60).duration(250)}>
                <Pressable
                  style={styles.eventItem}
                  onPress={() => {
                    if (ev.htmlLink) {
                      Linking.openURL(ev.htmlLink);
                    }
                  }}
                >
                  <View style={[styles.eventColorBar, { backgroundColor: getEventColor(i, ev.color) }]} />
                  <View style={styles.eventContent}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                    <Text style={styles.eventTime}>
                      {formatTimeRange(ev.startDate, ev.endDate, ev.allDay)}
                    </Text>
                    {ev.location && (
                      <View style={styles.eventLocationRow}>
                        <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                        <Text style={styles.eventLocation} numberOfLines={1}>{ev.location}</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name="open-outline" size={14} color={Colors.textMuted} />
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.backgroundLight,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitleWrap: {
    alignItems: "center",
  },
  monthTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  todayLink: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.primary,
    marginTop: 2,
  },
  daysHeader: {
    flexDirection: "row",
    marginBottom: 8,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  dayHeaderText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
  },
  weekendText: {
    color: Colors.textMuted + "80",
  },
  calendarGrid: {
    gap: 2,
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
    minHeight: 48,
    borderRadius: 8,
  },
  dayCellSelected: {
    backgroundColor: Colors.primary + "10",
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircleToday: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  dayCircleSelected: {
    backgroundColor: Colors.primary,
  },
  dayText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  dayTextToday: {
    color: Colors.primary,
    fontFamily: "Inter_700Bold",
  },
  dayTextSelected: {
    color: Colors.white,
    fontFamily: "Inter_700Bold",
  },
  dotRow: {
    flexDirection: "row",
    gap: 3,
    height: 6,
    marginTop: 2,
    alignItems: "center",
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 14,
  },
  eventsSection: {
    flex: 1,
    minHeight: 120,
  },
  eventsSectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  loadingContainer: {
    paddingVertical: 30,
    alignItems: "center",
  },
  errorContainer: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primary + "20",
  },
  retryText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  noEvents: {
    paddingVertical: 24,
    alignItems: "center",
  },
  noEventsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  eventsList: {
    flex: 1,
  },
  eventItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  eventColorBar: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  eventContent: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  eventTime: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  eventLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  eventLocation: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
});
