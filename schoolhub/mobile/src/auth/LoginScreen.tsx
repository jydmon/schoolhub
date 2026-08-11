import React, { useState } from "react";
import { View, Text } from "react-native";
import { useAuth } from "./AuthContext";
import { Screen, Card, Title, Sub, Field, Button, Notice, T } from "@/ui/kit";

export default function LoginScreen() {
  const { login, biometricUnlock, error, hasStoredSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const r = await login(email, password, mfa || undefined);
    if (r?.mfaRequired) setMfaRequired(true);
    setBusy(false);
  }

  return (
    <Screen>
      <View style={{ alignItems: "center", marginVertical: 24 }}>
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: T.brand, marginBottom: 10 }} />
        <Text style={{ fontSize: 22, fontWeight: "800", color: T.ink }}>SchoolHub</Text>
      </View>
      <Card>
        <Title>Sign in</Title>
        <Sub>Access your school on the go</Sub>
        {hasStoredSession && <Button title="Unlock with Face ID / Fingerprint" onPress={biometricUnlock} />}
        <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {mfaRequired && <Field label="Authenticator code" keyboardType="number-pad" value={mfa} onChangeText={setMfa} />}
        {error ? <Notice tone="err">{error}</Notice> : null}
        <Button title={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy} />
      </Card>
      <Text style={{ color: T.muted, fontSize: 12, textAlign: "center" }}>Google & Microsoft sign-in and SAML are planned.</Text>
    </Screen>
  );
}
