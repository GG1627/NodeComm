"""
FastAPI server for SynapseNet - Real-time hardware simulation with WebSocket streaming
"""

import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional
from pathlib import Path
import sys

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Add src directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from schemas import SystemState, TelemetryFrame, Scorecard, HardwareComponent, Link
from providers.sim import HardwareSimulator
from kpi.scorecard import KPIScorecard

# Import Learn Mode Computer Vision
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from learn_mode_cv import learn_mode_tracker, LearnModeCVResult

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SynapseNet API",
    description="Real-time hardware simulation and connectivity monitoring",
    version="1.0.0"
)

# Configure CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
simulator: Optional[HardwareSimulator] = None
scorecard: Optional[KPIScorecard] = None
active_connections: List[WebSocket] = []
simulation_running = False

class ConnectionManager:
    """Manages WebSocket connections for real-time data streaming"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")
            self.disconnect(websocket)
    
    async def broadcast(self, message: str):
        """Broadcast message to all connected clients"""
        if not self.active_connections:
            return
        
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Error broadcasting to connection: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

# Initialize connection manager
manager = ConnectionManager()

@app.on_event("startup")
async def startup_event():
    """Initialize simulation components on startup"""
    global simulator, scorecard
    
    logger.info("🚀 Starting SynapseNet API server...")
    
    # Initialize hardware simulator with 16-node realistic topology
    simulator = HardwareSimulator()
    simulator._create_realistic_datacenter_topology()
    
    # Initialize ML predictor for game mode predictions
    try:
        from ml_predictor import FailurePredictionML
        models_dir = "models"  # Path to trained models
        if os.path.exists(models_dir):
            simulator.ml_predictor = FailurePredictionML(models_dir)
            logger.info("✅ ML Predictor loaded successfully!")
        else:
            logger.warning(f"⚠️ Models directory '{models_dir}' not found - using fallback predictions")
            simulator.ml_predictor = None
    except Exception as e:
        logger.warning(f"⚠️ Failed to load ML predictor: {e} - using fallback predictions")
        simulator.ml_predictor = None
    
    # Initialize KPI scorecard
    scorecard = KPIScorecard()
    
    logger.info("✅ Simulation components initialized")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global simulation_running
    simulation_running = False
    logger.info("🛑 SynapseNet API server shutting down...")

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "SynapseNet API is running",
        "timestamp": datetime.now().isoformat(),
        "simulation_running": simulation_running,
        "active_connections": len(manager.active_connections)
    }

@app.get("/api/system/status")
async def get_system_status():
    """Get current system status and topology"""
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")
    
    # Get current telemetry
    telemetry = simulator.get_telemetry()
    
    # Get scorecard metrics
    current_scorecard = None
    if scorecard:
        scorecard.update_system_state(SystemState(
            telemetry=telemetry,
            scorecard=Scorecard()  # Will be updated by scorecard.update_system_state
        ))
        current_scorecard = scorecard.get_current_scorecard()
    
    # Calculate real-time metrics from components and links
    total_utilization = sum(comp.utilization for comp in telemetry.components) / len(telemetry.components) if telemetry.components else 0
    avg_temperature = sum(comp.temperature for comp in telemetry.components) / len(telemetry.components) if telemetry.components else 25
    avg_error_rate = sum(link.error_rate for link in telemetry.links) / len(telemetry.links) if telemetry.links else 0.01
    total_bandwidth = sum(link.bandwidth_gbps for link in telemetry.links) if telemetry.links else 0
    
    # Create frontend-compatible telemetry
    frontend_telemetry = {
        "timestamp": str(telemetry.timestamp),
        "system_health": telemetry.system_metrics.get("avg_utilization", total_utilization),
        "total_bandwidth": total_bandwidth,
        "total_utilization": total_utilization,  # Frontend expects this
        "avg_latency": telemetry.system_metrics.get("avg_latency_ms", 0),
        "avg_temperature": avg_temperature,  # Frontend expects this
        "avg_error_rate": avg_error_rate,  # Frontend expects this
        "active_components": telemetry.system_metrics.get("healthy_components", 0),
        "failed_components": len(simulator.components) - telemetry.system_metrics.get("healthy_components", 0),
        "chaos_events": 0
    }
    
    return {
        "status": "online",
        "timestamp": str(telemetry.timestamp),
        "components": [comp.dict() for comp in telemetry.components],
        "links": [link.dict() for link in telemetry.links],
        "telemetry": frontend_telemetry,
        "scorecard": current_scorecard.dict() if current_scorecard else None,
        "node_count": len(simulator.components),
        "link_count": len(simulator.links)
    }

@app.get("/api/components")
async def get_components():
    """Get all hardware components"""
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")
    
    return {
        "components": [comp.dict() for comp in simulator.components.values()],
        "count": len(simulator.components)
    }

@app.get("/api/links")
async def get_links():
    """Get all network links"""
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")
    
    return {
        "links": [link.dict() for link in simulator.links.values()],
        "count": len(simulator.links)
    }

@app.post("/api/simulation/start")
async def start_simulation():
    """Start the real-time simulation"""
    global simulation_running
    
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")
    
    if simulation_running:
        return {"message": "Simulation already running", "status": "running"}
    
    simulation_running = True
    
    # Start background simulation task
    asyncio.create_task(simulation_loop())
    
    logger.info("🎮 Simulation started")
    return {"message": "Simulation started", "status": "running"}

@app.post("/api/simulation/stop")
async def stop_simulation():
    """Stop the real-time simulation"""
    global simulation_running
    
    simulation_running = False
    logger.info("⏹️ Simulation stopped")
    return {"message": "Simulation stopped", "status": "stopped"}

@app.post("/api/chaos/inject")
async def inject_chaos(chaos_type: str = "random"):
    """Inject chaos into the system"""
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")
    
    try:
        # Call inject_chaos without parameters - it will pick a random target
        simulator.inject_chaos()
        logger.info(f"💥 Chaos injected: {chaos_type}")
        return {"message": f"Chaos injected: {chaos_type}", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Error injecting chaos: {e}")
        raise HTTPException(status_code=500, detail=f"Error injecting chaos: {str(e)}")

# Learn Mode Computer Vision - Process frames from frontend
cv_processor = None
last_frame_time = 0
MIN_FRAME_INTERVAL = 0.05  # Minimum 50ms between frames (20 FPS max)

def process_frame(frame_data: str) -> dict:
    """Process a frame from frontend and return hand tracking results"""
    global last_frame_time
    
    # Rate limiting to prevent overwhelming the system
    current_time = time.time()
    if current_time - last_frame_time < MIN_FRAME_INTERVAL:
        return {"hands": [], "skipped": True}
    
    last_frame_time = current_time
    
    try:
        # Import here to avoid circular imports
        import cv2
        import numpy as np
        import base64
        from learn_mode_cv import learn_mode_tracker
        
        # Decode base64 frame
        frame_b64 = frame_data.split(',')[1]  # Remove data:image/jpeg;base64, prefix
        frame_bytes = base64.b64decode(frame_b64)
        frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
        frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
        
        if frame is None:
            print("❌ Failed to decode frame")
            return {"hands": [], "error": "Failed to decode frame"}
        
        print(f"✅ Frame decoded: {frame.shape}")
        
        # Flip horizontally for mirror effect
        frame = cv2.flip(frame, 1)
        frame_height, frame_width = frame.shape[:2]
        
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Process with MediaPipe
        start_time = time.time()
        results = learn_mode_tracker.hands.process(rgb_frame)
        processing_time = (time.time() - start_time) * 1000  # ms
        
        print(f"🔍 MediaPipe processing: {processing_time:.1f}ms")
        print(f"📊 Results: {results.multi_hand_landmarks is not None}")
        
        # Extract hand data
        hands_data = []
        if results.multi_hand_landmarks:
            handedness_list = results.multi_handedness if results.multi_handedness else []
            
            for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                # Get handedness
                handedness = "Unknown"
                if idx < len(handedness_list):
                    handedness = handedness_list[idx].classification[0].label
                
                # Extract landmarks
                landmarks = []
                for landmark in hand_landmarks.landmark:
                    landmarks.append({
                        "x": landmark.x,
                        "y": landmark.y,
                        "z": landmark.z,
                        "visibility": landmark.visibility if hasattr(landmark, 'visibility') else 1.0
                    })
                
                # Calculate bounding box
                x_coords = [lm["x"] for lm in landmarks]
                y_coords = [lm["y"] for lm in landmarks]
                bbox = {
                    'x': min(x_coords),
                    'y': min(y_coords),
                    'width': max(x_coords) - min(x_coords),
                    'height': max(y_coords) - min(y_coords)
                }
                
                # Create hand data
                hand_data = {
                    "hand_id": idx,
                    "handedness": handedness,
                    "landmarks": landmarks,
                    "bounding_box": bbox,
                    "timestamp": time.time(),
                    "confidence": 0.8
                }
                
                hands_data.append(hand_data)
        
        return {
            "hands": hands_data,
            "frame_width": frame_width,
            "frame_height": frame_height,
            "timestamp": time.time(),
            "processing_time_ms": processing_time
        }
        
    except Exception as e:
        logger.error(f"Error processing frame: {e}")
        return {"hands": [], "error": str(e)}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time data streaming"""
    await manager.connect(websocket)
    
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            if message.get("type") == "ping":
                await manager.send_personal_message(
                    json.dumps({"type": "pong", "timestamp": datetime.now().isoformat()}),
                    websocket
                )
            elif message.get("type") == "start_simulation":
                if not simulation_running:
                    await start_simulation()
                await manager.send_personal_message(
                    json.dumps({"type": "simulation_started", "timestamp": datetime.now().isoformat()}),
                    websocket
                )
            elif message.get("type") == "stop_simulation":
                if simulation_running:
                    await stop_simulation()
                await manager.send_personal_message(
                    json.dumps({"type": "simulation_stopped", "timestamp": datetime.now().isoformat()}),
                    websocket
                )
            elif message.get("type") == "inject_chaos":
                if simulator:
                    simulator.inject_chaos()
                await manager.send_personal_message(
                    json.dumps({"type": "chaos_injected", "timestamp": datetime.now().isoformat()}),
                    websocket
                )
            elif message.get("type") == "cv_frame":
                # Process frame from frontend
                frame_data = message.get("frame")
                if frame_data:
                    try:
                        print("📥 Received frame from frontend")
                        result = process_frame(frame_data)
                        
                        # Skip sending response for rate-limited frames
                        if result.get("skipped", False):
                            print("⏭️ Frame skipped due to rate limiting")
                            continue
                            
                        print(f"🖐️ Processed frame: {len(result.get('hands', []))} hands detected")
                        
                        cv_response = {
                            "type": "learn_mode_cv_data",
                            "hands": result["hands"],
                            "frame_width": result.get("frame_width", 320),
                            "frame_height": result.get("frame_height", 240),
                            "timestamp": result.get("timestamp", time.time()),
                            "processing_time_ms": result.get("processing_time_ms", 0)
                        }
                        await manager.send_personal_message(
                            json.dumps(cv_response),
                            websocket
                        )
                    except Exception as e:
                        logger.error(f"Error processing CV frame: {e}")
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "learn_mode_cv_data",
                                "hands": [],
                                "error": str(e),
                                "timestamp": time.time()
                            }),
                            websocket
                        )
            elif message.get("type") == "start_game":
                # Start game mode
                logger.info("🎮 Starting game mode")
                await manager.send_personal_message(
                    json.dumps({"type": "game_started", "message": "Game mode activated"}),
                    websocket
                )
            elif message.get("type") == "player_action":
                # Handle player gesture action
                action_type = message.get("action_type")
                target_component = message.get("target_component")
                logger.info(f"🎯 Player action: {action_type} on {target_component}")
                
                # Record action in scorecard
                if scorecard:
                    scorecard.record_user_action(action_type, target_component)
                
                await manager.send_personal_message(
                    json.dumps({
                        "type": "action_result", 
                        "action": action_type,
                        "target": target_component,
                        "message": f"Action {action_type} executed"
                    }),
                    websocket
                )
            elif message.get("type") == "get_ml_predictions":
                # Get ML predictions for game mode
                if simulator:
                    telemetry = simulator.get_telemetry()
                    
                    # Use the ML predictor if available
                    predictions = []
                    if hasattr(simulator, 'ml_predictor') and simulator.ml_predictor:
                        try:
                            ml_predictions = simulator.ml_predictor.predict_failures(telemetry)
                            predictions = [
                                {
                                    "message": f"⚠️ {pred.failure_type} failure predicted",
                                    "confidence": pred.confidence,
                                    "recommended_action": pred.recommended_action,
                                    "time_to_failure": pred.seconds_until_failure
                                }
                                for pred in ml_predictions
                            ]
                        except Exception as e:
                            logger.warning(f"ML prediction error: {e}")
                            # Fallback to game-specific predictions
                            predictions = [
                                {
                                    "message": "🔮 System analysis suggests thermal issues incoming...",
                                    "confidence": 0.8,
                                    "recommended_action": "Use HEAL gesture for thermal attacks",
                                    "time_to_failure": 5.0
                                }
                            ]
                    else:
                        # Enhanced fallback predictions for game mode based on system state
                        import random
                        attack_hints = [
                            {
                                "message": "🔮 Thermal sensors detecting overheating patterns...",
                                "confidence": 0.82,
                                "recommended_action": "Use HEAL gesture for thermal attacks", 
                                "time_to_failure": 4.0
                            },
                            {
                                "message": "🔮 Network traffic analysis shows bandwidth spike incoming...",
                                "confidence": 0.78,
                                "recommended_action": "Use REROUTE gesture for bandwidth attacks", 
                                "time_to_failure": 3.5
                            },
                            {
                                "message": "🔮 Latency patterns suggest connection issues ahead...",
                                "confidence": 0.75,
                                "recommended_action": "Use CUT gesture for latency attacks", 
                                "time_to_failure": 2.8
                            },
                            {
                                "message": "🔮 Error rate monitoring indicates system instability...",
                                "confidence": 0.80,
                                "recommended_action": "Use SHIELD gesture for error attacks", 
                                "time_to_failure": 3.2
                            }
                        ]
                        predictions = [random.choice(attack_hints)]
                    
                    await manager.send_personal_message(
                        json.dumps({
                            "type": "ml_predictions",
                            "predictions": predictions
                        }),
                        websocket
                    )
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

