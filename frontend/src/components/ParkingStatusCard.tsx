import React, { useState, useEffect } from 'react';
import { useParking, ParkingState } from '../context/ParkingContext';
import { api } from '../services/api';
import './ParkingStatusCard.css';

interface ParkingStatusCardProps {
  nodeId: string;
  location?: string;
  cameraVideoUrl?: string;
}

export default function ParkingStatusCard({ nodeId, location, cameraVideoUrl }: ParkingStatusCardProps) {
  const { sessions, violations, startTimer, stopTimer, resetSession } = useParking();
  const session = sessions[nodeId];
  const violation = violations[nodeId];
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isRelayingVideo, setIsRelayingVideo] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [cameraUrl, setCameraUrl] = useState<string>('');
  const [videoLoading, setVideoLoading] = useState(false);

  const state = session?.state || 'IDLE';

  // Auto-close video modal when violation ends
  useEffect(() => {
    if (state !== 'VIOLATION') {
      setShowVideoModal(false);
      setIsRelayingVideo(false);
    }
  }, [state]);

  // Update timer display
  useEffect(() => {
    if (state !== 'VEHICLE_DETECTED' || !session) return;

    const startTime = new Date(session.timestamp).getTime();
    const timerDuration = session.timerDuration || 30;
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, timerDuration - elapsed);
      setTimeRemaining(Math.ceil(remaining));
    }, 100);

    return () => clearInterval(interval);
  }, [state, session]);

  const handleRelayVideo = async () => {
    try {
      setIsRelayingVideo(true);
      setVideoLoading(true);
      
      // Use camera URL from backend (ESP32-CAM publishes its URL via MQTT)
      // or fallback to environment variable or default
      const url = cameraVideoUrl || 
                  (import.meta.env.VITE_CAMERA_IP ? `http://${import.meta.env.VITE_CAMERA_IP}/stream` : null);
      
      if (!url) {
        console.error('No camera URL available');
        alert('Camera URL not available. Please ensure ESP32-CAM is connected and publishing its URL.');
        setIsRelayingVideo(false);
        setVideoLoading(false);
        return;
      }
      
      setCameraUrl(url);
      setShowVideoModal(true);
      
      // Give camera time to start streaming
      setTimeout(() => {
        setVideoLoading(false);
      }, 1000);
      
      await api.relayVideo(nodeId, url);
    } catch (error) {
      console.error('Failed to relay video:', error);
      setIsRelayingVideo(false);
      setVideoLoading(false);
    }
  };

  const handleResolveViolation = async () => {
    try {
      setShowVideoModal(false);
      setIsRelayingVideo(false);
      // Stop buzzer first
      await api.silenceBuzzer(nodeId);
      await api.resolveViolation(nodeId, violation?.id);
      resetSession(nodeId);
    } catch (error) {
      console.error('Failed to resolve violation:', error);
    }
  };

  const handleSilenceBuzzer = async () => {
    try {
      await api.silenceBuzzer(nodeId);
    } catch (error) {
      console.error('Failed to silence buzzer:', error);
    }
  };

  const getStateColor = (state: ParkingState) => {
    switch (state) {
      case 'IDLE':
        return '#10b981'; // Green
      case 'SOMETHING_DETECTED':
        return '#f59e0b'; // Amber
      case 'VEHICLE_DETECTED':
        return '#3b82f6'; // Blue
      case 'VIOLATION':
        return '#ef4444'; // Red
      default:
        return '#6b7280'; // Gray
    }
  };

  const getStateIcon = (state: ParkingState) => {
    switch (state) {
      case 'IDLE':
        return '✅';
      case 'SOMETHING_DETECTED':
        return '🔔';
      case 'VEHICLE_DETECTED':
        return '🚗';
      case 'VIOLATION':
        return '🚨';
      default:
        return '❓';
    }
  };

  const stateColor = getStateColor(state);
  const statusClass =
    state === 'IDLE' ? 'status-idle' :
    state === 'SOMETHING_DETECTED' ? 'status-detected' :
    state === 'VEHICLE_DETECTED' ? 'status-vehicle' :
    'status-violation';

  return (
    <div className="card" style={{ borderLeft: `6px solid ${stateColor}` }}>
      <div className="card-header">
        <div className="card-title">
          <span style={{ fontSize: 20 }}>{getStateIcon(state)}</span>
          <div>
            <h3>{location || `Node ${nodeId}`}</h3>
            <small>ID: {nodeId}</small>
          </div>
        </div>
        <span className={`status-pill ${statusClass}`}>{state}</span>
      </div>

      <div className="card-body">
        <p className="status-message">{session?.message || '✅ Idle - Ready for Detection'}</p>

        {state === 'VEHICLE_DETECTED' && (
          <div className="timer-section">
            <div className="timer-display">
              <div className="timer-circle" style={{ color: stateColor }}>
                <span className="timer-value">{timeRemaining}s</span>
              </div>
              <p>Violation in:</p>
            </div>
            <p className="timer-label">Vehicle will be flagged as violation soon</p>
          </div>
        )}

        {session?.confidence !== undefined && (
          <div className="confidence-section">
            <label>Detection Confidence:</label>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${session.confidence * 100}%`,
                  backgroundColor: stateColor
                }}
              />
            </div>
            <span>{(session.confidence * 100).toFixed(1)}%</span>
          </div>
        )}

        {state === 'VIOLATION' && (
          <div className="violation-section">
            <div className="violation-alert">
              <span className="alert-icon">⚠️</span>
              <div>
                <h4>Parking Violation Detected</h4>
                <p>Vehicle has not moved within the time limit</p>
              </div>
            </div>

            <div className="violation-actions">
              <button
                className="btn btn-primary"
                onClick={handleRelayVideo}
                disabled={isRelayingVideo}
              >
                📹 {isRelayingVideo ? 'Relaying...' : 'Relay Video'}
              </button>
              <button
                className="btn btn-warning"
                onClick={handleSilenceBuzzer}
              >
                🔇 Silence Buzzer
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleResolveViolation}
              >
                ✓ Resolve Violation
              </button>
            </div>
          </div>
        )}

        {/* Video Modal */}
        {showVideoModal && (
          <div className="video-modal-overlay" onClick={() => setShowVideoModal(false)}>
            <div className="video-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="video-modal-header">
                <h3>📹 Live Camera Feed - {nodeId}</h3>
                <button 
                  className="close-btn"
                  onClick={() => {
                    setShowVideoModal(false);
                    setIsRelayingVideo(false);
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="video-stream">
                {videoLoading && (
                  <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)',
                    color: 'white',
                    fontSize: '18px',
                    zIndex: 10
                  }}>
                    Loading camera stream...
                  </div>
                )}
                <img 
                  src={cameraUrl} 
                  alt="Camera Stream"
                  onLoad={() => setVideoLoading(false)}
                  onError={() => {
                    console.error('Failed to load camera stream');
                    setVideoLoading(false);
                  }}
                  style={{ 
                    width: '100%', 
                    height: '100%',
                    objectFit: 'cover',
                    minHeight: '400px'
                  }}
                />
              </div>
              <div className="video-modal-footer">
                <p>🎥 Live streaming from ESP32-CAM</p>
              </div>
            </div>
          </div>
        )}

        <div className="timestamp">
          {session?.timestamp && (
            <small>
              Last Update: {new Date(session.timestamp).toLocaleTimeString()}
            </small>
          )}
        </div>
      </div>
    </div>
  );
}
