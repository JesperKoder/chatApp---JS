import { Server } from "socket.io";
import { createServer } from 'http';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const app = express();
const server = createServer(app);
const io = new Server(server);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Serve socket.io client script
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('a user connected');
});

server.listen(3000, () => {
    console.log('Server running on PORT:3000');
});