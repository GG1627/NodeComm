#!/usr/bin/env python3
"""
Test MediaPipe installation and basic functionality.
"""

def test_imports():
    """Test if all required packages can be imported"""
    print("🔍 Testing imports...")
    
    try:
        import cv2
        print(f"✅ OpenCV: {cv2.__version__}")
    except ImportError as e:
        print(f"❌ OpenCV import failed: {e}")
        return False
    
    try:
        import mediapipe as mp
        print(f"✅ MediaPipe: {mp.__version__}")
    except ImportError as e:
        print(f"❌ MediaPipe import failed: {e}")
        return False
    
    try:
        import numpy as np
        print(f"✅ NumPy: {np.__version__}")
    except ImportError as e:
        print(f"❌ NumPy import failed: {e}")
        return False
    
    return True

def test_mediapipe_hands():
    """Test MediaPipe Hands initialization"""
    print("\n🖐️ Testing MediaPipe Hands...")
    
    try:
        import mediapipe as mp
        
        # Initialize MediaPipe hands
        mp_hands = mp.solutions.hands
        hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.5
        )
        
        print("✅ MediaPipe Hands initialized successfully!")
        hands.close()
        return True
        
    except Exception as e:
        print(f"❌ MediaPipe Hands failed: {e}")
        return False

def main():
    """Run all tests"""
    print("🧪 SynapseNet MediaPipe Test Suite")
    print("=" * 40)
    
    # Test imports
    if not test_imports():
        print("\n❌ Import test failed!")
        return 1
    
    # Test MediaPipe hands
    if not test_mediapipe_hands():
        print("\n❌ MediaPipe Hands test failed!")
        return 1
    
    print("\n🎉 All tests passed!")
    print("\n🚀 Ready to run hand tracking:")
    print("   python test_camera.py      # Test camera first")
    print("   python hand_tracking_basic.py  # Full hand tracking")
    
    return 0

if __name__ == "__main__":
    exit(main())
