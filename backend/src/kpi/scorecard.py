"""
KPI Scorecard System - Real-time performance metrics and scoring

Tracks system health, user performance, and provides educational insights
for both Learning Mode and Chaos Mode gameplay.
"""

import time
import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from schemas import SystemState, HardwareComponent, Link, ComponentStatus, TelemetryFrame


class GameMode(Enum):
    LEARNING = "learning"
    CHAOS = "chaos"


@dataclass
class ActionEvent:
    """Records a user action for scoring"""
    timestamp: float
    action_type: str  # "cut", "heal", "reroute", "shield"
    target_component: Optional[str] = None
    effectiveness: float = 0.0  # 0-1 score
    response_time: float = 0.0  # seconds from problem to action


@dataclass
class PerformanceMetrics:
    """Real-time system performance metrics"""
    # Core metrics
    resilience_score: float = 100.0  # 0-100
    uptime_percentage: float = 100.0
    avg_latency: float = 0.0  # milliseconds
    total_bandwidth: float = 0.0  # GB/s
    efficiency_score: float = 100.0  # 0-100
    
    # Astera Labs connectivity metrics
    signal_integrity_score: float = 100.0  # 0-100, overall signal quality
    retimer_compensation_level: float = 0.0  # 0-100, how much retiming is needed
    smart_cable_health: float = 100.0  # 0-100, smart cable module health
    cxl_channel_utilization: float = 0.0  # 0-100, CXL memory channel usage
    
    # Failure tracking
    total_failures: int = 0
    active_failures: int = 0
    mean_recovery_time: float = 0.0
    
    # User performance (Chaos Mode)
    user_score: int = 0
    actions_taken: int = 0
    successful_actions: int = 0
    avg_response_time: float = 0.0
    
    # Time tracking
    session_start: float = field(default_factory=time.time)
    total_uptime: float = 0.0
    total_downtime: float = 0.0


@dataclass
class InsightMessage:
    """Educational or performance insight"""
    message: str
    category: str  # "tip", "warning", "success", "info"
    priority: int = 1  # 1=low, 2=medium, 3=high
    timestamp: float = field(default_factory=time.time)


