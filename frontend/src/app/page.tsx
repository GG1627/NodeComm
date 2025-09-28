"use client";

import { useEffect, useState } from "react";
import {
  synapseNetWS,
  SystemUpdate,
  HardwareComponent,
  Link,
  Scorecard,
} from "../lib/websocket";

export default function Home() {
  const [systemData, setSystemData] = useState<SystemUpdate | null>(null);
  const [connectionState, setConnectionState] =
    useState<string>("disconnected");
  const [simulationRunning, setSimulationRunning] = useState(false);

  useEffect(() => {
    // Set up WebSocket listeners
    synapseNetWS.on("connection_state", (data) => {
      setConnectionState(data.state);
    });

    synapseNetWS.on("system_update", (data: SystemUpdate) => {
      setSystemData(data);
      setSimulationRunning(data.simulation_running);
    });

    synapseNetWS.on("simulation_started", () => {
      setSimulationRunning(true);
    });

    // Cleanup on unmount
    return () => {
      synapseNetWS.disconnect();
    };
  }, []);

  const handleStartSimulation = () => {
    synapseNetWS.startSimulation();
  };

  const handleInjectChaos = () => {
    synapseNetWS.injectChaos();
  };

  // Get live data or use defaults
  const resilience = systemData?.scorecard?.resilience_score ?? 87;
  const isOnline = connectionState === "connected";
  const components = systemData?.components ?? [];
  const links = systemData?.links ?? [];
  const scorecard = systemData?.scorecard;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800/50 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-wide text-white">
            SynapseNet
          </h1>
          <div className="flex items-center space-x-8">
            <div className="text-sm font-medium">
              <span className="text-zinc-400">Resilience</span>
              <span className="text-emerald-400 font-semibold ml-3">
                {Math.round(resilience)}%
              </span>
            </div>
            <div className="text-sm font-medium">
              <span className="text-zinc-400">Status</span>
              <div className="inline-flex items-center ml-3">
                <div
                  className={`w-2 h-2 rounded-full mr-2 ${
                    isOnline ? "bg-emerald-400" : "bg-red-400"
                  }`}
                ></div>
                <span className="text-white">
                  {isOnline ? "Online" : "Offline"}
                </span>
              </div>
            </div>
            <div className="text-sm font-medium">
              <span className="text-zinc-400">Simulation</span>
              <div className="inline-flex items-center ml-3">
                <div
                  className={`w-2 h-2 rounded-full mr-2 ${
                    simulationRunning ? "bg-blue-400" : "bg-gray-400"
                  }`}
                ></div>
                <span className="text-white">
                  {simulationRunning ? "Running" : "Stopped"}
                </span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex space-x-2">
              <button
                onClick={handleStartSimulation}
                disabled={!isOnline || simulationRunning}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded-md transition-colors"
              >
                Start Sim
              </button>
              <button
                onClick={handleInjectChaos}
                disabled={!isOnline || !simulationRunning}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded-md transition-colors"
              >
                Inject Chaos
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-screen">
        {/* Left Sidebar - Connectivity Health */}
        <div className="w-80 bg-zinc-900/30 backdrop-blur-sm border-r border-zinc-800/30 p-6 overflow-y-auto">
          <h2 className="text-lg font-light mb-6 text-zinc-200 tracking-wide">
            Connectivity Health
          </h2>

          {/* PCIe Retimer Status */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-5 mb-4 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">PCIe Retimer</h3>
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            </div>
            <div className="text-xs text-zinc-500 mb-2">
              Aries Signal Processor
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Signal Quality</span>
                <span className="text-emerald-400 font-medium">
                  {scorecard?.signal_integrity_score
                    ? `${Math.round(scorecard.signal_integrity_score)}%`
                    : "Excellent"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Compensation</span>
                <span className="text-white font-medium">
                  {scorecard?.retimer_compensation_level
                    ? `${Math.round(
                        scorecard.retimer_compensation_level
                      )}% Applied`
                    : "15% Applied"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Link Distance</span>
                <span className="text-white font-medium">2.5m Extended</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Error Rate</span>
                <span className="text-emerald-400 font-medium">
                  {systemData?.telemetry
                    ? `${(Math.random() * 0.05).toFixed(3)}%`
                    : "0.01%"}
                </span>
              </div>
            </div>
          </div>

          {/* Smart Cable Module */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-5 mb-4 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">Smart Cable Module</h3>
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            </div>
            <div className="text-xs text-zinc-500 mb-2">
              Taurus Intelligent Cable
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Bandwidth Usage</span>
                <span className="text-white font-medium">
                  {systemData?.telemetry?.total_bandwidth
                    ? `${Math.round(systemData.telemetry.total_bandwidth)} GB/s`
                    : "85 GB/s"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Cable Health</span>
                <span className="text-emerald-400 font-medium">
                  {scorecard?.smart_cable_health
                    ? `${Math.round(scorecard.smart_cable_health)}%`
                    : "Excellent"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Thermal Status</span>
                <span className="text-white font-medium">Normal</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Link Monitoring</span>
                <span className="text-emerald-400 font-medium">Active</span>
              </div>
            </div>
          </div>

          {/* CXL Memory Controller */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-5 mb-4 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">CXL Memory Controller</h3>
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            </div>
            <div className="text-xs text-zinc-500 mb-2">
              Leo Memory Platform
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Memory Pools</span>
                <span className="text-white font-medium">3 Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Channel Usage</span>
                <span className="text-white font-medium">
                  {scorecard?.cxl_channel_utilization
                    ? `${Math.round(scorecard.cxl_channel_utilization)}%`
                    : "45%"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Pool Access</span>
                <span className="text-emerald-400 font-medium">
                  64GB Available
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">CXL Protocol</span>
                <span className="text-emerald-400 font-medium">3.0 Active</span>
              </div>
            </div>
          </div>

          {/* Connectivity Fabric */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-5 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">Connectivity Fabric</h3>
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            </div>
            <div className="text-xs text-zinc-500 mb-2">
              Overall System Health
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Signal Integrity</span>
                <span className="text-emerald-400 font-medium">95%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Traffic Flow</span>
                <span className="text-white font-medium">Optimal</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Link Redundancy</span>
                <span className="text-emerald-400 font-medium">Available</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Node Visualization Area */}
          <div className="flex-1 bg-zinc-950 relative overflow-hidden">
            <div className="absolute top-4 left-4 bg-zinc-900/80 backdrop-blur-sm rounded-lg px-3 py-1 border border-zinc-700/50">
              <span className="text-sm font-medium text-zinc-200">
                Live Data Center Topology
              </span>
            </div>

            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 800 600"
            >
              {/* Realistic Data Center Connections */}
              <g className="opacity-60">
                {/* CPU Cluster 1 */}
                <line
                  x1="150"
                  y1="100"
                  x2="250"
                  y2="100"
                  stroke="rgb(52 211 153)"
                  strokeWidth="3"
                />
                <line
                  x1="150"
                  y1="100"
                  x2="200"
                  y2="180"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                />

                {/* CPU Cluster 2 */}
                <line
                  x1="550"
                  y1="100"
                  x2="650"
                  y2="100"
                  stroke="rgb(52 211 153)"
                  strokeWidth="3"
                />
                <line
                  x1="550"
                  y1="100"
                  x2="600"
                  y2="180"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                />

                {/* Central Fabric Connections */}
                <line
                  x1="200"
                  y1="180"
                  x2="400"
                  y2="250"
                  stroke="rgb(59 130 246)"
                  strokeWidth="4"
                />
                <line
                  x1="600"
                  y1="180"
                  x2="400"
                  y2="250"
                  stroke="rgb(59 130 246)"
                  strokeWidth="4"
                />

                {/* GPU Clusters */}
                <line
                  x1="400"
                  y1="250"
                  x2="150"
                  y2="350"
                  stroke="rgb(168 85 247)"
                  strokeWidth="3"
                />
                <line
                  x1="400"
                  y1="250"
                  x2="250"
                  y2="350"
                  stroke="rgb(168 85 247)"
                  strokeWidth="3"
                />
                <line
                  x1="400"
                  y1="250"
                  x2="550"
                  y2="350"
                  stroke="rgb(168 85 247)"
                  strokeWidth="3"
                />
                <line
                  x1="400"
                  y1="250"
                  x2="650"
                  y2="350"
                  stroke="rgb(168 85 247)"
                  strokeWidth="3"
                />

                {/* Storage Tier */}
                <line
                  x1="150"
                  y1="350"
                  x2="150"
                  y2="450"
                  stroke="rgb(245 158 11)"
                  strokeWidth="2"
                />
                <line
                  x1="250"
                  y1="350"
                  x2="250"
                  y2="450"
                  stroke="rgb(245 158 11)"
                  strokeWidth="2"
                />
                <line
                  x1="550"
                  y1="350"
                  x2="550"
                  y2="450"
                  stroke="rgb(245 158 11)"
                  strokeWidth="2"
                />
                <line
                  x1="650"
                  y1="350"
                  x2="650"
                  y2="450"
                  stroke="rgb(245 158 11)"
                  strokeWidth="2"
                />

                {/* Cross-connections for redundancy */}
                <line
                  x1="150"
                  y1="350"
                  x2="250"
                  y2="350"
                  stroke="rgb(52 211 153)"
                  strokeWidth="1"
                  className="opacity-40"
                />
                <line
                  x1="550"
                  y1="350"
                  x2="650"
                  y2="350"
                  stroke="rgb(52 211 153)"
                  strokeWidth="1"
                  className="opacity-40"
                />
                <line
                  x1="150"
                  y1="450"
                  x2="650"
                  y2="450"
                  stroke="rgb(245 158 11)"
                  strokeWidth="1"
                  className="opacity-30"
                />
              </g>

              {/* Realistic Data Center Nodes */}
              <g>
                {/* CPU Tier */}
                <g className="cursor-pointer group">
                  <circle
                    cx="150"
                    cy="100"
                    r="18"
                    fill="rgb(52 211 153)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="150"
                    cy="100"
                    r="14"
                    fill="rgb(6 78 59)"
                    className="opacity-80"
                  />
                  <text
                    x="150"
                    y="80"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    CPU1
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="70"
                    y="20"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-emerald-400">
                        Intel Xeon Platinum 8480+
                      </div>
                      <div className="text-zinc-300">56 cores, 2.0-3.8 GHz</div>
                      <div className="text-zinc-400">350W TDP, PCIe 5.0</div>
                      <div className="text-zinc-400">Aries Retimer Enabled</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="250"
                    cy="100"
                    r="16"
                    fill="rgb(34 197 94)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="250"
                    cy="100"
                    r="12"
                    fill="rgb(21 128 61)"
                    className="opacity-80"
                  />
                  <text
                    x="250"
                    y="80"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    MEM1
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="170"
                    y="20"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-green-400">
                        Samsung DDR5-5600
                      </div>
                      <div className="text-zinc-300">128GB RDIMM, ECC</div>
                      <div className="text-zinc-400">CXL 3.0 Compatible</div>
                      <div className="text-zinc-400">Leo Controller</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="550"
                    cy="100"
                    r="18"
                    fill="rgb(52 211 153)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="550"
                    cy="100"
                    r="14"
                    fill="rgb(6 78 59)"
                    className="opacity-80"
                  />
                  <text
                    x="550"
                    y="80"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    CPU2
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="470"
                    y="20"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-emerald-400">
                        Intel Xeon Platinum 8480+
                      </div>
                      <div className="text-zinc-300">56 cores, 2.0-3.8 GHz</div>
                      <div className="text-zinc-400">350W TDP, PCIe 5.0</div>
                      <div className="text-zinc-400">Aries Retimer Enabled</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="650"
                    cy="100"
                    r="16"
                    fill="rgb(34 197 94)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="650"
                    cy="100"
                    r="12"
                    fill="rgb(21 128 61)"
                    className="opacity-80"
                  />
                  <text
                    x="650"
                    y="80"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    MEM2
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="570"
                    y="20"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-green-400">
                        Samsung DDR5-5600
                      </div>
                      <div className="text-zinc-300">128GB RDIMM, ECC</div>
                      <div className="text-zinc-400">CXL 3.0 Compatible</div>
                      <div className="text-zinc-400">Leo Controller</div>
                    </div>
                  </foreignObject>
                </g>

                {/* Switch Tier */}
                <g className="cursor-pointer group">
                  <circle
                    cx="200"
                    cy="180"
                    r="16"
                    fill="rgb(59 130 246)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="200"
                    cy="180"
                    r="12"
                    fill="rgb(29 78 216)"
                    className="opacity-80"
                  />
                  <text
                    x="200"
                    y="160"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    SW1
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="120"
                    y="100"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-blue-400">
                        Broadcom Tomahawk 5
                      </div>
                      <div className="text-zinc-300">51.2Tbps, 128x400G</div>
                      <div className="text-zinc-400">PCIe 5.0, CXL Ready</div>
                      <div className="text-zinc-400">Taurus Smart Cable</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="600"
                    cy="180"
                    r="16"
                    fill="rgb(59 130 246)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="600"
                    cy="180"
                    r="12"
                    fill="rgb(29 78 216)"
                    className="opacity-80"
                  />
                  <text
                    x="600"
                    y="160"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    SW2
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="520"
                    y="100"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-blue-400">
                        Broadcom Tomahawk 5
                      </div>
                      <div className="text-zinc-300">51.2Tbps, 128x400G</div>
                      <div className="text-zinc-400">PCIe 5.0, CXL Ready</div>
                      <div className="text-zinc-400">Taurus Smart Cable</div>
                    </div>
                  </foreignObject>
                </g>

                {/* Central Fabric Controller */}
                <g className="cursor-pointer group">
                  <circle
                    cx="400"
                    cy="250"
                    r="22"
                    fill="rgb(156 163 175)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="400"
                    cy="250"
                    r="18"
                    fill="rgb(107 114 128)"
                    className="opacity-80"
                  />
                  <text
                    x="400"
                    y="230"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    FABRIC
                  </text>
                  <text
                    x="400"
                    y="275"
                    textAnchor="middle"
                    className="text-xs fill-zinc-400 font-light"
                  >
                    Astera Hub
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="320"
                    y="170"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-gray-400">
                        Astera Connectivity Hub
                      </div>
                      <div className="text-zinc-300">Multi-protocol fabric</div>
                      <div className="text-zinc-400">PCIe/CXL/Ethernet</div>
                      <div className="text-zinc-400">Scorpio Switch Core</div>
                    </div>
                  </foreignObject>
                </g>

                {/* GPU Compute Tier */}
                <g className="cursor-pointer group">
                  <circle
                    cx="150"
                    cy="350"
                    r="18"
                    fill="rgb(168 85 247)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="150"
                    cy="350"
                    r="14"
                    fill="rgb(126 34 206)"
                    className="opacity-80"
                  />
                  <text
                    x="150"
                    y="330"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    GPU1
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="70"
                    y="270"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-purple-400">
                        NVIDIA H100 SXM5
                      </div>
                      <div className="text-zinc-300">
                        80GB HBM3, 3.35 TFLOPS
                      </div>
                      <div className="text-zinc-400">700W, NVLink 4.0</div>
                      <div className="text-zinc-400">Smart Cable Connected</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="250"
                    cy="350"
                    r="18"
                    fill="rgb(168 85 247)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="250"
                    cy="350"
                    r="14"
                    fill="rgb(126 34 206)"
                    className="opacity-80"
                  />
                  <text
                    x="250"
                    y="330"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    GPU2
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="170"
                    y="270"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-purple-400">
                        NVIDIA H100 SXM5
                      </div>
                      <div className="text-zinc-300">
                        80GB HBM3, 3.35 TFLOPS
                      </div>
                      <div className="text-zinc-400">700W, NVLink 4.0</div>
                      <div className="text-zinc-400">Smart Cable Connected</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="550"
                    cy="350"
                    r="18"
                    fill="rgb(168 85 247)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="550"
                    cy="350"
                    r="14"
                    fill="rgb(126 34 206)"
                    className="opacity-80"
                  />
                  <text
                    x="550"
                    y="330"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    GPU3
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="470"
                    y="270"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-purple-400">
                        NVIDIA H100 SXM5
                      </div>
                      <div className="text-zinc-300">
                        80GB HBM3, 3.35 TFLOPS
                      </div>
                      <div className="text-zinc-400">700W, NVLink 4.0</div>
                      <div className="text-zinc-400">Smart Cable Connected</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="650"
                    cy="350"
                    r="18"
                    fill="rgb(168 85 247)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="650"
                    cy="350"
                    r="14"
                    fill="rgb(126 34 206)"
                    className="opacity-80"
                  />
                  <text
                    x="650"
                    y="330"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    GPU4
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="570"
                    y="270"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-purple-400">
                        NVIDIA H100 SXM5
                      </div>
                      <div className="text-zinc-300">
                        80GB HBM3, 3.35 TFLOPS
                      </div>
                      <div className="text-zinc-400">700W, NVLink 4.0</div>
                      <div className="text-zinc-400">Smart Cable Connected</div>
                    </div>
                  </foreignObject>
                </g>

                {/* Storage Tier */}
                <g className="cursor-pointer group">
                  <circle
                    cx="150"
                    cy="450"
                    r="14"
                    fill="rgb(245 158 11)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="150"
                    cy="450"
                    r="10"
                    fill="rgb(180 83 9)"
                    className="opacity-80"
                  />
                  <text
                    x="150"
                    y="475"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    SSD1
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="70"
                    y="370"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-amber-400">
                        Samsung PM9A3
                      </div>
                      <div className="text-zinc-300">7.68TB NVMe, 7000MB/s</div>
                      <div className="text-zinc-400">
                        PCIe 4.0 x4, Enterprise
                      </div>
                      <div className="text-zinc-400">Retimer Extended</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="250"
                    cy="450"
                    r="14"
                    fill="rgb(245 158 11)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="250"
                    cy="450"
                    r="10"
                    fill="rgb(180 83 9)"
                    className="opacity-80"
                  />
                  <text
                    x="250"
                    y="475"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    SSD2
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="170"
                    y="370"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-amber-400">
                        Samsung PM9A3
                      </div>
                      <div className="text-zinc-300">7.68TB NVMe, 7000MB/s</div>
                      <div className="text-zinc-400">
                        PCIe 4.0 x4, Enterprise
                      </div>
                      <div className="text-zinc-400">Retimer Extended</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="550"
                    cy="450"
                    r="14"
                    fill="rgb(245 158 11)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="550"
                    cy="450"
                    r="10"
                    fill="rgb(180 83 9)"
                    className="opacity-80"
                  />
                  <text
                    x="550"
                    y="475"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    SSD3
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="470"
                    y="370"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-amber-400">
                        Samsung PM9A3
                      </div>
                      <div className="text-zinc-300">7.68TB NVMe, 7000MB/s</div>
                      <div className="text-zinc-400">
                        PCIe 4.0 x4, Enterprise
                      </div>
                      <div className="text-zinc-400">Retimer Extended</div>
                    </div>
                  </foreignObject>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="650"
                    cy="450"
                    r="14"
                    fill="rgb(245 158 11)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="650"
                    cy="450"
                    r="10"
                    fill="rgb(180 83 9)"
                    className="opacity-80"
                  />
                  <text
                    x="650"
                    y="475"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    SSD4
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x="570"
                    y="370"
                    width="160"
                    height="100"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-amber-400">
                        Samsung PM9A3
                      </div>
                      <div className="text-zinc-300">7.68TB NVMe, 7000MB/s</div>
                      <div className="text-zinc-400">
                        PCIe 4.0 x4, Enterprise
                      </div>
                      <div className="text-zinc-400">Retimer Extended</div>
                    </div>
                  </foreignObject>
                </g>

                {/* Network Controllers */}
                <g className="cursor-pointer group">
                  <circle
                    cx="100"
                    cy="250"
                    r="12"
                    fill="rgb(16 185 129)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="100"
                    cy="250"
                    r="8"
                    fill="rgb(5 150 105)"
                    className="opacity-80"
                  />
                  <text
                    x="100"
                    y="235"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    NIC1
                  </text>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx="700"
                    cy="250"
                    r="12"
                    fill="rgb(16 185 129)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="700"
                    cy="250"
                    r="8"
                    fill="rgb(5 150 105)"
                    className="opacity-80"
                  />
                  <text
                    x="700"
                    y="235"
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    NIC2
                  </text>
                </g>
              </g>

              {/* Data Flow Particles */}
              <g className="opacity-70">
                <circle r="2" fill="rgb(52 211 153)" className="animate-pulse">
                  <animateMotion
                    dur="3s"
                    repeatCount="indefinite"
                    path="M150,100 L400,250"
                  />
                </circle>
                <circle r="2" fill="rgb(59 130 246)" className="animate-pulse">
                  <animateMotion
                    dur="4s"
                    repeatCount="indefinite"
                    path="M400,250 L550,350"
                  />
                </circle>
                <circle r="2" fill="rgb(168 85 247)" className="animate-pulse">
                  <animateMotion
                    dur="2.5s"
                    repeatCount="indefinite"
                    path="M550,350 L550,450"
                  />
                </circle>
                <circle r="2" fill="rgb(245 158 11)" className="animate-pulse">
                  <animateMotion
                    dur="3.5s"
                    repeatCount="indefinite"
                    path="M650,100 L650,450"
                  />
                </circle>
              </g>
            </svg>

            {/* ML Predictions Overlay */}
            <div className="absolute top-6 right-6 bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-zinc-700/30">
              <h3 className="text-zinc-200 font-medium mb-3 flex items-center">
                <span className="mr-2">🤖</span>
                ML Predictions
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
                  <span className="text-white">
                    PCIe retimer compensation increasing
                  </span>
                </div>
                <div className="text-xs text-zinc-400 ml-5">
                  Confidence: 87% • Signal degradation detected
                </div>
                <div className="flex items-center space-x-3 mt-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-white">
                    CXL memory pool rebalancing needed
                  </span>
                </div>
                <div className="text-xs text-zinc-400 ml-5">
                  Confidence: 92% • Optimize traffic distribution
                </div>
              </div>
            </div>

            {/* Data Center Info */}
            <div className="absolute bottom-6 right-6 bg-zinc-900/60 backdrop-blur-sm rounded-xl p-4 border border-zinc-700/30">
              <h3 className="text-sm font-medium text-zinc-200 mb-2">
                Data Center Topology
              </h3>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400">CPU Clusters:</span>
                  <span className="text-emerald-400">2 Active</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">GPU Pool:</span>
                  <span className="text-white">4 H100s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Fabric Health:</span>
                  <span className="text-emerald-400">Optimal</span>
                </div>
              </div>
            </div>
          </div>

          {/* Network Stats Overlay */}
          <div className="bg-zinc-900/50 backdrop-blur-sm border-t border-zinc-800/30 p-4">
            <div className="flex justify-between items-center">
              <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-4 border border-zinc-700/30">
                <h3 className="text-sm font-medium text-zinc-200 mb-2">
                  Connectivity Health
                </h3>
                <div className="text-xs space-y-1 flex space-x-6">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">PCIe Links:</span>
                    <span className="text-emerald-400 ml-2">
                      {systemData
                        ? `${systemData.components.length}/${systemData.components.length} Active`
                        : "16/16 Active"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">CXL Bandwidth:</span>
                    <span className="text-white ml-2">
                      {systemData?.telemetry?.total_bandwidth
                        ? `${Math.round(
                            systemData.telemetry.total_bandwidth
                          )} GB/s`
                        : "51.2 GB/s"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Signal Quality:</span>
                    <span className="text-emerald-400 ml-2">
                      {scorecard?.signal_integrity_score
                        ? `${Math.round(scorecard.signal_integrity_score)}%`
                        : "Excellent"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-4 border border-zinc-700/30">
                <h3 className="text-zinc-200 font-medium mb-2 flex items-center">
                  <span className="mr-2">🤖</span>
                  System Status
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                    <span className="text-white text-xs">
                      All systems operational
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-white text-xs">
                      Ready for FastAPI integration
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Panel - Gesture & Controls */}
          <div className="h-32 bg-zinc-900/50 backdrop-blur-sm border-t border-zinc-800/30 p-6">
            <div className="flex items-center justify-between h-full">
              {/* Gesture Status */}
              <div className="flex items-center space-x-8">
                <div>
                  <h3 className="text-sm font-medium text-zinc-200 mb-2">
                    Gesture Recognition
                  </h3>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                    <span className="text-sm text-white">Camera Active</span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    Current:{" "}
                    <span className="text-white font-medium">NONE</span> •
                    Confidence: 0%
                  </div>
                </div>

                {/* Gesture Controls */}
                <div className="grid grid-cols-4 gap-4 text-center text-xs">
                  <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                    <div className="text-lg mb-1">✂️</div>
                    <div className="text-white font-medium text-xs">
                      ISOLATE LINK
                    </div>
                    <div className="text-zinc-400 text-xs">Scissors</div>
                  </div>
                  <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                    <div className="text-lg mb-1">✊</div>
                    <div className="text-white font-medium text-xs">
                      RETIMER BOOST
                    </div>
                    <div className="text-zinc-400 text-xs">Fist</div>
                  </div>
                  <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                    <div className="text-lg mb-1">✋</div>
                    <div className="text-white font-medium text-xs">
                      REROUTE TRAFFIC
                    </div>
                    <div className="text-zinc-400 text-xs">Palm</div>
                  </div>
                  <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                    <div className="text-lg mb-1">🙌</div>
                    <div className="text-white font-medium text-xs">
                      ENABLE BACKUP
                    </div>
                    <div className="text-zinc-400 text-xs">Both Hands</div>
                  </div>
                </div>
              </div>

              {/* Action Log */}
              <div className="w-64">
                <h3 className="text-sm font-medium text-zinc-200 mb-3">
                  Recent Actions
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">12:34:56</span>
                    <span className="text-white">✊ Retimer boosted</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">12:34:23</span>
                    <span className="text-amber-400">
                      🤖 Smart cable thermal alert
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">12:33:45</span>
                    <span className="text-white">✋ Traffic rerouted</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">12:33:12</span>
                    <span className="text-emerald-400">
                      ✅ CXL pool balanced
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
