// American Rider — the front door, styled EXACTLY like the founders' web demo
// (Chad's spec, 8 Aug 2026): logo mark, wordmark lockup, "Safe. Reliable. American.",
// solid-ink Create Account, ghost Sign In, and the legal line, over real Firebase email
// auth. The demo's OR divider and Continue with Apple / Google / Email were removed on
// 13 Aug for App Store review — see the note at the buttons for why, and how to restore
// Sign in with Apple after launch.
//
// The legal line links to LEGAL_URL (Cloudflare Pages), NOT the Render backend: App
// Review opens those links and the free-tier server sleeps. See src/config.ts.
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../components/AppText';
import { Screen } from '../components/UI';
import { LEGAL_URL, PAYMENT_SERVER_URL } from '../config';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';

import { appleSignInAvailable, signInWithApple } from '../state/appleSignIn';
import { googleSignInConfigured, useGoogleSignIn } from '../state/googleSignIn';

// DESIGN PREVIEW ONLY, AND OFF UNLESS A BUILD ASKS FOR IT. Chad asked (13 Sept 2026) to see
// the Apple and Google controls rendered before the Firebase client ids exist, so that the
// layout can be judged now. A control that cannot do what it says is what review guideline
// 2.1 rejects and what got the previous social row removed in August — so it is gated behind
// a variable no production profile sets. eas.json's build profiles do not define it, which
// means TestFlight and the App Store builds render these buttons only when they genuinely
// work. Set EXPO_PUBLIC_SSO_PREVIEW=1 on a local simulator build to see the full layout.
const SSO_PREVIEW = process.env.EXPO_PUBLIC_SSO_PREVIEW === '1';

import { useAuth } from '../state/AuthContext';
import { savePendingInvite } from '../backend/referralPending';
import { useLanguage } from '../state/LanguageContext';
import { colors } from '../theme';

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

type Step = 'welcome' | 'signin' | 'signup' | 'select';

function InkButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.btn,
        disabled ? s.btnDisabled : s.btnInk,
        pressed && !disabled && { opacity: 0.86 },
      ]}
    >
      <Text style={[s.btnText, disabled ? s.btnTextDisabled : s.btnTextInk]}>{label}</Text>
    </Pressable>
  );
}

// A single-sign-on control with an official Google gradient G and the app's
// existing bordered 46pt layout. The Apple fallback below is preview-only.
// Chad's instruction (13 Sept 2026) was explicit — no consumer brand colours on this screen.
// GOOGLE'S HOOK THROWS DURING RENDER WHEN NO CLIENT ID IS CONFIGURED — "Client Id property
// `iosClientId` must be defined" — and it took the whole app down on launch, because a hook
// cannot be called conditionally and my guard sat inside the press handler instead. The hook
// lives in this component, and the parent mounts the component only when the ids exist, so
// the unconfigured case never reaches it. Found by running the build, not by reading it.
function GoogleEntry({ label, onFailed, onStart }: { label: string; onFailed: () => void; onStart: () => void }) {
  const google = useGoogleSignIn();
  if (!google.ready) return null;
  return (
    <SsoButton
      label={label}
      glyph="google"
      onPress={async () => {
        onStart();
        const r = await google.signIn();
        if (!r.ok && !r.cancelled) onFailed();
      }}
    />
  );
}

// The OS supplies the official Apple sign-in artwork in every production iOS build.
// This custom control is for Google and explicitly opted-in non-production previews only.
function SsoButton({
  label,
  onPress,
  glyph,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  glyph: 'apple' | 'google';
  primary?: boolean;
}) {
  const onDark = primary ? '#FFFFFF' : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.btn, s.ssoButton, primary ? s.btnInk : s.btnSso, pressed && { opacity: 0.86 }]}
    >
      <View style={s.ssoInner}>
        {glyph === 'apple' ? (
          <Svg width={17} height={17} viewBox="0 0 24 24">
            <Path
              d="M17.05 12.54c.02-2.3 1.88-3.4 1.96-3.45-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.28-1.61 2.8-.41 6.94 1.16 9.21.77 1.11 1.68 2.36 2.88 2.31 1.16-.05 1.6-.75 3-.75s1.79.75 3.01.72c1.24-.02 2.03-1.13 2.79-2.25.88-1.29 1.24-2.54 1.26-2.6-.03-.01-2.42-.93-2.44-3.69zM14.8 5.4c.64-.78 1.07-1.85.95-2.93-.92.04-2.03.61-2.69 1.38-.59.69-1.11 1.79-.97 2.84 1.03.08 2.07-.52 2.71-1.29z"
              fill={onDark}
            />
          </Svg>
        ) : (
          // Source: Google's current official multicolor sign-in mark. A
          // monochrome, hand-drawn G is forbidden by Google brand guidelines.
          // Keep its 1:1 aspect ratio and the existing 46pt button geometry.
          <Image
            source={{ uri: 'https://developers.google.com/static/identity/images/g-logo.png' }}
            style={s.googleOfficialMark}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        )}
        <Text style={[s.btnText, primary ? s.btnTextInk : s.btnTextSso]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.btn, s.btnGhost, pressed && { opacity: 0.86 }]}
    >
      <Text style={[s.btnText, s.btnTextGhost]}>{label}</Text>
    </Pressable>
  );
}

