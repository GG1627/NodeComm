/**
 * WebSocket client for real-time communication with SynapseNet backend
 */

export interface SystemUpdate {
  type: "system_update";
  timestamp: string;
  components: HardwareComponent[];
  links: Link[];
  telemetry: TelemetryFrame;
  scorecard: Scorecard;
  simulation_running: boolean;
}

export interface HardwareComponent {
  id: string;
  name: string;
  component_type: string;
  status: string;
  utilization: number;
  temperature: number;
  power_draw: number;
  position: { x: number; y: number; z: number };
  specs: Record<string, any>;
}

export interface Link {
  id: string;
  name: string;
  source_id: string;
  target_id: string;
  link_type: string;
  status: string;
  latency_ms: number;
  bandwidth_gbps: number;
  max_bandwidth_gbps: number;
  max_latency_ms: number;
  utilization: number;
  error_rate: number;
}

export interface TelemetryFrame {
  timestamp: string;
  system_health: number;
  total_bandwidth: number;
  avg_latency: number;
  active_components: number;
  failed_components: number;
  chaos_events: number;
}

export interface Scorecard {
  resilience_score: number;
  uptime_percentage: number;
  avg_latency_ms: number;
  total_throughput_gbps: number;
  recovery_time_ms: number;
  actions_taken: number;
  ai_attacks_survived: number;
  // Astera-specific metrics (we'll get these from the metrics object)
  signal_integrity_score?: number;
  retimer_compensation_level?: number;
  smart_cable_health?: number;
  cxl_channel_utilization?: number;
}

export interface WebSocketMessage {
  type: string;
  timestamp?: string;
  [key: string]: any;
}

export class SynapseNetWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private listeners: Map<string, ((data: any) => void)[]> = new Map();
  private connectionState:
    | "connecting"
    | "connected"
    | "disconnected"
    | "error" = "disconnected";

  constructor(private url: string = "ws://localhost:8000/ws") {
    this.connect();
  }

  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.connectionState = "connecting";
    this.notifyListeners("connection_state", { state: "connecting" });

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected to SynapseNet backend");
        this.connectionState = "connected";
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.notifyListeners("connection_state", { state: "connected" });

        // Send ping to establish connection
        this.send({ type: "ping" });
      };

      this.ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      this.ws.onclose = () => {
        console.log("🔌 WebSocket connection closed");
        this.connectionState = "disconnected";
        this.notifyListeners("connection_state", { state: "disconnected" });
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        this.connectionState = "error";
        this.notifyListeners("connection_state", { state: "error", error });
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      this.connectionState = "error";
      this.notifyListeners("connection_state", { state: "error", error });
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms...`
    );

    setTimeout(() => {
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds
    }, this.reconnectDelay);
  }

  private handleMessage(data: WebSocketMessage) {
    switch (data.type) {
      case "system_update":
        this.notifyListeners("system_update", data as SystemUpdate);
        break;
      case "pong":
        this.notifyListeners("pong", data);
        break;
      case "simulation_started":
        this.notifyListeners("simulation_started", data);
        break;
      case "chaos_injected":
        this.notifyListeners("chaos_injected", data);
        break;
      default:
        console.log("Unknown message type:", data.type, data);
    }
  }

  private notifyListeners(event: string, data: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  public on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  public off(event: string, callback: (data: any) => void) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  public send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not connected, cannot send message:", message);
    }
  }

  public startSimulation() {
    this.send({ type: "start_simulation" });
  }

  public injectChaos() {
    this.send({ type: "inject_chaos" });
  }

  public getConnectionState() {
    return this.connectionState;
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectionState = "disconnected";
  }
}

// Singleton instance for the app
export const synapseNetWS = new SynapseNetWebSocket();
