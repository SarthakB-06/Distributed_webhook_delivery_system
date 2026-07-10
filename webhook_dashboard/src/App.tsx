import { useEffect, useState } from 'react';
import { Activity, RefreshCw, CheckCircle, XCircle, Clock, FileText, X } from 'lucide-react';

// const TENANT_ID = 'PASTE_YOUR_EXACT_UUID_HERE'; 
const TENANT_ID = '78eb6cc4-c2af-47e3-938a-1ccb71a57910'; 


type Delivery = {
  id: string;
  status: string;
  attemptCount: number;
  endpointId: string;
};

type WebhookEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  deliveries: Delivery[];
};

type Attempt = {
  id: string;
  attemptNumber: number;
  responseStatus: number | null;
  errorMessage: string | null;
  responseBody: string | null;
  attemptedAt: string;
  delivery: {
    endpoint: {
      url: string;
    };
  };
};

export default function App() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  const fetchEvents = async () => {
    try {
      const response = await fetch('http://localhost:4000/events?limit=10', {
        headers: { 'x-tenant-id': TENANT_ID }
      });
      const data = await response.json();
      setEvents(data);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRedrive = async (deliveryId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/deliveries/${deliveryId}/redrive`, {
        method: 'POST',
        headers: { 'x-tenant-id': TENANT_ID }
      });
      
      if (response.ok) {
        fetchEvents(); 
      } else {
        const err = await response.json();
        alert(`Redrive failed: ${err.error}`);
      }
    } catch (error) {
      console.error('Redrive request failed:', error);
    }
  };

  const handleViewLogs = async (eventId: string) => {
    setSelectedEventId(eventId);
    setLoadingAttempts(true);
    try {
      const response = await fetch(`http://localhost:4000/events/${eventId}/attempts`, {
        headers: { 'x-tenant-id': TENANT_ID }
      });
      const data = await response.json();
      setAttempts(data);
    } catch (error) {
      console.error('Failed to fetch attempts:', error);
    } finally {
      setLoadingAttempts(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'pending': return <Clock className="w-5 h-5 text-yellow-500 animate-pulse" />;
      default: return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto relative">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Webhook Deliveries</h1>
          <p className="text-gray-500 mt-1">Live event ingestion and delivery monitoring</p>
        </div>
        <button 
          onClick={fetchEvents}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading events...</div>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Event ID</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Type</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Attempts</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">
                    {event.id.substring(0, 8)}...
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {event.eventType}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(event.deliveries[0]?.status)}
                      <span className="text-sm capitalize font-medium text-gray-700">
                        {event.deliveries[0]?.status || 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {event.deliveries[0]?.attemptCount || 0}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleViewLogs(event.id)}
                        className="flex items-center gap-1 text-sm px-3 py-1 bg-gray-100 text-gray-700 font-semibold rounded hover:bg-gray-200 transition-colors"
                      >
                        <FileText className="w-4 h-4" /> Logs
                      </button>
                      
                      {event.deliveries[0]?.status === 'failed' && (
                        <button
                          onClick={() => handleRedrive(event.deliveries[0].id)}
                          className="text-sm px-3 py-1 bg-indigo-50 text-indigo-700 font-semibold rounded hover:bg-indigo-100 transition-colors"
                        >
                          Redrive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Overlay for Logs */}
      {selectedEventId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Delivery Logs</h2>
                <p className="text-sm text-gray-500 font-mono mt-1">Event: {selectedEventId}</p>
              </div>
              <button 
                onClick={() => setSelectedEventId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {loadingAttempts ? (
                <div className="text-center py-8 text-gray-500">Loading timeline...</div>
              ) : attempts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No logs found for this event.</div>
              ) : (
                <div className="space-y-6">
                  {attempts.map((attempt) => (
                    <div key={attempt.id} className="relative pl-6 border-l-2 border-gray-200">
                      <div className={`absolute -left-2.25 top-0 w-4 h-4 rounded-full border-2 border-white ${attempt.responseStatus && attempt.responseStatus < 300 ? 'bg-green-500' : 'bg-red-500'}`} />
                      
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-gray-900">
                          Attempt {attempt.attemptNumber}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(attempt.attemptedAt).toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="bg-gray-50 rounded-md p-3 text-sm font-mono mt-2">
                        <div className="text-gray-600 mb-1">URL: {attempt.delivery.endpoint.url}</div>
                        {attempt.responseStatus && (
                          <div className={attempt.responseStatus < 300 ? 'text-green-600' : 'text-red-600'}>
                            Status: HTTP {attempt.responseStatus}
                          </div>
                        )}
                        {attempt.errorMessage && (
                          <div className="text-red-600 mt-1">Error: {attempt.errorMessage}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}