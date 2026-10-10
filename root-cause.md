# PRD — Diagnóstico de Ruptura (causa-raiz por item × CD)

> **Status:** proposta · **Autor:** Wagner · **Data:** 10/10/2026
> **Sugestão de caminho no repositório:** `docs/prd-diagnostico-ruptura.md`

---

## 0. Instruções para o Claude Code

1. Leia `CLAUDE.md` e `AGENTS.md` antes de começar. Este projeto usa uma versão do Next.js com mudanças incompatíveis: consulte `node_modules/next/dist/docs/` antes de escrever rotas e páginas.
2. Siga as fases da seção 14, **uma de cada vez**. Ao fim de cada fase, rode `npm run test` e `npm run build` e pare para revisão.
3. Antes de codar, leia os módulos citados na seção 4.4 e reaproveite o que já existe. Prefira editar arquivos existentes a criar novos.
4. Se algum ponto da seção 15 (perguntas em aberto) bloquear uma tarefa, **pergunte antes de implementar**. Não invente o significado de campos.
5. Nenhuma tela existente pode mudar de comportamento. O diagnóstico é um módulo novo que só lê as bases.

---

## 1. Contexto e problema

O DRP_AI já mostra **o que** está acontecendo: cobertura, risco de ruptura, triangulações, sugestões de compra e transferência. Ainda não explica **por que** um item rompeu em um CD.

Hoje, entender uma ruptura exige cruzar à mão forecast, plano, pedidos, recebimentos, transferências e vendas. Como ninguém faz isso para todas as posições, as mesmas falhas se repetem e não se sabe se a ruptura do mês foi responsabilidade do planejamento, de compras, do fornecedor, da logística ou da demanda.

Já temos mais de dois meses de snapshots diários. Isso permite reconstruir a linha do tempo de cada ruptura e testar, etapa por etapa, onde a cadeia falhou.

## 2. Objetivos

- Para **cada ruptura de cada item em cada CD**, identificar a causa, ou a combinação de causas, com a divisão em dias e a prova de cada uma.
- Mostrar quanto da ruptura é de cada dono (Planejamento e Compras, Fornecedor, Logística, Demanda e Comercial).
- Permitir que o analista confirme ou corrija o diagnóstico, gerando a medida de acerto do motor e, no futuro, rótulos para um modelo.

### Não objetivos (fora deste PRD)

- Prever rupturas futuras: isso já é feito pelos motores de risco.
- Usar machine learning para decidir a causa. A causa é decidida por regra determinística. A IA só escreve texto sobre o resultado (seção 11).
- Alterar os imports existentes ou o formato dos CSVs.

## 3. Usuários e histórias

| Como… | quero… | para… |
|---|---|---|
| Gestor de planejamento | ver quanto da ruptura do período é de cada dono e de cada causa | priorizar onde agir e cobrar a área certa |
| Analista | ver a lista de rupturas por item × CD, com a causa de cada uma | investigar sem cruzar bases à mão |
| Analista | abrir uma ruptura e ver a linha do tempo, o teste de cada etapa e as provas | entender o que aconteceu e confiar no diagnóstico |
| Analista | confirmar ou corrigir a causa | manter o diagnóstico certo e medir o acerto do motor |
| Comprador | ver os pedidos tardios e de quantidade baixa que causaram ruptura | corrigir o processo de compra |
| Gestor | ver a confiança de cada diagnóstico | saber em quais posso confiar sem conferir |

### Critérios de aceite gerais

- Toda causa atribuída tem pelo menos uma prova (registro de origem) gravada e visível na tela.
- A soma dos percentuais de causa de um evento é 100%, com o resíduo em "sem evidência".
- Rodar o motor duas vezes sobre os mesmos dados e a mesma versão de regras gera o mesmo resultado (determinismo).
- Todas as tabelas têm paginação (regra do `CLAUDE.md`).

## 4. Conceitos e definições

### 4.1 Evento de ruptura

- **Posição:** um par item × CD (`codigo`, `filial`).
- **Estoque disponível:** soma dos armazéns de venda no snapshot do `simulador`. Na fase 1, `est_arm_01 + est_arm_11 + est_arm_26 + est_arm_nac`. A lista fica em parâmetro, porque **Q40 e RC dependem da pergunta 15.1**.
  - Atenção: `utils/dias-estoque.ts` define `COLUNAS_ESTOQUE_CHAO` incluindo Q40 e RC. **Não altere essa constante.** Crie uma lista própria do diagnóstico.
