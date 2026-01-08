import express from 'express';
import {
  getAllNodes,
  getNodeEvents,
  getAllEvents,
  getViolationLogs,
  deleteNode,
  upsertNode,
  logViolation,
  createParkingSession,
  updateParkingState,
  updateSessionTimestamp,
  getActiveParkingSession,
  closeParkingSession
} from '../config/database.js';
import { publishMqtt, clearPhotoCaptureFlag } from '../services/mqttService.js';

const router = express.Router();

let io = null;

export function setSocketIO(socketIO) {
  io = socketIO;
  console.log('✅ Socket.IO set in API routes');
}

// Get all nodes
router.get('/nodes', async (req, res) => {
  try {
    res.json(await getAllNodes());
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Get events for a node
router.get('/nodes/:nodeId/events', async (req, res) => {
  try {
    res.json(await getNodeEvents(req.params.nodeId, parseInt(req.query.limit) || 100));
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Get all events
router.get('/events', async (req, res) => {
  try {
    res.json(await getAllEvents(parseInt(req.query.limit) || 100));
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Get violation logs for a node
router.get('/nodes/:nodeId/violations', async (req, res) => {
  try {
    res.json(await getViolationLogs(req.params.nodeId, parseInt(req.query.limit) || 50));
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Get all violations across all nodes
router.get('/violations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const violations = await getViolationLogs(null, limit); // null = all nodes
    res.json(violations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch violations' });
  }
});

// Silence node buzzer
router.post('/nodes/:nodeId/silence', async (req, res) => {
  try {
    await publishMqtt(`node/${req.params.nodeId}/cmd/silence`, '1');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Reset node
router.post('/nodes/:nodeId/reset', async (req, res) => {
  try {
    await publishMqtt(`node/${req.params.nodeId}/cmd/reset`, '1');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Start video streaming (for ESP32-CAM)
router.post('/nodes/:nodeId/video/start', async (req, res) => {
  try {
    await publishMqtt(`node/${req.params.nodeId}/cam/cmd/start_stream`, '1');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Stop video streaming
router.post('/nodes/:nodeId/video/stop', async (req, res) => {
  try {
    await publishMqtt(`node/${req.params.nodeId}/cam/cmd/stop_stream`, '1');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Phone camera - Start streaming (notification)
router.post('/nodes/:nodeId/phone/start', async (req, res) => {
  try {
    const { nodeId } = req.params;
    console.log(`📱 Phone camera start requested for ${nodeId}`);
    
    // Emit to all clients that phone streaming has started
    if (io) {
      io.emit('phone_stream_start', { nodeId });
    }
    
    res.json({ success: true, message: 'Phone streaming started' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Phone camera - Stop streaming
router.post('/nodes/:nodeId/phone/stop', async (req, res) => {
  try {
    const { nodeId } = req.params;
    console.log(`📱 Phone camera stop requested for ${nodeId}`);
    
    // Clear the video URL
    await upsertNode({
      nodeId,
      lastVideoUrl: null
    });
    
    if (io) {
      io.emit('phone_stream_stop', { nodeId });
    }
    
    res.json({ success: true, message: 'Phone streaming stopped' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Phone camera - Update frame (live streaming)
router.post('/nodes/:nodeId/phone/frame', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { frame } = req.body;
    
    if (!frame) {
      return res.status(400).json({ error: 'Frame data required' });
    }
    
    // Update node with latest frame
    await upsertNode({
      nodeId,
      lastVideoUrl: frame
    });
    
    // Broadcast frame to all connected clients
    if (io) {
      io.emit('phone_frame', { nodeId, frame });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Frame upload error:', error);
    res.status(500).json({ error: 'Failed to upload frame' });
  }
});

// ===== NEW PARKING VIOLATION ENDPOINTS =====

// 1. Sensor Detection Event - triggers when sensor detects something
router.post('/nodes/:nodeId/sensor/detect', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { threshold } = req.body;
    
    console.log(`🔔 Sensor detection on ${nodeId}, threshold: ${threshold}`);
    
    // Get or create active session
    let session = await getActiveParkingSession(nodeId);
    if (!session) {
      session = await createParkingSession(nodeId);
    }
    
    // Update state to SOMETHING_DETECTED
    await updateParkingState(nodeId, 'SOMETHING_DETECTED', session.id);
    await updateSessionTimestamp(session.id, 'detection_time');
    
    // Update node status
    await upsertNode({
      nodeId,
      lastParkingState: 'SOMETHING_DETECTED'
    });
    
    // Broadcast to frontend
    if (io) {
      io.emit('parking_state_change', {
        nodeId,
        state: 'SOMETHING_DETECTED',
        timestamp: new Date(),
        message: '🔔 Something Detected'
      });
    }
    
    // Trigger camera start
    await publishMqtt(`node_cam/${nodeId}/cmd/start_video`, '1');
    await publishMqtt(`node/${nodeId}/cam/cmd/start_stream`, '1');
    
    res.json({ success: true, session });
  } catch (error) {
    console.error('Sensor detection error:', error);
    res.status(500).json({ error: 'Failed to process sensor detection' });
  }
});

// 2. Vehicle Detected Event - triggered after ML inference confirms it's a car
router.post('/nodes/:nodeId/vehicle/detect', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { confidence, frameData } = req.body;
    
    console.log(`🚗 Vehicle detected on ${nodeId}, confidence: ${confidence}`);
    
    let session = await getActiveParkingSession(nodeId);
    if (!session) {
      session = await createParkingSession(nodeId);
    }
    
    // Update state to VEHICLE_DETECTED
    await updateParkingState(nodeId, 'VEHICLE_DETECTED', session.id);
    await updateSessionTimestamp(session.id, 'vehicle_detection_time');
    
    // Update node
    await upsertNode({
      nodeId,
      lastParkingState: 'VEHICLE_DETECTED'
    });
    
    // Broadcast to frontend with timer info
    if (io) {
      io.emit('parking_state_change', {
        nodeId,
        state: 'VEHICLE_DETECTED',
        timestamp: new Date(),
        confidence,
        sessionId: session.id,
        message: '🚗 Vehicle Detected - Timer Running',
        timerDuration: 30 // 30 seconds before violation
      });
    }
    
    // Start violation timer on ESP32 (30 seconds)
    await publishMqtt(`node/${nodeId}/cmd/violation_timer`, '30');
    
    res.json({ success: true, session });
  } catch (error) {
    console.error('Vehicle detection error:', error);
    res.status(500).json({ error: 'Failed to process vehicle detection' });
  }
});

// 3. Violation Event - triggered when timer expires (car doesn't move)
router.post('/nodes/:nodeId/violation/report', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { videoUrl, details } = req.body;
    
    console.log(`⚠️ VIOLATION on ${nodeId}`);
    
    let session = await getActiveParkingSession(nodeId);
    if (!session) {
      session = await createParkingSession(nodeId);
    }
    
    // Update state to VIOLATION
    await updateParkingState(nodeId, 'VIOLATION', session.id);
    await updateSessionTimestamp(session.id, 'violation_time');
    
    // Log violation (upsert by session)
    const violation = await logViolation(nodeId, 'PARKING_VIOLATION', details, {
      videoUrl,
      sessionId: session.id
    });
    
    // Update node
    await upsertNode({
      nodeId,
      lastParkingState: 'VIOLATION',
      lastVideoUrl: videoUrl
    });
    
    // Broadcast violation to all clients
    if (io) {
      io.emit('violation_detected', {
        nodeId,
        state: 'VIOLATION',
        timestamp: new Date(),
        videoUrl,
        sessionId: session.id,
        message: '🚨 Violation: Car Not Moved!',
        showRelayButton: true
      });
      
      io.emit('parking_state_change', {
        nodeId,
        state: 'VIOLATION',
        timestamp: new Date(),
        message: '🚨 VIOLATION'
      });
    }
    
    // Trigger buzzer on ESP32
    await publishMqtt(`node/${nodeId}/cmd/buzzer`, 'on');
    
    // Stop camera
    await publishMqtt(`node_cam/${nodeId}/cmd/stop_video`, '1');
    
    res.json({ success: true, violation, session });
  } catch (error) {
    console.error('Violation reporting error:', error);
    res.status(500).json({ error: 'Failed to report violation' });
  }
});

// 4. Clear/Reset Violation - when user clicks resolve or car moves
router.post('/nodes/:nodeId/violation/resolve', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { violationId } = req.body;
    
    console.log(`✅ Resolving violation on ${nodeId}`);
    
    // Clear photo capture flag so next detection can capture fresh photo
    clearPhotoCaptureFlag(nodeId);
    
    // Reset to IDLE
    const session = await getActiveParkingSession(nodeId);
    if (session) {
      await closeParkingSession(session.id);
    }
    
    // Stop video stream (IMPORTANT: prevents flickering)
    await publishMqtt(`node/${nodeId}/cam/cmd/stop_stream`, '1');
    
    // Reset buzzer
    await publishMqtt(`node/${nodeId}/cmd/buzzer`, 'off');
    
    // Turn LED back on
    await publishMqtt(`node/${nodeId}/cmd/led`, 'on');
    
    // Update node
    await upsertNode({
      nodeId,
      lastParkingState: 'IDLE'
    });
    
    // Broadcast reset
    if (io) {
      io.emit('parking_state_change', {
        nodeId,
        state: 'IDLE',
        timestamp: new Date(),
        message: '✅ Idle - Ready for Detection'
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Violation resolution error:', error);
    res.status(500).json({ error: 'Failed to resolve violation' });
  }
});

// 5. Get current parking session info
router.get('/nodes/:nodeId/parking/session', async (req, res) => {
  try {
    const session = await getActiveParkingSession(req.params.nodeId);
    res.json(session || { state: 'IDLE' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// 6. Relay video request - relay video stream to dashboard
router.post('/nodes/:nodeId/video/relay', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { videoUrl } = req.body;
    
    console.log(`📹 Relaying video for ${nodeId}`);
    
    if (io) {
      io.emit('video_relay_start', {
        nodeId,
        videoUrl,
        message: 'Relaying Video Feed'
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to relay video' });
  }
});

export default router;
