# GD Center

**GD Center** é um jogo multiplayer 3D no navegador ambientado no campus da Universidade Federal da Grande Dourados (UFGD), desenvolvido como projeto acadêmico.

## Pré-requisitos

Certifique-se de ter instalado em sua máquina:
- **Java 21 (LTS)** (recomendado: Eclipse Temurin 21)
- **Node.js 22 LTS** (mínimo 22.12; acompanha o `npm`)
- **Git**

*(Não é necessário instalar o Maven globalmente, pois o backend utiliza o Maven Wrapper).*

## Estrutura de Pastas

```text
gd-center/
├── backend/       # Servidor Java 21 + Spring Boot 4.1.2 (Web & WebSocket)
├── frontend/      # Cliente Web React + JavaScript + Three.js (Vite)
├── .gitattributes # Padronização de quebras de linha (LF/CRLF)
├── .gitignore     # Arquivos ignorados pelo Git na raiz do monorepo
└── README.md      # Documentação do projeto
```

## Como Executar o Projeto

### 1. Backend (Porta `8080`)

Acesse a pasta `backend/` e execute o projeto usando o Maven Wrapper:

**No Linux / macOS:**
```bash
cd backend
./mvnw spring-boot:run
```

**No Windows:**
```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

O servidor estará disponível em `http://localhost:8080`.

### 2. Frontend (Porta `5173`)

Em outro terminal, acesse a pasta `frontend/`, instale as dependências e inicie o servidor de desenvolvimento:

```bash
cd frontend
npm install
npm run dev
```

A aplicação web estará disponível em `http://localhost:5173` (com proxy configurado para `/api` -> `http://localhost:8080` e `/ws` -> `ws://localhost:8080`).
