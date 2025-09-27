#!/usr/bin/env python3
"""
Simple camera test to make sure OpenCV can access the webcam.
"""

import cv2
import time

def test_camera():
    """Test if camera is working"""
    print("🎥 Testing camera access...")
    
    # Try to open camera
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("❌ Could not open camera!")
        print("\n🔧 Troubleshooting:")
        print("   1. Make sure webcam is connected")
        print("   2. Close other apps using camera (Teams, Zoom, etc.)")
        print("   3. Check Windows camera privacy settings")
        return False
    
    print("✅ Camera opened successfully!")
    
    # Get camera properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    print(f"📹 Camera info:")
    print(f"   Resolution: {width}x{height}")
    print(f"   FPS: {fps}")
    
    # Test reading a few frames
    print("\n📸 Testing frame capture...")
    for i in range(5):
        ret, frame = cap.read()
        if ret:
            print(f"   Frame {i+1}: ✅ Success ({frame.shape})")
        else:
            print(f"   Frame {i+1}: ❌ Failed")
            break
        time.sleep(0.1)
    
    cap.release()
    print("\n✅ Camera test complete!")
    return True

if __name__ == "__main__":
    if test_camera():
        print("\n🚀 Camera is working! You can now run:")
        print("   python hand_tracking_basic.py")
    else:
        print("\n❌ Camera test failed. Please fix camera issues first.")
