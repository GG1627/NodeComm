#!/usr/bin/env python3
"""
Generate synthetic training dataset for failure prediction ML models.
Creates realistic hardware telemetry data with labeled failures.
"""

import numpy as np
import pandas as pd
import random
import argparse
from typing import List, Dict, Tuple
import pickle
from dataclasses import dataclass
import time


@dataclass
class TelemetrySnapshot:
    """Single moment in time telemetry data"""
    timestamp: float
    cpu_util: float
    cpu_temp: float
    gpu_util: float
    gpu_temp: float
    memory_util: float
    network_latency: float
    network_bandwidth: float
    network_util: float
    power_draw: float
    failure_type: str  # 'none', 'cpu_thermal', 'network_congestion', 'system_cascade'
    failure_in_10s: bool  # Will failure occur in next 10 seconds?


class HardwareSimulator:
    """Generate realistic hardware telemetry sequences"""
    
    def __init__(self, seed: int = 42):
        random.seed(seed)
        np.random.seed(seed)
        
        # Base operating ranges
        self.base_ranges = {
            'cpu_util': (20, 70),
            'cpu_temp': (35, 65),
            'gpu_util': (10, 60),
            'gpu_temp': (30, 55),
            'memory_util': (30, 75),
            'network_latency': (0.1, 2.0),
            'network_bandwidth': (50, 95),  # % of max capacity used
            'network_util': (20, 80),
            'power_draw': (200, 400)
        }
    
    def generate_normal_sequence(self, duration_seconds: int = 60) -> List[TelemetrySnapshot]:
        """Generate a normal operating sequence"""
        sequence = []
        current_time = time.time()
        
        # Start with random but reasonable values
        state = {
            'cpu_util': random.uniform(*self.base_ranges['cpu_util']),
            'cpu_temp': random.uniform(*self.base_ranges['cpu_temp']),
            'gpu_util': random.uniform(*self.base_ranges['gpu_util']),
            'gpu_temp': random.uniform(*self.base_ranges['gpu_temp']),
            'memory_util': random.uniform(*self.base_ranges['memory_util']),
            'network_latency': random.uniform(*self.base_ranges['network_latency']),
            'network_bandwidth': random.uniform(*self.base_ranges['network_bandwidth']),
            'network_util': random.uniform(*self.base_ranges['network_util']),
            'power_draw': random.uniform(*self.base_ranges['power_draw'])
        }
        
        for i in range(duration_seconds * 10):  # 10 samples per second
            # Add realistic correlations
            state['cpu_temp'] = 25 + (state['cpu_util'] * 0.6) + np.random.normal(0, 2)
            state['gpu_temp'] = 20 + (state['gpu_util'] * 0.8) + np.random.normal(0, 3)
            state['power_draw'] = 150 + (state['cpu_util'] * 2) + (state['gpu_util'] * 3) + np.random.normal(0, 20)
            
            # Network latency correlates with utilization
            if state['network_util'] > 80:
                state['network_latency'] = state['network_latency'] * (1 + (state['network_util'] - 80) / 100)
            
            # Add some random walk behavior
            for key in state:
                if key not in ['cpu_temp', 'gpu_temp', 'power_draw', 'network_latency']:
                    state[key] += np.random.normal(0, 2)
                    # Keep within reasonable bounds
                    min_val, max_val = self.base_ranges[key]
                    state[key] = np.clip(state[key], min_val * 0.8, max_val * 1.2)
            
            snapshot = TelemetrySnapshot(
                timestamp=current_time + i * 0.1,
                cpu_util=max(0, min(100, state['cpu_util'])),
                cpu_temp=max(20, min(100, state['cpu_temp'])),
                gpu_util=max(0, min(100, state['gpu_util'])),
                gpu_temp=max(20, min(100, state['gpu_temp'])),
                memory_util=max(0, min(100, state['memory_util'])),
                network_latency=max(0.01, state['network_latency']),
                network_bandwidth=max(10, min(100, state['network_bandwidth'])),
                network_util=max(0, min(100, state['network_util'])),
                power_draw=max(50, state['power_draw']),
                failure_type='none',
                failure_in_10s=False
            )
            
            sequence.append(snapshot)
        
        return sequence
    
    def generate_cpu_thermal_failure(self) -> List[TelemetrySnapshot]:
        """Generate sequence leading to CPU thermal failure"""
        sequence = []
        current_time = time.time()
        
        # Start normal, then gradually overheat
        cpu_util = random.uniform(60, 80)
        cpu_temp = random.uniform(50, 60)
        
        for i in range(400):  # 40 seconds
            t = i * 0.1
            
            # Gradually increase load and temperature
            if t > 10:  # Start stress after 10 seconds
                cpu_util += random.uniform(0.1, 0.3)
                cpu_temp += random.uniform(0.05, 0.15)
            
            # Add some noise
            cpu_util += np.random.normal(0, 1)
            cpu_temp += np.random.normal(0, 0.5)
            
            # Other components react to CPU stress
            gpu_util = random.uniform(20, 50) + np.random.normal(0, 5)
            gpu_temp = 30 + (gpu_util * 0.5) + np.random.normal(0, 2)
            memory_util = random.uniform(40, 70) + np.random.normal(0, 3)
            network_latency = random.uniform(0.5, 2.0) + np.random.normal(0, 0.2)
            network_bandwidth = random.uniform(60, 90) + np.random.normal(0, 5)
            network_util = random.uniform(30, 70) + np.random.normal(0, 5)
            power_draw = 200 + (cpu_util * 3) + (gpu_util * 2) + np.random.normal(0, 15)
            
            # Determine failure status
            failure_imminent = cpu_temp > 85 or cpu_util > 95
            failure_in_10s = (t > 20) and (cpu_temp > 75 or cpu_util > 85)
            
            failure_type = 'cpu_thermal' if failure_imminent else 'none'
            
            snapshot = TelemetrySnapshot(
                timestamp=current_time + t,
                cpu_util=max(0, min(100, cpu_util)),
                cpu_temp=max(20, min(105, cpu_temp)),
                gpu_util=max(0, min(100, gpu_util)),
                gpu_temp=max(20, min(100, gpu_temp)),
                memory_util=max(0, min(100, memory_util)),
                network_latency=max(0.01, network_latency),
                network_bandwidth=max(10, min(100, network_bandwidth)),
                network_util=max(0, min(100, network_util)),
                power_draw=max(50, power_draw),
                failure_type=failure_type,
                failure_in_10s=failure_in_10s
            )
            
            sequence.append(snapshot)
        
        return sequence
    
    def generate_network_congestion_failure(self) -> List[TelemetrySnapshot]:
        """Generate sequence leading to network congestion failure"""
        sequence = []
        current_time = time.time()
        
        # Start with moderate network usage
        network_util = random.uniform(40, 60)
        network_latency = random.uniform(0.5, 1.5)
        
        for i in range(300):  # 30 seconds
            t = i * 0.1
            
            # Gradually increase network load
            if t > 5:
                network_util += random.uniform(0.2, 0.5)
                network_latency += random.uniform(0.01, 0.05)
            
            # Add noise
            network_util += np.random.normal(0, 2)
            network_latency += np.random.normal(0, 0.1)
            
            # Other components - moderate load
            cpu_util = random.uniform(40, 70) + np.random.normal(0, 3)
            cpu_temp = 35 + (cpu_util * 0.4) + np.random.normal(0, 2)
            gpu_util = random.uniform(20, 50) + np.random.normal(0, 5)
            gpu_temp = 25 + (gpu_util * 0.6) + np.random.normal(0, 3)
            memory_util = random.uniform(50, 80) + np.random.normal(0, 3)
            network_bandwidth = max(20, 100 - network_util + np.random.normal(0, 5))
            power_draw = 250 + (cpu_util * 2) + np.random.normal(0, 20)
            
            # Determine failure status
            failure_imminent = network_util > 90 or network_latency > 8.0
            failure_in_10s = (t > 15) and (network_util > 80 or network_latency > 5.0)
            
            failure_type = 'network_congestion' if failure_imminent else 'none'
            
            snapshot = TelemetrySnapshot(
                timestamp=current_time + t,
                cpu_util=max(0, min(100, cpu_util)),
                cpu_temp=max(20, min(100, cpu_temp)),
                gpu_util=max(0, min(100, gpu_util)),
                gpu_temp=max(20, min(100, gpu_temp)),
                memory_util=max(0, min(100, memory_util)),
                network_latency=max(0.01, network_latency),
                network_bandwidth=max(10, min(100, network_bandwidth)),
                network_util=max(0, min(100, network_util)),
                power_draw=max(50, power_draw),
                failure_type=failure_type,
                failure_in_10s=failure_in_10s
            )
            
            sequence.append(snapshot)
        
        return sequence
    
    def generate_system_cascade_failure(self) -> List[TelemetrySnapshot]:
        """Generate sequence leading to system-wide cascade failure"""
        sequence = []
        current_time = time.time()
        
        # Start with high but manageable load
        cpu_util = random.uniform(70, 80)
        gpu_util = random.uniform(60, 75)
        memory_util = random.uniform(70, 85)
        network_util = random.uniform(60, 75)
        
        for i in range(350):  # 35 seconds
            t = i * 0.1
            
            # Multiple systems gradually degrade
            if t > 8:
                cpu_util += random.uniform(0.1, 0.2)
                gpu_util += random.uniform(0.1, 0.25)
                memory_util += random.uniform(0.05, 0.15)
                network_util += random.uniform(0.1, 0.2)
            
            # Add noise
            cpu_util += np.random.normal(0, 1.5)
            gpu_util += np.random.normal(0, 2)
            memory_util += np.random.normal(0, 1)
            network_util += np.random.normal(0, 1.5)
            
            # Calculate dependent metrics
            cpu_temp = 30 + (cpu_util * 0.7) + np.random.normal(0, 2)
            gpu_temp = 25 + (gpu_util * 0.8) + np.random.normal(0, 3)
            network_latency = 0.5 + (network_util / 50) + np.random.normal(0, 0.2)
            network_bandwidth = max(20, 100 - network_util + np.random.normal(0, 3))
            power_draw = 300 + (cpu_util * 3) + (gpu_util * 2.5) + np.random.normal(0, 25)
            
            # Determine failure status - cascade when multiple systems stressed
            high_stress_count = sum([
                cpu_util > 85,
                gpu_util > 80,
                memory_util > 85,
                network_util > 80,
                cpu_temp > 80
            ])
            
            failure_imminent = high_stress_count >= 3
            failure_in_10s = (t > 20) and high_stress_count >= 2
            
            failure_type = 'system_cascade' if failure_imminent else 'none'
            
            snapshot = TelemetrySnapshot(
                timestamp=current_time + t,
                cpu_util=max(0, min(100, cpu_util)),
                cpu_temp=max(20, min(105, cpu_temp)),
                gpu_util=max(0, min(100, gpu_util)),
                gpu_temp=max(20, min(100, gpu_temp)),
                memory_util=max(0, min(100, memory_util)),
                network_latency=max(0.01, network_latency),
                network_bandwidth=max(10, min(100, network_bandwidth)),
                network_util=max(0, min(100, network_util)),
                power_draw=max(50, power_draw),
                failure_type=failure_type,
                failure_in_10s=failure_in_10s
            )
            
            sequence.append(snapshot)
        
        return sequence


