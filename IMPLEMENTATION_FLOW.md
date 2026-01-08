# IoT Parking Monitor - Complete Flow Implementation

## 🎯 Overview
This document describes the complete parking violation detection flow that has been implemented.

## 📋 Detection Flow

### 1. **IDLE State** (Green LED ON)
- **State:** System is ready and monitoring
- **LED:** Green LED is ON
- **Dashboard:** Green background
- **Display:** "✅ Idle - Ready for Detection"

### 2. **SOMETHING_DETECTED State** (Green LED stays ON)
- **Trigger:** Ultrasonic sensor detects object within 50cm
- **LED:** Green LED remains ON
- **Dashboard:** Green background continues
- **Display:** "🔔 Something Detected"
- **Actions:**
  - ESP32-MAIN publishes to backend via HTTP
  - ESP32-MAIN requests ESP32-CAM to start stream
  - ESP32-MAIN publishes `object_present` to trigger ML inference

### 3. **ML Inference on ESP32-CAM**
- **Process:** TinyML model analyzes camera frame
- **Model:** Illegal Parking Car Detection (Edge Impulse)
- **Output:** 
  - If car detected: Publishes `ml_result` with label="car" and confidence
  - If not a car: Publishes `ml_result` with label="not_car" and resets system

### 4. **VEHICLE_DETECTED State** (Green LED stays ON)
- **Trigger:** TinyML confirms it's a car (confidence >= 0.5)
- **LED:** Green LED remains ON
- **Dashboard:** Green background continues
- **Display:** "🚗 Vehicle Detected - Timer Running"
- **Timer:** 30 second countdown starts
- **Actions:**
  - Backend sends `violation_timer` command to ESP32-MAIN
  - ESP32-MAIN transitions to VEHICLE_DETECTED state
  - Frontend displays countdown timer

### 5. **VIOLATION State** (Red LED ON, Buzzer rings)
- **Trigger:** 30-second timer expires and vehicle still present
- **LED:** Red LED turns ON, Green LED OFF
- **Dashboard:** Red background
- **Buzzer:** Buzzer rings continuously
- **Display:** "🚨 Parking Violation Detected"
- **Actions:**
  - ESP32-MAIN triggers violation
  - Buzzer starts ringing
  - Backend logs violation
  - Frontend shows violation alert with controls

## 🎮 User Controls (Dashboard)

### During VIOLATION State:
1. **📹 Relay Video** - View live ESP32-CAM stream
2. **🔇 Silence Buzzer** - Turn off buzzer (violation remains)
3. **✓ Resolve Violation** - Clear violation and reset system

## 🔧 Technical Implementation

### ESP32-MAIN Changes
- **File:** `ESP32/ESP32-MAIN/ESP32-MAIN.ino`
- **Key Updates:**
  - Keep green LED on during SOMETHING_DETECTED and VEHICLE_DETECTED
  - Only turn red LED on during VIOLATION
  - Subscribe to `ml_result` topic from camera
  - Handle `violation_timer` command from backend
  - Trigger buzzer on violation

### ESP32-CAM Changes
- **File:** `ESP32/ESP32-CAM/ESP32-CAM-ino`
- **Key Updates:**
  - Always publish ML result (both car and not_car)
  - Publish to `node/{nodeId}/cam/ml_result` topic
  - Handle failure case by publishing not_car result

### Backend Changes
- **File:** `backend/src/services/mqttService.js`
- **Key Updates:**
  - Handle ML results from camera
  - If car detected: Update to VEHICLE_DETECTED and start 30s timer
  - If not car: Reset to IDLE state
  - Broadcast state changes to frontend via Socket.IO

### Frontend Changes
- **Files:** 
  - `frontend/src/App.tsx`
  - `frontend/src/components/ParkingStatusCard.tsx`
  - `frontend/src/components/ParkingStatusCard.css`
  - `frontend/src/services/api.ts`

