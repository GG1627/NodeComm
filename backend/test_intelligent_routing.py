#!/usr/bin/env python3
"""
Test script for Intelligent Routing system

Demonstrates smart rerouting decisions when links fail or become congested.
Shows AI making intelligent network optimization decisions in real-time.
"""

import time
import sys
from pathlib import Path

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from optimize.rules import IntelligentRouter, RouteQuality
from schemas import (
    TelemetryFrame, HardwareComponent, Link, ComponentType, 
    LinkType, ComponentStatus
)


def create_complex_network() -> TelemetryFrame:
    """Create a complex network topology for testing"""
    
    # Create components
    components = [
        HardwareComponent(
            id="cpu1", name="CPU Core 1", component_type=ComponentType.CPU,
            status=ComponentStatus.HEALTHY, utilization=45.0
        ),
        HardwareComponent(
            id="cpu2", name="CPU Core 2", component_type=ComponentType.CPU,
            status=ComponentStatus.HEALTHY, utilization=50.0
        ),
        HardwareComponent(
            id="gpu1", name="GPU 1", component_type=ComponentType.GPU,
            status=ComponentStatus.HEALTHY, utilization=70.0
        ),
        HardwareComponent(
            id="gpu2", name="GPU 2", component_type=ComponentType.GPU,
            status=ComponentStatus.HEALTHY, utilization=60.0
        ),
        HardwareComponent(
            id="mem1", name="Memory Bank 1", component_type=ComponentType.MEMORY,
            status=ComponentStatus.HEALTHY, utilization=65.0
        ),
        HardwareComponent(
            id="mem2", name="Memory Bank 2", component_type=ComponentType.MEMORY,
            status=ComponentStatus.HEALTHY, utilization=55.0
        ),
        HardwareComponent(
            id="switch1", name="Network Switch", component_type=ComponentType.SWITCH,
            status=ComponentStatus.HEALTHY, utilization=40.0
        )
    ]
    
    # Create links - multiple paths between components
    links = [
        # Direct CPU-Memory links
        Link(
            id="cpu1_mem1", source_id="cpu1", target_id="mem1",
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=2.0, bandwidth_gbps=32.0, utilization=60.0
        ),
        Link(
            id="cpu2_mem2", source_id="cpu2", target_id="mem2", 
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=2.2, bandwidth_gbps=32.0, utilization=55.0
        ),
        
        # CPU-GPU links
        Link(
            id="cpu1_gpu1", source_id="cpu1", target_id="gpu1",
            link_type=LinkType.NVLINK, status=ComponentStatus.HEALTHY,
            latency_ms=1.5, bandwidth_gbps=600.0, utilization=75.0
        ),
        Link(
            id="cpu2_gpu2", source_id="cpu2", target_id="gpu2",
            link_type=LinkType.NVLINK, status=ComponentStatus.HEALTHY,
            latency_ms=1.3, bandwidth_gbps=600.0, utilization=65.0
        ),
        
        # Cross-connections via switch (alternative paths)
        Link(
            id="cpu1_switch", source_id="cpu1", target_id="switch1",
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=3.0, bandwidth_gbps=100.0, utilization=30.0
        ),
        Link(
            id="cpu2_switch", source_id="cpu2", target_id="switch1",
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=3.2, bandwidth_gbps=100.0, utilization=35.0
        ),
        Link(
            id="switch_mem1", source_id="switch1", target_id="mem1",
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=4.0, bandwidth_gbps=50.0, utilization=25.0
        ),
        Link(
            id="switch_mem2", source_id="switch1", target_id="mem2",
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=4.2, bandwidth_gbps=50.0, utilization=20.0
        ),
        Link(
            id="switch_gpu1", source_id="switch1", target_id="gpu1",
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=3.5, bandwidth_gbps=80.0, utilization=40.0
        ),
        Link(
            id="switch_gpu2", source_id="switch1", target_id="gpu2",
            link_type=LinkType.PCIE, status=ComponentStatus.HEALTHY,
            latency_ms=3.8, bandwidth_gbps=80.0, utilization=45.0
        ),
        
        # Inter-component links
        Link(
            id="gpu1_gpu2", source_id="gpu1", target_id="gpu2",
            link_type=LinkType.NVLINK, status=ComponentStatus.HEALTHY,
            latency_ms=0.8, bandwidth_gbps=900.0, utilization=50.0
        ),
        Link(
            id="mem1_mem2", source_id="mem1", target_id="mem2",
            link_type=LinkType.CXL, status=ComponentStatus.HEALTHY,
            latency_ms=1.0, bandwidth_gbps=200.0, utilization=30.0
        )
    ]
    
    return TelemetryFrame(
        timestamp=time.time(),
        components=components,
        links=links
    )


