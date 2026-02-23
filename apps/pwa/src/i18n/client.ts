'use client';

import { useEffect, useState } from 'react';
import { type Locale, locales, defaultLocale } from './config';

const LOCALE_COOKIE_NAME = 'locale';

export function getLocaleFromCookie(): Locale {
    if (typeof document === 'undefined') return defaultLocale;

    const match = document.cookie.match(new RegExp(`${LOCALE_COOKIE_NAME}=([^;]+)`));
    const value = match?.[1];

    return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}

export function setLocaleCookie(locale: Locale): void {
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale};path=/;max-age=31536000;SameSite=Lax`;
}

export function useLocale(): [Locale, (locale: Locale) => void] {
    const [locale, setLocaleState] = useState<Locale>(defaultLocale);

    useEffect(() => {
        setLocaleState(getLocaleFromCookie());
    }, []);

    const setLocale = (newLocale: Locale) => {
        setLocaleCookie(newLocale);
        setLocaleState(newLocale);
        // 페이지 새로고침으로 서버 컴포넌트에서 새 언어 적용
        window.location.reload();
    };

    return [locale, setLocale];
}

export { locales, defaultLocale, type Locale };
