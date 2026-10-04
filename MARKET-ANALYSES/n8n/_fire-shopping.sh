#!/bin/sh
cd /files/DropPost/MARKET-ANALYSES/n8n || exit 1
n8n import:workflow --input=_test-shopping.workflow.json 2>&1 | tail -3
n8n update:workflow --id=zzTestShopping01 --active=true 2>&1 | tail -2
