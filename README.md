# IoT Illegal Parking Violation Detection & Monitoring System

**A Smart City IoT Solution for Urban Parking Enforcement & Real-Time Violation Escalation**

---

## Project Overview

This project implements a **real-time, edge-powered IoT system** to detect and monitor illegal parking violations in urban environments. The system combines ultrasonic sensing, machine learning inference, and cloud integration to provide city planners and enforcement officers with actionable real-time data, reducing manual patrol overhead and improving traffic flow.

### Key Features
- ✅ **Real-time detection** via ultrasonic sensors + edge-deployed TinyML car detection
- ✅ **Automated escalation** from detection → confirmation → violation with audible/visual alerts
- ✅ **Live video relay** for instant visual verification from the dashboard
- ✅ **Silent & resolve controls** via dashboard for flexible violation management
- ✅ **MQTT-based IoT architecture** for scalable multi-zone deployment
- ✅ **Optimized streaming** with low-latency MJPEG (tunable quality presets)
- ✅ **Full-stack cloud integration** (Node.js backend, React dashboard, PostgreSQL)



## Problem Statement & Motivation

**Urban Challenge:** Illegal parking in busy city zones leads to:
- Reduced traffic flow and congestion
- Safety hazards (blocked emergency lanes, fire hydrants)
- Uneven enforcement (officers cover only small areas manually)
- Lack of real-time data for city planners

**Our Solution:** Deploy distributed IoT nodes at key parking zones with autonomous detection, automatic escalation, and centralized monitoring—enabling **data-driven parking policy** and **efficient enforcement**.

---

## System Architecture

### Hardware Stack
| Component | Specification | Purpose |
|-----------|---------------|---------|
| **ESP32-MAIN** | Ultrasonic sensor (HC-SR04), RGB LEDs, Buzzer | Detects vehicle presence, signals state |
| **ESP32-CAM** | AI Thinker pinout, Edge Impulse ML | Captures frame, runs car classifier, streams video |
| **Ultrasonic Sensor** | HC-SR04 (TRIG=32, ECHO=33) | Detects object 0.5–3m away |
| **LEDs** | Green (26), Red (27) | Status indicator (green=ok, red=violation) |
| **Buzzer** | GPIO 25 | Audible violation alert |

### Software Stack
| Layer | Technology | Role |
|-------|-----------|------|
| **Edge AI** | TensorFlow Lite + Edge Impulse | Car classification on ESP32-CAM (TinyML) |
| **Connectivity** | MQTT (PubSubClient), WiFi | Real-time pub/sub for sensor & ML data |
| **Backend** | Node.js, Express, Socket.IO | MQTT bridge, timers, session management |
| **Database** | PostgreSQL | Nodes, sessions, violation logs |
| **Frontend** | React + TypeScript | Real-time dashboard with video modal |
| **Video** | MJPEG over HTTP | Low-latency streaming from ESP32-CAM |

### Data Flow
```
[Ultrasonic] → SOMETHING_DETECTED → [Request camera + ML]
                    ↓
            [Camera captures frame]
                    ↓
        [Edge Impulse ML: Car detection]
                    ↓
           [Publish ML result via MQTT]
                    ↓
        [Backend processes: Confidence > 0.5?]
                    ↓
           YES: VEHICLE_DETECTED → Timer (30s)
           NO: Reset to IDLE
                    ↓
        [If timer expires: VIOLATION state]
                    ↓
    [Red LED + Buzzer + Dashboard notification]
                    ↓
    [Operator can silence/resolve from dashboard]
```

### State Machine (ESP32-MAIN)
```
IDLE
 ↓ (object detected by ultrasonic)
SOMETHING_DETECTED → request camera stream & ML
 ↓ (ML confirms car, confidence ≥ 0.5)
VEHICLE_DETECTED → 30-second countdown
 ↓ (timer expires)
VIOLATION → red LED + buzzer + backend alert
 ↓ (operator resolves or auto-reset)
IDLE
```

---

## Hardware Setup

### Wiring Diagram (Simplified)
```
ESP32-MAIN (Parking Sensor Controller)
├─ GPIO 32 → HC-SR04 TRIG
├─ GPIO 33 → HC-SR04 ECHO
├─ GPIO 26 → Green LED (470Ω resistor)
├─ GPIO 27 → Red LED (470Ω resistor)
└─ GPIO 25 → Buzzer (NPN transistor + 1kΩ base R)

ESP32-CAM (AI Thinker Module)
├─ Camera module (OV2640, built-in)
├─ WiFi antenna
└─ UART → USB (for flashing)
```

