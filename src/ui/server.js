import http from 'node:http';
import { createHandler } from './handler.js';

const PORT = Number(process.env.PORT || 3000);
const handler = createHandler();

const server = http.createServer(handler);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Butler UI: http://127.0.0.1:${PORT}`);
});