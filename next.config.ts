import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // `pg-copy-streams` estende os internos do `pg` (protocolo de COPY). Se o
  // bundler empacotar os dois, cada um enxerga uma cópia diferente desses
  // internos e o módulo quebra ao carregar — derrubando a rota de import
  // inteira. Mantê-los externos faz o Node resolvê-los de node_modules.
  serverExternalPackages: ["pg", "pg-copy-streams"],
};

export default nextConfig;
