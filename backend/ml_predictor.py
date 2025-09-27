#!/usr/bin/env python3
"""
Real-time ML-based failure prediction engine.
Loads trained models and provides predictions for live telemetry data.
"""

import numpy as np
import joblib
import os
from collections import deque
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import time


@dataclass
class FailurePrediction:
    """ML-based failure prediction"""
    failure_type: str
    probability: float  # 0.0 to 1.0
    seconds_until_failure: float
    confidence: float
    recommended_action: str
    explanation: str


class FailurePredictionML:
    """Real-time ML failure predictor"""
    
    def __init__(self, models_dir: str):
        self.models_dir = models_dir
        self.models = {}
        self.scalers = {}
        self.feature_names = []
        self.failure_type_mapping = {}
        
        # Telemetry history for trend calculation
        self.telemetry_history = deque(maxlen=50)  # Keep last 5 seconds at 10Hz
        
        # Load trained models
        self.load_models()
        
        # Prediction thresholds
        self.binary_threshold = 0.7  # Probability threshold for failure prediction
        self.confidence_threshold = 0.6  # Minimum confidence for showing prediction
        
        print(f"✅ ML Predictor initialized with models from {models_dir}")
    
    def load_models(self):
        """Load all trained models and supporting files"""
        print(f"📂 Loading ML models from {self.models_dir}...")
        
        try:
            # Load binary classifier
            binary_model_path = os.path.join(self.models_dir, "failure_predictor.pkl")
            binary_scaler_path = os.path.join(self.models_dir, "failure_predictor_scaler.pkl")
            
            if os.path.exists(binary_model_path):
                self.models['binary'] = joblib.load(binary_model_path)
                self.scalers['binary'] = joblib.load(binary_scaler_path)
                print("   ✅ Binary failure predictor loaded")
            
            # Load multiclass classifier
            multi_model_path = os.path.join(self.models_dir, "failure_type_predictor.pkl")
            multi_scaler_path = os.path.join(self.models_dir, "failure_type_predictor_scaler.pkl")
            
            if os.path.exists(multi_model_path):
                self.models['multiclass'] = joblib.load(multi_model_path)
                self.scalers['multiclass'] = joblib.load(multi_scaler_path)
                print("   ✅ Multiclass failure type predictor loaded")
            
            # Load failure type mapping
            mapping_path = os.path.join(self.models_dir, "failure_type_mapping.pkl")
            if os.path.exists(mapping_path):
                self.failure_type_mapping = joblib.load(mapping_path)
                print(f"   ✅ Failure type mapping loaded: {self.failure_type_mapping}")
            
            # Load feature names
            feature_path = os.path.join(self.models_dir, "feature_names.pkl")
            if os.path.exists(feature_path):
                self.feature_names = joblib.load(feature_path)
                print(f"   ✅ Feature names loaded: {len(self.feature_names)} features")
            
        except Exception as e:
            print(f"❌ Error loading models: {e}")
            raise
    
    def extract_features_from_telemetry(self, telemetry_frame) -> Optional[np.array]:
        """Extract ML features from current telemetry frame"""
        
        # Add current telemetry to history
        current_data = {
            'timestamp': telemetry_frame.timestamp,
            'cpu_util': telemetry_frame.components[0].utilization if telemetry_frame.components else 0,
            'cpu_temp': telemetry_frame.components[0].temperature if telemetry_frame.components else 25,
            'gpu_util': telemetry_frame.components[1].utilization if len(telemetry_frame.components) > 1 else 0,
            'gpu_temp': telemetry_frame.components[1].temperature if len(telemetry_frame.components) > 1 else 25,
            'memory_util': telemetry_frame.components[2].utilization if len(telemetry_frame.components) > 2 else 0,
            'network_latency': telemetry_frame.links[0].latency_ms if telemetry_frame.links else 0.1,
            'network_bandwidth': telemetry_frame.links[0].bandwidth_gbps if telemetry_frame.links else 50,
            'network_util': telemetry_frame.links[0].utilization if telemetry_frame.links else 0,
            'power_draw': telemetry_frame.system_metrics.get('total_power_watts', 200)
        }
        
        self.telemetry_history.append(current_data)
        
        # Need at least 5 samples for trend calculation
        if len(self.telemetry_history) < 5:
            return None
        
        # Current state features
        current = self.telemetry_history[-1]
        feature_vector = [
            current['cpu_util'], current['cpu_temp'], current['gpu_util'],
            current['gpu_temp'], current['memory_util'], current['network_latency'],
            current['network_bandwidth'], current['network_util'], current['power_draw']
        ]
        
        # Calculate trend features over last 5 samples
        recent_history = list(self.telemetry_history)[-5:]
        
        try:
            # Calculate trends (slopes)
            cpu_util_values = [h['cpu_util'] for h in recent_history]
            cpu_temp_values = [h['cpu_temp'] for h in recent_history]
            gpu_util_values = [h['gpu_util'] for h in recent_history]
            gpu_temp_values = [h['gpu_temp'] for h in recent_history]
            network_latency_values = [h['network_latency'] for h in recent_history]
            network_util_values = [h['network_util'] for h in recent_history]
            power_values = [h['power_draw'] for h in recent_history]
            
            # Calculate linear trends
            cpu_util_trend = np.polyfit(range(5), cpu_util_values, 1)[0]
            cpu_temp_trend = np.polyfit(range(5), cpu_temp_values, 1)[0]
            gpu_util_trend = np.polyfit(range(5), gpu_util_values, 1)[0]
            gpu_temp_trend = np.polyfit(range(5), gpu_temp_values, 1)[0]
            network_latency_trend = np.polyfit(range(5), network_latency_values, 1)[0]
            network_util_trend = np.polyfit(range(5), network_util_values, 1)[0]
            power_trend = np.polyfit(range(5), power_values, 1)[0]
            
            trend_vector = [
                cpu_util_trend, cpu_temp_trend, gpu_util_trend, gpu_temp_trend,
                network_latency_trend, network_util_trend, power_trend
            ]
            
        except Exception as e:
            # Fallback to zero trends if calculation fails
            trend_vector = [0.0] * 7
        
        feature_vector.extend(trend_vector)
        
        return np.array(feature_vector).reshape(1, -1)
    
    def predict_failures(self, telemetry_frame) -> List[FailurePrediction]:
        """Make ML predictions for current telemetry"""
        
        # Extract features
        features = self.extract_features_from_telemetry(telemetry_frame)
        
        if features is None:
            return []  # Not enough history yet
        
        predictions = []
        
        try:
            # Binary prediction: Will any failure occur?
            if 'binary' in self.models:
                binary_model = self.models['binary']
                binary_scaler = self.scalers['binary']
                
                features_scaled = binary_scaler.transform(features)
                failure_probability = binary_model.predict_proba(features_scaled)[0][1]
                
                if failure_probability > self.binary_threshold:
                    # Predict specific failure type
                    failure_type = "unknown"
                    type_probability = failure_probability
                    
                    if 'multiclass' in self.models and len(self.failure_type_mapping) > 0:
                        multi_model = self.models['multiclass']
                        multi_scaler = self.scalers['multiclass']
                        
                        multi_features_scaled = multi_scaler.transform(features)
                        type_prediction = multi_model.predict(multi_features_scaled)[0]
                        type_probabilities = multi_model.predict_proba(multi_features_scaled)[0]
                        
                        failure_type = self.failure_type_mapping.get(type_prediction, "unknown")
                        type_probability = type_probabilities[type_prediction]
                    
                    # Estimate time to failure based on probability
                    # Higher probability = sooner failure
                    time_to_failure = max(2.0, 15.0 * (1.0 - failure_probability))
                    
                    # Generate prediction
                    prediction = self.create_failure_prediction(
                        failure_type, failure_probability, time_to_failure, type_probability
                    )
                    
                    if prediction.confidence > self.confidence_threshold:
                        predictions.append(prediction)
        
        except Exception as e:
            print(f"⚠️ ML prediction error: {e}")
        
        return predictions
    
    def create_failure_prediction(self, failure_type: str, probability: float, 
                                 time_to_failure: float, confidence: float) -> FailurePrediction:
        """Create a structured failure prediction with recommendations"""
        
        # Map failure types to actions and explanations
        failure_info = {
            'cpu_thermal': {
                'action': 'heal',
                'explanation': 'CPU temperature rising rapidly - use Heal gesture to cool system'
            },
            'network_congestion': {
                'action': 'reroute', 
                'explanation': 'Network traffic building up - use Reroute gesture to optimize paths'
            },
            'system_cascade': {
                'action': 'shield',
                'explanation': 'Multiple systems stressed - use Shield gesture for system-wide protection'
            },
            'unknown': {
                'action': 'shield',
                'explanation': 'System instability detected - use Shield gesture as precaution'
            }
        }
        
        info = failure_info.get(failure_type, failure_info['unknown'])
        
        return FailurePrediction(
            failure_type=failure_type,
            probability=probability,
            seconds_until_failure=time_to_failure,
            confidence=confidence,
            recommended_action=info['action'],
            explanation=info['explanation']
        )
    
    def get_model_info(self) -> Dict:
        """Get information about loaded models"""
        return {
            'models_loaded': list(self.models.keys()),
            'feature_count': len(self.feature_names),
            'failure_types': list(self.failure_type_mapping.values()) if self.failure_type_mapping else [],
            'binary_threshold': self.binary_threshold,
            'confidence_threshold': self.confidence_threshold,
            'history_length': len(self.telemetry_history),
            'max_history': self.telemetry_history.maxlen
        }


