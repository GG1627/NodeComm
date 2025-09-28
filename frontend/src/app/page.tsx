"use client";

import { useEffect, useState, useRef } from "react";
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

  // Computer Vision state for Learn Mode
  const [cvEnabled, setCvEnabled] = useState(false);
  const [cvLoading, setCvLoading] = useState(false);
  const [handTrackingData, setHandTrackingData] = useState<any>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraPermission, setCameraPermission] = useState<
    "granted" | "denied" | "prompt" | "unknown"
  >("unknown");
  const [screenFingerPositions, setScreenFingerPositions] = useState<
    Array<{ x: number; y: number; hand: string }>
  >([]);
  const [smoothedPositions, setSmoothedPositions] = useState<
    Array<{ x: number; y: number; hand: string; vx: number; vy: number }>
  >([]);
  const [positionHistory, setPositionHistory] = useState<
    Record<string, Array<{ x: number; y: number; timestamp: number }>>
  >({});
  const [lastDragUpdate, setLastDragUpdate] = useState<number>(0);
  const [showDebugOverlay, setShowDebugOverlay] = useState<boolean>(false);
  const [grabbedNode, setGrabbedNode] = useState<string | null>(null);
  const [isDragMode, setIsDragMode] = useState<boolean>(false);
  const [lastTapTime, setLastTapTime] = useState<number>(0);
  const [tapCooldown, setTapCooldown] = useState<boolean>(false);
  const [lastTapState, setLastTapState] = useState<boolean>(false);
  const [dragStartTime, setDragStartTime] = useState<number>(0);
  const [lastHandState, setLastHandState] = useState<boolean>(false); // false = open, true = closed
  const [handStateChangeTime, setHandStateChangeTime] = useState<number>(0);
  const [currentFingerPos, setCurrentFingerPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [lastKeyPress, setLastKeyPress] = useState<number>(0);
  const [grabTime, setGrabTime] = useState<number>(0);
  const [isInDragSession, setIsInDragSession] = useState<boolean>(false);
  const [originalPositions, setOriginalPositions] = useState<Record<
    string,
    { x: number; y: number }
  > | null>(null);
  const [lastMoveTime, setLastMoveTime] = useState<number>(0);

  // Use refs for immediate state access in CV loop
  const isDragModeRef = useRef<boolean>(false);
  const grabbedNodeRef = useRef<string | null>(null);
  const isInDragSessionRef = useRef<boolean>(false);

  // Function to get node position with fallback
  const getNodePosition = (nodeId: string) => {
    return nodePositions[nodeId] || { x: 0, y: 0 };
  };

  // Calculate distance between two nodes
  const calculateDistance = (node1: string, node2: string) => {
    const pos1 = getNodePosition(node1);
    const pos2 = getNodePosition(node2);
    return Math.sqrt(
      Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2)
    );
  };

  // Calculate position-based latency (distance affects latency)
  const calculatePositionBasedLatency = (node1: string, node2: string) => {
    const distance = calculateDistance(node1, node2);
    // Base latency + distance penalty (dramatic when moved from original positions)
    const baseLatency = 0.5;
    const distancePenalty = (distance / 100) * 0.2; // Normal penalty for initial state

    // Check if nodes have been moved from their original positions
    const hasMoved =
      originalPositions &&
      ((originalPositions[node1] &&
        (originalPositions[node1].x !== nodePositions[node1]?.x ||
          originalPositions[node1].y !== nodePositions[node1]?.y)) ||
        (originalPositions[node2] &&
          (originalPositions[node2].x !== nodePositions[node2]?.x ||
            originalPositions[node2].y !== nodePositions[node2]?.y)));

    // Dramatic penalty when nodes have been moved
    const dramaticPenalty = hasMoved ? (distance / 50) * 2.0 : 0;

    return baseLatency + distancePenalty + dramaticPenalty;
  };

  // Calculate topology health score
  const calculateTopologyHealth = () => {
    let totalLatency = 0;
    let connectionCount = 0;

    // Check all connected pairs
    const connections = [
      ["node-1", "node-14"], // CPU1 to MEM1
      ["node-3", "node-15"], // CPU2 to MEM2
      ["node-1", "node-5"], // CPU1 to SW1
      ["node-3", "node-6"], // CPU2 to SW2
      ["node-5", "node-4"], // SW1 to Fabric
      ["node-6", "node-4"], // SW2 to Fabric
      ["node-4", "node-2"], // Fabric to GPU1
      ["node-4", "node-7"], // Fabric to GPU2
      ["node-4", "node-8"], // Fabric to GPU3
      ["node-4", "node-9"], // Fabric to GPU4
      ["node-16", "node-4"], // NIC1 to Fabric
      ["node-17", "node-4"], // NIC2 to Fabric
    ];

    connections.forEach(([from, to]) => {
      const latency = calculatePositionBasedLatency(from, to);
      totalLatency += latency;
      connectionCount++;
    });

    const avgLatency = connectionCount > 0 ? totalLatency / connectionCount : 0;

    // Health score: 100 - (latency penalty) - more dramatic impact
    const healthScore = Math.max(0, 100 - avgLatency * 40);

    return {
      avgLatency: avgLatency.toFixed(2),
      healthScore: healthScore.toFixed(1),
      totalConnections: connectionCount,
    };
  };

  // Calculate impact of node movement
  const calculateMovementImpact = () => {
    if (!originalPositions) return null;

    const currentMetrics = calculateTopologyHealth();

    // Calculate original metrics using original positions
    let originalTotalLatency = 0;
    let connectionCount = 0;

    const connections = [
      ["node-1", "node-14"],
      ["node-3", "node-15"],
      ["node-1", "node-5"],
      ["node-3", "node-6"],
      ["node-5", "node-4"],
      ["node-6", "node-4"],
      ["node-4", "node-2"],
      ["node-4", "node-7"],
      ["node-4", "node-8"],
      ["node-4", "node-9"],
      ["node-16", "node-4"],
      ["node-17", "node-4"],
    ];

    connections.forEach(([from, to]) => {
      const pos1 = originalPositions[from] || getNodePosition(from);
      const pos2 = originalPositions[to] || getNodePosition(to);
      const distance = Math.sqrt(
        Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2)
      );
      const baseLatency = 0.5;
      const distancePenalty = (distance / 100) * 0.2; // Normal penalty for original state
      const latency = baseLatency + distancePenalty;
      originalTotalLatency += latency;
      connectionCount++;
    });

    const originalAvgLatency =
      connectionCount > 0 ? originalTotalLatency / connectionCount : 0;
    const originalHealthScore = Math.max(0, 100 - originalAvgLatency * 40);

    return {
      originalLatency: originalAvgLatency.toFixed(2),
      currentLatency: currentMetrics.avgLatency,
      latencyChange: (
        parseFloat(currentMetrics.avgLatency) - originalAvgLatency
      ).toFixed(2),
      originalHealth: originalHealthScore.toFixed(1),
      currentHealth: currentMetrics.healthScore,
      healthChange: (
        parseFloat(currentMetrics.healthScore) - originalHealthScore
      ).toFixed(1),
    };
  };
  const [nodePositions, setNodePositions] = useState<
    Record<string, { x: number; y: number }>
  >({
    // CPU Tier
    "node-1": { x: 150, y: 100 }, // CPU1
    "node-3": { x: 550, y: 100 }, // CPU2

    // Memory Tier
    "node-14": { x: 250, y: 100 }, // MEM1
    "node-15": { x: 650, y: 100 }, // MEM2

    // Switch Tier
    "node-5": { x: 200, y: 180 }, // SW1
    "node-6": { x: 600, y: 180 }, // SW2

    // Central Hub
    "node-4": { x: 400, y: 250 }, // Astera Hub

    // GPU Tier
    "node-2": { x: 150, y: 350 }, // GPU1
    "node-7": { x: 250, y: 350 }, // GPU2
    "node-8": { x: 550, y: 350 }, // GPU3
    "node-9": { x: 650, y: 350 }, // GPU4

    // Storage Tier
    "node-10": { x: 150, y: 450 }, // SSD1
    "node-11": { x: 250, y: 450 }, // SSD2
    "node-12": { x: 550, y: 450 }, // SSD3
    "node-13": { x: 650, y: 450 }, // SSD4

    // Network Interface Cards
    "node-16": { x: 100, y: 250 }, // NIC1
    "node-17": { x: 700, y: 250 }, // NIC2
  });

  // Keyboard controls for grab/release
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && cvEnabled && currentFingerPos) {
        event.preventDefault();

        const now = Date.now();
        // Strong debounce keypress - prevent rapid fire
        if (now - lastKeyPress < 2000) {
          console.log(
            `⌨️ DEBOUNCED: ${2000 - (now - lastKeyPress)}ms remaining`
          );
          return;
        }
        setLastKeyPress(now);

        if (!isInDragSession) {
          // Try to grab a node at current finger position
          const screenPos = mapCameraToScreen(
            currentFingerPos.x,
            currentFingerPos.y
          );
          const nodeAtPosition = findNodeAtPosition(screenPos.x, screenPos.y);

          if (nodeAtPosition) {
            // Capture original positions for comparison
            setOriginalPositions({ ...nodePositions });

            setGrabbedNode(nodeAtPosition);
            setIsDragMode(true);
            setIsInDragSession(true);
            setGrabTime(now);

            // Update refs immediately for CV loop
            grabbedNodeRef.current = nodeAtPosition;
            isDragModeRef.current = true;
            isInDragSessionRef.current = true;

            console.log(
              `⌨️ GRABBED: ${nodeAtPosition} with SPACE key - DRAG SESSION STARTED`
            );
          } else {
            console.log(`⌨️ SPACE: No node found at finger position`);
          }
        } else {
          // Check if enough time has passed since grab (mandatory hold period)
          const holdTime = now - grabTime;
          if (holdTime < 1000) {
            console.log(
              `⌨️ HOLD: Must hold for ${1000 - holdTime}ms more before release`
            );
            return;
          }

          // Release the grabbed node
          console.log(
            `⌨️ RELEASED: ${grabbedNode} with SPACE key - DRAG SESSION ENDED`
          );
          setGrabbedNode(null);
          setIsDragMode(false);
          setIsInDragSession(false);
          setGrabTime(0);

          // Update refs immediately for CV loop
          grabbedNodeRef.current = null;
          isDragModeRef.current = false;
          isInDragSessionRef.current = false;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cvEnabled,
    currentFingerPos,
    isDragMode,
    grabbedNode,
    lastKeyPress,
    isInDragSession,
    grabTime,
  ]);

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

    // Learn Mode Computer Vision data
    synapseNetWS.on("learn_mode_cv_data", (data) => {
      console.log("🎥 Received CV data:", data);
      setHandTrackingData(data);

      // Map finger positions to screen coordinates and handle pinch gestures
      if (data.hands && data.hands.length > 0) {
        const fingerPositions: Array<{ x: number; y: number; hand: string }> =
          [];

        data.hands.forEach((hand: any) => {
          // Get index finger tip (landmark 8)
          if (hand.landmarks && hand.landmarks[8]) {
            const fingerTip = hand.landmarks[8];
            const screenPos = mapCameraToScreen(fingerTip.x, fingerTip.y);
            fingerPositions.push({
              x: screenPos.x,
              y: screenPos.y,
              hand: hand.handedness,
            });
          }

          // Simple finger tracking system
          const pointing = detectPointing(hand);

          if (pointing) {
            // Update current finger position for keyboard controls
            setCurrentFingerPos(pointing.indexPos);

            // Debug state
            console.log(
              `🔍 STATE: isDragMode=${isDragModeRef.current}, grabbedNode=${grabbedNodeRef.current}, isInDragSession=${isInDragSessionRef.current}`
            );

            // If in drag mode, move the grabbed node
            if (isDragModeRef.current && grabbedNodeRef.current) {
              console.log(
                `🎯 DRAGGING: ${
                  grabbedNodeRef.current
                } following finger at (${pointing.indexPos.x.toFixed(
                  3
                )}, ${pointing.indexPos.y.toFixed(3)})`
              );
              handleDragMovement(pointing.indexPos);
            } else if (isDragModeRef.current && !grabbedNodeRef.current) {
              console.log("⚠️ DRAG MODE but no grabbed node!");
            } else if (!isDragModeRef.current && grabbedNodeRef.current) {
              console.log("⚠️ GRABBED NODE but not in drag mode!");
            } else {
              console.log("ℹ️ Not in drag mode, just tracking finger");
            }
          }
        });

        setScreenFingerPositions(fingerPositions);

        // Apply smoothing to the positions
        const smoothed = smoothPositions(fingerPositions);
        setSmoothedPositions(smoothed);
      } else {
        setScreenFingerPositions([]);
        setSmoothedPositions([]);
        // Clear finger position when no hands detected, but keep drag mode active
        // User must manually release with SPACE key for more reliable control
        setCurrentFingerPos(null);
        console.log("👋 No hands detected - finger tracking paused");
      }
    });

    // Cleanup on unmount
    return () => {
      synapseNetWS.disconnect();
    };
  }, []);

  // Handle video stream and frame capture
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      const video = videoRef.current;
      video.srcObject = cameraStream;

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.log("Video play was interrupted:", error);
        });
      }
    }
  }, [cameraStream]);

  // Start frame capture when CV is enabled and camera is ready
  useEffect(() => {
    if (cvEnabled && cameraStream && videoRef.current) {
      const cleanup = startFrameCapture();
      return cleanup;
    }
  }, [cvEnabled, cameraStream]);

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

  // Video ref for camera feed and frame capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Map camera coordinates to screen coordinates
  const mapCameraToScreen = (cameraX: number, cameraY: number) => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // MediaPipe coordinates are normalized (0-1)
    // Remove mirroring - direct mapping for natural movement
    const screenX = cameraX * screenWidth; // Direct mapping, no flip
    const screenY = cameraY * screenHeight;

    // Clamp coordinates to screen bounds
    const clampedX = Math.max(0, Math.min(screenWidth, screenX));
    const clampedY = Math.max(0, Math.min(screenHeight, screenY));

    return { x: clampedX, y: clampedY };
  };

  // Convert SVG coordinates to screen coordinates
  const svgToScreenCoords = (svgX: number, svgY: number) => {
    // Get the SVG container element bounds
    const svgContainer = document.querySelector(
      ".flex-1.bg-zinc-950.relative.overflow-hidden"
    );
    if (!svgContainer) {
      // Fallback if container not found
      return { x: svgX, y: svgY };
    }

    const containerRect = svgContainer.getBoundingClientRect();

    // SVG viewBox is "0 0 800 600"
    const svgViewBoxWidth = 800;
    const svgViewBoxHeight = 600;

    // Calculate scale factors
    const scaleX = containerRect.width / svgViewBoxWidth;
    const scaleY = containerRect.height / svgViewBoxHeight;

    // Convert SVG coordinates to screen coordinates
    const screenX = containerRect.left + svgX * scaleX;
    const screenY = containerRect.top + svgY * scaleY;

    return { x: screenX, y: screenY };
  };

  // Convert screen coordinates to SVG coordinates
  const screenToSvgCoords = (screenX: number, screenY: number) => {
    // Get the SVG container element bounds
    const svgContainer = document.querySelector(
      ".flex-1.bg-zinc-950.relative.overflow-hidden"
    );
    if (!svgContainer) {
      // Fallback if container not found
      return { x: screenX, y: screenY };
    }

    const containerRect = svgContainer.getBoundingClientRect();

    // SVG viewBox is "0 0 800 600"
    const svgViewBoxWidth = 800;
    const svgViewBoxHeight = 600;

    // Calculate scale factors
    const scaleX = containerRect.width / svgViewBoxWidth;
    const scaleY = containerRect.height / svgViewBoxHeight;

    // Convert screen coordinates to SVG coordinates
    const svgX = (screenX - containerRect.left) / scaleX;
    const svgY = (screenY - containerRect.top) / scaleY;

    // Clamp to SVG viewBox bounds
    const clampedX = Math.max(0, Math.min(svgViewBoxWidth, svgX));
    const clampedY = Math.max(0, Math.min(svgViewBoxHeight, svgY));

    return { x: clampedX, y: clampedY };
  };

  // Enhanced smoothing with position history and adaptive smoothing
  const smoothPositions = (
    newPositions: Array<{ x: number; y: number; hand: string }>
  ) => {
    const timestamp = Date.now();

    return newPositions.map((newPos) => {
      // Update position history
      const historyKey = newPos.hand;
      const currentHistory = positionHistory[historyKey] || [];

      // Add new position to history
      const updatedHistory = [
        ...currentHistory,
        { x: newPos.x, y: newPos.y, timestamp },
      ]
        .filter((pos) => timestamp - pos.timestamp < 200) // Keep last 200ms
        .slice(-5); // Keep max 5 positions

      setPositionHistory((prev) => ({
        ...prev,
        [historyKey]: updatedHistory,
      }));

      // Find existing smoothed position for this hand
      const existingPos = smoothedPositions.find(
        (pos) => pos.hand === newPos.hand
      );

      if (!existingPos || updatedHistory.length < 2) {
        // First position for this hand
        return {
          ...newPos,
          vx: 0,
          vy: 0,
        };
      }

      // Calculate movement speed for adaptive smoothing
      const recentMovement = Math.sqrt(
        Math.pow(newPos.x - existingPos.x, 2) +
          Math.pow(newPos.y - existingPos.y, 2)
      );

      // Adaptive smoothing: more smoothing for slow movements, less for fast movements
      const baseSmoothingFactor = 0.2;
      const adaptiveFactor = recentMovement < 10 ? 0.1 : baseSmoothingFactor; // More smoothing for micro-movements

      // Use weighted average of recent positions for trajectory smoothing
      let weightedX = 0;
      let weightedY = 0;
      let totalWeight = 0;

      updatedHistory.forEach((pos, index) => {
        const age = timestamp - pos.timestamp;
        const weight = Math.max(0.1, 1 - age / 200); // Recent positions have higher weight
        weightedX += pos.x * weight;
        weightedY += pos.y * weight;
        totalWeight += weight;
      });

      const trajectorySmoothedX = weightedX / totalWeight;
      const trajectorySmoothedY = weightedY / totalWeight;

      // Blend trajectory smoothing with existing position
      const finalX =
        existingPos.x + (trajectorySmoothedX - existingPos.x) * adaptiveFactor;
      const finalY =
        existingPos.y + (trajectorySmoothedY - existingPos.y) * adaptiveFactor;

      // Calculate velocity
      const vx = finalX - existingPos.x;
      const vy = finalY - existingPos.y;

      return {
        x: finalX,
        y: finalY,
        hand: newPos.hand,
        vx: vx,
        vy: vy,
      };
    });
  };

  // Computer Vision functions for Learn Mode
  const requestCameraPermission = async () => {
    try {
      console.log("🎥 Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: "user", // Front camera
        },
      });

      console.log("✅ Camera stream obtained:", stream);
      setCameraStream(stream);
      setCameraPermission("granted");

      return stream;
    } catch (error) {
      console.error("❌ Camera permission denied:", error);
      setCameraPermission("denied");
      return null;
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;

    // Reduce canvas size for faster processing (320x240 instead of full resolution)
    const targetWidth = 320;
    const targetHeight = 240;
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Draw video frame to canvas (scaled down)
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    // Convert to base64 with lower quality for faster transmission
    return canvas.toDataURL("image/jpeg", 0.6);
  };

  const startFrameCapture = () => {
    if (!cvEnabled) return;

    let frameCount = 0;
    const interval = setInterval(() => {
      frameCount++;

      // Only send every 2nd frame to reduce processing load
      if (frameCount % 2 === 0) {
        const frameData = captureFrame();
        if (frameData && synapseNetWS.getConnectionState() === "connected") {
          // Send frame to backend for processing
          console.log("📤 Sending frame to backend...");
          synapseNetWS.send({
            type: "cv_frame",
            frame: frameData,
            timestamp: Date.now().toString(),
          });
        }
      }
    }, 100); // Capture at 10 FPS, but only process every 2nd frame (5 FPS effective)

    return () => clearInterval(interval);
  };

  const enableComputerVision = async () => {
    setCvLoading(true);

    try {
      console.log("🎥 Starting CV - requesting frontend camera...");

      // First, request camera permission and get stream
      const stream = await requestCameraPermission();
      if (!stream) {
        alert(
          "Camera permission is required for computer vision. Please allow camera access and try again."
        );
        setCvLoading(false);
        return;
      }

      console.log("✅ Frontend camera ready, starting frame capture...");

      // Enable CV and start frame capture
      setCvEnabled(true);

      // Start capturing and sending frames
      const cleanup = startFrameCapture();

      console.log("✅ Computer Vision enabled - using frontend camera");
    } catch (error) {
      console.error("Error enabling computer vision:", error);
      setCvLoading(false);
    } finally {
      setCvLoading(false);
    }
  };

  const disableComputerVision = async () => {
    try {
      setCvEnabled(false);
      setHandTrackingData(null);
      setScreenFingerPositions([]);
      setSmoothedPositions([]);
      setPositionHistory({});
      setGrabbedNode(null);

      // Stop camera stream
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        setCameraStream(null);
      }

      console.log("🛑 Computer Vision disabled");
    } catch (error) {
      console.error("Error disabling computer vision:", error);
    }
  };

  // Hand closing detection for grabbing nodes
  const detectHandClosure = (handData: any) => {
    if (!handData.landmarks || handData.landmarks.length < 21) return null;

    // Get key landmarks for fist detection
    const wrist = handData.landmarks[0];
    const thumbTip = handData.landmarks[4];
    const indexTip = handData.landmarks[8];
    const middleTip = handData.landmarks[12];
    const ringTip = handData.landmarks[16];
    const pinkyTip = handData.landmarks[20];
    const indexMcp = handData.landmarks[5]; // Index finger base
    const middleMcp = handData.landmarks[9]; // Middle finger base

    if (
      !wrist ||
      !thumbTip ||
      !indexTip ||
      !middleTip ||
      !ringTip ||
      !pinkyTip ||
      !indexMcp ||
      !middleMcp
    ) {
      return null;
    }

    // Calculate distances from fingertips to palm center (approximate)
    const palmCenter = {
      x: (indexMcp.x + middleMcp.x) / 2,
      y: (indexMcp.y + middleMcp.y) / 2,
    };

    // Calculate how "closed" each finger is
    const indexClosure = Math.sqrt(
      Math.pow(indexTip.x - palmCenter.x, 2) +
        Math.pow(indexTip.y - palmCenter.y, 2)
    );
    const middleClosure = Math.sqrt(
      Math.pow(middleTip.x - palmCenter.x, 2) +
        Math.pow(middleTip.y - palmCenter.y, 2)
    );
    const ringClosure = Math.sqrt(
      Math.pow(ringTip.x - palmCenter.x, 2) +
        Math.pow(ringTip.y - palmCenter.y, 2)
    );

    // Average closure distance
    const avgClosure = (indexClosure + middleClosure + ringClosure) / 3;

    // Fist threshold - smaller values mean more closed
    const fistThreshold = 0.08; // Adjust based on testing
    const isFist = avgClosure < fistThreshold;

    return {
      isFist: isFist,
      closure: avgClosure,
      indexPos: { x: indexTip.x, y: indexTip.y },
      palmCenter: palmCenter,
    };
  };

  // Simple pointing detection - just use index finger position
  const detectPointing = (handData: any) => {
    if (!handData.landmarks || handData.landmarks.length < 21) return null;

    // Get index finger tip (landmark 8)
    const indexTip = handData.landmarks[8];
    if (!indexTip) return null;

    return {
      indexPos: { x: indexTip.x, y: indexTip.y },
      isPointing: true, // Always true if we have an index finger
    };
  };

  // Pinch detection and node grabbing functions
  const detectPinchGesture = (handData: any) => {
    if (!handData.landmarks || handData.landmarks.length < 21) return null;

    // Get index finger tip (landmark 8) and thumb tip (landmark 4)
    const indexTip = handData.landmarks[8];
    const thumbTip = handData.landmarks[4];

    if (!indexTip || !thumbTip) return null;

    // Calculate distance between index finger and thumb
    const distance = Math.sqrt(
      Math.pow(indexTip.x - thumbTip.x, 2) +
        Math.pow(indexTip.y - thumbTip.y, 2)
    );

    // Use hysteresis for more stable pinch detection
    const pinchThresholdEnter = 0.08; // Tighter threshold to start pinching
    const pinchThresholdExit = 0.15; // Looser threshold to stop pinching

    // Check current pinch state
    const wasGrabbing = grabbedNode !== null;
    const isPinching = wasGrabbing
      ? distance < pinchThresholdExit // Use exit threshold if already grabbing
      : distance < pinchThresholdEnter; // Use enter threshold if not grabbing

    // Debug logging (reduced frequency)
    if (isPinching && Math.random() < 0.1) {
      // Only log 10% of the time
      console.log(
        `🤏 PINCH: Distance: ${distance.toFixed(3)}, threshold: ${
          wasGrabbing ? pinchThresholdExit : pinchThresholdEnter
        }, center: (${((indexTip.x + thumbTip.x) / 2).toFixed(3)}, ${(
          (indexTip.y + thumbTip.y) /
          2
        ).toFixed(3)})`
      );
    }

    return {
      isPinching: isPinching,
      distance: distance,
      indexPos: { x: indexTip.x, y: indexTip.y },
      thumbPos: { x: thumbTip.x, y: thumbTip.y },
      centerPos: {
        x: (indexTip.x + thumbTip.x) / 2,
        y: (indexTip.y + thumbTip.y) / 2,
      },
    };
  };

  const findNodeAtPosition = (x: number, y: number) => {
    const nodeRadius = 60; // Smaller hit area for more precise grabbing
    let closestNode = null;
    let closestDistance = Infinity;

    // Find the closest node within range (convert SVG coords to screen coords)
    for (const [nodeId, svgPosition] of Object.entries(nodePositions)) {
      const screenPosition = svgToScreenCoords(svgPosition.x, svgPosition.y);

      // Apply position adjustments for better hit box alignment
      let adjustedX = screenPosition.x;
      let adjustedY = screenPosition.y;

      // Fix hit box offset: the further from center, the more adjustment needed
      const distanceFromCenter = Math.abs(svgPosition.x - 400);
      const adjustmentFactor = distanceFromCenter / 100; // Scale based on distance from center
      const baseAdjustment = 20; // Base adjustment
      const totalAdjustment = baseAdjustment + adjustmentFactor * 20; // More adjustment for nodes further from center

      if (svgPosition.x < 400) {
        // Left side nodes - hit boxes are too far left
        adjustedX += totalAdjustment; // Shift hit box to the right
      } else if (svgPosition.x > 400) {
        // Right side nodes - hit boxes are too far right
        adjustedX -= totalAdjustment; // Shift hit box to the left
      }

      const distance = Math.sqrt(
        Math.pow(x - adjustedX, 2) + Math.pow(y - adjustedY, 2)
      );

      if (distance <= nodeRadius && distance < closestDistance) {
        closestDistance = distance;
        closestNode = nodeId;
      }
    }

    if (closestNode) {
      console.log(
        `🎯 Found closest node ${closestNode} at distance ${closestDistance.toFixed(
          1
        )} from pinch at (${x}, ${y})`
      );
      return closestNode;
    } else {
      console.log(
        `🎯 No node found within ${nodeRadius}px radius at (${x.toFixed(
          1
        )}, ${y.toFixed(1)})`
      );
    }

    // Debug: Show closest node distance for troubleshooting (reduced logging)
    if (Math.random() < 0.2) {
      // Only log 20% of the time
      const distances = Object.entries(nodePositions).map(
        ([nodeId, svgPos]) => {
          const screenPos = svgToScreenCoords(svgPos.x, svgPos.y);
          return {
            nodeId,
            distance: Math.sqrt(
              Math.pow(x - screenPos.x, 2) + Math.pow(y - screenPos.y, 2)
            ),
          };
        }
      );
      const closest = distances.reduce((min, curr) =>
        curr.distance < min.distance ? curr : min
      );
      console.log(
        `🎯 No nodes within range. Closest: ${
          closest.nodeId
        } at ${closest.distance.toFixed(1)}px`
      );
    }

    return null;
  };

  const handleNodeGrab = (pinchCenter: { x: number; y: number }) => {
    const screenCenter = mapCameraToScreen(pinchCenter.x, pinchCenter.y);
    console.log(
      `🤏 Attempting to grab at camera (${pinchCenter.x.toFixed(
        3
      )}, ${pinchCenter.y.toFixed(3)}) -> screen (${screenCenter.x}, ${
        screenCenter.y
      })`
    );

    const nodeAtPosition = findNodeAtPosition(screenCenter.x, screenCenter.y);

    if (nodeAtPosition && !grabbedNode) {
      setGrabbedNode(nodeAtPosition);
      console.log(`🤏 SUCCESS: Grabbed node: ${nodeAtPosition}`);
    } else if (!nodeAtPosition) {
      console.log(`🤏 No node found at pinch position`);
    } else {
      console.log(`🤏 Already grabbing node: ${grabbedNode}`);
    }
  };

  const handleNodeDrag = (pinchCenter: { x: number; y: number }) => {
    if (grabbedNode) {
      const now = Date.now();
      // Reduce throttling for more responsive movement
      if (now - lastDragUpdate < 8) return; // ~120 FPS instead of 60

      const screenCenter = mapCameraToScreen(pinchCenter.x, pinchCenter.y);

      // Convert screen coordinates to SVG coordinates for the target position
      const targetSvgPos = screenToSvgCoords(screenCenter.x, screenCenter.y);

      // Apply lighter smoothing for more responsive movement
      setNodePositions((prev) => {
        const currentPos = prev[grabbedNode];
        if (!currentPos) return prev;

        // Use lighter smoothing factor for more direct control
        const smoothingFactor = 0.95; // Increased from 0.8 for more responsiveness
        const smoothedX =
          currentPos.x + (targetSvgPos.x - currentPos.x) * smoothingFactor;
        const smoothedY =
          currentPos.y + (targetSvgPos.y - currentPos.y) * smoothingFactor;

        // Clamp positions to SVG viewBox bounds with some padding
        const padding = 30; // SVG coordinate padding
        const clampedX = Math.max(
          padding,
          Math.min(800 - padding, smoothedX) // SVG viewBox width is 800
        );
        const clampedY = Math.max(
          padding,
          Math.min(600 - padding, smoothedY) // SVG viewBox height is 600
        );

        return {
          ...prev,
          [grabbedNode]: { x: clampedX, y: clampedY },
        };
      });

      setLastDragUpdate(now);
    }
  };

  const handleNodeRelease = () => {
    if (grabbedNode) {
      console.log(`🤏 Released node: ${grabbedNode}`);
      setGrabbedNode(null);
      setLastDragUpdate(0); // Reset drag timer
    }
  };

  // Handle tap to toggle drag mode
  const handleTapToggle = (tapCenter: { x: number; y: number }) => {
    const now = Date.now();

    // Prevent rapid taps (cooldown)
    if (tapCooldown || now - lastTapTime < 300) return;

    const screenCenter = mapCameraToScreen(tapCenter.x, tapCenter.y);

    if (!isDragMode) {
      // Not in drag mode - try to grab a node
      const nodeAtPosition = findNodeAtPosition(screenCenter.x, screenCenter.y);

      if (nodeAtPosition) {
        setGrabbedNode(nodeAtPosition);
        setIsDragMode(true);
        setDragStartTime(now);
        console.log(`👆 TAP: Started dragging node: ${nodeAtPosition}`);

        // Visual feedback
        setTapCooldown(true);
        setTimeout(() => setTapCooldown(false), 300);
      } else {
        console.log(`👆 TAP: No node found at position`);
      }
    } else {
      // Already in drag mode - release (tap anywhere to release)
      console.log(`👆 TAP: Releasing drag mode (was dragging: ${grabbedNode})`);
      setGrabbedNode(null);
      setIsDragMode(false);
      setDragStartTime(0);

      // Visual feedback
      setTapCooldown(true);
      setTimeout(() => setTapCooldown(false), 300);
    }

    setLastTapTime(now);
  };

  // Handle finger movement during drag mode
  const handleDragMovement = (fingerCenter: { x: number; y: number }) => {
    if (!isDragModeRef.current || !grabbedNodeRef.current) return;

    const now = Date.now();
    // Smooth movement updates - reduced throttling for better responsiveness
    if (now - lastDragUpdate < 8) return; // ~120 FPS

    const screenCenter = mapCameraToScreen(fingerCenter.x, fingerCenter.y);
    const targetSvgPos = screenToSvgCoords(screenCenter.x, screenCenter.y);

    // Debug logging - always log for now to debug the issue
    console.log(
      `🎯 DRAG: finger(${fingerCenter.x.toFixed(3)}, ${fingerCenter.y.toFixed(
        3
      )}) -> screen(${screenCenter.x.toFixed(0)}, ${screenCenter.y.toFixed(
        0
      )}) -> svg(${targetSvgPos.x.toFixed(0)}, ${targetSvgPos.y.toFixed(0)})`
    );

    // Direct movement with light smoothing
    setNodePositions((prev) => {
      const currentPos = prev[grabbedNodeRef.current!];
      if (!currentPos) return prev;

      const smoothingFactor = 0.8; // Moderate smoothing for stable movement
      const smoothedX =
        currentPos.x + (targetSvgPos.x - currentPos.x) * smoothingFactor;
      const smoothedY =
        currentPos.y + (targetSvgPos.y - currentPos.y) * smoothingFactor;

      // Clamp to SVG bounds
      const padding = 30;
      const clampedX = Math.max(padding, Math.min(800 - padding, smoothedX));
      const clampedY = Math.max(padding, Math.min(600 - padding, smoothedY));

      return {
        ...prev,
        [grabbedNodeRef.current!]: { x: clampedX, y: clampedY },
      };
    });

    setLastDragUpdate(now);
  };

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-white">
      {/* Finger Position Overlay - Shows mapped finger positions on screen */}
      {cvEnabled && smoothedPositions.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {smoothedPositions.map((finger, index) => {
            // Check if this hand is currently pinching
            const handData = handTrackingData?.hands?.find(
              (h: any) => h.handedness === finger.hand
            );
            const pointing = handData ? detectPointing(handData) : null;
            const isPointing = pointing?.isPointing || false;

            return (
              <div
                key={index}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75 ease-out"
                style={{
                  left: `${finger.x}px`,
                  top: `${finger.y}px`,
                  transform: `translate(-50%, -50%) scale(${Math.min(
                    1.2,
                    1 +
                      Math.sqrt(finger.vx * finger.vx + finger.vy * finger.vy) /
                        100
                  )})`,
                }}
              >
                {/* Finger tip indicator with trail effect */}
                <div className="relative">
                  {/* Trail effect */}
                  <div
                    className={`absolute w-12 h-12 rounded-full transition-all duration-200 ease-out ${
                      isPointing ? "bg-green-400/30" : "bg-red-400/20"
                    }`}
                    style={{
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      filter: "blur(4px)",
                    }}
                  />
                  {/* Main indicator */}
                  <div
                    className={`relative w-8 h-8 rounded-full border-2 animate-pulse flex items-center justify-center transition-all duration-100 ${
                      isPointing
                        ? "bg-green-500/80 border-green-300"
                        : "bg-red-500/80 border-red-300"
                    }`}
                  >
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Grabbed Node Indicator */}
      {grabbedNode && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-500/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse">
          🤏 Grabbing: {grabbedNode.replace("node-", "").toUpperCase()} - Move
          to reposition
        </div>
      )}

      {/* Debug Toggle Button */}
      {cvEnabled && (
        <button
          onClick={() => setShowDebugOverlay(!showDebugOverlay)}
          className="fixed top-4 right-4 bg-purple-500/90 hover:bg-purple-600 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-50 transition-colors"
        >
          {showDebugOverlay ? "Hide Debug" : "Show Debug"}
        </button>
      )}

      {/* Debug Overlay - Show pinch center and node hit areas */}
      {cvEnabled && showDebugOverlay && handTrackingData?.hands && (
        <div className="fixed inset-0 pointer-events-none z-40">
          {/* Show pinch center */}
          {handTrackingData.hands.map((hand: any, index: number) => {
            // Use simple pointing instead of pinch detection
            const pointing = detectPointing(hand);
            if (pointing) {
              const screenCenter = mapCameraToScreen(
                pointing.indexPos.x,
                pointing.indexPos.y
              );
              return (
                <div
                  key={index}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${screenCenter.x}px`,
                    top: `${screenCenter.y}px`,
                  }}
                >
                  {/* Pinch center indicator */}
                  <div className="w-4 h-4 bg-yellow-500 rounded-full border-2 border-yellow-300 animate-pulse"></div>
                  {/* Pinch center label */}
                  <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-yellow-500/80 text-black text-xs px-1 rounded whitespace-nowrap">
                    PINCH
                  </div>
                </div>
              );
            }
            return null;
          })}

          {/* Show node hit areas */}
          {Object.entries(nodePositions).map(([nodeId, svgPosition]) => {
            const screenPosition = svgToScreenCoords(
              svgPosition.x,
              svgPosition.y
            );

            // Apply the same position adjustments as in findNodeAtPosition
            let adjustedX = screenPosition.x;

            // Fix hit box offset: the further from center, the more adjustment needed
            const distanceFromCenter = Math.abs(svgPosition.x - 400);
            const adjustmentFactor = distanceFromCenter / 100; // Scale based on distance from center
            const baseAdjustment = 20; // Base adjustment
            const totalAdjustment = baseAdjustment + adjustmentFactor * 20; // More adjustment for nodes further from center

            if (svgPosition.x < 400) {
              // Left side nodes - hit boxes are too far left
              adjustedX += totalAdjustment; // Shift hit box to the right
            } else if (svgPosition.x > 400) {
              // Right side nodes - hit boxes are too far right
              adjustedX -= totalAdjustment; // Shift hit box to the left
            }

            return (
              <div
                key={nodeId}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${adjustedX}px`,
                  top: `${screenPosition.y}px`,
                }}
              >
                {/* Node hit area indicator - matches the 60px radius with position adjustments */}
                <div className="w-[120px] h-[120px] border-2 border-dashed border-blue-400/50 rounded-full"></div>
                {/* Node label */}
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-blue-500/80 text-white text-xs px-1 rounded whitespace-nowrap">
                  {nodeId.replace("node-", "").toUpperCase()} SVG:(
                  {svgPosition.x.toFixed(0)},{svgPosition.y.toFixed(0)})
                  Screen:({screenPosition.x.toFixed(0)},
                  {screenPosition.y.toFixed(0)})
                </div>
                {/* Center dot */}
                <div className="absolute w-2 h-2 bg-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
              </div>
            );
          })}
        </div>
      )}

      {/* Finger Position Indicator */}
      {cvEnabled && currentFingerPos && (
        <div
          className="fixed w-6 h-6 rounded-full border-4 border-green-400 bg-green-400/30 pointer-events-none z-50 transform -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${
              mapCameraToScreen(currentFingerPos.x, currentFingerPos.y).x
            }px`,
            top: `${
              mapCameraToScreen(currentFingerPos.x, currentFingerPos.y).y
            }px`,
          }}
        >
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-green-600/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
            {isInDragSession ? "🎯 DRAGGING" : "👉 Point & Press SPACE"}
          </div>
        </div>
      )}

      {/* Drag Mode Indicator */}
      {cvEnabled && (isDragMode || grabbedNode) && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-blue-600/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-blue-500/50 animate-pulse">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-blue-400 animate-bounce"></div>
              <span className="text-white font-semibold text-sm">
                🎯 DRAG MODE:{" "}
                {grabbedNode
                  ? grabbedNode.replace("node-", "").toUpperCase()
                  : "READY"}
              </span>
            </div>
            <div className="text-xs text-blue-200 mt-1 text-center">
              {grabbedNode
                ? "Move your finger to drag • Hold 1s+ then SPACE to release"
                : "Point at a node • Press SPACE to grab"}
            </div>
          </div>
        </div>
      )}

      {/* Tap Cooldown Indicator */}
      {cvEnabled && tapCooldown && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-yellow-600/90 backdrop-blur-sm rounded-lg px-3 py-1 border border-yellow-500/50">
            <span className="text-white text-xs">Processing tap...</span>
          </div>
        </div>
      )}

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
              <div className="grid grid-cols-4 gap-4">
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
                <div className="relative bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="text-lg">🖐️</div>
                    <div className="text-white font-medium text-xs">
                      Computer Vision
                    </div>
                  </div>
                  <div className="text-zinc-400 text-xs mb-2">
                    Point at nodes • Press SPACE to grab • Move finger to drag •
                    Press SPACE to release
                  </div>
                  <button
                    onClick={
                      cvEnabled ? disableComputerVision : enableComputerVision
                    }
                    disabled={cvLoading}
                    className={`w-full px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                      cvLoading
                        ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                        : cvEnabled
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {cvLoading
                      ? "Loading..."
                      : cvEnabled
                      ? "Disable CV"
                      : "Enable CV"}
                  </button>
                  {cvEnabled && (
                    <div className="absolute top-1 right-1 flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="text-xs text-green-400">Active</span>
                    </div>
                  )}
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

            {/* Real-time Topology Metrics */}
            <div className="absolute top-15 left-4 bg-zinc-900/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-zinc-700/50 w-[190px]">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold text-zinc-200">
                  Topology Health
                </span>
              </div>

              {(() => {
                const metrics = calculateTopologyHealth();
                const impact = calculateMovementImpact();

                return (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-zinc-300">
                        Avg Latency:
                      </span>
                      <span
                        className={`text-xs font-mono ${
                          parseFloat(metrics.avgLatency) > 2
                            ? "text-red-400"
                            : parseFloat(metrics.avgLatency) > 1
                            ? "text-yellow-400"
                            : "text-green-400"
                        }`}
                      >
                        {metrics.avgLatency}ms
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-zinc-300">
                        Health Score:
                      </span>
                      <span
                        className={`text-xs font-mono ${
                          parseFloat(metrics.healthScore) > 80
                            ? "text-green-400"
                            : parseFloat(metrics.healthScore) > 60
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}
                      >
                        {metrics.healthScore}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-zinc-300">
                        Connections:
                      </span>
                      <span className="text-xs font-mono text-blue-400">
                        {metrics.totalConnections}
                      </span>
                    </div>

                    {/* Before/After Comparison */}
                    {impact && (
                      <div className="mt-3 pt-2 border-t border-zinc-600">
                        <div className="text-xs font-semibold text-yellow-300 mb-2">
                          📊 Movement Impact
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-300">Latency:</span>
                            <span
                              className={`font-mono ${
                                parseFloat(impact.latencyChange) < 0
                                  ? "text-green-400"
                                  : parseFloat(impact.latencyChange) > 0
                                  ? "text-red-400"
                                  : "text-gray-400"
                              }`}
                            >
                              {parseFloat(impact.latencyChange) > 0 ? "+" : ""}
                              {impact.latencyChange}ms
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-300">Health:</span>
                            <span
                              className={`font-mono ${
                                parseFloat(impact.healthChange) > 0
                                  ? "text-green-400"
                                  : parseFloat(impact.healthChange) < 0
                                  ? "text-red-400"
                                  : "text-gray-400"
                              }`}
                            >
                              {parseFloat(impact.healthChange) > 0 ? "+" : ""}
                              {impact.healthChange}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Impact indicator */}
                    <div className="mt-3 pt-2 border-t border-zinc-600">
                      <div className="text-xs text-zinc-400">
                        💡 Moving nodes closer reduces latency
                      </div>
                      <div className="text-xs text-zinc-400">
                        📊 Chaos testing works with current positions
                      </div>
                    </div>
                  </div>
                );
              })()}
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
                {/* CPU to Memory connections */}
                <line
                  x1={getNodePosition("node-1").x}
                  y1={getNodePosition("node-1").y}
                  x2={getNodePosition("node-14").x}
                  y2={getNodePosition("node-14").y}
                  stroke="rgb(16 185 129)"
                  strokeWidth="2"
                />
                <line
                  x1={getNodePosition("node-3").x}
                  y1={getNodePosition("node-3").y}
                  x2={getNodePosition("node-15").x}
                  y2={getNodePosition("node-15").y}
                  stroke="rgb(16 185 129)"
                  strokeWidth="2"
                />

                {/* CPU to Switch connections */}
                <line
                  x1={getNodePosition("node-1").x}
                  y1={getNodePosition("node-1").y}
                  x2={getNodePosition("node-5").x}
                  y2={getNodePosition("node-5").y}
                  stroke="rgb(52 211 153)"
                  strokeWidth="3"
                />
                <line
                  x1={getNodePosition("node-3").x}
                  y1={getNodePosition("node-3").y}
                  x2={getNodePosition("node-6").x}
                  y2={getNodePosition("node-6").y}
                  stroke="rgb(52 211 153)"
                  strokeWidth="3"
                />

                {/* Switch to Fabric connections */}
                <line
                  x1={getNodePosition("node-5").x}
                  y1={getNodePosition("node-5").y}
                  x2={getNodePosition("node-4").x}
                  y2={getNodePosition("node-4").y}
                  stroke="rgb(59 130 246)"
                  strokeWidth="4"
                />
                <line
                  x1={getNodePosition("node-6").x}
                  y1={getNodePosition("node-6").y}
                  x2={getNodePosition("node-4").x}
                  y2={getNodePosition("node-4").y}
                  stroke="rgb(59 130 246)"
                  strokeWidth="4"
                />

                {/* NIC to Fabric connections */}
                <line
                  x1={getNodePosition("node-16").x}
                  y1={getNodePosition("node-16").y}
                  x2={getNodePosition("node-4").x}
                  y2={getNodePosition("node-4").y}
                  stroke="rgb(5 150 105)"
                  strokeWidth="2"
                />
                <line
                  x1={getNodePosition("node-17").x}
                  y1={getNodePosition("node-17").y}
                  x2={getNodePosition("node-4").x}
                  y2={getNodePosition("node-4").y}
                  stroke="rgb(5 150 105)"
                  strokeWidth="2"
                />

                {/* Fabric to GPU connections */}
                <line
                  x1={getNodePosition("node-4").x}
                  y1={getNodePosition("node-4").y}
                  x2={getNodePosition("node-2").x}
                  y2={getNodePosition("node-2").y}
                  stroke="rgb(168 85 247)"
                  strokeWidth="3"
                />
                <line
                  x1={getNodePosition("node-4").x}
                  y1={getNodePosition("node-4").y}
                  x2={getNodePosition("node-7").x}
                  y2={getNodePosition("node-7").y}
                  stroke="rgb(168 85 247)"
                  strokeWidth="3"
                />
                <line
                  x1={getNodePosition("node-4").x}
                  y1={getNodePosition("node-4").y}
                  x2={getNodePosition("node-8").x}
                  y2={getNodePosition("node-8").y}
                  stroke="rgb(168 85 247)"
                  strokeWidth="3"
                />
                <line
                  x1={getNodePosition("node-4").x}
                  y1={getNodePosition("node-4").y}
                  x2={getNodePosition("node-9").x}
                  y2={getNodePosition("node-9").y}
                  stroke="rgb(168 85 247)"
                  strokeWidth="3"
                />

                {/* GPU to Storage connections */}
                <line
                  x1={getNodePosition("node-2").x}
                  y1={getNodePosition("node-2").y}
                  x2={getNodePosition("node-10").x}
                  y2={getNodePosition("node-10").y}
                  stroke="rgb(245 158 11)"
                  strokeWidth="2"
                />
                <line
                  x1={getNodePosition("node-7").x}
                  y1={getNodePosition("node-7").y}
                  x2={getNodePosition("node-11").x}
                  y2={getNodePosition("node-11").y}
                  stroke="rgb(245 158 11)"
                  strokeWidth="2"
                />
                <line
                  x1={getNodePosition("node-8").x}
                  y1={getNodePosition("node-8").y}
                  x2={getNodePosition("node-12").x}
                  y2={getNodePosition("node-12").y}
                  stroke="rgb(245 158 11)"
                  strokeWidth="2"
                />
                <line
                  x1={getNodePosition("node-9").x}
                  y1={getNodePosition("node-9").y}
                  x2={getNodePosition("node-13").x}
                  y2={getNodePosition("node-13").y}
                  stroke="rgb(245 158 11)"
                  strokeWidth="2"
                />

                {/* GPU cluster internal connections */}
                <line
                  x1={getNodePosition("node-2").x}
                  y1={getNodePosition("node-2").y}
                  x2={getNodePosition("node-7").x}
                  y2={getNodePosition("node-7").y}
                  stroke="rgb(52 211 153)"
                  strokeWidth="1"
                  className="opacity-40"
                />
                <line
                  x1={getNodePosition("node-8").x}
                  y1={getNodePosition("node-8").y}
                  x2={getNodePosition("node-9").x}
                  y2={getNodePosition("node-9").y}
                  stroke="rgb(52 211 153)"
                  strokeWidth="1"
                  className="opacity-40"
                />

                {/* Storage cross-connections */}
                <line
                  x1={getNodePosition("node-10").x}
                  y1={getNodePosition("node-10").y}
                  x2={getNodePosition("node-11").x}
                  y2={getNodePosition("node-11").y}
                  stroke="rgb(245 158 11)"
                  strokeWidth="1"
                  className="opacity-30"
                />
                <line
                  x1={getNodePosition("node-12").x}
                  y1={getNodePosition("node-12").y}
                  x2={getNodePosition("node-13").x}
                  y2={getNodePosition("node-13").y}
                  stroke="rgb(245 158 11)"
                  strokeWidth="1"
                  className="opacity-30"
                />
              </g>

              {/* Realistic Data Center Nodes */}
              <g>
                {/* CPU Tier */}
                <g
                  className={`cursor-pointer group transition-all duration-200 ${
                    grabbedNode === "node-1" ? "scale-110 drop-shadow-2xl" : ""
                  }`}
                >
                  <circle
                    cx={nodePositions["node-1"].x}
                    cy={nodePositions["node-1"].y}
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
                    className={`drop-shadow-lg transition-all duration-200 ${
                      grabbedNode === "node-1" ? "stroke-white stroke-2" : ""
                    }`}
                  />
                  <circle
                    cx={nodePositions["node-1"].x}
                    cy={nodePositions["node-1"].y}
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
                      cx={nodePositions["node-1"].x + 15}
                      cy={nodePositions["node-1"].y - 15}
                      r="4"
                      fill="rgb(239 68 68)"
                      className="animate-pulse"
                    />
                  )}
                  {components.find((c) => c.id === "cpu1")?.status ===
                    "degraded" && (
                    <circle
                      cx={nodePositions["node-1"].x + 15}
                      cy={nodePositions["node-1"].y - 15}
                      r="4"
                      fill="rgb(245 158 11)"
                      className="animate-pulse"
                    />
                  )}
                  <text
                    x={nodePositions["node-1"].x}
                    y={nodePositions["node-1"].y - 20}
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    CPU1
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x={nodePositions["node-1"].x - 80}
                    y={nodePositions["node-1"].y - 80}
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
                    cx={getNodePosition("node-14").x}
                    cy={getNodePosition("node-14").y}
                    r="16"
                    fill="rgb(34 197 94)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-14").x}
                    cy={getNodePosition("node-14").y}
                    r="12"
                    fill="rgb(21 128 61)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-14").x}
                    y={getNodePosition("node-14").y - 20}
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

                <g
                  className={`cursor-pointer group transition-all duration-200 ${
                    grabbedNode === "node-3" ? "scale-110 drop-shadow-2xl" : ""
                  }`}
                >
                  <circle
                    cx={nodePositions["node-3"].x}
                    cy={nodePositions["node-3"].y}
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
                    className={`drop-shadow-lg transition-all duration-200 ${
                      grabbedNode === "node-3" ? "stroke-white stroke-2" : ""
                    }`}
                  />
                  <circle
                    cx={nodePositions["node-3"].x}
                    cy={nodePositions["node-3"].y}
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
                      cx={nodePositions["node-3"].x + 15}
                      cy={nodePositions["node-3"].y - 15}
                      r="4"
                      fill="rgb(239 68 68)"
                      className="animate-pulse"
                    />
                  )}
                  {components.find((c) => c.id === "cpu2")?.status ===
                    "degraded" && (
                    <circle
                      cx={nodePositions["node-3"].x + 15}
                      cy={nodePositions["node-3"].y - 15}
                      r="4"
                      fill="rgb(245 158 11)"
                      className="animate-pulse"
                    />
                  )}
                  <text
                    x={nodePositions["node-3"].x}
                    y={nodePositions["node-3"].y - 20}
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    CPU2
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x={nodePositions["node-3"].x - 80}
                    y={nodePositions["node-3"].y - 80}
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
                    cx={getNodePosition("node-15").x}
                    cy={getNodePosition("node-15").y}
                    r="16"
                    fill="rgb(34 197 94)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-15").x}
                    cy={getNodePosition("node-15").y}
                    r="12"
                    fill="rgb(21 128 61)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-15").x}
                    y={getNodePosition("node-15").y - 20}
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
                    cx={getNodePosition("node-5").x}
                    cy={getNodePosition("node-5").y}
                    r="16"
                    fill="rgb(59 130 246)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-5").x}
                    cy={getNodePosition("node-5").y}
                    r="12"
                    fill="rgb(29 78 216)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-5").x}
                    y={getNodePosition("node-5").y - 20}
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
                    cx={getNodePosition("node-6").x}
                    cy={getNodePosition("node-6").y}
                    r="16"
                    fill="rgb(59 130 246)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-6").x}
                    cy={getNodePosition("node-6").y}
                    r="12"
                    fill="rgb(29 78 216)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-6").x}
                    y={getNodePosition("node-6").y - 20}
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
                <g
                  className={`cursor-pointer group transition-all duration-200 ${
                    grabbedNode === "node-4" ? "scale-110 drop-shadow-2xl" : ""
                  }`}
                >
                  <circle
                    cx={nodePositions["node-4"].x}
                    cy={nodePositions["node-4"].y}
                    r="22"
                    fill="rgb(156 163 175)"
                    className={`drop-shadow-lg transition-all duration-200 ${
                      grabbedNode === "node-4" ? "stroke-white stroke-2" : ""
                    }`}
                  />
                  <circle
                    cx={nodePositions["node-4"].x}
                    cy={nodePositions["node-4"].y}
                    r="18"
                    fill="rgb(107 114 128)"
                    className="opacity-80"
                  />
                  <text
                    x={nodePositions["node-4"].x}
                    y={nodePositions["node-4"].y - 30}
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    FABRIC
                  </text>
                  <text
                    x={nodePositions["node-4"].x}
                    y={nodePositions["node-4"].y + 40}
                    textAnchor="middle"
                    className="text-xs fill-zinc-400 font-light"
                  >
                    Astera Hub
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x={nodePositions["node-4"].x - 80}
                    y={nodePositions["node-4"].y - 80}
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
                <g
                  className={`cursor-pointer group transition-all duration-200 ${
                    grabbedNode === "node-2" ? "scale-110 drop-shadow-2xl" : ""
                  }`}
                >
                  <circle
                    cx={nodePositions["node-2"].x}
                    cy={nodePositions["node-2"].y}
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
                    className={`drop-shadow-lg transition-all duration-200 ${
                      grabbedNode === "node-2" ? "stroke-white stroke-2" : ""
                    }`}
                  />
                  <circle
                    cx={nodePositions["node-2"].x}
                    cy={nodePositions["node-2"].y}
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
                      cx={nodePositions["node-2"].x + 15}
                      cy={nodePositions["node-2"].y - 15}
                      r="4"
                      fill="rgb(239 68 68)"
                      className="animate-pulse"
                    />
                  )}
                  {components.find((c) => c.id === "gpu1")?.status ===
                    "degraded" && (
                    <circle
                      cx={nodePositions["node-2"].x + 15}
                      cy={nodePositions["node-2"].y - 15}
                      r="4"
                      fill="rgb(245 158 11)"
                      className="animate-pulse"
                    />
                  )}
                  <text
                    x={nodePositions["node-2"].x}
                    y={nodePositions["node-2"].y - 20}
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    GPU1
                  </text>

                  {/* Tooltip */}
                  <foreignObject
                    x={nodePositions["node-2"].x - 80}
                    y={nodePositions["node-2"].y - 80}
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
                    cx={getNodePosition("node-7").x}
                    cy={getNodePosition("node-7").y}
                    r="18"
                    fill="rgb(168 85 247)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-7").x}
                    cy={getNodePosition("node-7").y}
                    r="14"
                    fill="rgb(126 34 206)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-7").x}
                    y={getNodePosition("node-7").y - 20}
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
                    cx={getNodePosition("node-8").x}
                    cy={getNodePosition("node-8").y}
                    r="18"
                    fill="rgb(168 85 247)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-8").x}
                    cy={getNodePosition("node-8").y}
                    r="14"
                    fill="rgb(126 34 206)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-8").x}
                    y={getNodePosition("node-8").y - 20}
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
                    cx={getNodePosition("node-9").x}
                    cy={getNodePosition("node-9").y}
                    r="18"
                    fill="rgb(168 85 247)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-9").x}
                    cy={getNodePosition("node-9").y}
                    r="14"
                    fill="rgb(126 34 206)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-9").x}
                    y={getNodePosition("node-9").y - 20}
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
                    cx={getNodePosition("node-10").x}
                    cy={getNodePosition("node-10").y}
                    r="14"
                    fill="rgb(245 158 11)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-10").x}
                    cy={getNodePosition("node-10").y}
                    r="10"
                    fill="rgb(180 83 9)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-10").x}
                    y={getNodePosition("node-10").y + 25}
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
                    cx={getNodePosition("node-11").x}
                    cy={getNodePosition("node-11").y}
                    r="14"
                    fill="rgb(245 158 11)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-11").x}
                    cy={getNodePosition("node-11").y}
                    r="10"
                    fill="rgb(180 83 9)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-11").x}
                    y={getNodePosition("node-11").y + 25}
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
                    cx={getNodePosition("node-12").x}
                    cy={getNodePosition("node-12").y}
                    r="14"
                    fill="rgb(245 158 11)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-12").x}
                    cy={getNodePosition("node-12").y}
                    r="10"
                    fill="rgb(180 83 9)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-12").x}
                    y={getNodePosition("node-12").y + 25}
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
                    cx={getNodePosition("node-13").x}
                    cy={getNodePosition("node-13").y}
                    r="14"
                    fill="rgb(245 158 11)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-13").x}
                    cy={getNodePosition("node-13").y}
                    r="10"
                    fill="rgb(180 83 9)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-13").x}
                    y={getNodePosition("node-13").y + 25}
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
                    cx={getNodePosition("node-16").x}
                    cy={getNodePosition("node-16").y}
                    r="8"
                    fill="rgb(5 150 105)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-16").x}
                    y={getNodePosition("node-16").y - 15}
                    textAnchor="middle"
                    className="text-xs fill-white font-medium"
                  >
                    NIC1
                  </text>
                </g>

                <g className="cursor-pointer group">
                  <circle
                    cx={getNodePosition("node-17").x}
                    cy={getNodePosition("node-17").y}
                    r="12"
                    fill="rgb(16 185 129)"
                    className="drop-shadow-lg"
                  />
                  <circle
                    cx={getNodePosition("node-17").x}
                    cy={getNodePosition("node-17").y}
                    r="8"
                    fill="rgb(5 150 105)"
                    className="opacity-80"
                  />
                  <text
                    x={getNodePosition("node-17").x}
                    y={getNodePosition("node-17").y - 15}
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

            {/* Camera Feed - Only show when Computer Vision is enabled */}
            {cvEnabled && (
              <div className="absolute bottom-30 right-4 w-48 h-36 bg-zinc-900/90 backdrop-blur-sm rounded-lg border border-zinc-700/50 overflow-hidden z-20">
                {cameraStream ? (
                  <div className="relative w-full h-full">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      autoPlay
                      muted
                      playsInline
                      style={{ display: "block" }}
                    />
                    {/* Hidden canvas for frame capture */}
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                    {/* Debug overlay to show video element is there */}
                    <div className="absolute top-1 left-1 bg-green-500/80 text-white text-xs px-1 rounded">
                      FRONTEND CAM ({handTrackingData?.hands?.length || 0}{" "}
                      hands)
                    </div>
                    {/* Finger position debug */}
                    {screenFingerPositions.length > 0 && (
                      <div className="absolute bottom-1 left-1 bg-blue-500/80 text-white text-xs px-1 rounded">
                        Raw: ({Math.round(screenFingerPositions[0].x)},{" "}
                        {Math.round(screenFingerPositions[0].y)}){" "}
                        {smoothedPositions.length > 0 && (
                          <span className="text-green-300">
                            Smooth: ({Math.round(smoothedPositions[0].x)},{" "}
                            {Math.round(smoothedPositions[0].y)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                    <div className="text-center">
                      <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <div className="text-xs text-zinc-400">
                        Starting frontend camera...
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        Permission: {cameraPermission}
                      </div>
                    </div>
                  </div>
                )}
                {/* Hand tracking overlay */}
                {handTrackingData && handTrackingData.hands && (
                  <div className="absolute inset-0 pointer-events-none">
                    {handTrackingData.hands.map((hand: any, index: number) => (
                      <div key={index} className="absolute inset-0">
                        {/* Hand bounding box */}
                        <div
                          className="absolute border-2 border-blue-400 rounded-lg opacity-50"
                          style={{
                            left: `${hand.bounding_box.x * 100}%`,
                            top: `${hand.bounding_box.y * 100}%`,
                            width: `${hand.bounding_box.width * 100}%`,
                            height: `${hand.bounding_box.height * 100}%`,
                          }}
                        />
                        {/* Index finger tip */}
                        {hand.landmarks[8] && (
                          <div
                            className="absolute w-3 h-3 bg-red-400 rounded-full opacity-70"
                            style={{
                              left: `${hand.landmarks[8].x * 100}%`,
                              top: `${hand.landmarks[8].y * 100}%`,
                              transform: "translate(-50%, -50%)",
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* Camera status */}
                <div className="absolute bottom-1 left-1 bg-black/50 px-2 py-1 rounded text-xs text-white">
                  {handTrackingData?.hands?.length || 0} hands
                </div>
              </div>
            )}

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
