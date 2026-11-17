# Build context is the repository root (see azure.yaml) so the image can include data/peaks.json.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /repo
COPY data/peaks.json data/peaks.json
COPY src/backend src/backend
RUN dotnet publish src/backend/Kgp.Api/Kgp.Api.csproj -c Release -a $TARGETARCH -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Kgp.Api.dll"]
