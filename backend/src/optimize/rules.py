"""
Rules-based intelligent rerouting system

Implements smart traffic rerouting using predefined rules and heuristics
when network links fail or become congested.
"""

import time
import numpy as np
from typing import Dict, List, Optional, Tuple, Set
from dataclasses import dataclass
from enum import Enum
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from schemas import TelemetryFrame, HardwareComponent, Link, ComponentStatus, LinkType


class RouteQuality(Enum):
    EXCELLENT = "excellent"  # < 2ms latency, < 50% utilization
    GOOD = "good"           # < 5ms latency, < 70% utilization  
    FAIR = "fair"           # < 10ms latency, < 85% utilization
    POOR = "poor"           # > 10ms latency or > 85% utilization
    FAILED = "failed"       # Link down or component failed


@dataclass
class Route:
    """A network route between two components"""
    source_id: str
    target_id: str
    path: List[str]  # Component IDs in order
    total_latency: float
    min_bandwidth: float
    max_utilization: float
    quality: RouteQuality
    hops: int = 0
    
    def __post_init__(self):
        self.hops = len(self.path) - 1


@dataclass
class RerouteAction:
    """An action to reroute traffic"""
    timestamp: float
    source_id: str
    target_id: str
    old_route: Optional[Route]
    new_route: Route
    reason: str
    expected_improvement: Dict[str, float]  # latency, bandwidth, etc.


