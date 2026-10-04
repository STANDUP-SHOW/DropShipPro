#!/bin/sh
echo "heure : $(date +%H:%M:%S)"
echo "--- EVENEMENTS RECENTS ---"
tail -c 6000 /home/node/.n8n/n8nEventLog.log 2>/dev/null | tr ',' '\n' | grep -E '"eventName"|"nodeName"|"lastNodeExecuted"|rror|"status"' | tail -25
echo "--- FICHIERS ---"
ls -la /files/DropPost/MARKET-ANALYSES/rapports/ 2>/dev/null | grep -E '_smartphones\.(md|json)' || echo "(rien)"
