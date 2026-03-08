import React, { useState } from "react";
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

interface SMSInputProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
}

export default function SMSInput({ onSubmit, isLoading }: SMSInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (!text.trim() || isLoading) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onSubmit(text.trim());
  };

  const handleClear = () => {
    setText("");
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <Ionicons
          name="chatbubble-outline"
          size={18}
          color={Colors.textMuted}
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Paste or type your SMS message..."
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!isLoading}
        />
        {text.length > 0 && !isLoading && (
          <Pressable onPress={handleClear} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={handleSubmit}
        disabled={!text.trim() || isLoading}
        style={({ pressed }) => [
          styles.submitButton,
          (!text.trim() || isLoading) && styles.submitButtonDisabled,
          pressed && styles.submitButtonPressed,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Ionicons name="sparkles" size={22} color={Colors.white} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  inputIcon: {
    marginTop: 3,
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 80,
    maxHeight: 160,
    lineHeight: 22,
  },
  clearButton: {
    marginTop: 2,
    padding: 2,
  },
  submitButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    backgroundColor: Colors.cardBorder,
  },
  submitButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
