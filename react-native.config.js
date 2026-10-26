'use strict';

// The Twilio SDK is provisioned only when native calling is explicitly enabled.
// Merely importing its npm package causes Android to autolink the native module;
// without the lifecycle config plugin that module crashes the app at startup.
// Exclude Android's native Twilio package for regular production bookings until
// real FCM/VoIP prerequisites enable the SDK. Preserve iOS linkage and existing
// production/TestFlight binaries. Expo SDK 57 documents this mechanism.
const nativeVoiceEnabled=process.env.EXPO_PUBLIC_NATIVE_VOICE_ENABLED==='true';

module.exports={
  dependencies: nativeVoiceEnabled ? {} : {
    '@twilio/voice-react-native-sdk': {
      platforms: { android: null },
    },
  },
};