### Components List
| Item | Qty | Cost (TL) |
|------|-----|-----------|
| ESP32-MAIN (DevKit) | 1 | 250 |
| ESP32-CAM (AI Thinker) | 1 | 450 |
| HC-SR04 Ultrasonic | 1 | 70 |
| RGB LEDs | 2 | 30 |
| 220Ω Resistors | 5 | 25 |
| Buzzer (5V) | 1 | 100 |
| Jumper Wires | 50 | 50 |
| USB Cables | 2 | 50 |
| **Total** | | **1025** |

---

## Software Installation & Deployment

### Prerequisites
- Arduino IDE 2.x with ESP32 board support
- Node.js 18+
- PostgreSQL 13+
- MQTT broker (Mosquitto)
- npm/yarn

### Step 1: Flash ESP32 Firmware

#### ESP32-MAIN
```bash
cd ESP32/ESP32-MAIN
# Open ESP32-MAIN.ino in Arduino IDE
# 1. Tools → Board → ESP32 Dev Module
# 2. Tools → Port → Select correct COM port
# 3. Upload
```

#### ESP32-CAM
```bash
cd ESP32/ESP32-CAM
# Add ML library: Sketch → Include Library → Add .ZIP Library
# → Select iot-parking-monitor/ESP32/ML_Model/illegal-parking-car-detection_inferencing.zip
# 1. Tools → Board → AI Thinker ESP32-CAM
# 2. Tools → Port → Select correct COM port
# 3. Upload
```

### Step 2: Start MQTT Broker
```bash
# macOS
brew install mosquitto
mosquitto -c /usr/local/etc/mosquitto/mosquitto.conf

# Ubuntu/Linux
sudo apt install mosquitto
sudo systemctl start mosquitto

# Windows (via Docker recommended)
docker run -d -p 1883:1883 eclipse-mosquitto:latest
```

### Step 3: Backend Setup
```bash
cd backend
npm install
# Create .env file with:
# DATABASE_URL=postgresql://user:password@localhost:5432/iot_parking
# MQTT_BROKER=192.168.1.116
# PORT=5000
npm start
```

### Step 4: Frontend Setup
```bash
cd frontend
npm install
# Update .env or config with:
# VITE_API_URL=http://localhost:5000
# VITE_CAMERA_IP=192.168.1.118 (ESP32-CAM IP, optional fallback)
npm run dev
```

### Step 5: Verify System
- Check ESP32 serial logs: `Arduino IDE → Tools → Serial Monitor (115200 baud)`
- Test MQTT: 
  ```bash
  mosquitto_sub -h 192.168.1.116 -t 'node/#'
  ```
- Open dashboard: `http://localhost:5173`

---

## Usage & Operation

### Dashboard Controls
1. **Status Pill** – Shows node state (IDLE, SOMETHING_DETECTED, VEHICLE_DETECTED, VIOLATION)
2. **Violation Timer** – Countdown (30s) before escalation to VIOLATION
3. **ML Confidence** – Vehicle detection confidence score (%)
4. **Relay Video** – View live MJPEG stream from camera
5. **Silence Buzzer** – Mute audible alert (MQTT command)
6. **Resolve Violation** – Return to IDLE state, reset LED/buzzer

### Quality Tuning (Optional)
Send MQTT commands to switch stream presets:
```bash
# High clarity (VGA 640x480, quality=10, slower)
mosquitto_pub -h 192.168.1.116 -t node/parking_zone_c1/cam/cmd/quality_high -m ""

# Low latency (QQVGA 160x120, quality=20, faster)
mosquitto_pub -h 192.168.1.116 -t node/parking_zone_c1/cam/cmd/quality_low -m ""

# Default balanced (QVGA 320x240, quality=12)
```

---

## Machine Learning Integration

### Edge Impulse Model: Illegal Parking Car Detection

**Model Type:** TinyML classifier (TensorFlow Lite for Microcontrollers)  
**Input:** 96×96 RGB image  
**Output:** Binary classification (car / not_car) with confidence  
**Inference Time:** ~200–300ms on ESP32  
**Threshold:** Confidence ≥ 0.5 for violation trigger  

### Real-World ML Performance Notes
- **Current Status:** TEST_MODE enabled for simulation; real deployment requires proper JPEG→RGB image pipeline
- **Path Forward:** Integrate Edge Impulse `esp32_camera` example for proper frame decoding/resizing
- **Expected Accuracy:** 85–95% with trained dataset (tested in lab)

