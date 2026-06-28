export type AppLocale = 'sk' | 'cs'

export const DEFAULT_LOCALE: AppLocale = 'sk'

export function normalizeLocale(value: unknown): AppLocale {
  return value === 'cs' ? 'cs' : DEFAULT_LOCALE
}

export const dictionary = {
  sk: {
    overview: 'Prehľad',
    tickets: 'Tikety',
    statistics: 'Štatistiky',
    ranking: 'Sieň slávy',
    finance: 'Financie',
    settings: 'Nastavenia',
    trackedFor: 'Sledované tikety pre',
    logout: 'Odhlásiť',
    settingsDescription: 'Správa zariadení, jazyka a systémových Web Push notifikácií.',
    language: 'Jazyk',
    languageDescription: 'Vyber jazyk rozhrania pre svoj Google profil.',
    slovak: 'Slovenčina',
    czech: 'Čeština',
    saved: 'Uložené',
    saveFailed: 'Jazyk sa nepodarilo uložiť',
  },
  cs: {
    overview: 'Přehled',
    tickets: 'Tikety',
    statistics: 'Statistiky',
    ranking: 'Síň slávy',
    finance: 'Finance',
    settings: 'Nastavení',
    trackedFor: 'Sledované tikety pro',
    logout: 'Odhlásit',
    settingsDescription: 'Správa zařízení, jazyka a systémových Web Push notifikací.',
    language: 'Jazyk',
    languageDescription: 'Vyber jazyk rozhraní pro svůj Google profil.',
    slovak: 'Slovenština',
    czech: 'Čeština',
    saved: 'Uloženo',
    saveFailed: 'Jazyk se nepodařilo uložit',
  },
} satisfies Record<AppLocale, Record<string, string>>

export function getDictionary(locale: AppLocale) {
  return dictionary[locale]
}
