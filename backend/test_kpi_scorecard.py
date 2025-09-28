#!/usr/bin/env python3
"""
Test script for KPI Scorecard system

Demonstrates real-time scoring, metrics tracking, and insight generation
for both Learning Mode and Chaos Mode scenarios.
"""

import time
import sys
from pathlib import Path

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from kpi.scorecard import KPIScorecard, GameMode, PerformanceMetrics
from schemas import (
    SystemState, HardwareComponent, Link, ComponentType, 
    LinkType, ComponentStatus, TelemetryFrame, Scorecard
)


def create_test_system() -> SystemState:
    """Create a test hardware system"""
    components = {
        "cpu1": HardwareComponent(
            id="cpu1",
            name="Intel Xeon CPU",
            component_type=ComponentType.CPU,
            status=ComponentStatus.HEALTHY,
            utilization=45.0,
            temperature=65.0,
            power_draw=150.0
        ),
        "gpu1": HardwareComponent(
            id="gpu1", 
            name="NVIDIA A100",
            component_type=ComponentType.GPU,
            status=ComponentStatus.HEALTHY,
            utilization=80.0,
            temperature=75.0,
            power_draw=400.0
        ),
        "mem1": HardwareComponent(
            id="mem1",
            name="DDR4 Memory",
            component_type=ComponentType.MEMORY,
            status=ComponentStatus.HEALTHY,
            utilization=60.0,
            temperature=45.0,
            power_draw=50.0
        )
    }
    
    links = {
        "cpu_mem": Link(
            id="cpu_mem",
            name="CPU-Memory Link",
            source_id="cpu1",
            target_id="mem1",
            link_type=LinkType.PCIE,
            latency_ms=2.5,
            bandwidth_gbps=32.0,
            utilization=0.6,
            status=ComponentStatus.HEALTHY
        ),
        "cpu_gpu": Link(
            id="cpu_gpu", 
            name="CPU-GPU Link",
            source_id="cpu1",
            target_id="gpu1",
            link_type=LinkType.NVLINK,
            latency_ms=1.2,
            bandwidth_gbps=600.0,
            utilization=0.8,
            status=ComponentStatus.HEALTHY
        )
    }
    
    # Create telemetry frame
    telemetry = TelemetryFrame(
        timestamp=time.time(),
        components=list(components.values()),
        links=list(links.values())
    )
    
    # Create initial scorecard
    scorecard = Scorecard()
    
    return SystemState(
        telemetry=telemetry,
        scorecard=scorecard
    )


def test_chaos_mode_scenario():
    """Test Chaos Mode scoring and metrics"""
    print("🎮 Testing Chaos Mode Scenario")
    print("=" * 50)
    
    scorecard = KPIScorecard(mode=GameMode.CHAOS)
    system = create_test_system()
    
    # Initial healthy state
    scorecard.update_system_state(system)
    print(f"Initial Resilience: {scorecard.metrics.resilience_score:.1f}%")
    print(f"Initial Latency: {scorecard.metrics.avg_latency:.1f}ms")
    print(f"Initial Bandwidth: {scorecard.metrics.total_bandwidth:.1f} GB/s")
    
    # Simulate AI attack - GPU failure
    print("\n💥 AI Attack: GPU Overheating!")
    attack_time = time.time()
    # Find GPU component and modify it
    for comp in system.telemetry.components:
        if comp.id == "gpu1":
            comp.status = ComponentStatus.FAILED
            comp.temperature = 95.0
    
    scorecard.update_system_state(system)
    print(f"Post-attack Resilience: {scorecard.metrics.resilience_score:.1f}%")
    
    # User responds with heal action
    time.sleep(1.5)  # Simulate response delay
    print("\n✊ User Action: HEAL GPU")
    action = scorecard.record_user_action("heal", "gpu1", attack_time)
    print(f"Action Effectiveness: {action.effectiveness:.1%}")
    print(f"Response Time: {action.response_time:.1f}s")
    print(f"Score Bonus: +{scorecard.metrics.user_score}")
    
    # System recovers
    for comp in system.telemetry.components:
        if comp.id == "gpu1":
            comp.status = ComponentStatus.HEALTHY
            comp.temperature = 75.0
    scorecard.update_system_state(system)
    print(f"Post-heal Resilience: {scorecard.metrics.resilience_score:.1f}%")
    
    # Show recent insights
    print("\n💡 Recent Insights:")
    for insight in scorecard.get_recent_insights(3):
        print(f"  {insight.message}")
    
    # Generate session summary
    print("\n📊 Session Summary:")
    summary = scorecard.generate_session_summary()
    print(f"  Final Score: {summary['final_score']}")
    print(f"  Success Rate: {summary['success_rate']:.1f}%")
    print(f"  Performance Grade: {summary['performance_grade']}")