- **Ruptura:** estoque disponível ≤ 0 com `forecast_m0 > 0` no item × CD.
- **Evento:** sequência de snapshots consecutivos em ruptura. `inicio` é o primeiro snapshot rompido; `fim` é o primeiro snapshot com estoque, ou `null` se continua rompido (evento aberto).
- **Dias de ruptura:** dias corridos entre `inicio` e `fim` (ou a data de referência).
- **Consumo diário:** `forecast_m0 / DIAS_NO_MES`, a mesma regra do resto do sistema (`utils/dias-estoque.ts`).
- **Valor perdido:** dias × consumo diário × `cmv_unitario`, por enquanto a custo (pergunta 15.8).

### 4.2 Teste contrafactual (a regra que garante a causa certa)

A causa não é escolhida por casamento de regra. É **medida**.

1. O motor reconstrói a linha do tempo da posição dia a dia com os dados reais: estoque inicial, consumo real, chegadas reais. Isso dá os **dias de ruptura reais**.
2. Para cada etapa que falhou, refaz a linha do tempo trocando **só aquela etapa** pelo padrão (o "ajuste" da seção 5) e mede quantos dias de ruptura sumiriam.
3. Uma causa só entra no diagnóstico se o ajuste dela reduz os dias de ruptura. Se a regra falhou mas o ajuste não muda nada, ela vira `observacao`, sem dias.
4. Quando há duas ou mais causas, os dias são divididos pela **contribuição média de cada causa em todas as ordens possíveis** (valor de Shapley). Com até 6 causas por evento, o cálculo exato é barato (6! = 720 ordens). Acima disso, use a ordem da cadeia (seção 6, passo 4).
5. Os dias que nenhuma causa explica vão para `sem_evidencia`.

**Exemplo:** Produto 7 · CD XZ, com 9 dias de ruptura reais.

| Cenário | Pedido emitido | Lead time | Chegada | Dias de ruptura |
|---|---|---|---|---|
| Real | 03/09 | 22 dias | 25/09 | 9 |
| Pedido na data limite | 29/08 | 22 dias | 20/09 | 4 → pedido tarde explica 5 |
| Fornecedor no lead time padrão | 03/09 | 18 dias | 21/09 | 5 → fornecedor explica 4 |
| Os dois ajustes juntos | 29/08 | 18 dias | 16/09 | 0 |

Resultado: pedido tarde 56% (5 dias), fornecedor atrasou 44% (4 dias).

### 4.3 Foto de abertura do mês (checkpoint)

O sistema já marca qual carga do `simulador` vale como a **abertura de cada mês** (`src/utils/abertura-mes.ts`):
- a marca fica em `configuracao_sistema`, com a chave `abertura:simulador:aaaa-mm`, gravada pela rota `/api/abertura`;
- `resolverAbertura` devolve a data e a origem: `marcada`, `primeira-do-mes` ou `ausente`.

O diagnóstico usa essa foto de três formas:

1. **Âncora do replay.** O balanço dia a dia começa na foto de abertura do mês do evento. Se o evento começou nos primeiros dias do mês, começa na abertura do mês anterior. O estoque inicial vem de um ponto conferido, não de um snapshot qualquer.
2. **Ruptura herdada × ruptura do mês.** Cada evento recebe `herdada_abertura = true` quando, na foto de abertura, o estoque disponível mais as chegadas já previstas não cobriam o consumo até a data em que a ruptura começou. A ruptura "já estava contratada" quando o mês abriu. Caso contrário, ela nasceu de algo que aconteceu dentro do mês.
3. **Causas do ponto de partida.** As causas 26 e 27 da seção 5 só podem ser testadas a partir da foto de abertura.

**Confiança da foto:** se a origem não for `marcada`, a confiança do evento é no máximo `media`. Já houve cargas quebradas feitas cedo que viraram abertura sem ninguém perceber; o comentário em `abertura-mes.ts` cita 17. A tela mostra a data usada e a origem.

### 4.4 Módulos existentes a reaproveitar

