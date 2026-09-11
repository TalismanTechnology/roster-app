import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // These server-only views calculate request-time expiry; they are never hydrated.
    files: ["src/app/app/coaching/page.tsx", "src/app/resume/page.tsx", "src/app/verify/**/page.tsx", "src/components/editor/RecordSections.tsx", "src/components/editor/RequestsSection.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
  {
    // Frozen hero dependency: retain the existing pointer reset behavior exactly.
    files: ["src/components/bits/Magnet.tsx"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  {
    // Private media must reach the session-authorized route directly, outside the public image optimizer cache.
    files: ["src/components/app/AppNavigation.tsx", "src/components/media/ProfileMedia.tsx", "src/components/network/{Composer,PostCard,ReportEvidence,primitives}.tsx", "src/components/record/IdentityBand.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  globalIgnores([".next/**", ".next-release/**", ".shots/**", ".data/**", "out/**", "next-env.d.ts"]),
]);
