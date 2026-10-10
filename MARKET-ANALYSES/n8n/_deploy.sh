#!/bin/sh
cd /files/DropPost/MARKET-ANALYSES/n8n || exit 1
echo '--- GENERATION ---'
node _build-workflow.cjs || exit 1
echo '--- IMPORT ---'
n8n import:workflow --input=agent-rayon-unifie.workflow.json 2>&1 | tail -4
echo '--- ACTIVATION ---'
n8n update:workflow --id=agentRayonUnifie --active=true 2>&1 | tail -3