// A sentence whose LINKS ARE PLACED BY THE TRANSLATION, not glued around it.
//
// The legal line used to be assembled as [English lead-in][link][connector][link]["."], which
// only works if every language puts the two documents in that order with that punctuation.
// Spanish does not ("los Términos ... y la Política"), German does not, and the front door
// duly shipped "By continuing you accept the Términos del Servicio" — half a sentence in each
// language. So the whole sentence is one key with two placeholders, and this splices the
// pressable link nodes back in wherever the translator put them.
function legalSentence(text: string, nodes: Record<string, React.ReactNode>) {
  const marks = Object.keys(nodes);
  const parts = text.split(new RegExp(`([${marks.join('')}])`));
  return parts.map((p, i) => (marks.includes(p) ? nodes[p] : <React.Fragment key={i}>{p}</React.Fragment>));
}

export function AuthScreen() {
  const { t, language, setLanguage, languages } = useLanguage();
  const { signUp, signIn, resetPassword, busy, error, diagnosticCode, setOnboarding } = useAuth();
  // AuthContext owns provider errors. The front door owns which flow they belong to.
  // A failure from Sign In must not be rendered as though Create Account just failed.
  // Chad's entry architecture. `appleReady` is the device's own answer, not an assumption;
  // `google.ready` is true only when this build carries the client ids Google needs.
  const [entry, setEntry] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const activeLanguage = languages.find((l) => l.code === language);
  const [appleReady, setAppleReady] = useState(false);
  const [ssoError, setSsoError] = useState('');

  useEffect(() => {
    let live = true;
    appleSignInAvailable().then((ok) => {
      if (live) setAppleReady(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  const onApple = async () => {
    setSsoError('');
    if (!appleReady) {
      setSsoError(t('auth.ssoNotConfigured'));
      return;
    }
    const r = await signInWithApple();
    // A cancel is the traveler's decision, not a failure, and is reported as nothing at all.
    if (!r.ok && !r.cancelled) setSsoError(t('auth.appleUnavailable'));
  };


  // One email field, then the password step. Phone numbers are contact information only;
  // offering them here would imply an authentication path that does not exist.
  const onContinue = () => {
    const clean = entry.trim();
    if (!emailOk(clean)) {
      setSsoError(t('traveler.errInvalidEmail'));
      return;
    }
    setSsoError('');
    setEmail(clean);
    changeCredentialStep('signin');
  };

  // null while the answer is unknown, then true or false — never assumed either way.
  const [netUp, setNetUp] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch(`${PAYMENT_SERVER_URL}/health`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live) setNetUp(d?.ok === true);
      })
      .catch(() => {
        if (live) setNetUp(false);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, []);
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [invitationError, setInvitationError] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const [authAttemptStep, setAuthAttemptStep] = useState<'signin' | 'signup' | null>(null);
  const visibleAuthError = authAttemptStep === step ? error : null;
  const visibleDiagnosticCode = authAttemptStep === step ? diagnosticCode : null;

  const changeCredentialStep = (next: 'welcome' | 'signin' | 'signup') => {
    setResetNotice('');
    setSsoError('');
    setAuthAttemptStep(null);
    setPassword('');
    setStep(next);
  };

  const firstName = name.trim().split(/\s+/)[0] || 'Traveler';
  const digits = mobile.replace(/\D/g, '');
  const canSubmit =
    emailOk(email) &&
    (step === 'signup' ? password.length >= 15 : password.length > 0) &&
    !busy &&
    (step !== 'signup' || (name.trim().length >= 2 && digits.length >= 10));
  const forgotPassword = async () => {
    setResetNotice('');
    if (!emailOk(email)) {
      setResetNotice(t('traveler.typeAddressThenTap'));
      return;
    }
    const accepted = await resetPassword(email);
    if (!accepted) return;
    setResetNotice(t('traveler.resetLinkSent', { email: email.trim() }));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setAuthAttemptStep(step === 'signup' ? 'signup' : 'signin');
    if (step === 'signup') {
      setOnboarding(true); // keep the front door up through code → role → ready
      const created = await signUp(email, password, name, mobile);
      if (!created) {
        setOnboarding(false);
        return;
      }
      setStep('select');
    } else {
      await signIn(email, password);
    }
  };

  const selectRole = async (role: 'traveler' | 'operator') => {
    if (process.env.EXPO_PUBLIC_REFERRALS_ENABLED === '1' && invitationCode.trim()) {
      // Recovery for codes shared verbally, or after store installation.
      // This is local staging, NOT a confirmed credit or commission.
      const saved = await savePendingInvite(invitationCode.trim().toUpperCase(), role);
      if (!saved) {
        setInvitationError(t('auth.invitationCodeInvalid'));
        return;
      }
    }
    setInvitationError('');
    setOnboarding(false);
    if (role === 'operator') router.navigate('/operator/qualify');
  };

  if (step === 'welcome') {
    return (
      <Screen scroll={false}>
        {/* THE WAY BACK OUT, STILL, BUT NO LONGER FIVE LINKS ACROSS THE TOP.
            Chad, 13 Sept 2026: encapsulate the language control into one restrained selector
            in the top right. The reason the five names were exposed in the first place has
            not gone away — somebody who lands in the wrong language cannot read their way to
            Menu, Settings, Language, three labels deep in a language they do not have — so
            the control still opens to the five ENDONYMS, each written in its own language.
            You do not need to read the app to find your own language in that list. What
            changes is that the list is asked for rather than shouted, and the top of the
            screen belongs to the mark again. */}
        <View style={s.langBar}>
          <Pressable
            onPress={() => setLangOpen((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('auth.languageLabel')}
            accessibilityState={{ expanded: langOpen }}
          >
            <View style={s.langTrigger}>
              <Text style={s.langTriggerText}>{activeLanguage?.label ?? 'English'}</Text>
              <Svg width={11} height={11} viewBox="0 0 24 24">
                <Path
                  d="M6 9l6 6 6-6"
                  stroke={colors.muted}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </View>
          </Pressable>
        </View>

        {langOpen && (
          <View style={s.langPanel}>
            {languages.map((l, i) => (
              <Pressable
                key={l.code}
                accessibilityRole="button"
                accessibilityLabel={l.label}
                accessibilityState={{ selected: l.code === language }}
                onPress={() => {
                  setLanguage(l.code);
                  setLangOpen(false);
                }}
                style={({ pressed }) => [s.langOption, i > 0 && s.langOptionHair, pressed && { opacity: 0.7 }]}
              >
                <Text style={[s.langName, l.code === language && s.langNameOn]}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ONE continuous column, exactly like the web demo (Chad's comparison, 9 Aug):
            logo → wordmark → eyebrow → tagline → buttons with no gap in the middle.
            The spare space sits ABOVE the logo, so the page reads as a composed whole. */}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'center' }}>
            <Image
              source={require('../../assets/splash-icon.png')}
              style={s.mark}
              resizeMode="contain"
            />
            <Text style={s.wordmark}>AMERICAN RIDER</Text>
            <Text style={s.lockupTag}>NATIONAL TRANSPORTATION</Text>
            <Text style={s.tagline}>{t('auth.tagline')}</Text>
          </View>
          {/* A MEASURED GAP, NOT A SECOND SPRING. This was `flex: 1`, which is the one
              thing Chad's directive above rules out — an elastic gap in the middle of the
              column. Measured on the deployed build at 390x844 it opened to 209px, and
              with the 267px above the logo that left 56% of the front door empty and the
              lockup drifting free of the actions it introduces.

              A fixed 56 keeps brand and actions reading as one bottom-anchored block, puts
              every remaining pixel above the logo where the directive says it belongs, and
              — unlike a spring — does not silently re-tune itself when the button count
              changes. Sign in with Apple can return without this needing a thought. */}
          <View style={{ height: 28 }} />

          {/* ONE FIELD, THEN ONE ACTION. The traveler types an address and continues; the
              next screen asks for the password and offers to create the account instead.
              It does NOT ask Firebase whether the address is already registered: email
              enumeration protection has been on by default since 15 Sept 2023 and returns
              nothing to fetchSignInMethodsForEmail, deliberately, so that a stranger cannot
              discover who holds an account. A screen that branched on the answer would
              either leak that or lie about it. */}
          {/* Email is the direct credential path. Mobile is account contact information,
              not an authentication factor, so the front door must not imply phone sign-in. */}
          <View style={s.entryRow}>
            <TextInput
              value={entry}
              onChangeText={setEntry}
              placeholder={t('auth.emailOrMobileField')}
              placeholderTextColor={colors.faint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={onContinue}
              style={s.entryInput}
            />
          </View>
          <View style={{ height: 10 }} />
          <InkButton label={t('auth.continueLabel')} onPress={onContinue} disabled={!entry.trim()} />

          {/* PRIMARY ENTRY FIRST. Email and Continue are the institutional default;
              Apple and Google follow as equivalent alternate entry methods. */}
          {(appleReady || googleSignInConfigured || SSO_PREVIEW) && (
            <View style={s.orRow}>
              <View style={s.orRule} />
              <Text style={s.orText}>{t('auth.orDivider')}</Text>
              <View style={s.orRule} />
            </View>
          )}

          {(appleReady || SSO_PREVIEW) && (
            <>
              {appleReady ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={12}
                  style={s.appleOfficialButton}
                  onPress={onApple}
                />
              ) : (
                // Non-production visual preview only. Never show a hand-drawn logo
                // in a signed iOS App Store build.
                <SsoButton label={t('auth.continueWithApple')} onPress={onApple} glyph="apple" primary />
              )}
              <View style={{ height: 10 }} />
            </>
          )}
          {(googleSignInConfigured || SSO_PREVIEW) && (
            <>
              {googleSignInConfigured ? (
                <GoogleEntry
                  label={t('auth.continueWithGoogle')}
                  onFailed={() => setSsoError(t('auth.googleUnavailable'))}
                  onStart={() => setSsoError('')}
                />
              ) : (
                <SsoButton
                  label={t('auth.continueWithGoogle')}
                  glyph="google"
                  onPress={() => setSsoError(t('auth.ssoNotConfigured'))}
                />
              )}
            </>
          )}
          {ssoError ? <Text style={s.ssoError}>{ssoError}</Text> : null}

          {/* The sentence is ONE key, not an English lead-in glued to translated link
              labels — which is what shipped, and read as "By continuing you accept the
              Términos del Servicio" on the Spanish front door. Word order differs by
              language, so the links are placed by the translation, not around it. */}
          <Text style={s.legal}>
            {legalSentence(t('traveler.byContinuingAccept', { terms: '\u0000', privacy: '\u0001' }), {
              '\u0000': (
                <Text
                  key="terms"
                  style={s.legalLink}
                  onPress={() => Linking.openURL(`${LEGAL_URL}/terms`)}
                >
                  {t('legal.termsTitle')}
                </Text>
              ),
              '\u0001': (
                <Text
                  key="privacy"
                  style={s.legalLink}
                  onPress={() => Linking.openURL(`${LEGAL_URL}/privacy`)}
                >
                  {t('legal.privacyTitle')}
                </Text>
              ),
            })}
          </Text>

          {/* THE NETWORK LINE REPORTS, IT DOES NOT ASSERT. Chad asked for an operational
              status note on the front door (13 Sept 2026). A hardcoded "Active" would be the
              same defect as a LIVE badge over a simulated car: a claim the system has not
              established. This asks the server and prints what it answered, including when
              the answer is that it cannot be reached. */}
          {netUp === false && (
            <Text style={[s.network, s.networkDown]}>
              {t('auth.networkUnreachable')}
            </Text>
          )}
        </View>
      </Screen>
    );
  }

  if (step === 'select') {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, s.selectTitle]}>{t('auth.selectAccount')}</Text>
          <Text style={[s.sub, s.selectSub]}>{t('auth.chooseWhereToBegin')}</Text>

          <Pressable
            onPress={() => { void selectRole('traveler'); }}
          >
            <View style={s.roleCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.roleTitle}>{t('auth.roleTraveler')}</Text>
                <Text style={s.roleSub}>{t('auth.roleTravelerSub')}</Text>
              </View>
              <Text style={s.roleChevron}>›</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => { void selectRole('operator'); }}
          >
            <View style={s.roleCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.roleTitle}>{t('auth.roleOperator')}</Text>
                <Text style={s.roleSub}>
                  {t('auth.roleOperatorSub')}
                </Text>
              </View>
              <Text style={s.roleChevron}>›</Text>
            </View>
          </Pressable>

          {process.env.EXPO_PUBLIC_REFERRALS_ENABLED === '1' && (
            <View style={{ marginTop: 20 }}>
              <Text style={s.roleSub}>{t('auth.invitationCodeOptional')}</Text>
              <TextInput
                accessibilityLabel="Invitation code (optional)"
                value={invitationCode}
                onChangeText={v => { setInvitationCode(v); setInvitationError(''); }}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={32}
                placeholder={t('auth.invitationCodePlaceholder')}
                placeholderTextColor={colors.faint}
                style={[s.field, { marginTop: 10, minHeight: 48 }]}
              />
              {!!invitationError && <Text accessibilityRole="alert" style={s.roleSub}>{invitationError}</Text>}
              <Text style={s.roleSub}>{t('auth.invitationCodeVerifyNote')}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
        </View>
      </Screen>
    );
  }

  const isSignup = step === 'signup';
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        <Pressable onPress={() => changeCredentialStep('welcome')} hitSlop={10}>
          <Text style={s.back}>{t('auth.back')}</Text>
        </Pressable>

        <Text style={[s.title, isSignup ? s.signupTitle : s.signInTitle]}>
          {isSignup ? t('auth.createYourAccount') : t('auth.welcomeBack')}
        </Text>
        {!isSignup && <Text style={s.sub}>{t('auth.signInToAccount')}</Text>}

        {/* The demo's labeled-field card: uppercase labels, underlined fields, one card. */}
        <View style={[s.fieldCard, isSignup ? s.signupFieldCard : s.signInFieldCard]}>
          {isSignup && (
            <View style={[s.fieldWrap, s.signupFieldWrap]}>
              <Text style={[s.fieldLabel, s.signupFieldLabel]}>{t('auth.fullNameLabel')}</Text>
              <TextInput
                style={[s.field, s.signupField]}
                placeholder="J. Reyes"
                placeholderTextColor={colors.faint}
                autoCapitalize="words"
                value={name}
                onChangeText={setName}
              />
            </View>
          )}
          {isSignup && (
            <View style={[s.fieldWrap, s.signupFieldWrap]}>
              <Text style={[s.fieldLabel, s.signupFieldLabel]}>{t('auth.mobileNumberLabel')}</Text>
              <TextInput
                style={[s.field, s.signupField]}
                placeholder="(305) 555-4417"
                placeholderTextColor={colors.faint}
                keyboardType="phone-pad"
                value={mobile}
                onChangeText={setMobile}
              />
            </View>
          )}
          <View style={[s.fieldWrap, isSignup ? s.signupFieldWrap : s.signInFieldWrap]}>
            <Text style={[s.fieldLabel, isSignup && s.signupFieldLabel]}>{t('auth.emailLabel')}</Text>
            <TextInput
              style={[s.field, isSignup ? s.signupField : s.signInField]}
              placeholder={t('traveler.emailPh')}
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (resetNotice) setResetNotice('');
              }}
            />
          </View>
          <View style={[s.fieldWrap, s.fieldWrapLast, isSignup ? s.signupFieldWrap : s.signInFieldWrap]}>
            <Text style={[s.fieldLabel, isSignup && s.signupFieldLabel]}>{t('auth.passwordLabel')}</Text>
            <TextInput
              style={[s.field, isSignup ? s.signupField : s.signInField]}
              placeholder={isSignup ? t('auth.pwNewPh') : t('traveler.yourPasswordPh')}
              placeholderTextColor={colors.faint}
              secureTextEntry
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              textContentType={isSignup ? 'newPassword' : 'password'}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
          </View>
        </View>

        {/* WAS: "A verification code will be sent by text." It will not — see the confirm
            step. Your number is stored on your profile and used for travel, which is true. */}
        {isSignup && <Text style={[s.helper, s.signupHelper]}>{t('auth.usedToReach')}</Text>}
        {/* The demo's sign-in carries this link; here it really sends the reset email. */}
        {!isSignup && (
          <>
            <Pressable
              onPress={forgotPassword}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('auth.forgotPassword')}
              style={s.forgotAction}
            >
              <Text style={s.forgot}>{t('auth.forgotPassword')}</Text>
            </Pressable>
            {resetNotice ? <Text style={s.resetNotice}>{resetNotice}</Text> : null}
          </>
        )}
        {visibleAuthError ? <Text style={s.error}>{visibleAuthError}</Text> : null}
        {Platform.OS === 'web' && process.env.EXPO_PUBLIC_AUTH_PREVIEW_BYPASS === '1' && visibleDiagnosticCode ? (
          <Text style={s.previewDiagnostic}>Preview diagnostic: {visibleDiagnosticCode}</Text>
        ) : null}

        <View style={{ flex: 1 }} />

        {isSignup && (
          <Text style={[s.legal, s.signupLegal, { marginBottom: 12 }]}>
            {legalSentence(t('traveler.byContinuingAccept', { terms: '\u0000', privacy: '\u0001' }), {
              '\u0000': (
                <Text
                  key="terms"
                  style={s.legalLink}
                  onPress={() => Linking.openURL(`${LEGAL_URL}/terms`)}
                >
                  {t('legal.termsTitle')}
                </Text>
              ),
              '\u0001': (
                <Text
                  key="privacy"
                  style={s.legalLink}
                  onPress={() => Linking.openURL(`${LEGAL_URL}/privacy`)}
                >
                  {t('legal.privacyTitle')}
                </Text>
              ),
            })}
          </Text>
        )}

        <InkButton
          label={busy ? t('auth.pleaseWait') : isSignup ? t('auth.createAccount') : t('auth.signIn')}
          onPress={submit}
          disabled={!canSubmit}
        />

        <Pressable
          onPress={() => changeCredentialStep(isSignup ? 'signin' : 'signup')}
          style={{ marginTop: isSignup ? 18 : 15, marginBottom: 6 }}
          hitSlop={8}
        >
          <Text style={s.switch}>
            {isSignup ? t('auth.alreadyHave') : t('auth.newHere')}
            <Text style={{ color: colors.blue, fontWeight: '600' }}>
              {isSignup ? t('auth.signInLink') : t('auth.createAccountLink')}
            </Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  langRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    rowGap: 4,
    paddingTop: 4,
  },
  langName: { fontSize: 12.5, color: colors.muted },
  langNameOn: { color: colors.ink, fontWeight: '600' },
  mark: { width: 72, height: 48, tintColor: colors.ink },
  wordmark: {
    marginTop: 14,
    textAlign: 'center',
    letterSpacing: 3.4,
    fontSize: 12.5,
    color: colors.ink,
    fontWeight: '600',
  },
  lockupTag: {
    marginTop: 6,
    textAlign: 'center',
    letterSpacing: 3.0,
    fontSize: 9.5,
    color: colors.faint,
    fontWeight: '600',
  },
  tagline: { textAlign: 'center', fontSize: 14.5, color: colors.ink2, letterSpacing: 0.1, marginTop: 20, lineHeight: 20 },
  // Both buttons retain the founder-approved 46pt footprint and Continue wording.
// Apple's official native control owns its logo and lettering; Google's label
// remains the approved 15pt. Signed iOS builds never render the preview Apple SVG.
  appleOfficialButton: { width: '100%', height: 46 },
  ssoButton: { width: '100%', height: 46, paddingVertical: 0, justifyContent: 'center' },
  googleOfficialMark: { width: 17, height: 17 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  btnInk: { backgroundColor: colors.ink },
  btnGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  // A DISABLED CONTROL SHOULD READ AS WAITING, NOT BROKEN (Chad, 13 Sept 2026). The filled
  // grey slab looked like a failure; an outline on paper reads as an action not yet available.
  btnDisabled: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnText: { fontSize: 15, fontWeight: '600' },
  btnTextInk: { color: '#fff' },
  btnTextGhost: { color: colors.ink, fontWeight: '500' },
  btnTextDisabled: { color: colors.faint },
  legal: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.ink2,
  },
  // NO UNDERLINE AND NO WEIGHT SHIFT (Chad, 13 Sept 2026) — the bolding read as an awkward
  // inline jump. Tone alone carries the link, which is allowed: charcoal on the muted body
  // measures 3.04:1, over the 3:1 that WCAG requires when nothing but colour separates a
  // link from its sentence, and the press state below is the second cue it also asks for.
  legalLink: { color: colors.ink, fontWeight: '500' },
  legalLinkPressed: { color: colors.ink, textDecorationLine: 'underline' },
  // A single-sign-on control: the same geometry as the ghost button, mark beside the label.
  btnSso: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  btnTextSso: { color: colors.ink },
  ssoInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 11 },
  orRule: { flex: 1, height: 1, backgroundColor: colors.hairline },
  orText: { fontSize: 12.5, color: colors.muted },
  entryRow: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  entryRowPhone: { paddingLeft: 14 },
  dialCode: {
    fontSize: 16,
    color: colors.ink2,
    marginRight: 10,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
    paddingVertical: 2,
  },
  entryInput: { flex: 1, fontSize: 15.5, color: colors.ink, height: '100%' },
  ssoError: { marginTop: 12, fontSize: 13, color: colors.ink2, textAlign: 'center', lineHeight: 19 },
  langBar: { alignItems: 'flex-end' },
  langTrigger: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  langTriggerText: { fontSize: 12.5, color: colors.ink2 },
  langPanel: {
    alignSelf: 'flex-end',
    marginTop: 2,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 13,
    paddingHorizontal: 16,
    minWidth: 148,
  },
  langOption: { paddingVertical: 13 },
  langOptionHair: { borderTopWidth: 1, borderTopColor: colors.hairline },
  network: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: colors.ink2,
  },
  networkDown: { color: colors.ink2 },
  back: { fontSize: 13.5, fontWeight: '500', color: colors.blue, paddingVertical: 4 },
  title: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: colors.ink,
    marginTop: 18,
  },
  sub: { fontSize: 13.5, color: colors.muted, marginTop: 7 },
  signInTitle: {
    fontSize: 22,
    letterSpacing: -0.25,
    marginTop: 14,
  },
  signupTitle: {
    fontSize: 22,
    letterSpacing: -0.25,
    marginTop: 14,
  },
  fieldCard: {
    marginTop: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 2,
  },
  fieldWrap: {
    paddingTop: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  fieldWrapLast: { borderBottomWidth: 0 },
  signInFieldCard: {
    marginTop: 20,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 0,
  },
  signInFieldWrap: { paddingTop: 11 },
  signInField: { paddingVertical: 10, fontSize: 15.5 },
  signupFieldCard: {
    marginTop: 20,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 0,
  },
  signupFieldWrap: { paddingTop: 10 },
  signupFieldLabel: { fontSize: 10.5, letterSpacing: 1.0 },
  signupField: { paddingVertical: 9.5, fontSize: 15.5 },
  signupHelper: { fontSize: 11.5, marginTop: 9, color: colors.muted },
  signupLegal: { fontSize: 11.5, lineHeight: 17 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1, // .1em at 11px
    color: colors.muted,
  },
  field: { paddingVertical: 12, fontSize: 16, color: colors.ink },
  previewDiagnostic: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8 },
  error: { color: colors.red, fontSize: 13.5, marginTop: 14, textAlign: 'center' },
  switch: { textAlign: 'center', fontSize: 13, color: colors.muted },
  helper: { fontSize: 12.5, color: colors.faint, marginTop: 10 },
  // Password recovery is intentionally quiet, but never visually inert.
  forgotAction: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  forgot: { fontSize: 12.5, color: colors.muted },
  resetNotice: { fontSize: 12, color: colors.ink2, marginTop: 6, lineHeight: 17 },
  selectTitle: {
    fontSize: 22,
    letterSpacing: -0.25,
    marginTop: 14,
  },
  selectSub: { fontSize: 13.5, lineHeight: 19, maxWidth: 320 },
  roleCard: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.15, color: colors.ink },
  roleSub: { fontSize: 12.5, color: colors.muted, marginTop: 4, lineHeight: 18 },
  roleChevron: { fontSize: 18, color: colors.faint },
  checkCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 26, fontWeight: '600', color: colors.green },
});
