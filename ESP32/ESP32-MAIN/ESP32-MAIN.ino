#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>

// ========================================
// WIFI
// ========================================
const char* ssid = "FiberHGW_ZT54SE_5";
const char* password = "kXcyDU7b3HCx";

// ========================================
// MQTT
// ========================================
const char* mqtt_server = "192.168.1.116";
const int   mqtt_port   = 1883;
const char* mqtt_user   = "mojiz";
const char* mqtt_pass   = "1735";

const char* NODE_ID = "parking_zone_c1";
const char* MQTT_CLIENT_ID = "parking_zone_c1_ctrl";

const char* SERVER_IP = "192.168.1.116";
const int SERVER_PORT = 3000;

// ========================================
// HARDWARE PINS
// ========================================
const int BUZZER_PIN = 25;
const int LED_GREEN  = 26;
const int LED_RED    = 27;
const int TRIG_PIN   = 32;
const int ECHO_PIN   = 33;

// ========================================
// PARAMETERS
// ========================================
const int DETECTION_DISTANCE = 50;     // cm - ultrasonic triggers when object is closer than this
const int CLEAR_DISTANCE     = 100;    // cm - object is considered "gone" when distance exceeds this
const int VIOLATION_TIMEOUT  = 30;     // seconds (30 seconds before violation)
const int SENSOR_INTERVAL    = 500;    // ms
const int BUZZER_FREQ        = 2000;   // Hz

// ========================================
// STATE
// ========================================
enum ParkingState { 
  IDLE,                    // No detection
  SOMETHING_DETECTED,      // Sensor triggered
  VEHICLE_DETECTED,        // Camera confirmed it's a car
  VIOLATION                // Timer expired, car didn't move
};

ParkingState state = IDLE;

// State tracking
unsigned long detectedAt = 0;
unsigned long vehicleDetectedAt = 0;
unsigned long lastSensorCheck = 0;
unsigned long violationCountdownTimer = 0;

// Flags
bool buzzerActive = false;
bool buzzerSilenced = false;
bool vehicleConfirmed = false;
bool isViolationCountdownActive = false;
// Ensure we only request camera stream once per detection
bool streamRequested = false;

WiFiClient espClient;
PubSubClient client(espClient);

// ========================================
// WIFI
// ========================================
void setup_wifi() {
  Serial.println("🔌 Connecting to WiFi...");
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected");
    Serial.print("📡 IP: ");
    Serial.println(WiFi.localIP());
  }
}

// ========================================
// HTTP HELPERS
// ========================================
void notifyBackendSensorDetection(int threshold) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/nodes/" + NODE_ID + "/sensor/detect";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<200> doc;
  doc["threshold"] = threshold;
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  Serial.printf("📡 Sensor detection notified - HTTP %d\n", httpCode);
  http.end();
}

void notifyBackendVehicleDetected(float confidence) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/nodes/" + NODE_ID + "/vehicle/detect";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<256> doc;
  doc["confidence"] = confidence;
  doc["frameData"] = "";
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  Serial.printf("🚗 Vehicle detection notified - HTTP %d\n", httpCode);
  http.end();
}

void notifyBackendViolation() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/nodes/" + NODE_ID + "/violation/report";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<256> doc;
  doc["videoUrl"] = "";
  doc["details"] = "Vehicle did not move within timeout period";
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  Serial.printf("⚠️ Violation reported - HTTP %d\n", httpCode);
  http.end();
}

void notifyBackendReset() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/nodes/" + NODE_ID + "/violation/resolve";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<128> doc;
  doc["status"] = "resolved";
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  Serial.printf("✅ Reset notified - HTTP %d\n", httpCode);
  http.end();
}