# Standalone test function
def test_ml_predictor():
    """Test the ML predictor with dummy data"""
    print("🧪 Testing ML Predictor...")
    
    # Mock telemetry frame for testing
    class MockComponent:
        def __init__(self, utilization, temperature):
            self.utilization = utilization
            self.temperature = temperature
    
    class MockLink:
        def __init__(self, latency_ms, bandwidth_gbps, utilization):
            self.latency_ms = latency_ms
            self.bandwidth_gbps = bandwidth_gbps
            self.utilization = utilization
    
    class MockTelemetry:
        def __init__(self):
            self.timestamp = time.time()
            self.components = [
                MockComponent(75, 65),  # CPU
                MockComponent(45, 50),  # GPU
                MockComponent(60, 40),  # Memory
            ]
            self.links = [
                MockLink(1.2, 25, 70)  # Network
            ]
            self.system_metrics = {'total_power_watts': 350}
    
    try:
        predictor = FailurePredictionML('models')
        
        # Test with several frames to build history
        for i in range(10):
            mock_telemetry = MockTelemetry()
            # Simulate increasing stress
            mock_telemetry.components[0].utilization += i * 5
            mock_telemetry.components[0].temperature += i * 2
            
            predictions = predictor.predict_failures(mock_telemetry)
            
            if predictions:
                print(f"   Step {i}: {len(predictions)} predictions")
                for pred in predictions:
                    print(f"     {pred.failure_type}: {pred.probability:.3f} probability, {pred.seconds_until_failure:.1f}s")
            
            time.sleep(0.1)  # Simulate real-time
        
        print("✅ ML Predictor test completed!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")


if __name__ == "__main__":
    test_ml_predictor()
