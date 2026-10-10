#!/bin/sh
cd /files/DropPost/MARKET-ANALYSES/n8n || exit 1
echo '--- GENERATION ---'
node _build-orchestrateur.cjs || exit 1
echo '--- IMPORT ---'
n8n import:workflow --input=orchestrateur-quotidien.workflow.json 2>&1 | tail -3
echo '--- ACTIVATION (orchestrateur + agent) ---'
n8n update:workflow --id=orchestrateurQuotidien --active=true 2>&1 | tail -1
n8n update:workflow --id=agentRayonUnifie --active=true 2>&1 | tail -1
echo '--- ANCIEN ORCHESTRATEUR : ON LE LAISSE ETEINT ---'
n8n update:workflow --id=lu4qDVYEMhdV8w8x --active=false 2>&1 | tail -1
echo '--- LISTE ---'
n8n list:workflow