def generate_dataset(num_samples: int, output_file: str):
    """Generate complete training dataset"""
    print(f"🔄 Generating {num_samples} training samples...")
    
    simulator = HardwareSimulator()
    all_sequences = []
    
    # Distribution of scenarios
    normal_samples = int(num_samples * 0.6)      # 60% normal operation
    cpu_samples = int(num_samples * 0.15)        # 15% CPU thermal failures
    network_samples = int(num_samples * 0.15)    # 15% network failures
    cascade_samples = int(num_samples * 0.1)     # 10% cascade failures
    
    print(f"  📊 Normal sequences: {normal_samples}")
    print(f"  🔥 CPU thermal failures: {cpu_samples}")
    print(f"  🌊 Network congestion failures: {network_samples}")
    print(f"  💥 System cascade failures: {cascade_samples}")
    
    # Generate normal sequences
    for i in range(normal_samples):
        if i % 100 == 0:
            print(f"  Normal: {i}/{normal_samples}")
        sequence = simulator.generate_normal_sequence()
        all_sequences.extend(sequence)
    
    # Generate CPU thermal failure sequences
    for i in range(cpu_samples):
        if i % 10 == 0:
            print(f"  CPU thermal: {i}/{cpu_samples}")
        sequence = simulator.generate_cpu_thermal_failure()
        all_sequences.extend(sequence)
    
    # Generate network congestion sequences
    for i in range(network_samples):
        if i % 10 == 0:
            print(f"  Network: {i}/{network_samples}")
        sequence = simulator.generate_network_congestion_failure()
        all_sequences.extend(sequence)
    
    # Generate cascade failure sequences
    for i in range(cascade_samples):
        if i % 10 == 0:
            print(f"  Cascade: {i}/{cascade_samples}")
        sequence = simulator.generate_system_cascade_failure()
        all_sequences.extend(sequence)
    
    # Convert to DataFrame
    print("📝 Converting to DataFrame...")
    data = []
    for snapshot in all_sequences:
        data.append({
            'timestamp': snapshot.timestamp,
            'cpu_util': snapshot.cpu_util,
            'cpu_temp': snapshot.cpu_temp,
            'gpu_util': snapshot.gpu_util,
            'gpu_temp': snapshot.gpu_temp,
            'memory_util': snapshot.memory_util,
            'network_latency': snapshot.network_latency,
            'network_bandwidth': snapshot.network_bandwidth,
            'network_util': snapshot.network_util,
            'power_draw': snapshot.power_draw,
            'failure_type': snapshot.failure_type,
            'failure_in_10s': snapshot.failure_in_10s
        })
    
    df = pd.DataFrame(data)
    
    # Save dataset
    print(f"💾 Saving dataset to {output_file}...")
    with open(output_file, 'wb') as f:
        pickle.dump(df, f)
    
    # Print statistics
    print(f"✅ Dataset generated successfully!")
    print(f"   Total samples: {len(df)}")
    print(f"   Failure samples: {len(df[df['failure_in_10s'] == True])}")
    print(f"   Normal samples: {len(df[df['failure_in_10s'] == False])}")
    print(f"   Failure types: {df['failure_type'].value_counts().to_dict()}")
    
    return df


def main():
    parser = argparse.ArgumentParser(description='Generate ML training dataset for hardware failure prediction')
    parser.add_argument('--samples', type=int, default=1000, help='Number of scenarios to generate')
    parser.add_argument('--output', type=str, default='failure_dataset.pkl', help='Output file path')
    
    args = parser.parse_args()
    
    dataset = generate_dataset(args.samples, args.output)
    
    print(f"\n🎯 Dataset ready for training!")
    print(f"   Run: python train_models.py --dataset {args.output}")


if __name__ == "__main__":
    main()
