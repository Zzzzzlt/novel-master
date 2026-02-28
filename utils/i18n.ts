import en from '../locales/en.json';
import zh from '../locales/zh.json';

type Language = 'en' | 'zh';

const translations: Record<Language, typeof en> = {
  en,
  zh
};

// Get current language from store (lazy import to avoid circular dependency)
let currentLanguage: Language = 'en';

export const setLanguage = (lang: Language) => {
  currentLanguage = lang;
};

export const getLanguage = (): Language => {
  return currentLanguage;
};

// Nested key getter
const getNestedValue = (obj: any, path: string): string | undefined => {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
};

export const t = (key: string, _lang?: Language): string => {
  const lang = _lang || currentLanguage;
  const translation = translations[lang];
  const result = getNestedValue(translation, key);
  if (result) return result;
  // Fallback to English
  const enResult = getNestedValue(translations.en, key);
  if (enResult) return enResult;
  // Return key if no translation found
  return key;
};
