// Standalone, dependency-free emergency localization.
// Deliberately does not import Firebase, expo-localization, app providers, or
// AsyncStorage. This is still usable if those modules fail during app boot.
const COPY = {
  en: {
    title: 'Unable to open American Rider',
    body: 'An application component could not initialize. No Travel was requested and no payment was made by this screen.',
    tryAgain: 'Try Again',
    note: 'Please share a screenshot of this screen with American Rider Support. You do not need to uninstall the app.',
    generic: 'Unable to finish application initialization',
  },
  es: {
    title: 'No se puede abrir American Rider',
    body: 'No se pudo iniciar un componente. Esta pantalla no solicitó ningún viaje ni realizó ningún pago.',
    tryAgain: 'Volver a intentar',
    note: 'Comparta una captura de esta pantalla con el servicio de asistencia de American Rider. No necesita desinstalar la aplicación.',
    generic: 'No se pudo completar el inicio de la aplicación',
  },
  fr: {
    title: 'Impossible d’ouvrir American Rider',
    body: 'Un composant n’a pas pu démarrer. Cet écran n’a demandé aucun trajet ni effectué aucun paiement.',
    tryAgain: 'Réessayer',
    note: 'Envoyez une capture de cet écran à l’assistance American Rider. Il est inutile de désinstaller l’application.',
    generic: 'Impossible de terminer l’initialisation de l’application',
  },
  de: {
    title: 'American Rider kann nicht geöffnet werden',
    body: 'Eine App-Komponente konnte nicht starten. Dieser Bildschirm hat weder eine Fahrt angefordert noch eine Zahlung veranlasst.',
    tryAgain: 'Erneut versuchen',
    note: 'Bitte senden Sie dem American Rider Support einen Screenshot dieses Bildschirms. Sie müssen die App nicht deinstallieren.',
    generic: 'Die App konnte nicht vollständig gestartet werden',
  },
  it: {
    title: 'Impossibile aprire American Rider',
    body: 'Un componente non è stato avviato. Questa schermata non ha richiesto corse né effettuato pagamenti.',
    tryAgain: 'Riprova',
    note: 'Condividi uno screenshot di questa schermata con l’assistenza American Rider. Non è necessario disinstallare l’app.',
    generic: 'Impossibile completare l’avvio dell’applicazione',
  },
} as const;

type StartupCopy = { title: string; body: string; tryAgain: string; note: string; generic: string };

export function getStartupCopy(): StartupCopy {
  let language = 'en';
  try {
    language = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0].toLowerCase();
  } catch {
    // Missing device locale must never cause another startup exception.
  }
  return COPY[language as keyof typeof COPY] ?? COPY.en;
}