// ========================================
// MQTT CALLBACK
// ========================================
void callback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (uint32_t i = 0; i < length; i++) msg += (char)payload[i];
  String t = String(topic);

  Serial.println("📩 MQTT RX → " + t + " | " + msg);

  // Buzzer control
  if (t.endsWith("/cmd/buzzer")) {
    if (msg == "on") {
      startBuzzer();
    } else if (msg == "off") {
      stopBuzzer();
    }
  }

  // LED control
  if (t.endsWith("/cmd/led")) {
    if (msg == "on") {
      digitalWrite(LED_GREEN, HIGH);
      Serial.println("💡 LED ON");
    } else if (msg == "off") {
      digitalWrite(LED_GREEN, LOW);
      Serial.println("💡 LED OFF");
    }
  }

  // Silence buzzer
  if (t.endsWith("/cmd/silence")) {
    Serial.println("🔕 Buzzer silenced");
    buzzerSilenced = true;
    stopBuzzer();
  }

  // Reset command
  if (t.endsWith("/cmd/reset")) {
    Serial.println("🔄 RESET command received");
    resetState();
  }

  // Violation timer command
  if (t.endsWith("/cmd/violation_timer")) {
    int duration = msg.toInt();
    if (duration > 0) {
      Serial.printf("⏲️ Starting violation timer: %d seconds\n", duration);
      isViolationCountdownActive = true;
      violationCountdownTimer = duration;
      vehicleDetectedAt = millis();
      state = VEHICLE_DETECTED;  // Move to VEHICLE_DETECTED state
    }
  }
  
  // Vehicle confirmed by ML
  if (t.endsWith("/cam/ml_result")) {
    Serial.println("🚗 ML confirmed vehicle detection");
    vehicleConfirmed = true;
    state = VEHICLE_DETECTED;
  }
}

// ========================================
// MQTT CONNECT
// ========================================
void reconnect() {
  while (!client.connected()) {
    Serial.println("🔁 Connecting to MQTT...");
    if (client.connect(MQTT_CLIENT_ID, mqtt_user, mqtt_pass)) {
      Serial.println("✅ MQTT connected");

      // Subscribe to command topics
      client.subscribe(("node/" + String(NODE_ID) + "/cmd/#").c_str());
      client.subscribe(("node_cam/" + String(NODE_ID) + "/cmd/#").c_str());

      // Publish online status
      client.publish(("node/" + String(NODE_ID) + "/status").c_str(), "online", true);
    } else {
      Serial.print("❌ MQTT failed, rc=");
      Serial.println(client.state());
      delay(3000);
    }
  }
}

// ========================================
// SENSOR READING
// ========================================
int getDistance() {
  // Ensure pins are in correct state
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  
  // Send 10µs pulse
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Measure echo pulse duration (timeout after 30ms)
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  
  // If no echo received, return -1
  if (duration == 0) {
    return -1;
  }

  // Speed of sound = 343 m/s = 0.0343 cm/µs
  // Distance = (duration / 2) * speed = (duration * 0.0343) / 2
  int distance = duration * 0.034 / 2;
  
  // Filter out unrealistic values (>400cm is too far)
  if (distance > 400) {
    return -1;
  }
  
  return distance;
}

// ========================================
// LED & BUZZER CONTROL
// ========================================
void startBuzzer() {
  if (!buzzerActive && !buzzerSilenced) {
    ledcAttach(BUZZER_PIN, BUZZER_FREQ, 8);
    ledcWrite(BUZZER_PIN, 180);
    buzzerActive = true;
    Serial.println("🔊 Buzzer ON");
  }
}

void stopBuzzer() {
  if (buzzerActive) {
    ledcWrite(BUZZER_PIN, 0);
    buzzerActive = false;
    Serial.println("🔇 Buzzer OFF");
  }
}

void setLEDState(String color) {
  if (color == "GREEN") {
    digitalWrite(LED_GREEN, HIGH);
    digitalWrite(LED_RED, LOW);
  } else if (color == "RED") {
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_RED, HIGH);
  } else {
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_RED, LOW);
  }
}

// ========================================
// STATE MANAGEMENT
// ========================================
void resetState() {
  state = IDLE;
  buzzerSilenced = false;
  vehicleConfirmed = false;
  isViolationCountdownActive = false;
  detectedAt = 0;
  vehicleDetectedAt = 0;
  
  stopBuzzer();
  setLEDState("GREEN");
  
  notifyBackendReset();
  Serial.println("✅ System reset to IDLE");
}

