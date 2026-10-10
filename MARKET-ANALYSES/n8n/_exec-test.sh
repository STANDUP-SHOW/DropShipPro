#!/bin/sh
export N8N_RUNNERS_ENABLED=false
export N8N_RUNNERS_BROKER_PORT=5688
export N8N_PORT=5699
n8n execute --id zzTestCleClaude01 2>&1 | tail -40