def test_route_discovery():
    """Test route discovery and quality assessment"""
    print("🔍 Testing Route Discovery")
    print("=" * 40)
    
    router = IntelligentRouter()
    network = create_complex_network()
    
    # Find all routes from CPU1 to Memory1
    routes = router.find_all_routes("cpu1", "mem1", network)
    
    print(f"Found {len(routes)} routes from CPU1 to Memory1:")
    for i, route in enumerate(routes[:5]):  # Show top 5
        path_str = " → ".join(route.path)
        print(f"  {i+1}. {path_str}")
        print(f"     Latency: {route.total_latency:.1f}ms, "
              f"Bandwidth: {route.min_bandwidth:.0f}GB/s, "
              f"Quality: {route.quality.value}")
    
    # Find routes from CPU1 to GPU2 (cross-connections)
    print(f"\nRoutes from CPU1 to GPU2:")
    routes = router.find_all_routes("cpu1", "gpu2", network)
    for i, route in enumerate(routes[:3]):
        path_str = " → ".join(route.path)
        print(f"  {i+1}. {path_str}")
        print(f"     Latency: {route.total_latency:.1f}ms, "
              f"Quality: {route.quality.value}")


def test_network_analysis():
    """Test network health analysis"""
    print("\n\n📊 Testing Network Analysis")
    print("=" * 40)
    
    router = IntelligentRouter()
    network = create_complex_network()
    
    # Analyze healthy network
    analysis = router.analyze_network_health(network)
    print("Healthy Network Analysis:")
    print(f"  Components: {analysis['healthy_components']}/{analysis['total_components']} healthy")
    print(f"  Links: {analysis['healthy_links']}/{analysis['total_links']} healthy")
    print(f"  Avg Latency: {analysis['avg_latency']:.1f}ms")
    print(f"  Avg Utilization: {analysis['avg_utilization']:.1f}%")
    print(f"  Bottlenecks: {len(analysis['bottlenecks'])}")
    
    # Introduce congestion
    print("\n💥 Introducing Network Congestion...")
    for link in network.links:
        if link.id == "cpu1_mem1":
            link.utilization = 95.0  # Heavy congestion
            link.latency_ms = 15.0   # High latency
        elif link.id == "cpu1_gpu1":
            link.utilization = 90.0  # Moderate congestion
    
    analysis = router.analyze_network_health(network)
    print("Congested Network Analysis:")
    print(f"  Congested Links: {analysis['congested_links']}")
    print(f"  Bottlenecks: {len(analysis['bottlenecks'])}")
    for bottleneck in analysis['bottlenecks']:
        print(f"    - {bottleneck['link_id']}: {bottleneck['issue']} "
              f"(util: {bottleneck.get('utilization_pct', 0):.1f}%, "
              f"latency: {bottleneck.get('latency_ms', 0):.1f}ms)")


def test_intelligent_rerouting():
    """Test intelligent rerouting suggestions"""
    print("\n\n🧠 Testing Intelligent Rerouting")
    print("=" * 40)
    
    router = IntelligentRouter()
    network = create_complex_network()
    
    # Create congestion scenario
    print("Creating congestion on CPU1-Memory1 link...")
    for link in network.links:
        if link.id == "cpu1_mem1":
            link.utilization = 95.0
            link.latency_ms = 20.0
    
    # Get rerouting suggestions
    suggestions = router.suggest_reroutes(network)
    
    print(f"\nFound {len(suggestions)} rerouting suggestions:")
    for i, suggestion in enumerate(suggestions):
        print(f"\n  Suggestion {i+1}:")
        print(f"    Route: {suggestion.source_id} → {suggestion.target_id}")
        print(f"    Reason: {suggestion.reason}")
        
        if suggestion.old_route:
            old_path = " → ".join(suggestion.old_route.path)
            print(f"    Old Path: {old_path} ({suggestion.old_route.total_latency:.1f}ms)")
        
        new_path = " → ".join(suggestion.new_route.path)
        print(f"    New Path: {new_path} ({suggestion.new_route.total_latency:.1f}ms)")
        
        print(f"    Expected Improvements:")
        for metric, value in suggestion.expected_improvement.items():
            print(f"      {metric}: {value:+.1f}%")
    
    # Execute rerouting
    if suggestions:
        print(f"\n⚡ Executing rerouting...")
        for suggestion in suggestions:
            success = router.execute_reroute(suggestion)
            if success:
                print(f"    ✅ Rerouted {suggestion.source_id} → {suggestion.target_id}")
            else:
                print(f"    ❌ Failed to reroute {suggestion.source_id} → {suggestion.target_id}")


