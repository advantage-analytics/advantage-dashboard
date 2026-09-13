// Prettier — formatting authority for everything except SQL.
//
// Almost every option here is Prettier's own default, kept explicit because
// they were VERIFIED against the existing codebase rather than assumed:
//
//   printWidth 80   p95 of src/**/*.{ts,tsx} line length is exactly 80
//   singleQuote     1690 double-quoted imports, 0 single-quoted
//   semi            1649 of 1690 import lines already end in `;`
//
// Changing any of them means a second repo-wide reformat. Don't, without a
// reason better than taste.
/** @type {import("prettier").Config} */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],

  // Tailwind v4 keeps its config IN CSS (`@theme`, `@utility`), so the class
  // sorter is pointed at the stylesheet, not at tailwind.config.ts — that file
  // is a vestigial v3 stub with an empty theme and no plugins.
  //
  // This is the highest-value part of the whole setup: deterministic class
  // order removes a recurring class of same-line merge conflict in a repo
  // where className strings routinely run past 80 columns.
  tailwindStylesheet: "./src/app/globals.css",

  // advButton() composes classes through cn(); without this the sorter only
  // reaches literal className attributes and leaves helper calls unsorted.
  tailwindFunctions: ["cn", "advButton"],
};

export default config;
