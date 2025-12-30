interface TokenMeterProps {
  currentBytes: number;
  maxBytes: number;
  className?: string;
}

type SizeStatus = 'ok' | 'warning' | 'near_limit' | 'exceeded';

export function TokenMeter({ currentBytes, maxBytes, className = '' }: TokenMeterProps) {
  const percentage = Math.min((currentBytes / maxBytes) * 100, 100);
  const tokenEstimate = Math.round(currentBytes / 4);
  const currentKB = (currentBytes / 1024).toFixed(1);
  const maxKB = (maxBytes / 1024).toFixed(0);

  const getStatus = (): SizeStatus => {
    if (percentage > 95) return 'exceeded';
    if (percentage > 80) return 'near_limit';
    if (percentage > 60) return 'warning';
    return 'ok';
  };

  const status = getStatus();

  const statusConfig = {
    ok: {
      color: 'bg-green-500',
      textColor: 'text-green-400',
      icon: '✅',
      message: 'Fits in Claude/GPT-4 context',
    },
    warning: {
      color: 'bg-yellow-500',
      textColor: 'text-yellow-400',
      icon: '⚠️',
      message: 'Getting close to limit',
    },
    near_limit: {
      color: 'bg-orange-500',
      textColor: 'text-orange-400',
      icon: '🟠',
      message: 'Near context limit',
    },
    exceeded: {
      color: 'bg-red-500',
      textColor: 'text-red-400',
      icon: '❌',
      message: 'Exceeds recommended size',
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`bg-slate-800 rounded-lg border border-slate-700 p-4 ${className}`}
      role="meter"
      aria-valuenow={parseFloat(currentKB)}
      aria-valuemin={0}
      aria-valuemax={parseFloat(maxKB)}
      aria-label={`Context size: ${currentKB} KB of ${maxKB} KB, approximately ${tokenEstimate.toLocaleString()} tokens`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-300">Token Meter</span>
        <span className={`text-sm ${config.textColor}`}>
          {config.icon} {config.message}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${config.color} transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          {currentKB} KB / {maxKB} KB
        </span>
        <span>~{tokenEstimate.toLocaleString()} tokens</span>
      </div>
    </div>
  );
}
