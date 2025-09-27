#!/usr/bin/env python3
"""
SynapseNet Live Demo - Complete integration of gesture recognition with hardware simulation.
This is the full interactive experience!
"""

import sys
import cv2
import time
import threading
import queue
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from providers.sim import HardwareSimulator
from schemas import ComponentStatus
from gesture_recognition import GestureRecognizer, GestureResult


class SynapseNetLiveDemo:
    """Complete live demo with gesture control and hardware simulation"""
    
    def __init__(self):
        print("🚀 Initializing SynapseNet Live Demo...")
        
        # Initialize hardware simulation
        self.simulator = HardwareSimulator(seed=42)
        self.simulation_running = True
        self.sim_data_queue = queue.Queue(maxsize=10)
        
        # Initialize gesture recognition
        self.gesture_recognizer = GestureRecognizer()
        self.cap = cv2.VideoCapture(0)
        
        if not self.cap.isOpened():
            raise RuntimeError("Could not open camera")
        
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        # Game state
        self.score = 100.0  # Starting resilience score
        self.actions_taken = 0
        self.ai_attacks = 0
        self.start_time = time.time()
        
        # Action cooldowns (reduced since gesture now requires 2s hold)
        self.last_action_time = 0
        self.action_cooldown = 0.5  # 0.5 seconds between actions (gesture hold provides main delay)
        
        # AI adversary
        self.last_ai_attack = 0
        self.ai_attack_interval = 8.0  # AI attacks every 8 seconds
        
        print("✅ Initialization complete!")
        print("\n🎮 Controls:")
        print("   ✂️ Cut: Index + Middle finger (scissors) - Isolate failed components")
        print("   ✊ Heal: Fist - Repair damaged systems")
        print("   ✋ Reroute: Open palm - Redirect network traffic")
        print("   🙌 Shield: Both hands open - Boost system resilience")
        print("   'q': Quit demo")
    
    def run(self):
        """Run the complete live demo"""
        print("\n🌟 Starting SynapseNet Live Demo!")
        print("=" * 50)
        
        # Start simulation thread
        sim_thread = threading.Thread(target=self._simulation_loop, daemon=True)
        sim_thread.start()
        
        try:
            self._main_loop()
        except KeyboardInterrupt:
            print("\n⚡ Demo interrupted by user")
        finally:
            self.simulation_running = False
            self.cap.release()
            cv2.destroyAllWindows()
            print("🧹 Demo cleanup complete")
    
    def _simulation_loop(self):
        """Background simulation loop"""
        while self.simulation_running:
            try:
                # Step simulation
                telemetry = self.simulator.step()
                
                # AI adversary attacks
                self._ai_adversary_logic()
                
                # Calculate score
                self._update_score(telemetry)
                
                # Put data in queue for main thread
                if not self.sim_data_queue.full():
                    self.sim_data_queue.put(telemetry)
                
                time.sleep(0.1)  # 10 FPS simulation
                
            except Exception as e:
                print(f"❌ Simulation error: {e}")
                break
    
    def _ai_adversary_logic(self):
        """AI adversary that creates chaos"""
        current_time = time.time()
        
        if current_time - self.last_ai_attack > self.ai_attack_interval:
            self.last_ai_attack = current_time
            self.ai_attacks += 1
            
            # Choose random attack
            import random
            attacks = [
                ("cpu_0", "overload", "💥 AI overloads CPU!"),
                ("gpu_0", "overheat", "🔥 AI overheats GPU!"),
                ("cpu_switch_link", "congestion", "🌊 AI floods network!"),
                ("switch_gpu_link", "latency_spike", "⚡ AI spikes latency!"),
                ("mem_0", "overload", "📈 AI stresses memory!")
            ]
            
            target, chaos_type, message = random.choice(attacks)
            self.simulator.inject_chaos(target, chaos_type)
            print(f"\n{message}")
    
    def _update_score(self, telemetry):
        """Update resilience score based on system health"""
        # Calculate health factors
        healthy_components = sum(1 for c in telemetry.components if c.status == ComponentStatus.HEALTHY)
        healthy_links = sum(1 for l in telemetry.links if l.status == ComponentStatus.HEALTHY)
        
        total_components = len(telemetry.components)
        total_links = len(telemetry.links)
        
        # Health percentage
        component_health = healthy_components / total_components if total_components > 0 else 0
        link_health = healthy_links / total_links if total_links > 0 else 0
        
        # Performance factors
        avg_util = telemetry.system_metrics.get('avg_utilization', 50)
        avg_temp = telemetry.system_metrics.get('avg_temperature_c', 50)
        avg_latency = telemetry.system_metrics.get('avg_latency_ms', 0.1)
        
        # Calculate score (0-100)
        health_score = (component_health + link_health) * 50  # 0-100
        performance_penalty = min(20, max(0, (avg_util - 80) / 5))  # High utilization penalty
        temp_penalty = min(15, max(0, (avg_temp - 70) / 5))  # High temperature penalty  
        latency_penalty = min(15, max(0, (avg_latency - 1.0) * 10))  # High latency penalty
        
        target_score = health_score - performance_penalty - temp_penalty - latency_penalty
        
        # Smooth score changes
        self.score = self.score * 0.9 + target_score * 0.1
        self.score = max(0, min(100, self.score))
    
    def _handle_gesture_action(self, gesture_result: GestureResult):
        """Handle player gesture actions"""
        current_time = time.time()
        
        if (gesture_result.confidence > 0.7 and 
            gesture_result.gesture != "none" and
            current_time - self.last_action_time > self.action_cooldown):
            
            self.last_action_time = current_time
            self.actions_taken += 1
            
            # Execute action based on gesture
            if gesture_result.gesture == "cut":
                self._action_cut()
            elif gesture_result.gesture == "heal":
                self._action_heal()
            elif gesture_result.gesture == "reroute":
                self._action_reroute()
            elif gesture_result.gesture == "shield":
                self._action_shield()
    
    def _action_cut(self):
        """Cut action - isolate problematic components"""
        print("✂️ CUT ACTION! Isolating problematic components...")
        
        # Find most utilized component and reduce its load
        latest_telemetry = self._get_latest_telemetry()
        if latest_telemetry:
            max_util_comp = max(latest_telemetry.components, key=lambda c: c.utilization)
            if max_util_comp.utilization > 60:
                # Simulate load reduction
                max_util_comp.utilization *= 0.7
                self.score += 5  # Reward for good action
                print(f"   Reduced load on {max_util_comp.name}")
    
    def _action_heal(self):
        """Heal action - repair degraded systems"""
        print("✊ HEAL ACTION! Repairing degraded systems...")
        
        # Find failed/degraded components and heal them
        latest_telemetry = self._get_latest_telemetry()
        if latest_telemetry:
            healed = False
            for comp in latest_telemetry.components:
                if comp.status != ComponentStatus.HEALTHY:
                    comp.status = ComponentStatus.HEALTHY
                    comp.temperature *= 0.8  # Cool down
                    healed = True
                    print(f"   Healed {comp.name}")
                    break
            
            if healed:
                self.score += 8
            else:
                print("   No components need healing")
    
    def _action_reroute(self):
        """Reroute action - optimize network paths"""
        print("✋ REROUTE ACTION! Optimizing network paths...")
        
        # Find congested links and reduce their utilization
        latest_telemetry = self._get_latest_telemetry()
        if latest_telemetry:
            congested_links = [l for l in latest_telemetry.links if l.utilization > 70]
            if congested_links:
                for link in congested_links[:2]:  # Fix up to 2 links
                    link.utilization *= 0.6
                    link.latency_ms *= 0.8
                    print(f"   Rerouted traffic from {link.id}")
                self.score += 6
            else:
                print("   Network is running smoothly")
    
    def _action_shield(self):
        """Shield action - boost overall system resilience"""
        print("🙌 SHIELD ACTION! Boosting system resilience!")
        
        # Global system boost
        latest_telemetry = self._get_latest_telemetry()
        if latest_telemetry:
            # Reduce temperatures and utilization across the board
            for comp in latest_telemetry.components:
                comp.temperature *= 0.9
                comp.utilization *= 0.95
            
            for link in latest_telemetry.links:
                link.error_rate *= 0.5
                link.utilization *= 0.9
            
            self.score += 10  # Big reward for shield
            print("   System-wide resilience boosted!")
    
    def _get_latest_telemetry(self):
        """Get latest telemetry data"""
        try:
            return self.sim_data_queue.get_nowait()
        except queue.Empty:
            return None
    
    def _main_loop(self):
        """Main visualization and interaction loop"""
        while True:
            ret, frame = self.cap.read()
            if not ret:
                break
            
            # Flip for mirror effect
            frame = cv2.flip(frame, 1)
            
            # Recognize gesture
            gesture_result = self.gesture_recognizer.recognize_gesture(frame)
            
            # Handle gesture actions
            self._handle_gesture_action(gesture_result)
            
            # Get latest simulation data
            latest_telemetry = self._get_latest_telemetry()
            
            # Draw visualization
            self._draw_complete_visualization(frame, gesture_result, latest_telemetry)
            
            # Show frame
            cv2.imshow('SynapseNet - Live Demo', frame)
            
            # Handle keyboard
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
    
    def _draw_complete_visualization(self, frame, gesture_result, telemetry):
        """Draw complete visualization overlay"""
        height, width = frame.shape[:2]
        
        # Main info panel (left side)
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (350, 300), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.8, frame, 0.2, 0, frame)
        
        font = cv2.FONT_HERSHEY_SIMPLEX
        
        # Title
        cv2.putText(frame, "SynapseNet Live Demo", (20, 35), font, 0.8, (0, 255, 255), 2)
        
        # Score and stats
        score_color = (0, 255, 0) if self.score > 70 else (0, 255, 255) if self.score > 40 else (0, 0, 255)
        cv2.putText(frame, f"Resilience: {self.score:.1f}%", (20, 70), font, 0.7, score_color, 2)
        
        elapsed = time.time() - self.start_time
        cv2.putText(frame, f"Time: {elapsed:.1f}s", (20, 100), font, 0.6, (255, 255, 255), 1)
        cv2.putText(frame, f"Actions: {self.actions_taken}", (20, 125), font, 0.6, (255, 255, 255), 1)
        cv2.putText(frame, f"AI Attacks: {self.ai_attacks}", (20, 150), font, 0.6, (255, 255, 255), 1)
        
        # Current gesture
        gesture_color = (0, 255, 0) if gesture_result.confidence > 0.7 else (100, 100, 100)
        cv2.putText(frame, f"Gesture: {gesture_result.gesture.upper()}", (20, 185), font, 0.6, gesture_color, 2)
        
        # System status
        if telemetry:
            healthy_comps = sum(1 for c in telemetry.components if c.status == ComponentStatus.HEALTHY)
            total_comps = len(telemetry.components)
            cv2.putText(frame, f"Components: {healthy_comps}/{total_comps}", (20, 210), font, 0.5, (255, 255, 255), 1)
            
            avg_temp = telemetry.system_metrics.get('avg_temperature_c', 0)
            temp_color = (0, 255, 0) if avg_temp < 60 else (0, 255, 255) if avg_temp < 80 else (0, 0, 255)
            cv2.putText(frame, f"Avg Temp: {avg_temp:.1f}°C", (20, 235), font, 0.5, temp_color, 1)
            
            avg_util = telemetry.system_metrics.get('avg_utilization', 0)
            util_color = (0, 255, 0) if avg_util < 70 else (0, 255, 255) if avg_util < 90 else (0, 0, 255)
            cv2.putText(frame, f"Avg Util: {avg_util:.1f}%", (20, 260), font, 0.5, util_color, 1)
        
        # Instructions (bottom)
        cv2.putText(frame, "Hold gestures for 2 seconds to trigger!", (20, height-60), font, 0.5, (255, 255, 0), 1)
        cv2.putText(frame, "Cut ✂️ | Heal ✊ | Reroute ✋ | Shield 🙌", (20, height-35), font, 0.4, (200, 200, 200), 1)
        cv2.putText(frame, "Press 'q' to quit", (20, height-10), font, 0.4, (200, 200, 200), 1)


def main():
    """Main function"""
    try:
        demo = SynapseNetLiveDemo()
        demo.run()
        return 0
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
