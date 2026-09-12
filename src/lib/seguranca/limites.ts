/**
 * Os tetos do sistema, em um lugar só.
 *
 * Cada número tem uma razão medida, não um palpite — a justificativa fica ao
 * lado, porque teto sem motivo é o primeiro a ser afrouxado quando incomoda.
 */
import type { Regra } from "./rate-limit";

/**
 * Autenticação, contando **apenas as falhas**.
 *
 * Três camadas porque um teto sozinho deixa passar um dos padrões de ataque:
 * o de minuto barra a rajada, o de hora barra a moagem lenta, o de dia barra a
 * insistência ao longo do turno. Medido antes de existir limite: o login
 * aceitava 946 tentativas por minuto numa única conexão, o que dá 7.200 por dia
 * mesmo com um teto de 5/min sozinho. Com as três camadas, são 50 por dia.
 *
 * Login bem-sucedido zera as camadas — senão quem entra e sai várias vezes
 * acabaria se autobloqueando.
 */
export const LOGIN: Regra[] = [
  { max: 5, janelaSegundos: 60 },
  { max: 20, janelaSegundos: 60 * 60 },
  { max: 50, janelaSegundos: 24 * 60 * 60 },
];

/**
 * Navegação nas telas.
 *
 * Medido: cada navegação gera **1** requisição que passa pelo proxy — os
 * arquivos estáticos ficam fora do matcher. Noventa por minuto é muito acima do
 * que uma pessoa faz e ainda assim corta varredura automatizada.
 */
/**
 * Navegação de quem já entrou, **por sessão**.
 *
 * Por sessão e não por IP, e a diferença não é detalhe: numa rede corporativa
 * as quinze pessoas saem pelo mesmo endereço público, então um teto por IP é
 * dividido entre todas — basta duas navegando junto para a terceira tomar 429.
 * Foi o que aconteceu no primeiro dia em produção.
 *
 * O número também subiu. O App Router faz *prefetch* dos links visíveis, e a
 * barra lateral tem doze itens: abrir uma tela dispara várias requisições além
 * da que a pessoa pediu. Contar isso com régua de navegação humana produz
 * bloqueio em uso normal, que é a pior espécie de proteção — a que é desligada
 * na primeira semana porque atrapalha.
 *
 * Trezentas por minuto continuam barrando o que importa: um laço automatizado
 * varrendo o sistema faz milhares.
 */
export const NAVEGACAO: Regra[] = [{ max: 300, janelaSegundos: 60 }];

/**
 * Navegação de quem ainda não entrou, por IP.
 *
 * Aqui não há sessão para identificar, então o IP é o que sobra — e o teto é
 * mais baixo de propósito: sem login, as únicas telas alcançáveis são a de
 * entrada e a documentação, que ninguém legítimo recarrega sessenta vezes por
 * minuto.
 */
export const NAVEGACAO_ANONIMA: Regra[] = [{ max: 60, janelaSegundos: 60 }];

/**
 * Importação de CSV, por usuário.
 *
 * Trinta por hora porque o uso real chega a **8 tabelas na mesma sessão** —
 * medido no histórico de cargas. Um teto de 5 quebraria a rotina diária, e
 * proteção que atrapalha o trabalho legítimo é desligada na primeira semana.
 */
export const IMPORTACAO: Regra[] = [{ max: 30, janelaSegundos: 60 * 60 }];

/**
 * Importações simultâneas por usuário.
 *
 * Uma. O `historico_vendas` tem 500 mil linhas e é carregado inteiro na memória;
 * este processo já morreu por falta de heap uma vez. É a concorrência que
 * derruba, não a frequência.
 */
export const IMPORTACAO_SIMULTANEA = 1;

/**
 * Análises de IA, por usuário.
 *
 * Controle de custo antes de segurança: cada análise custa duas chamadas ao
 * provedor. Vinte por hora cobre um dia de trabalho iterativo com folga.
 */
export const ANALISE_IA: Regra[] = [{ max: 20, janelaSegundos: 60 * 60 }];
