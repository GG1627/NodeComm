#!/usr/bin/env python3
"""
ML-Enhanced SynapseNet Demo
Integrates trained ML models with gesture recognition and hardware simulation.
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
from ml_predictor import FailurePredictionML


class MLEnhancedSynapseNet:
    """Complete demo with ML predictions, gesture control, and hardware simulation"""
    
    def __init__(self, models_dir: str = "models"):
        print("🚀 Initializing ML-Enhanced SynapseNet...")
        
        # Initialize hardware simulation
        self.simulator = HardwareSimulator(seed=42)
        self.simulation_running = True
        self.sim_data_queue = queue.Queue(maxsize=10)
        
        # Initialize ML predictor
        try:
            self.ml_predictor = FailurePredictionML(models_dir)
            self.ml_enabled = True
            print("✅ ML Predictor loaded successfully!")
        except Exception as e:
            print(f"⚠️ ML Predictor failed to load: {e}")
            print("   Running without ML predictions...")
            self.ml_predictor = None
            self.ml_enabled = False
        
        # Initialize gesture recognition
        self.gesture_recognizer = GestureRecognizer()
        self.cap = cv2.VideoCapture(0)
        
        if not self.cap.isOpened():
            raise RuntimeError("Could not open camera")
        
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        # Game state
        self.score = 100.0
        self.actions_taken = 0
        self.ai_attacks = 0
        self.ml_predictions_made = 0
        self.ml_predictions_correct = 0
        self.start_time = time.time()
        
        # Difficulty settings
        self.difficulty = "easy"  # easy, medium, hard
        self.prediction_lead_time = {"easy": 15, "medium": 8, "hard": 4}
        
        # Action cooldowns
        self.last_action_time = 0
        self.action_cooldown = 0.5
        
        # AI adversary
        self.last_ai_attack = 0
        self.ai_attack_interval = 12.0  # Slower attacks to see ML predictions
        
        # ML prediction tracking
        self.active_predictions = []
        self.prediction_history = []
        
        print("✅ Initialization complete!")
        self._print_controls()
    
    def _print_controls(self):
        """Print control instructions"""
        print("\n🎮 ML-Enhanced Controls:")
        print("   ✂️ Cut: Index + Middle finger (scissors) - Isolate failed components")
        print("   ✊ Heal: Fist - Repair damaged systems")
        print("   ✋ Reroute: Open palm - Redirect network traffic")
        print("   🙌 Shield: Both hands open - Boost system resilience")
        print("   'q': Quit demo")
        print("   'd': Change difficulty (easy/medium/hard)")
        if self.ml_enabled:
            print("\n🤖 ML Features:")
            print("   - Predictive failure warnings")
            print("   - Intelligent action recommendations")
            print("   - Adaptive difficulty based on ML confidence")
    
    def run(self):
        """Run the complete ML-enhanced demo"""
        print("\n🌟 Starting ML-Enhanced SynapseNet Demo!")
        print("=" * 60)
        
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
            self._print_final_stats()
    
    def _simulation_loop(self):
        """Background simulation loop with ML predictions"""
        while self.simulation_running:
            try:
                # Step simulation
                telemetry = self.simulator.step()
                
                # ML predictions
                if self.ml_enabled:
                    self._process_ml_predictions(telemetry)
                
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
    
    def _process_ml_predictions(self, telemetry):
        """Process ML predictions and manage active predictions"""
        try:
            # Get ML predictions
            predictions = self.ml_predictor.predict_failures(telemetry)
            
            for prediction in predictions:
                # Check if this is a new prediction
                existing = any(p.failure_type == prediction.failure_type for p in self.active_predictions)
                
                if not existing and prediction.confidence > 0.7:
                    self.active_predictions.append(prediction)
                    self.ml_predictions_made += 1
                    
                    # Print prediction
                    print(f"\n🤖 ML PREDICTION: {prediction.failure_type}")
                    print(f"   Probability: {prediction.probability:.3f}")
                    print(f"   Time to failure: {prediction.seconds_until_failure:.1f}s")
                    print(f"   Recommended action: {prediction.recommended_action}")
                    print(f"   {prediction.explanation}")
            
            # Remove old predictions (older than 20 seconds)
            current_time = time.time()
            self.active_predictions = [
                p for p in self.active_predictions 
                if (current_time - p.seconds_until_failure) < 20
            ]
            
        except Exception as e:
            print(f"⚠️ ML prediction error: {e}")
    
    def _ai_adversary_logic(self):
        """AI adversary that creates chaos"""
        current_time = time.time()
        
        if current_time - self.last_ai_attack > self.ai_attack_interval:
            self.last_ai_attack = current_time
            self.ai_attacks += 1
            
            # Choose attack based on difficulty and ML predictions
            import random
            
            # If ML predicted something, sometimes attack that area
            if self.active_predictions and random.random() < 0.6:
                prediction = random.choice(self.active_predictions)
                if prediction.failure_type == "cpu_thermal":
                    self.simulator.inject_chaos("cpu_0", "overheat")
                    print(f"\n💥 AI targets predicted CPU thermal issue!")
                elif prediction.failure_type == "network_congestion":
                    self.simulator.inject_chaos("cpu_switch_link", "congestion")
                    print(f"\n💥 AI floods network as predicted!")
                else:
                    self.simulator.inject_chaos("gpu_0", "overload")
                    print(f"\n💥 AI attacks system as predicted!")
            else:
                # Random attack
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
        """Update resilience score based on system health and ML accuracy"""
        # Base scoring (same as before)
        healthy_components = sum(1 for c in telemetry.components if c.status == ComponentStatus.HEALTHY)
        healthy_links = sum(1 for l in telemetry.links if l.status == ComponentStatus.HEALTHY)
        
        total_components = len(telemetry.components)
        total_links = len(telemetry.links)
        
        component_health = healthy_components / total_components if total_components > 0 else 0
        link_health = healthy_links / total_links if total_links > 0 else 0
        
        avg_util = telemetry.system_metrics.get('avg_utilization', 50)
        avg_temp = telemetry.system_metrics.get('avg_temperature_c', 50)
        avg_latency = telemetry.system_metrics.get('avg_latency_ms', 0.1)
        
        health_score = (component_health + link_health) * 50
        performance_penalty = min(20, max(0, (avg_util - 80) / 5))
        temp_penalty = min(15, max(0, (avg_temp - 70) / 5))
        latency_penalty = min(15, max(0, (avg_latency - 1.0) * 10))
        
        target_score = health_score - performance_penalty - temp_penalty - latency_penalty
        
        # ML bonus: reward for having active predictions (proactive monitoring)
        if self.ml_enabled and self.active_predictions:
            ml_bonus = len(self.active_predictions) * 2
            target_score += ml_bonus
        
        self.score = self.score * 0.9 + target_score * 0.1
        self.score = max(0, min(100, self.score))
    
    def _handle_gesture_action(self, gesture_result: GestureResult):
        """Handle player gesture actions with ML guidance"""
        current_time = time.time()
        
        if (gesture_result.confidence > 0.7 and 
            gesture_result.gesture != "none" and
            current_time - self.last_action_time > self.action_cooldown):
            
            self.last_action_time = current_time
            self.actions_taken += 1
            
            # Check if action matches ML recommendation
            ml_match = False
            if self.active_predictions:
                recommended_actions = [p.recommended_action for p in self.active_predictions]
                if gesture_result.gesture in recommended_actions:
                    ml_match = True
                    self.ml_predictions_correct += 1
                    print(f"✅ Action matches ML recommendation!")
            
            # Execute action
            if gesture_result.gesture == "cut":
                self._action_cut(ml_match)
            elif gesture_result.gesture == "heal":
                self._action_heal(ml_match)
            elif gesture_result.gesture == "reroute":
                self._action_reroute(ml_match)
            elif gesture_result.gesture == "shield":
                self._action_shield(ml_match)
    
    def _action_cut(self, ml_guided=False):
        """Cut action with ML bonus"""
        print("✂️ CUT ACTION! Isolating problematic components...")
        bonus = 3 if ml_guided else 0
        self.score += (5 + bonus)
        
        latest_telemetry = self._get_latest_telemetry()
        if latest_telemetry:
            max_util_comp = max(latest_telemetry.components, key=lambda c: c.utilization)
            if max_util_comp.utilization > 60:
                max_util_comp.utilization *= 0.7
                print(f"   Reduced load on {max_util_comp.name}")
    
    def _action_heal(self, ml_guided=False):
        """Heal action with ML bonus"""
        print("✊ HEAL ACTION! Repairing degraded systems...")
        bonus = 5 if ml_guided else 0
        self.score += (8 + bonus)
        
        latest_telemetry = self._get_latest_telemetry()
        if latest_telemetry:
            healed = False
            for comp in latest_telemetry.components:
                if comp.status != ComponentStatus.HEALTHY or comp.temperature > 70:
                    comp.status = ComponentStatus.HEALTHY
                    comp.temperature *= 0.8
                    healed = True
                    print(f"   Healed {comp.name}")
                    break
            
            if not healed:
                print("   No components need healing")
    
    def _action_reroute(self, ml_guided=False):
        """Reroute action with ML bonus"""
        print("✋ REROUTE ACTION! Optimizing network paths...")
        bonus = 4 if ml_guided else 0
        self.score += (6 + bonus)
        
        latest_telemetry = self._get_latest_telemetry()
        if latest_telemetry:
            congested_links = [l for l in latest_telemetry.links if l.utilization > 70]
            if congested_links:
                for link in congested_links[:2]:
                    link.utilization *= 0.6
                    link.latency_ms *= 0.8
                    print(f"   Rerouted traffic from {link.id}")
            else:
                print("   Network is running smoothly")
    
    def _action_shield(self, ml_guided=False):
        """Shield action with ML bonus"""
        print("🙌 SHIELD ACTION! Boosting system resilience!")
        bonus = 6 if ml_guided else 0
        self.score += (10 + bonus)
        
        latest_telemetry = self._get_latest_telemetry()
        if latest_telemetry:
            for comp in latest_telemetry.components:
                comp.temperature *= 0.9
                comp.utilization *= 0.95
            
            for link in latest_telemetry.links:
                link.error_rate *= 0.5
                link.utilization *= 0.9
            
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
            cv2.imshow('SynapseNet - ML Enhanced Demo', frame)
            
            # Handle keyboard
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('d'):
                self._cycle_difficulty()
    
    def _cycle_difficulty(self):
        """Cycle through difficulty levels"""
        difficulties = ["easy", "medium", "hard"]
        current_index = difficulties.index(self.difficulty)
        self.difficulty = difficulties[(current_index + 1) % len(difficulties)]
        print(f"\n🎯 Difficulty changed to: {self.difficulty}")
    
    def _draw_complete_visualization(self, frame, gesture_result, telemetry):
        """Draw complete visualization with ML predictions"""
        height, width = frame.shape[:2]
        
        # Main info panel
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (380, 350), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.8, frame, 0.2, 0, frame)
        
        font = cv2.FONT_HERSHEY_SIMPLEX
        
        # Title
        cv2.putText(frame, "SynapseNet ML Demo", (20, 35), font, 0.8, (0, 255, 255), 2)
        
        # Score and stats
        score_color = (0, 255, 0) if self.score > 70 else (0, 255, 255) if self.score > 40 else (0, 0, 255)
        cv2.putText(frame, f"Resilience: {self.score:.1f}%", (20, 65), font, 0.7, score_color, 2)
        
        elapsed = time.time() - self.start_time
        cv2.putText(frame, f"Time: {elapsed:.1f}s | Difficulty: {self.difficulty}", (20, 90), font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Actions: {self.actions_taken} | AI Attacks: {self.ai_attacks}", (20, 110), font, 0.5, (255, 255, 255), 1)
        
        # ML stats
        if self.ml_enabled:
            ml_accuracy = (self.ml_predictions_correct / max(1, self.ml_predictions_made)) * 100
            cv2.putText(frame, f"ML Predictions: {self.ml_predictions_made} | Accuracy: {ml_accuracy:.1f}%", (20, 130), font, 0.4, (0, 255, 255), 1)
        
        # Current gesture
        gesture_color = (0, 255, 0) if gesture_result.confidence > 0.7 else (100, 100, 100)
        cv2.putText(frame, f"Gesture: {gesture_result.gesture.upper()}", (20, 160), font, 0.6, gesture_color, 2)
        
        # Active ML predictions
        if self.ml_enabled and self.active_predictions:
            y_pos = 190
            cv2.putText(frame, "🤖 ACTIVE ML PREDICTIONS:", (20, y_pos), font, 0.5, (0, 255, 255), 1)
            
            for i, pred in enumerate(self.active_predictions[:3]):  # Show max 3
                y_pos += 25
                pred_text = f"{pred.failure_type}: {pred.probability:.2f} ({pred.seconds_until_failure:.0f}s)"
                cv2.putText(frame, pred_text, (25, y_pos), font, 0.4, (255, 255, 0), 1)
                
                # Recommended action
                y_pos += 15
                action_text = f"→ Use {pred.recommended_action.upper()} gesture"
                cv2.putText(frame, action_text, (30, y_pos), font, 0.3, (200, 200, 200), 1)
        
        # System status
        if telemetry:
            healthy_comps = sum(1 for c in telemetry.components if c.status == ComponentStatus.HEALTHY)
            total_comps = len(telemetry.components)
            cv2.putText(frame, f"Components: {healthy_comps}/{total_comps}", (20, 310), font, 0.5, (255, 255, 255), 1)
            
            avg_temp = telemetry.system_metrics.get('avg_temperature_c', 0)
            temp_color = (0, 255, 0) if avg_temp < 60 else (0, 255, 255) if avg_temp < 80 else (0, 0, 255)
            cv2.putText(frame, f"Avg Temp: {avg_temp:.1f}°C", (20, 330), font, 0.5, temp_color, 1)
        
        # Instructions
        cv2.putText(frame, "🤖 ML predicts failures - follow recommendations!", (20, height-60), font, 0.4, (255, 255, 0), 1)
        cv2.putText(frame, "Cut ✂️ | Heal ✊ | Reroute ✋ | Shield 🙌", (20, height-40), font, 0.4, (200, 200, 200), 1)
        cv2.putText(frame, "Press 'q' to quit, 'd' to change difficulty", (20, height-20), font, 0.4, (200, 200, 200), 1)
    
    def _print_final_stats(self):
        """Print final statistics"""
        print("\n📊 Final Statistics:")
        print(f"   Final Score: {self.score:.1f}%")
        print(f"   Actions Taken: {self.actions_taken}")
        print(f"   AI Attacks Survived: {self.ai_attacks}")
        
        if self.ml_enabled and self.ml_predictions_made > 0:
            accuracy = (self.ml_predictions_correct / self.ml_predictions_made) * 100
            print(f"   ML Predictions Made: {self.ml_predictions_made}")
            print(f"   ML-Guided Actions: {self.ml_predictions_correct}")
            print(f"   ML Guidance Accuracy: {accuracy:.1f}%")
        
        print("\n🎉 Thanks for playing SynapseNet ML Demo!")


def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='ML-Enhanced SynapseNet Demo')
    parser.add_argument('--models', type=str, default='models', help='Path to trained ML models')
    
    args = parser.parse_args()
    
    try:
        demo = MLEnhancedSynapseNet(args.models)
        demo.run()
        return 0
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
