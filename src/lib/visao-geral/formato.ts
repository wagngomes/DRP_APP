/** Valor cheio: R$ 234.607.533. Centavos não ajudam em cifras dessa ordem. */
export function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Valor curto para eixos e rótulos dentro das barras: R$ 234,6 mi. */
export function moedaCurta(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000_000) return `R$ ${(valor / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(valor / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return moeda(valor);
}

export function percentual(parte: number, total: number): string {
  if (total === 0) return "0,0%";
  return `${((parte / total) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function inteiro(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
