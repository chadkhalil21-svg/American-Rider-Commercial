// The Live Activity — American Rider on the lock screen and in the Dynamic Island.
//
// WHY IT EXISTS (Chad, 23 Aug 2026). A traveler who leaves the app during a travel loses every
// signal about it: no operator, no status, no time, until they think to reopen. The point of a
// journey underway is that it should need no attention, and the app was the only place that
// knew anything about one.
//
// WHAT IT SAYS, AND WHAT IT REFUSES TO. Three facts and no adjectives: who is coming, what
// stage the travel is at, and how long. A lock screen is where editorialising is most tempting
// — "Almost there!", "Your ride is on the way!" — and the rubric forbids exactly that. Nothing
// here says anything it could not defend.
//
// THE TIME IS OMITTED RATHER THAN GUESSED. `minutes` is optional, and where the app has no
// live figure the line does not appear. An invented countdown is worse than none: it is a
// promise about a time nobody measured, on a surface the traveler cannot interrogate.
//
// THE TYPE IS THE SAME PALETTE AS THE APP. IBM Plex Mono is reserved for prices and travel
// numbers there, and the same rule holds here — the Travel Number is monospaced, everything
// else is the system font.
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundColor, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityLayout } from 'expo-widgets';

export type TravelActivityProps = {
  /** 'assigned' | 'accepted' | 'arrived' | 'onboard' — the operator's own progress. */
  stage: string;
  /** The operator's name as the traveler will read it. Empty is allowed; never invented. */
  operator: string;
  /** Where the travel ends. */
  destination: string;
  /** Minutes remaining, when the app actually has a figure. Omitted rather than guessed. */
  minutes?: number;
  /** The Travel Number, so the lock screen and the app agree on what this is. */
  tripNo: string;
};

// In Expo's isolated widget runtime, the layout function may not close over
// module-level values or helper functions. Keep display helpers local to the
// function marked 'widget' so its serialized bundle is self-contained.

// THE DIRECTIVE GOES INSIDE THE FUNCTION, and it is 'widget' — not 'use widget' at the top of
// the file. I wrote the latter, which is not a directive expo-widgets recognises, so the layout
// was shipped as an ordinary JS function and the native constructor was handed something it
// could not cast. The app crashed at module load with ArgumentCastException, on both devices,
// before a single screen rendered.
//
// It crashed on IMPORT, which is worse than it sounds: liveActivity.ts imports this file and
// RideContext imports that, so a mistake in a lock-screen decoration took the entire
// application down. The wrapping in liveActivity.ts protects every CALL and could not protect
// the import.
function TravelActivityLayout(props: TravelActivityProps): LiveActivityLayout {
  'widget';
  // The extension runs this function in isolation from the app's React Native
  // runtime; globals, module-level constants and functions are not available.
  const MUTED = '#8A8A82';
  const INK = '#14171F';
  const mins = (p: TravelActivityProps) =>
    typeof p.minutes === 'number' && p.minutes > 0 ? p.minutes : null;
  const headline = (p: TravelActivityProps): string => {
    if (p.stage === 'arrived') return 'Your operator has arrived';
    if (p.stage === 'onboard') return `To ${p.destination}`;
    return 'Your operator is on the way';
  };
  const detail = (p: TravelActivityProps): string => {
    const m = mins(p);
    const who = p.operator || '';
    if (p.stage === 'onboard') return m ? `${m} min remaining` : p.tripNo;
    if (who && m) return `${who} · ${m} min`;
    return who || (m ? `${m} min` : p.tripNo);
  };
  return {
    // The lock screen: the letterhead's own hierarchy — the eyebrow, the fact, the detail.
    banner: (
      <HStack modifiers={[padding({ all: 15 })]}>
        <VStack alignment="leading" spacing={3}>
          <Text
            modifiers={[font({ size: 10.5, weight: 'semibold' }), foregroundColor(MUTED)]}
          >
            AMERICAN RIDER
          </Text>
          <Text modifiers={[font({ size: 17, weight: 'semibold' }), foregroundColor(INK)]}>
            {headline(props)}
          </Text>
          <Text modifiers={[font({ size: 13 }), foregroundColor(MUTED)]}>{detail(props)}</Text>
        </VStack>
        <Spacer />
      </HStack>
    ),

    // Dynamic Island, compact. A mark on one side; on the other, the only number that changes.
    compactLeading: (
      <Text modifiers={[font({ size: 12, weight: 'semibold' })]}>AR</Text>
    ),
    compactTrailing: (
      <Text modifiers={[font({ size: 12, weight: 'semibold' })]}>
        {mins(props) ? `${mins(props)}m` : '·'}
      </Text>
    ),
    minimal: <Text modifiers={[font({ size: 11, weight: 'semibold' })]}>AR</Text>,

    // Expanded: the same three facts, given room. Never a fourth.
    expandedLeading: (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 11 }), foregroundColor(MUTED)]}>
          {props.stage === 'onboard' ? 'Destination' : 'Operator'}
        </Text>
        <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>
          {props.stage === 'onboard' ? props.destination : props.operator || props.tripNo}
        </Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2}>
        <Text modifiers={[font({ size: 11 }), foregroundColor(MUTED)]}>
          {mins(props) ? 'Remaining' : 'Travel'}
        </Text>
        <Text
          modifiers={[
            // Mono for the travel number and nothing else, exactly as in the app.
            mins(props)
              ? font({ size: 15, weight: 'semibold' })
              : font({ size: 13, weight: 'semibold', design: 'monospaced' }),
          ]}
        >
          {mins(props) ? `${mins(props)} min` : props.tripNo}
        </Text>
      </VStack>
    ),
    expandedCenter: (
      <Text modifiers={[font({ size: 13, weight: 'semibold' })]}>{headline(props)}</Text>
    ),
  };
}

export const TravelActivity = createLiveActivity<TravelActivityProps>(
  'TravelActivity',
  TravelActivityLayout,
);
