# SynapseNet Backend

Interactive 3D Hardware Atlas & Chaos Survival Challenge - Backend Simulation Engine

## 🚀 What We've Built

This is the core simulation engine for SynapseNet, featuring:

- **Hardware Component Simulation**: CPU, GPU, Memory, and Switch components with realistic telemetry
- **Interconnect Modeling**: PCIe, NVLink, CXL, and DDR links with performance metrics
- **Chaos Engineering**: AI-powered failure injection for testing resilience
- **Real-time Metrics**: Utilization, temperature, power, latency, bandwidth tracking
- **JSON Serialization**: Ready for web API integration

## 🏗️ Architecture

```
backend/
├── src/
│   ├── schemas.py          # Pydantic data models
│   └── providers/
│       └── sim.py          # Hardware simulation engine
├── test_simulation.py      # Basic functionality tests
├── chaos_demo.py          # Chaos scenarios demonstration
└── requirements.txt       # Python dependencies
```

## 🧪 Testing

Run the basic simulation test:

```bash
python test_simulation.py
```

Run chaos engineering scenarios:

```bash
python chaos_demo.py
```

## 📊 Current Hardware Topology

The simulation includes:

- **Intel Xeon CPU** (16 cores, 2.4-3.8 GHz)
- **NVIDIA A100 GPU** (40GB memory, 1555 GB/s bandwidth)
- **DDR4 Memory** (64GB, 3200 MHz, quad-channel)
- **PCIe Switch** (8 ports, Gen 4, 16 lanes each)

Connected via:

- CPU ↔ Memory (DDR4, 51.2 GB/s)
- CPU ↔ Switch (PCIe 4.0 x16, 32 GB/s)
- Switch ↔ GPU (PCIe 4.0 x16, 32 GB/s)

## 🎯 Key Features Demonstrated

### Realistic Telemetry

- Component utilization varies naturally (10-80%)
- Temperature correlates with utilization
- Power draw scales with load
- Network latency increases with congestion

### Chaos Injection

- **CPU Overload**: Increases utilization and temperature
- **Network Congestion**: Floods links with traffic
- **Component Failure**: Simulates hardware failures
- **Latency Spikes**: Network performance degradation

### Metrics Tracking

- System-wide averages (utilization, power, temperature)
- Network performance (latency, bandwidth, error rates)
- Health monitoring (component/link status)

## 🔮 Next Steps

This simulation engine is ready for:

1. **FastAPI Integration**: Web API for frontend communication
2. **WebSocket Support**: Real-time telemetry streaming
3. **Advanced AI**: Machine learning for predictive failures
4. **Extended Topology**: Multi-GPU, storage, more complex networks
5. **Player Actions**: Implement Cut/Heal/Reroute/Shield mechanics

## 🎮 For Hackathon Demo

The backend provides:

- Realistic hardware behavior for immersive experience
- Chaos scenarios that create engaging challenges
- Quantifiable metrics for scoring and feedback
- JSON-ready data for web visualization
- Command-line testing for rapid iteration

Perfect foundation for building the 3D visualization and gesture controls on top!
