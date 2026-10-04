#!/bin/sh
cd /files/DropPost/MARKET-ANALYSES/n8n
echo '--- IMPORT ---'
n8n import:workflow --input=_test-claude.workflow.json 2>&1 | tail -5
echo '--- LIST ---'
n8n list:workflow 2>/dev/null | grep -i "Test"
