import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase, initViolationLogs } from './config/database.js';
import { initMqtt } from './services/mqttService.js';
import apiRoutes, { setSocketIO } from './routes/api.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { 
  cors: { 
    origin: '*', 
    methods: ['GET', 'POST', 'DELETE', 'PUT'] 
  } 
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static violation photos
app.use('/violations', express.static('public/violations'));

// IMPORTANT: Set socketIO BEFORE routes
setSocketIO(io);

app.use('/api', apiRoutes);

app.get('/health', (req, res) => { 
  res.json({ status: 'ok' }); 
});

io.on('connection', (socket) => { 
  console.log('🔌 Client connected:', socket.id);
  console.log('Total clients:', io.engine.clientsCount);
  
  socket.on('disconnect', () => { 
    console.log('🔌 Disconnected:', socket.id); 
  }); 
});

async function startServer() {
  try {
    await initDatabase();
    await initViolationLogs();
    initMqtt(io);
    httpServer.listen(PORT, '0.0.0.0',() => { 
      console.log(`\n✅ Server running on http://0.0.0.0:${PORT}`);
      console.log('✅ Socket.IO ready\n');
    });
    
  } catch (error) { 
    console.error('❌ Failed:', error); 
    process.exit(1); 
  }
}

startServer();
