# ML Model Integration - Important Notes

## 🔴 Current ML Issue

The TinyML model is not detecting real cars because the current implementation has a simplified image processing pipeline:

### Problem in `runTinyML()` function:
```cpp
// Current code just fills with dummy data
memset(out_ptr, 128, bytes_read * sizeof(float));
```

This doesn't actually decode the JPEG and convert it to the RGB pixel format that Edge Impulse expects.

## ✅ Solution Options

### Option 1: Use ESP32 JPEG Decoder (Recommended)
The ESP32 has hardware JPEG decoding. You need to:
1. Decode JPEG to RGB888 format
2. Resize to model input size (96x96)
3. Convert to float array expected by Edge Impulse

### Option 2: Use Edge Impulse's Built-in Functions
Edge Impulse provides helper functions for image processing:
- `ei_camera_get_data()` - Captures and formats camera data
- Check the example files in: `ML_Model/illegal-parking-car-detection_inferencing/examples/esp32/esp32_camera/`

### Option 3: Use Lower Resolution + Direct RGB
Configure camera to output RGB565 or RGB888 directly instead of JPEG, then convert to model format.

## 📝 Proper Implementation Steps

### 1. Add JPEG Decoder Library
```cpp
#include "img_converters.h" // ESP32 camera library includes this
```

### 2. Convert JPEG to RGB
```cpp
// Inside runTinyML() function:
uint8_t *rgb888_buf = NULL;
size_t rgb888_len = 0;

// Convert JPEG to RGB888
bool converted = fmt2rgb888(
    fb->buf, fb->len,
    PIXFORMAT_JPEG,
    rgb888_buf
);

if (!converted || !rgb888_buf) {
    Serial.println("JPEG to RGB conversion failed");
    if (rgb888_buf) free(rgb888_buf);
    return false;
}
```

### 3. Resize to Model Input Size
```cpp
// Resize from QQVGA (160x120) to 96x96
// You'll need to implement or use a resizing function
uint8_t *resized = resize_image(rgb888_buf, 160, 120, 96, 96);
```

### 4. Convert to Float Array
```cpp
signal.get_data = [&](size_t offset, size_t length, float *out_ptr) -> int {
    for (size_t i = 0; i < length && (offset + i) < signal.total_length; i++) {
        size_t pixel_ix = offset + i;
        // Convert RGB888 to float (0-255 -> 0.0-1.0)
        out_ptr[i] = ((float)resized[pixel_ix]) / 255.0f;
    }
    return length;
};
```

## 🧪 For Now: Use TEST_MODE

The `TEST_MODE = true` flag bypasses the ML inference and simulates car detection for testing the flow.

**To use real ML detection:**
1. Set `TEST_MODE = false`
2. Implement proper JPEG decoding (see above)
3. OR use Edge Impulse's example code as a template

## 📚 Reference Files

Check these Edge Impulse example files for proper implementation:
- `ESP32/ML_Model/illegal-parking-car-detection_inferencing/examples/esp32/esp32_camera/esp32_camera.ino`

This contains the complete, working implementation from Edge Impulse team.

## 🎯 Quick Fix for Testing

If you just want to test with real cars quickly:
1. Keep TEST_MODE = false
2. Lower the confidence threshold:
```cpp
bool isCar = carConfidence > 0.3; // Lower from 0.5 to 0.3
```

3. Or try different camera settings (higher resolution, better lighting)

## 🚀 Production Ready Solution

For production deployment:
1. Copy the implementation from Edge Impulse's esp32_camera example
2. Adapt it to your MQTT/HTTP architecture
3. Test with various lighting conditions and angles
4. Adjust confidence threshold based on testing results

---
**Note:** The current simplified implementation works for system flow testing, but needs proper JPEG processing for real car detection.
