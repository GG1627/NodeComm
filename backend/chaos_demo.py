#!/usr/bin/env python3
"""
Chaos injection demo for SynapseNet.
This script demonstrates different types of system failures and their effects.
"""

import sys
import time
from pathlib import Path

# Add src to path so we can import our modules
sys.path.insert(0, str(Path(__file__).parent / "src"))

from providers.sim import HardwareSimulator
from schemas import ComponentStatus


def print_header(title: str):
    """Print a colorful header"""
    print(f"\n🔥 {title} 🔥")
    print("=" * (len(title) + 6))


def print_metrics_comparison(before, after, title):
    """Compare metrics before and after chaos"""
    print(f"\n{title}:")
    print(f"  Avg Utilization: {before['avg_utilization']:.1f}% → {after['avg_utilization']:.1f}%")
    print(f"  Total Power: {before['total_power_watts']:.1f}W → {after['total_power_watts']:.1f}W")
    print(f"  Avg Latency: {before['avg_latency_ms']:.3f}ms → {after['avg_latency_ms']:.3f}ms")
    print(f"  Total Bandwidth: {before['total_bandwidth_gbps']:.1f} → {after['total_bandwidth_gbps']:.1f} Gbps")
    print(f"  Healthy Components: {int(before['healthy_components'])} → {int(after['healthy_components'])}")
    print(f"  Healthy Links: {int(before['healthy_links'])} → {int(after['healthy_links'])}")


def scenario_cpu_overload():
    """Demonstrate CPU overload scenario"""
    print_header("SCENARIO 1: CPU Overload Attack")
    
    sim = HardwareSimulator(seed=123)
    
    # Get baseline
    baseline = sim.step()
    print("🎯 Baseline system running normally...")
    
    # Inject CPU overload
    print("💥 AI injects CPU overload attack!")
    sim.inject_chaos("cpu_0", "overload")
    
    # Show effects over time
    for i in range(3):
        telemetry = sim.step()
        cpu = next(c for c in telemetry.components if c.id == "cpu_0")
        print(f"   Step {i+1}: CPU at {cpu.utilization:.1f}% utilization, {cpu.temperature:.1f}°C")
        time.sleep(0.5)
    
    final = sim.step()
    print_metrics_comparison(baseline.system_metrics, final.system_metrics, "Impact")


def scenario_network_congestion():
    """Demonstrate network congestion scenario"""
    print_header("SCENARIO 2: Network Congestion Attack")
    
    sim = HardwareSimulator(seed=456)
    
    # Get baseline
    baseline = sim.step()
    print("🎯 Baseline network traffic flowing normally...")
    
    # Inject congestion on multiple links
    print("💥 AI floods the network with traffic!")
    sim.inject_chaos("cpu_switch_link", "congestion")
    sim.inject_chaos("switch_gpu_link", "congestion")
    
    # Show cascading effects
    for i in range(3):
        telemetry = sim.step()
        link1 = next(l for l in telemetry.links if l.id == "cpu_switch_link")
        link2 = next(l for l in telemetry.links if l.id == "switch_gpu_link")
        print(f"   Step {i+1}: CPU→Switch {link1.utilization:.1f}% ({link1.latency_ms:.3f}ms), "
              f"Switch→GPU {link2.utilization:.1f}% ({link2.latency_ms:.3f}ms)")
        time.sleep(0.5)
    
    final = sim.step()
    print_metrics_comparison(baseline.system_metrics, final.system_metrics, "Network Impact")


def scenario_component_failure():
    """Demonstrate component failure scenario"""
    print_header("SCENARIO 3: Component Failure")
    
    sim = HardwareSimulator(seed=789)
    
    # Get baseline
    baseline = sim.step()
    print("🎯 All components healthy and operational...")
    
    # Fail the switch (critical component)
    print("💥 AI causes critical switch failure!")
    sim.inject_chaos("switch_0", "failure")
    
    # Show system trying to cope
    for i in range(3):
        telemetry = sim.step()
        switch = next(c for c in telemetry.components if c.id == "switch_0")
        failed_links = [l for l in telemetry.links if l.status != ComponentStatus.HEALTHY]
        print(f"   Step {i+1}: Switch status: {switch.status.value}, "
              f"Failed links: {len(failed_links)}")
        time.sleep(0.5)
    
    final = sim.step()
    print_metrics_comparison(baseline.system_metrics, final.system_metrics, "Failure Impact")


def scenario_cascade_failure():
    """Demonstrate cascading failure scenario"""
    print_header("SCENARIO 4: Cascading System Failure")
    
    sim = HardwareSimulator(seed=999)
    
    # Get baseline
    baseline = sim.step()
    print("🎯 System operating at high utilization...")
    
    # Create a cascade: overheat CPU → overload memory → congest links
    print("💥 AI triggers cascading failure sequence!")
    
    print("   🔥 Step 1: CPU overheating...")
    sim.inject_chaos("cpu_0", "overheat")
    step1 = sim.step()
    cpu = next(c for c in step1.components if c.id == "cpu_0")
    print(f"      CPU temperature: {cpu.temperature:.1f}°C")
    time.sleep(0.5)
    
    print("   ⚡ Step 2: Memory overload from CPU throttling...")
    sim.inject_chaos("mem_0", "overload")
    step2 = sim.step()
    memory = next(c for c in step2.components if c.id == "mem_0")
    print(f"      Memory utilization: {memory.utilization:.1f}%")
    time.sleep(0.5)
    
    print("   🌊 Step 3: Network congestion from rerouting...")
    sim.inject_chaos("cpu_mem_link", "congestion")
    step3 = sim.step()
    link = next(l for l in step3.links if l.id == "cpu_mem_link")
    print(f"      DDR link utilization: {link.utilization:.1f}% (latency: {link.latency_ms:.3f}ms)")
    time.sleep(0.5)
    
    print("   💀 Step 4: System struggling to recover...")
    final = sim.step()
    
    print_metrics_comparison(baseline.system_metrics, final.system_metrics, "Cascade Impact")


def main():
    """Run all chaos scenarios"""
    print("🎮 SynapseNet Chaos Engineering Demo")
    print("Simulating AI adversary attacks on hardware infrastructure")
    print("=" * 60)
    
    try:
        scenario_cpu_overload()
        time.sleep(1)
        
        scenario_network_congestion()
        time.sleep(1)
        
        scenario_component_failure()
        time.sleep(1)
        
        scenario_cascade_failure()
        
        print_header("Demo Complete!")
        print("🎯 These scenarios show how the AI adversary will challenge players")
        print("🎮 Players will need to use gestures (Cut/Heal/Reroute/Shield) to counter these attacks")
        print("⚡ The simulation provides realistic hardware behavior for engaging gameplay")
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
