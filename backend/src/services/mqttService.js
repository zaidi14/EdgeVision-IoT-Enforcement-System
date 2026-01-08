import mqtt from 'mqtt';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { upsertNode, insertEvent, logViolation, createParkingSession, updateParkingState, updateSessionTimestamp, getActiveParkingSession } from '../config/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mqttClient = null;
let socketService = null;

// Photo capture state
const photoChunks = new Map(); // nodeId -> {chunks: [], expectedChunks: 0, size: 0}
const photoCapturedForSession = new Map(); // nodeId -> sessionId (prevents duplicate photo captures)

// Ensure violations directory exists
const VIOLATIONS_DIR = path.join(__dirname, '../../public/violations');
if (!fs.existsSync(VIOLATIONS_DIR)) {
  fs.mkdirSync(VIOLATIONS_DIR, { recursive: true });
  console.log('📁 Created violations directory:', VIOLATIONS_DIR);
}

export function initMqtt(io) {
  socketService = io;

  const options = {
    clientId: `parking_backend_${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    reconnectPeriod: 1000,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD
  };

  mqttClient = mqtt.connect(process.env.MQTT_URL, options);

  mqttClient.on('connect', () => {
    console.log('✅ Connected to MQTT broker');

    const topics = [
      // NEW ARCHITECTURE
      'node/+/ctrl/#',
      'node/+/cam/#',

      // LEGACY SUPPORT (frontend-safe)
      'node/+/status',
      'node/+/parking_state',
      'node/+/alerts',
      'node_cam/+/video_url'
    ];

    topics.forEach(topic => {
      mqttClient.subscribe(topic, err => {
        if (!err) console.log(`📡 Subscribed to ${topic}`);
      });
    });
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      await handleMqttMessage(topic, message.toString());
    } catch (err) {
      console.error('❌ MQTT handler error:', err);
    }
  });

  return mqttClient;
}

async function handleMqttMessage(topic, payload) {
  console.log(`📩 MQTT ${topic} → ${payload}`);

  const parts = topic.split('/');
  let nodeId, domain, action;

  // ---------- NEW FORMAT ----------
  if (parts[0] === 'node' && parts.length >= 4) {
    nodeId = parts[1];
    domain = parts[2];     // ctrl | cam
    action = parts[3];
  }

  // ---------- LEGACY FORMAT ----------
  else if (parts[0] === 'node' && parts.length === 3) {
    nodeId = parts[1];
    domain = 'legacy';
    action = parts[2];
  }

  // ---------- LEGACY CAM ----------
  else if (parts[0] === 'node_cam') {
    nodeId = parts[1];
    domain = 'cam';
    action = 'video_url';
  }

  const updateData = { nodeId };
  const eventType = `${domain}_${action}`;

  // ================= CTRL =================
  if (domain === 'ctrl' || domain === 'legacy') {
    switch (action) {
      case 'status':
        updateData.ctrlStatus = payload;
        break;

      case 'state':
      case 'parking_state':
        updateData.parkingState = payload;
        break;

      case 'violation':
      case 'alerts': {
        // ESP32 publishes violation via MQTT - log to database
        console.log(`🚨 VIOLATION received for ${nodeId} via MQTT`);
        try {
          const session = await getActiveParkingSession(nodeId) || await createParkingSession(nodeId);
          console.log(`📝 Logging violation to database (session: ${session.id})`);
          await logViolation(
            nodeId,
            'parking_violation',
            'Vehicle exceeded allowed parking time',
            { sessionId: session.id }
          );
          console.log(`✅ Violation logged successfully`);
        } catch (e) {
          console.error('❌ Failed to log violation (MQTT backup):', e.message || e);
        }

        try {
          const session = await getActiveParkingSession(nodeId) || await createParkingSession(nodeId);
          await updateParkingState(nodeId, 'VIOLATION', session.id);

          if (socketService) {
            socketService.emit('violation_detected', {
              nodeId,
              state: 'VIOLATION',
              timestamp: new Date(),
              message: '🚨 Violation: Car Not Moved!',
              showRelayButton: true
            });

            socketService.emit('parking_state_change', {
              nodeId,
              state: 'VIOLATION',
              timestamp: new Date(),
              message: '🚨 VIOLATION'
            });
          }

          // Ensure buzzer stays on
          try {
            await publishMqtt(`node/${nodeId}/cmd/buzzer`, 'on');
          } catch (e) {
            console.error('❌ Failed to publish buzzer on:', e.message || e);
          }
        } catch (e) {
          console.error('❌ Failed to handle MQTT violation:', e.message || e);
        }
        break;
      }
    }
  }

  // ================= CAM =================
  if (domain === 'cam') {
    switch (action) {
      case 'status':
        updateData.camStatus = payload;
        break;

      case 'video_url':
        // ALWAYS TRUST ESP32-CAM URL
        updateData.lastVideoUrl = payload;
        console.log(`📹 Camera URL updated for ${nodeId}: ${payload}`);
        break;

      case 'ml_result':
        try {
          const result = JSON.parse(payload);
          updateData.lastMlLabel = result.label;
          updateData.lastMlConfidence = result.confidence;

          // If camera confirms a car with sufficient confidence, promote to VEHICLE_DETECTED
          // Threshold: 0.65 (balance between accuracy and false positives)
          if ((result.label === 'car' || result.label === 'vehicle') && parseFloat(result.confidence) >= 0.65) {
            // Ensure active session
            let session = await getActiveParkingSession(nodeId);
            if (!session) session = await createParkingSession(nodeId);

            // Update DB state
            await updateParkingState(nodeId, 'VEHICLE_DETECTED', session.id);
            await updateSessionTimestamp(session.id, 'vehicle_detection_time');

            // Publish timer to node to start violation countdown (30s)
            try {
              await publishMqtt(`node/${nodeId}/cmd/violation_timer`, '30');
            } catch (e) {
              console.error('❌ Failed to publish violation_timer:', e.message || e);
            }

            // Request violation photo capture ONLY ONCE per session
            const lastCapturedSession = photoCapturedForSession.get(nodeId);
            if (lastCapturedSession !== session.id) {
              console.log(`📸 Requesting violation photo from ${nodeId}...`);
              try {
                await publishMqtt(`node/${nodeId}/cam/cmd/capture_violation`, '1');
                photoCapturedForSession.set(nodeId, session.id); // Mark as captured
              } catch (e) {
                console.error('❌ Failed to request violation photo:', e.message || e);
              }
            } else {
              console.log(`📸 Photo already captured for session ${session.id}, skipping`);
            }

            // Broadcast to front-end via Socket.IO
            if (socketService) {
              socketService.emit('parking_state_change', {
                nodeId,
                state: 'VEHICLE_DETECTED',
                timestamp: new Date(),
                confidence: result.confidence,
                message: '🚗 Vehicle Detected - Timer Running',
                timerDuration: 30
              });
            }
          } else {
            // Not a car - reset to IDLE
            console.log('❌ Not a car detected - resetting to IDLE');
            
            // Reset session
            let session = await getActiveParkingSession(nodeId);
            if (session) {
              await updateParkingState(nodeId, 'IDLE', session.id);
            }
            
            // Clear photo capture flag for this node
            photoCapturedForSession.delete(nodeId);
            
            // Notify frontend
            if (socketService) {
              socketService.emit('parking_state_change', {
                nodeId,
                state: 'IDLE',
                timestamp: new Date(),
                message: '✅ Not a vehicle - System Reset'
              });
            }
            
            // Tell ESP32-MAIN to reset
            try {
              await publishMqtt(`node/${nodeId}/cmd/reset`, '1');
            } catch (e) {
              console.error('❌ Failed to publish reset command:', e.message || e);
            }
          }
        } catch (e) {
          console.error('❌ Failed to parse ml_result:', e.message || e);
        }
        break;

      case 'violation_photo':
        // Handle photo chunks or complete message
        const photoAction = parts[4]; // chunk or complete
        
        if (photoAction === 'chunk') {
          const chunkNum = parseInt(parts[5] || '0');
          
          if (!photoChunks.has(nodeId)) {
            photoChunks.set(nodeId, { chunks: [], expectedChunks: 0, size: 0 });
          }
          
          const state = photoChunks.get(nodeId);
          state.chunks[chunkNum] = payload;
          console.log(`📥 Received photo chunk ${chunkNum} from ${nodeId}`);
        }
        
        if (photoAction === 'complete') {
          try {
            const metadata = JSON.parse(payload);
            const state = photoChunks.get(nodeId);
            
            if (state && state.chunks.length > 0) {
              // Reassemble Base64 string
              const base64Data = state.chunks.join('');
              
              // Decode from Base64 to binary
              const imageBuffer = Buffer.from(base64Data, 'base64');
              
              // Save to filesystem
              const timestamp = Date.now();
              const filename = `${nodeId}_${timestamp}.jpg`;
              const filepath = path.join(VIOLATIONS_DIR, filename);
              
              fs.writeFileSync(filepath, imageBuffer);
              console.log(`✅ Saved violation photo: ${filename} (${imageBuffer.length} bytes)`);
              
              // Update database with photo path
              const session = await getActiveParkingSession(nodeId);
              if (session) {
                await logViolation(nodeId, 'parking_violation', 'Vehicle exceeded allowed parking time', {
                  photoPath: `/violations/${filename}`,
                  photoSize: imageBuffer.length,
                  mlConfidence: updateData.lastMlConfidence,
                  sessionId: session.id
                });
              }
              
              // Notify frontend with photo URL
              if (socketService) {
                socketService.emit('violation_photo_captured', {
                  nodeId,
                  photoUrl: `/violations/${filename}`,
                  timestamp: new Date()
                });
              }
              
              // Clean up
              photoChunks.delete(nodeId);
            }
          } catch (e) {
            console.error('❌ Failed to process violation photo:', e.message || e);
            photoChunks.delete(nodeId);
          }
        }
        break;
    }
  }

  const node = await upsertNode(updateData);
  const event = await insertEvent({
    nodeId,
    topic,
    payload,
    eventType
  });

  if (socketService) {
    socketService.emit('mqtt_event', {
      nodeId,
      domain,
      action,
      payload,
      node,
      createdAt: event.created_at
    });
  }
}

export function publishMqtt(topic, message) {
  if (!mqttClient || !mqttClient.connected) {
    throw new Error('MQTT not connected');
  }

  return new Promise((resolve, reject) => {
    mqttClient.publish(topic, message, err => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Clear photo capture flag for a node (called when violation is resolved)
export function clearPhotoCaptureFlag(nodeId) {
  photoCapturedForSession.delete(nodeId);
  console.log(`🧹 Cleared photo capture flag for ${nodeId}`);
}
