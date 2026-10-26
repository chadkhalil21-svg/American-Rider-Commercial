'use strict';
const assert=require('node:assert/strict');

const saved=process.env.EXPO_PUBLIC_NATIVE_VOICE_ENABLED;
const configFile=require.resolve('../react-native.config.js');
try{
  delete process.env.EXPO_PUBLIC_NATIVE_VOICE_ENABLED;
  delete require.cache[configFile];
  const disabled=require(configFile);
  assert.equal(disabled.dependencies['@twilio/voice-react-native-sdk'].platforms.android,null,
    'Production Android must not autolink unprovisioned Twilio Voice, which crashes on startup.');
  const expoDefault=require('../app.config.js');
  assert.ok(!expoDefault.plugins.some(p=>JSON.stringify(p).includes('@twilio/voice-react-native-sdk')),
    'The Twilio Expo lifecycle config plugin must not run when Voice is unprovisioned.');

  process.env.EXPO_PUBLIC_NATIVE_VOICE_ENABLED='true';
  delete require.cache[configFile];
  const enabled=require(configFile);
  assert.ok(!enabled.dependencies['@twilio/voice-react-native-sdk'],
    'Provisioned Voice must remain eligible for Twilio native linking and lifecycle setup.');
  console.log('Native Voice production autolink guard: PASS; iOS and provisioned Android unchanged.');
}finally{
  if(saved===undefined)delete process.env.EXPO_PUBLIC_NATIVE_VOICE_ENABLED;
  else process.env.EXPO_PUBLIC_NATIVE_VOICE_ENABLED=saved;
  delete require.cache[configFile];
}
