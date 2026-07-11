import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { radius, spacing, typography } from "../styles/global";

/**
 * Sign-in gate shown when no Supabase session is active. Offers Google OAuth
 * and a magic-link email. Sign-in is required: the backend attributes voice
 * sessions to a user (per-user limits), so there is no anonymous escape hatch.
 */

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

export function SignInScreen() {
  const { colors } = useTheme();
  const { signInWithGoogle, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const busy = status.kind === "busy";

  const handleGoogle = async () => {
    setStatus({ kind: "busy" });
    try {
      await signInWithGoogle();
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e) });
    }
  };

  const handleMagicLink = async () => {
    if (!email.includes("@")) {
      setStatus({ kind: "error", message: "Enter a valid email address." });
      return;
    }
    setStatus({ kind: "busy" });
    try {
      await signInWithMagicLink(email);
      setStatus({ kind: "sent" });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e) });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, justifyContent: "center", padding: spacing.lg }}>
          <View style={{ alignItems: "center", marginBottom: spacing.xxl }}>
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: radius.pill,
                backgroundColor: colors.accentSoft,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.lg,
              }}
            >
              <Ionicons name="chatbubbles" size={38} color={colors.accent} />
            </View>
            <Text style={[typography.h1, { color: colors.text }]}>Small Talk</Text>
            <Text
              style={[
                typography.body,
                {
                  color: colors.textDim,
                  textAlign: "center",
                  marginTop: spacing.sm,
                },
              ]}
            >
              Sign in to practice, back up your sessions, and sync across
              devices.
            </Text>
          </View>

          {/* Google */}
          <Pressable
            onPress={handleGoogle}
            disabled={busy}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
              backgroundColor: colors.text,
              borderRadius: radius.pill,
              paddingVertical: 14,
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Ionicons name="logo-google" size={20} color={colors.bg} />
            <Text style={{ color: colors.bg, fontWeight: "700", fontSize: 15 }}>
              Continue with Google
            </Text>
          </Pressable>

          {/* Divider */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              marginVertical: spacing.lg,
            }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={[typography.tiny, { color: colors.textFaint }]}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Magic link */}
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!busy}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: 14,
              color: colors.text,
              fontSize: 15,
              marginBottom: spacing.sm,
            }}
          />
          <Pressable
            onPress={handleMagicLink}
            disabled={busy}
            style={{
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.accent,
              borderRadius: radius.pill,
              paddingVertical: 14,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                Email me a magic link
              </Text>
            )}
          </Pressable>

          {/* Status line */}
          {status.kind === "sent" && (
            <Text
              style={[
                typography.small,
                { color: colors.success, textAlign: "center", marginTop: spacing.md },
              ]}
            >
              Check your inbox — tap the link to finish signing in.
            </Text>
          )}
          {status.kind === "error" && (
            <Text
              style={[
                typography.small,
                { color: colors.danger, textAlign: "center", marginTop: spacing.md },
              ]}
            >
              {status.message}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}
