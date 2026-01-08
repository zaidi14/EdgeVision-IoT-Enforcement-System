# System Architecture & Design Diagrams

## 1. Full System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              SMART CITY DEPLOYMENT                             │
└────────────────────────────────────────────────────────────────────────────────┘

                               ┌──────────────────────┐
                               │   City Data Center   │
                               │  (Cloud / On-prem)   │
                               ├──────────────────────┤
                               │  Backend Server      │
                               │  • Node.js/Express   │
                               │  • MQTT Broker       │
                               │  • PostgreSQL DB     │
                               │  • Socket.IO events  │
                               └──────────┬───────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
             MQTT (Pub/Sub)          HTTP REST            WebSocket
                    │                     │                     │
        ┌───────────┴──────┬──────────────┴──────────┬──────────┴────────┐
        │                  │                         │                   │
   ┌────▼──────┐    ┌─────▼─────┐            ┌─────▼──────┐      ┌─────▼──────┐
   │   Zone A   │    │   Zone B   │            │   Zone C   │      │ Dashboard  │
   │ (deployed) │    │(deployed) │            │(deployed)  │      │  Frontend  │
   │            │    │            │            │            │      │   React    │
   │┌──────────┐│    │┌──────────┐│            │┌──────────┐│      │ TypeScript │
   ││ESP32-MAIN││    ││ESP32-MAIN││            ││ESP32-MAIN││      │            │
   │└──────────┘│    │└──────────┘│            │└──────────┘│      │            │
   │   HC-SR04  │    │  HC-SR04   │            │  HC-SR04   │      │  Features: │
   │  LEDs      │    │  LEDs      │            │  LEDs      │      │ • Real-time│
   │  Buzzer    │    │  Buzzer    │            │  Buzzer    │      │   states   │
   │            │    │            │            │            │      │ • Video    │
   │┌──────────┐│    │┌──────────┐│            │┌──────────┐│      │   relay    │
   ││ESP32-CAM ││    ││ESP32-CAM ││            ││ESP32-CAM ││      │ • Controls │
   │└──────────┘│    │└──────────┘│            │└──────────┘│      │ • Timers   │
   │  Camera    │    │  Camera    │            │  Camera    │      │            │
   │  TinyML    │    │  TinyML    │            │  TinyML    │      │ * Multi-   │
   │  MJPEG     │    │  MJPEG     │            │  MJPEG     │      │   zone     │
   │            │    │            │            │            │      │   grid     │
   └────────────┘    └────────────┘            └────────────┘      └────────────┘

   Parking Zone 1    Parking Zone 2         Parking Zone 3        City Control

                          ↓
                (Real-time MQTT data flow)
                          ↓
                    Violation Alerts
                   Multi-zone Stats
                  Operator Dashboard
```

---

## 2. State Machine Diagram

```
                          ╔═══════════════════════════╗
                          ║   PARKING ZONE STATES    ║
                          ╚═══════════════════════════╝

                              ┌──────────────┐
                              │     IDLE     │
                              │              │
                              │ Green LED:   │
                              │   OFF/READY  │
                              └──────┬───────┘
                                     │
                                     │ (Ultrasonic detects object 10-100cm)
                                     │
                                     ▼
                              ┌──────────────┐
                              │   SOMETHING  │
                              │   DETECTED   │
                              │              │
                              │ Green LED:   │
                              │   ON         │
                              │ Action:      │
                              │ • Request ML │
                              │ • Start 5s   │
                              │   timeout    │
                              └──────┬───────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
         (ML confirms)         (ML rejects)          (timeout)
         (conf >= 0.5)         (conf < 0.5)          (5 seconds)
                │                    │                    │
                ▼                    ▼                    ▼
         ┌──────────────┐      ┌──────────┐        ┌──────────┐
         │   VEHICLE    │      │   IDLE   │        │   IDLE   │
         │   DETECTED   │      │ (reset)  │        │ (reset)  │
         │              │      └──────────┘        └──────────┘
         │ Green LED:   │
         │   ON         │
         │ Action:      │
         │ • Start 30s  │
         │   countdown  │
         │ • Publish    │
         │   timer cmd  │
         └──────┬───────┘
                │
           (30 seconds pass)
                │
                ▼
         ┌──────────────┐
         │  VIOLATION   │
         │              │
         │ Red LED: ON  │
         │ Buzzer: ON   │
         │ Action:      │
         │ • Alert BE   │
         │ • Notify     │
         │   dashboard  │
         │ • Log event  │
         └──────┬───────┘
                │
         ┌──────┴──────┐
         │             │
   (operator       (auto reset
    resolves)       or timeout)
         │             │
         ▼             ▼
    ┌──────────────────┐
    │      IDLE        │
    │ (reset complete) │
    │ Green LED: OFF   │
    └──────────────────┘