| Necessidade | Onde está |
|---|---|
| Balanço dia a dia por item × CD | `src/lib/simulacao/motor.ts` (`simular`). Reaproveite a lógica de balanço; crie uma função de replay histórico em vez de mudar `simular` |
| Datas de snapshot (rápido) | `src/lib/snapshots.ts` (`listarSnapshots`) |
| Saldo do plano de compra | `src/lib/compras/saldo-plano.ts` |
| Chegadas previstas de pedidos e transferências | `src/lib/reposicoes/chegadas.ts` |
| SLA de transferência e dias úteis | `src/lib/transferencias/consultas.ts` (`carregarSla`), `src/utils/projecao-transferencias.ts` |
| Rota de compra até o CD final | `src/utils/rota-compra.ts` |
| Colunas de estoque e consumo | `src/utils/dias-estoque.ts` |
| Padrão de análise de IA (dossiê, prompt, persistência com hash) | `src/lib/ia/*` |
| Autorização | `src/lib/autorizacao.ts` |
| Data de referência | `src/lib/data-referencia.server.ts` |
| Foto de abertura do mês | `src/utils/abertura-mes.ts` (`resolverAbertura`), `src/lib/configuracao.server.ts` (`lerConfiguracoes`) |

**Cuidado com os snapshots cumulativos:** `pedidos_de_compra` e `transferencias_abertas` repetem as linhas a cada carga. Toda consulta deve filtrar por `data_snapshot`, como `saldo-plano.ts` já faz. Sem isso, o mesmo pedido soma várias vezes.

## 5. Catálogo de causas

Cada causa tem um identificador fixo (`slug`), usado no banco e no código. As causas 26 e 27 vêm da foto de abertura do mês (seção 4.3) e aparecem antes da 25, porque "sem evidência" é sempre a última; a numeração das demais não muda.

**Fase:**
- **F1** = implementar já.
- **F2** = depende de uma pergunta da seção 15. Implemente a estrutura, mas deixe a causa desligada por parâmetro até a resposta.