- **Key Updates:**
  - Dashboard background changes: Green (normal) → Red (violation)
  - State displays: IDLE → SOMETHING_DETECTED → VEHICLE_DETECTED → VIOLATION
  - Countdown timer display during VEHICLE_DETECTED
  - Buzzer silence button
  - Violation resolve button
  - Video relay button with modal

## 🔄 State Machine Diagram

```
IDLE (Green LED)
  ↓ [Ultrasonic detects object < 50cm]
SOMETHING_DETECTED (Green LED)
  ↓ [Camera runs ML inference]
  ├─→ [Not a car] → IDLE (Green LED)
  └─→ [Car detected] ↓
VEHICLE_DETECTED (Green LED + 30s timer)
  ↓ [Timer expires]
VIOLATION (Red LED + Buzzer)
  ↓ [User resolves or vehicle leaves]
IDLE (Green LED)
```

## 📡 MQTT Topics

### ESP32-MAIN Subscribes:
- `node/{nodeId}/cmd/violation_timer` - Start countdown timer
- `node/{nodeId}/cmd/silence` - Silence buzzer
- `node/{nodeId}/cmd/reset` - Reset system

### ESP32-CAM Subscribes:
- `node/{nodeId}/cam/object_present` - Trigger ML inference
- `node/{nodeId}/cam/cmd/start_stream` - Enable video stream
- `node/{nodeId}/cam/cmd/stop_stream` - Disable video stream

### ESP32-CAM Publishes:
- `node/{nodeId}/cam/ml_result` - ML inference result (car/not_car + confidence)
- `node/{nodeId}/cam/status` - Camera status
- `node/{nodeId}/cam/video_url` - Camera stream URL

## 🎨 Visual Indicators

### LED States:
- **Green ON** → System ready, detecting, or vehicle detected (no violation yet)
- **Red ON** → VIOLATION state

### Dashboard Colors:
- **Light Green Background (#f0fdf4)** → Normal operation
- **Light Red Background (#fee2e2)** → Violation detected

### State Colors:
- **Green (#10b981)** → IDLE
- **Amber (#f59e0b)** → SOMETHING_DETECTED
- **Blue (#3b82f6)** → VEHICLE_DETECTED
- **Red (#ef4444)** → VIOLATION

## 🚀 Next Steps (Future Implementation)

1. **Live Video Relay**
   - Automatically start video streaming on violation
   - Display live feed on dashboard
   - Record violation video

2. **Advanced Controls**
   - Manual buzzer on/off toggle
   - Violation timer adjustment
   - Multiple camera support

3. **Notifications**
   - Email/SMS alerts on violation
   - Mobile app notifications
   - Webhook integrations

## 🔍 Testing Checklist

- [ ] Ultrasonic sensor detects object → Green LED stays on
- [ ] Dashboard shows "Something Detected"
- [ ] Camera runs ML inference
- [ ] If not a car → System resets to IDLE
- [ ] If car detected → Shows "Vehicle Detected" with timer
- [ ] Green LED stays on during timer countdown
- [ ] Timer expires → Red LED turns on, buzzer rings
- [ ] Dashboard turns red background
- [ ] Silence buzzer button works
- [ ] Resolve violation button works and resets system
- [ ] Video relay button shows live stream

## 📝 Configuration

### Timing Parameters (ESP32-MAIN.ino):
```cpp
const int DETECTION_DISTANCE = 50;     // cm
const int CLEAR_DISTANCE     = 100;    // cm
const int VIOLATION_TIMEOUT  = 30;     // seconds
const int SENSOR_INTERVAL    = 500;    // ms
const int BUZZER_FREQ        = 2000;   // Hz
```

### ML Threshold (ESP32-CAM-ino):
```cpp
bool isCar = carConfidence > 0.5;  // 50% confidence threshold
```

### Backend Timer (mqttService.js):
```javascript
await publishMqtt(`node/${nodeId}/cmd/violation_timer`, '30'); // 30 seconds
```

---
**Implementation Date:** January 2026  
**Status:** ✅ Complete and Ready for Testing
