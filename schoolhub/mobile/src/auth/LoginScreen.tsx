import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "./AuthContext";
import { Card, Field, Button, Note, Logo, T } from "@/ui/kit";
import { APPS, RoleKey } from "@/data/mock";

const ROLES: RoleKey[] = ["parent", "teacher", "driver", "admin", "student"];

export default function LoginScreen() {
  const { signInAs, biometricUnlock } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 32, paddingBottom: 40 }}>
      <View style={{ alignItems: "center", marginBottom: 20 }}>
        <Logo size={64} radius={18} />
        <Text style={{ fontSize: 26, fontWeight: "800", color: T.ink, marginTop: 12 }}>SIPlat</Text>
        <Text style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Your whole school, in one secure app</Text>
      </View>

      <Card>
        <Text style={{ fontSize: 16, fontWeight: "700", color: T.ink }}>Sign in</Text>
        <Text style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Access by invitation from your school</Text>
        <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@school.test" />
        <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />
        <Button title="Sign in" onPress={() => signInAs("parent")} />
        <Pressable onPress={biometricUnlock} style={{ marginTop: 10, alignItems: "center" }}>
          <Text style={{ color: T.brand, fontWeight: "700", fontSize: 13 }}>Unlock with Face ID / Fingerprint</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={{ fontSize: 14, fontWeight: "700", color: T.ink, marginBottom: 6 }}>Preview a role</Text>
        <Text style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
          This build ships with demo data so you can explore every experience. Choose a role to open its app.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ROLES.map((r) => (
            <Pressable key={r} onPress={() => signInAs(r)}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: T.line, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}>
              <Text style={{ fontSize: 15 }}>{APPS[r].em}</Text>
              <Text style={{ fontWeight: "600", fontSize: 13, color: T.ink }}>{APPS[r].title}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Note>Downloading the app never grants access — only users invited by a subscribing school can activate a real account. Google & Microsoft sign-in and SAML are supported by the school.</Note>
    </ScrollView>
  );
}
