# Árvore de decisão — diagnóstico de ruptura

Classificação de cada posição **item × CD** rompida na data de referência.
Uma causa por caso, decidida em ordem: a primeira pergunta que responde "sim"
encerra a classificação.

Esta é a versão corrigida da árvore desenhada em 11/10/2026. O que mudou está
em [O que foi corrigido](#o-que-foi-corrigido), no fim.

---

## A árvore

```mermaid
flowchart TD
    I["item × CD rompido<br/>na data de referência"] --> D0

    D0{"A carga do dia<br/>é confiável?"}
    D0 -->|não| base_inconsistente["BASE INCONSISTENTE<br/>nenhum dono"]
    D0 -->|sim| D1

    D1{"O estoque existe,<br/>mas está retido?<br/>Q40 · RC · bloqueio · reserva"}
    D1 -->|sim| estoque_retido["ESTOQUE RETIDO<br/>Logística e Qualidade"]
    D1 -->|não| D2

    D2{"O forecast deste CD abriu<br/>contra o snapshot anterior,<br/>há menos de um lead time?"}
    D2 -->|sim| nova_abertura["NOVA ABERTURA DE FORECAST<br/>Comercial e Planejamento"]
    D2 -->|não| D3

    D3{"Abrimos o mês já rompido<br/>ou abaixo da política<br/>do item × CD?"}
    D3 -->|sim| A1
    D3 -->|não| B1

    A1{"A venda do mês anterior<br/>superou o forecast<br/>daquele mês?"}
    A1 -->|sim| venda_acelerada_mes_anterior["VENDA ACELERADA<br/>NO MÊS ANTERIOR<br/>Demanda e Comercial"]
    A1 -->|não| A2

    A2{"Havia plano de compra<br/>no mês anterior?"}
    A2 -->|não| sem_plano_mes_anterior["SEM PLANO NO MÊS ANTERIOR<br/>Planejamento"]
    A2 -->|sim| A3

    A3{"O plano do mês anterior<br/>cobria a necessidade?"}
    A3 -->|não| plano_insuficiente_mes_anterior["PLANO INSUFICIENTE<br/>NO MÊS ANTERIOR<br/>Planejamento"]
    A3 -->|sim| A4

    A4{"A compra do mês anterior<br/>chegou no prazo?"}
    A4 -->|não| F1
    A4 -->|sim| abertura_descoberta["ABERTURA DESCOBERTA<br/>Planejamento"]

    B1{"Havia plano de compra<br/>no mês atual?"}
    B1 -->|não| fora_do_plano["FORA DO PLANO<br/>Planejamento"]
    B1 -->|sim| B2

    B2{"O plano cobria<br/>a necessidade?"}
    B2 -->|não| plano_insuficiente["PLANO INSUFICIENTE<br/>Planejamento"]
    B2 -->|sim| B3

    B3{"O pedido foi colocado<br/>até a data limite?"}
    B3 -->|não| B3a
    B3 -->|sim| B4

    B3a{"Havia saldo no plano<br/>na data limite?"}
    B3a -->|não| sem_saldo_plano["SEM SALDO DE PLANO<br/>Planejamento e Diretoria"]
    B3a -->|sim| B3b

    B3b{"Houve algum pedido<br/>no mês para esta posição?"}
    B3b -->|sim| pedido_tarde["PEDIDO COLOCADO TARDE<br/>Compras"]
    B3b -->|não| pedido_nao_colocado["PEDIDO NAO COLOCADO<br/>Compras"]

    B4{"A quantidade pedida<br/>cobria a necessidade?"}
    B4 -->|não| comprou_pouco["COMPROU POUCO<br/>Compras"]
    B4 -->|sim| B5

    B5{"O pedido ainda existe?<br/>não sumiu da base<br/>sem recebimento"}
    B5 -->|não| pedido_cancelado["PEDIDO CANCELADO<br/>OU CORTADO<br/>Compras"]
    B5 -->|sim| T1

    T1{"O pedido era triangulado?"}
    T1 -->|não| F1
    T1 -->|sim| T2

    T2{"O trecho do fornecedor<br/>pedido até NF<br/>estourou o prazo?"}
    T2 -->|sim| F2
    T2 -->|não| T3

    T3{"O trecho entre CDs<br/>estourou o SLA<br/>de transferência?"}
    T3 -->|sim| triangulacao_lenta["TRIANGULAÇÃO LENTA<br/>Logística"]
    T3 -->|não| T4

    T4{"A mercadoria parou no hub?<br/>entrou e a NF seguinte<br/>demorou a sair"}
    T4 -->|sim| parada_hub["PARADA NO HUB<br/>Planejamento e Logística"]
    T4 -->|não| V1

    F1{"O fornecedor entregou<br/>além do prazo cadastrado?"}
    F1 -->|sim| F2
    F1 -->|não| F3

    F2{"O estouro é recorrente<br/>neste par fornecedor × CD?"}
    F2 -->|sim| lead_time_cadastro["LEAD TIME CADASTRADO<br/>DESATUALIZADO<br/>Planejamento"]
    F2 -->|não| fornecedor_atrasou["ATRASO DO FORNECEDOR<br/>Fornecedor e Compras"]

    F3{"O fornecedor entregou<br/>a quantidade inteira?"}
    F3 -->|não| entrega_parcial["ENTREGA PARCIAL<br/>OU BACKORDER<br/>Fornecedor e Compras"]
    F3 -->|sim| V1

    V1{"A venda do mês<br/>superou o forecast?"}
    V1 -->|sim| venda_acima_forecast["VENDA ACELERADA NO MÊS<br/>Demanda e Comercial"]
    V1 -->|não| V1a

    V1a{"Outro CD tinha sobra<br/>acima do Alvo?"}
    V1a -->|sim| transferencia_nao_feita["TRANSFERENCIA NAO FEITA<br/>Planejamento"]
    V1a -->|não| V2

    V2{"Houve saída que não foi<br/>venda nem transferência?"}
    V2 -->|sim| saida_nao_usual["BAIXA DE ESTOQUE<br/>NÃO USUAL<br/>Logística e TI"]
    V2 -->|não| indefinida["INDEFINIDA<br/>TI e Planejamento"]
```

### O modificador do balanceamento

A árvore desenhada repetia a dupla *"podia transferir? → realizou?"* em três
lugares, e foi justamente nos lugares onde ela **não** foi repetida que
apareceram ramos sem saída. Em vez de repeti-la pela quarta vez, ela vira um
**modificador aplicado depois**, sobre a causa já escolhida:

> Quando a ruptura ficou previsível, outro CD tinha sobra acima do **Alvo** e
> nenhuma transferência saiu?

Se sim, a causa recebe o sufixo **" + balanceamento não realizado"**.

```mermaid
flowchart LR
    C["causa escolhida<br/>pela árvore"] --> M{"Outro CD tinha sobra<br/>acima do Alvo quando<br/>a ruptura ficou previsível,<br/>e nada saiu?"}
    M -->|sim| R1["causa<br/>+ BALANCEAMENTO<br/>NÃO REALIZADO"]
    M -->|não| R2["causa"]
```

Não se aplica a `BASE INCONSISTENTE` nem a `NOVA ABERTURA DE FORECAST`: na
primeira não há o que cobrar de ninguém, e na segunda não houve tempo material
para reagir.

O limite da "sobra" não é escolhido aqui. Vem do **Alvo** do Painel, o mesmo
parâmetro que a tela de sugestão de transferência usa — duas réguas para a
mesma pergunta acabariam dizendo que cabia transferência onde a outra tela
nunca sugeriu.

---

## As regras, nó por nó

| nó | pergunta | dado | limite |
|---|---|---|---|
| **D0** | carga confiável | `forecast.codigo` nulo em massa; fração de posições rompidas no dia | mais de 5% sem código, ou mais de 50% rompidas |
| **D1** | estoque retido | `est_arm_q40`, `est_arm_rc`, `bloqueio`, `reserva` | qualquer um acima de zero |
| **D2** | forecast novo | `forecast` contra **o snapshot imediatamente anterior** | `forecast_m0` era zero ou a linha não existia |
| **D3** | abertura descoberta | foto de abertura do `simulador` contra `forecast.politica` | disponível menor que consumo diário vezes política |
| **A1 / V1** | venda acelerada | `historico_vendas` contra `forecast_m0` | mais de 20% acima do previsto proporcional |
| **V1a** | transferencia nao feita | `sobraDetalhada`: estoque de outro CD acima do Alvo | qualquer sobra, quando nada mais explicou |
| **A2 / B1** | sem plano | `plano_compra` do mês | ausente ou zero |
| **A3 / B2** | plano insuficiente | plano contra necessidade | plano menor que 90% da necessidade |
| **B3** | pedido tarde | `pedidosDoCiclo`: menor `data_emissao` do mes contra a data limite | mais de 2 dias além do limite; sem pedido responde "não" |
| **B3a** | sem saldo de plano | `movimentoDoPlano` + `saldoEm` na data limite | saldo zerado ou negativo |
| **B3b** | pedido nao colocado | existe linha em `pedidos_de_compra` no mes | nenhuma linha emitida |
| **B4** | comprou pouco | `quantidade_total` contra necessidade | menor que 90% da necessidade |
| **B5** | pedido cancelado | pedido some entre snapshots sem recebimento | 107 linhas medidas na janela |
| **T1** | triangulado | `tp_ped_transf_descricao` | diferente de "N/A" |
| **T2** | trecho do fornecedor | `recebimento`: `data_emissao` menos `data_pedido` | mais de 2 dias além do p50 do par |
| **T3** | trecho entre CDs | `transferencias_abertas` contra `sla_transferencias` | mais de 1 dia útil além do SLA |
| **T4** | parada no hub | entrada no hub contra emissão da NF seguinte | mais de 2 dias |
| **F1** | prazo do fornecedor | `recebimento`: `data` menos `data_pedido`, contra `lead_time_fornecedor` | mais de 2 dias além do cadastrado |
| **F2** | recorrência | mediana real do par contra o cadastrado | mediana acima do cadastrado, com 6 ou mais entregas |
| **F3** | entrega parcial | `quantidade_entregue` contra `quantidade_total`; `bo` | abaixo de 100%, ou `bo` em B.O. |
| **V2** | baixa não usual | o balanço não fecha e não há venda nem transferência que explique | divergência acima de 10% |

**Necessidade** = consumo diário × (lead time + política) − disponível − o que
já vinha a caminho, na data do teste.

---

## O que foi corrigido

### 1. "Pedido colocado tarde" não tinha caixa

O nó *"os pedidos foram colocados com tempo hábil?"* só tinha o ramo **sim**
desenhado. O **não** — uma das causas mais acionáveis e mais cobráveis — não
levava a lugar nenhum. Agora leva, e antes dele entra a pergunta do saldo: se
na data limite não havia verba no plano, o atraso é de planejamento e não de
compras.

### 2. "Comprou pouco" não existia

A árvore perguntava se *havia plano* e se o pedido *saiu a tempo*, nunca se a
**quantidade pedida bastava**. Um pedido no prazo, dentro do plano, mas pequeno
demais, descia até "Indefinida". Virou o nó **B4**.

### 3. Contradição no ramo do fornecedor

O desenho tinha:

> *"entrega do fornecedor maior que a média?"* → **sim** → atraso do fornecedor
>
> …e logo abaixo *"era triangulado?"* → **não** → **atraso do fornecedor** de novo

Chegar ao segundo nó significa que o fornecedor **não** passou da média. Não
pode ser atraso dele.

A ordem foi invertida: primeiro se pergunta **se era triangulado**, e só então
o tempo é decomposto. Isso ficou possível porque as três datas de
`recebimento` separam os trechos — conferido contra a própria coluna
`lead_time` da tabela, que bate com `data` menos `data_pedido` em 100% das
20.231 linhas:

| coluna | significado | trecho |
|---|---|---|
| `data_pedido` | colocação do pedido | início do prazo |
| `data_emissao` | emissão da NF pelo fornecedor | fim do trecho do fornecedor |
| `data` | entrada no CD | fim do prazo |

E o atraso passou a distinguir **dono**: estouro recorrente no par fornecedor ×
CD não é atraso, é cadastro errado — e o cadastro alimenta toda data limite de
compra do sistema. Medido: **56% dos 228 pares** têm o prazo cadastrado abaixo
da mediana real, com casos de 4 dias cadastrados contra 35 cumpridos.

### 4. Perguntas compostas, cujo "não" era ambíguo

> *"Iniciamos o mês anterior com estoque abaixo de 30 dias Cia **e** não tivemos plano de compras?"*

O "não" cobria três situações com ações opostas: tinha estoque, tinha plano, ou
tinha os dois. Foi quebrada em **A1 → A2 → A3 → A4**. O mesmo valia para
*"recebemos as quantidades compradas, **mas** as vendas aceleraram?"*, agora
separada em **B4** e **V1**.

### 5. Ramos "não" que não existiam

*"Tivemos plano no mês anterior mas as vendas aceleraram demais?"* não tinha
saída para o **não** — tínhamos plano, a venda foi normal, e mesmo assim o mês
abriu rompido. Agora desce para **A3** e **A4**.

### 6. "30 dias Cia" briga com a política por CD

A ruptura é **por CD**, mas a pergunta era em **Cia** e com número fixo. O
sistema já tem `politica` por item × CD — e **5.152 de 15.719** posições têm
política diferente de 30. O nó **D3** passou a usar a política do próprio item
× CD.

### 7. Estoque retido não aparecia

Q40, RC, bloqueio e reserva caíam em "Indefinida". São **11%** das posições
rompidas com saldo em Q40/RC. Viraram o nó **D1**, logo no começo, porque são
uma resposta de natureza diferente: o estoque **está lá**.

### 8. Acrescentados

**Base inconsistente** como primeira trava. Em 26/08/2026 uma carga de forecast
veio com 16.178 códigos nulos; sem essa trava o motor apontaria 6.168 rupturas
inexistentes, todas com confiança alta.

**Pedido cancelado ou cortado**. Entre snapshots consecutivos, 667 linhas de
pedido desaparecem e **107 não têm recebimento correspondente**. Nenhuma causa
cobria isso, e só é detectável porque a base é cumulativa.

### 12. O balanceamento, que e modificador, tambem precisa poder ser causa

Medido na rodada de setembro: **204 das 458 posicoes (45%)** carregam o
modificador "outro CD tinha sobra acima do Alvo e nada saiu". Nenhuma delas
aparecia com "transferencia nao feita" como causa — e nao e erro, e desenho. Uma
ruptura provocada por pedido tardio continua sendo pedido tardio ainda que uma
transferencia a tivesse salvo; o modificador diz as duas coisas sem obrigar a
escolher.

O buraco estava no fim do percurso. Quando o plano existia e cobria, o pedido
saiu no prazo e completo, o fornecedor cumpriu e a venda ficou dentro do
previsto, nao ha mais com o que competir: se a rede tinha o estoque e ele nao se
moveu, a distribuicao **e** a causa. O no **V1a** fecha isso.

Dispara pouco hoje — na base de setembro, 400 dos 458 eventos param no eixo da
abertura e so 2 chegam ao ramo do fornecedor. Mas o caminho existe, e um mes em
que a compra funcionar vai encontra-lo.

### 13. Materialidade: so acusa o que teria mudado o resultado

"Cabia transferencia" valia sempre que **qualquer** sobra existisse na rede, em
qualquer CD, de qualquer tamanho — 204 das 458 posicoes (45%), e frases como
*"transferir 1 unidade teria evitado"*. Com Gatilho e Alvo na operacao, uma
unidade nao muda decisao nenhuma, e acusar alguem por ela gasta a credibilidade
do diagnostico inteiro.

A pergunta passou a ser **a operacao teria conseguido fazer essa
transferencia?**, com as quatro travas da tela de sugestao:

| trava | sobrevivem |
|---|---|
| havia sobra na rede (regra antiga) | 204 · 45% |
| sobra no **armazem 01**, nao no estoque de venda inteiro | 204 · 45% |
| existe SLA cadastrado entre os dois CDs | 198 · 43% |
| o prazo cabia: despachando a tempo, chegava antes da ruptura | 93 · 20% |
| a quantidade tira o destino do **Gatilho** | **70 · 15%** |

O que sai nao e ruido: em 111 casos nao dava tempo de a carga chegar, e em 23 a
sobra nao cobria nem o Gatilho.

A troca para o armazem 01 nao mexe na contagem desta base — 99,2% do estoque
disponivel ja esta nele —, mas e a regra certa: o que esta no 26 ou no NAC fica
no CD. Consequencia registrada: CD virtual (90xx) nunca doa, porque o estoque
dele vive em `est_arm_11`, e aquele estoque e de outra operacao.

A sobra tambem passou a ser lida **no dia em que a carga teria de ter saido**, e
nao no dia de referencia: perguntar se ha sobra hoje, depois de a ruptura ter
acontecido, responde outra coisa.

### 10. Falta de dado nao acusa ninguem

Descoberto ao rodar a arvore nos 458 eventos de setembro. A primeira versao do
caminhante tratava "sem dado" como "nao" e seguia o ramo: a carga de
`plano_compra` de agosto perdeu os codigos num reimport de Produtos, a pergunta
A2 ficou sem resposta em **196 dos 458 eventos**, e a arvore devolvia **"sem
plano no mes anterior" em 44,5% dos casos** — uma acusacao a Planejamento
construida sobre um dado que nao existe.

Agora o percurso **para** no no sem dado e devolve `indefinida`, com a trilha
registrando qual pergunta travou. A tela consegue dizer "208 casos pararam em
A2 porque falta a carga de plano de agosto", que e uma tarefa de dados, nao um
veredito.

A distincao que importa: **ausencia de fato nao e ausencia de dado**. B3
responde "nao" quando nenhum pedido foi emitido no mes, porque
`pedidos_de_compra` traz todo o aberto do snapshot e o silencio ali e
informacao. Antes esse caso devolvia "sem dado" e 28 posicoes desciam para a
pergunta da data limite sem nunca ter havido data de emissao para comparar.

### 11. "Pedido colocado tarde" sobre posicao sem pedido

O no **B3b** nasceu dessa medicao: dos casos que chegavam a `pedido_tarde`,
parte nao tinha pedido nenhum. Sao cobrancas diferentes — atraso de prazo e
compra que nao aconteceu — e a frase "pedido colocado tarde" sobre uma posicao
sem pedido e simplesmente falsa. B3b separa as duas depois de B3a confirmar que
havia saldo.

### 9. Mantidos do desenho original

**"Saída de estoque não usual"** e **"Indefinida"** como terminal explícito.
São as duas melhores ideias da árvore: a primeira nomeia um caso que o motor
hoje só marca como "o balanço não fecha", e a segunda é mais honesta que
distribuir o resíduo entre causas conhecidas.

---

## A árvore é o veredito; o contrafactual virou prova

Por um tempo as duas réguas conviveram na tela. O motor contrafactual media
quantos dias de ruptura sumiriam se cada etapa tivesse funcionado e devolvia
**várias** causas com percentual; a árvore devolvia **uma**.

Classificar os mesmos 458 eventos pelos dois métodos mostrou que a discordância
era de 83% — e quase sempre por refinamento, não por contradição: o motor dizia
"mês começou descoberto", a árvore dizia por quê. Duas verdades na mesma tela
não davam uma conversa, porque a soma dos percentuais não fechava com nada que
se pudesse cobrar de alguém.

Então a árvore passou a ser o veredito único, e **o que o contrafactual mede
sobreviveu como evidência**:

- a **prescrição** — *"transferir 180 até 04/09, do CD 1002, teria evitado"* —,
  que é a parte acionável e vem de busca binária sobre o replay;
- o **aviso de balanço**, quando o replay não reproduz a ruptura observada: um
  veredito construído sobre um balanço que não fecha não merece a mesma
  confiança, e a tela diz isso;
- o **modificador do balanceamento**, que vale em cima de qualquer causa.

O que saiu foi a atribuição de dias entre causas — o valor de Shapley sobre os
subconjuntos. Custava 58ms nos 458 eventos, contra 11s de carga das bases, então
não saiu por peso: saiu porque era uma segunda resposta para uma pergunta que
só admite uma.

A prova de cada causa mora em `evidencias.ts`, uma tabela de causa → frase +
números, no mesmo estilo editável desta árvore. Um teste garante que **toda
causa alcançável tem prova própria**: acrescentar um nó aqui sem escrever a
prova lá quebra a suíte.
