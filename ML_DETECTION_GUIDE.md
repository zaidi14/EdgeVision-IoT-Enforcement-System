# Real ML Car Detection Guide

## ✅ What Changed

**REMOVED:** Dummy `memset()` image pipeline  
**ADDED:** Proper JPEG → RGB888 conversion + Edge Impulse image processing

---

## 🚗 Detection Capabilities

### What It Will Detect

| Object | Expected Result | Confidence Range |
|--------|----------------|------------------|
| **Real car (sedan, SUV)** | ✅ **DETECTED** | 0.70 - 0.95 |
| **Real car (far away)** | ⚠️ Maybe detected | 0.50 - 0.70 |
| **Toy car (Hot Wheels)** | ❓ **Depends on training** | 0.30 - 0.70 |
| **Motorcycle** | ⚠️ Maybe (if in training) | 0.40 - 0.80 |
| **Person** | ❌ NOT detected | 0.10 - 0.30 |
| **Box/object** | ❌ NOT detected | 0.05 - 0.25 |

### Hot Wheels Toy Cars

**Will it detect toy cars?**
- **Probably YES** if:
  - Toy is close to camera (10-30 cm)
  - Well-lit and car-shaped
  - Your Edge Impulse model was trained on small/toy cars
  
- **Probably NO** if:
  - Toy is too small in frame
  - Model only trained on full-size vehicles
  - Poor lighting or motion blur

**Testing Recommendation:**
1. Test with real car first → should get **0.75+** confidence
2. Test with Hot Wheels → check confidence:
   - **>0.65** = System treats it as car (violation triggered)
   - **<0.65** = System rejects it (no violation)

---

## 🎯 Confidence Threshold: 0.65

**Why 0.65?**
- **0.50:** Too permissive; detects boxes, shadows, false positives
- **0.65:** ✅ **BALANCED** – catches real cars, filters noise
- **0.75:** Strict; may miss some real cars at bad angles
- **0.85:** Very strict; only perfect detections

**Current System:**
```cpp
// ESP32-CAM
bool isCar = carConfidence >= 0.65;

// Backend
if (result.confidence >= 0.65) {
  // Trigger violation flow
}
```

---

## 🧪 Testing Protocol

### Step 1: Flash ESP32-CAM
```cpp
// In ESP32-CAM-ino
const bool TEST_MODE = false;  // ✅ REAL ML
```

Upload to ESP32-CAM via Arduino IDE.

### Step 2: Serial Monitor Check
Open Serial Monitor (115200 baud) and watch for:

```
📸 Converting JPEG to RGB888...
🔧 Resizing from 320x240 to 96x96
🧠 Running ML classifier...
📊 Classification mode:
  car: 0.87432
  not_car: 0.12568
🎯 ML Result: ✅ CAR DETECTED (Confidence: 0.87)
⏱️  Timing - DSP: 145ms, Classification: 187ms, Anomaly: 0ms
```

### Step 3: Test Real Car
1. Place car in front of ultrasonic sensor (10-100 cm)
2. Wait for ML result in serial monitor
3. **Expected:** Confidence **0.75 - 0.95**
4. Dashboard should show "VEHICLE_DETECTED" → countdown → VIOLATION

### Step 4: Test Hot Wheels
1. Place toy car in front of sensor
2. Check ML result:
   - **Confidence >0.65** → System treats as car
   - **Confidence <0.65** → System rejects, stays IDLE

### Step 5: Adjust Threshold (Optional)
If too many false positives:
```cpp
// ESP32-CAM line ~195
bool isCar = carConfidence >= 0.75;  // Stricter
```

If missing real cars:
```cpp
bool isCar = carConfidence >= 0.55;  // More permissive
```

Don't forget to update backend too:
```javascript
// backend/src/services/mqttService.js line ~127
if (result.confidence >= 0.75) {  // Match ESP32 threshold
```

---

## 📊 Expected Performance

| Metric | Value |
|--------|-------|
| **Inference Time** | 200-350 ms |
| **JPEG Decode Time** | 50-100 ms |
| **Total Detection Latency** | ~500-800 ms (sensor → result) |
| **Real Car Accuracy** | 85-95% (with good lighting) |
| **False Positive Rate** | <5% (with 0.65 threshold) |

---

## 🔧 Troubleshooting

### "JPEG to RGB conversion failed"
- **Cause:** Camera capture returned corrupted frame
- **Fix:** Check camera wiring, restart ESP32-CAM
- **Workaround:** System publishes "not_car" with confidence 0.0

### "Failed to allocate snapshot buffer"
- **Cause:** Not enough RAM (need ~230 KB for RGB buffer)
- **Fix:** Ensure `config.fb_location = CAMERA_FB_IN_PSRAM;` (line 103)

### Confidence always low (<0.40)
- **Cause:** Model not trained for this scenario OR poor lighting
- **Fix:** 
  1. Improve lighting (add lamp)
  2. Adjust camera angle
  3. Retrain Edge Impulse model with more data

### Toy cars triggering violations
- **Expected:** If model trained on cars, toy may be detected
- **Fix:** 
  1. Increase threshold to 0.75
  2. Add "toy" class to Edge Impulse training
  3. Add size filter (real cars are bigger in frame)

---

## 🎓 Edge Impulse Model Info

**Model Name:** `illegal-parking-car-detection`  
**Input Size:** 96×96 RGB  
**Model Type:** Image Classification OR Object Detection  
**Classes:** `car`, `not_car` (or `vehicle`, `background`)  
**Framework:** TensorFlow Lite for Microcontrollers  

**To check your model:**
```cpp
// Serial monitor shows at startup:
📊 ML Model: Illegal Parking Car Detection
🎯 ML Input Size: 96x96
```

**Retrain model:**
1. Go to Edge Impulse project
2. Add more training images (real cars, toys, background)
3. Retrain → Deploy → Download Arduino library
4. Replace `ESP32/ML_Model/illegal-parking-car-detection_inferencing/`

---

## 🚀 Production Checklist

- [x] Real JPEG→RGB conversion integrated
- [x] TEST_MODE = false
- [x] Confidence threshold = 0.65
- [x] Backend threshold matches ESP32
- [ ] Test with 10+ real cars (verify >0.70 confidence)
- [ ] Test with toys/objects (verify <0.65 rejection)
- [ ] Test in different lighting (day/night)
- [ ] Document actual accuracy in final report
- [ ] Adjust threshold based on results

---

**Status:** ✅ Real ML pipeline active. Ready for testing with actual vehicles.
