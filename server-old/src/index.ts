import app from './app';
import dotenv from 'dotenv';
import http from 'http';
import { setupWebsocketServer } from './wsServer';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);

const server = http.createServer(app);

setupWebsocketServer(server);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
