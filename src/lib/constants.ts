// Marketing site (landing page) — the dashboard lives on app.advantage-analytics.com.
export const MARKETING_SITE_URL = "https://advantage-analytics.com";

// Access requests are captured by the landing page's form, which writes to
// Airtable. There is no in-app intake; all "request access" CTAs point here.
export const REQUEST_ACCESS_URL = `${MARKETING_SITE_URL}/#access`;

// Support address. Was declared in four components, and one copy had already
// drifted to a domain that does not receive mail.
export const SUPPORT_EMAIL = "team@advantage-analytics.com";