async def simulation_loop():
    """Background task that runs the simulation and broadcasts updates"""
    global simulation_running, simulator, scorecard
    
    logger.info("🔄 Starting simulation loop...")
    
    while simulation_running:
        try:
            if not simulator or not scorecard:
                await asyncio.sleep(1)
                continue
            
            # Update simulation
            simulator.update()
            
            # Gradually recover from chaos (if not actively injecting)
            simulator.recover_from_chaos()
            
            # Get current telemetry
            telemetry = simulator.get_telemetry()
            
            # Update scorecard
            system_state = SystemState(
                telemetry=telemetry,
                scorecard=Scorecard()  # Will be updated by scorecard.update_system_state
            )
            scorecard.update_system_state(system_state)
            current_scorecard = scorecard.get_current_scorecard()
            current_metrics = scorecard.get_current_metrics()
            
            # Calculate real-time metrics from components and links
            total_utilization = sum(comp.utilization for comp in telemetry.components) / len(telemetry.components) if telemetry.components else 0
            avg_temperature = sum(comp.temperature for comp in telemetry.components) / len(telemetry.components) if telemetry.components else 25
            avg_error_rate = sum(link.error_rate for link in telemetry.links) / len(telemetry.links) if telemetry.links else 0.01
            total_bandwidth = sum(link.bandwidth_gbps for link in telemetry.links) if telemetry.links else 0
            
            # Create frontend-compatible telemetry
            frontend_telemetry = {
                "timestamp": str(telemetry.timestamp),
                "system_health": telemetry.system_metrics.get("avg_utilization", total_utilization),
                "total_bandwidth": total_bandwidth,
                "total_utilization": total_utilization,  # Frontend expects this
                "avg_latency": telemetry.system_metrics.get("avg_latency_ms", 0),
                "avg_temperature": avg_temperature,  # Frontend expects this
                "avg_error_rate": avg_error_rate,  # Frontend expects this
                "active_components": telemetry.system_metrics.get("healthy_components", 0),
                "failed_components": len(simulator.components) - telemetry.system_metrics.get("healthy_components", 0),
                "chaos_events": 0
            }
            
            # Create enhanced scorecard with Astera metrics
            enhanced_scorecard = current_scorecard.dict()
            enhanced_scorecard.update({
                "signal_integrity_score": current_metrics.signal_integrity_score,
                "retimer_compensation_level": current_metrics.retimer_compensation_level,
                "smart_cable_health": current_metrics.smart_cable_health,
                "cxl_channel_utilization": current_metrics.cxl_channel_utilization
            })
            
            # Prepare broadcast data with safety checks
            def clean_for_json(obj):
                """Remove Infinity and NaN values that break JSON serialization"""
                if isinstance(obj, dict):
                    return {k: clean_for_json(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [clean_for_json(item) for item in obj]
                elif isinstance(obj, float):
                    if obj == float('inf') or obj == float('-inf'):
                        return 999999.0
                    elif obj != obj:  # NaN check
                        return 0.0
                    else:
                        return obj
                else:
                    return obj
            
            broadcast_data = {
                "type": "system_update",
                "timestamp": str(telemetry.timestamp),
                "components": [clean_for_json(comp.dict()) for comp in telemetry.components],
                "links": [clean_for_json(link.dict()) for link in telemetry.links],
                "telemetry": clean_for_json(frontend_telemetry),
                "scorecard": clean_for_json(enhanced_scorecard),
                "simulation_running": simulation_running
            }
            
            # Broadcast to all connected clients
            await manager.broadcast(json.dumps(broadcast_data))
            
            # Sleep for simulation interval (slower for better visibility - 2 FPS = 500ms)
            await asyncio.sleep(0.5)
            
        except Exception as e:
            logger.error(f"Error in simulation loop: {e}")
            await asyncio.sleep(1)
    
    logger.info("🛑 Simulation loop stopped")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
