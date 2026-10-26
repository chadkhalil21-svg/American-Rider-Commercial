'use strict';

// Expo locales are also imported as Android translated string resources.
// NSPhotoLibraryUsageDescription is an iOS privacy key, but Gradle lint still
// expects an Android default when Expo emits its ES/FR/IT/DE translations.
// Add a harmless Android default without removing the translated iOS privacy
// explanations or weakening lintVitalRelease.
const { withStringsXml } = require('@expo/config-plugins');

module.exports = function withAndroidPhotoPermissionDefault(config) {
  return withStringsXml(config, (mod) => {
    const resources = mod.modResults.resources;
    const items = Array.isArray(resources.string) ? resources.string : [];
    const name = 'NSPhotoLibraryUsageDescription';
    if (!items.some((item) => item?.$?.name === name)) {
      items.push({
        $: { name },
        _: 'American Rider attaches your photo to a lost item report and lets you submit your operator documents from files you already have.',
      });
    }
    resources.string = items;
    return mod;
  });
};
