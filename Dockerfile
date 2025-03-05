# Verwende ein offizielles Deno-Image als Basis
FROM denoland/deno:alpine

# Setze das Arbeitsverzeichnis im Container
WORKDIR /app

# Öffne den Port
EXPOSE 4242

# Starte das Projekt mit dem "dev"-Task aus deiner deno.json
CMD ["task", "dev"]
