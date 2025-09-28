#!/usr/bin/env python3
"""
Learn Mode Computer Vision - Hand Tracking for Direct Node Manipulation
Streams hand landmarks for interactive node dragging in Learn Mode
"""

import cv2
import mediapipe as mp
import time
import threading
import json
import base64
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict


@dataclass
class HandLandmark:
    """Represents a single hand landmark point"""
    x: float  # 0.0 to 1.0 (normalized to image width)
    y: float  # 0.0 to 1.0 (normalized to image height)
    z: float  # depth (relative to wrist)
    visibility: float  # 0.0 to 1.0


@dataclass
class HandData:
    """Complete hand data for Learn Mode"""
    hand_id: int  # 0 or 1 (left/right)
    handedness: str  # "Left" or "Right"
    landmarks: List[HandLandmark]  # 21 landmark points
    bounding_box: Dict[str, float]  # x, y, width, height (normalized)
    timestamp: float
    confidence: float  # overall hand detection confidence


@dataclass
class LearnModeCVResult:
    """Result from Learn Mode computer vision"""
    hands: List[HandData]
    frame_width: int
    frame_height: int
    timestamp: float
    processing_time_ms: float
    frame_base64: Optional[str] = None  # Base64 encoded video frame


class LearnModeHandTracker:
    """Hand tracking specifically for Learn Mode node manipulation"""
    
    def __init__(self):
        # Initialize MediaPipe hands
        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        # Configure for Learn Mode (optimized for performance)
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,  # Support both hands for node manipulation
            min_detection_confidence=0.5,  # Lower threshold for better detection
            min_tracking_confidence=0.3,   # Lower threshold for smoother tracking
            model_complexity=0  # Reduced model complexity for faster processing
        )
        
        # Camera and processing state
        self.camera_active = False
        self.cap: Optional[cv2.VideoCapture] = None
        self.processing_thread: Optional[threading.Thread] = None
        self.stop_processing = False
        
        # Callback for streaming results
        self.result_callback: Optional[callable] = None
        
        # Performance tracking
        self.frame_count = 0
        self.start_time = time.time()
        
        print("✅ Learn Mode Hand Tracker initialized")
    
    def start_camera(self, callback: callable) -> bool:
        """Start camera and hand tracking with callback for results"""
        try:
            # Initialize camera
            self.cap = cv2.VideoCapture(0)
            if not self.cap.isOpened():
                print("❌ Could not open camera for Learn Mode")
                return False
            
            # Set camera properties for Learn Mode (balanced quality/performance)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 30)
            
            # Set callback
            self.result_callback = callback
            
            # Start processing thread
            self.camera_active = True
            self.stop_processing = False
            self.processing_thread = threading.Thread(target=self._processing_loop, daemon=True)
            self.processing_thread.start()
            
            print("✅ Learn Mode camera started successfully")
            print("📹 Resolution: 640x480 @ 30fps")
            print("🖐️ Tracking up to 2 hands for node manipulation")
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to start Learn Mode camera: {e}")
            return False
    
    def stop_camera(self):
        """Stop camera and hand tracking"""
        self.camera_active = False
        self.stop_processing = True
        
        if self.processing_thread and self.processing_thread.is_alive():
            self.processing_thread.join(timeout=2.0)
        
        if self.cap:
            self.cap.release()
            self.cap = None
        
        print("🛑 Learn Mode camera stopped")
    
    def _processing_loop(self):
        """Main processing loop for hand tracking"""
        while self.camera_active and not self.stop_processing:
            try:
                # Read frame
                success, image = self.cap.read()
                if not success:
                    continue
                
                # Flip horizontally for mirror effect
                image = cv2.flip(image, 1)
                frame_height, frame_width = image.shape[:2]
                
                # Convert BGR to RGB for MediaPipe
                rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                
                # Process with MediaPipe
                start_time = time.time()
                results = self.hands.process(rgb_image)
                processing_time = (time.time() - start_time) * 1000  # ms
                
                # Extract hand data
                hands_data = self._extract_hand_data(results, frame_width, frame_height, processing_time, image)
                
                # Send result via callback (always send, even if no hands detected)
                if self.result_callback:
                    self.result_callback(hands_data)
                
                # Performance tracking
                self.frame_count += 1
                if self.frame_count % 100 == 0:
                    elapsed = time.time() - self.start_time
                    fps = self.frame_count / elapsed
                    print(f"📊 Learn Mode CV: {fps:.1f} FPS, {processing_time:.1f}ms processing")
                
                # Small delay to prevent excessive CPU usage
                time.sleep(0.01)
                
            except Exception as e:
                print(f"❌ Error in Learn Mode processing loop: {e}")
                time.sleep(0.1)
    
    def _extract_hand_data(self, results, frame_width: int, frame_height: int, processing_time_ms: float, image) -> LearnModeCVResult:
        """Extract hand landmark data from MediaPipe results"""
        hands_data = []
        
        # Get handedness (left/right) if available
        handedness_list = results.multi_handedness if results.multi_handedness else []
        
        # Process detected hands
        if results.multi_hand_landmarks:
            for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                # Get handedness
                handedness = "Unknown"
                if idx < len(handedness_list):
                    handedness = handedness_list[idx].classification[0].label
                
                # Extract landmarks
                landmarks = []
                for landmark in hand_landmarks.landmark:
                    landmarks.append(HandLandmark(
                        x=landmark.x,
                        y=landmark.y,
                        z=landmark.z,
                        visibility=landmark.visibility if hasattr(landmark, 'visibility') else 1.0
                    ))
                
                # Calculate bounding box
                x_coords = [lm.x for lm in landmarks]
                y_coords = [lm.y for lm in landmarks]
                bbox = {
                    'x': min(x_coords),
                    'y': min(y_coords),
                    'width': max(x_coords) - min(x_coords),
                    'height': max(y_coords) - min(y_coords)
                }
                
                # Create hand data
                hand_data = HandData(
                    hand_id=idx,
                    handedness=handedness,
                    landmarks=landmarks,
                    bounding_box=bbox,
                    timestamp=time.time(),
                    confidence=0.8  # Default confidence for now
                )
                
                hands_data.append(hand_data)
        
        # Encode frame as base64 for frontend display
        frame_base64 = None
        try:
            # Resize frame for faster transmission (optional)
            resized_frame = cv2.resize(image, (320, 240))
            _, buffer = cv2.imencode('.jpg', resized_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
        except Exception as e:
            print(f"Error encoding frame: {e}")
        
        return LearnModeCVResult(
            hands=hands_data,
            frame_width=frame_width,
            frame_height=frame_height,
            timestamp=time.time(),
            processing_time_ms=processing_time_ms,
            frame_base64=frame_base64
        )
    
    def get_camera_status(self) -> Dict[str, any]:
        """Get current camera status"""
        return {
            'active': self.camera_active,
            'fps': self.frame_count / max(time.time() - self.start_time, 1),
            'frame_count': self.frame_count,
            'camera_available': self.cap is not None and self.cap.isOpened()
        }


# Global instance for Learn Mode
learn_mode_tracker = LearnModeHandTracker()


def start_learn_mode_cv(callback: callable) -> bool:
    """Start Learn Mode computer vision"""
    return learn_mode_tracker.start_camera(callback)


def stop_learn_mode_cv():
    """Stop Learn Mode computer vision"""
    learn_mode_tracker.stop_camera()


def get_learn_mode_status() -> Dict[str, any]:
    """Get Learn Mode CV status"""
    return learn_mode_tracker.get_camera_status()


if __name__ == "__main__":
    """Test the Learn Mode hand tracker"""
    def test_callback(result: LearnModeCVResult):
        print(f"🖐️ Detected {len(result.hands)} hands:")
        for hand in result.hands:
            print(f"   - {hand.handedness} hand: {len(hand.landmarks)} landmarks")
    
    print("🧪 Testing Learn Mode Hand Tracker...")
    
    if start_learn_mode_cv(test_callback):
        try:
            print("Press Ctrl+C to stop...")
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n🛑 Stopping test...")
    else:
        print("❌ Failed to start camera")
    
    stop_learn_mode_cv()
