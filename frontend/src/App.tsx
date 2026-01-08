import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, Node, ViolationLog } from './services/api';
import { ParkingProvider, useParking } from './context/ParkingContext';
import './styles/theme.css';
import PhoneCameraStream from './components/PhoneCameraStream';
import ParkingStatusCard from './components/ParkingStatusCard';
import { ViolationHistory } from './components/ViolationHistory';

function AppContent() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [connected, setConnected] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [violations, setViolations] = useState<ViolationLog[]>([]);
  const [showVideo, setShowVideo] = useState<{[key: string]: boolean}>({});
  const [streamingNode, setStreamingNode] = useState<string | null>(null);
  const [liveFrames, setLiveFrames] = useState<{[key: string]: string}>({});
  const [viewMode, setViewMode] = useState<'dashboard' | 'history'>('dashboard');
  const { sessions, updateSession, setViolation, startTimer, stopTimer, resetSession } = useParking();
  
  useEffect(() => {
    api.getNodes().then(setNodes);
    
    const socketInstance = io('http://192.168.1.116:3000');
    
    socketInstance.on('connect', () => {
      console.log('✅ Connected');
      setConnected(true);
    });
    
    socketInstance.on('disconnect', () => {
      console.log('❌ Disconnected');
      setConnected(false);
    });
    
    socketInstance.on('mqtt_event', (data: any) => {
      if (data.node) {
        setNodes(prev => {
          const idx = prev.findIndex(n => n.node_id === data.node.node_id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = data.node;
            return copy;
          }
          return [...prev, data.node];
        });
      }
    });

    // Listen for parking state changes
    socketInstance.on('parking_state_change', (data: any) => {
      console.log('🚗 Parking state change:', data);
      updateSession(data.nodeId, {
        state: data.state,
        message: data.message,
        timerDuration: data.timerDuration
      });
    });

    // Listen for vehicle detection with timer
    socketInstance.on('vehicle_detected', (data: any) => {
      console.log('🚗 Vehicle detected:', data);
      updateSession(data.nodeId, {
        state: 'VEHICLE_DETECTED',
        message: data.message,
        confidence: data.confidence,
        timerDuration: data.timerDuration || 30
      });

      // Start timer that expires after timerDuration seconds
      startTimer(data.nodeId, data.timerDuration || 30, () => {
        console.log('⏲️ Timer expired for:', data.nodeId);
        // Violation will be triggered by API call from ESP32
      });
    });

    // Listen for violation detection
    socketInstance.on('violation_detected', (data: any) => {
      console.log('⚠️ Violation detected:', data);
      stopTimer(data.nodeId);
      updateSession(data.nodeId, {
        state: 'VIOLATION',
        message: data.message,
        videoUrl: data.videoUrl
      });
      setViolation(data.nodeId, {
        id: data.sessionId,
        videoUrl: data.videoUrl,
        timestamp: new Date(),
        showRelayButton: true
      });
    });

    // Listen for live phone camera frames
    socketInstance.on('phone_frame', (data: any) => {
      console.log('📹 Received frame for:', data.nodeId);
      setLiveFrames(prev => ({
        ...prev,
        [data.nodeId]: data.frame
      }));
    });

    socketInstance.on('phone_stream_stop', (data: any) => {
      console.log('📹 Stream stopped for:', data.nodeId);
      setLiveFrames(prev => {
        const copy = {...prev};
        delete copy[data.nodeId];
        return copy;
      });
    });

    socketInstance.on('video_relay_start', (data: any) => {
      console.log('📹 Video relay started for:', data.nodeId);
    });
    
    return () => { socketInstance.disconnect(); };
  }, [updateSession, setViolation, startTimer, stopTimer]);
  
  const loadViolations = async (nodeId: string) => {
    const logs = await api.getViolationLogs(nodeId);
    setViolations(logs);
    setSelectedNode(nodeId);
  };
  
  const getStatusColor = (status: string | null) => {
    return status === 'online' ? '#10b981' : '#6b7280';
  };

  // Determine overall dashboard background color based on any violation
  const hasViolation = Object.values(sessions).some(session => session?.state === 'VIOLATION');
  const dashboardBgColor = hasViolation ? '#fee2e2' : '#f0fdf4'; // Light red or light green
  const headerBg = hasViolation ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';
  
  return (
    <div className="app-container">
      <header className="app-header" style={{ borderBottomColor: hasViolation ? '#ef4444' : '#10b981' }}>
        <div className="app-header-inner">
          <h1 className="brand-title">🚗 IoT Parking Monitor</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span className="muted">Active Nodes: <strong style={{ color: '#0f172a' }}>{nodes.length}</strong></span>
            <div className="status-chip" style={{ borderColor: connected ? '#10b981' : '#ef4444', background: connected ? '#ecfdf5' : '#fee2e2' }}>
              <span className="status-dot" style={{ background: connected ? '#10b981' : '#ef4444', boxShadow: connected ? '0 0 10px #10b981' : '0 0 10px #ef4444' }}></span>
              <span className="status-text" style={{ color: connected ? '#065f46' : '#7f1d1d' }}>{connected ? 'CONNECTED' : 'DISCONNECTED'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setViewMode('dashboard')}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: viewMode === 'dashboard' ? '2px solid #0ea5e9' : '1px solid #cbd5e1',
                background: viewMode === 'dashboard' ? '#e0f2fe' : '#ffffff',
                color: '#0f172a',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Dashboard
            </button>
            <button
              onClick={() => setViewMode('history')}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: viewMode === 'history' ? '2px solid #0ea5e9' : '1px solid #cbd5e1',
                background: viewMode === 'history' ? '#e0f2fe' : '#ffffff',
                color: '#0f172a',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Violation Photos
            </button>
          </div>
        </div>
      </header>

      <main className="grid">
        {viewMode === 'history' ? (
          <ViolationHistory />
        ) : (
          <>
            {nodes.length === 0 ? (
              <div style={{ background: 'white', padding: '60px', borderRadius: '8px', textAlign: 'center' }}>
                <p style={{ fontSize: '18px', color: '#6b7280', marginBottom: '8px' }}>
                  No parking nodes detected.
                </p>
                <p style={{ fontSize: '14px', color: '#9ca3af' }}>
                  Connect ESP32 devices to start monitoring...
                </p>
              </div>
            ) : (
              <>
                {nodes.map(node => (
                  <ParkingStatusCard 
                    key={node.node_id}
                    nodeId={node.node_id}
                    location={node.location || undefined}
                    cameraVideoUrl={node.last_video_url || undefined}
                  />
                ))}
              </>
            )}
            
            {/* Phone Camera Streaming Modal */}
            {streamingNode && (
              <PhoneCameraStream 
                nodeId={streamingNode} 
                onClose={() => setStreamingNode(null)} 
              />
            )}
            
            {/* Violation Logs Modal */}
            {selectedNode && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}
              onClick={() => setSelectedNode(null)}
              >
                <div style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '24px',
                  maxWidth: '600px',
                  maxHeight: '80vh',
                  overflow: 'auto',
                  width: '90%'
                }}
                onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Violation History - {selectedNode}</h2>
                    <button
                      onClick={() => setSelectedNode(null)}
                      style={{ background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', padding: '8px 16px', cursor: 'pointer' }}
                    >
                      Close
                    </button>
                  </div>
                  
                  {violations.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>No violations recorded.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {violations.map(log => (
                        <div key={log.id} style={{
                          background: '#f9fafb',
                          padding: '16px',
                          borderRadius: '8px',
                          borderLeft: '4px solid #ef4444'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontWeight: 'bold', color: '#ef4444' }}>{log.violation_type}</span>
                            <span style={{ fontSize: '12px', color: '#6b7280' }}>
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p style={{ fontSize: '14px', color: '#374151' }}>{log.details}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ParkingProvider>
      <AppContent />
    </ParkingProvider>
  );
}
