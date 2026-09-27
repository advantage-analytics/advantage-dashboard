// Marketing site (landing page) — the dashboard lives on app.advantage-analytics.com.
export const MARKETING_SITE_URL = "https://advantage-analytics.com";

// Access requests are captured by the landing page's form, which writes to
// Airtable. There is no in-app intake; all "request access" CTAs point here.
// Legal pages live on the marketing site only. A bare `/legal/...` href from
// the dashboard resolves against app.advantage-analytics.com, which has no
// such route, so every link here is absolute.
export const TERMS_URL = `${MARKETING_SITE_URL}/legal/terms-and-conditions`;
export const PRIVACY_URL = `${MARKETING_SITE_URL}/legal/privacy-policy`;
export const GUARDIAN_TERMS_URL = `${MARKETING_SITE_URL}/legal/guardian-terms`;

export const REQUEST_ACCESS_URL = `${MARKETING_SITE_URL}/#access`;

// Support address. Was declared in four components, and one copy had already
// drifted to a domain that does not receive mail.
export const SUPPORT_EMAIL = "team@advantage-analytics.com";