```

---

## 3. Data Flow: Detection → Violation → Resolution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPLETE DETECTION WORKFLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

TIME    COMPONENT           ACTION                      MQTT TOPIC / HTTP
────────────────────────────────────────────────────────────────────────────
 T0    HC-SR04 Sensor      Detect object at 50cm
       ↓
 T0+50ms    ESP32-MAIN     Transition to SOMETHING_DETECTED
                            Set Green LED ON
                            Publish ML request
                            ────────────────────→ node/zone_c1/cam/object_present
       ↓
 T0+100ms   ESP32-CAM      Receive ML request
                            Capture JPEG frame
       ↓
 T0+250ms   ESP32-CAM      Run TinyML inference
                            Car detected (conf=0.87)
                            Publish result
                            ────────────────────→ node/zone_c1/cam/ml_result
                                                   {"label":"car","confidence":0.87}
       ↓
 T0+300ms   Backend         Receive ML result
            (Node.js)       Parse & validate (conf >= 0.5)
                            Update session: VEHICLE_DETECTED
                            Start 30-second countdown timer
                            Publish timer command
                            ────────────────────→ node/zone_c1/cmd/violation_timer
                                                   "30"
                            Emit WebSocket event
                            ─────────────────────┐
                                                 ▼
 T0+350ms   Dashboard       Receive WebSocket event
            (React)         Update card: state=VEHICLE_DETECTED
                            Start countdown: 30s, 29s, 28s...
                            Re-render with timer
       ↓
 T0+10s     [Operator watches dashboard, decides to relay video]
       ↓
 T0+11s     Dashboard      User clicks "Relay Video"
                           Fetch camera URL from node data
                           ───────────────→ GET /api/nodes/zone_c1
       ↓
 T0+12s     Backend        Return camera URL
                           ←────────────────────
                           "http://192.168.1.118/stream"
       ↓
 T0+13s     Dashboard      Open video modal
                           Load MJPEG stream from camera
                           Display live frames (15-20 fps)
       ↓
 T0+30s     Backend        [Timer expired]
                           Escalate to VIOLATION state
                           Update session: VIOLATION
                           Publish buzzer ON command
                           ────────────────────→ node/zone_c1/cmd/buzzer
                                                 "on"
                           Emit violation alert event
                           ─────────────────────┐
                                                 ▼
 T0+30s     ESP32-MAIN     Receive buzzer ON
                           Set Red LED ON
                           Activate Buzzer (PWM on GPIO 25)
       ↓
 T0+30s     Dashboard      Receive violation event
                           Update card: state=VIOLATION
                           Color status pill RED
                           Show violation section with buttons
                           Flash "Resolve Violation" button
       ↓
 T0+35s     [Operator reviews video, decides to silence]
       ↓
 T0+36s     Dashboard      User clicks "Silence Buzzer"
                           ───────────────→ POST /nodes/zone_c1/silence
       ↓
 T0+37s     Backend        Receive silence request
                           Publish buzzer OFF
                           ────────────────────→ node/zone_c1/cmd/buzzer
                                                 "off"
       ↓
 T0+37s     ESP32-MAIN     Receive buzzer OFF
                           Deactivate Buzzer
       ↓
 T0+38s     Dashboard      Buzzer stops
       ↓
 T0+45s     [Operator resolves violation after video review]
       ↓
 T0+46s     Dashboard      User clicks "Resolve Violation"
                           ───────────────→ POST /nodes/zone_c1/violation/resolve
       ↓
 T0+47s     Backend        Receive resolve request
                           Update session: IDLE
                           Publish reset command
                           ────────────────────→ node/zone_c1/cmd/reset
                           Log violation to database
                           Emit state change event
                           ─────────────────────┐
                                                 ▼
 T0+47s     ESP32-MAIN     Receive reset command
                           Transition to IDLE state
                           Set Red LED OFF
                           Buzzer OFF
                           Cancel countdown timer
       ↓
 T0+48s     Dashboard      Receive state change event
                           Update card: state=IDLE
                           Clear timer
                           Hide violation section
                           Color status pill GREEN
       ↓
 T0+50s     ✓ COMPLETE     System ready for next detection
            Zone returns to monitoring state
```

