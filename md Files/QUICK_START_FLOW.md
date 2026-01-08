# Quick Start Guide - Parking Violation Detection

## 🚀 Starting the System

### 1. Backend Server
```bash
cd backend
npm install
npm start
```
Backend runs on: `http://localhost:3000`

### 2. Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on: `http://localhost:5173`

### 3. ESP32-MAIN
1. Open `ESP32/ESP32-MAIN/ESP32-MAIN.ino` in Arduino IDE
2. Configure WiFi credentials (lines 9-10)
3. Configure MQTT broker IP (line 14)
4. Upload to ESP32

### 4. ESP32-CAM
1. Add ML Library:
   - Sketch → Include Library → Add .ZIP Library
   - Select: `ESP32/ML_Model/illegal-parking-car-detection_inferencing.zip`
2. Open `ESP32/ESP32-CAM/ESP32-CAM-ino` in Arduino IDE
3. Configure WiFi and MQTT (lines 12-19)
4. Select Board: "AI Thinker ESP32-CAM"
5. Upload via FTDI programmer

## 📊 Testing the Flow

### Test 1: Normal Detection → Reset
1. Place object near ultrasonic sensor (< 50cm)
2. **Expected:** Dashboard shows "Something Detected", Green LED stays ON
3. Wait for camera ML inference
4. If not a car: System resets automatically to IDLE

### Test 2: Car Detection → Violation
1. Place car-like object or show car image to camera
2. **Expected:** 
   - Dashboard shows "Vehicle Detected" with 30s timer
   - Green LED stays ON
   - Timer counts down
3. Wait 30 seconds without moving object
4. **Expected:**
   - Red LED turns ON
   - Buzzer starts ringing
   - Dashboard background turns red
   - Shows "Violation" status

### Test 3: Buzzer Control
1. During violation, click "🔇 Silence Buzzer"
2. **Expected:** Buzzer stops, violation remains
3. Click "✓ Resolve Violation"
4. **Expected:** System resets to IDLE, Green LED turns on

### Test 4: Video Relay
1. During violation, click "📹 Relay Video"
2. **Expected:** Modal opens showing live ESP32-CAM stream
3. Close modal when done

## 🔧 Hardware Connections

### ESP32-MAIN
```
Ultrasonic Sensor:
- TRIG → GPIO 32
- ECHO → GPIO 33
- VCC  → 5V
- GND  → GND

LEDs:
- Green LED → GPIO 26 (+ resistor 220Ω)
- Red LED   → GPIO 27 (+ resistor 220Ω)

Buzzer:
- Buzzer    → GPIO 25
- GND       → GND
```

### ESP32-CAM
```
- Use AI Thinker pinout (built-in)
- Stream URL: http://{ESP32-CAM-IP}/stream
```

## 🐛 Troubleshooting

### Issue: Dashboard not updating
- **Check:** Backend server running?
- **Check:** Socket.IO connection (top-right indicator should be green)
- **Fix:** Restart backend server

### Issue: ESP32 not connecting to WiFi
- **Check:** WiFi credentials correct?
- **Check:** ESP32 in range of WiFi?
- **Fix:** Open Serial Monitor (115200 baud) to see connection logs

### Issue: Camera not detecting car
- **Check:** ML library installed correctly?
- **Check:** Camera module working? (test stream at http://{ESP32-CAM-IP}/stream)
- **Fix:** Verify ML model threshold (default 0.5 = 50% confidence)

### Issue: Buzzer not ringing
- **Check:** Buzzer connected to GPIO 25?
- **Check:** Buzzer polarity correct?
- **Fix:** Test with manual MQTT command: `mosquitto_pub -h {MQTT_IP} -t node/parking_zone_c1/cmd/buzzer -m "on"`

### Issue: Timer not working correctly
- **Check:** Backend MQTT service running?
- **Check:** ESP32-MAIN receiving violation_timer command?
- **Fix:** Check Serial Monitor for "⏲️ Starting violation timer" message

## 📡 MQTT Testing Commands

### Manual Control (using mosquitto_pub):

```bash
# Start camera stream
mosquitto_pub -h 192.168.1.110 -t node/parking_zone_c1/cam/cmd/start_stream -m "1"

# Trigger ML inference
mosquitto_pub -h 192.168.1.110 -t node/parking_zone_c1/cam/object_present -m "1"

# Start violation timer (30 seconds)
mosquitto_pub -h 192.168.1.110 -t node/parking_zone_c1/cmd/violation_timer -m "30"

# Silence buzzer
mosquitto_pub -h 192.168.1.110 -t node/parking_zone_c1/cmd/silence -m "1"

# Turn buzzer on/off
mosquitto_pub -h 192.168.1.110 -t node/parking_zone_c1/cmd/buzzer -m "on"
mosquitto_pub -h 192.168.1.110 -t node/parking_zone_c1/cmd/buzzer -m "off"

# Reset system
mosquitto_pub -h 192.168.1.110 -t node/parking_zone_c1/cmd/reset -m "1"
```

## 📱 Dashboard Features

### Status Indicators
- **Green background:** Normal operation
- **Red background:** Active violation
- **Connection dot (top-right):** 
  - Green = Connected to backend
  - Red = Disconnected

### State Cards Show:
- Current state icon and name
- Status message
- Confidence level (when vehicle detected)
- Countdown timer (when vehicle detected)
- Action buttons (during violation)

### Available Actions
- **During Violation:**
  - 📹 Relay Video - View live camera feed
  - 🔇 Silence Buzzer - Stop buzzer sound
  - ✓ Resolve Violation - Clear violation and reset

## 🎯 Expected Behavior Summary

| State | Green LED | Red LED | Buzzer | Dashboard BG |
|-------|-----------|---------|--------|--------------|
| IDLE | ON | OFF | OFF | Green |
| SOMETHING_DETECTED | ON | OFF | OFF | Green |
| VEHICLE_DETECTED | ON | OFF | OFF | Green |
| VIOLATION | OFF | ON | ON | Red |

## 📊 Serial Monitor Output

### ESP32-MAIN Expected Logs:
```
🚀 ESP32 Parking Violation System BOOT
✅ WiFi connected
📡 IP: 192.168.1.xxx
✅ MQTT connected
📊 DEBUG - Distance: 150 cm [✓ clear] | State: 0
🔔 Object detected at 45 cm!
🔎 Object at 45 cm — requesting camera confirmation
⏲️ Starting violation timer: 30 seconds
🚨 VIOLATION TRIGGERED!
🔊 Buzzer ON
```

### ESP32-CAM Expected Logs:
```
🚀 IoT Parking Monitor - ESP32-CAM starting...
📊 ML Model: Illegal Parking Car Detection
✅ WiFi Connected
192.168.1.xxx
📷 Camera Ready
📡 ESP32-CAM MQTT connected
🎥 Object detected by sensor - running ML inference...
🚗 Detected: car (0.87)
🎯 ML Result: CAR (Confidence: 0.87)
✅ Car confirmed - published to backend
```

## 🔐 Default Configuration

### Network:
- WiFi SSID: `FiberHGW_ZT54SE_5`
- WiFi Password: `kXcyDU7b3HCx`
- MQTT Broker: `192.168.1.110:1883`
- Backend API: `http://192.168.1.110:3000`

### Timing:
- Detection distance: 50 cm
- Clear distance: 100 cm
- Violation timer: 30 seconds
- Sensor check interval: 500 ms

### Node ID:
- Default: `parking_zone_c1`

---
**Last Updated:** January 2026  
**Status:** ✅ Ready for Deployment
