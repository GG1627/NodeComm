#!/usr/bin/env python3
"""
Test script for Learn Mode Computer Vision backend
Tests the hand tracking functionality without the full server
"""

import sys
import os
import time
import json

# Add backend directory to path
sys.path.append(os.path.dirname(__file__))

from learn_mode_cv import LearnModeHandTracker, LearnModeCVResult


def test_callback(result: LearnModeCVResult):
    """Test callback to receive hand tracking data"""
    print(f"\n🖐️ Hand Tracking Update:")
    print(f"   📊 Processing time: {result.processing_time_ms:.1f}ms")
    print(f"   📐 Frame: {result.frame_width}x{result.frame_height}")
    print(f"   🖐️ Hands detected: {len(result.hands)}")
    
    for hand in result.hands:
        print(f"   ✋ {hand.handedness} Hand (ID: {hand.hand_id})")
        print(f"      📍 Landmarks: {len(hand.landmarks)} points")
        print(f"      📦 Bounding box: {hand.bounding_box}")
        print(f"      🎯 Confidence: {hand.confidence:.2f}")
        
        # Show some key landmarks
        if hand.landmarks:
            wrist = hand.landmarks[0]  # Wrist is landmark 0
            index_tip = hand.landmarks[8]  # Index finger tip is landmark 8
            print(f"      👆 Index tip: ({index_tip.x:.3f}, {index_tip.y:.3f})")
            print(f"      🔗 Wrist: ({wrist.x:.3f}, {wrist.y:.3f})")


def main():
    """Test the Learn Mode hand tracker"""
    print("🧪 Testing Learn Mode Computer Vision")
    print("=" * 50)
    
    # Create hand tracker
    tracker = LearnModeHandTracker()
    
    try:
        # Start camera with test callback
        print("\n📹 Starting camera...")
        if not tracker.start_camera(test_callback):
            print("❌ Failed to start camera!")
            return
        
        print("✅ Camera started successfully!")
        print("\n🎮 Instructions:")
        print("   - Move your hands in front of the camera")
        print("   - Try different hand positions")
        print("   - Press Ctrl+C to stop")
        print("\n" + "=" * 50)
        
        # Keep running until interrupted
        while True:
            time.sleep(1)
            
            # Show status every 5 seconds
            status = tracker.get_camera_status()
            if status['frame_count'] > 0 and status['frame_count'] % 150 == 0:
                print(f"\n📊 Status: {status['fps']:.1f} FPS, {status['frame_count']} frames processed")
    
    except KeyboardInterrupt:
        print("\n\n🛑 Stopping test...")
    
    except Exception as e:
        print(f"\n❌ Error during test: {e}")
    
    finally:
        # Clean up
        tracker.stop_camera()
        print("✅ Test completed and camera stopped")


if __name__ == "__main__":
    main()

