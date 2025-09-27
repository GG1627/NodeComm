#!/usr/bin/env python3
"""
Gesture recognition for SynapseNet using MediaPipe hand landmarks.
Detects 4 specific gestures: Cut (✊), Heal (✋), Reroute (👉), Shield (🙌)
"""

import cv2
import mediapipe as mp
import numpy as np
import time
from typing import Optional, Tuple, List
from dataclasses import dataclass


@dataclass
class GestureResult:
    """Result of gesture detection"""
    gesture: str  # "cut", "heal", "reroute", "shield", "none"
    confidence: float  # 0.0 to 1.0
    hand_count: int
    timestamp: float


class GestureRecognizer:
    """Recognizes hand gestures using MediaPipe landmarks"""
    
    def __init__(self):
        # Initialize MediaPipe
        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.5
        )
        
        # Gesture smoothing
        self.gesture_history = []
        self.history_size = 5  # Smooth over last 5 frames
        
        # Gesture thresholds
        self.confidence_threshold = 0.7
        
        # SIMPLE state tracking - bulletproof approach
        self.current_detected_gesture = "none"
        self.gesture_start_time = 0
        self.min_gesture_duration = 2.0  # Must hold gesture for 2.0s
        self.gesture_triggered = False  # Flag to track if we've triggered this gesture hold
        self.last_frame_gesture = "none"  # What we detected in the last frame
        
    def _count_extended_fingers(self, landmarks) -> int:
        """Count how many fingers are extended"""
        # Finger tip and PIP joint landmarks
        # Thumb: 4 (tip), 3 (ip), 2 (pip)
        # Index: 8 (tip), 6 (pip)  
        # Middle: 12 (tip), 10 (pip)
        # Ring: 16 (tip), 14 (pip)
        # Pinky: 20 (tip), 18 (pip)
        
        fingers_up = 0
        
        # Thumb (special case - compare x coordinates)
        if landmarks[4].x > landmarks[3].x:  # Thumb tip right of IP joint
            fingers_up += 1
            
        # Other fingers (compare y coordinates - tip below PIP means extended)
        finger_tips = [8, 12, 16, 20]  # Index, Middle, Ring, Pinky
        finger_pips = [6, 10, 14, 18]
        
        for tip, pip in zip(finger_tips, finger_pips):
            if landmarks[tip].y < landmarks[pip].y:  # Tip above PIP = extended
                fingers_up += 1
                
        return fingers_up
    
    def _is_scissors_gesture(self, landmarks) -> bool:
        """Check if index and middle fingers are extended like scissors"""
        # Index and middle fingers extended
        index_extended = landmarks[8].y < landmarks[6].y
        middle_extended = landmarks[12].y < landmarks[10].y
        
        # Other fingers folded
        ring_folded = landmarks[16].y > landmarks[14].y  
        pinky_folded = landmarks[20].y > landmarks[18].y
        
        # Thumb folded (x comparison)
        thumb_folded = landmarks[4].x < landmarks[3].x
        
        return index_extended and middle_extended and ring_folded and pinky_folded and thumb_folded
    
    def _is_fist(self, landmarks) -> bool:
        """Check if hand is making a fist"""
        # All fingertips should be below their PIP joints
        fingertips = [4, 8, 12, 16, 20]  # Thumb, Index, Middle, Ring, Pinky
        pips = [3, 6, 10, 14, 18]
        
        folded_count = 0
        
        # Check thumb (x comparison)
        if landmarks[4].x < landmarks[3].x:
            folded_count += 1
            
        # Check other fingers (y comparison)
        for i in range(1, 5):  # Skip thumb
            tip_idx = fingertips[i]
            pip_idx = pips[i]
            if landmarks[tip_idx].y > landmarks[pip_idx].y:  # Tip below PIP = folded
                folded_count += 1
                
        return folded_count >= 4  # At least 4 fingers folded
    
    def _is_open_palm(self, landmarks) -> bool:
        """Check if hand is open palm"""
        extended_fingers = self._count_extended_fingers(landmarks)
        return extended_fingers >= 4  # At least 4 fingers extended
    
    def _classify_single_hand(self, landmarks) -> Tuple[str, float]:
        """Classify gesture for a single hand"""
        
        # Check for scissors (Cut gesture) - Index + Middle finger
        if self._is_scissors_gesture(landmarks):
            return "cut", 0.9
            
        # Check for fist (Heal gesture)
        if self._is_fist(landmarks):
            return "heal", 0.9
            
        # Check for open palm (Reroute gesture)
        if self._is_open_palm(landmarks):
            return "reroute", 0.8
            
        return "none", 0.0
    
    def recognize_gesture(self, image) -> GestureResult:
        """Recognize gesture from camera image"""
        # Convert BGR to RGB
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Process image
        results = self.hands.process(rgb_image)
        
        gesture = "none"
        confidence = 0.0
        hand_count = 0
        
        if results.multi_hand_landmarks:
            hand_count = len(results.multi_hand_landmarks)
            
            # Check for Shield gesture (both hands open)
            if hand_count == 2:
                both_open = True
                for hand_landmarks in results.multi_hand_landmarks:
                    if not self._is_open_palm(hand_landmarks.landmark):
                        both_open = False
                        break
                
                if both_open:
                    gesture = "shield"
                    confidence = 0.9
            
            # Single hand gestures
            if gesture == "none" and hand_count >= 1:
                # Use first detected hand
                hand_landmarks = results.multi_hand_landmarks[0]
                gesture, confidence = self._classify_single_hand(hand_landmarks.landmark)
        
        # Apply smoothing
        result = GestureResult(
            gesture=gesture,
            confidence=confidence, 
            hand_count=hand_count,
            timestamp=time.time()
        )
        
        # Add to history and get smoothed result
        smoothed_result = self._smooth_gesture(result)
        
        return smoothed_result
    
    def _smooth_gesture(self, result: GestureResult) -> GestureResult:
        """BULLETPROOF gesture detection - simple and guaranteed to work"""
        current_time = result.timestamp
        
        # Add to history for smoothing
        self.gesture_history.append(result)
        if len(self.gesture_history) > self.history_size:
            self.gesture_history.pop(0)
        
        # Don't process if we don't have enough history
        if len(self.gesture_history) < 3:
            return GestureResult(gesture="none", confidence=0.0, hand_count=result.hand_count, timestamp=current_time)
        
        # Find the most common gesture in recent frames
        gesture_counts = {}
        total_confidence = 0
        valid_count = 0
        
        for hist_result in self.gesture_history:
            if hist_result.confidence > self.confidence_threshold:
                gesture = hist_result.gesture
                gesture_counts[gesture] = gesture_counts.get(gesture, 0) + 1
                total_confidence += hist_result.confidence
                valid_count += 1
        
        # Determine current detected gesture
        frame_detected_gesture = "none"
        avg_confidence = 0.0
        
        if gesture_counts and valid_count > 0:
            most_common = max(gesture_counts.keys(), key=lambda x: gesture_counts[x])
            avg_confidence = total_confidence / valid_count
            
            # Need 80% agreement for stability
            if gesture_counts[most_common] >= len(self.gesture_history) * 0.8:
                frame_detected_gesture = most_common
        
        # SIMPLE STATE MACHINE - bulletproof logic
        
        # Case 1: No gesture detected this frame
        if frame_detected_gesture == "none":
            # Reset everything when no gesture
            self.current_detected_gesture = "none"
            self.gesture_triggered = False
            return GestureResult(gesture="none", confidence=0.0, hand_count=result.hand_count, timestamp=current_time)
        
        # Case 2: New gesture detected (different from what we were tracking)
        if frame_detected_gesture != self.current_detected_gesture:
            # Start tracking this new gesture
            self.current_detected_gesture = frame_detected_gesture
            self.gesture_start_time = current_time
            self.gesture_triggered = False  # Haven't triggered this gesture hold yet
            return GestureResult(gesture="none", confidence=avg_confidence, hand_count=result.hand_count, timestamp=current_time)
        
        # Case 3: Same gesture continuing - check if we should trigger
        if frame_detected_gesture == self.current_detected_gesture:
            gesture_duration = current_time - self.gesture_start_time
            
            # If we've held it long enough AND haven't triggered this hold yet
            if gesture_duration >= self.min_gesture_duration and not self.gesture_triggered:
                # TRIGGER! Mark this gesture hold as triggered
                self.gesture_triggered = True
                
                print(f"🎯 TRIGGERED: {frame_detected_gesture} after {gesture_duration:.1f}s hold")
                
                return GestureResult(
                    gesture=frame_detected_gesture,
                    confidence=avg_confidence,
                    hand_count=result.hand_count,
                    timestamp=current_time
                )
        
        # Default: return none (either still building up to trigger, or already triggered this hold)
        return GestureResult(gesture="none", confidence=avg_confidence, hand_count=result.hand_count, timestamp=current_time)


