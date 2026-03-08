import AsyncStorage from "@react-native-async-storage/async-storage";

export interface SavedEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string | null;
  allDay: boolean;
  googleEventId?: string;
  googleLink?: string;
  createdAt: string;
  smsText: string;
}

const EVENTS_KEY = "sms_calendar_events";

export async function getSavedEvents(): Promise<SavedEvent[]> {
  try {
    const data = await AsyncStorage.getItem(EVENTS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveEvent(event: SavedEvent): Promise<void> {
  const events = await getSavedEvents();
  events.unshift(event);
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

export async function deleteEvent(id: string): Promise<void> {
  const events = await getSavedEvents();
  const filtered = events.filter((e) => e.id !== id);
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(filtered));
}

export async function clearEvents(): Promise<void> {
  await AsyncStorage.removeItem(EVENTS_KEY);
}
