# MCP Hostname/IP Server

Полнофункциональный MCP (Model Context Protocol) сервер, предоставляющий два инструмента для получения информации о машине, на которой он запущен.

## Инструменты

1. **get_hostname** - Возвращает hostname машины
2. **get_ip_address** - Возвращает основной IP адрес машины (первый не-loopback IPv4 адрес)

## Установка

```bash
npm install
```

## Сборка

```bash
npm run build
```

## Запуск

Сервер поддерживает два режима транспорта: **stdio** (по умолчанию) и **http**.

### Stdio режим (по умолчанию)

В режиме разработки (с tsx):
```bash
npm run dev
```

В продакшн режиме (после сборки):
```bash
npm start
```

### HTTP режим

В режиме разработки:
```bash
npm run dev:http
```

В продакшн режиме:
```bash
npm run start:http
```

Или через переменную окружения:
```bash
MCP_TRANSPORT=http npm start
```

Настройка порта (по умолчанию 3000):
```bash
MCP_TRANSPORT=http MCP_PORT=8080 npm start
```

## Подключение к IDE/LLM

### Cursor IDE

Добавьте следующую конфигурацию в настройки MCP серверов Cursor:

```json
{
  "mcpServers": {
    "hostname-ip-server": {
      "command": "node",
      "args": ["/absolute/path/to/test-mcp/dist/server.js"]
    }
  }
}
```

Или для режима разработки:

```json
{
  "mcpServers": {
    "hostname-ip-server": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/test-mcp/src/server.ts"]
    }
  }
}
```

### HTTP режим

Для подключения через HTTP, запустите сервер в HTTP режиме и используйте URL:
```
http://localhost:3000/mcp
```

### Другие IDE/LLM

MCP сервер поддерживает два транспорта:
- **stdio** - стандартный транспорт для локального подключения к IDE/LLM
- **http** - HTTP транспорт для удаленного доступа через сеть

Оба режима могут быть подключены к любому клиенту, поддерживающему MCP протокол.

## Использование

После подключения сервера к IDE/LLM, вы сможете использовать инструменты:

- `get_hostname` - вернет hostname машины в формате `{ "hostname": "machine-name" }`
- `get_ip_address` - вернет IP адрес в формате `{ "ipAddress": "192.168.1.100" }`

## Технологии

- TypeScript
- @modelcontextprotocol/sdk
- Node.js

## Лицензия

MIT
