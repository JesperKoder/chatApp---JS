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

  if (cluster.isPrimary) {
    const numCPUs = availableParallelism();
    // create one worker per available core
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork({
        PORT: 3000 + i
      });
    }
    
    // set up the adapter on the primary thread
    setupPrimary();
  } else {
    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
      connectionStateRecovery: {},
      // set up the adapter on each worker thread
      adapter: createAdapter()
    });

const port = process.env.PORT;

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// Serve socket.io client script
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  })
});

io.on('connection', async (socket) => {
    socket.on('chat message', async (msg) => {
    let result;
    try {
      result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
    } catch (e) {
      if (e.errno === 19) /* SQLITE_CONSTRAINT */ {
      // The message was already inserted, so we notify the client
      callback();
    } else {
      // Client retryed sending the same message
    }
      return;
    }
    io.emit('chat message', msg, result.lastID);
    // Acknowledge the event
    callback();
    });

    if(!socket.recovered) {
        try {
            await db.each('SELECT id, content FROM messages WHERE id > ?',
                [socket.handshake.auth.serverOffset || 0],
                (err, row) => {
                    socket.emit('chat message', row.content, row.id);
                }
            )
        } catch (e) {
            // Some error
        }
    }
  });


