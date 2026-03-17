import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noHardcodedColors from "./config/eslint-rules/no-hardcoded-colors.mjs";
import noInlineStyles from "./config/eslint-rules/no-inline-styles.mjs";

// Custom design system plugin
const designSystemPlugin = {
  rules: {
    "no-hardcoded-colors": noHardcodedColors,
    "no-inline-styles": noInlineStyles,
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "design-system": designSystemPlugin,
    },
    rules: {
      // File size limits — keep files focused
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
      // Function size limits — keep functions readable
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      // Design system — warn globally
      "design-system/no-hardcoded-colors": "warn",
      "design-system/no-inline-styles": "warn",
    },
  },
  // Strict enforcement on production components
  {
    files: [
      "src/components/**/*.{tsx,jsx}",
      "src/app/(dashboard)/**/*.{tsx,jsx}",
      "src/app/(marketing)/**/*.{tsx,jsx}",
      "src/app/layout.tsx",
    ],
    rules: {
      "design-system/no-hardcoded-colors": "error",
      "design-system/no-inline-styles": "error",
    },
  },
  // OG/Twitter images require inline styles (ImageResponse API)
  {
    files: ["src/app/opengraph-image.tsx", "src/app/twitter-image.tsx"],
    rules: {
      "design-system/no-hardcoded-colors": "off",
      "design-system/no-inline-styles": "off",
    },
  },
  // Marketing landing components use editorial inline styles (not the terminal design system)
  {
    files: ["src/components/landing/**/*.{tsx,jsx}", "src/app/(marketing)/**/*.{tsx,jsx}"],
    rules: {
      "design-system/no-hardcoded-colors": "off",
      "design-system/no-inline-styles": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "packages/**",
    "the-monospace-web-main/**",
    "scripts/**",
    "config/**",
  ]),
]);

export default eslintConfig;