def test_learning_mode_scenario():
    """Test Learning Mode metrics and insights"""
    print("\n\n📚 Testing Learning Mode Scenario")
    print("=" * 50)
    
    scorecard = KPIScorecard(mode=GameMode.LEARNING)
    system = create_test_system()
    
    # Simulate user moving components and observing effects
    print("User moves CPU away from Memory...")
    
    # Baseline metrics
    scorecard.update_system_state(system)
    baseline_latency = scorecard.metrics.avg_latency
    print(f"Baseline CPU-Memory Latency: {baseline_latency:.1f}ms")
    
    # Simulate increased latency due to distance
    time.sleep(0.5)
    for link in system.telemetry.links:
        if link.id == "cpu_mem":
            link.latency_ms = 15.0  # Increased due to distance
    scorecard.update_system_state(system)
    
    new_latency = scorecard.metrics.avg_latency
    print(f"New CPU-Memory Latency: {new_latency:.1f}ms")
    print(f"Performance Impact: {((new_latency - baseline_latency) / baseline_latency * 100):+.1f}%")
    
    # Show educational insights
    print("\n💡 Learning Insights:")
    for insight in scorecard.get_recent_insights(3):
        print(f"  {insight.message}")
    
    # Show performance trend
    print("\n📈 Performance Trend (last 60s):")
    trend = scorecard.get_performance_trend("latency", 60)
    if len(trend) >= 2:
        start_val = trend[0][1]
        end_val = trend[-1][1]
        change = ((end_val - start_val) / start_val * 100) if start_val > 0 else 0
        print(f"  Latency change: {change:+.1f}% over {len(trend)} measurements")


def test_performance_tracking():
    """Test performance tracking and trend analysis"""
    print("\n\n📊 Testing Performance Tracking")
    print("=" * 50)
    
    scorecard = KPIScorecard(mode=GameMode.CHAOS)
    system = create_test_system()
    
    # Simulate multiple system updates over time
    print("Simulating 10 seconds of system operation...")
    
    for i in range(10):
        # Gradually degrade system
        degradation = i * 0.1
        for comp in system.telemetry.components:
            if comp.id == "cpu1":
                comp.utilization = min(100, 45 + degradation * 30)
            elif comp.id == "gpu1":
                comp.temperature = min(95, 75 + degradation * 10)
        
        for link in system.telemetry.links:
            if link.id == "cpu_mem":
                link.latency_ms = 2.5 + degradation * 5
        
        scorecard.update_system_state(system)
        
        if i % 3 == 0:  # Every 3rd iteration, show current state
            print(f"  t={i}s: Resilience={scorecard.metrics.resilience_score:.1f}%, "
                  f"Latency={scorecard.metrics.avg_latency:.1f}ms")
        
        time.sleep(0.2)  # Small delay to simulate real-time
    
    # Show final metrics
    metrics = scorecard.get_current_metrics()
    print(f"\nFinal Metrics:")
    print(f"  Resilience: {metrics.resilience_score:.1f}%")
    print(f"  Uptime: {metrics.uptime_percentage:.1f}%")
    print(f"  Avg Latency: {metrics.avg_latency:.1f}ms")
    print(f"  Efficiency: {metrics.efficiency_score:.1f}%")
    print(f"  Total Failures: {metrics.total_failures}")


if __name__ == "__main__":
    print("🚀 SynapseNet KPI Scorecard Test Suite")
    print("=" * 60)
    
    try:
        test_chaos_mode_scenario()
        test_learning_mode_scenario() 
        test_performance_tracking()
        
        print("\n✅ All KPI tests completed successfully!")
        print("\n🎯 Key Features Demonstrated:")
        print("  ✓ Real-time resilience scoring")
        print("  ✓ User action effectiveness tracking")
        print("  ✓ Educational insight generation")
        print("  ✓ Performance trend analysis")
        print("  ✓ Session summary and grading")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
