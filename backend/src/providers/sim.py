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
            name="CPU Server (with PCIe Retimer)",
            component_type=ComponentType.CPU,
            specs={
                "cores": 16,
                "base_freq_ghz": 2.4,
                "max_freq_ghz": 3.8,
                "cache_mb": 32,
                "pcie_retimer": "Aries PCIe 5.0"
            },
            position={"x": 0, "y": 0, "z": 0}
        )
        self.components[cpu.id] = cpu
        
        # Create GPU
        gpu = HardwareComponent(
            id="gpu_0", 
            name="AI Accelerator (H100 + Smart Cable)",
            component_type=ComponentType.GPU,
            specs={
                "cuda_cores": 6912,
                "memory_gb": 40,
                "memory_bandwidth_gbps": 1555,
                "compute_capability": "8.0",
                "smart_cable": "Taurus Smart Cable Module"
            },
            position={"x": 2, "y": 0, "z": 0}
        )
        self.components[gpu.id] = gpu
        
        # Create Memory
        memory = HardwareComponent(
            id="mem_0",
            name="Memory Pool (CXL Platform)",
            component_type=ComponentType.MEMORY,
            specs={
                "capacity_gb": 64,
                "speed_mhz": 3200,
                "channels": 4,
                "ecc": True,
                "cxl_controller": "Leo CXL Memory Platform"
            },
            position={"x": -1, "y": 1, "z": 0}
        )
        self.components[memory.id] = memory
        
        # Create Switch
        switch = HardwareComponent(
            id="switch_0",
            name="Data Hub (CXL Controller)",
            component_type=ComponentType.SWITCH,
            specs={
                "ports": 8,
                "pcie_gen": 5,
                "lanes_per_port": 16,
                "cxl_support": "CXL 3.0"
            },
            position={"x": 1, "y": -1, "z": 0}
        )
        self.components[switch.id] = switch
        
        # Create links between components
        links = [
            # CPU to Memory (CXL Channel)
            Link(
                id="cpu_mem_link",
                name="Memory Channel (CXL 3.0)",
                source_id="cpu_0",
                target_id="mem_0", 
                link_type=LinkType.CXL,
                max_bandwidth_gbps=51.2,  # CXL 3.0 memory channel
                max_latency_ms=0.1
            ),
            
            # CPU to Switch (PCIe Retimed)
            Link(
                id="cpu_switch_link",
                name="Data Path (PCIe 5.0 Retimed)",
                source_id="cpu_0",
                target_id="switch_0",
                link_type=LinkType.PCIE,
                max_bandwidth_gbps=64.0,  # PCIe 5.0 x16 with retimer
                max_latency_ms=0.3
            ),
            
            # Switch to GPU (Smart Cable)
            Link(
                id="switch_gpu_link",
                name="AI Connection (Smart Cable)",
                source_id="switch_0",
                target_id="gpu_0",
                link_type=LinkType.PCIE,
                max_bandwidth_gbps=64.0,  # Smart Cable Module
                max_latency_ms=0.2
            ),
            
            # GPU to GPU (NVLink - for future expansion)
            # We'll add this when we have multiple GPUs
        ]
        
        for link in links:
            self.links[link.id] = link
    
    def _create_realistic_datacenter_topology(self):
        """Create a 16-node realistic data center topology matching the frontend layout"""
        
        # Clear existing components and links
        self.components.clear()
        self.links.clear()
        
        # CPU Tier (2 CPUs + 2 Memory modules)
        cpu1 = HardwareComponent(
            id="cpu1",
            name="CPU Server 1 (with PCIe Retimer)",
            component_type=ComponentType.CPU,
            specs={
                "cores": 56, "base_freq_ghz": 2.0, "max_freq_ghz": 3.8, "cache_mb": 105,
                "pcie_retimer": "Aries PCIe 5.0", "model": "Intel Xeon Platinum 8480+"
            },
            position={"x": 150, "y": 100, "z": 0}
        )
        self.components[cpu1.id] = cpu1
        
        cpu2 = HardwareComponent(
            id="cpu2",
            name="CPU Server 2 (with PCIe Retimer)",
            component_type=ComponentType.CPU,
            specs={
                "cores": 56, "base_freq_ghz": 2.0, "max_freq_ghz": 3.8, "cache_mb": 105,
                "pcie_retimer": "Aries PCIe 5.0", "model": "Intel Xeon Platinum 8480+"
            },
            position={"x": 550, "y": 100, "z": 0}
        )
        self.components[cpu2.id] = cpu2
        
        mem1 = HardwareComponent(
            id="mem1",
            name="Memory Pool 1 (CXL Platform)",
            component_type=ComponentType.MEMORY,
            specs={
                "capacity_gb": 128, "speed_mhz": 5600, "channels": 8, "ecc": True,
                "cxl_controller": "Leo CXL Memory Platform", "model": "Samsung DDR5-5600"
            },
            position={"x": 250, "y": 100, "z": 0}
        )
        self.components[mem1.id] = mem1
        
        mem2 = HardwareComponent(
            id="mem2",
            name="Memory Pool 2 (CXL Platform)",
            component_type=ComponentType.MEMORY,
            specs={
                "capacity_gb": 128, "speed_mhz": 5600, "channels": 8, "ecc": True,
                "cxl_controller": "Leo CXL Memory Platform", "model": "Samsung DDR5-5600"
            },
            position={"x": 650, "y": 100, "z": 0}
        )
        self.components[mem2.id] = mem2
        
        # Switch Tier (2 switches)
        sw1 = HardwareComponent(
            id="sw1",
            name="Data Hub 1 (CXL Controller)",
            component_type=ComponentType.SWITCH,
            specs={
                "ports": 128, "pcie_gen": 5, "lanes_per_port": 16, "cxl_support": "CXL 3.0",
                "model": "Broadcom Tomahawk 5", "smart_cable": "Taurus Smart Cable"
            },
            position={"x": 200, "y": 180, "z": 0}
        )
        self.components[sw1.id] = sw1
        
        sw2 = HardwareComponent(
            id="sw2",
            name="Data Hub 2 (CXL Controller)",
            component_type=ComponentType.SWITCH,
            specs={
                "ports": 128, "pcie_gen": 5, "lanes_per_port": 16, "cxl_support": "CXL 3.0",
                "model": "Broadcom Tomahawk 5", "smart_cable": "Taurus Smart Cable"
            },
            position={"x": 600, "y": 180, "z": 0}
        )
        self.components[sw2.id] = sw2
        
        # Central Fabric Controller (Astera's star component!)
        fabric = HardwareComponent(
            id="fabric",
            name="Connectivity Fabric (Astera Hub)",
            component_type=ComponentType.SWITCH,
            specs={
                "ports": 256, "protocols": ["PCIe", "CXL", "Ethernet"], "fabric_bandwidth_tbps": 51.2,
                "model": "Astera Scorpio Switch Core", "intelligent_routing": True
            },
            position={"x": 400, "y": 250, "z": 0}
        )
        self.components[fabric.id] = fabric
        
        # GPU Compute Tier (4 H100s)
        for i in range(1, 5):
            x_pos = 150 if i <= 2 else 550
            x_pos += 100 if i % 2 == 0 else 0
            
            gpu = HardwareComponent(
                id=f"gpu{i}",
                name=f"AI Accelerator {i} (H100 + Smart Cable)",
                component_type=ComponentType.GPU,
                specs={
                    "cuda_cores": 16896, "memory_gb": 80, "memory_bandwidth_gbps": 3350,
                    "compute_capability": "9.0", "model": "NVIDIA H100 SXM5",
                    "smart_cable": "Taurus Smart Cable Module", "nvlink": "NVLink 4.0"
                },
                position={"x": x_pos, "y": 350, "z": 0}
            )
            self.components[gpu.id] = gpu
        
        # Storage Tier (4 NVMe SSDs)
        for i in range(1, 5):
            x_pos = 150 if i <= 2 else 550
            x_pos += 100 if i % 2 == 0 else 0
            
            ssd = HardwareComponent(
                id=f"ssd{i}",
                name=f"Storage {i} (NVMe + Retimer)",
                component_type=ComponentType.STORAGE,
                specs={
                    "capacity_tb": 7.68, "interface": "NVMe", "speed_mbps": 7000,
                    "model": "Samsung PM9A3", "pcie_gen": 4, "retimer_extended": True
                },
                position={"x": x_pos, "y": 450, "z": 0}
            )
            self.components[ssd.id] = ssd
        
        # Network Controllers (2 NICs)
        nic1 = HardwareComponent(
            id="nic1",
            name="Network Interface 1",
            component_type=ComponentType.NETWORK,
            specs={
                "ports": 2, "speed_gbps": 100, "protocol": "Ethernet",
                "smart_cable": "Taurus Ethernet Module"
            },
            position={"x": 100, "y": 250, "z": 0}
        )
        self.components[nic1.id] = nic1
        
        nic2 = HardwareComponent(
            id="nic2",
            name="Network Interface 2",
            component_type=ComponentType.NETWORK,
            specs={
                "ports": 2, "speed_gbps": 100, "protocol": "Ethernet",
                "smart_cable": "Taurus Ethernet Module"
            },
            position={"x": 700, "y": 250, "z": 0}
        )
        self.components[nic2.id] = nic2
        
        # Create realistic interconnect links
        links = [
            # CPU Cluster 1
            Link(
                id="cpu1_mem1_link", name="Memory Channel 1 (CXL 3.0)",
                source_id="cpu1", target_id="mem1", link_type=LinkType.CXL,
                max_bandwidth_gbps=51.2, max_latency_ms=0.1
            ),
            Link(
                id="cpu1_sw1_link", name="Data Path 1 (PCIe 5.0 Retimed)",
                source_id="cpu1", target_id="sw1", link_type=LinkType.PCIE,
                max_bandwidth_gbps=64.0, max_latency_ms=0.3
            ),
            
            # CPU Cluster 2
            Link(
                id="cpu2_mem2_link", name="Memory Channel 2 (CXL 3.0)",
                source_id="cpu2", target_id="mem2", link_type=LinkType.CXL,
                max_bandwidth_gbps=51.2, max_latency_ms=0.1
            ),
            Link(
                id="cpu2_sw2_link", name="Data Path 2 (PCIe 5.0 Retimed)",
                source_id="cpu2", target_id="sw2", link_type=LinkType.PCIE,
                max_bandwidth_gbps=64.0, max_latency_ms=0.3
            ),
            
            # Central Fabric Connections (Astera's connectivity magic!)
            Link(
                id="sw1_fabric_link", name="Fabric Connection 1 (Astera Hub)",
                source_id="sw1", target_id="fabric", link_type=LinkType.FABRIC,
                max_bandwidth_gbps=256.0, max_latency_ms=0.2
            ),
            Link(
                id="sw2_fabric_link", name="Fabric Connection 2 (Astera Hub)",
                source_id="sw2", target_id="fabric", link_type=LinkType.FABRIC,
                max_bandwidth_gbps=256.0, max_latency_ms=0.2
            ),
            
            # GPU Connections (Smart Cables)
            Link(
                id="fabric_gpu1_link", name="AI Connection 1 (Smart Cable)",
                source_id="fabric", target_id="gpu1", link_type=LinkType.PCIE,
                max_bandwidth_gbps=64.0, max_latency_ms=0.2
            ),
            Link(
                id="fabric_gpu2_link", name="AI Connection 2 (Smart Cable)",
                source_id="fabric", target_id="gpu2", link_type=LinkType.PCIE,
                max_bandwidth_gbps=64.0, max_latency_ms=0.2
            ),
            Link(
                id="fabric_gpu3_link", name="AI Connection 3 (Smart Cable)",
                source_id="fabric", target_id="gpu3", link_type=LinkType.PCIE,
                max_bandwidth_gbps=64.0, max_latency_ms=0.2
            ),
            Link(
                id="fabric_gpu4_link", name="AI Connection 4 (Smart Cable)",
                source_id="fabric", target_id="gpu4", link_type=LinkType.PCIE,
                max_bandwidth_gbps=64.0, max_latency_ms=0.2
            ),
            
            # Storage Connections (Retimer Extended)
            Link(
                id="gpu1_ssd1_link", name="Storage Path 1 (Retimer Extended)",
                source_id="gpu1", target_id="ssd1", link_type=LinkType.PCIE,
                max_bandwidth_gbps=32.0, max_latency_ms=0.5
            ),
            Link(
                id="gpu2_ssd2_link", name="Storage Path 2 (Retimer Extended)",
                source_id="gpu2", target_id="ssd2", link_type=LinkType.PCIE,
                max_bandwidth_gbps=32.0, max_latency_ms=0.5
            ),
            Link(
                id="gpu3_ssd3_link", name="Storage Path 3 (Retimer Extended)",
                source_id="gpu3", target_id="ssd3", link_type=LinkType.PCIE,
                max_bandwidth_gbps=32.0, max_latency_ms=0.5
            ),
            Link(
                id="gpu4_ssd4_link", name="Storage Path 4 (Retimer Extended)",
                source_id="gpu4", target_id="ssd4", link_type=LinkType.PCIE,
                max_bandwidth_gbps=32.0, max_latency_ms=0.5
            ),
            
            # Cross-connections for redundancy
            Link(
                id="gpu1_gpu2_link", name="GPU Cluster 1 (NVLink)",
                source_id="gpu1", target_id="gpu2", link_type=LinkType.NVLINK,
                max_bandwidth_gbps=900.0, max_latency_ms=0.1
            ),
            Link(
                id="gpu3_gpu4_link", name="GPU Cluster 2 (NVLink)",
                source_id="gpu3", target_id="gpu4", link_type=LinkType.NVLINK,
                max_bandwidth_gbps=900.0, max_latency_ms=0.1
            ),
            
            # Storage redundancy
            Link(
                id="ssd1_ssd4_link", name="Storage Redundancy (Cross-Connect)",
                source_id="ssd1", target_id="ssd4", link_type=LinkType.FABRIC,
                max_bandwidth_gbps=16.0, max_latency_ms=1.0
            ),
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
    
    def update(self):
        """Update the simulation by one time step"""
        self.time_step += 1
        
        # Update all components
        for component in self.components.values():
            self._simulate_component_metrics(component)
        
        # Update all links
        for link in self.links.values():
            self._simulate_link_metrics(link)
    
    def get_telemetry(self) -> TelemetryFrame:
        """Get current telemetry data"""
        # Calculate system-wide metrics
        system_metrics = self._calculate_system_metrics()
        
        # Create telemetry frame with components and links
        return TelemetryFrame(
            timestamp=time.time(),
            components=list(self.components.values()),
            links=list(self.links.values()),
            system_metrics=system_metrics
        )
    
    def inject_chaos(self, target_id: str = None, chaos_type: str = "latency_spike"):
        """Inject a chaos event for testing"""
        
        # If no target specified, pick a random component or link
        if target_id is None:
            all_targets = list(self.components.keys()) + list(self.links.keys())
            if all_targets:
                target_id = random.choice(all_targets)
            else:
                return  # No targets available
        
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
