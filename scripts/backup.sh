#!/bin/sh
# Backup do banco, rodado em laço pelo serviço `backup` do compose.
#
# `pg_dump` no formato custom (-Fc): comprime sozinho e permite restaurar uma
# tabela isolada com pg_restore, em vez de exigir o banco inteiro de volta —
# que é o que quase sempre se precisa quando uma importação estraga uma base
# só.
#
# Grava primeiro num arquivo temporário e só renomeia no fim. Sem isso, um
# backup interrompido no meio fica no diretório com cara de backup bom, e o
# problema só aparece no dia da restauração.
set -eu

DESTINO=/backups
RETENCAO_DIAS=${RETENCAO_DIAS:-14}
INTERVALO=${INTERVALO_SEGUNDOS:-86400}

log() {
  echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $1"
}

executar() {
  carimbo=$(date '+%Y%m%d-%H%M%S')
  parcial="$DESTINO/.parcial-$carimbo.dump"
  final="$DESTINO/drp_ai-$carimbo.dump"

  log "iniciando"
  if pg_dump -Fc -f "$parcial"; then
    mv "$parcial" "$final"
    log "gravado: $(basename "$final") ($(du -h "$final" | cut -f1))"
  else
    rm -f "$parcial"
    log "FALHOU — nada foi gravado"
    return 1
  fi

  # Só apaga depois de um backup bom: se o dump falhar, o antigo continua lá.
  apagados=$(find "$DESTINO" -name 'drp_ai-*.dump' -type f -mtime "+$RETENCAO_DIAS" -print -delete | wc -l)
  [ "$apagados" -gt 0 ] && log "removidos $apagados backup(s) com mais de $RETENCAO_DIAS dias"

  log "total em disco: $(du -sh "$DESTINO" | cut -f1), $(find "$DESTINO" -name 'drp_ai-*.dump' | wc -l) arquivo(s)"
}

log "serviço iniciado — a cada ${INTERVALO}s, retenção de ${RETENCAO_DIAS} dias"

# Um backup logo na subida: assim uma configuração errada aparece agora, e não
# só no dia seguinte quando o primeiro ciclo venceria.
executar || log "primeiro backup falhou; tentando de novo no próximo ciclo"

while true; do
  sleep "$INTERVALO"
  executar || log "ciclo falhou; seguindo para o próximo"
done
