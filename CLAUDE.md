### DRP_AI
- Softaware que vai ter as bases de transações diárias, saldos em estoque, pedidos em aberto, transferencias em aberto, etc..., e ai calular previsões de chegada de produtyos nos cds, riscos de ruptura, sugestões de abastecimento.
- Além disso usará IA para priorizar e gerar alertas de riscos de desabastecimento e outras metricas qua ainda serão definidas.

## STACK

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM (com postgresql)
- Zod (para validação de todas as entradas)
- Componentes shadcn
- BetterAuth para autenticação
- resend para envio de emails
- Docker (Dokcer file da aplicação)

## Comandos
- npm run dev — servidor de desenvolvimento
- npm run build — build de produção
- npm run test — testes

## Regras importantes para o Claude
- NÃO commitar arquivos .env* (já estão no .gitignore)
- Sempre que criar uma rota nova, adicionar tipagem nos params/searchParams
- Preferir editar arquivos existentes a criar novos
- Se uma tarefa não estiver clara, perguntar antes de codar
- Sempre inserir paginação nas tabelas

## Estilo
- Paleta de cores sugerida 🟢 Verde-água (turquesa claro)#7FD9CDHeader, botão CTA, detalhes gráficos🟦 Azul-petróleo escuro#16455CLogo, títulos, textos principais⚪ Branco#FFFFFFFundo principal⚫ Cinza-grafite#2B2B2BTextos de navegação🟩 Verde escuro (scrub médico)#2E9B7CCor de apoio (presente na imagem)🩶 Cinza claro#F5F5F5Backgrounds secundários sugeridos.

- Quero um perfil corporativo estilo sales force, nos cards transferencias e liberação , podem colocar imagem sugstiva.


# Task_01_set_inicial

- Realize o set up inicial do projeto
- Contrua a tela de Login / criação de usuários
    - POST (criar usuário)
    - PATCH (atualizar dados do usuário)
    - POST (login usuário)
- A tela de login deve ser dividida ao meio , lado esquerdo uma imagem que remeta a logistica, dados, informação, tecnologia, do lado direito o formulário de login ou criação de usuários.

- O login é via better auth com email e senha cadastrados.
- O com a autenticação realizada, o usuário deve cair na página princial da aplicação.
- Essa pagina tem um sidebar a esquerda com a opção de expandir ou recolher. nessa pagina trabalharemos os imports de arquivos CSV, vamos editar o schema prisma gradativamente a partir da próxima task, por enquanto deixe apenas as tabelas que o better auth vai gerar.

# Task_02_imports_models_routes_page

- vamos criar os imports, abaixo serão informador os nomes das tabelas, titulos das colunas, e alguns dados de exemplo, vamos criar as models, e os rotas para importação do csv e a guia na tela de importação, essa tela tera uma guia para cada tabela no banco, e deve ter o botão de importar csv , botão de limpar tabela ( delete ) e uma tabela com os dados( paginada).

- será uma pagina (uploads) com uma guia para cada model.

