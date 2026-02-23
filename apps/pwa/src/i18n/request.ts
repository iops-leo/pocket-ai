import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { locales, defaultLocale, type Locale } from './config';

export default getRequestConfig(async () => {
    // 쿠키에서 언어 설정 읽기 (클라이언트에서 설정)
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('locale')?.value;
    const locale = locales.includes(localeCookie as Locale) ? localeCookie as Locale : defaultLocale;

    return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default
    };
});
