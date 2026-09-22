import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../i18n/routing";
import "../../styles/globals.css";

export const metadata = {
  title: "FaultMind - Industrial Diagnostics & AI Troubleshooting",
  description:
    "AI-powered root-cause analysis and manual lookups for automation and electrical engineers.",
};

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;

  // Validate that incoming `locale` is supported (en, ar, de)
  if (!routing.locales.includes(locale)) {
    notFound();
  }

  // Explicitly fetch messages for the route's current locale
  const messages = await getMessages({ locale });

  // Set reading direction: Arabic = rtl, English/German = ltr
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#0B0F19" }}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
