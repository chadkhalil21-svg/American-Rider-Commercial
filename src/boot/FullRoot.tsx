// Exact former Expo Router root, moved behind the guarded app/_layout.tsx loader.
// Keep all routes, auth, payments, Operator state and background services unchanged.
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-mono';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { onNotificationTap, recoverLastNotificationTap, registerForPush } from '../backend/push';
import { pingSweep } from '../backend/heartbeat';
import { AuthScreen } from '../screens/AuthScreen';
import { AuthProvider, useAuth } from '../state/AuthContext';
import { LanguageProvider } from '../state/LanguageContext';
import { PaymentConfigProvider } from '../state/PaymentConfigContext';
import { OperatorProvider } from '../state/OperatorContext';
import { RideProvider } from '../state/RideContext';
import { VoiceProvider } from '../state/VoiceContext';
import { colors } from '../theme';

// The Stack is always mounted (so expo-router routing works). Until the user is
// signed in, the sign-up screen is shown as a full-screen overlay on top of it.
function AppGate() {
  const { user, initializing, onboarding } = useAuth();
  const router = useRouter();

  // DESIGN REVIEW BYPASS — web preview only. This never runs in native builds and is
  // inert unless the Render preview explicitly enables it. Add ?preview=app to the
  // preview URL to inspect signed-in surfaces without changing or weakening Firebase.
  const webPreviewBypass =
    Platform.OS === 'web' &&
    process.env.EXPO_PUBLIC_AUTH_PREVIEW_BYPASS === '1' &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'app';

  // REGISTERED ONCE THERE IS AN ACCOUNT TO REGISTER AGAINST, not at launch. The token is
  // stored on `users/{uid}`, so asking before sign-in would have nowhere to put it — and
  // asking a stranger for permission to notify them is the wrong first impression besides.
  //
  // Web has no push, and a simulator has no token; both return a reason rather than an error.
  // Nothing here blocks the app: a refusal costs notifications, not the product.
  useEffect(() => {
    if (!user || onboarding || Platform.OS === 'web') return;
    registerForPush();
    // And wake the server on the way past. A free instance that has been idle takes about
    // thirty seconds to come up; doing it now means the first real request does not wait.
    pingSweep();
  }, [user, onboarding]);

  // Tapping a notification opens the thing it was about.
  useEffect(() => {
    if (Platform.OS === 'web' || !user || initializing || onboarding) return;
    let mounted = true;
    const open = (data: Record<string, unknown>) => {
      if (!mounted) return;
      // A push is untrusted external input. Authenticate its recipient; navigate
      // only to existing safe destinations. No acceptance or payment action here.
      const recipientUid = typeof data?.recipientUid === 'string' ? data.recipientUid : null;
      if (!user || !recipientUid || recipientUid !== user.uid) return;
      const screen = typeof data?.screen === 'string' ? data.screen : null;
      // Keep the list explicit and auditable. Every route is a real screen
      // authored by our notification publishers. A push may NAVIGATE only;
      // it never accepts Travel, transfers funds, or bypasses account security.
      const allowed = new Set([
        '/ride', '/receipt', '/operator', '/operator/insurance', '/family',
        '/operator/trip', '/emergency', '/wallet', '/',
      ]);
      if (screen && allowed.has(screen)) router.navigate(screen as never);
    };
    const unsubscribe = onNotificationTap(open);
    // Expo may have launched us FROM a notification before React subscribed.
    // Its persistent last response is replayed only once and then cleared.
    void recoverLastNotificationTap(open);
    return () => { mounted = false; unsubscribe(); };
  }, [router, user?.uid, initializing, onboarding]);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: Platform.OS === 'web' ? 'none' : 'fade',
        }}
      />
      {initializing ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, zIndex: 10 }]} />
      ) : (!user || onboarding) && !webPreviewBypass ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
          <AuthScreen />
        </View>
      ) : null}
    </View>
  );
}

// ONE ACCOUNT'S STATE NEVER REACHES THE NEXT ACCOUNT. The stores below hold a traveler's
// live travel, operator qualification and revenue in memory. They were mounted once at the
// root and never keyed on who was signed in, so signing out and signing in as somebody else
// left all of it in place — a second Operator sharing a handset saw the first one's travel.
// Keying the subtree on the uid makes React unmount and rebuild it whenever the account
// changes, which is the only way to be sure nothing is carried across.
function AccountScope({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <React.Fragment key={user?.uid ?? 'signed-out'}>{children}</React.Fragment>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <LanguageProvider>
    <AuthProvider>
      <AccountScope>
      <PaymentConfigProvider>
      <RideProvider>
      <OperatorProvider>
      <VoiceProvider>
        <StatusBar style="dark" />
        {Platform.OS === 'web' ? (
          <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center' }}>
            <View
              style={{
                flex: 1,
                width: '100%',
                maxWidth: 430,
                backgroundColor: colors.bg,
                boxShadow: '0 0 32px rgba(20, 23, 31, 0.10)',
              }}
            >
              <AppGate />
            </View>
          </View>
        ) : (
          <AppGate />
        )}
      </VoiceProvider>
      </OperatorProvider>
      </RideProvider>
      </PaymentConfigProvider>
      </AccountScope>
    </AuthProvider>
    </LanguageProvider>
  );
}
