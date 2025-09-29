"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { synapseNetWS, SystemUpdate } from "../lib/websocket";
import localFont from "next/font/local";

const drukMedium = localFont({
  src: "./fonts/Druk-Medium-Trial.woff",
  display: "swap",
});

// Game mode gesture detection - matches backend gesture_recognition.py exactly
function detectGameGesture(hands: Array<any>): {
  gesture: string;
  confidence: number;
} {
  if (!hands || hands.length === 0) {
    return { gesture: "none", confidence: 0 };
  }

  // Helper function to count extended fingers for a single hand
  function countExtendedFingers(
    landmarks: Array<{ x: number; y: number }>
  ): number {
    if (!landmarks || landmarks.length < 21) return 0;

    // Get key points (MediaPipe hand landmarks)
    const thumb_tip = landmarks[4];
    const index_tip = landmarks[8];
    const middle_tip = landmarks[12];
    const ring_tip = landmarks[16];
    const pinky_tip = landmarks[20];
    const thumb_ip = landmarks[3];
    const index_pip = landmarks[6];
    const middle_pip = landmarks[10];
    const ring_pip = landmarks[14];
    const pinky_pip = landmarks[18];

    let fingers_up = 0;

    // Thumb (special case - compare x coordinates for horizontal movement)
    if (thumb_tip.x > thumb_ip.x) {
      fingers_up += 1;
    }

    // Other fingers (compare y coordinates - tip above PIP means extended)
    const finger_tips = [index_tip, middle_tip, ring_tip, pinky_tip];
    const finger_pips = [index_pip, middle_pip, ring_pip, pinky_pip];

    for (let i = 0; i < finger_tips.length; i++) {
      if (finger_tips[i].y < finger_pips[i].y) {
        // Tip above PIP = extended
        fingers_up += 1;
      }
    }

    return fingers_up;
  }

  // Helper function to check if hand is making scissors gesture (index + middle)
  function isScissorsGesture(
    landmarks: Array<{ x: number; y: number }>
  ): boolean {
    if (!landmarks || landmarks.length < 21) return false;

    const index_tip = landmarks[8];
    const middle_tip = landmarks[12];
    const ring_tip = landmarks[16];
    const pinky_tip = landmarks[20];
    const thumb_tip = landmarks[4];
    const index_pip = landmarks[6];
    const middle_pip = landmarks[10];
    const ring_pip = landmarks[14];
    const pinky_pip = landmarks[18];
    const thumb_ip = landmarks[3];

    // Index and middle fingers extended
    const index_extended = index_tip.y < index_pip.y;
    const middle_extended = middle_tip.y < middle_pip.y;

    // Other fingers folded
    const ring_folded = ring_tip.y > ring_pip.y;
    const pinky_folded = pinky_tip.y > pinky_pip.y;
    const thumb_folded = thumb_tip.x < thumb_ip.x;

    return (
      index_extended &&
      middle_extended &&
      ring_folded &&
      pinky_folded &&
      thumb_folded
    );
  }

  // Helper function to check if hand is making a fist
  function isFist(landmarks: Array<{ x: number; y: number }>): boolean {
    if (!landmarks || landmarks.length < 21) return false;

    const fingertips = [
      landmarks[4],
      landmarks[8],
      landmarks[12],
      landmarks[16],
      landmarks[20],
    ]; // Thumb, Index, Middle, Ring, Pinky
    const pips = [
      landmarks[3],
      landmarks[6],
      landmarks[10],
      landmarks[14],
      landmarks[18],
    ];

    let folded_count = 0;

    // Check thumb (x comparison)
    if (fingertips[0].x < pips[0].x) {
      folded_count += 1;
    }

    // Check other fingers (y comparison)
    for (let i = 1; i < 5; i++) {
      if (fingertips[i].y > pips[i].y) {
        // Tip below PIP = folded
        folded_count += 1;
      }
    }

    return folded_count >= 4; // At least 4 fingers folded
  }

  // Helper function to check if hand is open palm
  function isOpenPalm(landmarks: Array<{ x: number; y: number }>): boolean {
    const extended_fingers = countExtendedFingers(landmarks);
    return extended_fingers >= 4; // At least 4 fingers extended
  }

  // Check for Shield gesture (both hands open) - PRIORITY CHECK
  if (hands.length === 2) {
    const both_open = hands.every(
      (hand) => hand.landmarks && isOpenPalm(hand.landmarks)
    );

    if (both_open) {
      return { gesture: "shield", confidence: 0.9 };
    }
  }

  // Single hand gestures (use first detected hand)
  const first_hand = hands[0];
  if (!first_hand.landmarks || first_hand.landmarks.length < 21) {
    return { gesture: "none", confidence: 0 };
  }

  const landmarks = first_hand.landmarks;

  // Check for scissors (Cut gesture) - Index + Middle finger
  if (isScissorsGesture(landmarks)) {
    return { gesture: "cut", confidence: 0.9 };
  }

  // Check for fist (Heal gesture)
  if (isFist(landmarks)) {
    return { gesture: "heal", confidence: 0.9 };
  }

  // Check for open palm (Reroute gesture)
  if (isOpenPalm(landmarks)) {
    return { gesture: "reroute", confidence: 0.8 };
  }

  return { gesture: "none", confidence: 0 };
}