| # | slug | Causa | Etapa | Dono | Regra (a causa falhou quando…) | Ajuste contrafactual | Dados | Limite inicial | Fase |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `venda_acima_forecast` | Venda acima do forecast | Demanda | Demanda e Comercial | venda real na janela > forecast proporcional × (1 + limite) | consumo real limitado a forecast × (1 + limite) | `historico_vendas`, `forecast.forecast_m0` | +20% | F1 |
| 2 | `pico_cliente` | Pico de um cliente só | Demanda | Comercial | um CNPJ/grupo concentra ≥ limite da venda da janela e, sem ele, a venda fica dentro do forecast | retira o excesso desse cliente do consumo | `historico_vendas.cnpj`, `clientes_grupos` | 40% | F1 |
| 3 | `nova_abertura` | Nova abertura de forecast | Demanda | Comercial e Planejamento | forecast do item × CD surge (ou sai de zero) menos de um lead time antes do início | atribuição por janela: dias de ruptura dentro de [abertura, abertura + lead time] | snapshots de `forecast`, `lead_time_fornecedor` | janela = lead time | F1 |
| 4 | `forecast_revisado` | Forecast revisado para cima no mês | Demanda | Demanda | `forecast_m0_atualizado` > `forecast_m0` × (1 + limite), revisado depois da data limite de compra | quantidade do pedido recalculada com o forecast atualizado | `forecast` (snapshots diários) | +15% | F1 |
| 5 | `forecast_abaixo_historico` | Forecast abaixo do histórico | Demanda | Demanda | `forecast_m0` < média(`m_1..m_3`) × (1 − limite) | quantidade recalculada com a média histórica | `forecast.m_1..m_4` | −25% | F1 |
| 6 | `forecast_abaixo_consenso` | Forecast abaixo do consenso S&OP | Demanda | Demanda | soma do forecast do item na rede < `sop.consenso` × (1 − limite) | quantidade recalculada com a fatia do consenso | `sop.consenso`, `forecast` | −10% | F1 |
| 7 | `fora_do_plano` | Fora do plano de compras | Plano | Planejamento | `plano_de_compra` do mês = 0 ou ausente | pedido na data limite com a necessidade (crédito para esta causa, não para 10/11) | `plano_compra` | plano = 0 | F2 (15.7) |
| 8 | `plano_insuficiente` | Plano de compras insuficiente | Plano | Planejamento | 0 < plano < necessidade × (1 − limite) | quantidade até a necessidade (crédito para esta causa) | `plano_compra`, `forecast`, `simulador` | −10% | F2 (15.7) |
| 9 | `sem_saldo_plano` | Sem saldo de plano (aguardando verba) | Plano | Planejamento e Diretoria | na data limite o saldo do plano ≤ 0 e o pedido saiu depois | pedido movido para a data limite (crédito para esta causa) | `compras/saldo-plano.ts` no snapshot do dia, `pedidos_de_compra.data_emissao` | saldo ≤ 0 | F2 (15.7) |
| 10 | `pedido_tarde` | Pedido colocado tarde | Compra | Compras | `data_emissao` > data limite + tolerância (data limite = início projetado − lead time cadastrado) | `data_emissao` movida para a data limite, mantendo o lead time real | `pedidos_de_compra`, `lead_time_fornecedor` | 2 dias | F1 |
| 11 | `comprou_pouco` | Comprou pouco | Compra | Compras | quantidade pedida no ciclo < necessidade × (1 − limite) | quantidade elevada até a necessidade | `pedidos_de_compra.quantidade_total`, `forecast` | −10% | F1 |
| 12 | `politica_baixa` | Política de estoque abaixo do necessário | Parâmetros | Planejamento | `politica` < `politica_plano` | necessidade recalculada com `politica_plano` | `forecast.politica`, `politica_plano` | qualquer diferença | F2 (15.5) |
| 13 | `lead_time_cadastro` | Lead time cadastrado desatualizado | Parâmetros | Planejamento | lead time cadastrado < P80 dos lead times reais do par fornecedor × CD, com atraso em ≥ 4 dos últimos 6 recebimentos | data limite recalculada com o P80 | `lead_time_fornecedor`, `recebimento.data_pedido`/`data` | P80, últimos 6 | F1 |
| 14 | `fornecedor_atrasou` | Fornecedor atrasou a entrega | Fornecedor | Fornecedor e Compras | entrada no CD > data prometida + tolerância, de forma isolada (não recorrente, senão é 13) | entrada movida para a data prometida | `pedidos_de_compra.data_entrega`, `recebimento.data` | 2 dias | F1 (data prometida: 15.4) |
| 15 | `entrega_parcial` | Entrega parcial do fornecedor | Fornecedor | Fornecedor e Compras | na data prometida, `quantidade_entregue` < `quantidade_total` | quantidade total entregue na data prometida | `pedidos_de_compra.quantidade_entregue`, `quantidade_total` | < 100% | F1 |
| 16 | `backorder_fornecedor` | Backorder do fornecedor | Fornecedor | Fornecedor e Compras | pedido de reposição marcado em `bo` | igual a 14/15, com crédito para esta causa | `pedidos_de_compra.bo` | campo preenchido | F2 (15.3) |
| 17 | `recebimento_demorado` | Recebimento físico demorado | Recebimento | Logística | entrada no CD − emissão da NF do fornecedor (ou agendamento) > limite | entrada = emissão da NF + padrão de recebimento | `recebimento.data_emissao`/`data`, `pedidos_de_compra.data_agendada` | 3 dias | F1 |
| 18 | `quarentena` | Estoque em quarentena ou conferência | Recebimento | Logística e Qualidade | durante o evento, Q40 ou RC > 0 e armazéns de venda = 0 | saldo de Q40/RC considerado disponível | `simulador.est_arm_q40`, `est_arm_rc` | saldo > 0 | F2 (15.1) |
| 19 | `estoque_bloqueado` | Estoque bloqueado | Recebimento | Logística e Qualidade | `bloqueio` preenchido durante o evento | estoque bloqueado considerado disponível | `simulador.bloqueio` | campo preenchido | F2 (15.2) |
| 20 | `triangulacao_lenta` | Triangulação lenta em trânsito | Movimentação interna | Logística | NF de transferência aberta por mais dias úteis que `transit_time` + tolerância | chegada = emissão + SLA | snapshots de `transferencias_abertas`, `sla_transferencias` | 1 dia | F1 |
| 21 | `triangulacao_parada_hub` | Triangulação parada no hub | Movimentação interna | Planejamento e Logística | mercadoria entrou no hub e a NF para o CD final saiu > limite depois | emissão = entrada no hub + limite | `pedidos_de_compra.rota_final`, `recebimento` (hub), `transferencias_abertas.data_emissao`/`passo` | 2 dias | F1 |
| 22 | `transferencia_nao_feita` | Transferência não feita com excesso em outro CD | Movimentação interna | Planejamento | quando a ruptura ficou previsível (início − SLA), outro CD tinha cobertura > limite ou estoque sem forecast, e nenhuma transferência saiu | transferência de min(necessidade, excesso) do CD com mais cobertura, emitida em início − SLA (chega no início) | `simulador` (todos os CDs), `forecast`, `sla_transferencias` | cobertura > 45 dias | F1 |
| 23 | `reserva_contrato` | Estoque reservado para contrato | Demanda comprometida | Comercial | `reserva` > 0 durante o evento | estoque reservado considerado disponível | `simulador.reserva`, `contratos` | reserva > 0 | F2 (15.6) |
| 24 | `pendentes_acumulados` | Pedidos de venda pendentes acumulados | Demanda comprometida | Comercial e Planejamento | `qtd_pendente` > limite × forecast mensal antes do início | demanda pendente distribuída nos dias em que se acumulou | `simulador.qtd_pendente` | 30% | F2 (15.6) |
| 26 | `abertura_descoberta` | Mês começou descoberto | Ponto de partida | Planejamento | na foto de abertura, estoque disponível + chegadas previstas não cobriam o consumo até o início da ruptura, ou o estoque estava abaixo da política | estoque de abertura elevado até a política do item × CD. Recebe só os dias que as causas mais profundas (27 e as do mês anterior) não explicam | foto de abertura do `simulador`, `forecast.politica`, chegadas previstas na abertura | abaixo da política | F1 |
| 27 | `venda_acelerada_mes_anterior` | Venda do mês anterior acelerada | Ponto de partida | Demanda e Comercial | venda do mês anterior > `forecast_m0` daquele mês × (1 + limite), consumindo o estoque que abriria este mês | estoque de abertura acrescido do excesso de venda do mês anterior | `historico_vendas` do mês anterior, snapshot de `forecast` do mês anterior | +20% | F1 |
| 25 | `sem_evidencia` | Sem evidência suficiente | Dados | TI e Planejamento | resíduo de dias não explicados, ou falta de snapshot no período | — | lacunas de `data_snapshot` | — | F1 |

