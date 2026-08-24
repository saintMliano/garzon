import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    // Los worktrees de git viven dentro del repo y traen su propia copia de
    // `tests/`. Sin esto, vitest los descubre y corre la suite DOS veces contra
    // la misma base: cada `signInWithPassword` se duplica y Supabase corta por
    // límite de tasa, así que fallan tests que no tienen nada roto. El síntoma
    // engaña —"Request rate limit reached" en pruebas de aislamiento— y cuesta
    // caro darse cuenta de que el problema era el descubrimiento de archivos.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/worktrees/**", "**/.next/**"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
