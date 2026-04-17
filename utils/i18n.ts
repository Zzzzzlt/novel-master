import en from '../locales/en.json';
import zh from '../locales/zh.json';

type Language = 'en' | 'zh';

const translations: Record<Language, typeof en> = {
  en,
  zh
};

// Get current language from store (lazy import to avoid circular dependency)
let currentLanguage: Language = 'zh';

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

export const t = (key: string, params?: Record<string, string | number>, _lang?: Language): string => {
  const lang = _lang || currentLanguage;
  const translation = translations[lang];
  let result = getNestedValue(translation, key);
  if (!result) {
    // Fallback to English
    result = getNestedValue(translations.en, key);
  }
  if (!result) {
    // Return key if no translation found
    return key;
  }
  // Replace placeholders like {url} with actual values
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }
  return result;
};