**Necessidade** = consumo diário × (lead time + `politica`) − estoque disponível − tudo que já estava a caminho, na data de referência do teste.

## 6. Algoritmo do motor

Para cada evento:

1. **Montar a janela.** Do snapshot de abertura do mês do evento (ou do mês anterior, se o evento começou antes do dia 10) até `fim`. A janela precisa cobrir pelo menos `inicio − (maior lead time do item + 30 dias)`; se não cobrir, recue até a abertura anterior. Carregar, filtrando por `data_snapshot`:
   - estoque diário da posição;
   - vendas diárias;
   - pedidos de compra e recebimentos do item com destino ao CD (direto ou via rota);
   - transferências com entrada no CD;
   - forecast diário;
   - plano do mês.
2. **Checar os dados.** Para cada dia da janela sem snapshot, marcar o dia como "sem dado". Se faltarem mais de 30% dos dias, o evento recebe confiança `baixa`.
3. **Replay real.** Balanço dia a dia (estoque + chegadas − consumo real), conferido contra o estoque dos snapshots. Divergência acima de 10% em algum dia vira aviso no evento.
4. **Testar as regras** na ordem da cadeia:
   - dados;
   - ponto de partida (26, 27), usando a foto de abertura;
   - disponibilidade (18, 19, 23);
   - demanda (1 a 6);
   - plano (7 a 9);
   - compra e parâmetros (10 a 13);
   - fornecedor (14 a 17);
   - movimentação interna (20 a 22).
5. **Aplicar as precedências:**
   - pedido no prazo pelo cadastro e tarde pelo P80 → 13, não 10;
   - atraso recorrente do par fornecedor × CD → 13, não 14;
   - 2 confirmada substitui 1;
   - 3 confirmada anula 1 na mesma janela;
   - 7, 8 e 9 são exclusivas, testadas nessa ordem, e recebem o crédito no lugar de 10 e 11;
   - 16 recebe o crédito no lugar de 14 e 15 quando `bo` está marcado;
   - 22 só leva dias se nenhuma outra causa falhou; caso contrário, entra como `oportunidade`;
   - 27 é a explicação mais profunda de 26: quando as duas falham, 27 recebe os dias que explica e 26 fica só com o resto;
   - quando o pedido que deveria cobrir a abertura saiu tarde no mês anterior, a causa é 10 (pedido tarde), não 26.