class IntelligentRouter:
    """
    Rules-based intelligent routing system
    
    Automatically finds optimal paths when links fail or become congested,
    using network topology analysis and performance heuristics.
    """
    
    def __init__(self):
        self.topology_cache: Dict[str, Dict[str, List[str]]] = {}
        self.route_cache: Dict[Tuple[str, str], List[Route]] = {}
        self.active_routes: Dict[Tuple[str, str], Route] = {}
        self.reroute_history: List[RerouteAction] = []
        
        # Routing preferences (can be tuned)
        self.max_hops = 4
        self.latency_weight = 0.4
        self.bandwidth_weight = 0.3
        self.utilization_weight = 0.3
        
        # Thresholds for rerouting decisions
        self.reroute_thresholds = {
            "latency_ms": 10.0,      # Reroute if latency > 10ms
            "utilization_pct": 85.0,  # Reroute if utilization > 85%
            "error_rate_pct": 5.0,    # Reroute if error rate > 5%
        }
        
    def update_topology(self, telemetry: TelemetryFrame) -> None:
        """Update network topology from telemetry data"""
        # Build adjacency list representation
        self.topology_cache.clear()
        
        # Initialize all components
        for component in telemetry.components:
            self.topology_cache[component.id] = {}
            
        # Add links to topology
        for link in telemetry.links:
            if link.status == ComponentStatus.HEALTHY:
                # Bidirectional links
                if link.target_id not in self.topology_cache[link.source_id]:
                    self.topology_cache[link.source_id][link.target_id] = []
                if link.source_id not in self.topology_cache[link.target_id]:
                    self.topology_cache[link.target_id][link.source_id] = []
                    
                # Store link info for routing decisions
                self.topology_cache[link.source_id][link.target_id].append(link.id)
                self.topology_cache[link.target_id][link.source_id].append(link.id)
    
    def find_all_routes(self, source_id: str, target_id: str, 
                       telemetry: TelemetryFrame) -> List[Route]:
        """Find all possible routes between two components"""
        if (source_id, target_id) in self.route_cache:
            return self.route_cache[(source_id, target_id)]
            
        routes = []
        visited = set()
        
        def dfs_routes(current: str, target: str, path: List[str], 
                      total_latency: float, min_bandwidth: float, max_util: float):
            if len(path) > self.max_hops + 1:  # Too many hops
                return
                
            if current == target and len(path) > 1:
                # Found a route!
                quality = self._assess_route_quality(total_latency, min_bandwidth, max_util)
                route = Route(
                    source_id=source_id,
                    target_id=target_id,
                    path=path.copy(),
                    total_latency=total_latency,
                    min_bandwidth=min_bandwidth,
                    max_utilization=max_util,
                    quality=quality
                )
                routes.append(route)
                return
                
            if current in visited:
                return
                
            visited.add(current)
            
            # Explore neighbors
            if current in self.topology_cache:
                for neighbor_id in self.topology_cache[current]:
                    if neighbor_id not in visited:
                        # Find link metrics
                        link_latency, link_bandwidth, link_util = self._get_link_metrics(
                            current, neighbor_id, telemetry
                        )
                        
                        if link_latency is not None:  # Valid link
                            new_path = path + [neighbor_id]
                            new_latency = total_latency + link_latency
                            new_min_bw = min(min_bandwidth, link_bandwidth)
                            new_max_util = max(max_util, link_util)
                            
                            dfs_routes(neighbor_id, target, new_path, 
                                     new_latency, new_min_bw, new_max_util)
            
            visited.remove(current)
        
        # Start DFS from source
        dfs_routes(source_id, target_id, [source_id], 0.0, float('inf'), 0.0)
        
        # Sort routes by quality
        routes.sort(key=lambda r: self._route_score(r), reverse=True)
        
        # Cache results
        self.route_cache[(source_id, target_id)] = routes
        return routes
    
    def analyze_network_health(self, telemetry: TelemetryFrame) -> Dict[str, any]:
        """Analyze overall network health and identify issues"""
        analysis = {
            "timestamp": time.time(),
            "total_components": len(telemetry.components),
            "healthy_components": 0,
            "degraded_components": 0,
            "failed_components": 0,
            "total_links": len(telemetry.links),
            "healthy_links": 0,
            "congested_links": 0,
            "failed_links": 0,
            "avg_latency": 0.0,
            "avg_utilization": 0.0,
            "bottlenecks": [],
            "reroute_opportunities": []
        }
        
        # Analyze components
        for component in telemetry.components:
            if component.status == ComponentStatus.HEALTHY:
                analysis["healthy_components"] += 1
            elif component.status == ComponentStatus.DEGRADED:
                analysis["degraded_components"] += 1
            else:
                analysis["failed_components"] += 1
        
        # Analyze links
        total_latency = 0.0
        total_utilization = 0.0
        active_links = 0
        
        for link in telemetry.links:
            if link.status == ComponentStatus.HEALTHY:
                analysis["healthy_links"] += 1
                active_links += 1
                total_latency += link.latency_ms
                total_utilization += link.utilization
                
                # Check for congestion
                if (link.utilization > self.reroute_thresholds["utilization_pct"] or
                    link.latency_ms > self.reroute_thresholds["latency_ms"]):
                    analysis["congested_links"] += 1
                    analysis["bottlenecks"].append({
                        "link_id": link.id,
                        "source_id": link.source_id,
                        "target_id": link.target_id,
                        "latency_ms": link.latency_ms,
                        "utilization_pct": link.utilization,
                        "issue": "congestion"
                    })
            else:
                analysis["failed_links"] += 1
                analysis["bottlenecks"].append({
                    "link_id": link.id,
                    "source_id": link.source_id,
                    "target_id": link.target_id,
                    "issue": "failure"
                })
        
        # Calculate averages
        if active_links > 0:
            analysis["avg_latency"] = total_latency / active_links
            analysis["avg_utilization"] = total_utilization / active_links
            
        return analysis
    
    def suggest_reroutes(self, telemetry: TelemetryFrame) -> List[RerouteAction]:
        """Suggest intelligent rerouting actions based on current network state"""
        self.update_topology(telemetry)
        suggestions = []
        
        # Analyze network for issues
        analysis = self.analyze_network_health(telemetry)
        
        # For each bottleneck, find alternative routes
        for bottleneck in analysis["bottlenecks"]:
            if bottleneck["issue"] == "congestion" or bottleneck["issue"] == "failure":
                source_id = bottleneck["source_id"]
                target_id = bottleneck["target_id"]
                
                # Find alternative routes
                alternative_routes = self.find_all_routes(source_id, target_id, telemetry)
                
                if alternative_routes:
                    # Get current route (if any)
                    current_route = self.active_routes.get((source_id, target_id))
                    
                    # Find best alternative that's better than current
                    best_alternative = alternative_routes[0]
                    
                    if (current_route is None or 
                        self._is_route_better(best_alternative, current_route, bottleneck)):
                        
                        # Calculate expected improvement
                        improvement = self._calculate_improvement(
                            current_route, best_alternative, bottleneck
                        )
                        
                        suggestion = RerouteAction(
                            timestamp=time.time(),
                            source_id=source_id,
                            target_id=target_id,
                            old_route=current_route,
                            new_route=best_alternative,
                            reason=f"Avoid {bottleneck['issue']} on {bottleneck['link_id']}",
                            expected_improvement=improvement
                        )
                        suggestions.append(suggestion)
        
        return suggestions
    
    def execute_reroute(self, action: RerouteAction) -> bool:
        """Execute a rerouting action"""
        try:
            # Update active routes
            route_key = (action.source_id, action.target_id)
            self.active_routes[route_key] = action.new_route
            
            # Record in history
            self.reroute_history.append(action)
            
            return True
        except Exception as e:
            print(f"Failed to execute reroute: {e}")
            return False
    
    def get_reroute_statistics(self) -> Dict[str, any]:
        """Get statistics about rerouting performance"""
        if not self.reroute_history:
            return {"total_reroutes": 0}
            
        stats = {
            "total_reroutes": len(self.reroute_history),
            "avg_latency_improvement": 0.0,
            "avg_bandwidth_improvement": 0.0,
            "success_rate": 100.0,  # Simplified for now
            "most_common_reasons": {},
            "recent_actions": []
        }
        
        # Analyze improvements
        latency_improvements = []
        bandwidth_improvements = []
        
        for action in self.reroute_history:
            if "latency_improvement_pct" in action.expected_improvement:
                latency_improvements.append(action.expected_improvement["latency_improvement_pct"])
            if "bandwidth_improvement_pct" in action.expected_improvement:
                bandwidth_improvements.append(action.expected_improvement["bandwidth_improvement_pct"])
                
            # Count reasons
            reason = action.reason
            stats["most_common_reasons"][reason] = stats["most_common_reasons"].get(reason, 0) + 1
        
        if latency_improvements:
            stats["avg_latency_improvement"] = sum(latency_improvements) / len(latency_improvements)
        if bandwidth_improvements:
            stats["avg_bandwidth_improvement"] = sum(bandwidth_improvements) / len(bandwidth_improvements)
            
        # Recent actions (last 5)
        stats["recent_actions"] = [
            {
                "timestamp": action.timestamp,
                "route": f"{action.source_id} → {action.target_id}",
                "reason": action.reason,
                "improvement": action.expected_improvement
            }
            for action in self.reroute_history[-5:]
        ]
        
        return stats
    
    def _get_link_metrics(self, source_id: str, target_id: str, 
                         telemetry: TelemetryFrame) -> Tuple[Optional[float], float, float]:
        """Get link metrics between two components"""
        for link in telemetry.links:
            if ((link.source_id == source_id and link.target_id == target_id) or
                (link.source_id == target_id and link.target_id == source_id)):
                if link.status == ComponentStatus.HEALTHY:
                    return link.latency_ms, link.bandwidth_gbps, link.utilization
                else:
                    return None, 0.0, 100.0  # Failed link
        return None, 0.0, 100.0  # No link found
    
    def _assess_route_quality(self, latency: float, bandwidth: float, utilization: float) -> RouteQuality:
        """Assess the quality of a route based on its metrics"""
        if latency < 2.0 and utilization < 50.0:
            return RouteQuality.EXCELLENT
        elif latency < 5.0 and utilization < 70.0:
            return RouteQuality.GOOD
        elif latency < 10.0 and utilization < 85.0:
            return RouteQuality.FAIR
        else:
            return RouteQuality.POOR
    
    def _route_score(self, route: Route) -> float:
        """Calculate a score for route comparison"""
        # Lower latency is better
        latency_score = max(0, 20 - route.total_latency) / 20
        
        # Higher bandwidth is better
        bandwidth_score = min(1.0, route.min_bandwidth / 100.0)
        
        # Lower utilization is better
        utilization_score = max(0, 100 - route.max_utilization) / 100
        
        # Fewer hops is better
        hop_score = max(0, (self.max_hops - route.hops)) / self.max_hops
        
        # Weighted combination
        total_score = (
            latency_score * self.latency_weight +
            bandwidth_score * self.bandwidth_weight +
            utilization_score * self.utilization_weight +
            hop_score * 0.1  # Small bonus for fewer hops
        )
        
        return total_score
    
    def _is_route_better(self, new_route: Route, old_route: Optional[Route], 
                        bottleneck: Dict) -> bool:
        """Determine if new route is better than old route"""
        if old_route is None:
            return True
            
        # If old route goes through the bottleneck, new route is better
        if bottleneck["issue"] == "failure":
            return True  # Any working route is better than failed route
            
        # Compare scores
        new_score = self._route_score(new_route)
        old_score = self._route_score(old_route)
        
        return new_score > old_score * 1.1  # 10% improvement threshold
    
    def _calculate_improvement(self, old_route: Optional[Route], new_route: Route, 
                             bottleneck: Dict) -> Dict[str, float]:
        """Calculate expected improvement from rerouting"""
        improvement = {}
        
        if old_route is None:
            improvement["latency_improvement_pct"] = 100.0  # New connection
            improvement["bandwidth_improvement_pct"] = 100.0
        else:
            # Latency improvement
            if old_route.total_latency > 0:
                latency_change = ((old_route.total_latency - new_route.total_latency) / 
                                old_route.total_latency * 100)
                improvement["latency_improvement_pct"] = latency_change
            
            # Bandwidth improvement
            if old_route.min_bandwidth > 0:
                bandwidth_change = ((new_route.min_bandwidth - old_route.min_bandwidth) / 
                                  old_route.min_bandwidth * 100)
                improvement["bandwidth_improvement_pct"] = bandwidth_change
            
            # Utilization improvement
            utilization_change = old_route.max_utilization - new_route.max_utilization
            improvement["utilization_improvement_pct"] = utilization_change
        
        return improvement