class GestureDemo:
    """Demo application for gesture recognition"""
    
    def __init__(self):
        self.recognizer = GestureRecognizer()
        self.cap = cv2.VideoCapture(0)
        
        if not self.cap.isOpened():
            raise RuntimeError("Could not open camera")
        
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        # Gesture action counters
        self.gesture_counts = {"cut": 0, "heal": 0, "reroute": 0, "shield": 0}
        self.last_gesture = "none"
        self.last_action_time = 0
        self.action_cooldown = 1.0  # 1 second between actions
        
    def run(self):
        """Run the gesture recognition demo"""
        print("🎮 SynapseNet Gesture Recognition Demo - BULLETPROOF VERSION")
        print("=" * 60)
        print("How it works:")
        print("1. Make a gesture and HOLD IT for 2 seconds")
        print("2. Watch the progress bar fill up")
        print("3. Action triggers when bar is full")
        print("4. RELEASE gesture completely, then make it again to retrigger")
        print()
        print("Gestures to try:")
        print("   ✂️ Cut: Index + Middle finger (scissors)")
        print("   ✊ Heal: Make a fist") 
        print("   ✋ Reroute: Open palm")
        print("   🙌 Shield: Both hands open")
        print("\nPress 'q' to quit, 'r' to reset counters")
        
        try:
            while True:
                ret, frame = self.cap.read()
                if not ret:
                    break
                
                # Flip for mirror effect
                frame = cv2.flip(frame, 1)
                
                # Recognize gesture
                result = self.recognizer.recognize_gesture(frame)
                
                # Handle gesture actions
                self._handle_gesture_action(result)
                
                # Draw visualization
                self._draw_visualization(frame, result)
                
                # Show frame
                cv2.imshow('SynapseNet - Gesture Recognition', frame)
                
                # Handle keyboard
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('r'):
                    self.gesture_counts = {"cut": 0, "heal": 0, "reroute": 0, "shield": 0}
                    print("🔄 Counters reset!")
                    
        except KeyboardInterrupt:
            print("\n⚡ Interrupted")
        finally:
            self.cap.release()
            cv2.destroyAllWindows()
    
    def _handle_gesture_action(self, result: GestureResult):
        """Handle detected gesture actions"""
        current_time = time.time()
        
        # SIMPLIFIED: Only trigger actions for confident gestures (no cooldown needed since gesture system handles timing)
        if result.confidence > 0.7 and result.gesture != "none":
            
            # Always increment counter when we get a valid gesture result
            self.gesture_counts[result.gesture] += 1
            self.last_gesture = result.gesture
            self.last_action_time = current_time
            
            # Print action
            action_messages = {
                "cut": "✂️ CUT ACTION! Isolating failed component...",
                "heal": "✊ HEAL ACTION! Repairing system...", 
                "reroute": "✋ REROUTE ACTION! Redirecting traffic...",
                "shield": "🙌 SHIELD ACTION! Boosting system resilience!"
            }
            
            print(f"{action_messages[result.gesture]} (Total: {self.gesture_counts[result.gesture]})")
    
    def _draw_visualization(self, frame, result: GestureResult):
        """Draw visualization on frame"""
        height, width = frame.shape[:2]
        
        # Draw semi-transparent overlay
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (400, 250), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
        
        # Draw gesture info
        font = cv2.FONT_HERSHEY_SIMPLEX
        
        # Current detected gesture
        current_gesture = self.recognizer.current_detected_gesture if hasattr(self.recognizer, 'current_detected_gesture') else "none"
        gesture_color = (0, 255, 0) if result.confidence > 0.7 else (0, 0, 255)
        
        cv2.putText(frame, f"Detected: {current_gesture.upper()}", (20, 40), font, 0.8, gesture_color, 2)
        cv2.putText(frame, f"Confidence: {result.confidence:.2f}", (20, 70), font, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"Hands: {result.hand_count}", (20, 100), font, 0.6, (255, 255, 255), 2)
        
        # Progress bar for gesture stability
        if hasattr(self.recognizer, 'current_detected_gesture') and self.recognizer.current_detected_gesture != "none":
            current_time = time.time()
            gesture_duration = current_time - self.recognizer.gesture_start_time
            progress = min(1.0, gesture_duration / self.recognizer.min_gesture_duration)
            
            # Draw progress bar
            bar_width = 300
            bar_height = 20
            bar_x = 20
            bar_y = 120
            
            # Background
            cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_width, bar_y + bar_height), (50, 50, 50), -1)
            
            # Progress fill
            fill_width = int(bar_width * progress)
            
            # Color based on whether we've already triggered this hold
            if hasattr(self.recognizer, 'gesture_triggered') and self.recognizer.gesture_triggered:
                color = (100, 100, 100)  # Gray - already triggered this hold
                status_text = "TRIGGERED - Release to reset"
            elif progress >= 1.0:
                color = (0, 255, 0)  # Green - ready to trigger
                status_text = "READY TO TRIGGER!"
            else:
                color = (0, 255, 255)  # Cyan - building up
                status_text = f"Hold for {self.recognizer.min_gesture_duration:.1f}s"
            
            cv2.rectangle(frame, (bar_x, bar_y), (bar_x + fill_width, bar_y + bar_height), color, -1)
            
            # Text
            cv2.putText(frame, status_text, (bar_x, bar_y - 5), font, 0.5, (255, 255, 255), 1)
            
            # Show duration
            cv2.putText(frame, f"{gesture_duration:.1f}s", (bar_x + bar_width + 10, bar_y + 15), font, 0.6, color, 2)
        
        # Action counters
        y_start = 170
        for i, (gesture, count) in enumerate(self.gesture_counts.items()):
            color = (0, 255, 0) if count > 0 else (100, 100, 100)
            cv2.putText(frame, f"{gesture.capitalize()}: {count}", (20, y_start + i*25), font, 0.5, color, 1)
        
        # Instructions
        cv2.putText(frame, "RELEASE gesture completely between triggers!", (20, height-40), font, 0.4, (255, 255, 0), 1)
        cv2.putText(frame, "Press 'q' to quit, 'r' to reset", (width-250, height-20), font, 0.4, (255, 255, 255), 1)


def main():
    """Main function"""
    try:
        demo = GestureDemo()
        demo.run()
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1
    return 0


if __name__ == "__main__":
    exit(main())
