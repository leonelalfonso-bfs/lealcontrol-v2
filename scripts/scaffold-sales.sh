#!/bin/bash
set -euo pipefail
ROOT=/home/leonel/Desarrollo
MOD=$ROOT/src/Modules/Sales
mkdir -p "$MOD"
cd "$ROOT"
for p in Contracts Domain Application Infrastructure; do
  name=LealControl.Modules.Sales.$p
  if [ ! -f "$MOD/$name/$name.csproj" ]; then
    dotnet new classlib -n "$name" -o "$MOD/$name" --force
  fi
  rm -f "$MOD/$name/Class1.cs"
done

dotnet add "$MOD/LealControl.Modules.Sales.Domain" reference "$ROOT/src/BuildingBlocks/LealControl.BuildingBlocks/LealControl.BuildingBlocks.csproj"
dotnet add "$MOD/LealControl.Modules.Sales.Application" reference "$MOD/LealControl.Modules.Sales.Domain/LealControl.Modules.Sales.Domain.csproj"
dotnet add "$MOD/LealControl.Modules.Sales.Application" reference "$MOD/LealControl.Modules.Sales.Contracts/LealControl.Modules.Sales.Contracts.csproj"
dotnet add "$MOD/LealControl.Modules.Sales.Application" reference "$ROOT/src/Modules/Crm/LealControl.Modules.Crm.Contracts/LealControl.Modules.Crm.Contracts.csproj"
dotnet add "$MOD/LealControl.Modules.Sales.Infrastructure" reference "$MOD/LealControl.Modules.Sales.Application/LealControl.Modules.Sales.Application.csproj"
dotnet add "$ROOT/src/Host/LealControl.Api/LealControl.Api.csproj" reference "$MOD/LealControl.Modules.Sales.Infrastructure/LealControl.Modules.Sales.Infrastructure.csproj"

# Align package versions with Directory.Packages.props if present
if [ -f "$ROOT/Directory.Packages.props" ]; then
  dotnet add "$MOD/LealControl.Modules.Sales.Application" package MediatR
  dotnet add "$MOD/LealControl.Modules.Sales.Application" package FluentValidation
  dotnet add "$MOD/LealControl.Modules.Sales.Application" package FluentValidation.DependencyInjectionExtensions
  dotnet add "$MOD/LealControl.Modules.Sales.Application" package Microsoft.Extensions.Logging.Abstractions
  dotnet add "$MOD/LealControl.Modules.Sales.Infrastructure" package Microsoft.EntityFrameworkCore
  dotnet add "$MOD/LealControl.Modules.Sales.Infrastructure" package Microsoft.EntityFrameworkCore.Relational
  dotnet add "$MOD/LealControl.Modules.Sales.Infrastructure" package Npgsql.EntityFrameworkCore.PostgreSQL
  dotnet add "$MOD/LealControl.Modules.Sales.Infrastructure" package Microsoft.EntityFrameworkCore.Design
else
  dotnet add "$MOD/LealControl.Modules.Sales.Application" package MediatR --version 12.4.1
  dotnet add "$MOD/LealControl.Modules.Sales.Application" package FluentValidation --version 11.11.0
  dotnet add "$MOD/LealControl.Modules.Sales.Application" package FluentValidation.DependencyInjectionExtensions --version 11.11.0
  dotnet add "$MOD/LealControl.Modules.Sales.Application" package Microsoft.Extensions.Logging.Abstractions --version 8.0.2
  dotnet add "$MOD/LealControl.Modules.Sales.Infrastructure" package Microsoft.EntityFrameworkCore --version 8.0.11
  dotnet add "$MOD/LealControl.Modules.Sales.Infrastructure" package Microsoft.EntityFrameworkCore.Relational --version 8.0.11
  dotnet add "$MOD/LealControl.Modules.Sales.Infrastructure" package Npgsql.EntityFrameworkCore.PostgreSQL --version 8.0.11
  dotnet add "$MOD/LealControl.Modules.Sales.Infrastructure" package Microsoft.EntityFrameworkCore.Design --version 8.0.11
fi

dotnet sln "$ROOT/LealControl.sln" add \
  "$MOD/LealControl.Modules.Sales.Contracts/LealControl.Modules.Sales.Contracts.csproj" \
  "$MOD/LealControl.Modules.Sales.Domain/LealControl.Modules.Sales.Domain.csproj" \
  "$MOD/LealControl.Modules.Sales.Application/LealControl.Modules.Sales.Application.csproj" \
  "$MOD/LealControl.Modules.Sales.Infrastructure/LealControl.Modules.Sales.Infrastructure.csproj" || true

echo DONE
