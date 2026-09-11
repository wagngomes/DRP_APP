import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança.
 *
 * Valem para tudo que a aplicação serve. São instruções ao navegador sobre o
 * que ele pode fazer com a página — a maioria custa uma linha e fecha uma
 * classe inteira de ataque.
 *
 * A CSP é a peça central e também a mais delicada. Esta é permissiva no ponto
 * dos scripts (`unsafe-inline` e `unsafe-eval`) porque o Next injeta script
 * embutido para hidratar a página, e a versão rigorosa exige nonce por
 * requisição — mudança que atravessa o layout e o proxy, e que merece ser feita
 * com calma em vez de junto com outras oito coisas. Mesmo assim ela já vale
 * muito: `frame-ancestors` mata clickjacking, `object-src` mata plugin legado,
 * `base-uri` impede reescrita de URL relativa, e `form-action` impede que um
 * formulário injetado poste dados para fora.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // A aplicação só fala com ela mesma; a chamada ao modelo sai do servidor,
  // nunca do navegador.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Sobe requisição insegura para HTTPS quando a página está em HTTPS. Inerte
  // enquanto o acesso for por HTTP puro, e correto assim que houver TLS.
  "upgrade-insecure-requests",
].join("; ");

const CABECALHOS = [
  { key: "Content-Security-Policy", value: CSP },
  // Nunca deixar o navegador adivinhar o tipo do conteúdo: é assim que um CSV
  // enviado por alguém acaba interpretado como HTML e executa script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Redundante com `frame-ancestors`, mantido para navegador antigo.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nada aqui usa câmera, microfone, localização ou pagamento. Desligar o que
  // não se usa reduz o que um script injetado conseguiria pedir.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // HSTS: o navegador passa a recusar HTTP para este domínio. Só tem efeito
  // sobre resposta servida por HTTPS, então é inofensivo antes do TLS entrar e
  // já fica valendo no minuto em que entrar. Sem `preload` de propósito —
  // preload é irreversível na prática e não se pede antes de o domínio estar
  // estável.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Não anunciar a tecnologia nem a versão: não impede ninguém determinado, mas
  // tira a aplicação das buscas automatizadas por versão vulnerável.
  poweredByHeader: false,
  // `pg-copy-streams` estende os internos do `pg` (protocolo de COPY). Se o
  // bundler empacotar os dois, cada um enxerga uma cópia diferente desses
  // internos e o módulo quebra ao carregar — derrubando a rota de import
  // inteira. Mantê-los externos faz o Node resolvê-los de node_modules.
  serverExternalPackages: ["pg", "pg-copy-streams"],
  async headers() {
    return [{ source: "/:path*", headers: CABECALHOS }];
  },
};

export default nextConfig;
