#!/usr/bin/env python3
"""
Basic MediaPipe hand tracking demo for SynapseNet.
This script shows live camera feed with hand landmarks detected.
"""

import cv2
import mediapipe as mp
import time


class BasicHandTracker:
    """Simple hand tracking using MediaPipe"""
    
    def __init__(self):
        # Initialize MediaPipe hands
        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        # Configure hand detection
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,      # Process video stream
            max_num_hands=2,              # Detect up to 2 hands
            min_detection_confidence=0.7, # Higher confidence for stability
            min_tracking_confidence=0.5   # Track hands between frames
        )
        
        # Initialize camera
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            raise RuntimeError("❌ Could not open camera. Make sure your webcam is connected!")
        
        # Set camera properties for better performance
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        
        print("✅ Camera initialized successfully!")
        print("📹 Resolution: 640x480 @ 30fps")
        print("🖐️ Detecting up to 2 hands")
        print("\n🎮 Controls:")
        print("   - Press 'q' to quit")
        print("   - Press 's' to take screenshot")
        print("   - Move your hands in front of camera")
        
    def run(self):
        """Main loop for hand tracking"""
        frame_count = 0
        start_time = time.time()
        
        try:
            while True:
                # Read frame from camera
                success, image = self.cap.read()
                if not success:
                    print("❌ Failed to read from camera")
                    break
                
                # Flip image horizontally for mirror effect
                image = cv2.flip(image, 1)
                
                # Convert BGR to RGB (MediaPipe uses RGB)
                rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                
                # Process the image and detect hands
                results = self.hands.process(rgb_image)
                
                # Draw hand landmarks on the image
                if results.multi_hand_landmarks:
                    for hand_landmarks in results.multi_hand_landmarks:
                        # Draw landmarks and connections
                        self.mp_drawing.draw_landmarks(
                            image,
                            hand_landmarks,
                            self.mp_hands.HAND_CONNECTIONS,
                            self.mp_drawing_styles.get_default_hand_landmarks_style(),
                            self.mp_drawing_styles.get_default_hand_connections_style()
                        )
                
                # Add info overlay
                self._draw_info_overlay(image, results, frame_count, start_time)
                
                # Display the image
                cv2.imshow('SynapseNet - Hand Tracking', image)
                
                # Handle keyboard input
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    print("👋 Quitting hand tracking...")
                    break
                elif key == ord('s'):
                    filename = f"hand_tracking_screenshot_{int(time.time())}.jpg"
                    cv2.imwrite(filename, image)
                    print(f"📸 Screenshot saved: {filename}")
                
                frame_count += 1
                
        except KeyboardInterrupt:
            print("\n⚡ Interrupted by user")
        finally:
            self._cleanup()
    
    def _draw_info_overlay(self, image, results, frame_count, start_time):
        """Draw information overlay on the image"""
        height, width = image.shape[:2]
        
        # Calculate FPS
        elapsed = time.time() - start_time
        fps = frame_count / elapsed if elapsed > 0 else 0
        
        # Count detected hands
        num_hands = len(results.multi_hand_landmarks) if results.multi_hand_landmarks else 0
        
        # Draw semi-transparent background for text
        overlay = image.copy()
        cv2.rectangle(overlay, (10, 10), (300, 120), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, image, 0.3, 0, image)
        
        # Draw text information
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        color = (0, 255, 0)  # Green
        thickness = 2
        
        cv2.putText(image, f"FPS: {fps:.1f}", (20, 35), font, font_scale, color, thickness)
        cv2.putText(image, f"Hands detected: {num_hands}", (20, 60), font, font_scale, color, thickness)
        cv2.putText(image, f"Frame: {frame_count}", (20, 85), font, font_scale, color, thickness)
        cv2.putText(image, "Press 'q' to quit, 's' for screenshot", (20, 110), font, 0.5, (255, 255, 255), 1)
        
        # Draw hand status
        if num_hands > 0:
            cv2.putText(image, "🖐️ HANDS DETECTED!", (width - 200, 35), font, 0.6, (0, 255, 0), 2)
        else:
            cv2.putText(image, "No hands detected", (width - 200, 35), font, 0.6, (0, 0, 255), 2)
    
    def _cleanup(self):
        """Clean up resources"""
        print("🧹 Cleaning up...")
        if hasattr(self, 'cap'):
            self.cap.release()
        cv2.destroyAllWindows()
        print("✅ Cleanup complete")


def main():
    """Main function"""
    print("🚀 Starting SynapseNet Hand Tracking Demo")
    print("=" * 50)
    
    try:
        tracker = BasicHandTracker()
        tracker.run()
        
    except RuntimeError as e:
        print(f"❌ Error: {e}")
        print("\n🔧 Troubleshooting:")
        print("   1. Make sure your webcam is connected")
        print("   2. Close other apps that might be using the camera")
        print("   3. Try a different USB port")
        print("   4. Check camera permissions in Windows settings")
        return 1
        
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
