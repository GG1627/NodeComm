"""
Data schemas for SynapseNet hardware simulation.
"""
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Literal, Any
from enum import Enum
import time


class ComponentType(str, Enum):
    """Hardware component types"""
    CPU = "cpu"
    GPU = "gpu"
    MEMORY = "memory"
    SWITCH = "switch"
    STORAGE = "storage"


class LinkType(str, Enum):
    """Interconnect types"""
    PCIE = "pcie"
    NVLINK = "nvlink"
    CXL = "cxl"
    FABRIC = "fabric"
    DDR = "ddr"


class ComponentStatus(str, Enum):
    """Component health status"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    FAILED = "failed"
    OFFLINE = "offline"


class HardwareComponent(BaseModel):
    """A hardware component in the system"""
    id: str
    name: str
    component_type: ComponentType
    status: ComponentStatus = ComponentStatus.HEALTHY
    utilization: float = Field(default=0.0, ge=0.0, le=100.0)  # 0-100%
    temperature: float = Field(default=25.0, ge=0.0, le=150.0)  # Celsius
    power_draw: float = Field(default=0.0, ge=0.0)  # Watts
    position: Dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0, "z": 0})
    
    # Component-specific attributes
    specs: Dict[str, Any] = Field(default_factory=dict)


class Link(BaseModel):
    """A connection between two components"""
    id: str
    source_id: str
    target_id: str
    link_type: LinkType
    status: ComponentStatus = ComponentStatus.HEALTHY
    
    # Performance metrics
    latency_ms: float = Field(default=0.1, ge=0.0)  # milliseconds
    bandwidth_gbps: float = Field(default=1.0, ge=0.0)  # Gbps
    utilization: float = Field(default=0.0, ge=0.0, le=100.0)  # 0-100%
    error_rate: float = Field(default=0.0, ge=0.0, le=100.0)  # 0-100%
    
    # Link specifications
    max_bandwidth_gbps: float = Field(default=10.0, ge=0.0)
    max_latency_ms: float = Field(default=1.0, ge=0.0)


class TelemetryFrame(BaseModel):
    """A single frame of telemetry data"""
    timestamp: float = Field(default_factory=time.time)
    components: List[HardwareComponent]
    links: List[Link]
    system_metrics: Dict[str, float] = Field(default_factory=dict)


class ActionLog(BaseModel):
    """Log entry for user actions or AI events"""
    timestamp: float = Field(default_factory=time.time)
    action_type: Literal["cut", "heal", "reroute", "shield", "ai_attack", "system_event"]
    target_id: Optional[str] = None  # Component or link ID
    description: str
    impact: Dict[str, float] = Field(default_factory=dict)  # Metric changes


class Scorecard(BaseModel):
    """Performance metrics and scoring"""
    resilience_score: float = Field(default=100.0, ge=0.0, le=100.0)
    uptime_percentage: float = Field(default=100.0, ge=0.0, le=100.0)
    avg_latency_ms: float = Field(default=0.0, ge=0.0)
    total_throughput_gbps: float = Field(default=0.0, ge=0.0)
    recovery_time_ms: float = Field(default=0.0, ge=0.0)
    actions_taken: int = Field(default=0, ge=0)
    ai_attacks_survived: int = Field(default=0, ge=0)


class SystemState(BaseModel):
    """Complete system state snapshot"""
    telemetry: TelemetryFrame
    scorecard: Scorecard
    action_log: List[ActionLog] = Field(default_factory=list)
    mode: Literal["learning", "chaos"] = "learning"
    chaos_difficulty: Literal["easy", "medium", "hard"] = "easy"