---

## 4. MQTT Topic Hierarchy

```
node/
├── parking_zone_c1/
│   ├── ctrl/
│   │   └── status                    "online" / "offline"
│   │
│   ├── cam/
│   │   ├── status                    "online" / "offline"
│   │   ├── video_url                 "http://192.168.1.118/stream"
│   │   ├── ml_result                 {"label":"car|not_car","confidence":0.XX}
│   │   ├── object_present            (request to run ML)
│   │   └── cmd/
│   │       ├── start_stream          (enable MJPEG)
│   │       ├── stop_stream           (disable MJPEG)
│   │       ├── quality_high          (VGA, quality=10)
│   │       └── quality_low           (QQVGA, quality=20)
│   │
│   └── cmd/
│       ├── violation_timer           "30" (seconds)
│       ├── buzzer                    "on" / "off"
│       ├── silence                   (mute buzzer)
│       └── reset                     (return to IDLE)
│
├── parking_zone_c2/
│   ├── ctrl/...
│   ├── cam/...
│   └── cmd/...
│
└── parking_zone_c3/
    ├── ctrl/...
    ├── cam/...
    └── cmd/...
```

---

## 5. Backend Event Flow (Socket.IO)

```
                    Backend Event Bus (Socket.IO)
                            ↓
        ┌───────────────────────────────────────┐
        │      Events Emitted to Dashboard      │
        └───────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ mqtt_event                                                  │
│ (raw MQTT message from any node)                            │
├─────────────────────────────────────────────────────────────┤
│ Payload:                                                    │
│ {                                                           │
│   "nodeId": "parking_zone_c1",                              │
│   "topic": "node/parking_zone_c1/cam/video_url",            │
│   "message": "http://192.168.1.118/stream"                  │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ parking_state_change                                        │
│ (node state transition)                                     │
├─────────────────────────────────────────────────────────────┤
│ Payload:                                                    │
│ {                                                           │
│   "nodeId": "parking_zone_c1",                              │
│   "state": "IDLE" | "SOMETHING_DETECTED" | ...              │
│   "timestamp": 1704891234567                                │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ vehicle_detected                                            │
│ (ML confirmed vehicle, countdown started)                   │
├─────────────────────────────────────────────────────────────┤
│ Payload:                                                    │
│ {                                                           │
│   "nodeId": "parking_zone_c1",                              │
│   "confidence": 0.87,                                       │
│   "countdown": 30                                           │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ violation_detected                                          │
│ (timer expired, violation escalated)                        │
├─────────────────────────────────────────────────────────────┤
│ Payload:                                                    │
│ {                                                           │
│   "nodeId": "parking_zone_c1",                              │
│   "state": "VIOLATION",                                     │
│   "timestamp": 1704891264567                                │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘

                        ↓ Dashboard Receives ↓
                            
        ┌────────────────────────────────────┐
        │   Update Local React State         │
        │   Re-render ParkingStatusCard      │
        │   Update colors, timers, buttons   │
        │   Show/hide video modal            │
        └────────────────────────────────────┘
```

---

## 6. HTTP API Endpoints (Backend → Frontend)