- Model produtos:
- colunas: codigo | descricao | tipo | unidade | cod_barras | cod_fabrica | cod_marca | marca | grp_marca | d_grp_marca | grupo | tag_medic | tipo_medicamento | principio_ativo | usa_refrig
- exemplo dos dados: 19 | GLUCONATO DE CALCIO (HYPOCALCIO) 10% 10ML C/100 | PA | CX | 7898122910856 | F000207185 | 83 | PFIZER | 407 | PFIZER | MEDICAMENTOS-DIVERSOS | S | SIMILAR | CLORIDRATO DE DEXMEDETOMIDINA | N
- Model fiscal:
- colunas: codigo | segmento_pricing | categoria_gc | classe | ean | uf_fornecedor | tributacao
- exemplo dos dados: 998645 | ALTO CUSTO | INOVADORES | Top Item | 7896212480203 | SP | Isento - Convênio 162/94 - Novos - exc. GO - Nacional
- Model rotas:
- colunas: codigo_rota | descricao | descricao_cod | filial_final | filial_final_cod | empresa
- exemplo dos dados: 3 | CTL > LDA > DF2 | 1003->1002->1036 | DF2 | 1036 | Mafra
- Model pedidos_de_compra:
- colunas: codigo | descricao | armazem | cod_fornecedor | data_emissao | data_entrega | filial | grupo_marca | num_pedido | quantidade_entregue | quantidade_total | quantidade_receber | unidade | saldo_ajustado | tp_ped_transf | tp_ped_transf_descricao | rota_final | porcentagem_entregue | categoria | comprador | tributacao | supridor | provider | lt | bo | frete | cob_cd | cob_br | data_pedra | status_lt | ruptura_cd | ruptura_br | nota_fiscal | status_logistica | data_agendada
- exemplo dos dados: 137950 | VOLARE 20MG CX 2SERP 0,2ML +SIST SEG ACHE | 26 | 002218-0001-ACHE LAB. FARMAC. S.A | 2026-07-08 | 2026-07-18 | 1015 | ACHE | 5103 | 0 | 65 | 65 | CX | 1845.35 | 149 | ES > RJ | 1023 | 0 | MED | GEOVANNE S. | Nacional 7% | ELLISSON | ELLISSON | 14 | Não | CIF/FOB | 10 | 14 | 2026-07-24 | Em Tempo | CD entre 10 e 20 | BR entre 10 e 20 | 4020046 | S/Agendamento ou Coleta | S/AGENDAMENTO
- Model simulador:
- colunas: cod_prod_cod_filial | codigo | filial | produto | marca | fornecedor | est_arm_01 | est_arm_11 | est_arm_26 | est_arm_nac | est_arm_q40 | est_arm_rc | estoque_cmv | cmv_unitario | cmv_unitario_1 | compras_arm_01 | compras_arm_26 | compras_arm_nac | valor_pedido_aberto_bruto | valor_pedido_aberto_cmv | em_transf_arm_01 | em_transf_arm_11 | em_transf_arm_26 | total_trans | reserva | qtd_pendente | bloqueio | vendido_m0_arm_01 | vendido_m0_arm_26 | vendido_m0_arm_11 | vendido_m0_arm_tr
- exemplo dos dados: 168368|001021 | 168368 | 1021 | (UG) AGULHA BIOP TEC MOLE UNIMED 16GX10CM ALPHARAD | 545749 | ALPHARAD | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 1563.073336413733 | 0 | 0 | 0 | 0 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 0 | 0 | 0
obs: a origem tem 5 coluna(s) sem cabeçalho útil no final (Unnamed: 31, Unnamed: 32, Unnamed: 33, Unnamed: 34, 1), vazias nos dados — ignoradas.
- Model forecast:
colunas: codigo | filial | rota_compra | forecast_m0 | forecast_m0_atualizado | politica | politica_plano | torre | m_4 | m_3 | m_2 | m_1
- exemplo dos dados: 86 | 1036 | 1036 | 0 | 0 | 50 | 36 | Considerar | 0 | 2 | 0 | 0
- Model plano_compra:
- colunas: codigo | empresa | plano_de_compra
- exemplo dos dados: 998645 | Mafra | 1400
- Model transferencias_abertas:
- colunas: tipo_nf_saida | filial_codigo_saida | serie_nf_saida | numero_nf_saida | cfop | cliente_codigo | loja_codigo | empresa_saida | cnpj_saida | uf_saida | data_emissao | linha_item | codigo | un_produto | descricao_produto | qtde | valor | valor_sd2_custo_1 | valor_icms_saida | valor_icms_st | local | pedido_venda_protheus | item_pedido_venda | pedido_bo | status_classificada | empresa_entrada | filial_codigo_entrada | descricao_filial_entrada | cnpj_entrada | estado_entrada | lote | validade_lote | tipo_produto | rota | passo | qtde_passo | usuario_pedido_venda
- exemplo dos dados: NOTA FISCAL DE SAIDA | 1006 | 1 | 619035 | 6152 | 25006 | 36 | CM HOSPITALAR S.A. | 12420164000580 | SP | 2026-07-20 | 1 | 164912 | CX | WEZENLA 45MG/0,5ML CX 1SERP AMGEN (G) | 1 | 9114.25 | 8396.960705 | 638 | 0 | | 613682 | 1 | - | PENDENTE | CM HOSPITALAR S.A. DF | 1036 | CM HOSPITALAR S.A. (AEROPORTO DF) | 12420164003687 | DF | 1208977 | 20290131 | PA | ES > CAJ > DF2 > ES | 2 | 3 | API REST PROTHEUS
- Model recebimento:
- colunas: armazem | arq | tes | definicao | cfop | cidade | cnpj | ol | loja | nome | data_emissao | data | data_pedido | lead_time | documento | estado | filial | cod_marca_cadastro | nome_marca_cadastro | nome_grupo_marca | grupo_marca_oficial | quantidade | codigo | produto | pedido | lote | data_validade | custo | valor_total | cofins | pis | ipi | icms | icms_complementar | icms_st | origem | pis_cofins | tributacao | codigo_tributario | grupo_tributario | ncm | cst_pis | tipo_credito | aliq_icms
- exemplo dos dados: 1 | ENTRADAS | 00I | 1 - COMPRAS | 2102 | SUMARE | 45985371000108 | N | 1 | 3M DO BRASIL LTDA. | 2026-06-18 | 2026-07-10 | 2026-06-16 | 24 | 796546 | SP | 1002 | 203 | 3M IPD | 3M | 002-3M | 30 | 2168 | 002168-COMPLY IND QUIM TEST BOWIE DICK REF 1233 | 148219 | 2615301158 | 2028-01-13 | 575.52 | 661 | 48 | 10.46 | 0 | 26.42 | 0 | 0 | 8 | Direito a Crédito | Importado | 100901 | ITENS ALIQ 19% DIFERIMENTO PARCIAL (=12%) | 38221990 | 50 | Direito a Crédito | 4
- Model sla_transferencias:
- colunas: filial_orig | filial_dest | mat_med | ativo | transit_time
- exemplo dos dados: 1002 | 1006 | MAT | 1 | 2
- Model clientes_grupos:
- colunas: cliente_codigo | cliente_loja | cliente_nome | cliente_cnpj | cliente_grupo
- exemplo dos dados: C021925 | L0031 | UNIMED PORTO ALEGRE COOPERATIVA MEDICA LTDA | 87096616003101 | UNIMED PORTO ALEGRE
- Model historico_vendas:
- colunas: unidade_negocio_mov | data | documento | total | ano | mes | cod_prod | armazem | produto | nome | cidade | cfop | cnpj | nome_marca_cadastro | nicho | mercado | cliente_money | definicao | grupo_marca_oficial | estado | filial | quantidade | custo | cliente_contr_icms | empresa | check_empresa | bu | bu_ajustada | regra | filial_ideal_final | tributacao | cpf_ou_cnpj | nome_grupo_marca
- exemplo dos dados: CAI-M | 28/05/2026 | 564540 | 390 | 2026 | mai | 163669 | 01 | 163669-LUVA PROCED LATEX C/PO SOFT AID PP CX 100UN EMBRAST | CLINICA ODONTOLOGICA ORALDENTS VIRGINOPOLIS LTDA | VIRGINOPOLIS | 6108 | 54302258000171 | EMBRAST LP | LABS | - | C422212 | 3 - VENDAS - CMV | 304-LUVA PROCEDIMENTO | MG | 1006 | -20 | -281.43722 | N | Mafra | Mafra | MAT | MAT | TABELA MAT | MG-Estado | Importado | CNPJ | LUVA PROCEDIMENTO
 

