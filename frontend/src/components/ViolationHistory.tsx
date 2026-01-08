import { useEffect, useState } from 'react';
import { fetchViolations, API_BASE } from '../services/api';
import './ViolationHistory.css';

interface Violation {
  id: number;
  node_id: string;
  violation_type: string;
  details: string | null;
  resolved: boolean;
  resolved_at: string | null;
  video_url: string | null;
  photo_path: string | null;
  photo_size: number | null;
  ml_confidence: number | null;
  created_at: string;
}

export function ViolationHistory() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [range, setRange] = useState<'today' | 'all'>('today');

  useEffect(() => {
    loadViolations();
    // Refresh every 30 seconds
    const interval = setInterval(loadViolations, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadViolations() {
    try {
      const data = await fetchViolations();
      setViolations(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load violations:', err);
      setLoading(false);
    }
  }

  const withinRange = (v: Violation) => {
    if (range === 'all') return true;
    const d = new Date(v.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString(); // same day
  };

  const statusOf = (v: Violation) => (v.resolved ? 'resolved' : 'pending');

  const filteredViolations = violations.filter(v => {
    if (!withinRange(v)) return false;
    if (filter === 'all') return true;
    if (filter === 'resolved') return v.resolved;
    if (filter === 'pending') return !v.resolved;
    return true;
  });

  const formatDate = (timestamp: string) => new Date(timestamp).toLocaleString();

  const getPhotoUrl = (photoPath: string | null) => {
    if (!photoPath) return null;
    const fileName = photoPath.split('/').pop();
    if (!fileName) return null;
    return `${API_BASE}/violations/${fileName}`;
  };

  if (loading) {
    return (
      <div className="violation-history">
        <div className="loading">Loading violation history...</div>
      </div>
    );
  }

  return (
    <div className="violation-history">
      <div className="history-header">
        <h1>🚨 Violation History</h1>
        <div className="stats">
          <div className="stat-card">
            <span className="stat-value">{violations.filter(withinRange).length}</span>
            <span className="stat-label">Total Violations</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{violations.filter(v => withinRange(v) && !v.resolved).length}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{violations.filter(v => withinRange(v) && v.resolved).length}</span>
            <span className="stat-label">Resolved</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{violations.filter(v => withinRange(v) && v.photo_path).length}</span>
            <span className="stat-label">With Photo</span>
          </div>
        </div>
      </div>

      <div className="filter-tabs" style={{ justifyContent: 'space-between' }}>
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({violations.filter(withinRange).length})
        </button>
        <button 
          className={filter === 'pending' ? 'active' : ''}
          onClick={() => setFilter('pending')}
        >
          Pending ({violations.filter(v => withinRange(v) && !v.resolved).length})
        </button>
        <button 
          className={filter === 'resolved' ? 'active' : ''}
          onClick={() => setFilter('resolved')}
        >
          Resolved ({violations.filter(v => withinRange(v) && v.resolved).length})
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className={range === 'today' ? 'active' : ''} onClick={() => setRange('today')}>Today</button>
          <button className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>All Time</button>
        </div>
      </div>

      <div className="violations-grid">
        {filteredViolations.length === 0 ? (
          <div className="empty-state">
            <p>No violations recorded yet</p>
          </div>
        ) : (
          filteredViolations.map(violation => (
            <div key={violation.id} className={`violation-card ${statusOf(violation)}`}>
              <div className="violation-photo">
                {violation.photo_path ? (
                  <img 
                    src={getPhotoUrl(violation.photo_path) || ''} 
                    alt="Violation evidence"
                    onClick={() => setSelectedPhoto(getPhotoUrl(violation.photo_path))}
                  />
                ) : (
                  <div className="no-photo">
                    <span>📷</span>
                    <p>No photo available</p>
                  </div>
                )}
              </div>
              
              <div className="violation-details">
                <div className="violation-header">
                  <span className="violation-id">#{violation.id}</span>
                  <span className={`status-badge ${statusOf(violation)}`}>
                    {statusOf(violation)}
                  </span>
                </div>
                
                <div className="violation-info">
                  <div className="info-row">
                    <span className="label">Node:</span>
                    <span className="value">{violation.node_id}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Time:</span>
                    <span className="value">{formatDate(violation.created_at)}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Type:</span>
                    <span className="value">{violation.violation_type}</span>
                  </div>
                  {violation.ml_confidence && (
                    <div className="info-row">
                      <span className="label">ML Confidence:</span>
                      <span className="value confidence">
                        {(violation.ml_confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {violation.photo_size && (
                    <div className="info-row">
                      <span className="label">Photo Size:</span>
                      <span className="value">
                        {(violation.photo_size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedPhoto && (
        <div className="photo-modal" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedPhoto(null)}>✕</button>
            <img src={selectedPhoto} alt="Violation evidence" />
          </div>
        </div>
      )}
    </div>
  );
}
