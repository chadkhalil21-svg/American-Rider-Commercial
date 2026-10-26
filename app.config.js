// Native calling is compiled only for an intentionally provisioned development/release build.
// Expo Go, signed-off production credentials, Android FCM and iOS APNs are independent gates.
const fs = require('node:fs');
const base = require('./app.json').expo;
const enabled = process.env.EXPO_PUBLIC_NATIVE_VOICE_ENABLED === 'true';
const googleServicesFile = process.env.AR_VOICE_GOOGLE_SERVICES_FILE;
const apsEnvironment = process.env.AR_VOICE_APNS_ENV;
if (enabled) {
  if (!googleServicesFile || !fs.existsSync(googleServicesFile))
    throw new Error('Native Voice needs AR_VOICE_GOOGLE_SERVICES_FILE from a real Firebase Android project.');
  if (!['development', 'production'].includes(apsEnvironment))
    throw new Error('Native Voice needs explicit AR_VOICE_APNS_ENV=development or production matched to iOS signing.');
}
module.exports = {
  ...base,
  android: {
    ...base.android,
    ...(enabled ? {
      googleServicesFile,
      permissions: [...base.android.permissions, 'android.permission.RECORD_AUDIO'],
    } : {}),
  },
  plugins: [
    ...base.plugins,
    './plugins/with-android-photo-permission-default',
    ...(enabled ? [[
      '@twilio/voice-react-native-sdk',
      { apsEnvironment, microphoneUsageDescription: 'American Rider uses your microphone only when you choose to answer or place a Travel call.' },
    ]] : []),
  ],
};
