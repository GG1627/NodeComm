"""
Hardware simulation engine for SynapseNet.
Simulates CPUs, GPUs, memory, and their interconnects.
"""
import random
import time
import numpy as np
from typing import Dict, List, Tuple
import sys
from pathlib import Path
# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from schemas import (
    HardwareComponent, Link, TelemetryFrame, ComponentType, 
    LinkType, ComponentStatus, SystemState, Scorecard
)


class HardwareSimulator:
    """Simulates a cluster of hardware components with realistic telemetry"""
    
    def __init__(self, seed: int = 42):
        """Initialize the hardware simulator"""
        self.seed = seed
        random.seed(seed)
        np.random.seed(seed)
        
        self.components: Dict[str, HardwareComponent] = {}
        self.links: Dict[str, Link] = {}
        self.time_step = 0
        self.base_noise_level = 0.1
        
        # Initialize default hardware topology
        self._create_default_topology()
    
    def _create_default_topology(self):
        """Create a basic hardware topology for testing"""
        
        # Create CPU
        cpu = HardwareComponent(
            id="cpu_0",
            name="Intel Xeon CPU",
            component_type=ComponentType.CPU,
            specs={
                "cores": 16,
                "base_freq_ghz": 2.4,
                "max_freq_ghz": 3.8,
                "cache_mb": 32
            },
            position={"x": 0, "y": 0, "z": 0}
        )
        self.components[cpu.id] = cpu
        
        # Create GPU
        gpu = HardwareComponent(
            id="gpu_0", 
            name="NVIDIA A100",
            component_type=ComponentType.GPU,
            specs={
                "cuda_cores": 6912,
                "memory_gb": 40,
                "memory_bandwidth_gbps": 1555,
                "compute_capability": "8.0"
            },
            position={"x": 2, "y": 0, "z": 0}
        )
        self.components[gpu.id] = gpu
        
        # Create Memory
        memory = HardwareComponent(
            id="mem_0",
            name="DDR4 Memory Bank",
            component_type=ComponentType.MEMORY,
            specs={
                "capacity_gb": 64,
                "speed_mhz": 3200,
                "channels": 4,
                "ecc": True
            },
            position={"x": -1, "y": 1, "z": 0}
        )
        self.components[memory.id] = memory
        
        # Create Switch
        switch = HardwareComponent(
            id="switch_0",
            name="PCIe Switch",
            component_type=ComponentType.SWITCH,
            specs={
                "ports": 8,
                "pcie_gen": 4,
                "lanes_per_port": 16
            },
            position={"x": 1, "y": -1, "z": 0}
        )
        self.components[switch.id] = switch
        
        # Create links between components
        links = [
            # CPU to Memory (DDR)
            Link(
                id="cpu_mem_link",
                source_id="cpu_0",
                target_id="mem_0", 
                link_type=LinkType.DDR,
                max_bandwidth_gbps=51.2,  # DDR4-3200 quad channel
                max_latency_ms=0.1
            ),
            
            # CPU to Switch (PCIe)
            Link(
                id="cpu_switch_link",
                source_id="cpu_0",
                target_id="switch_0",
                link_type=LinkType.PCIE,
                max_bandwidth_gbps=32.0,  # PCIe 4.0 x16
                max_latency_ms=0.5
            ),
            
            # Switch to GPU (PCIe)
            Link(
                id="switch_gpu_link", 
                source_id="switch_0",
                target_id="gpu_0",
                link_type=LinkType.PCIE,
                max_bandwidth_gbps=32.0,  # PCIe 4.0 x16
                max_latency_ms=0.5
            ),
            
            # GPU to GPU (NVLink - for future expansion)
            # We'll add this when we have multiple GPUs
        ]
        
        for link in links:
            self.links[link.id] = link
    
    def _simulate_component_metrics(self, component: HardwareComponent) -> HardwareComponent:
        """Update component metrics with realistic simulation"""
        
        # Base utilization with some randomness
        base_util = random.uniform(10, 80)
        noise = np.random.normal(0, self.base_noise_level * 10)
        component.utilization = max(0, min(100, base_util + noise))
        
        # Temperature correlates with utilization
        ambient_temp = 25.0
        temp_per_util = 0.8  # 0.8C per 1% utilization
        component.temperature = ambient_temp + (component.utilization * temp_per_util) + np.random.normal(0, 2)
        component.temperature = max(0, min(150, component.temperature))
        
        # Power draw correlates with utilization and component type
        base_power = {
            ComponentType.CPU: 150,
            ComponentType.GPU: 300, 
            ComponentType.MEMORY: 20,
            ComponentType.SWITCH: 15,
            ComponentType.STORAGE: 10
        }.get(component.component_type, 50)
        
        power_scaling = 0.3 + (component.utilization / 100) * 0.7  # 30% base + 70% variable
        component.power_draw = base_power * power_scaling + np.random.normal(0, base_power * 0.05)
        component.power_draw = max(0, component.power_draw)
        
        return component
    
    def _simulate_link_metrics(self, link: Link) -> Link:
        """Update link metrics with realistic simulation"""
        
        # Base utilization
        base_util = random.uniform(5, 60)
        noise = np.random.normal(0, self.base_noise_level * 5)
        link.utilization = max(0, min(100, base_util + noise))
        
        # Latency increases with utilization (queueing delay)
        base_latency = link.max_latency_ms * 0.1  # 10% of max as baseline
        util_factor = 1 + (link.utilization / 100) * 2  # Up to 3x increase at 100% util
        link.latency_ms = base_latency * util_factor + np.random.normal(0, base_latency * 0.1)
        link.latency_ms = max(0.001, min(link.max_latency_ms * 5, link.latency_ms))
        
        # Bandwidth utilization
        link.bandwidth_gbps = (link.utilization / 100) * link.max_bandwidth_gbps
        
        # Error rate (very low for healthy links)
        if link.status == ComponentStatus.HEALTHY:
            link.error_rate = max(0, np.random.exponential(0.001))  # Very low error rate
        elif link.status == ComponentStatus.DEGRADED:
            link.error_rate = max(0, np.random.exponential(0.1))   # Higher error rate
        else:
            link.error_rate = 100.0  # Failed link
            
        link.error_rate = min(100, link.error_rate)
        
        return link
    
    def step(self) -> TelemetryFrame:
        """Advance simulation by one time step and return telemetry"""
        self.time_step += 1
        
        # Update all components
        for comp_id in self.components:
            self.components[comp_id] = self._simulate_component_metrics(self.components[comp_id])
        
        # Update all links  
        for link_id in self.links:
            self.links[link_id] = self._simulate_link_metrics(self.links[link_id])
        
        # Calculate system-wide metrics
        system_metrics = self._calculate_system_metrics()
        
        return TelemetryFrame(
            components=list(self.components.values()),
            links=list(self.links.values()),
            system_metrics=system_metrics
        )
    
    def _calculate_system_metrics(self) -> Dict[str, float]:
        """Calculate system-wide performance metrics"""
        if not self.components:
            return {}
        
        # Average utilization across all components
        avg_utilization = np.mean([comp.utilization for comp in self.components.values()])
        
        # Total power consumption
        total_power = sum(comp.power_draw for comp in self.components.values())
        
        # Average temperature
        avg_temperature = np.mean([comp.temperature for comp in self.components.values()])
        
        # Network metrics
        if self.links:
            avg_latency = np.mean([link.latency_ms for link in self.links.values()])
            total_bandwidth = sum(link.bandwidth_gbps for link in self.links.values())
            avg_error_rate = np.mean([link.error_rate for link in self.links.values()])
        else:
            avg_latency = 0
            total_bandwidth = 0
            avg_error_rate = 0
        
        return {
            "avg_utilization": avg_utilization,
            "total_power_watts": total_power,
            "avg_temperature_c": avg_temperature,
            "avg_latency_ms": avg_latency,
            "total_bandwidth_gbps": total_bandwidth,
            "avg_error_rate": avg_error_rate,
            "healthy_components": sum(1 for c in self.components.values() if c.status == ComponentStatus.HEALTHY),
            "healthy_links": sum(1 for l in self.links.values() if l.status == ComponentStatus.HEALTHY)
        }
    
    def inject_chaos(self, target_id: str, chaos_type: str = "latency_spike"):
        """Inject a chaos event for testing"""
        if target_id in self.components:
            comp = self.components[target_id]
            if chaos_type == "overload":
                comp.utilization = min(100, comp.utilization * 1.5)
            elif chaos_type == "overheat":
                comp.temperature = min(150, comp.temperature + 20)
            elif chaos_type == "failure":
                comp.status = ComponentStatus.FAILED
                
        elif target_id in self.links:
            link = self.links[target_id]
            if chaos_type == "latency_spike":
                link.latency_ms = min(link.max_latency_ms * 10, link.latency_ms * 5)
            elif chaos_type == "congestion":
                link.utilization = min(100, link.utilization * 1.8)
            elif chaos_type == "failure":
                link.status = ComponentStatus.FAILED
    
    def get_component_ids(self) -> List[str]:
        """Get list of all component IDs"""
        return list(self.components.keys())
    
    def get_link_ids(self) -> List[str]:
        """Get list of all link IDs"""
        return list(self.links.keys())
    
    def get_topology_summary(self) -> Dict:
        """Get a summary of the current topology"""
        return {
            "components": {
                comp_id: {
                    "name": comp.name,
                    "type": comp.component_type.value,
                    "status": comp.status.value
                }
                for comp_id, comp in self.components.items()
            },
            "links": {
                link_id: {
                    "source": link.source_id,
                    "target": link.target_id, 
                    "type": link.link_type.value,
                    "status": link.status.value
                }
                for link_id, link in self.links.items()
            }
        }
