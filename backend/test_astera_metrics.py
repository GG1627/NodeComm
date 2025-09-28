#!/usr/bin/env python3
"""
Test script for Astera Labs connectivity metrics

Demonstrates the new signal integrity, retimer compensation, 
smart cable health, and CXL utilization metrics.
"""

import time
import sys
from pathlib import Path

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from kpi.scorecard import KPIScorecard, GameMode
from schemas import (
    SystemState, HardwareComponent, Link, ComponentType, 
    LinkType, ComponentStatus, TelemetryFrame, Scorecard
)


def create_astera_test_system() -> SystemState:
    """Create a test system focused on Astera Labs connectivity"""
    
    # Create components with Astera-friendly names
    components = [
        HardwareComponent(
            id="cpu1", name="CPU Server (with PCIe Retimer)", 
            component_type=ComponentType.CPU,
            status=ComponentStatus.HEALTHY, utilization=45.0
        ),
        HardwareComponent(
            id="gpu1", name="AI Accelerator (H100 + Smart Cable)", 
            component_type=ComponentType.GPU,
            status=ComponentStatus.HEALTHY, utilization=70.0
        ),
        HardwareComponent(
            id="mem1", name="Memory Pool (CXL Platform)", 
            component_type=ComponentType.MEMORY,
            status=ComponentStatus.HEALTHY, utilization=65.0
        ),
        HardwareComponent(
            id="switch1", name="Data Hub (CXL Controller)", 
            component_type=ComponentType.SWITCH,
            status=ComponentStatus.HEALTHY, utilization=40.0
        )
    ]
    
    # Create links with varying signal quality conditions
    links = [
        # Excellent CXL memory channel
        Link(
            id="cpu_mem_cxl", name="Memory Channel (CXL 3.0)",
            source_id="cpu1", target_id="mem1",
            link_type=LinkType.CXL, status=ComponentStatus.HEALTHY,
            latency_ms=0.8, bandwidth_gbps=51.2, utilization=30.0, error_rate=0.0
        ),
        
        # Good PCIe connection with some retimer compensation needed
        Link(
            id="cpu_switch_pcie", name="Data Path (PCIe 5.0 Retimed)",
            source_id="cpu1", target_id="switch1",
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=2.5, bandwidth_gbps=64.0, utilization=60.0, error_rate=0.1
        ),
        
        # Smart cable connection with high utilization
        Link(
            id="switch_gpu_smart", name="AI Connection (Smart Cable)",
            source_id="switch1", target_id="gpu1",
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=1.2, bandwidth_gbps=100.0, utilization=85.0, error_rate=0.05
        )
    ]
    
    # Create telemetry frame
    telemetry = TelemetryFrame(
        timestamp=time.time(),
        components=components,
        links=links
    )
    
    # Create scorecard
    scorecard = Scorecard()
    
    return SystemState(
        telemetry=telemetry,
        scorecard=scorecard
    )


def test_astera_connectivity_metrics():
    """Test Astera Labs specific connectivity metrics"""
    print("🔗 Testing Astera Labs Connectivity Metrics")
    print("=" * 50)
    
    scorecard = KPIScorecard(mode=GameMode.CHAOS)
    system = create_astera_test_system()
    
    # Update with healthy system
    scorecard.update_system_state(system)
    metrics = scorecard.get_current_metrics()
    
    print("📊 Healthy System Metrics:")
    print(f"  Signal Integrity Score: {metrics.signal_integrity_score:.1f}%")
    print(f"  Retimer Compensation: {metrics.retimer_compensation_level:.1f}%")
    print(f"  Smart Cable Health: {metrics.smart_cable_health:.1f}%")
    print(f"  CXL Channel Utilization: {metrics.cxl_channel_utilization:.1f}%")
    
    # Simulate signal degradation scenarios
    print("\n🚨 Simulating Connectivity Issues...")
    
    # Scenario 1: High latency requiring retimer compensation
    print("\n1️⃣ High Latency on PCIe Link (Distance/Signal Integrity Issue)")
    for link in system.telemetry.links:
        if link.id == "cpu_switch_pcie":
            link.latency_ms = 8.0  # High latency
            link.error_rate = 0.5  # Some errors
    
    scorecard.update_system_state(system)
    metrics = scorecard.get_current_metrics()
    print(f"   Signal Integrity: {metrics.signal_integrity_score:.1f}% (↓)")
    print(f"   Retimer Compensation: {metrics.retimer_compensation_level:.1f}% (↑)")
    
    # Scenario 2: Smart cable thermal stress
    print("\n2️⃣ Smart Cable Thermal Stress (High Bandwidth Usage)")
    for link in system.telemetry.links:
        if link.id == "switch_gpu_smart":
            link.utilization = 95.0  # Very high utilization
            link.bandwidth_gbps = 150.0  # High bandwidth causing thermal stress
    
    scorecard.update_system_state(system)
    metrics = scorecard.get_current_metrics()
    print(f"   Smart Cable Health: {metrics.smart_cable_health:.1f}% (↓)")
    print(f"   Signal Integrity: {metrics.signal_integrity_score:.1f}% (↓)")
    
    # Scenario 3: CXL memory channel saturation
    print("\n3️⃣ CXL Memory Channel Saturation")
    for link in system.telemetry.links:
        if link.id == "cpu_mem_cxl":
            link.utilization = 90.0  # High memory traffic
    
    scorecard.update_system_state(system)
    metrics = scorecard.get_current_metrics()
    print(f"   CXL Channel Utilization: {metrics.cxl_channel_utilization:.1f}% (↑)")
    print(f"   Signal Integrity: {metrics.signal_integrity_score:.1f}% (↓)")
    
    # Show final comprehensive metrics
    print("\n📋 Final Connectivity Assessment:")
    print(f"  Overall Signal Integrity: {metrics.signal_integrity_score:.1f}%")
    print(f"  Retimer Compensation Needed: {metrics.retimer_compensation_level:.1f}%")
    print(f"  Smart Cable Health: {metrics.smart_cable_health:.1f}%")
    print(f"  CXL Memory Utilization: {metrics.cxl_channel_utilization:.1f}%")
    print(f"  System Resilience: {metrics.resilience_score:.1f}%")