export default function Home() {
  const [systemData, setSystemData] = useState<SystemUpdate | null>(null);
  const [connectionState, setConnectionState] =
    useState<string>("disconnected");
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [chaosInjected, setChaosInjected] = useState(false);
  const [isHealing, setIsHealing] = useState(false);
  const [currentMode, setCurrentMode] = useState<"learn" | "game">("learn");
  const [gameState, setGameState] = useState<"menu" | "playing">("menu");
  const [gameScore, setGameScore] = useState(0);
  const [gameTime, setGameTime] = useState(0);
  const [currentGesture, setCurrentGesture] = useState<string>("none");
  const [gestureConfidence, setGestureConfidence] = useState(0);
  const [mlPredictions, setMLPredictions] = useState<any[]>([]);
  const [recentActions, setRecentActions] = useState<
    Array<{ action: string; timestamp: string; result: string }>
  >([]);

  // Game state
  const [currentRound, setCurrentRound] = useState(1);
  const [roundTimeLeft, setRoundTimeLeft] = useState(10);
  const [gamePhase, setGamePhase] = useState<
    "waiting" | "ai_attack" | "player_response" | "round_end" | "game_over"
  >("waiting");
  const [aiAttack, setAiAttack] = useState<{
    target: string;
    type: string;
    message: string;
    startTime: number;
  } | null>(null);
  const aiAttackRef = useRef<typeof aiAttack>(null);
  const [gameWon, setGameWon] = useState(false);
  const [aiPredictions, setAiPredictions] = useState<
    Array<{
      message: string;
      confidence: number;
      timestamp: number;
    }>
  >([]);
  // Removed losing-streak mechanics; keeping placeholder for minimal change surface
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [autoPredictionsActive, setAutoPredictionsActive] = useState(false);
  const [roundResolved, setRoundResolved] = useState(false);
  const [hintShownThisRound, setHintShownThisRound] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [particlesEnabled, setParticlesEnabled] = useState(true);

  // Simplified game topology (static for arcade mode)
  const gameTopology = useMemo(
    () => ({
      width: 800,
      height: 520,
      nodes: [
        { id: "core", label: "CORE", x: 400, y: 100, color: "#60a5fa" },
        {
          id: "retimerL",
          label: "RETIMER L",
          x: 220,
          y: 220,
          color: "#34d399",
        },
        {
          id: "retimerR",
          label: "RETIMER R",
          x: 580,
          y: 220,
          color: "#34d399",
        },
        { id: "edgeL1", label: "EDGE L1", x: 120, y: 360, color: "#f59e0b" },
        { id: "edgeL2", label: "EDGE L2", x: 260, y: 400, color: "#f59e0b" },
        { id: "edgeR1", label: "EDGE R1", x: 680, y: 360, color: "#f59e0b" },
        { id: "edgeR2", label: "EDGE R2", x: 540, y: 400, color: "#f59e0b" },
        {
          id: "storageL",
          label: "STORAGE L",
          x: 200,
          y: 500,
          color: "#a78bfa",
        },
        {
          id: "storageR",
          label: "STORAGE R",
          x: 600,
          y: 500,
          color: "#a78bfa",
        },
      ],
      links: [
        { id: "l1", s: "core", t: "retimerL" },
        { id: "l2", s: "core", t: "retimerR" },
        { id: "l3", s: "retimerL", t: "edgeL1" },
        { id: "l4", s: "retimerL", t: "edgeL2" },
        { id: "l5", s: "retimerR", t: "edgeR1" },
        { id: "l6", s: "retimerR", t: "edgeR2" },
        { id: "l7", s: "edgeL2", t: "storageL" },
        { id: "l8", s: "edgeR2", t: "storageR" },
      ],
    }),
    []
  );

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

    // Game Mode WebSocket handlers
    synapseNetWS.on("game_started", (data) => {
      console.log("🎮 Game started:", data);
      setGameState("playing");
      // Ensure simulator is running during game mode for ML hints
      synapseNetWS.startSimulation();
    });

    synapseNetWS.on("action_result", (data) => {
      console.log("🎯 Action result:", data);
      const newAction = {
        action: data.action,
        timestamp: new Date().toLocaleTimeString(),
        result: data.message,
      };
      setRecentActions((prev) => [newAction, ...prev.slice(0, 4)]); // Keep last 5 actions
    });

    synapseNetWS.on("ml_predictions", (data) => {
      console.log("🤖 ML predictions:", data);
      const count = Array.isArray(data.predictions)
        ? data.predictions.length
        : 0;
      console.log(`🤖 Received ${count} ML prediction(s)`);
      setMLPredictions(data.predictions || []);
    });

    // Learn Mode Computer Vision data
    synapseNetWS.on("learn_mode_cv_data", (data) => {
      console.log("🎥 Received CV data:", data);
      console.log("🎥 Current mode:", currentMode, "Game state:", gameState);
      setHandTrackingData(data);

      // Game Mode Gesture Recognition - work in all game mode states
      console.log("🎮 Checking gesture detection:", {
        currentMode,
        gameState,
        hasHands: data.hands && data.hands.length > 0,
        handsCount: data.hands?.length || 0,
      });

      // Use a more reliable way to check if we're in game mode
      const isGameMode = currentModeRef.current === "game";
      console.log(
        "🎮 Is game mode:",
        isGameMode,
        "Current mode value:",
        currentModeRef.current
      );

      if (isGameMode && data.hands && data.hands.length > 0) {
        console.log("🎮 Processing game mode gestures");

        // Use the updated gesture detection function that takes the full hands array
        const gesture = detectGameGesture(data.hands);
        console.log("🎮 Game gesture detected:", gesture);
        console.log("🎮 Raw hands data:", data.hands.length, "hands detected");

        if (gesture.gesture !== "none" && gesture.confidence > 0.7) {
          console.log(
            "✅ Valid gesture:",
            gesture.gesture,
            "confidence:",
            gesture.confidence
          );
          setCurrentGesture(gesture.gesture);
          setGestureConfidence(gesture.confidence);

          // Send action to backend
          synapseNetWS.sendPlayerAction(gesture.gesture);
        } else {
          console.log("❌ Gesture not confident enough:", gesture);
        }
      }

      // Map finger positions to screen coordinates and handle pinch gestures (only in learn mode)
      if (
        currentModeRef.current === "learn" &&
        data.hands &&
        data.hands.length > 0
      ) {
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
    console.log("🎥 Video useEffect triggered:", {
      hasVideoRef: !!videoRef.current,
      hasCameraStream: !!cameraStream,
      streamActive: cameraStream?.active,
      streamTracks: cameraStream?.getTracks().length,
    });

    if (videoRef.current && cameraStream && !videoRef.current.srcObject) {
      const video = videoRef.current;
      console.log("📹 Setting video srcObject");
      video.srcObject = cameraStream;

      // Only play if not already playing
      if (video.paused) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("✅ Video started playing");
            })
            .catch((error) => {
              console.error("❌ Video play failed:", error);
            });
        }
      }
    }
  }, [cameraStream]);

  // Start frame capture when CV is enabled (both learn and game modes)
  useEffect(() => {
    console.log("🎬 Frame capture check:", {
      currentMode,
      gameState,
      cvEnabled,
      hasCameraStream: !!cameraStream,
      hasVideoRef: !!videoRef.current,
      hasCanvasRef: !!canvasRef.current,
    });

    if (cvEnabled && cameraStream && videoRef.current && canvasRef.current) {
      console.log(
        `🎬 Starting frame capture (mode: ${currentMode}, state: ${gameState})`
      );
      const cleanup = startFrameCapture();
      return cleanup;
    }
  }, [currentMode, gameState, cvEnabled, cameraStream]);

  // Allow CV in Learn Mode; do not auto-disable when switching modes

  // Maintain lightweight latency history for sparkline (Learn Mode)
  useEffect(() => {
    if (currentMode !== "learn") return;
    const interval = setInterval(() => {
      const metrics = calculateTopologyHealth();
      const next = [...latencyHistory, parseFloat(metrics.avgLatency)].slice(
        -30
      );
      setLatencyHistory(next);
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, nodePositions]);

  // Pause particles when tab hidden for a sleeker/professional feel and performance
  useEffect(() => {
    const onVis = () => setParticlesEnabled(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Game timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState === "playing") {
      interval = setInterval(() => {
        setGameTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameState]);

  // Keep a live ref of current AI attack for timeout logic
  useEffect(() => {
    aiAttackRef.current = aiAttack;
  }, [aiAttack]);

  // SIMPLE Round timer - just count down
  useEffect(() => {
    if (gameState !== "playing") return;

    const interval = setInterval(() => {
      setRoundTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up - end round
          handleRoundEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState]);

  // SIMPLE Round end handler - guard against double-advance and increment round
  const handleRoundEnd = () => {
    // Prevent double increment if we've already ended the round or game
    if (gamePhase === "round_end" || gamePhase === "game_over") {
      return;
    }
    console.log(`⏰ Round ${currentRound} ended`);

    // Check if player didn't respond to active attack (use ref to avoid stale closure)
    if (aiAttackRef.current && !roundResolved) {
      setAiScore((prev) => prev + 100);
      setRoundResolved(true);
      // Clear the expired attack
      setAiAttack(null);
    }

    // Infinite play: no win condition by rounds

    // SIMPLE: Just add 1 to the round
    setCurrentRound((prev) => prev + 1);
    setGamePhase("waiting");
    setAiAttack(null);
    setRoundTimeLeft(10);
  };

  // AI Attack logic
  useEffect(() => {
    if (gameState !== "playing" || gamePhase !== "waiting") return;

    // Generate AI prediction before attack
    const generatePrediction = () => {
      const predictions = [
        "🔮 I predict a thermal overload incoming...",
        "🔮 Network bandwidth spike detected in 3 seconds...",
        "🔮 Memory corruption pattern identified...",
        "🔮 GPU failure probability: 85%...",
        "🔮 Storage degradation imminent...",
        "🔮 System overload in progress...",
        "🔮 Critical component failure detected...",
      ];

      const prediction =
        predictions[Math.floor(Math.random() * predictions.length)];
      const confidence = Math.random() * 0.4 + 0.6; // 60-100% confidence

      setAiPredictions((prev) => [
        ...prev.slice(-2),
        {
          message: prediction,
          confidence,
          timestamp: Date.now(),
        },
      ]);
    };

    // Generate prediction first
    generatePrediction();

    // Start AI attack after 1 second
    const attackTimer = setTimeout(() => {
      const targets = [
        "core",
        "retimerL",
        "retimerR",
        "edgeL1",
        "edgeL2",
        "edgeR1",
        "edgeR2",
        "storageL",
        "storageR",
      ];
      const attackTypes = ["thermal", "bandwidth", "latency", "error"];
      const target = targets[Math.floor(Math.random() * targets.length)];
      const type = attackTypes[Math.floor(Math.random() * attackTypes.length)];

      setAiAttack({
        target,
        type,
        message: `AI attacking ${target} with ${type} attack!`,
        startTime: Date.now(), // Track when attack started for grace period
      });
      setGamePhase("ai_attack");
      setHintShownThisRound(false);
      setRoundResolved(false);
      setMLPredictions([]);
    }, 1000);

    return () => clearTimeout(attackTimer);
  }, [gameState, gamePhase]);

  // Auto-trigger ML hints at 5s remaining during AI attack (tolerant <=5)
  useEffect(() => {
    if (gameState !== "playing" || gamePhase !== "ai_attack" || !aiAttack)
      return;
    if (roundTimeLeft <= 5 && roundTimeLeft > 0 && !hintShownThisRound) {
      console.log("🔮 Auto-triggering ML hints at 5s remaining...");
      setAutoPredictionsActive(true);
      setHintShownThisRound(true);
      synapseNetWS.getMLPredictions();
      // Fade the active indicator after a short time
      setTimeout(() => setAutoPredictionsActive(false), 3000);
    }
  }, [gameState, gamePhase, aiAttack, roundTimeLeft, hintShownThisRound]);

  // BULLETPROOF Gesture Detection
  useEffect(() => {
    // Only process when there's an active attack
    if (!aiAttack || gamePhase === "round_end") {
      return;
    }

    // Grace period - ignore gestures for 1 second after attack starts
    const timeSinceAttack = Date.now() - aiAttack.startTime;
    if (timeSinceAttack < 1000) {
      return;
    }

    // Only process valid gestures
    if (currentGesture === "none" || gestureConfidence < 0.6) {
      return;
    }

    console.log(
      `🎯 GESTURE: ${currentGesture} (${gestureConfidence}) vs ${getCorrectResponse(
        aiAttack.type
      )}`
    );

    // Check if gesture matches correct response
    if (currentGesture === getCorrectResponse(aiAttack.type)) {
      // Player responded - check if correct
      const correctResponse = getCorrectResponse(aiAttack.type);
      console.log(
        `🎯 Response Check: "${currentGesture}" vs "${correctResponse}" (attack: "${aiAttack.type}")`
      );
      console.log(`⏰ Time left in round: ${roundTimeLeft} seconds`);
      console.log(`✅ Strings match: ${currentGesture === correctResponse}`);

      if (currentGesture === correctResponse) {
        // Correct response!
        const points = 100;
        setPlayerScore((prev) => prev + points);
        setGameScore((prev) => prev + points);
        setRecentActions((prev) => [
          {
            action: `✅ Defended ${aiAttack.target} with ${currentGesture}`,
            timestamp: new Date().toLocaleTimeString(),
            result: "Success",
          },
          ...prev.slice(0, 4),
        ]);
      } else {
        // Wrong response
        const penalty = 50;
        setPlayerScore((prev) => Math.max(0, prev - penalty));
        setGameScore((prev) => Math.max(0, prev - penalty));
        setAiScore((prev) => prev + 100); // AI gets points for successful attack

        setRecentActions((prev) => [
          {
            action: `❌ Wrong! Used ${currentGesture}, needed ${correctResponse} for ${aiAttack.type}`,
            timestamp: new Date().toLocaleTimeString(),
            result: "Failed",
          },
          ...prev.slice(0, 4),
        ]);

        // Keep playing: do not end game; losing streak tracked in UI
      }

      // Clear attack and move to next phase (successful response)
      setAiAttack(null);
      setGamePhase("round_end");

      // Move to next round after successful response
      setTimeout(() => {
        // Infinite play: always proceed to next round
        setCurrentRound((prev) => prev + 1);
        setGamePhase("waiting");
        setRoundTimeLeft(10);
      }, 1000);
    } else {
      // Gesture detected but not meeting criteria
      if (currentGesture !== "none") {
        console.log(`❌ Gesture detected but not valid: "${currentGesture}"`);
        console.log(`❌ Confidence too low: ${gestureConfidence} (need > 0.7)`);
      }
    }
  }, [currentGesture, gestureConfidence, gamePhase, aiAttack]);

  // Helper function to get correct response
  const getCorrectResponse = (attackType: string) => {
    switch (attackType) {
      case "thermal":
        return "heal";
      case "bandwidth":
        return "reroute";
      case "latency":
        return "cut";
      case "error":
        return "shield";
      default:
        return "heal";
    }
  };

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

  // Ref to track current mode for WebSocket handlers
  const currentModeRef = useRef<"learn" | "game">("learn");

  // Callback ref to handle video element mounting
  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node) {
        videoRef.current = node;
        console.log("📹 Video element mounted via callback ref");

        // If we have a camera stream, set it up immediately
        if (cameraStream && !node.srcObject) {
          console.log("📹 Setting up stream on mounted video element");
          node.srcObject = cameraStream;
          // Don't call play() here - let the useEffect handle it to avoid conflicts
        }

        // Trigger frame capture if everything is ready
        if (cvEnabled && cameraStream && canvasRef.current) {
          console.log("🎬 Video mounted - triggering frame capture check");
          // Small delay to ensure everything is ready
          setTimeout(() => {
            if (videoRef.current && canvasRef.current) {
              console.log("🎬 Starting frame capture from video mount");
              startFrameCapture();
            }
          }, 100);
        }
      }
    },
    [cameraStream, cvEnabled]
  );

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
    if (!videoRef.current || !canvasRef.current) {
      console.log("❌ Capture frame failed - missing refs:", {
        hasVideoRef: !!videoRef.current,
        hasCanvasRef: !!canvasRef.current,
      });
      return null;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      console.log("❌ Capture frame failed - no canvas context");
      return null;
    }

    // Reduce canvas size for faster processing (320x240 instead of full resolution)
    const targetWidth = 320;
    const targetHeight = 240;
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Draw video frame to canvas (scaled down)
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    // Convert to base64 with lower quality for faster transmission
    const frameData = canvas.toDataURL("image/jpeg", 0.6);
    console.log("✅ Frame captured successfully, size:", frameData.length);
    return frameData;
  };

  const startFrameCapture = () => {
    console.log("🎬 Starting frame capture...", {
      cvEnabled,
      hasVideoRef: !!videoRef.current,
      hasCanvasRef: !!canvasRef.current,
      connectionState: synapseNetWS.getConnectionState(),
    });

    if (!cvEnabled) {
      console.log("❌ Frame capture not started - CV not enabled");
      return;
    }

    let frameCount = 0;
    const interval = setInterval(() => {
      frameCount++;

      // Only send every 2nd frame to reduce processing load
      if (frameCount % 2 === 0) {
        const frameData = captureFrame();
        if (frameData && synapseNetWS.getConnectionState() === "connected") {
          // Send frame to backend for processing
          console.log("📤 Sending frame to backend...", "Mode:", currentMode);
          synapseNetWS.send({
            type: "cv_frame",
            frame: frameData,
            timestamp: Date.now().toString(),
          });
        } else {
          console.log("❌ Frame capture failed:", {
            hasFrameData: !!frameData,
            connectionState: synapseNetWS.getConnectionState(),
            cvEnabled,
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

      // Enable CV and set camera stream (frame capture will start on game screen)
      setCvEnabled(true);
      setCameraStream(stream); // Make sure stream is set

      console.log("✅ Computer Vision enabled - using frontend camera");
      console.log("📹 Camera stream set:", !!stream);
      console.log("📹 Frame capture will start when entering game screen");
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
        // setDragStartTime(now); // Removed unused variable
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
      // setDragStartTime(0); // Removed unused variable

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
      {/* Ambient gradient glow background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute -top-40 -left-32 h-80 w-80 rounded-full blur-3xl opacity-20"
          style={{
            background:
              "radial-gradient(closest-side, rgba(59,130,246,0.6), rgba(59,130,246,0))",
          }}
        />
        <div
          className="absolute -bottom-32 right-0 h-96 w-96 rounded-full blur-3xl opacity-15"
          style={{
            background:
              "radial-gradient(closest-side, rgba(34,197,94,0.5), rgba(34,197,94,0))",
          }}
        />
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 h-72 w-[28rem] rounded-full blur-3xl opacity-10"
          style={{
            background:
              "radial-gradient(closest-side, rgba(14,165,233,0.5), rgba(14,165,233,0))",
          }}
        />
      </div>
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

      {/* Debug Toggle Button */}

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
      <header className="bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800/50 px-6 py-3 relative">
        {/* Header underline gradient accent */}
        <div
          className="pointer-events-none absolute inset-x-0 -bottom-[1px] h-[1px]"
          style={{
            background:
              "linear-gradient(90deg, rgba(84,206,199,0), rgba(84,206,199,0.4), rgba(84,206,199,0))",
          }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/Logo.avif"
              alt="Lattice Logo"
              className="h-11 w-11 object-contain select-none"
              draggable={false}
            />
            <h1
              className={`${drukMedium.className} text-4xl tracking-wide italic inline-block origin-left scale-x-[2.08] bg-clip-text text-transparent`}
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #71d4f3, #38bdf8 60%, #71d4f3)",
              }}
            >
              <span className="text-[#ffffff]">L</span>
              <span className="text-[#ffffff]">A</span>
              <span className="text-[#ffffff]">T</span>
              <span className="text-[#ffffff]">T</span>
              <span className="text-[#54cec7]">I</span>
              <span className="text-[#ffffff]">C</span>
              <span className="text-[#ffffff]">E</span>
            </h1>
          </div>
          <div className="flex items-center space-x-8">
            <div className="text-sm font-medium">
              <span className="text-zinc-400">Resilience</span>
              <span className="font-semibold ml-3 bg-gradient-to-r from-emerald-400 to-cyan-300 bg-clip-text text-transparent">
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
                  onClick={async () => {
                    console.log("🎓 Switching to learn mode");
                    setCurrentMode("learn");
                    currentModeRef.current = "learn";
                    // Disable CV when switching to learn mode to avoid conflicts
                    if (cvEnabled) {
                      await disableComputerVision();
                    }
                    // Reset game state when switching to learn mode
                    if (gameState === "playing") {
                      setGameState("menu");
                      setGamePhase("waiting");
                    }
                    console.log("🎓 Learn mode set, ref updated");
                  }}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    currentMode === "learn"
                      ? "bg-blue-600 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  🎓 Learn Mode
                </button>
                <button
                  onClick={async () => {
                    console.log("🎮 Switching to game mode");
                    setCurrentMode("game");
                    currentModeRef.current = "game";
                    // Disable CV when switching to game mode to force re-enabling
                    if (cvEnabled) {
                      await disableComputerVision();
                    }
                    // Reset game state when switching to game mode
                    setGameState("menu");
                    setGamePhase("waiting");
                    console.log(
                      "🎮 Game mode set, current mode should be:",
                      "game"
                    );
                  }}
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

            {/* Control Buttons - Only in Learn Mode */}
            {currentMode === "learn" && (
              <div className="flex space-x-2">
                {!simulationRunning ? (
                  <button
                    onClick={handleStartSimulation}
                    disabled={!isOnline}
                    className="px-3 py-1.5 text-xs rounded-lg cursor-pointer select-none bg-gradient-to-b from-emerald-600 to-emerald-500 text-white border border-emerald-400/30 shadow-[0_4px_12px_rgba(16,185,129,0.25)] hover:shadow-[0_6px_16px_rgba(16,185,129,0.35)] hover:from-emerald-500 hover:to-emerald-400 transition-all disabled:bg-gray-600 disabled:to-gray-600 disabled:border-gray-500/30 disabled:shadow-none disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  >
                    Start Sim
                  </button>
                ) : (
                  <button
                    onClick={handleStopSimulation}
                    disabled={!isOnline}
                    className="px-3 py-1.5 text-xs rounded-lg cursor-pointer select-none bg-gradient-to-b from-zinc-600 to-zinc-500 text-white border border-zinc-400/20 shadow-[0_3px_10px_rgba(0,0,0,0.25)] hover:from-zinc-500 hover:to-zinc-400 hover:shadow-[0_5px_14px_rgba(0,0,0,0.3)] transition-all disabled:bg-gray-600 disabled:border-gray-500/30 disabled:shadow-none disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-zinc-300/30"
                  >
                    Stop Sim
                  </button>
                )}
                <button
                  onClick={handleInjectChaos}
                  disabled={!isOnline || !simulationRunning}
                  className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer select-none text-white transition-colors focus:outline-none ${
                    chaosInjected
                      ? "bg-orange-600 hover:bg-orange-500 border border-orange-500/25 shadow-[0_2px_8px_rgba(234,88,12,0.25)] focus:ring-2 focus:ring-orange-400/30"
                      : "bg-red-600 hover:bg-red-500 border border-red-500/25 shadow-[0_2px_8px_rgba(239,68,68,0.25)] focus:ring-2 focus:ring-red-400/30"
                  } disabled:bg-gray-600 disabled:border-gray-500/30 disabled:shadow-none disabled:text-gray-300 disabled:cursor-not-allowed`}
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
            )}
          </div>
        </div>
      </header>

      {/* Game Mode Gesture Controls Row */}
      {currentMode === "game" && gameState === "playing" && (
        <div className="bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800/30 p-4 relative">
          <div
            className="pointer-events-none absolute inset-x-0 -bottom-[1px] h-[1px]"
            style={{
              background:
                "linear-gradient(90deg, rgba(84,206,199,0), rgba(84,206,199,0.4), rgba(84,206,199,0))",
            }}
          />
          <div className="flex items-center justify-between">
            {/* Gesture Status */}
            <div className="flex items-center space-x-6">
              <div>
                <h3 className="text-sm font-medium text-zinc-200 mb-2">
                  Gesture Recognition
                </h3>
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      cvEnabled ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                    }`}
                  ></div>
                  <span className="text-sm text-white">
                    {cvEnabled ? "Camera Active" : "Camera Disabled"}
                  </span>
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  Current:{" "}
                  <span className="text-white font-medium">
                    {currentGesture.toUpperCase()}
                  </span>{" "}
                  • Confidence: {Math.round(gestureConfidence * 100)}%
                </div>
              </div>

              {/* Gesture Controls */}
              <div className="grid grid-cols-4 gap-3 text-center text-xs">
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <div className="text-lg mb-1">✌️</div>
                  <div className="text-white font-medium text-xs">CUT</div>
                  <div className="text-zinc-400 text-xs">Scissors</div>
                </div>
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                  <div className="text-lg mb-1">✊</div>
                  <div className="text-white font-medium text-xs">HEAL</div>
                  <div className="text-zinc-400 text-xs">Fist</div>
                </div>
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                  <div className="text-lg mb-1">✋</div>
                  <div className="text-white font-medium text-xs">REROUTE</div>
                  <div className="text-zinc-400 text-xs">Palm</div>
                </div>
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                  <div className="text-lg mb-1">🙌</div>
                  <div className="text-white font-medium text-xs">SHIELD</div>
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
                {recentActions.length > 0 ? (
                  recentActions.map((action, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center"
                    >
                      <span className="text-zinc-500">{action.timestamp}</span>
                      <span className="text-white">{action.action}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-zinc-500 text-center">
                    No actions yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-screen overflow-hidden">
        {/* Left Sidebar - Connectivity Health */}
        {currentMode === "learn" && (
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
                      ? `${Math.round(
                          systemData.telemetry.total_bandwidth
                        )} GB/s`
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
                          c.component_type === "memory" &&
                          c.status === "healthy"
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
                  className={`w-2 h-2 rounded-full ${getStatusColor(
                    resilience
                  )}`}
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
        )}

        {/* Main Content Area - Only in Learn Mode */}
        {currentMode === "learn" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Features Section */}
            <div className="bg-zinc-900/20 backdrop-blur-sm border-b border-zinc-800/30 p-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="text-lg">🔥</div>
                    <div className="text-white font-medium text-xs">
                      Inject Chaos
                    </div>
                  </div>
                  <div className="text-zinc-300 text-xs">
                    Simulate failures to stress-test communication, routing, and
                    resilience.
                  </div>
                </div>
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
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
                <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
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
                <div className="relative bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
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
                    className={`w-full px-3 py-1.5 text-xs rounded-lg font-medium select-none transition-all focus:outline-none ${
                      cvLoading
                        ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                        : cvEnabled
                        ? "bg-gradient-to-b from-red-600 to-red-500 text-white border border-red-400/30 shadow-[0_4px_12px_rgba(239,68,68,0.25)] hover:from-red-500 hover:to-red-400 focus:ring-2 focus:ring-red-400/40"
                        : "bg-gradient-to-b from-blue-600 to-blue-500 text-white border border-blue-400/30 shadow-[0_4px_12px_rgba(59,130,246,0.25)] hover:from-blue-500 hover:to-blue-400 focus:ring-2 focus:ring-blue-400/40"
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

            {/* Node Visualization Area */}
            <div className="flex-1 bg-zinc-950 relative overflow-hidden">
              <div className="absolute top-4 left-4 bg-zinc-900/80 backdrop-blur-sm rounded-lg px-3 py-1 border border-zinc-700/50">
                <span className="text-sm font-medium text-zinc-200">
                  Live Data Center Topology
                </span>
              </div>

              {/* Real-time Topology Metrics */}
              <div className="absolute top-15 left-4 bg-zinc-900/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-zinc-700/50 w-[190px] shadow-[0_4px_20px_rgba(0,0,0,0.35)] relative">
                <div
                  className="pointer-events-none absolute inset-x-0 -top-[1px] h-[1px]"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(56,189,248,0), rgba(56,189,248,0.6), rgba(56,189,248,0))",
                  }}
                />
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-semibold text-zinc-200">
                    Topology Health
                  </span>
                </div>

                {currentMode === "learn" && isInDragSession && (
                  <div className="mb-2 p-2 rounded-md bg-blue-900/60 border border-blue-400/60 text-[11px] text-blue-100 shadow-[0_0_15px_rgba(59,130,246,0.6)]">
                    💡 Notice changes here while dragging: Avg Latency and
                    Health update live.
                  </div>
                )}

                {(() => {
                  const metrics = calculateTopologyHealth();
                  const impact = calculateMovementImpact();

                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">
                          Avg Latency:
                        </span>
                        <span
                          className={`text-xs font-mono tabular-nums ${
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
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">
                          Health Score:
                        </span>
                        <span
                          className={`text-xs font-mono tabular-nums ${
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

                      {/* Latency Sparkline */}
                      {latencyHistory.length > 1 && (
                        <svg viewBox="0 0 100 24" className="w-full h-6 mt-2">
                          <polyline
                            fill="none"
                            stroke="rgba(34,211,238,0.7)"
                            strokeWidth="1.5"
                            points={(() => {
                              const vals = latencyHistory;
                              const min = Math.min(...vals);
                              const max = Math.max(...vals);
                              const range = Math.max(0.001, max - min);
                              return vals
                                .map((v, i) => {
                                  const x = (i / (vals.length - 1)) * 100;
                                  const y = 24 - ((v - min) / range) * 24;
                                  return `${x},${y}`;
                                })
                                .join(" ");
                            })()}
                          />
                        </svg>
                      )}

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
                                {parseFloat(impact.latencyChange) > 0
                                  ? "+"
                                  : ""}
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
                      grabbedNode === "node-1"
                        ? "scale-110 drop-shadow-2xl"
                        : ""
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
                      height="170"
                      className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    >
                      <div className="relative z-[999] bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                        <div className="font-medium text-emerald-400">
                          Intel Xeon Platinum 8480+
                        </div>
                        <div className="text-zinc-300">
                          56 cores, 2.0-3.8 GHz
                        </div>
                        <div className="text-zinc-400">350W TDP, PCIe 5.0</div>
                        <div className="text-zinc-400">
                          Aries Retimer Enabled
                        </div>
                        {currentMode === "learn" && (
                          <div className="mt-2 pt-2 border-t border-zinc-600/50 text-blue-300">
                            💡 Try chaos injection to see how this CPU responds
                            to failures!
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
                      grabbedNode === "node-3"
                        ? "scale-110 drop-shadow-2xl"
                        : ""
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
                      height="140"
                      className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    >
                      <div className="bg-zinc-800/95 backdrop-blur-sm rounded-lg p-3 border border-zinc-600/50 text-xs text-white shadow-xl">
                        <div className="font-medium text-emerald-400">
                          Intel Xeon Platinum 8480+
                        </div>
                        <div className="text-zinc-300">
                          56 cores, 2.0-3.8 GHz
                        </div>
                        <div className="text-zinc-400">350W TDP, PCIe 5.0</div>
                        <div className="text-zinc-400">
                          Aries Retimer Enabled
                        </div>
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
                      grabbedNode === "node-4"
                        ? "scale-110 drop-shadow-2xl"
                        : ""
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
                        <div className="text-zinc-300">
                          Multi-protocol fabric
                        </div>
                        <div className="text-zinc-400">PCIe/CXL/Ethernet</div>
                        <div className="text-zinc-400">Scorpio Switch Core</div>
                      </div>
                    </foreignObject>
                  </g>

                  {/* GPU Compute Tier */}
                  <g
                    className={`cursor-pointer group transition-all duration-200 ${
                      grabbedNode === "node-2"
                        ? "scale-110 drop-shadow-2xl"
                        : ""
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
                      height="140"
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
                        <div className="text-zinc-400">
                          Smart Cable Connected
                        </div>
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
                      height="140"
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
                        <div className="text-zinc-400">
                          Smart Cable Connected
                        </div>
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
                      height="140"
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
                        <div className="text-zinc-400">
                          Smart Cable Connected
                        </div>
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
                      height="140"
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
                        <div className="text-zinc-400">
                          Smart Cable Connected
                        </div>
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
                        <div className="text-zinc-300">
                          7.68TB NVMe, 7000MB/s
                        </div>
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
                        <div className="text-zinc-300">
                          7.68TB NVMe, 7000MB/s
                        </div>
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
                        <div className="text-zinc-300">
                          7.68TB NVMe, 7000MB/s
                        </div>
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
                        <div className="text-zinc-300">
                          7.68TB NVMe, 7000MB/s
                        </div>
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

                {/* Data Flow Particles - follow live connections */}
                <defs>
                  <path
                    id="p_cpu1_fabric"
                    d={`M ${getNodePosition("node-1").x},${
                      getNodePosition("node-1").y
                    } L ${getNodePosition("node-4").x},${
                      getNodePosition("node-4").y
                    }`}
                  />
                  <path
                    id="p_cpu2_fabric"
                    d={`M ${getNodePosition("node-3").x},${
                      getNodePosition("node-3").y
                    } L ${getNodePosition("node-4").x},${
                      getNodePosition("node-4").y
                    }`}
                  />
                  <path
                    id="p_fabric_gpu1"
                    d={`M ${getNodePosition("node-4").x},${
                      getNodePosition("node-4").y
                    } L ${getNodePosition("node-2").x},${
                      getNodePosition("node-2").y
                    }`}
                  />
                  <path
                    id="p_fabric_gpu3"
                    d={`M ${getNodePosition("node-4").x},${
                      getNodePosition("node-4").y
                    } L ${getNodePosition("node-8").x},${
                      getNodePosition("node-8").y
                    }`}
                  />
                  <path
                    id="p_gpu1_ssd1"
                    d={`M ${getNodePosition("node-2").x},${
                      getNodePosition("node-2").y
                    } L ${getNodePosition("node-10").x},${
                      getNodePosition("node-10").y
                    }`}
                  />
                  <path
                    id="p_nic1_fabric"
                    d={`M ${getNodePosition("node-16").x},${
                      getNodePosition("node-16").y
                    } L ${getNodePosition("node-4").x},${
                      getNodePosition("node-4").y
                    }`}
                  />
                  <path
                    id="p_nic2_fabric"
                    d={`M ${getNodePosition("node-17").x},${
                      getNodePosition("node-17").y
                    } L ${getNodePosition("node-4").x},${
                      getNodePosition("node-4").y
                    }`}
                  />
                  <path
                    id="p_cpu1_mem1"
                    d={`M ${getNodePosition("node-1").x},${
                      getNodePosition("node-1").y
                    } L ${getNodePosition("node-14").x},${
                      getNodePosition("node-14").y
                    }`}
                  />
                  <path
                    id="p_cpu2_mem2"
                    d={`M ${getNodePosition("node-3").x},${
                      getNodePosition("node-3").y
                    } L ${getNodePosition("node-15").x},${
                      getNodePosition("node-15").y
                    }`}
                  />
                </defs>
                <g className={`opacity-60 ${particlesEnabled ? "" : "hidden"}`}>
                  {/* particles along CPU <-> Fabric */}
                  {["p_cpu1_fabric", "p_cpu2_fabric"].map((pid, i) => (
                    <g key={pid + i}>
                      <circle
                        r="2"
                        fill="rgb(52 211 153)"
                        style={{ filter: "blur(0.5px)" }}
                      >
                        <animateMotion
                          dur={`${2.2 + i * 0.6}s`}
                          repeatCount="indefinite"
                          begin={`${i * 0.4}s`}
                        >
                          <mpath href={`#${pid}`} />
                        </animateMotion>
                      </circle>
                      <circle
                        r="2"
                        fill="rgb(16 185 129)"
                        style={{ opacity: 0.7, filter: "blur(0.5px)" }}
                      >
                        <animateMotion
                          dur={`${3 + i * 0.7}s`}
                          repeatCount="indefinite"
                          begin={`${0.8 + i * 0.5}s`}
                        >
                          <mpath href={`#${pid}`} />
                        </animateMotion>
                      </circle>
                    </g>
                  ))}

                  {/* particles along Fabric -> GPUs */}
                  {["p_fabric_gpu1", "p_fabric_gpu3"].map((pid, i) => (
                    <g key={pid + i}>
                      <circle
                        r="2"
                        fill="rgb(168 85 247)"
                        style={{ opacity: 0.75, filter: "blur(0.5px)" }}
                      >
                        <animateMotion
                          dur={`${2.5 + i * 0.5}s`}
                          repeatCount="indefinite"
                          begin={`${i * 0.3}s`}
                        >
                          <mpath href={`#${pid}`} />
                        </animateMotion>
                      </circle>
                      <circle
                        r="2"
                        fill="rgb(126 34 206)"
                        style={{ opacity: 0.65, filter: "blur(0.6px)" }}
                      >
                        <animateMotion
                          dur={`${3.2 + i * 0.4}s`}
                          repeatCount="indefinite"
                          begin={`${0.6 + i * 0.4}s`}
                        >
                          <mpath href={`#${pid}`} />
                        </animateMotion>
                      </circle>
                    </g>
                  ))}

                  {/* particles along GPU -> Storage */}
                  <g>
                    <circle
                      r="2"
                      fill="rgb(245 158 11)"
                      style={{ opacity: 0.7, filter: "blur(0.4px)" }}
                    >
                      <animateMotion
                        dur="3.2s"
                        repeatCount="indefinite"
                        begin="0s"
                      >
                        <mpath href="#p_gpu1_ssd1" />
                      </animateMotion>
                    </circle>
                    <circle
                      r="2"
                      fill="rgb(234 179 8)"
                      style={{ opacity: 0.6, filter: "blur(0.4px)" }}
                    >
                      <animateMotion
                        dur="2.8s"
                        repeatCount="indefinite"
                        begin="0.9s"
                      >
                        <mpath href="#p_gpu1_ssd1" />
                      </animateMotion>
                    </circle>
                  </g>

                  {/* particles along NICs -> Fabric */}
                  {["p_nic1_fabric", "p_nic2_fabric"].map((pid, i) => (
                    <g key={pid + i}>
                      <circle
                        r="2"
                        fill="rgb(59 130 246)"
                        style={{ opacity: 0.7, filter: "blur(0.5px)" }}
                      >
                        <animateMotion
                          dur={`${2.8 + i * 0.4}s`}
                          repeatCount="indefinite"
                          begin={`${i * 0.2}s`}
                        >
                          <mpath href={`#${pid}`} />
                        </animateMotion>
                      </circle>
                      <circle
                        r="2"
                        fill="rgb(96 165 250)"
                        style={{ opacity: 0.6, filter: "blur(0.6px)" }}
                      >
                        <animateMotion
                          dur={`${3.6 + i * 0.5}s`}
                          repeatCount="indefinite"
                          begin={`${0.7 + i * 0.3}s`}
                        >
                          <mpath href={`#${pid}`} />
                        </animateMotion>
                      </circle>
                    </g>
                  ))}

                  {/* particles along CPU -> Memory */}
                  {["p_cpu1_mem1", "p_cpu2_mem2"].map((pid, i) => (
                    <g key={pid + i}>
                      <circle
                        r="2"
                        fill="rgb(34 197 94)"
                        style={{ opacity: 0.7, filter: "blur(0.4px)" }}
                      >
                        <animateMotion
                          dur={`${2.4 + i * 0.4}s`}
                          repeatCount="indefinite"
                          begin={`${i * 0.3}s`}
                        >
                          <mpath href={`#${pid}`} />
                        </animateMotion>
                      </circle>
                    </g>
                  ))}
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
                      {handTrackingData.hands.map(
                        (hand: any, index: number) => (
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
                        )
                      )}
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
                      <div
                        key={comp.id}
                        className="flex items-center space-x-2"
                      >
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
                          {
                            components.filter((c) => c.status === "failed")
                              .length
                          }{" "}
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
          </div>
        )}

        {/* Game Mode */}
        {currentMode === "game" && (
          <div className="flex-1 flex flex-col bg-zinc-950">
            {/* Game Mode Content */}
            <div className="flex-1 flex flex-col justify-start pt-4 pb-4 overflow-y-auto">
              {gameState === "menu" ? (
                <div className="text-center max-w-xl mx-auto px-4">
                  <div className="text-4xl mb-2">🎮</div>
                  <h2 className="text-xl font-bold text-white mb-1">
                    Game Mode
                  </h2>
                  <p className="text-zinc-400 mb-4 text-sm">
                    Battle the AI! Use gestures to defend your system.
                  </p>
                  <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3 mb-4">
                    <div className="text-blue-300 font-medium mb-1 text-sm">
                      📹 Camera Required
                    </div>
                    <div className="text-blue-200 text-xs mb-2">
                      Enable computer vision to use gesture controls during
                      gameplay.
                    </div>
                    {!cvEnabled ? (
                      <button
                        onClick={enableComputerVision}
                        disabled={cvLoading}
                        className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
                      >
                        {cvLoading ? "Loading..." : "📹 Enable Camera for Game"}
                      </button>
                    ) : (
                      <div className="flex items-center justify-center space-x-2 text-green-400">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="text-sm">Camera Ready!</span>
                      </div>
                    )}
                  </div>
                  <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-6 border border-zinc-700/30 max-w-md mb-6">
                    <h3 className="text-lg font-semibold text-white mb-3">
                      🤖 AI vs You
                    </h3>
                    <p className="text-sm text-zinc-300 mb-4">
                      The AI will attack your system and you'll need to use
                      gestures to defend it.
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-zinc-800/40 rounded-lg p-3">
                        <div className="text-lg mb-1">✌️</div>
                        <div className="text-white font-medium">Cut</div>
                        <div className="text-zinc-400">Isolate problems</div>
                      </div>
                      <div className="bg-zinc-800/40 rounded-lg p-3">
                        <div className="text-lg mb-1">✊</div>
                        <div className="text-white font-medium">Heal</div>
                        <div className="text-zinc-400">Fix components</div>
                      </div>
                      <div className="bg-zinc-800/40 rounded-lg p-3">
                        <div className="text-lg mb-1">✋</div>
                        <div className="text-white font-medium">Reroute</div>
                        <div className="text-zinc-400">Redirect traffic</div>
                      </div>
                      <div className="bg-zinc-800/40 rounded-lg p-3">
                        <div className="text-lg mb-1">🙌</div>
                        <div className="text-white font-medium">Shield</div>
                        <div className="text-zinc-400">Boost resilience</div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!cvEnabled) {
                        alert(
                          "Please enable computer vision first to use gesture controls!"
                        );
                        return;
                      }

                      console.log("🎮 Starting game with CV enabled");
                      setGameState("playing");
                      setCurrentRound(1);
                      setRoundTimeLeft(10);
                      setGamePhase("waiting");
                      setGameScore(0);
                      setPlayerScore(0);
                      setAiScore(0);
                      setConsecutiveLosses(0);
                      setGameWon(false);
                      setAiAttack(null);
                      setMLPredictions([]);
                      setAiPredictions([]);
                      setRecentActions([]);
                      synapseNetWS.startGame();
                    }}
                    disabled={!cvEnabled}
                    className={`font-semibold py-2 px-6 rounded-lg transition-colors text-sm ${
                      cvEnabled
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-gray-600 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {cvEnabled ? "🚀 Start Game" : "📹 Enable CV First"}
                  </button>
                </div>
              ) : (
                <div className="flex w-full h-full">
                  {/* Player Panel (Left) - Responsive width */}
                  <div className="w-64 lg:w-72 bg-zinc-900/30 backdrop-blur-sm border-r border-zinc-800/30 p-2 lg:p-3">
                    <div className="text-center mb-4">
                      <div className="text-2xl mb-1">👤</div>
                      <h3 className="text-lg font-bold text-white">You</h3>
                      <p className="text-zinc-400 text-xs">
                        Defend your system!
                      </p>
                    </div>

                    {/* Camera Feed Section - Compact version */}
                    {cvEnabled && currentMode === "game" && (
                      <div className="mb-4">
                        <div className="text-sm font-medium text-zinc-200 mb-2">
                          📹 Camera Feed
                        </div>
                        <div className="bg-zinc-800/40 rounded-lg p-2 border border-zinc-700/30">
                          {cameraStream ? (
                            <div className="relative w-full h-32 bg-zinc-900 rounded-lg overflow-hidden">
                              <video
                                ref={setVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                                style={{ backgroundColor: "#000" }}
                                onLoadedMetadata={() =>
                                  console.log("📹 Video metadata loaded")
                                }
                                onCanPlay={() =>
                                  console.log("📹 Video can play")
                                }
                                onError={(e) =>
                                  console.error("📹 Video error:", e)
                                }
                                onLoadStart={() =>
                                  console.log("📹 Video load started")
                                }
                                onLoadedData={() => {
                                  console.log("📹 Video data loaded");
                                  // Force play if not already playing
                                  if (
                                    videoRef.current &&
                                    videoRef.current.paused
                                  ) {
                                    videoRef.current
                                      .play()
                                      .catch(console.error);
                                  }
                                }}
                              />
                              <div className="absolute top-2 right-2 bg-green-500/80 text-white text-xs px-2 py-1 rounded">
                                LIVE
                              </div>
                              {/* Hidden canvas for frame capture */}
                              <canvas
                                ref={canvasRef}
                                style={{ display: "none" }}
                                width="320"
                                height="240"
                              />
                            </div>
                          ) : (
                            <div className="w-full h-32 bg-zinc-900 rounded-lg flex items-center justify-center">
                              <div className="text-center">
                                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-1"></div>
                                <div className="text-xs text-zinc-400">
                                  Starting camera...
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="bg-zinc-800/40 rounded-lg p-3">
                        <div className="text-sm font-medium text-zinc-200 mb-1">
                          Your Score
                        </div>
                        <div className="text-xl font-bold text-white">
                          {playerScore}
                        </div>
                        <div className="text-xs text-zinc-400">
                          Total: {gameScore}
                        </div>
                      </div>

                      <div className="bg-zinc-800/40 rounded-lg p-3">
                        <div className="text-sm font-medium text-zinc-200 mb-1">
                          Current Gesture
                        </div>
                        <div className="text-lg font-bold text-blue-400">
                          {currentGesture.toUpperCase()}
                        </div>
                        <div className="text-xs text-zinc-400">
                          Confidence: {Math.round(gestureConfidence * 100)}%
                        </div>
                        {aiAttack && (
                          <div className="text-xs text-yellow-400 mt-1">
                            Need:{" "}
                            {getCorrectResponse(aiAttack.type).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Losing streak UI removed */}
                    </div>
                  </div>

                  {/* Network Topology (Center) */}
                  <div className="flex-1 bg-zinc-950/50 p-4">
                    <div className="text-center mb-2">
                      <h3 className="text-lg font-bold text-white">
                        Network Topology
                      </h3>
                      <p className="text-zinc-400 text-sm">
                        Your data center under attack
                      </p>
                    </div>

                    {/* Game Status */}
                    <div className="text-center mb-4">
                      <div className="text-2xl font-bold text-white mb-2 tracking-tight">
                        Round {Math.floor((currentRound + 1) / 2)}
                      </div>
                      <div className="text-4xl font-bold text-red-400 mb-2 drop-shadow-[0_2px_10px_rgba(239,68,68,0.35)]">
                        {roundTimeLeft}
                      </div>
                      <div className="text-sm text-zinc-400">
                        {gamePhase === "ai_attack" &&
                          aiAttack &&
                          "⚡ AI is attacking! Respond with the correct gesture!"}
                        {gamePhase === "waiting" &&
                          "⏳ Waiting for AI attack..."}
                        {gamePhase === "round_end" && "✅ Round complete!"}
                      </div>

                      {/* Center Hint/Countdown */}
                      {gamePhase === "ai_attack" && (
                        <div className="mt-2 text-xs">
                          {roundTimeLeft > 5 ? (
                            <div className="text-purple-300">
                              Hint in {Math.max(0, roundTimeLeft - 5)}s
                            </div>
                          ) : roundTimeLeft > 0 ? (
                            (() => {
                              // Always use synthesized hint derived from current attack
                              const derived = aiAttack
                                ? {
                                    message: `Suggested defense for ${aiAttack.type}`,
                                    recommended_action: `Use ${getCorrectResponse(
                                      aiAttack.type
                                    ).toUpperCase()}`,
                                  }
                                : null;
                              const show = derived;
                              return (
                                <div className="text-left inline-block bg-purple-600/20 border border-purple-500/30 text-purple-200 px-3 py-2 rounded-md">
                                  <div className="text-white font-medium mb-1">
                                    {show?.message || "System prediction"}
                                  </div>
                                  {show?.recommended_action && (
                                    <div className="text-green-300">
                                      💡 {show.recommended_action}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : null}
                        </div>
                      )}

                      {/* CV Status and ML Prediction Button */}
                      <div className="mt-4 space-y-3">
                        {!cvEnabled ? (
                          <div className="text-center">
                            <div className="text-orange-400 text-sm mb-2">
                              ⚠️ Camera Required
                            </div>
                            <div className="text-xs text-zinc-400">
                              Enable camera from the home screen to start
                            </div>
                          </div>
                        ) : null}

                        {/* AI Hints Display (hidden during active attack to avoid duplicate hint box) */}
                        {gamePhase !== "ai_attack" && (
                          <div className="w-full border text-xs py-2 px-3 rounded-lg transition-colors bg-purple-600/20 border-purple-500/30 text-purple-300">
                            <div className="text-center">
                              <div className="text-purple-300 mb-2">
                                🔮 AI Hints
                              </div>
                              <div className="text-zinc-400 text-xs mb-2">
                                Hints will appear during attacks
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* AI Attack Display */}
                      {aiAttack && (
                        <div className="mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg shadow-[0_6px_18px_rgba(239,68,68,0.15)] relative">
                          <div
                            className="pointer-events-none absolute inset-x-0 -top-[1px] h-[1px]"
                            style={{
                              background:
                                "linear-gradient(90deg, rgba(239,68,68,0), rgba(239,68,68,0.5), rgba(239,68,68,0))",
                            }}
                          />
                          <div className="text-red-300 font-bold text-lg">
                            🚨 {aiAttack.message}
                          </div>
                          <div className="text-red-400 text-sm mt-1">
                            Target: {aiAttack.target} | Type: {aiAttack.type}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Simplified game topology */}
                    <div className="w-full h-80 bg-zinc-900/30 rounded-xl border border-zinc-700/30 flex items-center justify-center">
                      <svg
                        viewBox={`0 0 ${gameTopology.width} ${gameTopology.height}`}
                        className="w-[90%] max-w-[1000px] h-[90%]"
                      >
                        {gameTopology.links.map(
                          (link: { id: string; s: string; t: string }) => {
                            const s = gameTopology.nodes.find(
                              (n: { id: string }) => n.id === link.s
                            )!;
                            const t = gameTopology.nodes.find(
                              (n: { id: string }) => n.id === link.t
                            )!;
                            return (
                              <line
                                key={link.id}
                                x1={s.x}
                                y1={s.y}
                                x2={t.x}
                                y2={t.y}
                                stroke="#6b7280"
                                strokeWidth={3}
                                strokeLinecap="round"
                              />
                            );
                          }
                        )}

                        {gameTopology.nodes.map(
                          (node: {
                            id: string;
                            x: number;
                            y: number;
                            label: string;
                            color: string;
                          }) => (
                            <g key={node.id}>
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={22}
                                fill={node.color}
                              />
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={30}
                                stroke={node.color}
                                strokeOpacity={0.25}
                                fill="none"
                              />
                              <text
                                x={node.x}
                                y={node.y + 42}
                                textAnchor="middle"
                                className="fill-zinc-300"
                                style={{ fontSize: 11, fontWeight: 600 }}
                              >
                                {node.label}
                              </text>
                            </g>
                          )
                        )}
                      </svg>
                    </div>
                  </div>

                  {/* AI Panel (Right) */}
                  <div className="w-80 bg-zinc-900/30 backdrop-blur-sm border-l border-zinc-800/30 p-4">
                    <div className="text-center mb-4">
                      <div className="text-2xl mb-1">🤖</div>
                      <h3 className="text-lg font-bold text-white">
                        AI Adversary
                      </h3>
                      <p className="text-zinc-400 text-xs">
                        Attacking your system!
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-zinc-800/40 rounded-lg p-3">
                        <div className="text-xs font-medium text-zinc-200 mb-1">
                          AI Score
                        </div>
                        <div className="text-xl font-bold text-red-400">
                          {aiScore}
                        </div>
                      </div>

                      {/* Consecutive losses widget removed */}

                      {/* AI Predictions list removed (we now use synthesized hints only) */}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
