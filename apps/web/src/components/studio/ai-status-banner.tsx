'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getAIStatus, AIStatusData } from '@/lib/ai-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Cpu,
  Loader2,
  WifiOff,
  AlertOctagon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AIStatusBannerProps {
  className?: string;
  onStatusChange?: (status: AIStatusData | null) => void;
  /**
   * Optional polling interval in ms. Set to 0 to disable periodic polling.
   * Defaults to 30000ms (30 seconds) to avoid aggressive backend polling.
   */
  pollIntervalMs?: number;
  /**
   * Optional imperative refresh trigger counter. Incrementing this value
   * causes the banner to immediately re-poll the backend AI status.
   */
  refreshTrigger?: number;
}

export function AIStatusBanner({
  className,
  onStatusChange,
  pollIntervalMs = 30000,
  refreshTrigger,
}: AIStatusBannerProps) {
  const [status, setStatus] = useState<AIStatusData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Safeguards against state updates on unmounted component
  const isMountedRef = useRef<boolean>(true);
  // Concurrency guard to prevent overlapping in-flight status requests
  const isFetchingRef = useRef<boolean>(false);
  // Tracks whether initial load has occurred without re-triggering callbacks
  const hasLoadedOnceRef = useRef<boolean>(false);
  // Stable ref for external onStatusChange callback to avoid interval restarts
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const fetchStatus = useCallback(
    async (isManualRefresh: boolean = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else if (!hasLoadedOnceRef.current) {
        setIsLoading(true);
      }

      try {
        const res = await getAIStatus();
        if (!isMountedRef.current) return;

        if (res.success && res.data) {
          setStatus(res.data);
          setErrorMessage(null);
          onStatusChangeRef.current?.(res.data);
        } else {
          setErrorMessage('Unexpected status payload received from backend.');
          onStatusChangeRef.current?.(null);
        }
      } catch (err: any) {
        if (!isMountedRef.current) return;
        const msg =
          err?.message ||
          'Unable to reach DevPilot AI backend. Please check server connection.';
        setErrorMessage(msg);
        setStatus(null);
        onStatusChangeRef.current?.(null);
      } finally {
        hasLoadedOnceRef.current = true;
        isFetchingRef.current = false;
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [] // Stable: zero external dependencies, preventing interval restarts
  );

  useEffect(() => {
    isMountedRef.current = true;
    fetchStatus(false);

    let intervalId: NodeJS.Timeout | null = null;
    if (pollIntervalMs > 0) {
      intervalId = setInterval(() => {
        fetchStatus(false);
      }, pollIntervalMs);
    }

    return () => {
      isMountedRef.current = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchStatus, pollIntervalMs]);

  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      fetchStatus(true);
    }
  }, [refreshTrigger, fetchStatus]);

  const handleManualRefresh = () => {
    fetchStatus(true);
  };

  // 1. Initial Loading State
  if (isLoading && !status && !errorMessage) {
    return (
      <div
        className={cn(
          'flex items-center justify-between p-4 rounded-xl border border-devpilot-border bg-devpilot-card/80 animate-pulse',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-devpilot-surface flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-devpilot-muted animate-spin" />
          </div>
          <div>
            <div className="h-4 w-32 bg-devpilot-surface rounded mb-1.5" />
            <div className="h-3 w-48 bg-devpilot-surface/60 rounded" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Offline / API Error State
  if (errorMessage || !status || !status.online) {
    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-devpilot-text',
          className
        )}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-amber-200">
                AI Engine Offline
              </span>
              <Badge variant="warning" className="text-[10px] uppercase font-bold tracking-wider">
                Unavailable
              </Badge>
            </div>
            <p className="text-xs text-amber-300/80 mt-0.5">
              {errorMessage || 'Ollama is unreachable. Ensure local Ollama instance is running.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <Button
            size="sm"
            variant="outline"
            onClick={handleManualRefresh}
            isLoading={isRefreshing}
            className="border-amber-500/40 text-amber-200 hover:bg-amber-500/20 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  // 3. RECOVERY REQUIRED State
  if (status.engineStatus === 'RECOVERY_REQUIRED') {
    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-devpilot-text',
          className
        )}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-rose-200">
                Engine Recovery Required
              </span>
              <Badge variant="danger" className="text-[10px] uppercase font-bold tracking-wider">
                Locked
              </Badge>
            </div>
            <p className="text-xs text-rose-300/80 mt-0.5">
              {status.lockReason || 'A previous inference timed out or aborted. Engine must be reset by an administrator before new generations can run.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleManualRefresh}
            isLoading={isRefreshing}
            className="text-xs text-rose-200 hover:bg-rose-500/20"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  // 4. GENERATING State
  if (status.engineStatus === 'GENERATING') {
    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-devpilot-cyan/40 bg-devpilot-cyan/10 text-devpilot-text',
          className
        )}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-devpilot-cyan/20 text-devpilot-cyan flex items-center justify-center shrink-0">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-devpilot-cyan">
                Engine Active & Generating
              </span>
              <Badge variant="default" className="text-[10px] uppercase font-bold tracking-wider bg-devpilot-cyan/30 text-devpilot-cyan">
                Busy
              </Badge>
            </div>
            <p className="text-xs text-devpilot-muted mt-0.5">
              Model <span className="font-mono text-devpilot-text">{status.model}</span> is currently processing an inference workload.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleManualRefresh}
            isLoading={isRefreshing}
            className="text-xs text-devpilot-cyan hover:bg-devpilot-cyan/20"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Check Status
          </Button>
        </div>
      </div>
    );
  }

  // 5. Normal / Online / IDLE State
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-devpilot-border bg-devpilot-card/80 text-devpilot-text shadow-sm',
        className
      )}
    >
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-devpilot-purple" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-devpilot-text">
              Local AI Engine Ready
            </span>
            <Badge variant="success" className="text-[10px] uppercase font-bold tracking-wider">
              Connected
            </Badge>
            <span className="text-xs text-devpilot-subtle">•</span>
            <div className="flex items-center gap-1.5 text-xs text-devpilot-muted font-mono bg-devpilot-surface px-2 py-0.5 rounded border border-devpilot-border">
              <Cpu className="w-3 h-3 text-devpilot-cyan" />
              <span>{status.model}</span>
            </div>
            {status.version && (
              <span className="text-[11px] text-devpilot-subtle">
                v{status.version}
              </span>
            )}
          </div>
          <p className="text-xs text-devpilot-muted mt-0.5">
            Ollama provider is online and available for zero-dependency local generation.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleManualRefresh}
          isLoading={isRefreshing}
          className="text-xs text-devpilot-muted hover:text-devpilot-text hover:bg-devpilot-surface"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