// ========================================
// MAIN FSM LOOP
// ========================================
void updateStateMachine() {
  if (millis() - lastSensorCheck < SENSOR_INTERVAL) return;
  lastSensorCheck = millis();

  int distance = getDistance();
  
  // DEBUG: Log sensor values every 1 second
  static unsigned long lastDebugLog = 0;
  if (millis() - lastDebugLog > 1000) {
    Serial.printf("📊 DEBUG - Distance: %d cm [%s] | State: %d\n", 
                  distance,
                  distance >= 0 && distance < DETECTION_DISTANCE ? "🚨 OBJECT DETECTED" : "✓ clear",
                  state);
    Serial.printf("   🔗 WiFi: %s | 📡 MQTT: %s | 🔊 Buzzer: %s\n",
                  WiFi.status() == WL_CONNECTED ? "✅" : "❌",
                  client.connected() ? "✅" : "❌",
                  buzzerActive ? "ON" : "OFF");
    lastDebugLog = millis();
  }

  // Violation countdown timer
  if (isViolationCountdownActive) {
    unsigned long elapsed = (millis() - vehicleDetectedAt) / 1000;
    if (elapsed >= violationCountdownTimer) {
      Serial.println("⏲️ Violation timer expired!");
      triggerViolation();
      isViolationCountdownActive = false;
    }
  }

  switch (state) {

    case IDLE:
      setLEDState("GREEN");
      
      // Check ultrasonic sensor - object detected when close
      if (distance >= 0 && distance < DETECTION_DISTANCE) {
        Serial.printf("🔔 Object detected at %d cm!\n", distance);
        detectedAt = millis();
        state = SOMETHING_DETECTED;
        notifyBackendSensorDetection(distance);
        streamRequested = false; // reset stream request flag for new detection
      }
      break;

    case SOMETHING_DETECTED: {
      setLEDState("GREEN");  // Keep green LED on during detection
      
      // Object still there?
      if (distance < 0 || distance > CLEAR_DISTANCE) {
        // Object moved away
        Serial.println("✅ Object moved away - resetting");
        // If we previously requested stream, tell camera to stop
        if (streamRequested) {
          client.publish((String("node/") + NODE_ID + "/cam/cmd/stop_stream").c_str(), "1");
          streamRequested = false;
        }
        // Notify backend to reset session
        notifyBackendReset();
        state = IDLE;
      } else if (distance >= 0 && distance < DETECTION_DISTANCE) {
        // Object is in detection zone - request camera ML confirmation once
        if (!streamRequested) {
          Serial.printf("🔎 Object at %d cm — requesting camera confirmation\n", distance);
          client.publish(("node/" + String(NODE_ID) + "/cam/cmd/start_stream").c_str(), "1");
          // Also publish object_present so camera runs ML immediately
          client.publish(("node/" + String(NODE_ID) + "/cam/object_present").c_str(), "1");
          streamRequested = true;
        }
      }
      break;
    }

    case VEHICLE_DETECTED: {
      setLEDState("GREEN");  // Keep green LED on until violation
      
      // Check if vehicle still present
      if (distance < 0 || distance > CLEAR_DISTANCE) {
        // Vehicle left
        Serial.println("✅ Vehicle left - resetting");
        resetState();
      }
      // Violation timer will be started by backend after ML confirmation
      break;
    }

    case VIOLATION: {
      setLEDState("RED");
      
      // Check if vehicle still present
      if (distance < 0 || distance > CLEAR_DISTANCE) {
        // Vehicle left - stop buzzer and reset
        Serial.println("✅ Vehicle left after violation - resetting");
        resetState();
      }
      break;
    }
  }
}

// ========================================
// VIOLATION TRIGGER
// ========================================
void triggerViolation() {
  Serial.println("🚨 VIOLATION TRIGGERED!");
  state = VIOLATION;
  setLEDState("RED");
  startBuzzer();
  // Publish MQTT violation so backend/socket can update UI even if HTTP fails
  client.publish((String("node/") + NODE_ID + "/ctrl/violation").c_str(), "1");
  notifyBackendViolation();
}

// ========================================
// SETUP
// ========================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n\n🚀 ESP32 Parking Violation System BOOT");

  // Initialize ultrasonic sensor pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  // Set initial states
  setLEDState("GREEN");
  digitalWrite(BUZZER_PIN, LOW);
  
  Serial.println("🔌 Connecting to WiFi...");

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  Serial.println("✅ Setup complete - System IDLE");
  Serial.println("🎯 Ready to detect objects - move something close to ultrasonic sensor (GPIO 32/33)");
}

// ========================================
// MAIN LOOP
// ========================================
void loop() {
  // Check WiFi/MQTT connection
  static unsigned long lastConnCheck = 0;
  if (millis() - lastConnCheck > 5000) {
    Serial.printf("🔗 WiFi: %s | MQTT: %s\n", 
                  WiFi.status() == WL_CONNECTED ? "✅" : "❌",
                  client.connected() ? "✅" : "❌");
    lastConnCheck = millis();
  }
  
  if (!client.connected()) {
    if (WiFi.status() == WL_CONNECTED) {
      reconnect();
    } else {
      setup_wifi();
    }
  }
  client.loop();

  // Update state machine
  updateStateMachine();

  delay(50);
}