6. **Contrafactual.** Para as causas que falharam, rodar os replays com os ajustes e calcular a contribuição de cada uma (Shapley exato até 6 causas).
7. **Resíduo** de dias não explicados → `sem_evidencia`.
8. **Herança:** gravar `herdada_abertura` (seção 4.3, item 2).
9. **Confiança:**

   | Nível | Quando |
   |---|---|
   | `alta` | dados completos e causas explicam ≥ 90% dos dias |
   | `media` | causas explicam de 70% a 90% |
   | `baixa` | faltam dados (> 30% dos dias) ou resíduo > 30% |

   Teto de `media` quando a foto de abertura não é `marcada`.

10. **Gravar** evento, causas, provas, `versao_regras` e `entrada_hash` (hash das entradas da janela).

**Desempenho:** processe em lote por data de snapshot. Carregue as bases do período uma vez e monte as janelas em memória, sem consulta por evento.

## 7. Modelo de dados (Prisma)

Novos modelos. Os nomes seguem o padrão do schema (snake_case no `@@map`).

```prisma
model RupturaEvento {
  id               Int       @id @default(autoincrement())
  createdAt        DateTime  @default(now())
  codigo           String
  filial           String
  inicio           DateTime  @db.Date
  fim              DateTime? @db.Date          // null = em ruptura agora
  dias             Int
  valor_perdido    Decimal   @db.Decimal(24, 10)
  confianca        String                       // alta | media | baixa
  dias_explicados  Decimal   @db.Decimal(10, 2)
  aviso_replay     Boolean   @default(false)
  abertura_data    DateTime? @db.Date             // foto de abertura usada no replay
  abertura_origem  String?                        // marcada | primeira-do-mes | ausente
  herdada_abertura Boolean   @default(false)      // ruptura já contratada na abertura do mês
  versao_regras    String
  entrada_hash     String
  calculado_em     DateTime  @default(now())
  revisao_status   String    @default("pendente") // pendente | confirmado | corrigido
  causas           RupturaCausa[]
  revisoes         RupturaRevisao[]

  @@unique([codigo, filial, inicio, versao_regras])
  @@index([filial, inicio])
  @@index([inicio])
  @@index([herdada_abertura])
  @@map("ruptura_evento")
}

model RupturaCausa {
  id          Int      @id @default(autoincrement())
  eventoId    Int
  evento      RupturaEvento @relation(fields: [eventoId], references: [id], onDelete: Cascade)
  causa       String                         // slug da seção 5
  papel       String                         // causa | oportunidade | observacao
  dias        Decimal  @db.Decimal(10, 2)
  percentual  Decimal  @db.Decimal(6, 2)
  evidencias  Json     // registros usados + valores do teste + cenários do replay
  @@index([eventoId])
  @@index([causa])
  @@map("ruptura_causa")
}

model RupturaRevisao {
  id               Int      @id @default(autoincrement())
  createdAt        DateTime @default(now())
  eventoId         Int
  evento           RupturaEvento @relation(fields: [eventoId], references: [id], onDelete: Cascade)
  usuario          String
  acao             String   // confirmar | corrigir
  causas_motor     Json
  causas_analista  Json?
  comentario       String?
  @@index([eventoId])
  @@map("ruptura_revisao")
}
```

- **Formato mínimo de `evidencias`:** `{ registros: [{ tabela, chave, data_snapshot }], valores: { ... }, cenarios: [{ ajuste, dias_ruptura }] }`.
- **Parâmetros:** limites, tolerâncias, armazéns disponíveis e causas ligadas ou desligadas ficam versionados e editáveis pelo administrador. Use `ConfiguracaoSistema` se couber; senão, crie `parametro_diagnostico`. Cada alteração gera uma nova `versao_regras`.
- **Migration:** gere a migration normalmente. Não aplique `db push` sem reaplicar `prisma/indices.sql` (ver comentário em `HistoricoVendas`).

## 8. Processamento

- **Gatilho:** ao final da importação diária do `simulador`, e manualmente na tela (botão "Recalcular", só para administrador).
- **Idempotência:** reprocessar uma data com a mesma `versao_regras` substitui os eventos daquela versão; não duplica.
- **Eventos abertos:** são recalculados a cada carga até fecharem.
- **Mudança de regra:** antes de publicar uma nova versão, um modo "simular" roda o histórico e mostra quantos diagnósticos mudariam, por causa.
- **Histórico inicial:** processar todos os snapshots disponíveis na primeira execução.

## 9. API e acesso

