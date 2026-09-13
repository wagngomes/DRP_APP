-- Reduz historico_vendas às colunas que o sistema usa.
--
-- Das 33 originais do CSV, 22 saem: nenhuma consulta as lia, e juntas
-- somavam 105 dos 160 MB da tabela. O ganho maior não é disco — é a
-- importação, que carrega o arquivo inteiro na memória e passa de 33
-- campos por linha para 13, sobre meio milhão de linhas.
--
-- Aplicado com as tabelas de desenvolvimento e produção vazias, então
-- nenhum dado se perdeu. DROP COLUMN é irreversível: se um dia alguma
-- destas voltar a ser necessária, a coluna volta vazia e o histórico
-- precisa ser reimportado.

-- AlterTable
ALTER TABLE "historico_vendas" DROP COLUMN "ano",
DROP COLUMN "bu",
DROP COLUMN "bu_ajustada",
DROP COLUMN "cfop",
DROP COLUMN "check_empresa",
DROP COLUMN "cidade",
DROP COLUMN "cliente_contr_icms",
DROP COLUMN "cpf_ou_cnpj",
DROP COLUMN "custo",
DROP COLUMN "definicao",
DROP COLUMN "empresa",
DROP COLUMN "filial_ideal_final",
DROP COLUMN "grupo_marca_oficial",
DROP COLUMN "mercado",
DROP COLUMN "mes",
DROP COLUMN "nicho",
DROP COLUMN "nome_grupo_marca",
DROP COLUMN "nome_marca_cadastro",
DROP COLUMN "produto",
DROP COLUMN "regra",
DROP COLUMN "total",
DROP COLUMN "tributacao";

