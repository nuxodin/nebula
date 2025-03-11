#!/bin/bash

set -e  # Beendet das Skript bei Fehlern

# Variablen
INSTALL_DIR="${1:-/opt/nebula}"  # Standard: /opt/nebula, aber anpassbar via Argument
SERVICE_NAME="nebula"
LOG_FILE="/var/log/nebula.log"

# Funktionen
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "Dieses Skript benötigt Root-Rechte. Bitte mit sudo ausführen."
        exit 1
    fi
}

install_dependencies() {
    echo "Prüfe Abhängigkeiten..."
    if ! command -v git &> /dev/null; then
        echo "Git wird installiert..."
        apt-get update && apt-get install -y git || yum install -y git
    fi
    if ! command -v deno &> /dev/null; then
        echo "Deno wird installiert..."
        curl -fsSL https://deno.land/install.sh | sh
        export DENO_INSTALL="$HOME/.deno"
        export PATH="$DENO_INSTALL/bin:$PATH"
        # Dauerhafte PATH-Änderung (optional)
        echo "export PATH=\"$DENO_INSTALL/bin:\$PATH\"" >> "$HOME/.bashrc"
    fi
}

setup_project() {
    if [ -d "$INSTALL_DIR" ]; then
        echo "Projekt aktualisieren..."
        cd "$INSTALL_DIR" && git pull
    else
        echo "Projekt klonen..."
        git clone https://github.com/nuxodin/nebula.git "$INSTALL_DIR"
        chown -R "$USER:$USER" "$INSTALL_DIR"
    fi
    cd "$INSTALL_DIR"
}

setup_service() {
    if command -v systemctl &> /dev/null; then
        echo "Systemd-Service einrichten..."
        SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

        cat > "$SERVICE_FILE" <<EOL
[Unit]
Description=Nebula Deno Service
After=network.target

[Service]
ExecStart=$(which deno) task start
WorkingDirectory=$INSTALL_DIR
Restart=always
User=$USER
Environment=DENO_DIR=$HOME/.deno
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOL

        systemctl daemon-reload
        systemctl enable "$SERVICE_NAME"
        systemctl start "$SERVICE_NAME"
        echo "Service wurde gestartet!"
    else
        echo "Kein Systemd gefunden. Starte Tool mit nohup..."
        touch "$LOG_FILE" && chown "$USER:$USER" "$LOG_FILE"
        nohup deno task start > "$LOG_FILE" 2>&1 & disown
        echo "PID: $!. Log: $LOG_FILE"
    fi
}

# Hauptlogik
check_root
install_dependencies
setup_project
setup_service

echo "Installation abgeschlossen! Nebula läuft jetzt."