```
BASE_URL: http://localhost:5000/api

├── GET /nodes
│   → Fetch all parking zones
│   ← [{nodeId, state, lastMlLabel, lastMlConfidence, ...}, ...]
│
├── GET /nodes/{nodeId}
│   → Fetch single zone details
│   ← {nodeId, state, cameraUrl, lastUpdate, violations, ...}
│
├── POST /nodes/{nodeId}/sensor/detect
│   → Simulate sensor detection (for testing)
│   ← {success: true, state: "SOMETHING_DETECTED"}
│
├── POST /nodes/{nodeId}/vehicle/detect
│   → Manually trigger vehicle detection
│   ← {success: true, state: "VEHICLE_DETECTED", countdown: 30}
│
├── POST /nodes/{nodeId}/violation/report
│   → Report violation (backend use)
│   ← {success: true, state: "VIOLATION"}
│
├── POST /nodes/{nodeId}/violation/resolve
│   → Resolve violation (operator action)
│   ← {success: true, state: "IDLE"}
│
├── POST /nodes/{nodeId}/silence
│   → Silence buzzer alert
│   ← {success: true}
│
├── POST /nodes/{nodeId}/reset
│   → Reset zone to IDLE (full reset)
│   ← {success: true, state: "IDLE"}
│
├── POST /nodes/{nodeId}/camera/start_stream
│   → Start video streaming
│   ← {success: true, cameraUrl: "http://..."}
│
└── POST /nodes/{nodeId}/camera/stop_stream
    → Stop video streaming
    ← {success: true}
```

---

## 7. Frontend Component Tree

```
App.tsx
├── App Header
│   ├── Logo / Title
│   ├── Status chip (showing any active violations)
│   └── Refresh button
│
├── Grid Layout (responsive)
│   │
│   ├── ParkingStatusCard (Zone C1)
│   │   ├── Card Header
│   │   │   ├── Icon + Title ("Zone C1")
│   │   │   └── Status Pill (color-coded by state)
│   │   │
│   │   ├── Card Body
│   │   │   ├── Status Message
│   │   │   ├── Timer Section (if VEHICLE_DETECTED)
│   │   │   ├── Confidence Progress Bar (if ML result)
│   │   │   └── Violation Section (if VIOLATION state)
│   │   │       ├── Violation Alert
│   │   │       ├── Silence Buzzer button
│   │   │       ├── Relay Video button
│   │   │       └── Resolve Violation button
│   │   │
│   │   └── Timestamp
│   │
│   ├── ParkingStatusCard (Zone C2)
│   │   └── [Same structure]
│   │
│   └── ParkingStatusCard (Zone C3)
│       └── [Same structure]
│
└── PhoneCameraStream Modal (if relay video active)
    ├── Header (close button)
    ├── MJPEG video stream
    └── Footer (loading indicator)
```

---

## 8. Database Schema (Simplified)

```sql
-- Nodes (parking zones)
CREATE TABLE nodes (
  id UUID PRIMARY KEY,
  node_id VARCHAR UNIQUE,          -- "parking_zone_c1"
  location_name VARCHAR,
  last_state VARCHAR,               -- "IDLE", "VIOLATION", ...
  last_ml_label VARCHAR,            -- "car", "not_car"
  last_ml_confidence FLOAT,
  last_video_url VARCHAR,
  updated_at TIMESTAMP
);

-- Sessions (tracking current violations)
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  node_id UUID REFERENCES nodes(id),
  state VARCHAR,                    -- current parking state
  violation_start TIMESTAMP,
  violation_end TIMESTAMP,
  resolved_by VARCHAR,              -- operator name
  resolved_at TIMESTAMP
);

-- Violation logs (historical records)
CREATE TABLE violations (
  id UUID PRIMARY KEY,
  node_id UUID REFERENCES nodes(id),
  detected_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  escalated_at TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by VARCHAR,
  duration_seconds INTEGER,
  ml_confidence FLOAT,
  notes TEXT
);

-- Events (audit trail)
CREATE TABLE events (
  id UUID PRIMARY KEY,
  node_id UUID REFERENCES nodes(id),
  event_type VARCHAR,              -- "detection", "confirmation", "violation", "resolution"
  payload JSONB,
  created_at TIMESTAMP
);
```

---

**Diagrams compiled:** January 2026