def test_failure_recovery():
    """Test recovery from link failures"""
    print("\n\n🚨 Testing Failure Recovery")
    print("=" * 40)
    
    router = IntelligentRouter()
    network = create_complex_network()
    
    # Simulate link failure
    print("Simulating failure of CPU1-Memory1 direct link...")
    for link in network.links:
        if link.id == "cpu1_mem1":
            link.status = ComponentStatus.FAILED
    
    # Find alternative routes
    routes = router.find_all_routes("cpu1", "mem1", network)
    print(f"\nAlternative routes after failure:")
    for i, route in enumerate(routes[:3]):
        path_str = " → ".join(route.path)
        print(f"  {i+1}. {path_str}")
        print(f"     Latency: {route.total_latency:.1f}ms, "
              f"Quality: {route.quality.value}")
    
    # Get rerouting suggestions
    suggestions = router.suggest_reroutes(network)
    print(f"\nFailure recovery suggestions: {len(suggestions)}")
    for suggestion in suggestions:
        print(f"  - Reroute via: {' → '.join(suggestion.new_route.path)}")
        print(f"    Reason: {suggestion.reason}")


def test_performance_statistics():
    """Test rerouting performance statistics"""
    print("\n\n📈 Testing Performance Statistics")
    print("=" * 40)
    
    router = IntelligentRouter()
    network = create_complex_network()
    
    # Simulate multiple rerouting scenarios
    scenarios = [
        ("cpu1_mem1", 95.0, 20.0, "High congestion"),
        ("cpu1_gpu1", 90.0, 12.0, "Moderate congestion"),
        ("cpu2_mem2", ComponentStatus.FAILED, 0.0, "Link failure")
    ]
    
    for link_id, util_or_status, latency, description in scenarios:
        print(f"\nScenario: {description}")
        
        # Apply scenario
        for link in network.links:
            if link.id == link_id:
                if isinstance(util_or_status, float):
                    link.utilization = util_or_status
                    link.latency_ms = latency
                else:
                    link.status = util_or_status
        
        # Get and execute suggestions
        suggestions = router.suggest_reroutes(network)
        for suggestion in suggestions:
            router.execute_reroute(suggestion)
            print(f"  Executed: {suggestion.source_id} → {suggestion.target_id}")
    
    # Show statistics
    stats = router.get_reroute_statistics()
    print(f"\n📊 Rerouting Statistics:")
    print(f"  Total Reroutes: {stats['total_reroutes']}")
    print(f"  Avg Latency Improvement: {stats['avg_latency_improvement']:.1f}%")
    print(f"  Success Rate: {stats['success_rate']:.1f}%")
    
    print(f"\n  Most Common Reasons:")
    for reason, count in stats['most_common_reasons'].items():
        print(f"    - {reason}: {count} times")
    
    print(f"\n  Recent Actions:")
    for action in stats['recent_actions']:
        print(f"    - {action['route']}: {action['reason']}")


if __name__ == "__main__":
    print("🚀 SynapseNet Intelligent Routing Test Suite")
    print("=" * 60)
    
    try:
        test_route_discovery()
        test_network_analysis()
        test_intelligent_rerouting()
        test_failure_recovery()
        test_performance_statistics()
        
        print("\n✅ All intelligent routing tests completed successfully!")
        print("\n🎯 Key Features Demonstrated:")
        print("  ✓ Multi-path route discovery")
        print("  ✓ Network health analysis")
        print("  ✓ Intelligent congestion detection")
        print("  ✓ Automatic rerouting suggestions")
        print("  ✓ Failure recovery mechanisms")
        print("  ✓ Performance tracking and statistics")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
