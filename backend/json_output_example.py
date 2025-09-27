#!/usr/bin/env python3
"""
Show example JSON output from the simulation.
This helps frontend developers understand the data format.
"""

import sys
import json
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from providers.sim import HardwareSimulator


def main():
    """Generate and display example JSON output"""
    print("📡 SynapseNet JSON Output Format Example")
    print("=" * 50)
    
    # Create simulator and get one frame of data
    sim = HardwareSimulator(seed=42)
    telemetry = sim.step()
    
    # Convert to JSON
    json_data = telemetry.model_dump()
    json_str = json.dumps(json_data, indent=2)
    
    print("🔍 Telemetry Frame Structure:")
    print(f"   Components: {len(json_data['components'])}")
    print(f"   Links: {len(json_data['links'])}")
    print(f"   System Metrics: {len(json_data['system_metrics'])}")
    print(f"   JSON Size: {len(json_str)} characters")
    
    print("\n📋 Complete JSON Output:")
    print(json_str)
    
    print("\n🎯 Key Data Points for Frontend:")
    print("   - timestamp: Unix timestamp for synchronization")
    print("   - components[].position: {x, y, z} for 3D placement")
    print("   - components[].utilization: 0-100% for visual intensity")
    print("   - components[].temperature: Celsius for color coding")
    print("   - components[].status: 'healthy'/'degraded'/'failed' for alerts")
    print("   - links[].latency_ms: For animation speed")
    print("   - links[].bandwidth_gbps: For particle flow rate")
    print("   - links[].error_rate: For glitch effects")
    print("   - system_metrics: For dashboard gauges")
    
    print("\n✅ This JSON format is ready for WebSocket streaming!")


if __name__ == "__main__":
    main()