class KPIScorecard:
    """
    Comprehensive scoring and metrics system for SynapseNet
    
    Tracks performance in real-time, generates insights, and provides
    scoring for both educational and competitive gameplay modes.
    """
    
    def __init__(self, mode: GameMode = GameMode.CHAOS):
        self.mode = mode
        self.metrics = PerformanceMetrics()
        self.action_history: List[ActionEvent] = []
        self.insights: List[InsightMessage] = []
        self.baseline_metrics: Dict[str, float] = {}
        
        # Failure tracking
        self.failure_events: List[Tuple[float, str, str]] = []  # (timestamp, component, type)
        self.recovery_events: List[Tuple[float, str, float]] = []  # (timestamp, component, duration)
        
        # Performance history for trends
        self.performance_history: List[Tuple[float, Dict[str, float]]] = []
        self.max_history_size = 1000
        
        # Scoring weights (can be tuned)
        self.scoring_weights = {
            "resilience": 0.3,
            "response_time": 0.25,
            "effectiveness": 0.25,
            "uptime": 0.2
        }
        
    def update_system_state(self, system_state: SystemState) -> None:
        """Update metrics based on current system state"""
        current_time = time.time()
        
        # Calculate core metrics
        self._calculate_resilience(system_state.telemetry)
        self._calculate_latency_bandwidth(system_state.telemetry)
        self._calculate_uptime(system_state.telemetry, current_time)
        self._detect_failures(system_state.telemetry, current_time)
        
        # Calculate Astera Labs connectivity metrics
        self._calculate_signal_integrity(system_state.telemetry)
        self._calculate_retimer_compensation(system_state.telemetry)
        self._calculate_smart_cable_health(system_state.telemetry)
        self._calculate_cxl_utilization(system_state.telemetry)
        
        # Store performance snapshot
        snapshot = {
            "resilience": self.metrics.resilience_score,
            "latency": self.metrics.avg_latency,
            "bandwidth": self.metrics.total_bandwidth,
            "efficiency": self.metrics.efficiency_score,
            "uptime": self.metrics.uptime_percentage,
            "signal_integrity": self.metrics.signal_integrity_score,
            "retimer_compensation": self.metrics.retimer_compensation_level,
            "smart_cable_health": self.metrics.smart_cable_health,
            "cxl_utilization": self.metrics.cxl_channel_utilization
        }
        self.performance_history.append((current_time, snapshot))
        
        # Trim history if too long
        if len(self.performance_history) > self.max_history_size:
            self.performance_history.pop(0)
            
        # Generate insights based on trends
        self._generate_insights(system_state.telemetry)
    
    def record_user_action(self, action_type: str, target_component: Optional[str] = None,
                          problem_start_time: Optional[float] = None) -> ActionEvent:
        """Record a user action and calculate its effectiveness"""
        current_time = time.time()
        
        # Calculate response time if problem start time provided
        response_time = 0.0
        if problem_start_time:
            response_time = current_time - problem_start_time
            
        # Calculate effectiveness based on system state improvement
        effectiveness = self._calculate_action_effectiveness(action_type, target_component)
        
        # Create action event
        action = ActionEvent(
            timestamp=current_time,
            action_type=action_type,
            target_component=target_component,
            effectiveness=effectiveness,
            response_time=response_time
        )
        
        self.action_history.append(action)
        
        # Update user performance metrics
        self.metrics.actions_taken += 1
        if effectiveness > 0.5:  # Consider successful if > 50% effective
            self.metrics.successful_actions += 1
            
        # Update average response time
        if response_time > 0:
            total_response_time = self.metrics.avg_response_time * (self.metrics.actions_taken - 1)
            self.metrics.avg_response_time = (total_response_time + response_time) / self.metrics.actions_taken
            
        # Calculate score bonus
        score_bonus = self._calculate_score_bonus(action)
        self.metrics.user_score += score_bonus
        
        # Generate action feedback
        self._generate_action_feedback(action, score_bonus)
        
        return action
    
    def get_current_metrics(self) -> PerformanceMetrics:
        """Get current performance metrics"""
        return self.metrics
    
    def get_current_scorecard(self) -> 'Scorecard':
        """Get current scorecard compatible with frontend"""
        from schemas import Scorecard
        
        return Scorecard(
            resilience_score=self.metrics.resilience_score,
            uptime_percentage=self.metrics.uptime_percentage,
            avg_latency_ms=self.metrics.avg_latency,
            total_throughput_gbps=self.metrics.total_bandwidth,
            recovery_time_ms=self.metrics.mean_recovery_time,
            actions_taken=self.metrics.actions_taken,
            ai_attacks_survived=0  # We can track this separately if needed
        )
    
    def get_recent_insights(self, count: int = 5) -> List[InsightMessage]:
        """Get most recent insights"""
        return sorted(self.insights, key=lambda x: x.timestamp, reverse=True)[:count]
    
    def get_performance_trend(self, metric: str, duration_seconds: int = 60) -> List[Tuple[float, float]]:
        """Get performance trend for a specific metric over time"""
        current_time = time.time()
        cutoff_time = current_time - duration_seconds
        
        trend_data = []
        for timestamp, snapshot in self.performance_history:
            if timestamp >= cutoff_time and metric in snapshot:
                trend_data.append((timestamp, snapshot[metric]))
                
        return trend_data
    
    def generate_session_summary(self) -> Dict:
        """Generate comprehensive session summary"""
        session_duration = time.time() - self.metrics.session_start
        
        summary = {
            "session_duration": session_duration,
            "final_score": self.metrics.user_score,
            "resilience_score": self.metrics.resilience_score,
            "uptime_percentage": self.metrics.uptime_percentage,
            "total_actions": self.metrics.actions_taken,
            "successful_actions": self.metrics.successful_actions,
            "success_rate": (self.metrics.successful_actions / max(1, self.metrics.actions_taken)) * 100,
            "avg_response_time": self.metrics.avg_response_time,
            "total_failures": self.metrics.total_failures,
            "mean_recovery_time": self.metrics.mean_recovery_time,
            "performance_grade": self._calculate_performance_grade()
        }
        
        # Add action breakdown
        action_breakdown = {}
        for action in self.action_history:
            action_type = action.action_type
            if action_type not in action_breakdown:
                action_breakdown[action_type] = {"count": 0, "avg_effectiveness": 0.0}
            action_breakdown[action_type]["count"] += 1
            
        # Calculate average effectiveness per action type
        for action_type in action_breakdown:
            actions_of_type = [a for a in self.action_history if a.action_type == action_type]
            if actions_of_type:
                avg_eff = sum(a.effectiveness for a in actions_of_type) / len(actions_of_type)
                action_breakdown[action_type]["avg_effectiveness"] = avg_eff
                
        summary["action_breakdown"] = action_breakdown
        
        return summary
    
    def _calculate_resilience(self, telemetry: TelemetryFrame) -> None:
        """Calculate system resilience score (0-100)"""
        total_components = len(telemetry.components)
        if total_components == 0:
            self.metrics.resilience_score = 0.0
            return
            
        # Count healthy vs degraded/failed components
        healthy_count = sum(1 for comp in telemetry.components 
                          if comp.status == ComponentStatus.HEALTHY)
        degraded_count = sum(1 for comp in telemetry.components 
                           if comp.status == ComponentStatus.DEGRADED)
        failed_count = sum(1 for comp in telemetry.components 
                         if comp.status == ComponentStatus.FAILED)
        
        # Calculate weighted resilience
        resilience = (healthy_count * 1.0 + degraded_count * 0.5 + failed_count * 0.0) / total_components
        self.metrics.resilience_score = resilience * 100
        
        # Factor in link health
        total_links = len(telemetry.links)
        if total_links > 0:
            healthy_links = sum(1 for link in telemetry.links 
                              if link.status == ComponentStatus.HEALTHY)
            link_health = healthy_links / total_links
            
            # Combine component and link health (70% components, 30% links)
            self.metrics.resilience_score = (resilience * 0.7 + link_health * 0.3) * 100
    
    def _calculate_latency_bandwidth(self, telemetry: TelemetryFrame) -> None:
        """Calculate average latency and total bandwidth"""
        if not telemetry.links:
            self.metrics.avg_latency = 0.0
            self.metrics.total_bandwidth = 0.0
            return
            
        # Calculate average latency across active links
        active_links = [link for link in telemetry.links if link.status == ComponentStatus.HEALTHY]
        if active_links:
            total_latency = sum(link.latency_ms for link in active_links)
            self.metrics.avg_latency = total_latency / len(active_links)
            
            # Calculate total available bandwidth
            self.metrics.total_bandwidth = sum(link.bandwidth_gbps for link in active_links)
        else:
            self.metrics.avg_latency = float('inf')  # No active links
            self.metrics.total_bandwidth = 0.0
            
        # Calculate efficiency score based on utilization
        if active_links:
            avg_utilization = sum(link.utilization for link in active_links) / len(active_links)
            # Efficiency is high when utilization is moderate (not too low, not maxed out)
            optimal_utilization = 0.7
            efficiency = 1.0 - abs(avg_utilization - optimal_utilization) / optimal_utilization
            self.metrics.efficiency_score = max(0, efficiency * 100)
    
    def _calculate_uptime(self, telemetry: TelemetryFrame, current_time: float) -> None:
        """Calculate system uptime percentage"""
        session_duration = current_time - self.metrics.session_start
        if session_duration <= 0:
            return
            
        # System is "down" if resilience < 50%
        is_system_up = self.metrics.resilience_score >= 50.0
        
        if hasattr(self, '_last_uptime_check'):
            time_delta = current_time - self._last_uptime_check
            if is_system_up:
                self.metrics.total_uptime += time_delta
            else:
                self.metrics.total_downtime += time_delta
                
        self._last_uptime_check = current_time
        
        # Calculate uptime percentage
        total_time = self.metrics.total_uptime + self.metrics.total_downtime
        if total_time > 0:
            self.metrics.uptime_percentage = (self.metrics.total_uptime / total_time) * 100
    
    def _detect_failures(self, telemetry: TelemetryFrame, current_time: float) -> None:
        """Detect and track component failures"""
        current_failures = 0
        
        for component in telemetry.components:
            if component.status in [ComponentStatus.FAILED, ComponentStatus.DEGRADED]:
                current_failures += 1
                
                # Check if this is a new failure
                recent_failures = [f for f in self.failure_events 
                                 if f[1] == component.id and current_time - f[0] < 5.0]
                if not recent_failures:
                    # New failure detected
                    failure_type = "failure" if component.status == ComponentStatus.FAILED else "degradation"
                    self.failure_events.append((current_time, component.id, failure_type))
                    self.metrics.total_failures += 1
                    
        self.metrics.active_failures = current_failures
        
        # Calculate mean recovery time
        if self.recovery_events:
            total_recovery_time = sum(event[2] for event in self.recovery_events)
            self.metrics.mean_recovery_time = total_recovery_time / len(self.recovery_events)
    
    def _calculate_action_effectiveness(self, action_type: str, target_component: Optional[str]) -> float:
        """Calculate how effective a user action was"""
        # This is a simplified effectiveness calculation
        # In a real implementation, you'd compare system state before/after the action
        
        base_effectiveness = {
            "cut": 0.7,      # Usually effective at isolating problems
            "heal": 0.8,     # Usually effective at fixing issues
            "reroute": 0.6,  # Moderate effectiveness, depends on topology
            "shield": 0.5    # Preventive, harder to measure immediate impact
        }
        
        effectiveness = base_effectiveness.get(action_type, 0.5)
        
        # Add some randomness to simulate real-world variability
        effectiveness += np.random.normal(0, 0.1)
        
        return max(0.0, min(1.0, effectiveness))
    
    def _calculate_score_bonus(self, action: ActionEvent) -> int:
        """Calculate score bonus for an action"""
        base_score = 100
        
        # Effectiveness multiplier
        effectiveness_bonus = action.effectiveness * base_score
        
        # Response time bonus (faster = better)
        if action.response_time > 0:
            # Bonus for responding within 3 seconds
            if action.response_time <= 3.0:
                time_bonus = (3.0 - action.response_time) * 50
            else:
                time_bonus = -20  # Penalty for slow response
        else:
            time_bonus = 0
            
        total_bonus = int(effectiveness_bonus + time_bonus)
        return max(0, total_bonus)  # No negative scores
    
    def _calculate_performance_grade(self) -> str:
        """Calculate overall performance grade"""
        score = 0
        
        # Resilience component (30%)
        score += (self.metrics.resilience_score / 100) * 30
        
        # Uptime component (25%)
        score += (self.metrics.uptime_percentage / 100) * 25
        
        # Response time component (25%)
        if self.metrics.avg_response_time > 0:
            # Good response time is under 2 seconds
            response_score = max(0, (2.0 - self.metrics.avg_response_time) / 2.0)
            score += response_score * 25
        
        # Success rate component (20%)
        if self.metrics.actions_taken > 0:
            success_rate = self.metrics.successful_actions / self.metrics.actions_taken
            score += success_rate * 20
            
        # Convert to letter grade
        if score >= 90:
            return "A+"
        elif score >= 85:
            return "A"
        elif score >= 80:
            return "B+"
        elif score >= 75:
            return "B"
        elif score >= 70:
            return "C+"
        elif score >= 65:
            return "C"
        elif score >= 60:
            return "D"
        else:
            return "F"
    
    def _generate_insights(self, telemetry: TelemetryFrame) -> None:
        """Generate educational and performance insights"""
        current_time = time.time()
        
        # Don't generate insights too frequently
        recent_insights = [i for i in self.insights if current_time - i.timestamp < 10.0]
        if len(recent_insights) > 3:
            return
            
        # Resilience insights
        if self.metrics.resilience_score < 30:
            self.insights.append(InsightMessage(
                "🚨 Critical: System resilience below 30%! Multiple components need attention.",
                "warning", 3
            ))
        elif self.metrics.resilience_score < 60:
            self.insights.append(InsightMessage(
                "⚠️ System resilience declining. Consider healing degraded components.",
                "tip", 2
            ))
            
        # Latency insights
        if self.metrics.avg_latency > 50:
            self.insights.append(InsightMessage(
                "🐌 High latency detected. Try rerouting traffic or healing network links.",
                "tip", 2
            ))
            
        # Performance insights for Learning Mode
        if self.mode == GameMode.LEARNING:
            if len(self.performance_history) > 10:
                # Analyze trends
                recent_resilience = [p[1]["resilience"] for p in self.performance_history[-10:]]
                if len(recent_resilience) > 1:
                    trend = recent_resilience[-1] - recent_resilience[0]
                    if trend > 10:
                        self.insights.append(InsightMessage(
                            "📈 Great! Your changes improved system resilience by {:.1f}%".format(trend),
                            "success", 1
                        ))
                    elif trend < -10:
                        self.insights.append(InsightMessage(
                            "📉 Your recent changes decreased resilience. Try a different approach.",
                            "info", 1
                        ))
    
    def _generate_action_feedback(self, action: ActionEvent, score_bonus: int) -> None:
        """Generate feedback for user actions"""
        effectiveness_pct = action.effectiveness * 100
        
        if action.effectiveness > 0.8:
            feedback = f"🎯 Excellent {action.action_type}! +{score_bonus} points"
        elif action.effectiveness > 0.6:
            feedback = f"👍 Good {action.action_type}. +{score_bonus} points"
        elif action.effectiveness > 0.4:
            feedback = f"👌 {action.action_type} had some effect. +{score_bonus} points"
        else:
            feedback = f"🤔 {action.action_type} wasn't very effective. +{score_bonus} points"
            
        if action.response_time > 0 and action.response_time <= 2.0:
            feedback += f" (Fast response: {action.response_time:.1f}s!)"
            
        self.insights.append(InsightMessage(feedback, "success", 1))
    
    def _calculate_signal_integrity(self, telemetry: TelemetryFrame) -> None:
        """Calculate overall signal integrity score based on link quality"""
        if not telemetry.links:
            self.metrics.signal_integrity_score = 100.0
            return
            
        total_score = 0.0
        active_links = [link for link in telemetry.links if link.status == ComponentStatus.HEALTHY]
        
        if not active_links:
            self.metrics.signal_integrity_score = 0.0
            return
            
        for link in active_links:
            # Signal quality degrades with high latency and utilization
            latency_penalty = min(50, link.latency_ms * 5)  # Up to 50% penalty for high latency
            utilization_penalty = max(0, (link.utilization - 70) * 2)  # Penalty above 70% util
            error_penalty = link.error_rate * 10  # 10% penalty per 1% error rate
            
            link_score = max(0, 100 - latency_penalty - utilization_penalty - error_penalty)
            total_score += link_score
            
        self.metrics.signal_integrity_score = total_score / len(active_links)
    
    def _calculate_retimer_compensation(self, telemetry: TelemetryFrame) -> None:
        """Calculate how much retimer compensation is needed"""
        if not telemetry.links:
            self.metrics.retimer_compensation_level = 0.0
            return
            
        total_compensation = 0.0
        pcie_links = [link for link in telemetry.links 
                     if link.link_type.value in ["pcie", "cxl"] and 
                     link.status == ComponentStatus.HEALTHY]
        
        if not pcie_links:
            self.metrics.retimer_compensation_level = 0.0
            return
            
        for link in pcie_links:
            # Higher compensation needed for longer distances (simulated by latency)
            # and higher error rates
            distance_compensation = min(80, link.latency_ms * 20)  # Up to 80% for high latency
            error_compensation = min(20, link.error_rate * 4)  # Up to 20% for errors
            
            link_compensation = distance_compensation + error_compensation
            total_compensation += link_compensation
            
        self.metrics.retimer_compensation_level = min(100, total_compensation / len(pcie_links))
    
    def _calculate_smart_cable_health(self, telemetry: TelemetryFrame) -> None:
        """Calculate smart cable module health"""
        # Find GPU connections (likely to have smart cables)
        gpu_links = []
        gpu_components = [comp for comp in telemetry.components if comp.component_type.value == "gpu"]
        
        for gpu in gpu_components:
            for link in telemetry.links:
                if link.source_id == gpu.id or link.target_id == gpu.id:
                    gpu_links.append(link)
        
        if not gpu_links:
            self.metrics.smart_cable_health = 100.0
            return
            
        total_health = 0.0
        for link in gpu_links:
            if link.status != ComponentStatus.HEALTHY:
                link_health = 0.0
            else:
                # Health degrades with high utilization and temperature stress
                util_penalty = max(0, (link.utilization - 80) * 2)  # Penalty above 80%
                
                # Simulate thermal stress based on high bandwidth usage
                thermal_stress = min(30, (link.bandwidth_gbps / 100) * 10)  # Up to 30% penalty
                
                link_health = max(0, 100 - util_penalty - thermal_stress)
            
            total_health += link_health
            
        self.metrics.smart_cable_health = total_health / len(gpu_links)
    
    def _calculate_cxl_utilization(self, telemetry: TelemetryFrame) -> None:
        """Calculate CXL memory channel utilization"""
        cxl_links = [link for link in telemetry.links 
                    if link.link_type.value == "cxl" and 
                    link.status == ComponentStatus.HEALTHY]
        
        if not cxl_links:
            self.metrics.cxl_channel_utilization = 0.0
            return
            
        # Average utilization across all CXL channels
        total_utilization = sum(link.utilization for link in cxl_links)
        self.metrics.cxl_channel_utilization = total_utilization / len(cxl_links)
