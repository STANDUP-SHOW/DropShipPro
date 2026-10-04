#!/bin/sh
echo "heure : $(date +%H:%M:%S)"
echo "--- ETAPE EN COURS ---"
tail -c 3000 /home/node/.n8n/n8nEventLog.log 2>/dev/null | tr ',' '\n' \
  | grep -E '"workflowName"|"nodeName"|"eventName":"n8n.workflow' | tail -6
echo "--- RAPPORTS DU JOUR ---"
ls -1 /files/DropPost/MARKET-ANALYSES/rapports/ 2>/dev/null | grep "$(date +%Y-%m-%d)" || echo "(aucun encore)"
