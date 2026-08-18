#!/bin/bash
set -euo pipefail
fuser -k 5208/tcp 2>/dev/null || true
sleep 1
cd /home/leonel/Desarrollo
dotnet build src/Host/LealControl.Api/LealControl.Api.csproj
cd frontend
npx tsc -b --pretty false
echo OK
