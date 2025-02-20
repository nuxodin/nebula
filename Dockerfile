# Verwende ein offizielles Deno-Image als Basis
FROM denoland/deno:alpine

# Setze das Arbeitsverzeichnis im Container
WORKDIR /app

# Öffne den Port 3000 (oder passe ihn an, falls nötig)
EXPOSE 3000

# Starte das Projekt mit dem "dev"-Task aus deiner deno.json
CMD ["task", "dev"]
