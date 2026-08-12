import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "./AuthContext";
import { Card, Field, Button, Note, Logo, T } from "@/ui/kit";

export default function LoginScreen() {
  const { login, biometricUnlock, error, mfaRequired, hasStoredSession } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await login(email, password, mfa || undefined);
    setBusy(false);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 36, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: "center", marginBottom: 22 }}>
        <Logo size={64} radius={18} />
        <Text style={{ fontSize: 26, fontWeight: "800", color: T.ink, marginTop: 12 }}>SIPlat</Text>
        <Text style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Your whole school, in one secure app</Text>
      </View>

      <Card>
        <Text style={{ fontSize: 16, fontWeight: "700", color: T.ink }}>Sign in</Text>
        <Text style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Access by invitation from your school</Text>

        <Field label="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@school.test" />
        <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />
        {mfaRequired ? (
          <Field label="Authenticator code" keyboardType="number-pad" value={mfa} onChangeText={setMfa} placeholder="6-digit code" />
        ) : null}

        {error ? <Note>{error}</Note> : null}

        <Button title={busy ? "Signing in…" : mfaRequired ? "Verify & sign in" : "Sign in"} onPress={submit} disabled={busy || !email || !password} />
        {busy ? <ActivityIndicator color={T.brand} style={{ marginTop: 10 }} /> : null}

        {hasStoredSession ? (
          <Pressable onPress={biometricUnlock} style={{ marginTop: 12, alignItems: "center" }}>
            <Text style={{ color: T.brand, fontWeight: "700", fontSize: 13 }}>Unlock with Face ID / Fingerprint</Text>
          </Pressable>
        ) : null}
      </Card>

      <Note>
        Connects to your school on dev.siplat.com. Downloading the app never grants access — only users invited by a subscribing school can sign in. Google & Microsoft sign-in and SAML are supported by your school.
      </Note>
    </ScrollView>
  );
}
