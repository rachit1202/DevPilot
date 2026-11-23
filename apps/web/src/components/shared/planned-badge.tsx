import { Badge } from '@/components/ui/badge';

interface PlannedBadgeProps {
  phase: string;
}

export function PlannedBadge({ phase }: PlannedBadgeProps) {
  return (
    <Badge variant="cyan" className="font-mono text-[10px] tracking-normal">
      Planned • {phase}
    </Badge>
  );
}
