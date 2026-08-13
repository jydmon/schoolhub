import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "./AuthContext";
import { Card, Field, Button, Note, Logo, T } from "@/ui/kit";

function PasswordField({ label, value, onChangeText, placeholder }: any) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>{label}</Text>
      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          style={{ borderWidth: 1, borderColor: T.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, paddingRight: 62, fontSize: 15, color: T.ink, backgroundColor: "#fff" }}
          secureTextEntry={!show} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false}
        />
        <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} style={{ position: "absolute", right: 12 }}>
          <Text style={{ color: T.brand, fontWeight: "700", fontSize: 13 }}>{show ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const { login, submitEnroll, submitNewPassword, deferPassword, biometricUnlock, error, mfaRequired, enroll, expired, hasStoredSession } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  const wrap = (fn: () => Promise<void>) => async () => { setBusy(true); await fn(); setBusy(false); };

  const Header = (
    <View style={{ alignItems: "center", marginBottom: 20 }}>
      <Logo size={64} radius={18} />
      <Text style={{ fontSize: 26, fontWeight: "800", color: T.ink, marginTop: 12 }}>SIPlat</Text>
      <Text style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Your whole school, in one secure app</Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 34, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {Header}

      {enroll ? (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: "700", color: T.ink }}>Set up two-factor authentication</Text>
          <Text style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Your organisation requires MFA. Add this key to an authenticator app (Google Authenticator, Authy, 1Password), then enter the 6-digit code.</Text>
          <View style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: T.line, borderRadius: 10, padding: 10, marginTop: 10 }}>
            <Text style={{ fontSize: 11, color: T.muted }}>Setup key</Text>
            <Text selectable style={{ fontFamily: "monospace" as any, fontSize: 13, color: T.ink, marginTop: 2 }}>{enroll.secret}</Text>
          </View>
          <Field label="Authenticator code" keyboardType="number-pad" value={code} onChangeText={setCode} placeholder="6-digit code" />
          {error ? <Note>{error}</Note> : null}
          <Button title={busy ? "Verifying…" : "Verify & continue"} disabled={busy || !code} onPress={wrap(() => submitEnroll(code))} />
        </Card>
      ) : expired ? (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: "700", color: T.ink }}>Your password has expired</Text>
          <Text style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>For security, please choose a new password to continue.</Text>
          <PasswordField label="New password" value={newPw} onChangeText={setNewPw} placeholder="At least 8 characters" />
          {error ? <Note>{error}</Note> : null}
          <Button title={busy ? "Updating…" : "Update password"} disabled={busy || newPw.length < 8} onPress={wrap(() => submitNewPassword(newPw))} />
          {expired.canDefer ? (
            <Pressable onPress={wrap(deferPassword)} style={{ marginTop: 12, alignItems: "center" }}>
              <Text style={{ color: T.brand, fontWeight: "700", fontSize: 13 }}>Remind me later</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: "700", color: T.ink }}>Sign in</Text>
          <Text style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Access by invitation from your school</Text>
          <Field label="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@school.test" />
          <PasswordField label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" />
          {mfaRequired ? <Field label="Authenticator code" keyboardType="number-pad" value={mfa} onChangeText={setMfa} placeholder="6-digit code" /> : null}

          <Pressable onPress={() => setRemember((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: remember ? T.brand : T.line, backgroundColor: remember ? T.brand : "#fff", alignItems: "center", justifyContent: "center" }}>
              {remember ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>✓</Text> : null}
            </View>
            <Text style={{ fontSize: 13, color: T.ink }}>Keep me logged in on this device</Text>
          </Pressable>

          {error ? <Note>{error}</Note> : null}
          <Button title={busy ? "Signing in…" : mfaRequired ? "Verify & sign in" : "Sign in"} disabled={busy || !email || !password} onPress={wrap(() => login(email, password, mfa || undefined, remember))} />
          {busy ? <ActivityIndicator color={T.brand} style={{ marginTop: 10 }} /> : null}

          {hasStoredSession ? (
            <Pressable onPress={wrap(biometricUnlock)} style={{ marginTop: 12, alignItems: "center" }}>
              <Text style={{ color: T.brand, fontWeight: "700", fontSize: 13 }}>Unlock with Face ID / Fingerprint</Text>
            </Pressable>
          ) : null}
        </Card>
      )}

      <Note>Connects to your school on dev.siplat.com. Downloading the app never grants access — only users invited by a subscribing school can sign in.</Note>
    </ScrollView>
  );
}
