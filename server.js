#!/usr/bin/env node
import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

import { getMemoryPath } from "./core/memory.js";
import { registerOpenAIProxy } from "./backend/openai-proxy.js";
import { registerApiRoutes } from "./backend/api-routes.js";
import { registerWebSocketChat } from "./backend/ws-chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "web")));

registerOpenAIProxy(app);
registerApiRoutes(app);
registerWebSocketChat(wss);

function handleListenError(err) {
  const bind = `${HOST}:${PORT}`;
  if (err.code === "EADDRINUSE") {
    console.error(chalk.red(`\n  Port already in use: ${bind}`));
    console.error(chalk.dim("  Set PORT=3001 or stop the existing server.\n"));
  } else if (err.code === "EPERM") {
    console.error(chalk.red(`\n  Cannot bind server on ${bind}`));
    console.error(chalk.dim("  Check terminal/network permissions or try another PORT/HOST.\n"));
  } else {
    console.error(chalk.red(`\n  Server error: ${err.message}\n`));
  }
  process.exit(1);
}

server.on("error", handleListenError);
wss.on("error", handleListenError);

server.listen(PORT, HOST, () => {
  const urlHost = HOST === "127.0.0.1" ? "localhost" : HOST;
  console.log(chalk.cyan(`\n  Jarvis     ->  http://${urlHost}:${PORT}`));
  console.log(chalk.dim(`  WebSocket  ->  ws://${urlHost}:${PORT}/ws`));
  console.log(chalk.dim(`  OpenAI API ->  http://${urlHost}:${PORT}/v1`));
  console.log(chalk.dim(`  Memory     ->  ${getMemoryPath()}\n`));
});
