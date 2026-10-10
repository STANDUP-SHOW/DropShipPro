#!/bin/sh
echo "heure : $(date +%H:%M:%S)"
echo "--- FICHIERS UNIFIES ECRITS ---"
ls -la /files/DropPost/MARKET-ANALYSES/rapports/ 2>/dev/null | grep -E '_smartphones\.(md|json)' || echo "(rien encore)"
echo "--- DERNIERES EXECUTIONS ---"
tail -c 1500 /home/node/.n8n/n8nEventLog.log 2>/dev/null | tr ',' '\n' | grep -E '"workflowName"|"nodeName"|"lastNodeExecuted"|Error' | tail -12
