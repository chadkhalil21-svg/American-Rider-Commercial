// P0 launch-safe bootstrap. This file intentionally imports no application
// state, authentication, payment, push, background tracking or optional widgets.
// One of those modules may throw synchronously before the first React screen
// appears on a physical iPhone. Eager ES imports cannot be protected by a
// React ErrorBoundary. Load the unchanged full root *inside* a try/catch.
// A failed boot shows an actionable on-device error instead of a blank splash.
import React from 'react';
import { getStartupCopy } from '../src/i18n/startup';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Failure = { title: string; diagnostic: string };

function describeFailure(error: unknown): Failure {
  const source = error && typeof error === 'object'
    ? error as { name?: unknown; message?: unknown; code?: unknown }
    : null;
  const name = typeof source?.name === 'string' ? source.name : 'StartupError';
  const code = typeof source?.code === 'string' ? source.code : '';
  const message = typeof source?.message === 'string' ? source.message
    : typeof error === 'string' ? error : getStartupCopy().generic;
  // Display only short, locally visible diagnostics. No network telemetry, API
  // keys, credentials or personal information. The original exception remains
  // accessible through the device's Apple diagnostics when available.
  const safe = (value: string) => value
    .replace(/https?:[^ ]+/gi, '[URL]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?:sk_live_|pk_live_|AIza)[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .slice(0, 180);
  return { title: safe(code || name), diagnostic: safe(message) };
}

function BootFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const info = describeFailure(error);
  const copy = getStartupCopy();
  return (
    <View style={styles.page}>
      <Text style={styles.brand}>AMERICAN RIDER</Text>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <Text selectable style={styles.code}>{'AR-BOOT · '}{info.title}</Text>
      <Text selectable style={styles.detail}>{info.diagnostic}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={styles.button}>
        <Text style={styles.buttonText}>{copy.tryAgain}</Text>
      </Pressable>
      <Text style={styles.note}>{copy.note}</Text>
    </View>
  );
}

class StartupBoundary extends React.Component<
  { children: React.ReactNode; onRetry: () => void },
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error !== null) {
      return <BootFailure error={this.state.error} onRetry={this.props.onRetry} />;
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const [attempt, setAttempt] = React.useState(0);
  const retry = () => setAttempt((n: number) => n + 1);
  let FullRoot: React.ComponentType;
  try {
    // Metro knows this static require, but does not evaluate its module until
    // we reach this guarded statement. Catches module evaluation failures that
    // an ordinary React ErrorBoundary cannot catch.
    FullRoot = (require('../src/boot/FullRoot') as {
      default: React.ComponentType;
    }).default;
    if (!FullRoot) throw new Error('full-root-unavailable');
  } catch (error) {
    return <BootFailure error={error} onRetry={retry} />;
  }
  return (
    <StartupBoundary key={attempt} onRetry={retry}>
      <FullRoot />
    </StartupBoundary>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8F9FB', paddingHorizontal: 28,
    justifyContent: 'center' },
  brand: { fontSize: 12, fontWeight: '700', letterSpacing: 2,
    color: '#19223B', marginBottom: 40 },
  title: { fontSize: 22, fontWeight: '600', color: '#14171F', marginBottom: 15 },
  body: { fontSize: 15, lineHeight: 24, color: '#414958', marginBottom: 25 },
  code: { fontSize: 14, fontWeight: '600', color: '#19223B',
    marginBottom: 12 },
  detail: { fontSize: 12, lineHeight: 19, color: '#505B6C', marginBottom: 28 },
  button: { alignSelf: 'flex-start', backgroundColor: '#19223B',
    paddingHorizontal: 25, paddingVertical: 14, borderRadius: 5 },
  buttonText: { fontSize: 15, color: '#FFFFFF', fontWeight: '600' },
  note: { fontSize: 12, lineHeight: 20, color: '#697284',
    marginTop: 25 },
});
