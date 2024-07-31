import { Server } from "socket.io";
import { createServer } from 'http';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { availableParallelism } from "node:os";
import cluster from "node:cluster";
import { createAdapter, setupPrimary } from "@socket.io/cluster-adapter";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function setupDatabase() {
  const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
    );
  `);

  return db;
}

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({
      PORT: 3000 + i
    });
  }
  setupPrimary();
} else {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {},
    adapter: createAdapter()
  });

  app.use(express.static(__dirname));

  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
  });

  setupDatabase().then(db => {
    io.on('connection', (socket) => {
      console.log('a user connected');
      
      socket.on('disconnect', () => {
        console.log('user disconnected');
      });

      socket.on('chat message', async (msg, clientOffset, callback) => {
        let result;
        try {
          result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
          io.emit('chat message', msg, result.lastID);
          callback();
        } catch (e) {
          if (e.errno === 19) { // SQLITE_CONSTRAINT
            callback();
          } else {
            console.error(e);
          }
        }
      });

      if (!socket.recovered) {
        db.each('SELECT id, content FROM messages WHERE id > ?',
          [socket.handshake.auth.serverOffset || 0],
          (err, row) => {
            if (err) {
              console.error(err);
            } else {
              socket.emit('chat message', row.content, row.id);
            }
          }
        );
      }
    });

    const port = process.env.PORT;
    server.listen(port, () => {
      console.log(`server running at http://localhost:${port}`);
    });
  }).catch(console.error);
}