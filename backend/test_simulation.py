#!/usr/bin/env python3
"""
Command-line test script for SynapseNet hardware simulation.
Run this to verify the basic simulation is working.
"""

import sys
import time
import json
from pathlib import Path

# Add src to path so we can import our modules
sys.path.insert(0, str(Path(__file__).parent / "src"))

from providers.sim import HardwareSimulator
from schemas import ComponentStatus


def print_separator(title: str):
    """Print a nice separator with title"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)


def print_component_status(components):
    """Print component status in a nice table format"""
    print(f"{'ID':<12} {'Name':<20} {'Type':<8} {'Util%':<6} {'Temp°C':<7} {'Power W':<8} {'Status'}")
    print('-' * 70)
    
    for comp in components:
        print(f"{comp.id:<12} {comp.name:<20} {comp.component_type.value:<8} "
              f"{comp.utilization:>5.1f} {comp.temperature:>6.1f} "
              f"{comp.power_draw:>7.1f} {comp.status.value}")


def print_link_status(links):
    """Print link status in a nice table format"""
    print(f"{'ID':<15} {'Source':<8} {'Target':<8} {'Type':<6} {'Util%':<6} {'Lat ms':<7} {'BW Gbps':<8} {'Err%':<6}")
    print('-' * 75)
    
    for link in links:
        print(f"{link.id:<15} {link.source_id:<8} {link.target_id:<8} "
              f"{link.link_type.value:<6} {link.utilization:>5.1f} "
              f"{link.latency_ms:>6.3f} {link.bandwidth_gbps:>7.1f} {link.error_rate:>5.2f}")


def print_system_metrics(metrics):
    """Print system-wide metrics"""
    print("System Metrics:")
    for key, value in metrics.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.2f}")
        else:
            print(f"  {key}: {value}")


def test_basic_simulation():
    """Test basic simulation functionality"""
    print_separator("SynapseNet Hardware Simulation Test")
    
    # Initialize simulator
    print("Initializing hardware simulator...")
    sim = HardwareSimulator(seed=42)
    
    # Show initial topology
    print_separator("Initial Topology")
    topology = sim.get_topology_summary()
    print(f"Components: {len(topology['components'])}")
    print(f"Links: {len(topology['links'])}")
    
    print("\nComponent Details:")
    for comp_id, comp_info in topology['components'].items():
        print(f"  {comp_id}: {comp_info['name']} ({comp_info['type']})")
    
    print("\nLink Details:")
    for link_id, link_info in topology['links'].items():
        print(f"  {link_id}: {link_info['source']} -> {link_info['target']} ({link_info['type']})")
    
    # Run simulation for a few steps
    print_separator("Running Simulation (5 steps)")
    
    for step in range(5):
        print(f"\n--- Step {step + 1} ---")
        telemetry = sim.step()
        
        print_component_status(telemetry.components)
        print()
        print_link_status(telemetry.links)
        print()
        print_system_metrics(telemetry.system_metrics)
        
        # Small delay to make it more readable
        time.sleep(0.5)
    
    return sim


def test_chaos_injection(sim):
    """Test chaos injection functionality"""
    print_separator("Testing Chaos Injection")
    
    # Get baseline
    baseline = sim.step()
    print("Baseline metrics:")
    print_system_metrics(baseline.system_metrics)
    
    # Inject chaos into CPU
    print(f"\nInjecting overload chaos into CPU...")
    sim.inject_chaos("cpu_0", "overload")
    
    after_chaos = sim.step()
    print("\nAfter CPU overload:")
    print_component_status(after_chaos.components)
    print()
    print_system_metrics(after_chaos.system_metrics)
    
    # Inject chaos into a link
    print(f"\nInjecting latency spike into CPU-Switch link...")
    sim.inject_chaos("cpu_switch_link", "latency_spike")
    
    after_link_chaos = sim.step()
    print("\nAfter link latency spike:")
    print_link_status(after_link_chaos.links)
    print()
    print_system_metrics(after_link_chaos.system_metrics)


def test_json_serialization(sim):
    """Test that our data can be serialized to JSON (important for API)"""
    print_separator("Testing JSON Serialization")
    
    telemetry = sim.step()
    
    try:
        # Convert to dict and then to JSON
        telemetry_dict = telemetry.model_dump()
        json_str = json.dumps(telemetry_dict, indent=2)
        
        print("✅ JSON serialization successful!")
        print(f"JSON size: {len(json_str)} characters")
        
        # Show a sample of the JSON
        lines = json_str.split('\n')
        print("\nFirst 10 lines of JSON:")
        for line in lines[:10]:
            print(line)
        print("...")
        
        # Test deserialization
        from schemas import TelemetryFrame
        restored = TelemetryFrame.model_validate(telemetry_dict)
        print("✅ JSON deserialization successful!")
        
    except Exception as e:
        print(f"❌ JSON serialization failed: {e}")
        return False
    
    return True


def main():
    """Main test function"""
    print("🚀 Starting SynapseNet Backend Tests")
    
    try:
        # Test basic simulation
        sim = test_basic_simulation()
        
        # Test chaos injection
        test_chaos_injection(sim)
        
        # Test JSON serialization
        test_json_serialization(sim)
        
        print_separator("All Tests Completed Successfully! ✅")
        print("\nThe hardware simulation is working correctly.")
        print("You can now:")
        print("1. Run this script again to see different random values")
        print("2. Modify the topology in src/providers/sim.py")
        print("3. Add more chaos injection types")
        print("4. Build the FastAPI web service on top of this")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
