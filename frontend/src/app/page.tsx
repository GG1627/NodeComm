export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800/50 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-light tracking-wide text-white">
            SynapseNet
          </h1>
          <div className="flex items-center space-x-8">
            <div className="text-sm font-medium">
              <span className="text-zinc-400">Resilience</span>
              <span className="text-emerald-400 font-semibold ml-3">87%</span>
            </div>
            <div className="text-sm font-medium">
              <span className="text-zinc-400">Status</span>
              <div className="inline-flex items-center ml-3">
                <div className="w-2 h-2 bg-emerald-400 rounded-full mr-2"></div>
                <span className="text-white">Online</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-screen">
        {/* Left Sidebar - Hardware Status */}
        <div className="w-80 bg-zinc-900/30 backdrop-blur-sm border-r border-zinc-800/30 p-6 overflow-y-auto">
          <h2 className="text-lg font-light mb-6 text-zinc-200 tracking-wide">
            Hardware Status
          </h2>

          {/* CPU */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-5 mb-4 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">Intel Xeon CPU</h3>
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Utilization</span>
                <span className="text-white font-medium">67%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Temperature</span>
                <span className="text-amber-400 font-medium">72°C</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Power</span>
                <span className="text-white font-medium">145W</span>
              </div>
            </div>
          </div>

          {/* GPU */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-5 mb-4 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">NVIDIA A100</h3>
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Utilization</span>
                <span className="text-white font-medium">43%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Temperature</span>
                <span className="text-emerald-400 font-medium">58°C</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Memory</span>
                <span className="text-white font-medium">28GB / 40GB</span>
              </div>
            </div>
          </div>

          {/* Memory */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-5 mb-4 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">DDR4 Memory</h3>
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Usage</span>
                <span className="text-white font-medium">45GB / 64GB</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Speed</span>
                <span className="text-white font-medium">3200 MHz</span>
              </div>
            </div>
          </div>

          {/* Network */}
          <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-5 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">Network Links</h3>
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Latency</span>
                <span className="text-emerald-400 font-medium">1.2ms</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Bandwidth</span>
                <span className="text-white font-medium">25.4 Gbps</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Utilization</span>
                <span className="text-white font-medium">68%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Node Visualization Area */}
          <div className="flex-1 bg-zinc-950 relative overflow-hidden">
            {/* Node Network */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 800 600"
            >
              {/* Connection Lines */}
              <g className="opacity-60">
                {/* CPU to Memory */}
                <line
                  x1="200"
                  y1="150"
                  x2="150"
                  y2="250"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                  className="drop-shadow-sm"
                />
                {/* CPU to Switch */}
                <line
                  x1="200"
                  y1="150"
                  x2="300"
                  y2="300"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                  className="drop-shadow-sm"
                />
                {/* Switch to GPU */}
                <line
                  x1="300"
                  y1="300"
                  x2="450"
                  y2="200"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                  className="drop-shadow-sm"
                />
                {/* Switch to Storage */}
                <line
                  x1="300"
                  y1="300"
                  x2="500"
                  y2="400"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                  className="drop-shadow-sm"
                />
                {/* Memory to Cache */}
                <line
                  x1="150"
                  y1="250"
                  x2="100"
                  y2="350"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                  className="drop-shadow-sm"
                />
                {/* GPU to Compute */}
                <line
                  x1="450"
                  y1="200"
                  x2="600"
                  y2="150"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                  className="drop-shadow-sm"
                />
                {/* Network connections */}
                <line
                  x1="300"
                  y1="300"
                  x2="400"
                  y2="350"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                  className="drop-shadow-sm"
                />
                <line
                  x1="400"
                  y1="350"
                  x2="550"
                  y2="300"
                  stroke="rgb(52 211 153)"
                  strokeWidth="2"
                  className="drop-shadow-sm"
                />
                {/* Cross connections */}
                <line
                  x1="450"
                  y1="200"
                  x2="500"
                  y2="400"
                  stroke="rgb(52 211 153)"
                  strokeWidth="1"
                  className="opacity-40"
                />
                <line
                  x1="600"
                  y1="150"
                  x2="550"
                  y2="300"
                  stroke="rgb(52 211 153)"
                  strokeWidth="1"
                  className="opacity-40"
                />
              </g>

              {/* Node Circles */}
              <g>
                {/* CPU - Main processor */}
                <circle
                  cx="200"
                  cy="150"
                  r="20"
                  fill="rgb(52 211 153)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="200"
                  cy="150"
                  r="16"
                  fill="rgb(6 78 59)"
                  className="opacity-80"
                />
                <text
                  x="200"
                  y="130"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  CPU
                </text>

                {/* Memory */}
                <circle
                  cx="150"
                  cy="250"
                  r="16"
                  fill="rgb(34 197 94)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="150"
                  cy="250"
                  r="12"
                  fill="rgb(21 128 61)"
                  className="opacity-80"
                />
                <text
                  x="150"
                  y="275"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  MEM
                </text>

                {/* Switch/Router */}
                <circle
                  cx="300"
                  cy="300"
                  r="18"
                  fill="rgb(59 130 246)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="300"
                  cy="300"
                  r="14"
                  fill="rgb(29 78 216)"
                  className="opacity-80"
                />
                <text
                  x="300"
                  y="285"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  SWITCH
                </text>

                {/* GPU */}
                <circle
                  cx="450"
                  cy="200"
                  r="18"
                  fill="rgb(168 85 247)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="450"
                  cy="200"
                  r="14"
                  fill="rgb(126 34 206)"
                  className="opacity-80"
                />
                <text
                  x="450"
                  y="185"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  GPU
                </text>

                {/* Storage */}
                <circle
                  cx="500"
                  cy="400"
                  r="14"
                  fill="rgb(245 158 11)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="500"
                  cy="400"
                  r="10"
                  fill="rgb(180 83 9)"
                  className="opacity-80"
                />
                <text
                  x="500"
                  y="425"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  SSD
                </text>

                {/* Cache */}
                <circle
                  cx="100"
                  cy="350"
                  r="12"
                  fill="rgb(14 165 233)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="100"
                  cy="350"
                  r="8"
                  fill="rgb(2 132 199)"
                  className="opacity-80"
                />
                <text
                  x="100"
                  y="375"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  L3
                </text>

                {/* Compute Unit */}
                <circle
                  cx="600"
                  cy="150"
                  r="14"
                  fill="rgb(239 68 68)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="600"
                  cy="150"
                  r="10"
                  fill="rgb(185 28 28)"
                  className="opacity-80"
                />
                <text
                  x="600"
                  y="135"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  CUDA
                </text>

                {/* Network Interface */}
                <circle
                  cx="400"
                  cy="350"
                  r="12"
                  fill="rgb(16 185 129)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="400"
                  cy="350"
                  r="8"
                  fill="rgb(5 150 105)"
                  className="opacity-80"
                />
                <text
                  x="400"
                  y="375"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  NIC
                </text>

                {/* Load Balancer */}
                <circle
                  cx="550"
                  cy="300"
                  r="12"
                  fill="rgb(217 70 239)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="550"
                  cy="300"
                  r="8"
                  fill="rgb(168 85 247)"
                  className="opacity-80"
                />
                <text
                  x="550"
                  y="285"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  LB
                </text>

                {/* Fabric Controller */}
                <circle
                  cx="350"
                  cy="450"
                  r="10"
                  fill="rgb(156 163 175)"
                  className="drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
                />
                <circle
                  cx="350"
                  cy="450"
                  r="6"
                  fill="rgb(107 114 128)"
                  className="opacity-80"
                />
                <text
                  x="350"
                  y="470"
                  textAnchor="middle"
                  className="text-xs fill-white font-medium"
                >
                  CTRL
                </text>
              </g>

              {/* Data Flow Particles (animated) */}
              <g className="opacity-70">
                <circle r="2" fill="rgb(52 211 153)" className="animate-pulse">
                  <animateMotion
                    dur="3s"
                    repeatCount="indefinite"
                    path="M200,150 L300,300"
                  />
                </circle>
                <circle r="2" fill="rgb(59 130 246)" className="animate-pulse">
                  <animateMotion
                    dur="4s"
                    repeatCount="indefinite"
                    path="M300,300 L450,200"
                  />
                </circle>
                <circle r="2" fill="rgb(168 85 247)" className="animate-pulse">
                  <animateMotion
                    dur="2.5s"
                    repeatCount="indefinite"
                    path="M450,200 L600,150"
                  />
                </circle>
              </g>
            </svg>

            {/* Network Stats Overlay */}
            <div className="absolute bottom-6 left-6 bg-zinc-900/60 backdrop-blur-sm rounded-xl p-4 border border-zinc-700/30">
              <h3 className="text-sm font-medium text-zinc-200 mb-2">
                Network Activity
              </h3>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Active Nodes:</span>
                  <span className="text-emerald-400">10/10</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Data Flow:</span>
                  <span className="text-white">2.4 GB/s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Latency:</span>
                  <span className="text-emerald-400">0.8ms</span>
                </div>
              </div>
            </div>

            {/* ML Predictions Overlay */}
            <div className="absolute top-6 right-6 bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-zinc-700/30">
              <h3 className="text-zinc-200 font-medium mb-3 flex items-center">
                <span className="mr-2">🤖</span>
                ML Predictions
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
                  <span className="text-white">CPU thermal spike in 12s</span>
                </div>
                <div className="text-xs text-zinc-400 ml-5">
                  Confidence: 87% • Use HEAL gesture
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Panel - Gesture & Controls */}
          <div className="h-32 bg-zinc-900/50 backdrop-blur-sm border-t border-zinc-800/30 p-6">
            <div className="flex items-center justify-between h-full">
              {/* Gesture Status */}
              <div className="flex items-center space-x-8">
                <div>
                  <h3 className="text-sm font-medium text-zinc-200 mb-2">
                    Gesture Recognition
                  </h3>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                    <span className="text-sm text-white">Camera Active</span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    Current:{" "}
                    <span className="text-white font-medium">NONE</span> •
                    Confidence: 0%
                  </div>
                </div>

                {/* Gesture Controls */}
                <div className="grid grid-cols-4 gap-4 text-center text-xs">
                  <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                    <div className="text-lg mb-1">✂️</div>
                    <div className="text-white font-medium">CUT</div>
                    <div className="text-zinc-400">Scissors</div>
                  </div>
                  <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                    <div className="text-lg mb-1">✊</div>
                    <div className="text-white font-medium">HEAL</div>
                    <div className="text-zinc-400">Fist</div>
                  </div>
                  <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                    <div className="text-lg mb-1">✋</div>
                    <div className="text-white font-medium">REROUTE</div>
                    <div className="text-zinc-400">Palm</div>
                  </div>
                  <div className="bg-zinc-800/40 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/30">
                    <div className="text-lg mb-1">🙌</div>
                    <div className="text-white font-medium">SHIELD</div>
                    <div className="text-zinc-400">Both Hands</div>
                  </div>
                </div>
              </div>

              {/* Action Log */}
              <div className="w-64">
                <h3 className="text-sm font-medium text-zinc-200 mb-3">
                  Recent Actions
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">12:34:56</span>
                    <span className="text-white">✊ HEAL executed</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">12:34:23</span>
                    <span className="text-amber-400">
                      🤖 AI attack detected
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">12:33:45</span>
                    <span className="text-white">✂️ CUT executed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