- Server actions ou rotas em `src/app/api/diagnostico-ruptura/*`, com Zod em toda entrada e tipagem de `params`/`searchParams` (regra do `CLAUDE.md`).
- **Leitura:** qualquer usuário autenticado. **Confirmar ou corrigir:** papel de analista ou superior. **Recalcular e editar parâmetros:** administrador. Use `src/lib/autorizacao.ts`.
- **Endpoints mínimos:**
  - lista paginada de eventos, com filtros de período, CD, causa, curva, fornecedor, comprador e "em ruptura agora";
  - detalhe do evento;
  - agregados para a visão geral;
  - confirmar/corrigir;
  - recalcular;
  - exportar CSV.

## 10. Telas

Rota `/diagnostico-ruptura`, com item no menu lateral. Paleta e componentes atuais (shadcn, Tailwind, cores do `CLAUDE.md`). As referências visuais são os mockups "Diagnóstico de ruptura" e "Diagnóstico de ruptura · item × CD".

### 10.1 Aba "Item × CD" (fase 2)

**Parte de cima: tabela paginada**, uma linha por item × CD no período. Colunas:
- item (código, descrição, curva, fornecedor);
- CD;
- nº de rupturas (↻ se mais de uma);
- dias de ruptura;
- valor perdido;
- **causas** (barra empilhada nas cores da causa, com nomes e % abaixo);
- situação ("em ruptura há X dias" ou "abastecido · última em dd/mm");
- confiança.

Acima da tabela: busca por código ou descrição, filtros e chips por causa com contagem (clique filtra).

**Parte de baixo: detalhe da posição** selecionada.
1. **Cabeçalho:** item · CD · fornecedor · comprador · forecast. Indicadores: rupturas em 60 dias, dias sem estoque, valor perdido, situação hoje. Botões "anterior/próximo" e "Abrir no Raio-X".
2. **Linha do tempo** (SVG) em uma única régua de datas:
   - curva de estoque disponível com as rupturas sombreadas;
   - estoque mínimo da política;
   - faixa de pedido de compra (data limite, emissão, prometido, recebido, com atrasos em cor);
   - faixa de transferência (saída, previsto pelo SLA, chegada);
   - faixa de forecast × venda por mês.
3. **Rupturas desta posição:** cada evento com a barra de causas. Clicar seleciona o evento.
4. **Teste de cada etapa** do evento selecionado: ✓ / ✕ / não se aplica, com a prova em texto curto (nº do pedido, NF, datas). Botões **Confirmar** e **Corrigir causa** (abre seleção das causas e comentário; grava em `RupturaRevisao`).
5. **Foto da abertura do mês:** data e origem da foto (marcada ou palpite), estoque disponível e cobertura na abertura contra a política, venda do mês anterior contra o forecast daquele mês, e pedidos e transferências em aberto na abertura. Selo "ruptura herdada da abertura" quando for o caso.
6. **Mesmo item nos outros CDs** na data em que a ruptura ficou previsível: estoque, cobertura, "podia transferir" / "sem forecast". Mostrar o card "oportunidade perdida" quando houver.
7. **Explicação do agente** (fase 3).

### 10.2 Aba "Visão geral" (fase 2)

- **Indicadores:** rupturas, dias de ruptura, valor perdido, causa nº 1, % controlável (Planejamento e Compras) e **% herdado da abertura** (rupturas já contratadas quando o mês abriu).
- **Abertura do mês:** quantas posições abriram o mês abaixo da política, quantas delas romperam, e a venda do mês anterior contra o forecast.
- **Filtro "herdada × do mês"** em todas as visões.
- **"De quem é a ruptura?":** barra 100% por causa, agrupada por dono, e um card por dono.
- **"Onde a corrente quebra":** as etapas da cadeia em sequência, com % dos dias em cada uma (verde < 10%, amarelo 10–20%, vermelho ≥ 20%).
- **Evolução semanal** empilhada por causa e **combinações mais frequentes**.
- **Mapa de calor** CD × causa e ranking de fornecedores (lead time real × combinado).

### 10.3 Estados

Carregando, sem dados no período, evento com confiança baixa (selo visível), evento sem prova (não deve existir: tratar como erro).

## 11. Agente de IA (fase 3)

Siga o padrão de `src/lib/ia/*`: dossiê curado, prompt isolado, resultado persistido com hash da entrada.

