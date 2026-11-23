import {
  clearVoiceDebugEvents,
  collectVoiceDebugSnapshot,
  getVoiceDebugEvents,
  type TVoiceDebugEvent,
  type TVoiceDebugSnapshot
} from '@/helpers/voice-debug';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@sharkord/ui';
import { ChevronDown, Copy, Download } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { TDialogBaseProps } from '../types';
import { buildVoiceDebugFilename, computeRates, formatTime } from './helpers';
import { OverviewTab } from './overview-tab';
import {
  ConsumersTab,
  EventsTab,
  ProducersTab,
  RawTab,
  TransportsTab
} from './tabs';

const REFRESH_MS = 1000;

const VoiceDebugDialog = memo(({ isOpen, close }: TDialogBaseProps) => {
  const [snapshot, setSnapshot] = useState<TVoiceDebugSnapshot | undefined>(
    undefined
  );
  const [events, setEvents] = useState<TVoiceDebugEvent[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);

  const previousSnapshot = useRef<TVoiceDebugSnapshot | undefined>(undefined);

  useEffect(() => {
    if (!isOpen || paused) return;

    let cancelled = false;

    const collect = async () => {
      const next = await collectVoiceDebugSnapshot();

      if (cancelled) return;

      setRates(computeRates(previousSnapshot.current, next));
      previousSnapshot.current = next;
      setSnapshot(next);
      setEvents([...getVoiceDebugEvents()]);
    };

    collect();

    const interval = setInterval(collect, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isOpen, paused]);

  const json = useMemo(
    () => JSON.stringify({ snapshot, events }, null, 2),
    [snapshot, events]
  );

  const connectionEvents = useMemo(
    () =>
      events
        .filter(
          (event) => event.category === 'ws' || event.category === 'error'
        )
        .slice(-5),
    [events]
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast.success('Voice debug report copied');
    } catch (error) {
      toast.error(`Could not copy the report: ${String(error)}`);
    }
  }, [json]);

  const handleDownload = useCallback(() => {
    try {
      // built on demand: the pretty json is recomputed every second, the
      // download needs exactly one compact copy per click
      const compactJson = JSON.stringify({ snapshot, events });
      const blob = new Blob([compactJson], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = buildVoiceDebugFilename(snapshot?.capturedAt);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // firefox and safari keep reading the blob after click returns, and the
      // electron save-as dialog holds the url while the user picks a path, so
      // an early revoke fails the download or truncates it to zero bytes
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      toast.success('Voice debug report downloaded');
    } catch (error) {
      toast.error(`Could not download the report: ${String(error)}`);
    }
  }, [snapshot, events]);

  const handleTogglePause = useCallback(() => {
    setPaused((current) => !current);
  }, []);

  const handleClearEvents = useCallback(() => {
    clearVoiceDebugEvents();
    setEvents([]);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-[95vw] min-w-[95vw] flex-col">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 pr-6">
            <span>Voice diagnostics</span>
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {snapshot ? formatTime(snapshot.capturedAt) : 'collecting…'}
              {paused ? ' · paused' : ''}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleTogglePause}>
                {paused ? 'Resume' : 'Pause'}
              </Button>
              <Button size="sm" variant="outline" onClick={handleClearEvents}>
                Clear events
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    Report
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCopy}>
                    <Copy />
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownload}>
                    <Download />
                    Download
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue="overview"
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <TabsList className="w-fit max-w-full flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transports">Transports</TabsTrigger>
            <TabsTrigger value="producers">Producers</TabsTrigger>
            <TabsTrigger value="consumers">Consumers</TabsTrigger>
            <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-2">
            {!snapshot && (
              <p className="font-mono text-[11px] text-muted-foreground">
                collecting…
              </p>
            )}
            {!!snapshot && (
              <>
                <TabsContent value="overview">
                  <OverviewTab
                    snapshot={snapshot}
                    rates={rates}
                    connectionEvents={connectionEvents}
                  />
                </TabsContent>
                <TabsContent value="transports">
                  <TransportsTab snapshot={snapshot} />
                </TabsContent>
                <TabsContent value="producers">
                  <ProducersTab snapshot={snapshot} />
                </TabsContent>
                <TabsContent value="consumers">
                  <ConsumersTab snapshot={snapshot} />
                </TabsContent>
                <TabsContent value="events">
                  <EventsTab events={events} />
                </TabsContent>
                <TabsContent value="raw">
                  <RawTab json={json} />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
});

VoiceDebugDialog.displayName = 'VoiceDebugDialog';

export { VoiceDebugDialog };
