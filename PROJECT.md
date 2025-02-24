# Nebula - Modern Server Management System

## Project Overview

Nebula is a modern server management and web hosting control panel built with Deno, providing efficient management of hosting environments and server resources.

## Technology Stack

- **Backend**: Deno, TypeScript, Hono, SQLite
- **Frontend**: Vanilla JS with Web Components, Material Design Icons, Modern CSS
- **Server Components**: Apache/Nginx, MariaDB/MySQL, Postfix, Dovecot, BIND9 (optional)

## Project Structure

The application follows a modular architecture with four main areas:

1. **Core System** (`/`)
   - Application entry (`main.ts`)
   - Runtime config (`deno.json`, `import_map.json`)
   - Base templates (`views/`)
   - Public assets (`public/`)

2. **Modules** (`modules/`)
   Each module is self-contained and follows MVC pattern:
   ```
   module/
   ├── controller.ts    # Business logic
   ├── routes.ts       # API endpoints
   └── views/          # Frontend
       ├── content.html    # Main view
       ├── scripts.html    # JavaScript
       └── detail/         # Detail views
   ```

3. **Infrastructure** (`utils/, middleware/`)
   - Authentication & Sessions
   - Database operations
   - System commands
   - Logging
   - Template rendering

4. **Runtime Data** (`nebula-data/`)
   - Configuration
   - Database
   - User data
   
Directory Structure:
```
nebula/
├── data/                  # Templates and static data
│   └── templates/         # Default website templates
├── modules/              # Core functionality modules
│   ├── dashboard/        # System monitoring
│   │   ├── controller.ts # Business logic
│   │   ├── routes.ts     # Route definitions
│   │   └── views/        # Frontend templates & scripts
│   ├── domains/          # Domain & hosting management
│   │   ├── backup.ts     # Backup functionality
│   │   ├── ssl.ts        # SSL certificate handling
│   │   ├── createDomain  # Domain provisioning
│   │   └── views/        # Domain management UI
│   ├── mail/             # Email system
│   │   ├── createMail.ts # Mail account provisioning
│   │   └── views/        # Mail management UI
│   ├── files/            # File management
│   │   └── views/        # File explorer UI
│   ├── databases/        # Database operations
│   ├── users/            # User & permission management
│   ├── prozess/          # Process & service management
│   ├── dns/              # DNS zone management
│   ├── login/            # Authentication
│   └── logs/             # Logging system
├── middleware/           # Application middleware
│   ├── auth.ts          # Authorization logic
│   └── session.ts       # Session management
├── utils/               # Core utilities
│   ├── command.ts       # System command execution
│   ├── config.ts        # Configuration management
│   ├── database.ts      # Database operations
│   ├── logger.ts        # Logging functionality
│   ├── os.ts            # OS operations
│   └── template.ts      # Template rendering
├── public/              # Static assets
├── views/               # Global templates
│   └── base.html       # Base layout template
└── install/             # Installation
    ├── install.ts      # DB and file setup
    └── install-stacks  # Server stack installation

nebula-data/            # Runtime data (outside main app)
├── config/             # Runtime configuration
└── data/              # Application data
    └── nebula.db      # SQLite database
```

### Module Pattern
Each module follows a consistent structure:
- `controller.ts`: Business logic
- `routes.ts`: API endpoints
- `views/`: UI components
  - `content.html`: Main view
  - `scripts.html`: View-specific JavaScript
  - `detail/`: Detail views if applicable

### Module Dependencies

Core module relationships:
```
dashboard ─── domains ─┬─ mail
         │            ├─ files
         │            ├─ databases
         └── logs     └─ dns

users ──── domains
         └─ databases

processes ─ logs
```

Each module can operate independently but shares:
- Common utilities (`utils/`)
- Authentication (`middleware/`)
- Base templates (`views/`)
- Configuration (`config/`)

### Key Files
- `main.ts`: Application entry point and routing
- `deno.json`: Runtime configuration and tasks
- `import_map.json`: Module imports and dependencies
- `Dockerfile`: Container configuration

### Module Features

Core functionality is split into focused modules:

- **Dashboard**: Real-time system monitoring and activity overview
- **Domains**: Complete hosting environment management including SSL, PHP versions, and DNS
- **Mail**: Full-featured mail server management with Postfix/Dovecot integration 
- **Files**: Web-based file operations and FTP account management
- **Databases**: Managed database hosting for MySQL and PostgreSQL
- **Users**: Access control and client management
- **Processes**: System service and resource management
- **DNS**: BIND9 zone and record management
- **Logs**: Centralized logging and monitoring

## Security & Configuration

### Security
- Session-based auth
- SSL/TLS with Let's Encrypt
- ModSecurity & Fail2ban
- OpenBasedir restrictions
- Custom security headers

### Configuration Sources
- JSON files
- Environment variables
- Database settings
- Runtime configuration

## Development

- **Requirements**:
  - OS: Linux (Debian/Ubuntu recommended)
  - Deno runtime
  - Root/sudo access
  - Min: 1GB RAM, 20GB disk

- **Setup**:
  - Automated stack installation
  - Development server (port 3000)
  - Docker support
  - Hot-reload enabled

## Development Workflows

### Quick Start
```
cd nebula
deno task dev        # Start development server with hot-reload
```

### Docker Development
```
docker run -it --rm \
  -v ${PWD}:/app \
  -w /app \
  -p 3000:3000 -p 81:80 \
  denoland/deno task dev
```

### New Module Checklist
1. Create module structure:
   ```
   modules/new-module/
   ├── controller.ts
   ├── routes.ts
   └── views/
       ├── content.html
       └── scripts.html
   ```
2. Register routes in `main.ts`
3. Add database migrations if needed
4. Implement controller logic
5. Create view templates
6. Update documentation

## Data Structure

SQLite database with tables for:
- clients (users)
- domains
- hosting
- databases
- mail
- logs
- dns_records
- mail_aliases

## Status & Contributing

Currently in active development. This documentation should be:
- Updated with significant changes
- Kept concise and non-redundant
- Focused on developer relevance
- Regularly cleaned of outdated information