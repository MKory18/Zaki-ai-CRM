import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * AND EVERY OTHER BUILD DIRECTORY, BECAUSE THIS PROJECT HAS SEVERAL.
     *
     * `next.config.ts` honours `NEXT_DIST_DIR` on purpose: a dev server
     * holds `.next` open on Windows, so the payload budgets can only be
     * measured by building somewhere else while the server stays up. The
     * ignore list knew about `.next` and nothing else — so the moment
     * anybody measured, `npm run lint` reported **3,895 errors** in
     * generated chunks and the project read as broken. CI never sees them
     * (it builds into `.next`), which is the worst shape for a false
     * alarm: it fires only on the machine somebody is working on.
     */
    ".next-*/**",
    /*
     * And a worktree an agent session made for itself. One was left behind
     * after its branch had been merged, and every one of the 33 errors a
     * local lint reported came from it. Ignored in git too.
     */
    ".claude/**",
  ]),
  {
    rules: {
      // `catch (e: any)` in API routes is a deliberate, contained pattern
      "@typescript-eslint/no-explicit-any": "warn",
      // Reading persisted locale from localStorage inside an effect is legitimate hydration sync
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
    },
  },
]);

export default eslintConfig;
