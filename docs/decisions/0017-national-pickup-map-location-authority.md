# ADR 0017 — No invented map origin

**15 October 2026 — mobile pickup map; no pricing, regional authorization or provider change.**

The Traveler's pickup location comes from an explicit selected pin, a resolved and identified departure, or a newly authorized device position. It never defaults to downtown Miami or another fixed city when GPS is missing. Failed geolocation shows a localized explanation and the existing address-search path instead of showing a misleading map and enabling confirmation. The visible pickup label must resolve for the pin's current coordinates before confirmation, and late reverse-geocoder replies may not relabel a newly moved pin.

Apple's location guidance recommends alternatives when location is unavailable: https://developer.apple.com/documentation/corelocation/configuring-your-app-to-use-location-services . This fits the existing nationwide county/routing engine without a new map vendor, manual founder involvement, subscriptions, or live data writes. The helper has an isolated synthetic test of selected pin, known departure, unknown/invalid coordinates, and old geocoder responses. Production physical iPhone validation remains separately required. Android pin-drop and browser street maps remain separate unfinished experiences.

**Council rubric:** Ford: one pure shared authority for map origin; Rockefeller: no new hosted maps fee; Jobs: no misleading location or uncontrolled pickup; NASA: test denied location on a signed phone after synthetic CI.
