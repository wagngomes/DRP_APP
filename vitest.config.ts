import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Testes das regras de negócio.
 *
 * Ambiente Node e não jsdom: o que precisa de teste automatizado aqui são as
 * funções puras que produzem os números — projeção de rota, cobertura, balanço
 * de simulação. Componente de tela é verificado renderizando a página de
 * verdade contra o banco, que é o que pega os erros que importam.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
