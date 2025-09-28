"use client";

import { useEffect, useState } from "react";
import {
  synapseNetWS,
  SystemUpdate,
  HardwareComponent,
  Link,
  Scorecard,
  TelemetryFrame,
} from "../lib/websocket";

export default function Home() {
  const [systemData, setSystemData] = useState<SystemUpdate | null>(null);
  const [connectionState, setConnectionState] =
    useState<string>("disconnected");
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [chaosInjected, setChaosInjected] = useState(false);
  const [isHealing, setIsHealing] = useState(false);
  const [currentMode, setCurrentMode] = useState<"learn" | "game">("learn");

  useEffect(() => {
    // Set up WebSocket listeners
    synapseNetWS.on("connection_state", (data) => {
      setConnectionState(data.state);
    });

    synapseNetWS.on("system_update", (data: SystemUpdate) => {
      setSystemData(data);
      setSimulationRunning(data.simulation_running);

      // Detect if system is healing (has failed/degraded components but not all failed)
      const hasFailedComponents = data.components.some(
        (comp) => comp.status === "failed"
      );
      const hasDegradedComponents = data.components.some(
        (comp) => comp.status === "degraded"
      );
      const hasHealthyComponents = data.components.some(
        (comp) => comp.status === "healthy"
      );

      // System is healing if it has some failed/degraded components but also some healthy ones
      const healing =
        (hasFailedComponents || hasDegradedComponents) && hasHealthyComponents;
      setIsHealing(healing);
    });

    synapseNetWS.on("simulation_started", () => {
      setSimulationRunning(true);
    });

    synapseNetWS.on("simulation_stopped", () => {
      setSimulationRunning(false);
    });

    synapseNetWS.on("chaos_injected", () => {
      setChaosInjected(true);
      // Reset after 3 seconds
      setTimeout(() => setChaosInjected(false), 3000);
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
    console.log("🔥 Injecting chaos...");
    synapseNetWS.injectChaos();
  };

  const handleStopSimulation = () => {
    console.log("⏹️ Stopping simulation...");
    synapseNetWS.stopSimulation();
  };

  // Get live data or use defaults
  const resilience = systemData?.scorecard?.resilience_score ?? 87;
  const isOnline = connectionState === "connected";
  const components = systemData?.components ?? [];
  const links = systemData?.links ?? [];

  // Dynamic color functions for metrics
  const getStatusColor = (
    value: number,
    thresholds = { good: 80, warning: 50 }
  ) => {
    if (value >= thresholds.good) return "bg-emerald-400";
    if (value >= thresholds.warning) return "bg-yellow-400";
    return "bg-red-400";
  };

  const getTextColor = (
    value: number,
    thresholds = { good: 80, warning: 50 }
  ) => {
    if (value >= thresholds.good) return "text-emerald-400";
    if (value >= thresholds.warning) return "text-yellow-400";
    return "text-red-400";
  };

  // Reverse color functions for metrics where HIGH = BAD
  const getBadStatusColor = (
    value: number,
    thresholds = { bad: 80, warning: 50 }
  ) => {
    if (value >= thresholds.bad) return "bg-red-400";
    if (value >= thresholds.warning) return "bg-yellow-400";
    return "bg-emerald-400";
  };

  const getBadTextColor = (
    value: number,
    thresholds = { bad: 80, warning: 50 }
  ) => {
    if (value >= thresholds.bad) return "text-red-400";
    if (value >= thresholds.warning) return "text-yellow-400";
    return "text-emerald-400";
  };
  const scorecard = systemData?.scorecard;

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-white">
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

            {/* Mode Selector */}
            <div className="flex items-center space-x-4">
              <div className="flex bg-zinc-800/50 rounded-lg p-1">
                <button
                  onClick={() => setCurrentMode("learn")}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    currentMode === "learn"
                      ? "bg-blue-600 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  🎓 Learn Mode
                </button>
                <button
                  onClick={() => setCurrentMode("game")}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    currentMode === "game"
                      ? "bg-blue-600 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  🎮 Game Mode
                </button>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex space-x-2">
              {!simulationRunning ? (
                <button
                  onClick={handleStartSimulation}
                  disabled={!isOnline}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded-md transition-colors cursor-pointer"
                >
                  Start Sim
                </button>
              ) : (
                <button
                  onClick={handleStopSimulation}
                  disabled={!isOnline}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded-md transition-colors cursor-pointer"
                >
                  Stop Sim
                </button>
              )}
              <button
                onClick={handleInjectChaos}
                disabled={!isOnline || !simulationRunning}
                className={`px-3 py-1 text-white text-xs rounded-md transition-colors cursor-pointer ${
                  chaosInjected
                    ? "bg-orange-600 hover:bg-orange-700"
                    : currentMode === "learn"
                    ? "bg-red-600 hover:bg-red-700 animate-pulse"
                    : "bg-red-600 hover:bg-red-700"
                } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                title={
                  currentMode === "learn"
                    ? "Click to simulate system failures and watch AI self-healing in action!"
                    : "Inject chaos into the system"
                }
              >
                {chaosInjected
                  ? "Chaos Active!"
                  : currentMode === "learn"
                  ? "🔥 Try Chaos!"
                  : "Inject Chaos"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-screen overflow-hidden">
        {/* Left Sidebar - Connectivity Health */}
        <div className="w-72 lg:w-80 xl:w-80 bg-zinc-900/30 backdrop-blur-sm border-r border-zinc-800/30 p-4 2xl:p-4 overflow-y-auto custom-scrollbar">
          <h2 className="text-lg font-light mb-3 2xl:mb-4 text-zinc-200 tracking-wide">
            Connectivity Health
          </h2>

          {/* PCIe Retimer Status */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 2xl:p-4 mb-2 2xl:mb-3 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-sm 2xl:text-base font-medium text-white">
                PCIe Retimer
              </h3>
              <div
                className={`w-2 h-2 rounded-full ${getStatusColor(
                  scorecard?.signal_integrity_score ?? 87
                )}`}
              ></div>
            </div>
            <div className="text-xs text-zinc-500 mb-0.5">
              Aries Signal Processor
            </div>
            <div className="space-y-0.5 text-sm 2xl:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Signal Quality</span>
                <span
                  className={`font-medium ${getTextColor(
                    scorecard?.signal_integrity_score ?? 87
                  )}`}
                >
                  {scorecard?.signal_integrity_score
                    ? `${Math.round(scorecard.signal_integrity_score)}%`
                    : "87%"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Compensation</span>
                <span
                  className={`font-medium ${getBadTextColor(
                    scorecard?.retimer_compensation_level ?? 15,
                    { bad: 50, warning: 30 }
                  )}`}
                >
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
                <span
                  className={`font-medium ${getBadTextColor(
                    systemData?.telemetry?.avg_error_rate ?? 0.01,
                    { bad: 5, warning: 1 }
                  )}`}
                >
                  {systemData?.telemetry?.avg_error_rate
                    ? `${systemData.telemetry.avg_error_rate.toFixed(3)}%`
                    : "0.01%"}
                </span>
              </div>
            </div>
          </div>

          {/* Smart Cable Module */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 2xl:p-4 mb-2 2xl:mb-3 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-sm 2xl:text-base font-medium text-white">
                Smart Cable Module
              </h3>
              <div
                className={`w-2 h-2 rounded-full ${getStatusColor(
                  scorecard?.smart_cable_health ?? 95
                )}`}
              ></div>
            </div>
            <div className="text-xs text-zinc-500 mb-0.5">
              Taurus Intelligent Cable
            </div>
            <div className="space-y-0.5 text-sm 2xl:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Bandwidth Usage</span>
                <span
                  className={`font-medium ${getBadTextColor(
                    systemData?.telemetry?.total_utilization ?? 15,
                    { bad: 90, warning: 70 }
                  )}`}
                >
                  {systemData?.telemetry?.total_bandwidth
                    ? `${Math.round(systemData.telemetry.total_bandwidth)} GB/s`
                    : "85 GB/s"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Cable Health</span>
                <span
                  className={`font-medium ${getTextColor(
                    scorecard?.smart_cable_health ?? 95
                  )}`}
                >
                  {scorecard?.smart_cable_health
                    ? `${Math.round(scorecard.smart_cable_health)}%`
                    : "95%"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Thermal Status</span>
                <span
                  className={`font-medium ${getBadTextColor(
                    systemData?.telemetry?.avg_temperature ?? 25,
                    { bad: 80, warning: 60 }
                  )}`}
                >
                  {systemData?.telemetry?.avg_temperature &&
                  systemData.telemetry.avg_temperature > 80
                    ? "Hot"
                    : systemData?.telemetry?.avg_temperature &&
                      systemData.telemetry.avg_temperature > 60
                    ? "Warm"
                    : "Normal"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Link Monitoring</span>
                <span
                  className={`font-medium ${getTextColor(
                    scorecard?.signal_integrity_score ?? 87
                  )}`}
                >
                  {scorecard?.signal_integrity_score &&
                  scorecard.signal_integrity_score < 50
                    ? "Degraded"
                    : "Active"}
                </span>
              </div>
            </div>
          </div>

          {/* CXL Memory Controller */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 2xl:p-4 mb-2 2xl:mb-3 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-sm 2xl:text-base font-medium text-white">
                CXL Memory Controller
              </h3>
              <div
                className={`w-2 h-2 rounded-full ${getStatusColor(
                  scorecard?.cxl_channel_utilization
                    ? 100 - scorecard.cxl_channel_utilization
                    : 55,
                  { good: 70, warning: 40 }
                )}`}
              ></div>
            </div>
            <div className="text-xs text-zinc-500 mb-0.5">
              Leo Memory Platform
            </div>
            <div className="space-y-0.5 text-sm 2xl:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Memory Pools</span>
                <span
                  className={`font-medium ${
                    components.filter(
                      (c) =>
                        c.component_type === "memory" && c.status === "healthy"
                    ).length < 2
                      ? "text-red-400"
                      : "text-white"
                  }`}
                >
                  {
                    components.filter((c) => c.component_type === "memory")
                      .length
                  }{" "}
                  Active
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Channel Usage</span>
                <span
                  className={`font-medium ${getBadTextColor(
                    scorecard?.cxl_channel_utilization ?? 45,
                    { bad: 90, warning: 70 }
                  )}`}
                >
                  {scorecard?.cxl_channel_utilization
                    ? `${Math.round(scorecard.cxl_channel_utilization)}%`
                    : "45%"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Pool Access</span>
                <span
                  className={`font-medium ${getTextColor(
                    scorecard?.signal_integrity_score ?? 87
                  )}`}
                >
                  {scorecard?.signal_integrity_score &&
                  scorecard.signal_integrity_score < 50
                    ? "Limited"
                    : "64GB Available"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">CXL Protocol</span>
                <span
                  className={`font-medium ${getTextColor(
                    scorecard?.signal_integrity_score ?? 87
                  )}`}
                >
                  {scorecard?.signal_integrity_score &&
                  scorecard.signal_integrity_score < 50
                    ? "Degraded"
                    : "3.0 Active"}
                </span>
              </div>
            </div>
          </div>

          {/* Connectivity Fabric */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 2xl:p-4 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-sm 2xl:text-base font-medium text-white">
                Connectivity Fabric
              </h3>
              <div
                className={`w-2 h-2 rounded-full ${getStatusColor(resilience)}`}
              ></div>
            </div>
            <div className="text-xs text-zinc-500 mb-0.5">
              Overall System Health
            </div>
            <div className="space-y-0.5 text-sm 2xl:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Signal Integrity</span>
                <span
                  className={`font-medium ${getTextColor(
                    scorecard?.signal_integrity_score ?? 87
                  )}`}
                >
                  {scorecard?.signal_integrity_score
                    ? `${Math.round(scorecard.signal_integrity_score)}%`
                    : "87%"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Traffic Flow</span>
                <span
                  className={`font-medium ${getBadTextColor(
                    systemData?.telemetry?.total_utilization ?? 15,
                    { bad: 85, warning: 65 }
                  )}`}
                >
                  {systemData?.telemetry?.total_utilization &&
                  systemData.telemetry.total_utilization > 85
                    ? "Congested"
                    : systemData?.telemetry?.total_utilization &&
                      systemData.telemetry.total_utilization > 65
                    ? "Busy"
                    : "Optimal"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Link Redundancy</span>
                <span
                  className={`font-medium ${getTextColor(
                    (links.filter((l) => l.status === "healthy").length /
                      Math.max(links.length, 1)) *
                      100,
                    { good: 80, warning: 60 }
                  )}`}
                >
                  {links.filter((l) => l.status === "healthy").length <
                  links.length * 0.8
                    ? "Limited"
                    : "Available"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Features Section - Only in Learn Mode */}
          {currentMode === "learn" && (
            <div className="bg-zinc-900/20 backdrop-blur-sm border-b border-zinc-800/30 p-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="text-lg">🔥</div>
                    <div className="text-white font-medium text-xs">
                      Inject Chaos
                    </div>
                  </div>
                  <div className="text-zinc-400 text-xs">
                    Simulate system failures and watch AI self-healing
                  </div>
                </div>
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="text-lg">📊</div>
                    <div className="text-white font-medium text-xs">
                      Monitor Metrics
                    </div>
                  </div>
                  <div className="text-zinc-400 text-xs">
                    Observe real-time performance in the sidebar
                  </div>
                </div>
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="text-lg">🤖</div>
                    <div className="text-white font-medium text-xs">
                      AI Healing
                    </div>
                  </div>
                  <div className="text-zinc-400 text-xs">
                    Watch intelligent system recovery in action
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Node Visualization Area */}
          <div className="flex-1 bg-zinc-950 relative overflow-hidden">
            <div className="absolute top-4 left-4 bg-zinc-900/80 backdrop-blur-sm rounded-lg px-3 py-1 border border-zinc-700/50">
              <span className="text-sm font-medium text-zinc-200">
                Live Data Center Topology
              </span>
            </div>

            {/* Self Healing with AI Indicator - Moved here for better placement */}
            {isHealing && (
              <div className="absolute top-4 right-4 bg-zinc-900/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-blue-500/50">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse"></div>
                  <span className="text-blue-400 font-semibold animate-pulse text-sm">
                    🤖 AI Self Healing Active
                  </span>
                </div>
                <div className="text-xs text-blue-300 mt-1">
                  System automatically recovering from failures
                </div>
              </div>
            )}

            {/* Chaos Injection Visual Effects */}
            {chaosInjected && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Red flash overlay with flash and fade animation */}
                <div className="absolute inset-0 bg-red-500/20 animate-flash-fade"></div>
                {/* Warning text */}
                <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-red-600/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-red-500 animate-flash-fade">
                    <span className="text-white font-bold text-lg">
                      ⚠️ CHAOS INJECTED! ⚠️
                    </span>
                  </div>
                </div>
              </div>
            )}

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
                    fill={
                      components.find((c) => c.id === "cpu1")?.status ===
                      "failed"
                        ? "rgb(239 68 68)"
                        : components.find((c) => c.id === "cpu1")?.status ===
                          "degraded"
                        ? "rgb(245 158 11)"
                        : "rgb(52 211 153)"
                    }
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="150"
                    cy="100"
                    r="14"
                    fill={
                      components.find((c) => c.id === "cpu1")?.status ===
                      "failed"
                        ? "rgb(127 29 29)"
                        : components.find((c) => c.id === "cpu1")?.status ===
                          "degraded"
                        ? "rgb(146 64 14)"
                        : "rgb(6 78 59)"
                    }
                    className="opacity-80"
                  />
                  {/* Status indicator */}
                  {components.find((c) => c.id === "cpu1")?.status ===
                    "failed" && (
                    <circle
                      cx="165"
                      cy="85"
                      r="4"
                      fill="rgb(239 68 68)"
                      className="animate-pulse"
                    />
                  )}
                  {components.find((c) => c.id === "cpu1")?.status ===
                    "degraded" && (
                    <circle
                      cx="165"
                      cy="85"
                      r="4"
                      fill="rgb(245 158 11)"
                      className="animate-pulse"
                    />
                  )}
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
                    height="120"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                      <div className="font-medium text-emerald-400">
                        Intel Xeon Platinum 8480+
                      </div>
                      <div className="text-zinc-300">56 cores, 2.0-3.8 GHz</div>
                      <div className="text-zinc-400">350W TDP, PCIe 5.0</div>
                      <div className="text-zinc-400">Aries Retimer Enabled</div>
                      {currentMode === "learn" && (
                        <div className="mt-2 pt-2 border-t border-zinc-600/50 text-blue-300">
                          💡 Try chaos injection to see how this CPU responds to
                          failures!
                        </div>
                      )}
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
                    fill={
                      components.find((c) => c.id === "cpu2")?.status ===
                      "failed"
                        ? "rgb(239 68 68)"
                        : components.find((c) => c.id === "cpu2")?.status ===
                          "degraded"
                        ? "rgb(245 158 11)"
                        : "rgb(52 211 153)"
                    }
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="550"
                    cy="100"
                    r="14"
                    fill={
                      components.find((c) => c.id === "cpu2")?.status ===
                      "failed"
                        ? "rgb(127 29 29)"
                        : components.find((c) => c.id === "cpu2")?.status ===
                          "degraded"
                        ? "rgb(146 64 14)"
                        : "rgb(6 78 59)"
                    }
                    className="opacity-80"
                  />
                  {/* Status indicator */}
                  {components.find((c) => c.id === "cpu2")?.status ===
                    "failed" && (
                    <circle
                      cx="565"
                      cy="85"
                      r="4"
                      fill="rgb(239 68 68)"
                      className="animate-pulse"
                    />
                  )}
                  {components.find((c) => c.id === "cpu2")?.status ===
                    "degraded" && (
                    <circle
                      cx="565"
                      cy="85"
                      r="4"
                      fill="rgb(245 158 11)"
                      className="animate-pulse"
                    />
                  )}
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
                    y="290"
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
                    fill={
                      components.find((c) => c.id === "gpu1")?.status ===
                      "failed"
                        ? "rgb(239 68 68)"
                        : components.find((c) => c.id === "gpu1")?.status ===
                          "degraded"
                        ? "rgb(245 158 11)"
                        : "rgb(168 85 247)"
                    }
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx="150"
                    cy="350"
                    r="14"
                    fill={
                      components.find((c) => c.id === "gpu1")?.status ===
                      "failed"
                        ? "rgb(127 29 29)"
                        : components.find((c) => c.id === "gpu1")?.status ===
                          "degraded"
                        ? "rgb(146 64 14)"
                        : "rgb(126 34 206)"
                    }
                    className="opacity-80"
                  />
                  {/* Status indicator */}
                  {components.find((c) => c.id === "gpu1")?.status ===
                    "failed" && (
                    <circle
                      cx="165"
                      cy="335"
                      r="4"
                      fill="rgb(239 68 68)"
                      className="animate-pulse"
                    />
                  )}
                  {components.find((c) => c.id === "gpu1")?.status ===
                    "degraded" && (
                    <circle
                      cx="165"
                      cy="335"
                      r="4"
                      fill="rgb(245 158 11)"
                      className="animate-pulse"
                    />
                  )}
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

            {/* Node Status Panel - Shows current active nodes and failures */}
            <div className="absolute bottom-33 left-4 bg-zinc-900/90 backdrop-blur-sm rounded-lg px-4 py-3 border border-zinc-700/50 z-10">
              <div className="text-xs font-medium text-zinc-200 mb-2">
                Node Status
              </div>
              <div className="space-y-1">
                {components
                  .filter(
                    (comp) =>
                      comp.status === "failed" || comp.status === "degraded"
                  )
                  .map((comp) => (
                    <div key={comp.id} className="flex items-center space-x-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          comp.status === "failed"
                            ? "bg-red-400"
                            : "bg-yellow-400"
                        } animate-pulse`}
                      ></div>
                      <span className="text-xs text-zinc-300">
                        {comp.id}: {comp.status}
                      </span>
                    </div>
                  ))}
                {components.filter(
                  (comp) =>
                    comp.status === "failed" || comp.status === "degraded"
                ).length === 0 && (
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span className="text-xs text-zinc-300">
                      All systems healthy
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ML Predictions Overlay - Only show in Game Mode */}
            {currentMode === "game" && (
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
            )}

            {/* Simplified System Status - Only show when there are issues or healing */}
            {(isHealing ||
              chaosInjected ||
              components.some((c) => c.status !== "healthy")) && (
              <div className="absolute bottom-6 left-6 bg-zinc-900/60 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                <div className="flex items-center space-x-4 text-xs">
                  {chaosInjected && (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                      <span className="text-red-300">Chaos Active</span>
                    </div>
                  )}
                  {isHealing && (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                      <span className="text-blue-300">AI Healing</span>
                    </div>
                  )}
                  {components.some((c) => c.status === "failed") && (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                      <span className="text-red-400">
                        {components.filter((c) => c.status === "failed").length}{" "}
                        Failed
                      </span>
                    </div>
                  )}
                  {components.some((c) => c.status === "degraded") && (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <span className="text-yellow-400">
                        {
                          components.filter((c) => c.status === "degraded")
                            .length
                        }{" "}
                        Degraded
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Panel - Mode-specific content */}
          {currentMode === "game" && (
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
          )}
        </div>
      </div>
    </div>
  );
}