- **Entrada:** os eventos e causas já calculados. O agente nunca lê as tabelas brutas.
- **Regras invioláveis no prompt:** não calcular nem inventar números; não mudar causas; citar só códigos e CDs presentes no dossiê.
- **Saídas:**
  - explicação de uma posição item × CD ("o que aconteceu e como não repetir", até 3 ações);
  - padrões do período (por comprador, fornecedor, rota, CD).
- **Perguntas livres** ("por que o CD Y2 rompe mais?"): ficam para depois desta fase.

## 12. Testes (Vitest)

1. **Casos com resposta conhecida.** Fixtures montadas à mão em `src/lib/diagnostico-ruptura/__fixtures__/`: pelo menos 2 por causa F1 e 6 combinados. Exemplo obrigatório: o caso do Produto 7 da seção 4.2 (5 + 4 dias).
2. **Invariantes:**
   - soma dos percentuais = 100%;
   - nenhuma causa com `papel = causa` sem evidência;
   - o mesmo input produz o mesmo output;
   - um ajuste que não reduz dias nunca gera `papel = causa`.
3. **Precedências** da seção 6, passo 5, uma por teste.
4. **Shapley:** com causas aditivas, o resultado é igual à soma simples. Com sobreposição, a divisão é simétrica.
5. **Snapshots cumulativos:** o mesmo pedido em vários snapshots conta uma vez só.
6. **Foto de abertura:**
   - o replay usa a data de `resolverAbertura`;
   - com origem `primeira-do-mes`, a confiança fica no máximo `media`;
   - um evento cuja ruptura já estava prevista na abertura sai com `herdada_abertura = true`;
   - 27 tem precedência sobre 26.

## 13. Observabilidade

Métricas em `src/lib/observabilidade` (prom-client):
- `diagnostico_eventos_total{confianca}`;
- `diagnostico_duracao_segundos`;
- `diagnostico_residuo_ratio`;
- `diagnostico_revisoes_total{acao}`.

Log estruturado por execução com `versao_regras`, nº de eventos e tempo.

**Taxa de acerto por causa** = confirmados / (confirmados + corrigidos). Mostrar na tela de administração.

## 14. Fases de entrega

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1 — Motor | modelos Prisma, parâmetros, detecção de eventos, replay ancorado na foto de abertura, regras F1, contrafactual, gravação, job de processamento | testes da seção 12 passando; histórico processado; ≥ 80% dos eventos com confiança média ou alta |
| 2 — Telas | rota `/diagnostico-ruptura` com as abas 10.1 e 10.2, confirmar/corrigir, exportar | analistas conseguem investigar e revisar uma posição sem sair da tela |
| 3 — Agente | explicação por posição e padrões do período | texto cita só números do motor; nenhum número inventado nos testes de prompt |
| 4 — Causas F2 | ligar as causas F2 conforme as respostas da seção 15 | cada causa nova com fixtures e taxa de acerto medida |

**Calibração** (entre as fases 2 e 3): os analistas revisam ~100 eventos sorteados por causa. Ajustar os limites onde a concordância ficar abaixo de 90%.

## 15. Perguntas em aberto

| # | Pergunta | Afeta |
|---|---|---|
| 15.1 | Os armazéns Q40 e RC contam como disponíveis para venda? | definição de ruptura, causa 18 |
| 15.2 | O que significa `simulador.bloqueio` e quais valores assume? | causa 19 |
| 15.3 | `pedidos_de_compra.bo` marca backorder do fornecedor? Quais valores? | causa 16 |
| 15.4 | Qual campo é a data prometida pelo fornecedor: `data_entrega`, `data_pedra` ou `data_agendada`? | causa 14 |
| 15.5 | `forecast.politica_plano` é a política recomendada ou a usada no plano? | causa 12 |
| 15.6 | `simulador.reserva` é reserva de contrato? `qtd_pendente` é venda colocada e não atendida? | causas 23 e 24 |
| 15.7 | Dá para ter o plano de compras por CD? Hoje é por código × empresa | causas 7 a 9 no nível item × CD |
| 15.8 | Valor perdido deve usar preço de venda? Hoje só há `cmv_unitario` | indicador de valor |
| 15.9 | Os meses do histórico já têm a abertura marcada? Se não, marcar antes de processar, porque sem marca vale o palpite da primeira carga do mês | causas 26 e 27, confiança |

Transferências não têm data de chegada: ela é deduzida pelo dia em que a NF some de `transferencias_abertas`. Um dia sem upload atrasa a chegada em um dia; o motor deve tratar isso como "sem dado", não como atraso.
