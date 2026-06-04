# WPPConnect Server — Mesquita Imóveis

Backend Node.js (Express + [WPPConnect](https://github.com/wppconnect-team/wppconnect)) que
conecta o sistema ao WhatsApp do escritório. Roda **localmente no Windows 10** (sem Docker),
expõe endpoints REST para o painel administrativo e grava todas as mensagens no banco
do projeto (Supabase / Lovable Cloud).

---

## ✅ Recursos

- Conexão via QR Code com sessão persistente (não precisa escanear de novo)
- Endpoints `/send-message`, `/webhook`, `/status`, `/qr-code`, `/reconnect`, `/logout`
- Mensagens recebidas e enviadas gravadas em `whatsapp_messages`
- Vínculo automático com inquilino pelo número de telefone
- Encaminhamento opcional para um `WPP_WEBHOOK_URL` (para IA / fluxos extras)
- Proteção por `X-Api-Key`

---

## 🪟 Instalação no Windows 10 (sem Docker)

### 1. Instalar pré-requisitos

1. **Node.js 18+ LTS** — baixe em <https://nodejs.org/> e instale com as opções padrão
   (marque a opção *"Automatically install the necessary tools..."*).
2. **Google Chrome** — já vem com o Windows na maioria dos casos. Se não tiver, instale
   <https://www.google.com/chrome/>. O WPPConnect usa o Chromium do Puppeteer, mas o
   Chrome ajuda em alguns cenários.
3. (Opcional) **Git for Windows** — <https://git-scm.com/download/win>.

Verifique no **Prompt de Comando**:

```bat
node -v
npm -v
```

### 2. Copiar a pasta `wppconnect-server`

Copie a pasta inteira para um lugar fácil, por exemplo: `C:\mesquita\wppconnect-server`.

### 3. Configurar variáveis

Dentro da pasta, duplique `.env.example` e renomeie para `.env`. Edite:

```
WPP_PORT=3333
WPP_SESSION_NAME=mesquita
WPP_WEBHOOK_URL=
WPP_API_KEY=defina-um-token-forte
SUPABASE_URL=https://qvnfifgnadxmevatwdxm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=cole-a-service-role-key
CORS_ORIGIN=*
```

> A `SUPABASE_SERVICE_ROLE_KEY` é encontrada em **Lovable Cloud → Configurações do backend**.
> **Nunca** compartilhe essa chave publicamente.

### 4. Instalar dependências

Abra o **Prompt de Comando** dentro da pasta e rode:

```bat
npm install
```

A primeira instalação baixa o Chromium do Puppeteer (~150 MB). Aguarde até terminar.

### 5. Iniciar o servidor

Opção A — duplo clique em **`start.bat`**.

Opção B — no Prompt:

```bat
npm start
```

Você verá:

```
✅ WPPConnect server rodando em http://localhost:3333
```

### 6. Conectar o WhatsApp

1. Abra o sistema no navegador e vá em **Central WhatsApp** (menu lateral).
2. Cole a URL `http://localhost:3333` e a `WPP_API_KEY` definida no `.env`.
3. Clique em **Conectar** — o QR Code aparece na tela.
4. Abra o WhatsApp no celular → **Aparelhos conectados** → **Conectar aparelho**.
5. Aponte a câmera para o QR. Pronto, a sessão fica salva localmente.

### 7. Manter rodando

Para deixar o servidor sempre ligado em segundo plano:

- Coloque um atalho de `start.bat` em `shell:startup` (executar → digite e Enter).
- Ou instale como serviço com [NSSM](https://nssm.cc/): `nssm install WPPConnect`.

---

## 🔌 Endpoints

Todos os endpoints (exceto `/` e `/webhook`) exigem o header `X-Api-Key: <seu token>`.

| Método | Rota             | Descrição                                  |
| ------ | ---------------- | ------------------------------------------ |
| GET    | `/status`        | Estado da sessão                           |
| GET    | `/qr-code`       | QR Code base64 (quando desconectado)       |
| POST   | `/start`         | Inicia a sessão                            |
| POST   | `/reconnect`     | Fecha e reabre a sessão                    |
| POST   | `/logout`        | Desconecta o WhatsApp                      |
| POST   | `/send-message`  | `{ phone, message, tenantId? }`            |
| POST   | `/webhook`       | Recebe eventos externos (sem auth)         |

Exemplo de envio:

```bat
curl -X POST http://localhost:3333/send-message ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Key: seu-token" ^
  -d "{\"phone\":\"5511999999999\",\"message\":\"Olá!\"}"
```

---

## 🛟 Problemas comuns

- **Porta ocupada** → mude `WPP_PORT` no `.env`.
- **QR não aparece** → clique em **Reconectar** no painel.
- **Sessão cai sozinha** → o WhatsApp Web exige que o celular tenha internet pelo menos
  uma vez a cada ~14 dias. Mantenha o celular online.
- **Erro do Puppeteer / Chromium** → rode `npm rebuild puppeteer` dentro da pasta.
- **Firewall do Windows** → libere o Node.js quando solicitado na primeira execução.

---

## 🔐 Segurança

- Nunca exponha esse servidor diretamente para a internet sem proxy/HTTPS.
- Mantenha a `WPP_API_KEY` em segredo e troque periodicamente.
- A `SUPABASE_SERVICE_ROLE_KEY` dá acesso total ao banco — guarde só no `.env` local.