def test_connectivity_insights():
    """Test connectivity-focused insights generation"""
    print("\n\n💡 Testing Connectivity Insights")
    print("=" * 50)
    
    scorecard = KPIScorecard(mode=GameMode.LEARNING)
    system = create_astera_test_system()
    
    # Simulate progressive degradation
    scenarios = [
        ("Baseline", {}),
        ("Signal Degradation", {"cpu_switch_pcie": {"latency_ms": 5.0, "error_rate": 0.3}}),
        ("Cable Stress", {"switch_gpu_smart": {"utilization": 92.0, "bandwidth_gbps": 140.0}}),
        ("Memory Saturation", {"cpu_mem_cxl": {"utilization": 88.0}})
    ]
    
    for scenario_name, changes in scenarios:
        print(f"\n🔧 {scenario_name}:")
        
        # Apply changes
        for link_id, link_changes in changes.items():
            for link in system.telemetry.links:
                if link.id == link_id:
                    for attr, value in link_changes.items():
                        setattr(link, attr, value)
        
        scorecard.update_system_state(system)
        metrics = scorecard.get_current_metrics()
        
        print(f"   Signal Integrity: {metrics.signal_integrity_score:.1f}%")
        print(f"   Retimer Compensation: {metrics.retimer_compensation_level:.1f}%")
        
        # Show recent insights
        insights = scorecard.get_recent_insights(2)
        for insight in insights:
            print(f"   💭 {insight.message}")


def test_performance_trends():
    """Test performance trend tracking for connectivity metrics"""
    print("\n\n📈 Testing Connectivity Performance Trends")
    print("=" * 50)
    
    scorecard = KPIScorecard(mode=GameMode.CHAOS)
    system = create_astera_test_system()
    
    print("Simulating 10 seconds of connectivity degradation...")
    
    for i in range(10):
        # Gradually degrade signal quality
        degradation = i * 0.1
        
        for link in system.telemetry.links:
            if link.id == "cpu_switch_pcie":
                link.latency_ms = 2.5 + degradation * 3  # Increase latency
                link.error_rate = degradation * 0.2  # Increase errors
            elif link.id == "switch_gpu_smart":
                link.utilization = min(95, 85 + degradation * 10)  # Increase utilization
        
        scorecard.update_system_state(system)
        
        if i % 3 == 0:  # Every 3rd iteration
            metrics = scorecard.get_current_metrics()
            print(f"  t={i}s: Signal Integrity={metrics.signal_integrity_score:.1f}%, "
                  f"Retimer Compensation={metrics.retimer_compensation_level:.1f}%")
        
        time.sleep(0.1)  # Small delay
    
    # Show trend analysis
    signal_trend = scorecard.get_performance_trend("signal_integrity", 60)
    retimer_trend = scorecard.get_performance_trend("retimer_compensation", 60)
    
    if len(signal_trend) >= 2:
        signal_change = signal_trend[-1][1] - signal_trend[0][1]
        print(f"\n📊 Signal Integrity Trend: {signal_change:+.1f}% over {len(signal_trend)} measurements")
    
    if len(retimer_trend) >= 2:
        retimer_change = retimer_trend[-1][1] - retimer_trend[0][1]
        print(f"📊 Retimer Compensation Trend: {retimer_change:+.1f}% over {len(retimer_trend)} measurements")


if __name__ == "__main__":
    print("🚀 SynapseNet Astera Labs Connectivity Metrics Test")
    print("=" * 60)
    
    try:
        test_astera_connectivity_metrics()
        test_connectivity_insights()
        test_performance_trends()
        
        print("\n✅ All Astera Labs connectivity tests completed successfully!")
        print("\n🎯 Key Astera Labs Features Demonstrated:")
        print("  ✓ Signal integrity monitoring")
        print("  ✓ Retimer compensation tracking")
        print("  ✓ Smart cable health assessment")
        print("  ✓ CXL memory channel utilization")
        print("  ✓ Connectivity-focused insights")
        print("  ✓ Real-time performance trends")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
