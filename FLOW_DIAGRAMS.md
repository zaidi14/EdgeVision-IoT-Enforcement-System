# System Flow Diagram - IoT Parking Violation Detection

## 🔄 Complete Detection Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SYSTEM START                                 │
│                    ✅ IDLE STATE (Green LED ON)                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Ultrasonic Sensor
                                  │ Detects Object < 50cm
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   🔔 SOMETHING_DETECTED                              │
│                    (Green LED stays ON)                              │
│                                                                       │
│  ESP32-MAIN:                                                         │
│  ├─ Publish HTTP → Backend: sensor/detect                           │
│  ├─ Publish MQTT → ESP32-CAM: start_stream                          │
│  └─ Publish MQTT → ESP32-CAM: object_present                        │
│                                                                       │
│  Dashboard:                                                          │
│  └─ Shows "🔔 Something Detected" (Green background)                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Trigger ML
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│               📸 ESP32-CAM: ML INFERENCE                             │
│                                                                       │
│  1. Capture frame from camera                                        │
│  2. Run TinyML model (Edge Impulse)                                  │
│  3. Analyze: Is it a car?                                            │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                │                              │
                │                              │
        ❌ NOT A CAR                    ✅ IS A CAR
     (confidence < 0.5)             (confidence ≥ 0.5)
                │                              │
                │                              │
                ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────────────────┐
│    RESET TO IDLE         │    │   🚗 VEHICLE_DETECTED                │
│                          │    │   (Green LED stays ON)               │
│  ESP32-CAM:              │    │                                      │
│  └─ Publish ml_result    │    │  ESP32-CAM:                          │
│     label: "not_car"     │    │  └─ Publish ml_result:               │
│                          │    │     {label: "car", confidence: 0.XX} │
│  Backend:                │    │                                      │
│  └─ Send reset command   │    │  Backend:                            │
│                          │    │  ├─ Update state → VEHICLE_DETECTED  │
│  Dashboard:              │    │  ├─ Start 30s timer                  │
│  └─ Reset to IDLE        │    │  └─ Publish violation_timer: "30"   │
│     (Green background)   │    │                                      │
└──────────────────────────┘    │  ESP32-MAIN:                         │
                                │  └─ Receive timer command             │
                                │     Start countdown                   │
                                │                                      │
                                │  Dashboard:                          │
                                │  └─ Show "🚗 Vehicle Detected"       │
                                │     30s countdown timer              │
                                │     Green background                 │
                                └──────────────────────────────────────┘
                                              │
                                              │
                               ┌──────────────┴────────────────┐
                               │                               │
                        Timer Expires                  Vehicle Leaves
                        (30 seconds)                  (distance > 100cm)
                               │                               │
                               ▼                               ▼
                ┌──────────────────────────────┐    ┌──────────────────┐
                │   🚨 VIOLATION               │    │   Reset to IDLE  │
                │   (Red LED ON + Buzzer)      │    │   (Green LED ON) │
                │                              │    └──────────────────┘
                │  ESP32-MAIN:                 │
                │  ├─ Turn on Red LED          │
                │  ├─ Turn off Green LED       │
                │  ├─ Start buzzer ringing     │
                │  └─ Publish violation        │
                │                              │
                │  Backend:                    │
                │  └─ Log violation to DB      │
                │                              │
                │  Dashboard:                  │
                │  ├─ Red background           │
                │  ├─ Show "🚨 Violation"      │
                │  └─ Display action buttons:  │
                │     • 📹 Relay Video         │
                │     • 🔇 Silence Buzzer      │
                │     • ✓ Resolve Violation    │
                └──────────────────────────────┘
                               │
                               │ User Action
                               │ or Vehicle Leaves
                               ▼
                ┌──────────────────────────────┐
                │   Resolve & Reset            │
                │                              │
                │  1. Stop buzzer              │
                │  2. Turn off Red LED         │
                │  3. Turn on Green LED        │
                │  4. Clear violation          │
                │  5. Reset to IDLE state      │
                │  6. Green dashboard          │
                └──────────────────────────────┘
                               │
                               └──────► Back to IDLE
```

## 🎨 LED State Diagram

```
        ┌──────────────┐
        │     IDLE     │
        │  Green: ON   │
        │   Red: OFF   │
        └──────┬───────┘
               │
               │ Object detected
               ▼
        ┌──────────────┐
        │   SOMETHING  │
        │   DETECTED   │
        │  Green: ON   │◄─── Keep green
        │   Red: OFF   │
        └──────┬───────┘
               │
               │ Car confirmed
               ▼
        ┌──────────────┐
        │   VEHICLE    │
        │   DETECTED   │
        │  Green: ON   │◄─── Still green
        │   Red: OFF   │
        └──────┬───────┘
               │
               │ Timer expires
               ▼
        ┌──────────────┐
        │  VIOLATION   │
        │  Green: OFF  │◄─── NOW RED!
        │   Red: ON    │
        │ Buzzer: ON   │
        └──────────────┘
```

## 📊 Data Flow Diagram

```
┌─────────────┐         ┌─────────────┐         ┌──────────────┐
│             │  HTTP   │             │  MQTT   │              │
│  ESP32-MAIN ├────────►│   Backend   ├────────►│  Frontend    │
│             │         │             │ Socket  │  Dashboard   │
│             │◄────────┤             │  .IO    │              │
│             │  MQTT   │             │◄────────┤              │
└─────┬───────┘         └──────┬──────┘         └──────────────┘
      │                        │
      │ MQTT                   │ MQTT
      │                        │
      ▼                        ▼