# Task_03_Parametrização_de_data_no sistema

- Como temos bases que são cumulativas , precisamos definir uma data para que as querys retornem os dados certos .

- Na tela "Painel" colocar um datepicker para que o usuário selecione o dia de referencia do sistema.
- Ao ser selecionado um dia, por exemplo dia 04/08/2026 (dd/mm/aaaa), os dados de cada tabela serão retornados da seguinte forma na querys:
    - Produtos - Não aplica
    - Fiscal - Não aplica
    - Rotas - Não aplica
    - Pedidos de compra - Pegar somente os dados refrentes a relatório do dia (data snapshot = 04/08/2026 ***considerando que a data selecionada doi essa )
    - Simulador -  Pegar somente os dados do dia (data snapshot = 04/08/2026 ***considerando que a data selecionada doi essa )
    - Forecast -  Considerar o forecast do mês ( data snapshot = mês 8 ( Agosto)
    - Pedidos de compra - Pegar somente os dados do dia (data snapshot = 04/08/2026 ***considerando que a data selecionada doi essa )
    - Transferencias abertas - Pegar somente os dados do dia (data snapshot = 04/08/2026 ***considerando que a data selecionada doi essa )
    - Recebimento  - Não aplica por enquanto
    - SLA transferências - Não aplica
    - Clientes / gripos - Não aplica
    - Histórico de vendas - Não aplica por enquanto.


# Task_05_tela_visão _geral

- Para essa tela vamos cards ou graficos, vc esta aberto para aplicar o melhor design, o que queremos ver nessa tela:

- Na base do simulador, quero ver os estoques totais aberto por CD: formula :
    - soma das colunas ( est_arm_01	est_arm_11	est_arm_26	est_arm_nac	est_arm_q40	est_arm_rc
    ) *  cmv_unitario_1 
    - aberto por CD : coluna filial
    - quero ver o total vendido: soma das colunas ( vendido_m0_arm_01	vendido_m0_arm_26	vendido_m0_arm_11	vendido_m0_arm_tr
    ) * cmv_unitario_1 
    
    - Compras em aberto: soma das colunas ( compras_arm_01	compras_arm_26	compras_arm_nac
    ) * cmv_unitario_1 
    - Transferencias em  aberto : coluna total_trans
    * cmv_unitario_1 

    - quero ver o perfil fiscal desse estoque, precisamos cruzar o código do produto da Guia simulador com a guia fiscal , cada item terá uma tributação e eu quero aver em cada filial a composição tributária do estoque,a abertura será a coluna tributacao
    da guia fiscal. quero saber em valor e percentual de representatividade de cada trigutação dentro de cada CD 


# Task_Rotas _abastecimento

- Na aba forecast temos a coluna "rota_compra"
- Na guia Visão geral, na ultima tabela , que  esta por tributação, para cada CD selecionado , eu quero em cada tributação ver as rotas que abastecem aquele CD, como a rota esta por item filial, precisa pegar a tributação dos produtos na tabela de fiscal, para ai sim pegar as rotas por tributração, o resultado final será conforme o exemplo abaixo: 
    - filal 1006 selecionada 
        - Na ultima tabela abaixo de cada tributação, irá aparecer as opões de rota que abastecem aquela tributação naquele cd.

- Essa pagina completa dve ter um filtro de laboratóri, que é a coluna "fornecedor" da guia simulador 

- # Task_calculo dos dias de estoque.

- Nova Pagina "Disponibilidade"

- Na tabela forecast, vamos pegari todos os itens que tem a coluna "forecast_M0" Maior do que zero e calcular os "dias de estoque chão" e "dias de estoque total"

- crie uma pasta utils e deixe essas fomrulas lá para serem usadas :
    - Dias de stoque chão (estoque chão / (forecast/30 ))
    - onde : estoque chão: aba simulador, colunas: est_arm_01	est_arm_11	est_arm_26	est_arm_nac	est_arm_q40	est_arm_rc
    - estoque é o do dia referencia.
    - forecast : Guia forecast coluna "forecast_M0) 
    - gerar um grafico de barras: cada CD 1 barra ( 100% empilhadas ) e as cores na barra serão refrentes ao ragne de dias de estoque :
    -   CD = 0 | cor preta
        entre 0 e 10 | cor vermelha
        entre 10 e 20 | cor amarela
        entre 20 e 30 | cor verde 
        entre 30 e 60 | cor azul
        CD >= 60 | cor roxa
    - Acima de cada barra deve aparecer o total de itens validos naquel CD e as barras devem ter como rotulo o percetual em relação ao total da barra.
    - itens válidos - aba forecast , coluna "torre" valor = "considerar"

    - coloque esse gráfico em uma nova página, porque ao clicar em uma parte da barra , deveremos ter uma tabela na parte inferior da pagina que mostrará os itens relacionados a aquele click.

    - Depois trabalharemos as demais colunas dessa tabela , por enquanto, coloque o código do produto | forecast | estoque chão


# task07_tabela_filiais

- Criar no banco a tabela de filiais no banco de dados, e na tela de importação de csv criar a guia filias com as opções de upload csv e limpar tabela, a tabela tera 3 colunas : 
codigo | sigla | descricao 
- todos string

# task08_projercao_de_transferencias

- Na guia de ttransferencias abertas o CD de origem esta na coluna "filial_codigo_saida" e o CD de destino esta na coluna "filial_codigo_entrada"

- Mas temos a coluna da rota completa que essa transferencias irá percorrer, que é a coluna "rota" , nessa coluna poderemos encontrar apenas um "-" , nesse caso é uma transferencia normal do destino para a origem, mas podemos encontrar também a rota completa, se essa for uma transferencias de triangulação , a rota terá esse modelo : "DF2 > CAJ > ES > LDA" , na nova tabela de filial vc conseguira converter para os códigos dos CDs , ficaria " 1036 > 1006 > 1015 > 1002" .
- Quando temos uma rota na colunas de rotas a primeira coisa a se fazer é identificar em qual passo da rota estamos, isso é feito olhando para as colunas "filial_codigo_saida" e "filial_codigo_entrada"
- nesse nosso exemplo pense que temos a seguinte situação : 
    - filial_codigo_saida : 1006
    - filial_codigo_entrada : 1015
    - rota : DF2 > CAJ > ES > LDA

    ou seja, essa transferencia ja entrou em DF2(1036), saiu de DF2 e entrou em CAJ(1006) e agora o passo atual dela é que ela esta saindo de cajamar mas ainda não chegou em ES(1015)
- E vamos calcular esse tempo, na tabela SLA transferencias temos os tempos ( em dias uteis) entre uma filial e outra, então podemos pegar o tempo entre CAJ e ES e estimar a data de chagda em ES e depois podemos pegar o tempo entre ES e LDA e estimar quando essa transferencias chega ao seu destino final.
- quando existe uma rota, o destino final é sempre a ultima filial da rota.

- no caso de não ter uma rota, pegamos o tempo entre a filial_codigo_saida e filial_codigo_entrada, pois são os casos de transferencias simples. 
- Precisamos ter oo fluxo completo de transferencias com as datas previstas para chegar em cada ponto ( CD )

- vamos discutir , qual a melhor maneira , criar uma view , sql puro.
- para todas as transferencias crie a coluna de CD final , que no caso de linhas com rota será a ultima filiual da rota e linhs sem rota será a filial de destino. 
- Na tabela de transferencias em aberto, temos a coluna "data_emissao" esse é o ponto de partida para começar a calcular os tempos.

- existe casos em que as transferencias foram colocadas ha muito tempo então se somarmos os lead times da ropta a data final será uma data anterior a data atual ( data referencia ) , nesses casos crie um critério, um campo para que eu possa colocar em quantos dias ( a partir da data atual ) essas trabnasfecias entram no destino , ai o restante do fluxo de calculo segue normal.


# task09_tela_de_produto

- Nessa tla teremos todos os detalhes do produta, tela com desggn moderno inspirda em sistemas como sales force por eemplo.
- da Tabela planode compra virá a quantidade planejada de compra mensal para o produto ( mês da data de referencia) 
- Saberemos quantos pedidos temos em aberto desse saldo  da seguinte forma:
    - Tabela de pedidos de compra, somar as quantidades da coluna quantidade_receber, mas apenas quantidades em aberto que o mês da coluna "data_emissao" é igual ao mês da data de referencia.
- Saberemos também o que ja chegou daseguinte forma: 
 - Na tabela recebimento , somar as quantidades da coluna "quantidade" , mas somente se o mês/ano da coluna "data_pedido" for igual ao mês da data de referencia e o mês/ano da coluna "data" for igual ao mês/ano da data de referencia.

 - Com essa lógica teremos 4 mcards:
    - Plano mensal
    - Em aberto
    - Recebido
    - saldo ( plano mensal - em aberto - recebido).

ai teremos a posição do item em cada filial, cada filial pode ser um card maior com a largura total da pagina, para cada filial teremos as informações de estoque chão , Pedidos de compra em aberto, Pedisos de transferencia em aberto , e para os pedidos de transferencia, os pedidos de transferencia devem aparecer na filial final , e agora que temos as estimativas de data de chegada, quero que sejam mostrados como um workflow com as datas de chegada em cada CD até chegar no CD final.
- mostre tbm a rota do produto para cada filial, isso vc pega na tabela de forecast , mostre tabém dos dias de estoque chão e estoque total colm badges. nas cores do grafico de disponibilidade que fizemos.


# task10_projeção_pedidos_de compra

- Da mesma forma que projetamos as datas de chegada dos pedidos de transfrencias na task08, agora vamos projetar as datas dos pedidos de compra.

- Na tabela pedidos de compra, vamos pegar o relatorio em que a datasnapshot é igual ao dia referencia, a quantidade a ser somada esta na coluna "quantidade_receber"
- Temos pedidos diretos ( que não tem rota) e vão direto para a filial final , que esta na coluna "filial", e temos pedidos com rota , onde a rota aparece na coluna "tp_ped_transf_descricao" , tudo que nessa coluna for "N/A"é compra direta.
- a data prevista de chegada esta na coluna " data_pedra" , para os pedidos que tem rota , vamos calcular as datas previstas da mesma forma, e as quantidades devem aparecer na filial final da rota( assim como nas tranasferencias) , informações importantes  que devem aparecer também: 
    - data_emissao
    - num_pedido
    - status_logistica
    - data_agendada
    - frete
- na tela de produto os pedidoa de compra devem aparecer da mesma forma que as transferencias estão aparecendo.workflow com as projeções de data da rota inteira, de a " data_pedra" for anterior ao dia referencia , para o calculo das projeções vamos usar o mesmo parametro de dias que usamos nas transferencias, coloque esse parametro para ser definido na tela "painel"


# task18_nova tela _fornecedor 

- Vamos fazer uma nova tela, será a guia de fornecedores, 
- Nessa tela quero uma tabela,com as seguintes colunas:
    - Fornecedor
    - itens rompidos ( total):total de posições item|CD que tem forecast e estão com estoque zerados na filiais
    - rompidos com pedidos de compra: rompidos item|CD mas com pedidos de compra previsto para chegar.
    - rompidos com pedido de transferencia: rompidos item|CD mas com pedidos de transferencia para chegar.
    - rompidos sem pedidos de compra e sem transferencia, mas com saldo a comprar :  rompidos item|CD sem pedidos de compra ou transferencia mas co saldo a comprar em relação ao plano de compras do mês.
    - rompidos sem pedidos de compra e sem transferencia e sem saldo a comprar: rompidos item|CD sem pedidos de compra ou transferencia sem saldo de compras.

- Pode alterar o nome das colunas para ficarem mais curtos, o item deve aparecer em apenas uma coluna , ou seja, se ele esta rompido e tem pedido de compra e pedido de transferencia, ele deve aparecer na coluna do que vai chegar primeiro.

- a tabela deve ser intereativa, ao clicar no fornecedor, deve abrir o detalhamento abaixo , codigo do item , filial que esta rompido ,se tem podido de compra , a quantidade e a data projetada ou prevista( igual mostramos na tela de produto) , se tem pedido de transferencia, a mostrar da mesma forma, informar a quantidade ainda disponível no saldo de colocação de compra.

- deixe a tabela bem visual , use badges , icones e ao clicar no produto, ele deve direcionar para a tela de produtos que ja temos.

# task20_cds_9000

- Todo CD que o cógigo começa com "90" na verdade se refere ao mesmo cd com início de código "10", ou seja, veja os casos que temos:
    - 9002 -> 1002
    - 9006 -> 1006
    - 9021 -> 1021
    - 9023 -> 1023
    - 9024 -> 1024
 se aparecer mais algum a lógica será a mesma, a diferença é que o estoque e as vendas referentes aos CDS "90" ficam e saem pelo armazém 11, ou seja, na base do simulador os estoques e vendas que aparecem nas colunas "Est (Arm 11)
 " e "Vendido M0 (arm 11)" para a filial 1002 , na verdade é para a filial 9002, e não devem entrar na soma das vendas ou do estoque chão da filial com começo "10"

- Precisamos fazer essa separação e dexar esse código de fácil manutenção , essa lógica é dinâmica então a qualquer mnudança deve ser fácil a alteração.