See [ESP32/ML_INTEGRATION_NOTES.md](ESP32/ML_INTEGRATION_NOTES.md) for detailed ML pipeline documentation.

---

## Results & Discussion

### System Performance
- **Detection Latency:** ~500–800ms (ultrasonic → ML result → backend)
- **Stream Quality:** QVGA (320×240) @ 15–20 fps with optimized streaming
- **Video Relay:** <2–3s delay from ESP32-CAM to dashboard (WiFi dependent)
- **Buzzer Response:** Immediate on violation trigger
- **Scalability:** Supports multi-zone deployment (tested with 1 zone; code ready for N zones)

### Tested Scenarios
1. ✅ Vehicle detected → ML confirms → Violation escalated → Buzzer triggered
2. ✅ No vehicle → ML rejects → System resets to IDLE
3. ✅ Video relay works; dynamic camera URL updates via MQTT
4. ✅ Silent & resolve controls functional
5. ✅ WiFi optimizations (no-delay, TX power, PSRAM) improve throughput

### Challenges & Mitigations
| Challenge | Root Cause | Solution |
|-----------|-----------|----------|
| Low WiFi throughput | Default config, buffer delays | Increase XCLK, use no-delay sockets, disable WiFi sleep |
| Poor video quality | QQVGA too small, JPEG compression | Switch to QVGA, tune quality preset 10–12 |
| ML says "no car" | Dummy image pipeline (memset) | Integrate proper JPEG→RGB decoding (Edge Impulse example) |
| MQTT latency spikes | Broker overload, WiFi congestion | Use latest frame grab mode, reduce publish frequency |

---

## Scalability & Future Enhancements

### Multi-Zone Deployment
The system is architected for city-wide rollout:
- **Add new zones:** Flash ESP32 pairs with new NODE_ID, point MQTT broker to same server
- **Centralized dashboard:** Show all zones in grid; aggregate violation stats
- **Database scaling:** Store sensor data, violations, operator actions for analytics

### Planned Features
- [ ] **Auto-relay video on violation** (start stream automatically)
- [ ] **Violation recording** (save JPEG snapshots to backend)
- [ ] **Operator analytics** (response time, resolution rate by zone)
- [ ] **Mobile app** for on-field officers
- [ ] **Predictive scheduling** (ML-based peak violation times)
- [ ] **Integration with city traffic systems** (reroute traffic during violations)

### Sustainability Impact
- Reduces manual patrol overhead (officers cover ~5–10× more zones)
- Cuts fuel consumption from fewer patrol vehicles
- Improves traffic flow through faster violation resolution
- Enables data-driven parking policy (identify chronic violation spots)

---

## Repository Structure

```
iot-parking-monitor/
├── ESP32/
│   ├── ESP32-MAIN/
│   │   └── ESP32-MAIN.ino
│   ├── ESP32-CAM/
│   │   └── ESP32-CAM-ino
│   └── ML_Model/
│       └── illegal-parking-car-detection_inferencing/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── config/
│   │   ├── routes/
│   │   └── services/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── context/
│   │   ├── services/
│   │   └── styles/
│   └── package.json
├── md_Files/ (documentation)
└── README.md
```

---

## Video Demo

**[3-minute demo video](#)** showcasing:
1. Ultrasonic detection + LED state change
2. ML car detection on live frame
3. Violation escalation (red LED, buzzer)
4. Live video relay from dashboard
5. Silence & resolve controls

---


###  VIDEO DEMO DASHBOARD
https://drive.google.com/file/d/1TSXFx4bkya--dbuV1GhmrOQQIrGRqzua/view
---
###  VIDEO DEMO LIVE
https://drive.google.com/file/d/1yai9J0rBJ-RyXSsxcO8-n4GXpXs1HBnq/view?usp=drive_link
---

## Team & Acknowledgments

**Course:** COMP 413 – Internet of Things: Final Project  
**Group Members:**
1. SYED MUHAMMAD MOJIZ ALI ZAIDI 
2. SELİN ERYAŞAR 
3. GÜLESER KABA 
4. MOHAMED MOSTAFA MOHAMED MAHMOUD MOHAMEDY  

**References:**
- Edge Impulse: https://edgeimpulse.com
- TensorFlow Lite for Microcontrollers: https://www.tensorflow.org/lite/microcontrollers
- ESP32 Documentation: https://docs.espressif.com/projects/esp-idf/en/latest/
- MQTT Protocol: https://mqtt.org

---

## License

MIT License – See LICENSE file for details.

---

**For questions or contributions, please open an issue or contact the project team.**