┌─────────────┐         ┌──────────────┐
│             │         │              │
│  ESP32-CAM  │         │ MQTT Broker  │
│             │         │ (Mosquitto)  │
│             │         │              │
└─────────────┘         └──────────────┘

Messages:
─────────►  Request/Command
◄─────────  Response/Data
```

## 🔔 MQTT Topic Flow

```
ESP32-MAIN → node/parking_zone_c1/ctrl/status → Backend
ESP32-MAIN ← node/parking_zone_c1/cmd/violation_timer ← Backend
ESP32-MAIN ← node/parking_zone_c1/cmd/silence ← Backend
ESP32-MAIN ← node/parking_zone_c1/cmd/reset ← Backend

ESP32-CAM ← node/parking_zone_c1/cam/object_present ← ESP32-MAIN
ESP32-CAM ← node/parking_zone_c1/cam/cmd/start_stream ← ESP32-MAIN
ESP32-CAM → node/parking_zone_c1/cam/ml_result → Backend
ESP32-CAM → node/parking_zone_c1/cam/video_url → Backend
```

## ⏱️ Timeline Example

```
t=0s   │ Object detected by ultrasonic
       │ └─► Dashboard: "Something Detected" (Green)
       │
t=1s   │ Camera captures frame
       │ ML inference runs
       │ └─► Result: CAR (confidence: 0.87)
       │
t=2s   │ State changes to VEHICLE_DETECTED
       │ └─► Dashboard: "Vehicle Detected" + Timer starts (Green)
       │     Shows: 30s... 29s... 28s...
       │
t=15s  │ Timer counting down...
       │ └─► Dashboard: Still showing timer (Green)
       │
t=32s  │ Timer expires! (30 seconds elapsed)
       │ └─► VIOLATION TRIGGERED
       │     • Red LED turns ON
       │     • Buzzer starts ringing
       │     • Dashboard turns RED
       │     • Shows violation alert
       │
t=35s  │ User clicks "Silence Buzzer"
       │ └─► Buzzer stops (violation remains, still red)
       │
t=40s  │ User clicks "Resolve Violation"
       │ └─► System resets to IDLE
       │     • Green LED turns ON
       │     • Dashboard turns GREEN
       │     • Ready for next detection
```

## 🎮 User Interaction Flow

```
         Dashboard View
┌────────────────────────────────┐
│  🚗 IoT Parking Monitor        │
│                                │
│  ┌──────────────────────────┐ │
│  │  Node: parking_zone_c1   │ │
│  │                          │ │
│  │  Status: [Green Badge]   │ │◄── Normal: Green
│  │  🔔 Something Detected   │ │    Violation: Red
│  │                          │ │
│  │  [No actions available]  │ │
│  └──────────────────────────┘ │
└────────────────────────────────┘
                │
                │ Vehicle detected
                ▼
┌────────────────────────────────┐
│  ┌──────────────────────────┐ │
│  │  Status: [Blue Badge]    │ │
│  │  🚗 Vehicle Detected     │ │
│  │                          │ │
│  │  ⏲️ Timer: 25s          │ │
│  │  Confidence: 87.3%       │ │
│  │                          │ │
│  │  [Countdown display]     │ │
│  └──────────────────────────┘ │
└────────────────────────────────┘
                │
                │ Timer expires
                ▼
┌────────────────────────────────┐
│  ┌──────────────────────────┐ │
│  │  Status: [Red Badge]     │ │◄── Dashboard
│  │  🚨 VIOLATION            │ │    turns RED!
│  │                          │ │
│  │  ⚠️ Parking Violation    │ │
│  │  Vehicle has not moved   │ │
│  │                          │ │
│  │  [📹 Relay Video]        │ │
│  │  [🔇 Silence Buzzer]     │ │◄── User can
│  │  [✓ Resolve Violation]   │ │    interact
│  └──────────────────────────┘ │
└────────────────────────────────┘
```

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Physical Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Ultrasonic   │  │   ESP32-CAM  │  │   LEDs &     │  │
│  │   Sensor     │  │  + ML Model  │  │   Buzzer     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                   Hardware Layer                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │              ESP32-MAIN Controller                │  │
│  │  • State Machine                                  │  │
│  │  • Sensor Reading                                 │  │
│  │  • LED/Buzzer Control                             │  │
│  │  • MQTT Communication                             │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                   Network Layer                          │
│  ┌────────────┐  ┌────────────┐  ┌─────────────┐      │
│  │   WiFi     │  │    MQTT    │  │    HTTP     │      │
│  │ Connection │  │   Broker   │  │     API     │      │
│  └────────────┘  └────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                   Backend Layer                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Node.js + Express Server                │  │
│  │  • MQTT Service (event handling)                  │  │
│  │  • REST API (HTTP endpoints)                      │  │
│  │  • Socket.IO (real-time updates)                  │  │
│  │  • SQLite Database (logging)                      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                  Frontend Layer                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         React + TypeScript Dashboard              │  │
│  │  • Real-time state display                        │  │
│  │  • Timer countdown                                │  │
│  │  • Video streaming modal                          │  │
│  │  • Control buttons                                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
                    👤 End User
```

---
**Visual Reference for System Flow**  
**Status:** ✅ Complete System Architecture
